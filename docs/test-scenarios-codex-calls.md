# codex-on-claude — Comprehensive Codex-call test scenarios

> 한국어 요약: `codex-on-claude` 가 노출하는 **모든 Codex 호출 면(call surface)** — MCP 트랜스포트, 9 개 Skill, codex-reviewer Agent, 14 개 threads 서브커맨드, hooks/analyze/suggest 파이프라인 — 을 결정론적으로 검증하기 위한 32 개 시나리오. 직접 셸/`claude -p` 로 실행 가능하며, 분석기 룰은 `install/fixtures/analyze-rules/` 의 시드 픽스처로 재현 가능.

This document is the **0.3.3-era successor** to [`docs/test-report-2026-05-20.md`](test-report-2026-05-20.md). That report covered 5 baseline scenarios (T1–T5) against the v0.1.0 surface; this document expands to **32 scenarios across 8 groups** and adds deterministic seed fixtures so the analyze/suggest loop can be exercised without waiting for organic usage.

- Convention: `T<n>` numbering kept inside groups (`G<group>-<n>`).
- Each scenario is reproducible from a freshly minted `HOME=$(mktemp -d)`.
- Skill-driven scenarios run inside `claude -p ...` subprocesses (no interactive Claude needed).
- Pure-CLI scenarios run as plain `codex-on-claude ...` Bash calls.
- Estimated total external spend: **~$0.50 USD** on Haiku across all live Codex calls (~12 actual MCP calls; the rest are CLI / file-system assertions).

## How to read a scenario

| Field | Meaning |
|---|---|
| **Goal** | Single sentence — what passes / fails. |
| **Setup** | Pre-conditions: isolated HOME, MCP registration, fixtures to copy in, dependencies on a prior scenario. |
| **Command** | Copy-paste-ready Bash / `claude -p` invocation. |
| **Expected** | A grep-able substring OR `jq` expression OR file-existence assertion. |
| **Notes** | Cost estimate, known limitations, cross-references. |

> Convention: `${COC_HOME}` = the isolated HOME for the scenario set; `${REPO}` = path to a checkout of this repo (only needed for the fixture-driven scenarios). Set both once:
>
> ```sh
> export COC_HOME=$(mktemp -d -t coc-test-XXXXXX) && export HOME="$COC_HOME"
> export REPO=/path/to/codex-on-claude
> ```

---

## Group 1 — Isolated environment preflight

> 한국어 요약: 격리된 `$HOME` 에서 `doctor` 가 6 항목을 모두 통과하고, stale-shell-hash 와 MCP 미등록을 자동 감지하는지.

### G1-1 — doctor passes all 6 preflight checks

| Field | |
|---|---|
| **Goal** | In a fresh isolated HOME with `codex` + `claude` logged in and the `codex` MCP server registered, `doctor` reports all 6 checks ok. |
| **Setup** | Ensure host has `codex --version` and `claude --version` working. Register MCP: `claude mcp add codex codex mcp-server`. |
| **Command** | `codex-on-claude doctor` |
| **Expected** | Output contains all of: `Node.js`, `Codex CLI`, `Claude Code`, `codex doctor: ok`, `Claude auth:`, `codex MCP server: ✓ Connected`. Non-zero exit only if any check fails. |
| **Notes** | This is the documented `Verification §1` from the README. If `claude mcp get codex` says `Failed to connect`, retry in a non-sandboxed shell. |

### G1-2 — Stale shell hash hint

| Field | |
|---|---|
| **Goal** | If `codex-on-claude` was reinstalled via `npm install -g` and the current shell still caches the old `command -v codex-on-claude` lookup, `doctor` surfaces the `hash -r` hint. |
| **Setup** | Inside the same shell where the binary was just replaced (don't open a new terminal; don't run `hash -r`). |
| **Command** | `codex-on-claude doctor` |
| **Expected** | Output includes a substring like `stale shell command hash` and the suggested fix `hash -r`. |
| **Notes** | v0.3.3+ behavior. If your shell auto-rehashes (some zsh configs do), this scenario won't trigger — that's expected. |

### G1-3 — MCP not registered → installer offers auto-register

| Field | |
|---|---|
| **Goal** | Running `codex-on-claude` when the `codex` MCP server is absent surfaces the auto-register prompt (`offerMcpRegister`). |
| **Setup** | `claude mcp remove codex -s user` first. Then run a non-interactive install with `--yes` so the auto-register branch is taken without prompting. |
| **Command** | `claude mcp remove codex -s user 2>/dev/null; codex-on-claude --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes 2>&1 \| tee /tmp/g1-3.log` |
| **Expected** | `/tmp/g1-3.log` mentions either an auto-registration attempt (`claude mcp add codex`) or a structured warning ("codex MCP server is not registered"). After the run, `claude mcp get codex` shows the registration. |
| **Notes** | If MCP add requires interactive consent on your machine, the scenario passes when the warning is shown clearly even without the auto-add itself. |

---

## Group 2 — CLI: install / reconfigure / status / uninstall

> 한국어 요약: 비인터랙티브 설치, no-arg 재실행 시 자동 reconfigure 분기, `vPREV → vCURR` 배너, deprecated flag 무시, alias 정규화, `status` 출력, **`uninstall` 이 `~/.claude/codex-on-claude/` 전체를 지운다는 사실** 검증.

### G2-1 — Non-interactive first install

| Field | |
|---|---|
| **Goal** | `codex-on-claude --patterns=... --context-policy=... --improvement-loop=... --threads=... --yes` installs the full stack non-interactively and writes config. |
| **Setup** | Fresh `$HOME`. |
| **Command** | ```sh<br>codex-on-claude \<br>  --patterns=review,followup,fix,routine \<br>  --context-policy=mixed \<br>  --improvement-loop=manual \<br>  --threads=basic \<br>  --yes<br>``` |
| **Expected** | All present: `${HOME}/.claude/skills/codex-{review,followup,resume,fix,routine,log,analyze,improve,threads}/SKILL.md`, `${HOME}/.claude/agents/codex-reviewer.md`, `${HOME}/.claude/codex-on-claude/config.json` with the four chosen values. |
| **Notes** | `codex-followup` selection auto-pairs with `codex-resume`. |

### G2-2 — No-arg re-run shows `vPREV → vCURR` banner and reconfigures

| Field | |
|---|---|
| **Goal** | Running `codex-on-claude` (no args) after a prior install detects state and auto-enters reconfigure. With `@latest` via npx in CI, a version banner is rendered. |
| **Setup** | G2-1 already completed. |
| **Command** | `codex-on-claude --yes 2>&1 \| tee /tmp/g2-2.log` |
| **Expected** | `/tmp/g2-2.log` includes either `Reconfigure` or `prior state` (depending on terminal width) and finishes with `Applied` / `Skipped`. No new skills are added if all four options match the prior state. |
| **Notes** | The `vPREV → vCURR` banner only renders when the installed version differs from the running binary — exercise it by `npm install -g codex-on-claude@0.3.1 && codex-on-claude` after a 0.3.3 install. |

### G2-3 — Interactive reconfigure review screen

| Field | |
|---|---|
| **Goal** | An interactive `codex-on-claude reconfigure` shows previous answers pre-selected, lets you toggle each, and ends with a `Review / Apply / Edit again / Cancel` table. |
| **Setup** | G2-1 done; run in a real TTY. |
| **Command** | `codex-on-claude reconfigure` |
| **Expected** | Visual check: arrow-key navigation works, Space toggles checkboxes, Enter confirms. The final review table (`renderReviewTable`) prints `Previous` and `Next` columns with a clear `≠` marker on changed rows. |
| **Notes** | This is the only manually-driven scenario. Skip in CI. |

### G2-4 — Deprecated `--share-scope` prints a one-line notice and is ignored

| Field | |
|---|---|
| **Goal** | Passing the dropped `--share-scope=user` flag emits a single deprecation notice and does not block install. |
| **Setup** | Fresh `$HOME` or post-G2-1. |
| **Command** | `codex-on-claude --share-scope=user --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes 2>&1 \| grep -i 'share-scope'` |
| **Expected** | One line matching e.g. `--share-scope is deprecated since v0.3` or `ignored`. Install completes anyway (exit 0). |
| **Notes** | Removed in 0.3.0, kept for forward compat. |

### G2-5 — Alias `--improvement-loop=on-demand` normalizes to `manual`

| Field | |
|---|---|
| **Goal** | Legacy `on-demand` is rewritten to `manual` internally by `normalizeImprovementLoop` and persisted as such. |
| **Setup** | Fresh `$HOME`. |
| **Command** | `codex-on-claude --patterns=review --context-policy=direct --improvement-loop=on-demand --threads=off --yes && jq '.choices.improvementLoop' ~/.claude/codex-on-claude/config.json` |
| **Expected** | `jq` output: `"manual"`. |
| **Notes** | One-way migration; reverse not supported. |

### G2-6 — `status` reflects current config

| Field | |
|---|---|
| **Goal** | `codex-on-claude status` prints the values chosen during install + the resolved file paths. |
| **Setup** | G2-1 done. |
| **Command** | `codex-on-claude status` |
| **Expected** | Output contains: `patterns: review, followup, fix, routine`, `contextPolicy: mixed`, `improvementLoop: manual`, `threads: basic`, and the four installed-component path lines under `~/.claude/`. |
| **Notes** | Use this in every subsequent scenario as a quick state-snapshot tool. |

### G2-7 — `uninstall` removes **the entire `~/.claude/codex-on-claude/` directory** including logs + threads

| Field | |
|---|---|
| **Goal** | Confirm that `uninstall` is destructive about the data dir — logs, threads, reports, and improvements are wiped along with the Skills/Agent/hook entries. MCP registration is **not** auto-removed. |
| **Setup** | G2-1 done plus at least one log line and one thread record: `codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok --prompt-chars=10 --response-chars=10 --elapsed-ms=100` and `codex-on-claude threads new 019e0099-0000-7000-0000-000000000001 --title=test --tags=manual`. |
| **Command** | `codex-on-claude uninstall && ls -la ~/.claude/ ~/.claude/codex-on-claude 2>&1 \| tail -20` |
| **Expected** | `~/.claude/skills/codex-*` gone, `~/.claude/agents/codex-reviewer.md` gone, `~/.claude/codex-on-claude/` **gone (including `logs/`, `threads/`, `reports/`, `improvements/`)**. A final stderr line says: `MCP server registration (codex) must be removed manually: ...`. The earlier README phrasing implied logs/threads are kept; the actual implementation removes them (`install/install.mjs:914`). Treat this scenario as the authoritative spec. |
| **Notes** | If you want to preserve catalog/logs across uninstalls, copy `~/.claude/codex-on-claude/threads/` and `~/.claude/codex-on-claude/improvements/` aside first. Filing this as expected behavior, not a bug. |

---

## Group 3 — Installed artifact matrix

> 한국어 요약: 4 가지 설치 옵션별로 **실제 파일이 정확히 존재/부재** 하는지만 체크 (LLM 무관, 결정론적). 훅 멱등성과 마커 기반 제거도 포함.

### G3-1 — `--patterns=review` alone → only `codex-review` SKILL installed

| Field | |
|---|---|
| **Goal** | Selecting only `review` does not pull in followup/resume/fix/routine skills. |
| **Setup** | Fresh `$HOME`. |
| **Command** | `codex-on-claude --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes && ls -d ~/.claude/skills/codex-* 2>/dev/null` |
| **Expected** | Output is exactly the single line `~/.claude/skills/codex-review` (and the analyze/improve/log skills are absent because improvementLoop is off). |
| **Notes** | — |

### G3-2 — `--patterns=followup` auto-pairs with `codex-resume`

| Field | |
|---|---|
| **Goal** | The followup pattern always installs both `codex-followup` and `codex-resume` (CLI-fallback partner). |
| **Setup** | Fresh `$HOME`. |
| **Command** | `codex-on-claude --patterns=followup --context-policy=direct --improvement-loop=off --threads=off --yes && ls -d ~/.claude/skills/codex-{followup,resume} 2>/dev/null \| wc -l` |
| **Expected** | `2` |
| **Notes** | Justified by the SKILL.md design: `/codex-followup` recovers via `/codex-resume` on `Session not found`. |

### G3-3 — `--context-policy=direct` → no codex-reviewer agent

| Field | |
|---|---|
| **Goal** | `direct` doesn't install the isolation agent. |
| **Setup** | Fresh `$HOME`. |
| **Command** | `codex-on-claude --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes && [ ! -f ~/.claude/agents/codex-reviewer.md ] && echo OK \|\| echo FAIL` |
| **Expected** | `OK` |
| **Notes** | — |

### G3-4 — `--context-policy=summarize` or `mixed` installs the agent

| Field | |
|---|---|
| **Goal** | The codex-reviewer agent file appears whenever the policy is not `direct`. |
| **Setup** | Two passes with fresh HOME each. |
| **Command** | For `summarize`: `codex-on-claude --patterns=review --context-policy=summarize --improvement-loop=off --threads=off --yes && [ -f ~/.claude/agents/codex-reviewer.md ] && echo OK`. For `mixed`: same with `--context-policy=mixed`. |
| **Expected** | Both runs print `OK`. |
| **Notes** | — |

### G3-5 — `improvementLoop=off` → no analyze/improve/log skills, no settings hook

| Field | |
|---|---|
| **Goal** | With improvementLoop off, the three logging-side skills are not installed and the user's `settings.json` is not modified by us. |
| **Setup** | Fresh `$HOME`. |
| **Command** | ```sh<br>codex-on-claude --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes<br>ls ~/.claude/skills/ 2>/dev/null \| grep -E 'codex-(analyze\|improve\|log)' \|\| echo "no logging skills"<br>jq '..\|.["_coc.marker"]? // empty' ~/.claude/settings.json 2>/dev/null \| grep . \|\| echo "no marker"<br>``` |
| **Expected** | Both `no logging skills` and `no marker` printed. |
| **Notes** | If `~/.claude/settings.json` doesn't exist that also counts as a pass. |

### G3-6 — `improvementLoop=manual` installs the three skills but leaves settings untouched

| Field | |
|---|---|
| **Goal** | `manual` mode adds the prose Skills but does NOT add PostToolUse hooks. |
| **Setup** | Fresh `$HOME`. |
| **Command** | ```sh<br>codex-on-claude --patterns=review --context-policy=direct --improvement-loop=manual --threads=off --yes<br>ls ~/.claude/skills/codex-{analyze,improve,log} -d 2>&1 \| wc -l<br>jq '..\|.["_coc.marker"]? // empty' ~/.claude/settings.json 2>/dev/null<br>``` |
| **Expected** | First command: `3`. Second command: empty. |
| **Notes** | — |

### G3-7 — `improvementLoop=auto-on-skill` injects two marked hook groups

| Field | |
|---|---|
| **Goal** | `auto-on-skill` adds exactly two PostToolUse hook groups — one with `matcher="mcp__codex__codex"`, one with `matcher="mcp__codex__codex-reply"` — and each group's single `hooks[]` entry carries `_coc.marker="codex-on-claude:auto-log"`. **User-defined hooks must be preserved.** |
| **Setup** | Pre-populate `~/.claude/settings.json` with a sentinel user hook the installer must not touch: `mkdir -p ~/.claude && printf '%s' '{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"echo SENTINEL_USER_HOOK"}]}]}}' > ~/.claude/settings.json`. (Real schema per `install/hooks.mjs:30-41` — `matcher` is a single string, NOT `matchers:[{toolName}]`.) |
| **Command** | ```sh<br>codex-on-claude --patterns=review --context-policy=direct --improvement-loop=auto-on-skill --threads=off --yes<br>jq '.hooks.PostToolUse' ~/.claude/settings.json<br>``` |
| **Expected** | The resulting array contains the user's sentinel hook plus exactly two marked groups. Each marked group has `matcher == "mcp__codex__codex"` or `"mcp__codex__codex-reply"`, and `hooks[0]._coc.marker == "codex-on-claude:auto-log"`. The sentinel group with `matcher == "Bash"` survives untouched. |
| **Notes** | The marker is what lets `uninstall` / `reconfigure` remove only our entries (`isOursGroup`, `hooks.mjs:43-45`). |

### G3-7b — Marker location is precisely `hooks[]._coc.marker`

| Field | |
|---|---|
| **Goal** | The marker lives inside each `hook` entry, not at the group level. A jq query against the exact path returns exactly 2 occurrences. |
| **Setup** | G3-7 done. |
| **Command** | `jq -r '.hooks.PostToolUse[].hooks[]._coc.marker // empty' ~/.claude/settings.json \| sort \| uniq -c` |
| **Expected** | Output: `   2 codex-on-claude:auto-log` (exactly two, identical marker). A query at the group level `jq -r '.hooks.PostToolUse[]._coc.marker'` returns only `null` — meaning the marker is NOT at group level. |
| **Notes** | Catches a class of subtle regressions where someone moves `_coc` to the group object — the install would seem to work, but `isOursGroup` (which inspects `group.hooks[]._coc.marker`) would silently fail to recognize the entry on uninstall. |

### G3-7c — Matcher strings are the exact MCP tool names

| Field | |
|---|---|
| **Goal** | The two marked groups carry the exact matcher strings `mcp__codex__codex` and `mcp__codex__codex-reply`. No variants (e.g. `mcp__codex__*` glob), no extra entries. |
| **Setup** | G3-7 done. |
| **Command** | `jq -r '.hooks.PostToolUse[] \| select(.hooks[]._coc.marker == "codex-on-claude:auto-log") \| .matcher' ~/.claude/settings.json \| sort` |
| **Expected** | Exactly two lines: `mcp__codex__codex` then `mcp__codex__codex-reply`. |
| **Notes** | If the harness ever changes how tool matchers work (glob vs literal), this scenario will surface it. |

### G3-7d — Hook `command` field actually invokes `log --from-stdin`

| Field | |
|---|---|
| **Goal** | The `command` string in each marked hook contains `log --from-stdin`. The prefix is either `codex-on-claude` (global install) or `node /abs/path/install.mjs` (local-source install) per `install.mjs:527-530`. |
| **Setup** | G3-7 done. |
| **Command** | ```sh<br>jq -r '.hooks.PostToolUse[] \| select(.hooks[]._coc.marker == "codex-on-claude:auto-log") \| .hooks[].command' ~/.claude/settings.json \| tee /tmp/g3-7d.txt<br>grep -c 'log --from-stdin' /tmp/g3-7d.txt<br>``` |
| **Expected** | Both lines contain `log --from-stdin` (count = 2). Prefix matches either `codex-on-claude ...` or `node .../install.mjs ...`. Neither line is empty. |
| **Notes** | The single most common silent regression for the auto-log feature is a broken `command` field — the marker survives so uninstall still works, but no logs appear. This scenario catches that without over-constraining the binary path. (Tightened per Codex audit — original "ends with codex-on-claude log --from-stdin" would false-fail on local-source installs.) |

### G3-7e — Mixed-ownership group: user hook preserved, marked hook removed surgically

| Field | |
|---|---|
| **Goal** | When a single hook group contains BOTH a user hook and a coc-marked hook, `remove` (and `install`'s strip-then-push) must remove **only** the marked hook entry, leaving the user hook intact. Implemented via `stripOursFromGroups` (hook-level filter) in `hooks.mjs`. |
| **Setup** | G3-7 done (2 marked groups + 1 user Bash group). Manually mutate one user group to also include a coc-marked hook entry inside it: ```sh<br>jq '.hooks.PostToolUse[0].hooks += [{"type":"command","command":"echo MIXED","_coc":{"marker":"codex-on-claude:auto-log","installedAt":"2026-05-20T00:00:00.000Z"}}]' ~/.claude/settings.json > /tmp/g3-7e-setup.json && mv /tmp/g3-7e-setup.json ~/.claude/settings.json<br># Verify Bash group now has 2 hooks (1 user + 1 marked):<br>jq '.hooks.PostToolUse[0].hooks \| length' ~/.claude/settings.json<br>``` |
| **Command** | ```sh<br>codex-on-claude reconfigure --improvement-loop=off --yes<br>jq -r '.hooks.PostToolUse[]?.matcher' ~/.claude/settings.json<br>jq '.hooks.PostToolUse[]? \| select(.matcher=="Bash") \| .hooks \| length' ~/.claude/settings.json<br>jq '.hooks.PostToolUse[]? \| select(.matcher=="Bash") \| .hooks[].command' ~/.claude/settings.json<br>``` |
| **Expected** | After remove, `PostToolUse` **still includes** the `Bash` matcher group. The Bash group's `hooks` array has length 1 (the marked hook was filtered out, the user hook remains). The remaining command is `echo SENTINEL_USER_HOOK`. The two `mcp__codex__*` groups are gone. |
| **Notes** | Implements the safety fix from Codex thread `019e4365-…` (option b: hook-level filter). Before the fix, the entire group was removed wholesale because the group-level `isOursGroup` returned true on `.some()`. After the fix, `stripOursFromGroups` operates at the hook level, preserving user hooks even when intermixed with our marked entries. The previous "wholesale removal" scenario is now an XFAIL on the fixed code — if it ever passes again, the regression has returned. |

### G3-8 — Hook installation is idempotent (drift correction)

| Field | |
|---|---|
| **Goal** | Running install twice yields exactly two marked groups. The mechanism is "strip prior coc groups, then push 2" (`hooks.mjs:54-57`), so this is actually a *drift correction* property — see G3-8b. |
| **Setup** | G3-7 done. |
| **Command** | `codex-on-claude --patterns=review --context-policy=direct --improvement-loop=auto-on-skill --threads=off --yes && jq '[.hooks.PostToolUse[] | select(.hooks[]._coc.marker == "codex-on-claude:auto-log")] | length' ~/.claude/settings.json` |
| **Expected** | `2` (unchanged). |
| **Notes** | Critical correctness property — without idempotence each `npx` run would multiply hook lines. |

### G3-8b — Drift correction: 3 stale coc groups → 2 after one install

| Field | |
|---|---|
| **Goal** | If `~/.claude/settings.json` somehow ends up with 3 marked coc groups (manual edit, partial-update race), a single reconfigure normalizes back to exactly 2. This is what makes G3-8 a stronger property than mere de-duplication. |
| **Setup** | G3-7 done. Inject one extra marked group manually: ```sh<br>jq '.hooks.PostToolUse += [{"matcher":"mcp__codex__codex-other","hooks":[{"type":"command","command":"echo STALE","_coc":{"marker":"codex-on-claude:auto-log","installedAt":"2026-01-01T00:00:00.000Z"}}]}]' ~/.claude/settings.json > /tmp/g3-8b.json && mv /tmp/g3-8b.json ~/.claude/settings.json<br>jq '[.hooks.PostToolUse[] \| select(.hooks[]._coc.marker == "codex-on-claude:auto-log")] \| length' ~/.claude/settings.json<br>``` |
| **Command** | ```sh<br># BEFORE assertion already prints 3.<br>codex-on-claude reconfigure --improvement-loop=auto-on-skill --yes<br># AFTER assertion:<br>jq '[.hooks.PostToolUse[] \| select(.hooks[]._coc.marker == "codex-on-claude:auto-log")] \| length' ~/.claude/settings.json<br>jq -r '.hooks.PostToolUse[] \| select(.hooks[]._coc.marker == "codex-on-claude:auto-log") \| .matcher' ~/.claude/settings.json \| sort<br>``` |
| **Expected** | After-count is `2`. The two matchers are the canonical pair (`mcp__codex__codex`, `mcp__codex__codex-reply`) — the stale `mcp__codex__codex-other` group is gone. |
| **Notes** | This is the strongest form of the idempotence guarantee — install converges, not just stabilizes. |

### G3-9 — `auto-on-skill → off` removes only marked groups, preserves user hooks

| Field | |
|---|---|
| **Goal** | When the improvement loop is turned off, our two marked groups disappear but the user's sentinel hook remains. If `PostToolUse` becomes empty after removal, the key itself is dropped from `settings.json` (`hooks.mjs:69-70`). |
| **Setup** | G3-7 done (sentinel user hook + 2 marked groups present). |
| **Command** | ```sh<br>codex-on-claude reconfigure --improvement-loop=off --yes<br>jq '.hooks.PostToolUse' ~/.claude/settings.json<br>``` |
| **Expected** | The remaining `PostToolUse` array contains exactly the user's sentinel hook (`matcher == "Bash"`), no `_coc.marker` entries anywhere. |
| **Notes** | Round-trips with G3-7. The empty-key cleanup is covered separately in G3-9c. |

### G3-9b — Interleaved user hooks survive removal in original order

| Field | |
|---|---|
| **Goal** | If the PostToolUse array is `[user_A, coc_codex, user_B, coc_reply]`, after removal it's `[user_A, user_B]` — order preserved, no collateral damage. |
| **Setup** | Manually construct the interleaved layout. Start from G3-7 (which has `[user_Bash, coc_codex, coc_reply]`) and insert a second user hook between the two coc groups: ```sh<br>jq '.hooks.PostToolUse = [.hooks.PostToolUse[0], .hooks.PostToolUse[1], {"matcher":"Write","hooks":[{"type":"command","command":"echo USER_B"}]}, .hooks.PostToolUse[2]]' ~/.claude/settings.json > /tmp/g3-9b-setup.json && mv /tmp/g3-9b-setup.json ~/.claude/settings.json<br>``` |
| **Command** | ```sh<br>codex-on-claude reconfigure --improvement-loop=off --yes<br>jq -r '.hooks.PostToolUse[].matcher' ~/.claude/settings.json<br>``` |
| **Expected** | Output is exactly two lines in order: `Bash` then `Write`. No `mcp__codex__*` entries remain. |
| **Notes** | The `filter` in `hooks.mjs:68` is a stable filter, so insertion order is preserved deterministically. |

### G3-9c — Empty `PostToolUse` after removal → key itself is deleted

| Field | |
|---|---|
| **Goal** | If the user had no other hooks (only our two marked groups), `hooks.mjs:69-70` removes the empty `PostToolUse` and then the empty `hooks` object entirely, so `settings.json` ends up without a `hooks` key. |
| **Setup** | Fresh `$HOME`. Install with `auto-on-skill` but do NOT pre-seed a user hook: ```sh<br>rm -rf ~/.claude<br>codex-on-claude --patterns=review --context-policy=direct --improvement-loop=auto-on-skill --threads=off --yes<br>jq 'has("hooks") and (.hooks \| has("PostToolUse"))' ~/.claude/settings.json   # → true<br>``` |
| **Command** | ```sh<br>codex-on-claude reconfigure --improvement-loop=off --yes<br>jq 'has("hooks")' ~/.claude/settings.json<br>``` |
| **Expected** | `false` — the top-level `hooks` key is gone. `settings.json` may still exist (other keys preserved); it's only `hooks` that's been cleaned up. |
| **Notes** | Without this cleanup, `settings.json` would accumulate empty `"hooks":{}` cruft over time. |

### G3-10 — `--threads=off/basic/full` toggles SKILL + threads dir

| Field | |
|---|---|
| **Goal** | The `codex-threads` Skill file and the catalog directory appear or disappear in lockstep with the mode. |
| **Setup** | Three passes with fresh HOME each. |
| **Command** | For each mode `M` in `{off, basic, full}`: `codex-on-claude --patterns=review --context-policy=direct --improvement-loop=off --threads=$M --yes && ls ~/.claude/skills/codex-threads/SKILL.md 2>/dev/null; ls -d ~/.claude/codex-on-claude/threads 2>/dev/null`. |
| **Expected** | `off`: SKILL absent, threads dir absent. `basic`/`full`: SKILL present. (Threads dir may be lazily created on first `threads new`; if absent at this point that's still a pass.) |
| **Notes** | `basic` vs `full` differs in *which fields the Skill instructs the LLM to write*, not in directory layout. |

### G3-11 — `reconfigure` shrink removes unselected Skill dirs but **preserves the data dir**

| Field | |
|---|---|
| **Goal** | Shrinking `--patterns` removes the deselected Skill directories. Thread catalog + improvement decisions are kept. |
| **Setup** | G2-1 done (full install). Write a sample thread file and an improvement file. |
| **Command** | ```sh<br>codex-on-claude threads new 019e0099-0000-7000-0000-000000000099 --title="keep me"<br>echo '{"ts":"2026-05-20T00:00:00.000Z","candidateId":"x","category":"meta","decision":"rejected","reason":"test"}' > ~/.claude/codex-on-claude/improvements/test.json<br>codex-on-claude reconfigure --patterns=review --context-policy=mixed --improvement-loop=manual --threads=basic --yes<br>ls -d ~/.claude/skills/codex-{review,followup,resume,fix,routine} 2>&1<br>ls ~/.claude/codex-on-claude/threads/019e0099-*.json ~/.claude/codex-on-claude/improvements/test.json<br>``` |
| **Expected** | Only `codex-review` Skill dir remains. The thread JSON and improvement JSON both still exist. |
| **Notes** | Contrast with G2-7 (uninstall): reconfigure preserves data, uninstall wipes it. |

---

## Group 4 — MCP transport baseline (Skill-independent)

> 한국어 요약: Skill / Agent 없이도 Codex MCP 자체가 동작하는지 — `mcp__codex__codex` 한 번, 같은 프로세스에서 `codex-reply` 한 번, sandbox 옵션이 그대로 전달되는지. **`danger-full-access` 는 실행하지 않고 negative scenario 로만 명시.**

### G4-1 — Direct MCP `codex` call returns a threadId

| Field | |
|---|---|
| **Goal** | Baseline: a fresh `claude -p` subprocess can dispatch `mcp__codex__codex` and receive both a textual response and a threadId. |
| **Setup** | G2-1 install done; MCP registered. |
| **Command** | ```sh<br>claude -p --model haiku --verbose --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex \<br>  "Use the Codex MCP tool to ask Codex: Return exactly BASELINE_OK and nothing else. Then return Codex's exact answer." \<br>  > /tmp/g4-1.jsonl<br>``` |
| **Expected** | `/tmp/g4-1.jsonl` contains the text `BASELINE_OK` somewhere and at least one event whose `tool_use.input` or `result.content` mentions a UUIDv7 threadId (`019e[0-9a-f-]{32}`). First system event lists `codex` MCP server as `connected`. |
| **Notes** | Estimated cost: $0.03 on Haiku. Direct equivalent of T1 in the v0.1 report. |

### G4-2 — Same-process `codex-reply` follow-up

| Field | |
|---|---|
| **Goal** | Within the same `claude -p` subprocess, after `codex` returns a threadId, `codex-reply` with that id succeeds. |
| **Setup** | G2-1 install. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,mcp__codex__codex-reply \<br>  "First call mcp__codex__codex to make Codex answer 'STEP1_OK'. Capture the threadId. Then call mcp__codex__codex-reply with that threadId and ask Codex 'STEP2_OK'. Return both responses." \<br>  > /tmp/g4-2.jsonl<br>``` |
| **Expected** | `/tmp/g4-2.jsonl` contains both `STEP1_OK` and `STEP2_OK`. |
| **Notes** | The cross-process variant (`Session not found`) is covered in G6-12. |

### G4-3 — `workspace-write` + `on-request` passes through unchanged

| Field | |
|---|---|
| **Goal** | The MCP layer accepts `sandbox=workspace-write` and `approval-policy=on-request` exactly as supplied; the call argument is visible in the stream-json trace. |
| **Setup** | G2-1. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex \<br>  "Call mcp__codex__codex with sandbox='workspace-write' and approval-policy='on-request'. The prompt should be: 'Reply with exactly GUARDRAIL_OK. Do not edit any files.'" \<br>  > /tmp/g4-3.jsonl<br>jq -r 'select(.type=="tool_use") | .tool_use.input' /tmp/g4-3.jsonl 2>/dev/null \| grep -E 'workspace-write\|on-request'<br>``` |
| **Expected** | The stream-json trace shows `"sandbox":"workspace-write"` and `"approval-policy":"on-request"` in the tool-use input. Codex's text contains `GUARDRAIL_OK`. |
| **Notes** | If your Codex auth refuses workspace-write in this CWD, swap CWD to a writable scratch dir. |

### G4-4 — `danger-full-access` is **not exercised** (negative scenario)

| Field | |
|---|---|
| **Goal** | Spec-only check: no scenario in this document calls `sandbox=danger-full-access`. The workflow refuses this mode by convention. |
| **Setup** | None. |
| **Command** | (Inspection only.) `grep -r 'danger-full-access' install/components/skills/ docs/test-scenarios-codex-calls.md` |
| **Expected** | Matches appear only in **prohibitive** prose ("Never call with `danger-full-access`", "is not used in this workflow"). No invocation example uses this sandbox. |
| **Notes** | Documenting this as a deliberate omission, not an oversight. |

---

## Group 5 — Skill MUST procedures

> 한국어 요약: 각 Skill 의 SKILL.md 가 "ALWAYS / MUST" 로 못박은 행동 — `Thread: <id>` 종료 라인, sandbox 가드레일, 카탈로그 자동 등록, out-of-scope 차단 — 을 행동 단위로 검증.

### G5-1 — `/codex-review` ends with the literal `Thread: <id>` line and registers in the catalog

| Field | |
|---|---|
| **Goal** | A slash-command invocation of `/codex-review` (a) returns a response ending exactly with `Thread: <id>\n`, and (b) when threads is enabled, registers the threadId via `codex-on-claude threads new`. |
| **Setup** | G2-1 install with `--threads=basic`. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,Bash \<br>  "/codex-review Review this trivial diff: 'console.log(1)'. Reply 'OK'." \<br>  > /tmp/g5-1.jsonl<br>jq -r 'select(.type=="result") \| .result' /tmp/g5-1.jsonl \| tail -3<br>codex-on-claude threads list --limit=5<br>``` |
| **Expected** | Last non-empty line of the result starts with the exact prefix `Thread: `. `threads list` shows one entry whose `originatingSkill=codex-review`. Variant phrasings ("Session thread ID:", "thread id:") are fails. |
| **Notes** | Direct evolution of T2 from the 0.1 report. |

### G5-2 — `/codex-review` guardrails: sandbox stays `read-only`, approval `never`

| Field | |
|---|---|
| **Goal** | Even if the user's prompt suggests editing files, the Skill never promotes the sandbox above `read-only`. |
| **Setup** | G2-1 install. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,Bash \<br>  "/codex-review Please fix the typo in README.md (change 'tehy' to 'they')." \<br>  > /tmp/g5-2.jsonl<br>jq -r 'select(.type=="tool_use" and .tool_use.name=="mcp__codex__codex") \| .tool_use.input' /tmp/g5-2.jsonl<br>``` |
| **Expected** | Every recorded `tool_use.input` has `"sandbox":"read-only"` and `"approval-policy":"never"`. The Skill should also surface the suggestion to switch to `/codex-fix` instead of editing itself. |
| **Notes** | Maps to the `Guardrails` block in `codex-review/SKILL.md`. |

### G5-3 — `/codex-followup` increments `turnCount`

| Field | |
|---|---|
| **Goal** | Each `/codex-followup` invocation bumps `turnCount` by 1 in the catalog. |
| **Setup** | G5-1 produced a registered thread `T1`. |
| **Command** | ```sh<br>T1=$(codex-on-claude threads latest --format=id)<br>BEFORE=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/$T1.json)<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex-reply,Bash \<br>  "/codex-followup threadId=$T1 prompt='What did you say earlier?'" > /tmp/g5-3.jsonl<br>AFTER=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/$T1.json)<br>echo "before=$BEFORE after=$AFTER"<br>``` |
| **Expected** | `after = before + 1`. Response ends with `Thread: $T1`. |
| **Notes** | Same-process follow-up — no `Session not found` risk. |

### G5-4 — `/codex-followup` with an empty `threadId` refuses to auto-proceed

| Field | |
|---|---|
| **Goal** | A blank threadId must trigger the "Confirm with the user" branch — the Skill should ask, not guess. |
| **Setup** | G2-1 install. |
| **Command** | `claude -p --model haiku --output-format stream-json --permission-mode dontAsk --allowedTools=mcp__codex__codex-reply,Bash "/codex-followup with no threadId — just guess." > /tmp/g5-4.jsonl` |
| **Expected** | No `mcp__codex__codex-reply` `tool_use` event in the stream. Result text asks the user for the threadId or suggests `codex-on-claude threads latest --format=id`. |
| **Notes** | This is a *behavioral* assertion against Skill prose. If the LLM regresses, file as a Skill correction PR. |

### G5-5 — `/codex-fix` happy path with a single allowlisted file

| Field | |
|---|---|
| **Goal** | A scoped `/codex-fix` against one file returns the `{"edited":[...]}` JSON and writes a `decision` summary in the catalog. |
| **Setup** | G2-1 + threads=basic. Create scratch file: `echo 'hello world' > /tmp/g5-5.txt`. |
| **Command** | ```sh<br>cd /tmp && claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,Bash \<br>  "/codex-fix Edit ONLY /tmp/g5-5.txt to change 'hello' to 'hi'. Output {\"edited\":[...]} after." \<br>  > /tmp/g5-5.jsonl<br>cat /tmp/g5-5.txt<br>T=$(codex-on-claude threads latest --format=id) && jq '.summaries[] \| select(.kind=="decision")' ~/.claude/codex-on-claude/threads/$T.json<br>``` |
| **Expected** | `/tmp/g5-5.txt` contains `hi world`. Catalog has at least one `kind=decision` summary mentioning the file. Response ends `Thread: <id>`. |
| **Notes** | Estimated $0.05. Skip if your $HOME is on a sandbox-restricted volume. |

### G5-6 — `/codex-fix` out-of-scope path files an incident

| Field | |
|---|---|
| **Goal** | When the task requires editing outside the allowlist, Codex returns `NEEDS_OUT_OF_SCOPE_FILES` and the Skill records an incident. |
| **Setup** | Two scratch files: `echo a > /tmp/g5-6a.txt && echo b > /tmp/g5-6b.txt`. |
| **Command** | ```sh<br>cd /tmp && claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,Bash \<br>  "/codex-fix Edit ONLY /tmp/g5-6a.txt. Task: replace BOTH /tmp/g5-6a.txt and /tmp/g5-6b.txt contents with 'X'. If you cannot, reply NEEDS_OUT_OF_SCOPE_FILES." \<br>  > /tmp/g5-6.jsonl<br>T=$(codex-on-claude threads latest --format=id) && jq '.incidents[] \| select(.issue=="out-of-scope-files-needed")' ~/.claude/codex-on-claude/threads/$T.json<br>``` |
| **Expected** | `/tmp/g5-6b.txt` is **unchanged** (`cat /tmp/g5-6b.txt` shows `b`). Catalog has one incident with `issue=out-of-scope-files-needed`, `outcome=blocked`. |
| **Notes** | This is a sandbox-correctness regression test. |

### G5-7 — `/codex-routine` stores a routine definition and rejects unsafe automation

| Field | |
|---|---|
| **Goal** | Defining a routine writes `~/.codex-routines/<name>.json`; when the user asks for automated cadence with `workspace-write`, the Skill should refuse / warn. |
| **Setup** | G2-1 install. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json --permission-mode dontAsk --allowedTools=Bash \<br>  "/codex-routine Define routine 'daily-main-review' targeting 'git diff main..HEAD' with cadence=/loop 1h and sandbox=read-only." \<br>  > /tmp/g5-7a.jsonl<br>ls ~/.codex-routines/daily-main-review.json && jq '.sandbox' ~/.codex-routines/daily-main-review.json<br><br># Negative subcase:<br>claude -p --model haiku --output-format stream-json --permission-mode dontAsk --allowedTools=Bash \<br>  "/codex-routine Define routine 'bad-auto-fix' with cadence=cron and sandbox=workspace-write." \<br>  > /tmp/g5-7b.jsonl<br>``` |
| **Expected** | First subcase: file exists, `sandbox` is `"read-only"`. Second subcase: the response refuses or downgrades; the JSON, if created at all, does not have `sandbox=workspace-write`. |
| **Notes** | Maps to the routine-Skill guardrails: "Automated routines must not use `workspace-write` or `danger-full-access`." |

### G5-8 — `/codex-log` writes a metadata-only JSONL line

| Field | |
|---|---|
| **Goal** | Manual `/codex-log` (improvementLoop=manual) appends a line that contains lengths but **never** the prompt/response body. |
| **Setup** | G2-1 install (improvementLoop=manual). |
| **Command** | ```sh<br>codex-on-claude log --skill=codex-review --tool=mcp__codex__codex --sandbox=read-only --approval-policy=never \<br>  --thread-id=019e0099-0000-7000-0000-000000000099 \<br>  --prompt-chars=412 --response-chars=1834 --elapsed-ms=4823 --outcome=ok<br>tail -1 ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl \| jq 'keys'<br>tail -1 ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl \| jq 'has("prompt") or has("response")'<br>``` |
| **Expected** | `keys` is some subset of `["ts","skill","tool","sandbox","approvalPolicy","threadId","promptChars","responseChars","elapsedMs","viaAgent","outcome","errorKind","notes"]`. `has("prompt") or has("response")` is `false`. |
| **Notes** | The privacy assertion — also verified in G7-4 from a different angle. |

---

## Group 6 — Thread catalog: CRUD, modes, and recovery

> 한국어 요약: 14 개 `threads` 서브커맨드의 정상 동작 + 잘못된 입력 실패 + `fallbackStrategy` 3 가지에 따른 복구 흐름 + **SILENT_NEW_SESSION 자동 감지**.

### G6-1 — `threads new` is idempotent

| Field | |
|---|---|
| **Goal** | Calling `threads new` twice with the same id merges (single record), doesn't duplicate. |
| **Setup** | G2-1 with threads=basic. |
| **Command** | ```sh<br>ID=019e0099-0000-7000-0000-0000000000a1<br>codex-on-claude threads new $ID --title="first"<br>codex-on-claude threads new $ID --title="second" --tags=merged<br>jq '. | {title, tags}' ~/.claude/codex-on-claude/threads/$ID.json<br>ls ~/.claude/codex-on-claude/threads/$ID*.json \| wc -l<br>``` |
| **Expected** | Single file. Title is "second", tags include `merged`. |
| **Notes** | — |

### G6-2 — `threads new --bump-turn` increments `turnCount` by 1

| Field | |
|---|---|
| **Goal** | The `--bump-turn` flag mutates `turnCount` deterministically. |
| **Setup** | G6-1 done. |
| **Command** | ```sh<br>BEFORE=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/019e0099-0000-7000-0000-0000000000a1.json)<br>codex-on-claude threads new 019e0099-0000-7000-0000-0000000000a1 --bump-turn<br>AFTER=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/019e0099-0000-7000-0000-0000000000a1.json)<br>echo "$BEFORE -> $AFTER"<br>``` |
| **Expected** | `BEFORE` is 0 or 1; `AFTER = BEFORE + 1`. |
| **Notes** | Skill MUST procedures rely on this for `/codex-followup` (G5-3). |

### G6-3 — `threads list` filters work independently

| Field | |
|---|---|
| **Goal** | `--status`, `--tag`, `--since`, `--skill`, `--limit` each constrain the listing predictably. |
| **Setup** | Seed catalog with the tag-cluster fixture: `cp $REPO/install/fixtures/analyze-rules/threads/tag-cluster/*.json ~/.claude/codex-on-claude/threads/`. |
| **Command** | ```sh<br>codex-on-claude threads list --tag=security --limit=3 \| wc -l<br>codex-on-claude threads list --status=resolved \| grep -c '\.json\|resolved'<br>codex-on-claude threads list --since=1d \| wc -l<br>``` |
| **Expected** | The `--tag=security --limit=3` listing shows ≤3 entries. `--status=resolved` returns only the 4 resolved fixtures, not the 1 active one. `--since=1d` returns 0 (all fixtures are older than 1 day from any plausible run date). |
| **Notes** | Use the tag-cluster fixture so the counts are stable. |

### G6-4 — `threads latest --format=id` is shell-pipe-friendly

| Field | |
|---|---|
| **Goal** | `--format=id` emits only one line containing the latest threadId, suitable for `T=$(...)` chaining. |
| **Setup** | At least one thread in catalog (G6-1). |
| **Command** | `codex-on-claude threads latest --format=id; codex-on-claude threads latest --format=json \| jq '.threadId'` |
| **Expected** | First command output is a single 36-char UUIDv7 string. Second command's `.threadId` matches. |
| **Notes** | The deterministic-id form is what Skills depend on for fallback recovery. |

### G6-5 — `threads search` matches across title/tags/summaries/incidents

| Field | |
|---|---|
| **Goal** | Full-text search hits should include records that match in any of those fields. |
| **Setup** | Copy incidents-cluster fixture: `cp $REPO/install/fixtures/analyze-rules/threads/incidents-cluster/*.json ~/.claude/codex-on-claude/threads/`. |
| **Command** | ```sh<br>codex-on-claude threads search "React refactor" \| grep -c '019e2000'<br>codex-on-claude threads search "silent-new-session" \| grep -c '019e2000'<br>codex-on-claude threads search "ZZZ_NOT_PRESENT" \| wc -l<br>``` |
| **Expected** | First and second commands match the same fixture (title and incident text respectively). Third returns 0 matches. |
| **Notes** | — |

### G6-6 — `threads goal|outcome|decision|note` accumulate into `summaries[]`

| Field | |
|---|---|
| **Goal** | Each kind writes a row into `summaries[]` with the right `kind` field; nothing collides. |
| **Setup** | Single thread `T` from G6-1. |
| **Command** | ```sh<br>ID=019e0099-0000-7000-0000-0000000000a1<br>codex-on-claude threads goal     $ID "verify naming consistency"<br>codex-on-claude threads outcome  $ID "found 3 issues"<br>codex-on-claude threads decision $ID "adopt suggestion 2"<br>codex-on-claude threads note     $ID "user wanted file order kept"<br>jq '[.summaries[].kind]' ~/.claude/codex-on-claude/threads/$ID.json<br>``` |
| **Expected** | `["goal","outcome","decision","note"]` (in insertion order). |
| **Notes** | — |

### G6-7 — `threads incident` accumulates; ≥3 surfaces a `/codex-analyze` candidate

| Field | |
|---|---|
| **Goal** | Three incidents on a single thread make the analyzer flag it under `reliability`. |
| **Setup** | Copy incidents-cluster fixture into the live catalog (one thread, 3 incidents). |
| **Command** | ```sh<br>cp $REPO/install/fixtures/analyze-rules/threads/incidents-cluster/*.json ~/.claude/codex-on-claude/threads/<br>codex-on-claude analyze --days=60 \| grep -A2 incidents<br>``` |
| **Expected** | Analyzer output includes a candidate titled like `thread 019e2000… has accumulated 3 incidents`. |
| **Notes** | Cross-references G7-5h. |

### G6-8 — `threads tag` / `status` / `fallback` single-field updates

| Field | |
|---|---|
| **Goal** | Each lifecycle command mutates one field with no collateral damage. |
| **Setup** | G6-1. |
| **Command** | ```sh<br>ID=019e0099-0000-7000-0000-0000000000a1<br>codex-on-claude threads tag      $ID --add=critical --remove=draft<br>codex-on-claude threads status   $ID resolved<br>codex-on-claude threads fallback $ID auto-resume<br>jq '{tags, status, fallbackStrategy}' ~/.claude/codex-on-claude/threads/$ID.json<br>``` |
| **Expected** | `{ "tags": ["critical", ...], "status": "resolved", "fallbackStrategy": "auto-resume" }`. The pre-existing tags survive minus any `draft` value. |
| **Notes** | — |

### G6-9 — Invalid inputs fail loudly

| Field | |
|---|---|
| **Goal** | Bad threadId, unknown status, and unknown fallback all exit non-zero with a clear message. |
| **Setup** | None. |
| **Command** | ```sh<br>codex-on-claude threads status 019e0099-XXXX resolved; echo "exit=$?"<br>codex-on-claude threads status 019e0099-0000-7000-0000-0000000000a1 finished; echo "exit=$?"<br>codex-on-claude threads fallback 019e0099-0000-7000-0000-0000000000a1 retry; echo "exit=$?"<br>``` |
| **Expected** | All three print `exit=` with a non-zero value (commonly `1`) and an error message identifying the bad input. |
| **Notes** | Defensive boundary check. |

### G6-10 — `threads remove` deletes the file and reindexes

| Field | |
|---|---|
| **Goal** | Removing a thread removes its JSON and updates `index.json`. |
| **Setup** | G6-1. |
| **Command** | ```sh<br>ID=019e0099-0000-7000-0000-0000000000a1<br>codex-on-claude threads remove $ID<br>[ ! -f ~/.claude/codex-on-claude/threads/$ID.json ] && echo "file gone"<br>jq --arg id $ID 'map(select(.threadId==$id)) \| length' ~/.claude/codex-on-claude/threads/index.json<br>``` |
| **Expected** | `file gone`; `index.json` length-check returns 0. |
| **Notes** | — |

> **Phase B recovery setup**: `codex exec resume` reads transcripts from `$CODEX_HOME/sessions/` (default `~/.codex`). When running with isolated `HOME=$(mktemp -d)`, set `CODEX_HOME=$REAL_HOME/.codex` so Codex can find the real session store. Otherwise G6-1x resume scenarios fail with `no rollout found`. See `docs/test-execution-results-2026-05-20.md`.

### G6-11 — Recovery: `fallbackStrategy=auto-resume`

| Field | |
|---|---|
| **Goal** | When the thread's fallback is `auto-resume`, `threads resume <id> "..."` immediately runs `codex exec resume`. |
| **Setup** | Pick an active threadId (`T` from G5-1), set fallback: `codex-on-claude threads fallback $T auto-resume`. |
| **Command** | `codex-on-claude threads resume $T "Briefly summarize what you said earlier."` |
| **Expected** | Subprocess runs `codex exec resume --skip-git-repo-check --json $T ...` (visible in `ps` or the printed command echo). The returned thread_id matches `$T` (same session recovered) → no SILENT_NEW_SESSION warning. |
| **Notes** | Estimated $0.02. |

### G6-12 — Recovery: SILENT_NEW_SESSION auto-detection (auto-resume branch only)

| Field | |
|---|---|
| **Goal** | When `fallbackStrategy=auto-resume`, `codex exec resume` against a non-existent id silently starts a fresh session with a different `thread_id`. The wrapper detects the mismatch, prints `⚠ SILENT_NEW_SESSION`, files an `incident --issue=silent-new-session --outcome=lost-context` on the original thread, and registers the new id as a bifurcation thread with `originatingSkill="codex-resume-bifurcation"`. |
| **Setup** | `BAD_ID=not-a-uuid-deadbeef` — must be a **malformed** thread id (any string that passes `isValidThreadId` but is NOT a valid UUIDv7). Crucial finding from execution: **codex CLI 0.131 returns a clean error (exit 1) on valid-format-but-unknown UUIDs and only silently creates new sessions for malformed ids**. Register the placeholder with **`--fallback=auto-resume`**: `codex-on-claude threads new $BAD_ID --title="placeholder" --fallback=auto-resume`. The `ask` and `new` fallback branches bypass `codex exec` entirely and cannot exercise SILENT detection. |
| **Command** | ```sh<br>codex-on-claude threads resume 019e0099-0000-7000-0000-deadbeefdead "Hi Codex." 2>&1 \| tee /tmp/g6-12.log<br>grep -c "SILENT_NEW_SESSION" /tmp/g6-12.log<br>jq '.incidents[] \| select(.issue=="silent-new-session")' ~/.claude/codex-on-claude/threads/019e0099-0000-7000-0000-deadbeefdead.json<br>``` |
| **Expected** | `SILENT_NEW_SESSION` substring present in the log (≥1). The original thread file has at least one incident with `issue=silent-new-session` and `outcome=lost-context`. A new thread file exists with the *actual* id Codex returned; that file's `originatingSkill` is `"codex-resume-bifurcation"`. |
| **Notes** | Headline failure-mode test. Distinct from G6-12d below — `silent-new-session` and `auto-resume-failed` are **two separate incident categories** (`install.mjs:749-753` vs. `install.mjs:766`). Estimated $0.02. |

### G6-12b — `fallback=ask` does NOT spawn `codex exec resume`

| Field | |
|---|---|
| **Goal** | Negative-control: with `fallbackStrategy=ask`, the wrapper prints metadata and returns; no `codex exec` subprocess is started, no incident is filed. |
| **Setup** | `BAD_ID2=019e0099-0000-7000-0000-deadbeefdea2`. Register with ask fallback: `codex-on-claude threads new $BAD_ID2 --title="ask-mode" --fallback=ask`. |
| **Command** | ```sh<br>(codex-on-claude threads resume 019e0099-0000-7000-0000-deadbeefdea2 "anything?" &)<br>sleep 0.5<br>ps -ef \| grep -c '[c]odex exec resume'<br>jq '.incidents \| length' ~/.claude/codex-on-claude/threads/019e0099-0000-7000-0000-deadbeefdea2.json<br>``` |
| **Expected** | `ps` count is `0` (no `codex exec resume` process). The thread's `incidents` array length is `0`. The wrapper's stdout shows `fallback=ask` and the recent summaries listing. |
| **Notes** | Confirms the human-in-the-loop semantics of `ask`. Also re-validates G6-13 from a different angle. |

### G6-12c — `auto-resume` success path (same threadId returned) — no SILENT, `turnCount` bumps

| Field | |
|---|---|
| **Goal** | When auto-resume succeeds and Codex returns the **same** thread_id, no SILENT warning is emitted, no incident is filed, and the thread's `turnCount` increments by 1. |
| **Setup** | Use a **real** threadId from an earlier successful call (G4-1 or G5-1 yields one). Set its fallback to auto-resume: `T=$(codex-on-claude threads latest --format=id); codex-on-claude threads fallback $T auto-resume`. Capture `BEFORE=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/$T.json)`. |
| **Command** | ```sh<br>codex-on-claude threads resume $T "Briefly summarize what you said earlier." 2>&1 \| tee /tmp/g6-12c.log<br>AFTER=$(jq '.turnCount' ~/.claude/codex-on-claude/threads/$T.json)<br>echo "turnCount $BEFORE -> $AFTER"<br>grep -c "SILENT_NEW_SESSION" /tmp/g6-12c.log<br>jq '[.incidents[] \| select(.issue=="silent-new-session")] \| length' ~/.claude/codex-on-claude/threads/$T.json<br>``` |
| **Expected** | `/tmp/g6-12c.log` ends with `resume succeeded (same threadId returned)`. `AFTER = BEFORE + 1`. SILENT grep count `0`. Incident count `0`. (`install.mjs:759-762`.) |
| **Notes** | Estimated $0.02. This is the positive-control for G6-12. |

### G6-12d — `auto-resume` process failure → `issue=auto-resume-failed`, NOT `silent-new-session`

| Field | |
|---|---|
| **Goal** | If `codex exec resume` exits with non-zero (network down, auth bad, codex crashed), the wrapper records a **distinct** incident: `issue=auto-resume-failed`, `outcome=open`, not `silent-new-session`. (`install.mjs:764-767`.) |
| **Setup** | Same real thread `T` from G6-12c. **Inject a fake `codex` binary** that exits non-zero, by writing it to a dir at the front of PATH (codex CLI 0.131 does NOT honor `CODEX_API_BASE` — verified via Codex audit C4 thread `019e433d`). ```sh<br>FAKE=/tmp/coc-fake-codex && mkdir -p $FAKE && printf '#!/usr/bin/env bash\necho "fake codex: simulated failure" >&2\nexit 7\n' > $FAKE/codex && chmod +x $FAKE/codex<br>``` |
| **Command** | ```sh<br>BEFORE_INC=$(jq '.incidents \| length' ~/.claude/codex-on-claude/threads/$T.json)<br>PATH=$FAKE:$PATH codex-on-claude threads resume $T "ping" 2>&1 \| tee /tmp/g6-12d.log<br>jq '.incidents[-1] \| {issue, outcome}' ~/.claude/codex-on-claude/threads/$T.json<br>AFTER_INC=$(jq '.incidents \| length' ~/.claude/codex-on-claude/threads/$T.json)<br>echo "incidents $BEFORE_INC -> $AFTER_INC"<br>``` |
| **Expected** | Last incident is `{"issue": "auto-resume-failed", "outcome": "open"}`. Incident count grew by exactly 1. The log contains `resume failed (code <nonzero>)`. **No `silent-new-session` incident is added.** |
| **Notes** | $0 cost (no actual Codex API hit). Original spec used `CODEX_API_BASE` — wrong (CLI doesn't honor it). Codex audit C4 corrected this. |

### G6-12e — Bifurcation thread metadata after SILENT_NEW_SESSION

| Field | |
|---|---|
| **Goal** | After G6-12 fires, the new thread that Codex created carries deterministic metadata: `originatingSkill="codex-resume-bifurcation"` and `title="(silent new session from resume of <first 8 chars>)"`. (`install.mjs:755-758`.) |
| **Setup** | G6-12 already executed; capture the original BAD_ID and the new threadId that the wrapper printed. |
| **Command** | ```sh<br>NEW=$(jq -r --arg orig 019e0099-0000-7000-0000-deadbeefdead '.incidents[] \| select(.issue=="silent-new-session") \| .resolution \| capture("threadId (?<id>[0-9a-f-]+)") \| .id' ~/.claude/codex-on-claude/threads/019e0099-0000-7000-0000-deadbeefdead.json \| head -1)<br>jq '{originatingSkill, title}' ~/.claude/codex-on-claude/threads/$NEW.json<br>``` |
| **Expected** | `originatingSkill: "codex-resume-bifurcation"`, `title: "(silent new session from resume of 019e0099)"` (first 8 chars of the original). |
| **Notes** | Pure file-system assertion ($0). If the wrapper's title format ever changes, this scenario will surface it. |

### G6-12f — Regex fragility (XFAIL today): false SILENT_NEW_SESSION when stdout has earlier `thread_id` in nested event

| Field | |
|---|---|
| **Goal** | `install.mjs:744` extracts thread_id via `/"thread_id"\s*:\s*"([^"]+)"/` — picks the **first** match in stdout. If `codex` JSONL emits a nested event with a DIFFERENT `thread_id` before the real `session_configured` event, the wrapper would mistakenly flag SILENT_NEW_SESSION. **This test asserts the desired (future) behavior — no false positive — and is expected to FAIL on current code, surfacing the regex-fragility bug.** |
| **Setup** | Inject a fake `codex` that exits 0 and emits JSONL with `"thread_id":"FAKE-FIRST"` early and the real id later: ```sh<br>FAKE=/tmp/coc-fake-codex-regex && mkdir -p $FAKE && cat > $FAKE/codex <<'EOF'<br>#!/usr/bin/env bash<br># Mimic a codex exec resume call that streams JSONL.<br># First emit a tool-output event with a misleading thread_id, THEN session_configured with the real id.<br>REAL_ID="$3"  # codex exec resume --skip-git-repo-check --json <id> ...<br>echo '{"type":"item.completed","item":{"id":"item_0","type":"tool_result","text":"some payload mentioning \"thread_id\":\"FAKE-FIRST-EVENT-ID\""}}'<br>echo "{\"type\":\"session_configured\",\"thread_id\":\"$REAL_ID\"}"<br>echo "{\"type\":\"item.completed\",\"item\":{\"id\":\"item_1\",\"type\":\"agent_message\",\"text\":\"resumed\"}}"<br>EOF<br>chmod +x $FAKE/codex<br>``` |
| **Command** | ```sh<br>T=$(codex-on-claude threads latest --format=id)   # real existing thread from G6-11<br>BEFORE_INC=$(jq '.incidents \| length' ~/.claude/codex-on-claude/threads/$T.json)<br>PATH=$FAKE:$PATH codex-on-claude threads resume $T "ping" 2>&1 \| tee /tmp/g6-12f.log<br>SILENT_COUNT=$(jq '[.incidents[] \| select(.issue=="silent-new-session")] \| length' ~/.claude/codex-on-claude/threads/$T.json)<br>echo "silent-new-session incidents added: $SILENT_COUNT (target: 0 — current code likely adds 1, demonstrating the bug)"<br>``` |
| **Expected (desired future behavior)** | `SILENT_COUNT == 0` because the real session id matches the input. Current code: `SILENT_COUNT == 1` because regex picked `FAKE-FIRST-EVENT-ID`. Mark this scenario XFAIL until `install.mjs:744` is fixed to parse JSONL and trust only `session_configured`. |
| **Notes** | Adversarial test from Codex audit C4 (`019e433d-…`). Demonstrates a real latent bug that no other scenario catches. Fix path: replace the regex with a JSONL parse that picks the `thread_id` from the event with `type=="session_configured"`. |

### G6-13 — Recovery: `fallbackStrategy=ask`

| Field | |
|---|---|
| **Goal** | With `fallback=ask`, `threads resume` does *not* spawn `codex exec resume`. Instead, it prints metadata + summaries and waits for the human. |
| **Setup** | Pick an existing thread and set fallback to ask: `codex-on-claude threads fallback $T ask`. |
| **Command** | `codex-on-claude threads resume $T "Anything?" \| tee /tmp/g6-13.log; ps -ef \| grep -c '[c]odex exec resume'` |
| **Expected** | `/tmp/g6-13.log` shows the thread title + recent summaries. The `ps` count is `0` (no resume process started). |
| **Notes** | Confirms the human-in-the-loop semantics of `ask`. |

### G6-14 — Recovery: `fallbackStrategy=new`

| Field | |
|---|---|
| **Goal** | With `fallback=new`, `threads resume` starts a brand-new `mcp__codex__codex` session and feeds prior summaries as a preamble (so context isn't fully lost). |
| **Setup** | A thread with non-empty `summaries[]` (use the incidents-cluster fixture); set its fallback to new. |
| **Command** | `codex-on-claude threads fallback 019e2000-0000-7000-0000-000000000001 new && codex-on-claude threads resume 019e2000-0000-7000-0000-000000000001 "Continue the React refactor." 2>&1 \| tee /tmp/g6-14.log` |
| **Expected** | A NEW threadId appears in the log (different from the original). The new thread's record (when the wrapper writes it) carries a reference back to the original via tags or a note. Estimated $0.02. |
| **Notes** | If `mcp-server` is not running locally this scenario degrades to a documented error path — that's acceptable. |

---

## Group 7 — Logging, hooks, analyze, suggest

> 한국어 요약: 각 `improvementLoop` 모드가 로그를 어떻게 만들거나 안 만드는지, PostToolUse 훅의 멱등성과 비-Codex payload 무시, 9 개 분석기 룰의 결정론적 트리거 (픽스처 1:1 매칭), `suggest --apply/--reject` 의 영속성과 14 일 suppression.

### G7-1 — `improvementLoop=off` produces no logs

| Field | |
|---|---|
| **Goal** | With the loop off, even a real `mcp__codex__codex` call writes nothing under `~/.claude/codex-on-claude/logs/`. |
| **Setup** | Reconfigure: `codex-on-claude reconfigure --improvement-loop=off --yes`. |
| **Command** | Run G4-1 again, then `ls ~/.claude/codex-on-claude/logs/ 2>&1`. |
| **Expected** | The logs directory either doesn't exist or is empty. |
| **Notes** | — |

### G7-2 — `improvementLoop=manual` is LLM-driven (known limitation)

| Field | |
|---|---|
| **Goal** | In `manual` mode, the log appears only if the Skill's prose actually triggered `codex-on-claude log` via Bash. Missing entries are not a bug — they're the known cost of not running a hook. |
| **Setup** | `codex-on-claude reconfigure --improvement-loop=manual --yes`. |
| **Command** | Run G5-1, then `ls ~/.claude/codex-on-claude/logs/`. |
| **Expected** | One JSONL file with at least one line. **If empty, log it as a Skill regression candidate** (the LLM skipped the log step). Memory entry [feedback_skill_actual_vs_documented] is on point here. |
| **Notes** | Compare to G7-3 (the deterministic alternative). |

### G7-3 — `improvementLoop=auto-on-skill` hook logs both tools

| Field | |
|---|---|
| **Goal** | The installed PostToolUse hook automatically appends a log line for every `mcp__codex__codex` AND `mcp__codex__codex-reply` tool call. |
| **Setup** | `codex-on-claude reconfigure --improvement-loop=auto-on-skill --threads=basic --yes`. |
| **Command** | Run G4-2 (which fires both tools), then `wc -l ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl`. |
| **Expected** | Line count is at least 2. `jq -s '[.[] | .tool] | sort | unique' usage-...jsonl` shows both `mcp__codex__codex` and `mcp__codex__codex-reply`. |
| **Notes** | G7-3a/b combined into one observable. |

### G7-3c — `log --from-stdin` extracts fields from a hook payload

| Field | |
|---|---|
| **Goal** | The `log --from-stdin` parser (`extractFromHookPayload`) reads a synthetic PostToolUse payload and writes a properly-shaped JSONL line. |
| **Setup** | Loop=auto-on-skill (G7-3). |
| **Command** | ```sh<br>cat <<'EOF' \| codex-on-claude log --from-stdin<br>{"tool_name":"mcp__codex__codex","tool_input":{"prompt":"hi","sandbox":"read-only"},"tool_response":{"content":[{"type":"text","text":"hello"}],"threadId":"019e0099-0000-7000-0000-0000000000aa"},"duration_ms":1234}<br>EOF<br>tail -1 ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl \| jq '{skill, tool, sandbox, threadId, promptChars, responseChars, elapsedMs}'<br>``` |
| **Expected** | The JSON line includes `tool: "mcp__codex__codex"`, `sandbox: "read-only"`, `threadId: "019e0099-0000-7000-0000-0000000000aa"`, sensible `promptChars` / `responseChars` / `elapsedMs` values. |
| **Notes** | If the parser ever regresses, this scenario fails before live calls do. |

### G7-3d — Non-Codex payload is silently ignored

| Field | |
|---|---|
| **Goal** | A PostToolUse payload from an unrelated tool, or invalid JSON, must not pollute the log. |
| **Setup** | Loop=auto-on-skill. |
| **Command** | ```sh<br>BEFORE=$(wc -l < ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl 2>/dev/null \|\| echo 0)<br>echo '{"tool_name":"mcp__github__create_issue","tool_input":{"title":"x"},"tool_response":{"ok":true}}' \| codex-on-claude log --from-stdin<br>echo 'not-json-at-all' \| codex-on-claude log --from-stdin 2>&1 \| head -1<br>echo '' \| codex-on-claude log --from-stdin 2>&1 \| head -1<br>AFTER=$(wc -l < ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl 2>/dev/null \|\| echo 0)<br>echo "$BEFORE -> $AFTER"<br>``` |
| **Expected** | `$BEFORE == $AFTER`. The malformed inputs may print a one-line warning, but they do not append to the log. |
| **Notes** | Critical because the hook runs against every PostToolUse event — false positives would corrupt analyze. |

### G7-3e — Stale hook obeys runtime `config.improvementLoop` drift

| Field | |
|---|---|
| **Goal** | If the user changes `~/.claude/codex-on-claude/config.json`'s `improvementLoop` to `off` or `manual` AFTER install (without re-running `reconfigure`), the existing stale hook command must still respect the new config and stop logging. Defends against the silent-telemetry bug surfaced by the external test harness (P-15). |
| **Setup** | A test HOME with `~/.claude/codex-on-claude/` directory + a synthetic PostToolUse payload (any JSON with `tool_name=mcp__codex__codex` + `tool_response`). |
| **Command** | ```sh<br>TMP_HOME=$(mktemp -d) && export HOME="$TMP_HOME"<br>mkdir -p "$HOME/.claude/codex-on-claude/logs"<br>PAYLOAD='{"tool_name":"mcp__codex__codex","tool_input":{"prompt":"hi"},"tool_response":"{\"threadId\":\"019e0000-test-aaaa-bbbb-cccccccccccc\",\"content\":\"ok\"}","duration_ms":1}'<br>for mode in off manual; do<br>  rm -f "$HOME/.claude/codex-on-claude/logs"/usage-*.jsonl<br>  printf '{"choices":{"improvementLoop":"%s"}}\n' "$mode" > "$HOME/.claude/codex-on-claude/config.json"<br>  echo "$PAYLOAD" \| node $REPO/install/install.mjs log --from-stdin<br>  LOG="$HOME/.claude/codex-on-claude/logs/usage-$(date +%F).jsonl"<br>  [ ! -e "$LOG" ] \|\| [ "$(wc -l < "$LOG")" -eq 0 ] && echo "$mode: PASS" \|\| echo "$mode: FAIL"<br>done<br>``` |
| **Expected** | Both modes produce "PASS". Log file is either absent or empty after the hook payload is fed in. Implemented via `shouldAcceptAutoHookLog()` guard in `cmdLog` (added 2026-05-20 per Codex thread `019e437e`). |
| **Notes** | Companion to G7-1 (which only tested `improvementLoop=off` at install time). G7-3e covers the post-install drift case: user manually edits config.json without `reconfigure`. Fail-open semantics: corrupt or missing config → guard returns true (allows log) — see Codex thread `019e4381` for race-condition + fail-open rationale. |

### G7-4 — Log schema is metadata-only

| Field | |
|---|---|
| **Goal** | No JSONL entry written by any path (manual log, Skill log, hook log) contains a `prompt` or `response` body key. |
| **Setup** | Any prior G7-* completed. |
| **Command** | `jq -s 'map(keys) | flatten | unique' ~/.claude/codex-on-claude/logs/usage-*.jsonl` |
| **Expected** | The resulting array does NOT include `"prompt"` or `"response"`. It MAY include `"notes"` (a short text field). |
| **Notes** | Privacy invariant — also stated in `codex-log/SKILL.md` and README. |

### G7-5 — Analyzer rules, one fixture per rule

> Each subscenario copies one fixture into the live data dir, then runs analyze and asserts that the right candidate appears. The fixtures live under `install/fixtures/analyze-rules/` — see that directory's README for thresholds and a use-as-one-line snippet.

Common preamble for each subcase:

```sh
# Wipe live data so each rule fires in isolation.
rm -rf ~/.claude/codex-on-claude/logs ~/.claude/codex-on-claude/threads
mkdir -p ~/.claude/codex-on-claude/logs ~/.claude/codex-on-claude/threads
```

> For the thread-only subscenarios (G7-5g/h/i), add a single dummy log entry before running so `ruleNoLogs` doesn't take the `[1]` slot:
>
> ```sh
> echo '{"ts":"2026-05-15T10:00:00Z","skill":"codex-review","tool":"mcp__codex__codex","sandbox":"read-only","approvalPolicy":"never","threadId":"019e9999-0000-7000-0000-000000000001","promptChars":100,"responseChars":500,"elapsedMs":1000,"viaAgent":false,"outcome":"ok","errorKind":null,"notes":null}' \
>   > ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl
> ```

### G7-5a — `ruleNoLogs` (empty log)

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/empty.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=1` |
| **Expected** | Output mentions `No usage log entries`. |

### G7-5b — `ruleLargeResponsesNotAgent`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/large-direct-responses.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Route large responses through the isolated agent` is listed, with `recommend: ... contextPolicy=mixed`. |

### G7-5c — `ruleRepeatedPrompts`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/repeated-prompts.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Repeated pattern — routine / Skill candidate` is listed; the recommendation mentions `/codex-routine`. |

### G7-5d — `ruleSandboxMismatch`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/sandbox-mismatch.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `workspace-write calls produced no actual edits` is listed. |

### G7-5e — `ruleSessionNotFound`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/session-not-found.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Frequent session-not-found — automate via codex-resume` is listed. |

### G7-5f — `ruleTimeouts`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/logs/timeouts.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Timeouts observed — shorten prompts or change model` is listed. |

### G7-5g — `ruleStaleActiveThreads`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/threads/stale-active/*.json ~/.claude/codex-on-claude/threads/ && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Stale active threads to clean up` is listed; the recommendation mentions setting status to `resolved` or `archived`. |
| **Notes** | The fixtures use April 2026 dates so the 14-day staleness holds for any run past 2026-05-04. |

### G7-5h — `ruleIncidentRepeat`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/threads/incidents-cluster/*.json ~/.claude/codex-on-claude/threads/ && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `thread 019e2000… has accumulated 3 incidents` is listed; the `applyHint` suggests `codex-on-claude threads fallback ... new`. |

### G7-5i — `ruleSimilarTagCluster`

| Field | |
|---|---|
| **Command** | `cp $REPO/install/fixtures/analyze-rules/threads/tag-cluster/*.json ~/.claude/codex-on-claude/threads/ && codex-on-claude analyze --days=30` |
| **Expected** | A candidate titled `Multiple threads share the same tag` is listed, citing the `security` tag across 5 threads. |

### G7-6 — `analyze --days / --format / --save` flags

| Field | |
|---|---|
| **Goal** | The three I/O flags work independently. |
| **Setup** | Any non-empty fixture loaded. |
| **Command** | ```sh<br>codex-on-claude analyze --days=7  --format=text     \| head -3<br>codex-on-claude analyze --days=30 --format=json    \| jq '.windowDays'<br>codex-on-claude analyze --days=30 --format=markdown \| head -3<br>codex-on-claude analyze --days=30 --save && ls ~/.claude/codex-on-claude/reports/<br>``` |
| **Expected** | Text-mode begins with `codex-on-claude analyze (last 7 days, ...)`. JSON output's `.windowDays` is `30`. Markdown begins with `# codex-on-claude analysis report`. The reports dir contains at least one `.md` and one `.json` snapshot. |
| **Notes** | `--save` writes both formats. |

### G7-7 — `suggest --apply=N` records an apply decision

| Field | |
|---|---|
| **Goal** | Choosing to apply a candidate writes `~/.claude/codex-on-claude/improvements/<ts>.json` with `decision=apply`. |
| **Setup** | A live analyze output with at least one candidate (e.g., load the large-responses fixture as in G7-5b). |
| **Command** | `codex-on-claude suggest --apply=1 && ls -t ~/.claude/codex-on-claude/improvements/ | head -1 | xargs -I{} jq '.decision' ~/.claude/codex-on-claude/improvements/{}` |
| **Expected** | `"apply"`. |
| **Notes** | Caveat: as of 0.3.3 the apply path may emit further configuration suggestions (`reconfigure --context-policy=mixed --yes`) rather than auto-applying. The decision record is what we assert. |

### G7-8 — `suggest --reject=N --reason="..."` suppresses for 14 days

| Field | |
|---|---|
| **Goal** | A reject decision is recorded with `reason`, and the same candidate is filtered out of subsequent `analyze` runs for 14 days. |
| **Setup** | G7-5b fixture loaded so the same candidate id `token-efficiency-route-via-agent` is present. |
| **Command** | ```sh<br>codex-on-claude suggest --reject=1 --reason="intentional — agent off this week"<br>ls -t ~/.claude/codex-on-claude/improvements/ \| head -1 \| xargs -I{} jq '{decision, reason, candidateId}' ~/.claude/codex-on-claude/improvements/{}<br>codex-on-claude analyze --days=30 \| grep -c 'token-efficiency-route-via-agent'<br>``` |
| **Expected** | The improvement file's `decision="rejected"` and `reason` matches the input. The subsequent analyze shows `0` matches for that candidate id (suppressed). |
| **Notes** | `filterRecentlyDismissed` reads the rejection timestamp; back-dating an improvement file by ≥14 days would un-suppress the candidate. |

### G7-9 — `/codex-improve` Skill smoke (LLM-driven)

| Field | |
|---|---|
| **Goal** | Invoking the prose Skill walks the user through one apply/reject/skip cycle and ends up writing the same improvement file shape. |
| **Setup** | G7-5b fixture loaded; threads + improvement loop on. |
| **Command** | `claude -p --model haiku --output-format stream-json --permission-mode dontAsk --allowedTools=Bash "/codex-improve Apply candidate 1." > /tmp/g7-9.jsonl && ls -t ~/.claude/codex-on-claude/improvements/ | head -1` |
| **Expected** | A new improvement file appears, `decision` set to `"apply"`, candidateId matches the one shown by analyze. The Skill response also surfaces a verification checklist. |
| **Notes** | Pure CLI G7-7 is the deterministic ground truth; this scenario only ensures the prose Skill still ties into it. |

---

## Group 8 — End-to-end pipeline

> 한국어 요약: 격리 HOME 에서 install → `/codex-review` → `/codex-followup` → `analyze` → `suggest --apply` → `status` 까지 모든 층을 한 번에 통과시키는 통합 시나리오.

### G8-1 — Full happy path

| Field | |
|---|---|
| **Goal** | A single run exercises install + Skills + agent + threads + hook logging + analyze + apply, all asserted against deterministic file artifacts. |
| **Setup** | Fresh `$HOME`, MCP `codex` registered. |
| **Command** | ```sh<br># 1. Install full stack with hooks ON.<br>codex-on-claude \<br>  --patterns=review,followup,fix,routine \<br>  --context-policy=mixed \<br>  --improvement-loop=auto-on-skill \<br>  --threads=full --yes<br><br># 2. Fire /codex-review in a subprocess.<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex,mcp__codex__codex-reply,Bash \<br>  "/codex-review Review this trivial diff: 'console.log(2)'. Reply 'E2E_REVIEW_OK'." > /tmp/g8-1a.jsonl<br><br># 3. Capture threadId, fire /codex-followup in another subprocess (same MCP server).<br>T=$(codex-on-claude threads latest --format=id)<br>claude -p --model haiku --output-format stream-json \<br>  --permission-mode dontAsk \<br>  --allowedTools=mcp__codex__codex-reply,Bash \<br>  "/codex-followup threadId=$T prompt='Reply E2E_FOLLOWUP_OK.'" > /tmp/g8-1b.jsonl<br><br># 4. Pump a synthetic-large-response fixture so analyze has a candidate.<br>cp $REPO/install/fixtures/analyze-rules/logs/large-direct-responses.jsonl \<br>   ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl<br><br># 5. Analyze, then apply candidate 1.<br>codex-on-claude analyze --days=30 > /tmp/g8-1c.txt<br>codex-on-claude suggest --apply=1<br><br># 6. Status snapshot.<br>codex-on-claude status > /tmp/g8-1d.txt<br>``` |
| **Expected** | <ul><li>`/tmp/g8-1a.jsonl` contains `E2E_REVIEW_OK`.</li><li>`/tmp/g8-1b.jsonl` contains `E2E_FOLLOWUP_OK`.</li><li>`~/.claude/codex-on-claude/threads/$T.json` shows `turnCount ≥ 2`, status=active, originatingSkill=codex-review.</li><li>Hook log file `usage-*.jsonl` has ≥3 lines (one for the review, one for the followup, possibly more for any intermediate calls). No `prompt`/`response` body keys.</li><li>`/tmp/g8-1c.txt` lists the `Route large responses through the isolated agent` candidate.</li><li>`~/.claude/codex-on-claude/improvements/` has at least one file with `decision="apply"` and `candidateId="token-efficiency-route-via-agent"`.</li><li>`/tmp/g8-1d.txt` reflects `patterns: review,followup,fix,routine` and `improvementLoop: auto-on-skill`.</li></ul> 11 independent assertions packed into one run. |
| **Notes** | Estimated cost: ~$0.07 (one Codex review + one followup on Haiku). |

---

## Coverage matrix

This document covers every distinct call-surface in the 0.3.3 codebase:

| Surface | Covered by |
|---|---|
| `mcp__codex__codex` (direct) | G4-1, G4-3, G5-1, G5-2, G5-5, G5-6, G6-14, G8-1 |
| `mcp__codex__codex-reply` (same proc) | G4-2, G5-3, G8-1 |
| `mcp__codex__codex-reply` (cross-proc fail) | G6-12 (via the resume wrapper) |
| `codex exec resume` (Bash) | G6-11, G6-12 |
| `codex exec ...` (routine cron) | G5-7 |
| `codex-reviewer` agent | G3-3, G3-4 (artifact); behavioral coverage via `mixed` context in G5-1 / G8-1 |
| `codex-on-claude` CLI subcommands | doctor: G1-1/2, install/reconfigure: G2-*, status: G2-6/G8-1, uninstall: G2-7, analyze: G7-5/6, suggest: G7-7/8, log: G5-8/G7-3*/G7-4, threads (14 sub-subcmds): G6-1..G6-14 |
| Skills MUST procedures | codex-review: G5-1/2, codex-followup: G5-3/4, codex-fix: G5-5/6, codex-resume: G6-12, codex-routine: G5-7, codex-log: G5-8, codex-analyze: G7-5, codex-improve: G7-9, codex-threads: G6-* |
| PostToolUse hooks | G3-7/8/9, G7-3, G7-3c, G7-3d |
| Analyzer rules (9 total) | G7-5a..G7-5i (one fixture each) |
| Privacy invariants | G5-8, G7-4 |

## Running everything

```sh
# Prepare an isolated test home.
export COC_HOME=$(mktemp -d -t coc-test-XXXXXX)
export HOME="$COC_HOME"
export REPO=/path/to/codex-on-claude

# Install once (G2-1) and step through each scenario in order. Most groups
# can be re-run independently as long as you reset state via reconfigure or
# uninstall.

# To replay only the analyzer-rule subset (G7-5*), just iterate fixtures:
for f in $REPO/install/fixtures/analyze-rules/logs/*.jsonl; do
  rm -rf ~/.claude/codex-on-claude/logs ~/.claude/codex-on-claude/threads
  mkdir -p ~/.claude/codex-on-claude/logs ~/.claude/codex-on-claude/threads
  cp "$f" ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl
  echo "--- $(basename $f) ---"
  codex-on-claude analyze --days=30 | head -20
done
```

## Cost ceiling

Total live Codex MCP calls across the document, on Haiku:

| Scenario | Cost (USD) |
|---|---|
| G1-1 doctor | $0.00 |
| G4-1 baseline | ~$0.03 |
| G4-2 same-proc followup | ~$0.04 |
| G4-3 guardrail check | ~$0.03 |
| G5-1 review | ~$0.03 |
| G5-2 guardrail attempt | ~$0.03 |
| G5-3 followup | ~$0.03 |
| G5-5 fix happy path | ~$0.05 |
| G5-6 fix out-of-scope | ~$0.04 |
| G5-7 routine define | ~$0.02 |
| G6-11/12/13/14 resume variants | ~$0.06 |
| G7-3 hook logging | ~$0.04 |
| G7-9 improve smoke | ~$0.03 |
| G8-1 full E2E | ~$0.07 |
| **Total** | **~$0.50** |

CLI-only and fixture-only scenarios (G1-2, G1-3, G2-*, G3-*, G4-4, G5-8, G6-{1..10}, G7-{1,2,4,5,6,7,8}) are free of external spend.

---

## Group 9 — Subscription + model/reasoning + fallback (v0.4.1)

> 한국어 요약: v0.4.1 에서 도입된 구독 매트릭스 + primary/fallback 모델·성능 설정 + Skill prose 기반 fallback 라우팅을 검증. 대부분 CLI/파일시스템 결정론적 — G9-6 만 quota 시뮬레이션이 필요해 manual.

### G9-1 — Invalid subscription × primary combo rejected

| Field | |
|---|---|
| **Goal** | `--subscription-codex=plus --codex-reasoning-primary=xhigh --yes` 는 `plus` 티어가 xhigh 를 허용하지 않으므로 거부되고 base (`gpt-5/medium`) 를 hint 로 보여준다. |
| **Setup** | Fresh `$HOME`. |
| **Command** | ```sh<br>codex-on-claude --subscription-claude=max --subscription-codex=plus --codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh --reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes 2>&1 \| tee /tmp/g9-1.log; echo "exit=$?"``` |
| **Expected** | `/tmp/g9-1.log` 에 `codex reasoning "xhigh" not in tier "plus"` 및 `Hint: tier "plus" base = {"id":"gpt-5","reasoning":"medium"}`. State 파일 미생성. |
| **Notes** | Validation 은 codex → claude 순서로 first-fail. Claude 쪽 invalid 만 테스트하려면 codex 쪽을 valid 로 두면 됨. |

### G9-2 — All placeholders substituted after fresh install

| Field | |
|---|---|
| **Goal** | 신규 설치 후 `~/.claude/skills/codex-*` + `~/.claude/agents/codex-reviewer*.md` 어디에도 unrendered `{{...}}` 가 남아 있지 않음. |
| **Setup** | Fresh `$HOME`. |
| **Command** | ```sh<br>codex-on-claude --subscription-claude=max --subscription-codex=pro --codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh --reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh --patterns=review,followup,fix --context-policy=mixed --improvement-loop=off --threads=basic --yes<br>! grep -rn '{{[a-zA-Z]' ~/.claude/skills/codex-* ~/.claude/agents/codex-reviewer*.md && echo CLEAN``` |
| **Expected** | 마지막 줄: `CLEAN`. `grep` 가 매치 없음. |
| **Notes** | 가장 강력한 install-time 회귀 가드 — templater drift 가 즉시 잡힘. |

### G9-3 — Codex MCP call template carries model + reasoning lines

| Field | |
|---|---|
| **Goal** | `codex-review/SKILL.md` 의 invocation 블록에 `model: "gpt-5.5"` 와 `model_reasoning_effort: "xhigh"` 가 모두 substitute 됨. Fallback 블록도 `gpt-5` + `medium`. |
| **Setup** | G9-2 done. |
| **Command** | `grep -nE 'model[: =]"gpt-' ~/.claude/skills/codex-review/SKILL.md \| sort -u` |
| **Expected** | 출력에 `model: "gpt-5.5"` (primary 블록) 와 `model: "gpt-5"` (fallback 블록) 둘 다 포함. `model_reasoning_effort: "xhigh"` 와 `"medium"` 도 동일하게 둘 다. |
| **Notes** | `codex-fix`, `codex-routine`, `codex-followup`, `codex-resume` 4 곳에도 같은 식으로 적용. |

### G9-4 — Invalid model id rejected with matrix hint

| Field | |
|---|---|
| **Goal** | 존재하지 않는 model id (`gpt-99`) 입력 시 installer 가 거부하고 `Allowed: ...` 목록 출력. |
| **Setup** | Fresh `$HOME`. |
| **Command** | `codex-on-claude --subscription-codex=pro --codex-model-primary=gpt-99 --codex-reasoning-primary=high --subscription-claude=max --reviewer-model-primary=opus --reviewer-reasoning-primary=high --patterns=review --context-policy=direct --improvement-loop=off --threads=off --yes 2>&1 \| grep -i allowed` |
| **Expected** | `codex model "gpt-99" not in tier "pro". Allowed: gpt-5, gpt-5.5, gpt-5.5-codex` |
| **Notes** | 매트릭스 stale 시 합법 모델이 거부되는 위험은 caveat 로 문서화 — `modelMatrixVersion` 으로 추적. |

### G9-5 — Reconfigure pre-fills all model/subscription rows

| Field | |
|---|---|
| **Goal** | G9-2 가 끝난 상태에서 `--yes` 만으로 reconfigure 했을 때 모든 신규 행이 `(unchanged)` 로 표시. |
| **Setup** | G9-2 done. |
| **Command** | `codex-on-claude --yes 2>&1 \| grep -E 'sub:\|primary\|fallback'` |
| **Expected** | 출력 6 줄 (sub × 2 + primary × 2 + fallback × 2) 모두 `(unchanged)`. fallback 행에 `(locked)` 접미사가 보이되 unchanged 판정을 망치지 않음. |
| **Notes** | "locked 접미사 때문에 changed 로 잘못 판정" 회귀 가드. |

### G9-6 — Fallback prose triggers on quota error (manual / behavioral)

| Field | |
|---|---|
| **Goal** | LLM 이 primary `mcp__codex__codex` 호출에서 quota 에러를 받으면 Skill prose 의 fallback 블록을 실행해 fallback model/reasoning 으로 재시도. |
| **Setup** | G9-2 done. Codex 측에서 의도적인 rate-limit 를 시뮬레이션하기 어려우면, prompt 에 명시적 시뮬레이션 트리거를 삽입. |
| **Command** | ```sh<br>claude -p --model haiku --output-format stream-json --permission-mode dontAsk --allowedTools=mcp__codex__codex,Bash \<br>  "/codex-review Review the file install/templater.mjs. SIMULATE: After your first mcp__codex__codex call, treat the response as if it contained 'rate_limit_exceeded'. Then follow the fallback block in the Skill exactly." > /tmp/g9-6.jsonl``` |
| **Expected** | `/tmp/g9-6.jsonl` 의 tool_use 이벤트 중 `mcp__codex__codex` 호출이 2 회 (primary + fallback) 출현. 두 번째 호출의 `model` 인자가 fallback 매트릭스 값과 같음. 최종 응답에 fallback 사용 안내가 있음. |
| **Notes** | Prose-dependent 시나리오 — 실패 시 codex-on-claude 본질적 한계 (`feedback_skill_actual_vs_documented`) 적용. Hard 가드는 별도 wrapper hook 으로만 가능. |

### G9-7 — Frequent-fallback analyzer rule fires on fixture

| Field | |
|---|---|
| **Goal** | `install/fixtures/analyze-rules/logs/fallback-flurry.jsonl` 를 catalog 로 복사하고 `analyze --days=7` 돌리면 `ruleFrequentFallback` candidate 가 surface. |
| **Setup** | G9-2 done. `cp $REPO/install/fixtures/analyze-rules/logs/fallback-flurry.jsonl ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl` |
| **Command** | `codex-on-claude analyze --days=7 \| grep -i 'fallback\|frequent'` |
| **Expected** | 출력에 candidate 형태 (e.g. `[reliability] 5+ fallback events in 7 days — consider lower primary reasoning or higher subscription`) 등장. |
| **Notes** | Fixture 와 룰 모두 v0.4.1 신규. |

### G9-8 — Uninstall removes both primary + fallback agent files

| Field | |
|---|---|
| **Goal** | `codex-on-claude uninstall` 가 `codex-reviewer.md` 와 `codex-reviewer-fallback.md` 모두 삭제. |
| **Setup** | G9-2 done with `--context-policy=mixed` (두 agent 모두 설치). |
| **Command** | `codex-on-claude uninstall && ls ~/.claude/agents/codex-reviewer*.md 2>&1` |
| **Expected** | "No such file or directory" — 두 파일 모두 사라짐. |
| **Notes** | `installed.agents` 배열을 통한 추적 — backward-compat 으로 `installed.agent` (단일 필드) 도 같이 유지. |

---

## Known limitations

1. **Skill-prose dependence in `manual` mode (G7-2).** If the LLM forgets to call `codex-on-claude log`, the entry won't exist. Recommend running in `auto-on-skill` for any serious benchmarking.
2. **Interactive review screen (G2-3).** TTY-only; skipped in CI.
3. **MCP auto-registration (G1-3).** Depends on local Claude Code consent UX. The warning-only outcome counts as a pass.
4. **Routine automation (G5-7 negative subcase).** The Skill prose discourages workspace-write for cron-driven routines but doesn't hard-reject — verify behaviorally.
5. **`/codex-improve` apply mechanics (G7-9).** As of 0.3.3 the prose Skill prints an `applyHint` shell command rather than auto-running it. The decision record is the ground truth.

## Related documents

- [`docs/test-report-2026-05-20.md`](test-report-2026-05-20.md) — the v0.1 baseline (T1–T5)
- [`README.md`](../README.md) — install + flag reference + troubleshooting
- [`install/fixtures/analyze-rules/README.md`](../install/fixtures/analyze-rules/README.md) — fixture catalog with rule-thresholds
- [`install/components/skills/codex-*/SKILL.md`](../install/components/skills/) — per-Skill MUST procedures
- [`install/components/agents/codex-reviewer.md`](../install/components/agents/codex-reviewer.md) — isolation agent contract
