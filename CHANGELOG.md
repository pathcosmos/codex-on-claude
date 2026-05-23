# Changelog

All notable changes to `codex-on-claude` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.5] — 2026-05-23

### Added — `docs/cerberus-v0.5.4-plan.md` Phase 2 bundle (4 items)

v0.5.4 patch 후 backlog 로 분리되었던 MEDIUM #1 + MEDIUM #3 + LOW + HU-33 plan-level test 를 하나의 minor release 로 묶음.

- **MEDIUM #1 — decision multiplier soft-curve** (`install/cerberus-consensus.mjs:539`). 새 `DEFAULTS.decisionPartialMultiplier = 1.2` 추가 + `decisionCase2` flag tracking + `decisionCase1 ? 1.5 : (decisionCase2 ? 1.2 : 1.0)` branch. **결과**: case-2 decision (3 head 가 같은 decision topic 에 voiced 했으나 verdict 갈림) 이 더 이상 binary cliff 로 multiplier 1.0 까지 떨어지지 않음. PoC 시점 0.43 / Step 6 real spawn 0.17 처럼 paraphrase × 3-way split 곱셈으로 붕괴하던 score band 가 partial agreement 신호를 반영. `consensus()` API 의 `decisionPartialMultiplier` option override 도 가능 (per-machine 튜닝).
- **MEDIUM #3 — contrast conjunction polarity** (`install/cerberus-consensus.mjs:39`). 새 `CONTRAST_NEGATION_RE = /\b(but|however|although|despite|except)\s+(?!(?:also|additionally|even|too)\b)\w+/i` 도입, `detectPolarity()` 가 NEGATION_RE 미매칭 시 추가 검사. **양립 표현 false-positive 가드**: `"X but also Y"`, `"X but additionally Y"`, `"X but even Y"`, `"X but too Y"` 는 polarity '+' 유지. **결과**: pre-v0.5.5 에서 run-md3 (e8c149) 가 5/5 conjunction 모두 polarity miss → 4/5 caveat 가 consensus_plan 에서 완전 누락되던 패턴 차단. h2 의 caveat content 가 dissent 또는 conservative-include 경로로 살아남음.
- **LOW — `choices.cerberusConfig: {}` seed + server reader fix** (`install/cerberus-config.mjs` 신규 + `install/install.mjs:1780` + `install/cerberus-server.mjs:56`). pre-v0.5.5 의 `cerberus-server.mjs:loadConfig()` 가 `cfg?.choices?.cerberus` (enum "on"/"off") 를 객체로 패턴 매칭하여 fallback 객체 literal 이 unreachable 했던 **dead path** 함께 fix. 신규 `seedCerberusConfig()` 가 install/reconfigure 시 `cerberus=on` 이면 `choices.cerberusConfig` 를 빈 객체 (`{}`) 로 seed (기존 값 nullish coalescing 보존). 신규 `consensusOptsFromConfig()` 가 cerberusConfig 의 numeric/object 필드만 추출하여 `runConsensus()` options 로 전달 (undefined 가 DEFAULTS 를 override 하지 않도록 정의된 필드만 emit). schema: `{ headWeights, jaccardGroupThreshold, bodyMergeThreshold, decisionMultiplier, decisionPartialMultiplier, costCapTokens }`. 사용자가 `~/.claude/codex-on-claude/config.json` 에서 직접 편집.
- **HU-33 plan-level lock-in** (`cerberus-stemming-adversarial.test.mjs:A22`). Porter Stemmer 의 21쌍 stem collision (general/generic, organize/organic, business/busy) 이 실 plan 환경에서 case-1/3 false-merge 를 유발하지 않음을 plan-level 에서 lock. 알고리즘 fix 는 v0.5.3 polarity + body Jaccard gate; 본 test 는 회귀 가드.

### Changed

- **`manifest.json:version`** + **`package.json:version`** → 0.5.5.
- **`cerberus-server.mjs:runCerberusServer`** MCP advertised version → 0.5.5.
- **`package.json:files`** allowlist 에 `install/cerberus-config.mjs` 추가.
- **2 기존 fixture 0.5.5 갱신**: `manifest-schema.test.mjs`, `installer-flow/10-drift-guard.sh` (v0.5.4 → 0.5.5 literal). `atomic-write.test.mjs`는 동적 참조라 변경 불요.
- **신규 단위 테스트 26건**:
  - `cerberus-config.test.mjs` (12): I7a~d seedCerberusConfig + I8a~h consensusOptsFromConfig / costCapFromConfig.
  - `cerberus-v053-fixes.test.mjs` F5a~h (8): contrast conjunction polarity + false-positive guards + e2e caveat 생존 회귀 가드.
  - `cerberus-score-formula.test.mjs` SF6~SF10 (5): case-1/case-2/case-4 decision multiplier matrix + caller option override.
  - `cerberus-stemming-adversarial.test.mjs` A22 (1): plan-level HU-33 lock.
- **1 기존 테스트 expectation 갱신**: `cerberus-consensus.test.mjs:T2b` — case-2 decision multiplier 기대치 1.0 → 1.2 (의도된 behavior change, MEDIUM #1).
- **README.md / README.ko.md Cerberus 섹션 evolution table v0.5.5 row 추가**.

### Test verification

- **cerberus 단위 102 / 102 PASS** (v0.5.4 76 + I7/I8 12 + A22 1 + F5 8 + SF6~10 5). 회귀 0건.
- MEDIUM #1 시뮬레이션: 8개 보유 run 중 case-2 decision 발화한 run 부재 (모두 byte-identical decision 또는 완전 분리) → 합성 fixture (SF7) 로 회귀 검증. 실 plan 영향 측정은 새 hands-on Step 6 재실행 시 가시화 예정.
- 사용자 액션: 새 Claude Code 세션 재시작 후 `/cerberus head "<task>"` 호출 시 (a) `agreement_score` 가 paraphrase-heavy case-2 decision 케이스에서 +0.04~+0.10 정도 상승, (b) caveat 표현이 더 자주 consensus_plan 에 남음, (c) `~/.claude/codex-on-claude/config.json` 의 `choices.cerberusConfig` 가 빈 객체로 seed 되어 있음 — 셋 모두 확인 가능.

### Backlog (v0.5.6+)

- Cerberus Full 모드 (FU-01~10, FC-02~05 14건) 여전히 PENDING-IMPL. v0.5.6+ minor release 후보.
- Embedding-based similarity (Porter Stemmer 한계 보완) — opt-in LLM-judge 경로. v0.5.6+.
- `bodyLenScore` 곡선 평탄 (h1 단독 finding, v0.5.3 backlog) — 100~2000자 구간 가중치 재설계.
- multi-language stemmer (한국어/일본어). 현재는 empty-token guard 로 false-merge 만 차단.

## [0.5.4] — 2026-05-23

### Fixed — MEDIUM #2 (재검증 후 surfaced)

v0.5.3 + Opus 4.7 재검증 (`docs/test-execution-results-cerberus-v0.5.3-opus47.md`) 에서 발견된 case-4 disputed 렌더 버그 1줄 패치.

- **MEDIUM #2 — `*(lost to ?)*` 렌더링 정정** (`install/cerberus-consensus.mjs:608`). `classifyCase4()` 가 case-4 step/decision 을 `dissent.disputed` 로 push 할 때 `lostTo` 미설정 → 렌더러가 fallback `"?"` 출력. 4개 run (HU-31 2건, MD2-step 1건, Step 6 real spawn 2건, Step 3 1건) 에서 6건 관찰. v0.5.4 부터 `*(disputed — opposing polarity)*` 출력 — polarity guard 가 분리한 case 임을 명시.

### Changed

- **`manifest.json:version`** + **`package.json:version`** → 0.5.4.
- **`cerberus-server.mjs:runCerberusServer`** MCP advertised version → 0.5.4.
- **2 기존 fixture 0.5.4 갱신**: `manifest-schema.test.mjs`, `installer-flow/10-drift-guard.sh` (v0.5.3 → 0.5.4 literal). `atomic-write.test.mjs`는 동적 참조라 변경 불요.
- **신규 단위 테스트 1건** (`cerberus-v053-fixes.test.mjs:F3c`): 3-way Decision polarity-split fixture 로 `/\*\(lost to \?\)\*/` literal 출력 부재 + `*(disputed — opposing polarity)*` 출현 assert.
- **README.md / README.ko.md Cerberus 섹션 재작성** — 버전 라벨 v0.5.1 → v0.5.4, 알고리즘 동작 요약 (Porter Stemmer + polarity + 4 case 분류), v0.5.1→v0.5.4 진화 표, 76 test 커버리지, v0.5.5 backlog 링크. 두 README 모두 동일 정보.

### Test verification

- **cerberus 단위 76 / 76 PASS** (기존 75 + F3c 1건). 회귀 0건.
- MEDIUM #1 (decision multiplier binary cliff) + MEDIUM #3 (contrast conjunction polarity) 는 본 patch 에서 미수정 — `docs/cerberus-v0.5.4-plan.md` Phase 2 로 분리 (v0.5.5 후속).

### Backlog (v0.5.5)

- MEDIUM #1: case-2 decision 도 partial multiplier (1.2x). decision split 시 score cliff 완화. ~2시간 시뮬레이션 + 패치.
- MEDIUM #3: contrast conjunction (`but/however/although/despite/except`) second-clause negation 정규식 + 양립 예외 (`but also`). ~30분.
- LOW: `choices.cerberusConfig: {}` install/reconfigure 시 seed. ~5분.
- HU-33 plan-level test (h3 plan 권고). ~15분.

## [0.5.3] — 2026-05-23

### Added — Cerberus n=2 self-review에서 surfacing된 4 critical fix

v0.5.2 ship 직후 cerberus head 모드로 **자기 자신의 `cerberus-consensus.mjs` 코드를 검증**(메타 검증 4회차 누적) → critical 4건 + medium 5건 식별. 본 patch는 critical 4건 즉시 fix.

- **Polarity flag (Fix #1)** — `STOPWORDS`에서 `"not"` 제거. 각 topic에 `polarity: "+"|"-"` 추적 (`detectPolarity()` 신규 export). `groupByJaccard`가 동일 polarity 토픽만 그룹핑. **결과**: `"use cache"` (+) 와 `"do not use cache"` (-) 가 더 이상 case-1/3 merge 안 됨 → 정반대 의견이 합의로 잘못 분류되던 critical bug 해소.
- **Empty-token guard (Fix #2)** — `groupByJaccard`가 `anchor=[] && key=[]` 인 그룹에 매칭할 때 `kindHint==="decision"` 인 경우만 허용. Decision A/B/C 단일 글자 케이스는 유지하면서 **한국어 / 짧은 라벨 / 비-ASCII bullet의 false-merge** 차단.
- **Dissent render (Fix #3)** — `dissent.minority` 섹션이 누락되었던 부분 추가 렌더링, `disputed`의 `lostTo` 미지정 시 `"?"` fallback (`"lost to undefined"` 출력 방지). minority/disputed 구분 가시화.
- **Porter Stemmer `isV(s, -1)` base case (Fix #4)** — `i < 0` 명시 `return false`. Porter 규약 그대로 leading `y`(예: `yellow`, `young`)를 자음으로 처리. 이전엔 `VOWELS.has(undefined) === false` 우회 동작으로 동일 결과였으나 의도가 명시되지 않아 mis-port 위험. 명시화.
- **신규 단위 테스트 10건** (`cerberus-v053-fixes.test.mjs`): F1a~F4b + F-INT 통합. polarity/empty-token/render/leading-y 회귀 가드.

### Changed

- **`manifest.json:version`** + **`package.json:version`** → 0.5.3.
- **`cerberus-server.mjs:runCerberusServer`** MCP advertised version → 0.5.3.
- **`docs/cerberus-mode-spec.md`** Draft 5 — §3.2 polarity tracking 명시, §3.3 case 분기에 polarity 동등 조건 추가, §3.1 dissent buckets 4종 모두 렌더링 명시.
- **2 기존 fixture 0.5.3 갱신**: `manifest-schema.test.mjs`, `installer-flow/10-drift-guard.sh`. `atomic-write.test.mjs`는 동적 참조라 변경 불요.

### Test verification

- **Automated test cases: 248 / 248 PASS** (183 unit + 41 integration + 17 installer-flow + 7 regression). v0.5.2 238 → +10 (v053-fixes.test.mjs). 회귀 0건.
- **cerberus 단위 71 / 71 PASS** (consensus 14 + install 12 + stemming 14 + stemming-adversarial 6 + nonce 10 + score-formula 5 + v053-fixes 10 = 71).
- **메타 검증 5회차 예정** (별도 task): v0.5.3 코드로 self-review 한 번 더 → polarity/empty-guard 효과 가시화.

### Known limitations remaining (v0.5.4+ backlog)

- **Porter Stemmer over-stemming** — 21 known collision pairs (`general/generic/generation`, `business/busy`, `news/new` 등) 그대로. v0.5.4에서 embedding-based similarity 평가.
- **Step 4 `ion` rule** 통제 부정확 (h3 단독 발견, medium): `divisional` → `divis` 가능성. 후속 patch.
- **`bodyLenScore` 곡선 평탄** (h1 단독 발견, low): 100~2000자 모두 0.2~0.33 — 신호 약함. v0.5.4 검토.
- **`groupByJaccard` anchor 미갱신** (h1 발견, medium): terse h1 anchor + 풍부한 후속 plan의 mis-grouping 가능성. 후속.
- **Negation scope** (h1+h3 발견, medium): `hasNegationFor`가 body 전체 스캔 — sentence-local window로 좁힐 것. v0.5.4.

## [0.5.2] — 2026-05-23

### Added — Cerberus 3 구조적 약점 보강

v0.5.1 ship 직후 self-critique로 식별된 3 구조적 약점 — 실세션 e2e 검증 부재, SKILL.md prose 의존성, 합의 알고리즘 의역 취약 — 을 한 번에 보강. 0.5.1 → 0.5.2 patch.

- **Porter Stemmer (pure JS)** — `install/cerberus-consensus.mjs:stem()` 신규 export. ~80줄 자체 구현, 의존성 0, tarball +3KB. `normalizeTokens()`가 토큰 정제 후 stemming 적용 → 의역(`deterministic / deterministically`)이 같은 어근으로 정규화 → Jaccard 매칭 가능. 옵션 `{stem: false}` 로 비활성화 (자동화 dual coverage).
- **nonce challenge (init + consensus contract)** — `mcp__cerberus__init` 응답에 `validation_nonces: {h1, h2, h3}` (각 6-hex) + `nonce_instruction` 추가. 각 head_prompt 끝에 `cerberus-nonce: <value>` 명령 자동 삽입. `mcp__cerberus__consensus`는 각 plan 끝줄에서 nonce 추출 후 검증 — mismatch 1개라도 있으면 명시적 reject. `force: true` 인자로 test/admin 우회 가능. **Skill이 1 head만 spawn하거나 fake plan을 만들어도 백엔드가 즉시 catch.**
- **case 4 conservative partial credit (agreement_score 공식 보정)** — case 4 risk/reason은 consensus_plan에 채택되므로 case 3와 동등한 0.3 weight 부여. v0.5.1까지 0 가중치로 점수가 비현실적으로 낮았던 문제(PoC 0.43, self-review 0.03) 해소. self-review 재실행 결과: **0.03 low → 0.42 moderate (13배 개선)**.
- **`install/cerberus-server.mjs:extractNonce()`** — pure-function nonce 추출, 자동화 검증 export.
- **`install/fixtures/v05/integration/cerberus-end-to-end.test.mjs`** — MCP stdio 실 booting + 5 tools end-to-end 검증 (4 test). 사용자가 다음 세션에서 직접 `/cerberus head` 트리거하기 전 백엔드 contract 보장.
- **`docs/cerberus-session-restart-checklist.md`** — 사용자 hands-on 8단계 체크리스트 (5분 소요). Claude Code 세션 재시작 후 실세션 e2e 검증.
- **3 신규 자동화 단위 테스트** — `cerberus-stemming.test.mjs` (14), `cerberus-nonce.test.mjs` (10), `cerberus-score-formula.test.mjs` (5).

### Changed

- **`manifest.json:version`** + **`package.json:version`** — 0.5.1 → 0.5.2.
- **`install/cerberus-server.mjs:headPrompts()`** — 시그니처에 `nonces` 인자 추가, 각 head prompt 끝에 nonce 명령 자동 삽입.
- **`install/cerberus-server.mjs:toolInit`** — `nonces` 발급 + `plan.json:nonces` 영속화 + 응답에 `validation_nonces` / `nonce_instruction` 노출.
- **`install/cerberus-server.mjs:toolConsensus`** — nonce 검증 진입점 추가, 시그니처에 `force` 옵션.
- **`install/components/skills/codex-cerberus/SKILL.md`** — nonce 보존 명령 + "Do not strip nonce" 가드 추가.
- **`docs/cerberus-mode-spec.md`** — Draft 3 → Draft 4. §2.1 init 응답 + §2.2 consensus 입력에 nonce 필드, §3.2 Porter Stemmer 명시, §3.4 case4Conservative 공식 갱신.
- **3 기존 fixture를 0.5.2로 갱신**: `manifest-schema.test.mjs`, `installer-flow/10-drift-guard.sh`. `atomic-write.test.mjs`는 manifest.version 동적 참조라 변경 없음.

### Test verification

- **Automated test cases: 232 / 232 PASS** (167 unit + 41 integration + 17 installer-flow + 7 regression). v0.5.1 199 → +33 (29 unit + 4 integration). 회귀 0건.
- **메타 self-review 재실행** (`docs/test-execution-results-cerberus-v0.5.2.md`) — v0.5.1 self-review 입력을 v0.5.2 알고리즘에 재투입: score 0.03 low → **0.42 moderate** (13×), 그룹 47 → 10 (-78% stemming 효과).
- **e2e MCP stdio**: 4 test 시나리오 모두 PASS (initialize → tools/list → init → consensus + nonce verify + force bypass).

### Known limitations remaining (v0.5.3+ backlog)

- 사용자 hands-on 체크리스트 (`docs/cerberus-session-restart-checklist.md`) 8단계 — 사용자가 Claude Code 세션 재시작 후 직접 실행 필요. 자동화 4건은 PASS.
- "verbatim present" 강제는 여전히 prose — Skill이 consensus_plan을 변형해서 사용자에게 전달할 가능성 ε > 0. v0.5.3에서 presentation_checksum 평가.
- Embedding-based similarity 미도입 — Porter Stemmer는 어휘 변형만, 의미 변형(예: "fast" ↔ "speedy")은 여전히 분리. 단 stemming + case-4 partial credit으로 13× 개선 달성.
- Cerberus Full 모드(FU/FC PENDING-IMPL 15건) 여전히 미구현.

## [0.5.1] — 2026-05-22

### Added — Cerberus Head mode (multi-head planning consensus)

- **`/cerberus head "<task>"`** — opt-in 3-head planning consensus. Spawns three independent planners (Claude-only, Codex-only, Claude+Codex synergy) in parallel, then merges via a deterministic consensus algorithm. Plan-only — execute/verify Full mode deferred to a later release. Spec: `docs/cerberus-mode-spec.md`. PoC report: `docs/cerberus-poc-2026-05-22.md`.
- **New MCP server `cerberus`** — registered automatically when cerberus opt-in is enabled (`claude mcp add --scope user cerberus -- codex-on-claude mcp-server cerberus`). Built on `@modelcontextprotocol/sdk` (^1.29.0). 5 tools exposed: `init / consensus / status / list / inspect`.
- **New Skill `codex-cerberus`** — single SKILL.md as the entry-point alias; orchestration logic lives in the MCP server, not in prose (intentional — prevents the SKILL-prose-as-policy regression noted in memory).
- **3 new Agents** — `cerberus-h1-claude-only` (no codex MCP), `cerberus-h2-codex-only` (codex MCP only, no Bash/Edit/Write), `cerberus-h3-synergy` (R1-R6 synergy pattern). Frontmatter `tools` allowlists enforce head isolation.
- **New install/reconfigure option `cerberus: on|off`** — single-select question with silent `off` default for upgrades. Both interactive (§6 of the wizard) and `--cerberus=on|off` flag supported. Status output shows current state. Off → on transition: Skill + 3 agents + cerberus MCP automatically installed/registered. On → off: Skill + 3 agents removed; cerberus MCP left intact with an explicit warn ("`claude mcp remove cerberus -s user`") so cross-project usage isn't disrupted.
- **New consensus algorithm module `install/cerberus-consensus.mjs`** — pure-function "Merge non-conflict + Tournament on conflicts". 5 cases: case 1 (3 heads agree, merged), case 2 (3 heads, body-similarity tournament), case 3 (2-head agreement, missing head noted), case 4 (single-head, risk/reason conservatively included, step/decision routed to validated/disputed/minority dissent). Decision groups use exact body equality (Jaccard fails on single-char labels like "A"/"C"). Deterministic — same input → byte-identical `consensus_plan` markdown across runs.
- **Manifest `mcp` field is now an array.** Backward-compat: a single object is still accepted (normalized via the new `getMcpServers(manifest)` helper). `checkMcp` and `offerMcpRegister` iterate all servers; idempotent — already-registered servers are skipped.
- **Uninstall MCP warning is now dynamic.** Was hardcoded "codex" in v0.5.0 — now iterates `manifest.mcp[]` so cerberus (and any future servers) are listed.

### Changed

- **`manifest.json:version`** bumped to 0.5.1.
- **`package.json:version`** bumped to 0.5.1. `dependencies` now includes `@modelcontextprotocol/sdk@^1.29.0`. `files` allowlist adds `install/cerberus-consensus.mjs` + `install/cerberus-server.mjs`.
- **Review table + Apply summary + `codex-on-claude status`** all show `cerberus: on|off`.
- **3 hardcoded `0.5.0` fixtures updated** so that future patch bumps don't trigger phantom failures: `manifest-schema.test.mjs` (now expects 0.5.1), `atomic-write.test.mjs` (now reads manifest.version dynamically), `installer-flow/10-drift-guard.sh` (now uses 0.5.1).

### Test verification

- **Automated test cases: 199 / 199 PASS** (138 unit + 37 integration + 17 installer-flow + 7 regression). Up from 173/173 in v0.5.0 — +26 net cerberus tests (`cerberus-consensus.test.mjs`: 14, `cerberus-install.test.mjs`: 12). Zero regression in pre-cerberus suites.
- **End-to-end manual verification**: cerberus opt-in toggle (`off → on → off`) confirmed; cerberus MCP `claude mcp list` shows `✓ Connected`; smoke-tested MCP stdio JSON-RPC (`initialize`, `tools/list`, `tools/call init`, `tools/call list`) — all return well-formed responses; state directory `~/.claude/codex-on-claude/cerberus/runs/<run-id>/` created with `plan.json` + `events.jsonl` + `index.json`; `chmod 0700` applied via reused `writeJson()`.
- **PoC validation**: real 3-head spawn against a meta-task ("choose consensus algorithm A/B/C") returned 3 independent plans, all converging on (A). Manual application of the consensus algorithm caught a planning artifact (h1's reference to a stale external test harness path) in the `Dissent.invalid` bucket — algorithm filters demonstrably useful.

### Migration (existing users)

- **`config.json` migration is silent and conservative**: `npx codex-on-claude@latest` from v0.5.0 fills `choices.cerberus: "off"` without prompting (same pattern as `usageMode` migration in 0.5.0).
- **To enable Cerberus**: run `codex-on-claude reconfigure` (interactive) or `codex-on-claude reconfigure --cerberus=on --yes`. The installer will offer to register the cerberus MCP server on the next run.
- **To remove later**: `codex-on-claude reconfigure --cerberus=off --yes` then optionally `claude mcp remove cerberus -s user`.

### Known limitations

- **Cerberus Full mode** (Execute + Verify with consensus, with re-plan iteration) — deferred. `scope: "full"` is reserved in spec/CLI but raises an explicit error in `mcp__cerberus__init`.
- **Headweights / cost cap interactive tuning** — non-interactive defaults only (`{h1:1.0, h2:1.0, h3:1.5}`, costCapTokens=50000). Power users may edit `~/.claude/codex-on-claude/config.json` directly.
- **Cerberus MCP auto-removal on cerberus=off** — currently warns the user with the manual `claude mcp remove cerberus -s user` command instead of auto-removing (intentional: a cerberus MCP server may be in use across multiple projects, and auto-remove on one project's `off` toggle would disrupt others).

## [0.5.0] — 2026-05-22

### Added — Usage-mode policy (largest UX change since 0.4.0)

- **4-mode taxonomy: `none / synergy / auto / max`** for Codex invocation policy. Users pick at install time and reconfigure freely. Each mode shapes Skill behavior + Codex call frequency:
  - `none` — Codex calls are blocked at a new **PreToolUse gate hook** (`hooks.mjs:installGate`). The gate denies `mcp__codex__codex` + `mcp__codex__codex-reply` with a structured reason string Claude Code displays.
  - `synergy` — Default. Follows the v9 Quick-Ref 3-Q decision tree + R1–R6 recipes (`docs/guidance-quick-ref.md`, `docs/synergy-playbook.md`).
  - `auto` — Tier 1 heuristic signal detection via `install/detect-signals.mjs`. When confidence < 0.7 AND `autoTier2LLMProbe` is `on`, escalates to a $0.01–0.02 Codex meta-classifier (`install/auto-probe.mjs`) for ambiguous tasks.
  - `max` — Quality-first bounded automation. R1 fires by default on review tasks; R5 always probes; γ hot-swap auto-fires on P5 catastrophe signals. **Hard DO-NOT rules (Chain-JSON Trap, Subagent-Strict, Turn Burn) still enforced** — max ≠ override.
- **New `--usage-mode` install flag** + matching interactive prompt (becomes question §7 in the install wizard). Accompanying `--auto-tier2-llm-probe=on|off` flag controls the Tier 2 probe (auto mode only).
- **New `install/detect-signals.mjs` module** — pure heuristic Tier 1 classifier. Null-safe, multi-format chain detection (numbered / lettered / first-then-finally / step variants), structured-output detection covers JSON / YAML / CSV / TS schema. Exports `detectSignals`, `applyDecisionTree`, `computeConfidence`. CLI entry point for ad-hoc invocation.
- **New `install/auto-probe.mjs` module** — Tier 2 LLM probe. Wraps `codex exec --sandbox=read-only --json` with a meta-classification prompt; logs every probe to `~/.claude/codex-on-claude/logs/auto-probe.jsonl` (event, latency, classification). Fails open when Codex CLI is missing.
- **New `codex-on-claude gate --from-stdin` sub-command** — PreToolUse hook handler. Reads Claude Code's hook payload, consults `config.json`'s `usageMode`, and writes a `{decision, reason}` JSON block to stdout when calls must be blocked. Pure `decideGate(payload, config)` function exported for unit testing.
- **New analyzer rule `ruleUsageModeDrift`** (`install/analyze.mjs`) — detects when `config.usageMode` is incoherent with observed runtime behavior (e.g. `none` + logged Codex calls = stale binary / hook missing; `max` + zero calls in window = idle).
- **New `guardrails` config block** — `chainJsonTrap`, `subagentStrict`, `turnBurn`, `ceilingNoUpside` defaults enforced even in `max` mode. Surfaced to Skill prose as `{{guardrail*}}` template placeholders.
- **R6 Format-Safe Handoff recipe** added across all guidance/Skill docs — when a task needs both adversarial review AND strict structured output, Codex emits prose (R1 framing) and Claude does format normalization. Sidesteps the P5 Chain-JSON Trap without losing R1's +6~+30pp lift.

### Changed

- **Skill prose is mode-aware.** All 9 SKILL.md files (`codex-review`, `codex-followup`, `codex-resume`, `codex-fix`, `codex-routine`, `codex-analyze`, `codex-improve`, `codex-log`, `codex-threads`) and both reviewer agents now begin with a compact `## Usage mode (v0.5.0)` section that branches on `{{usageMode}}`. `codex-log` and `codex-threads` (and the catalog half of `codex-threads`) remain allowed in `none` mode because they operate on local files only.
- **`buildModelVars()` in `install.mjs`** now emits `usageMode`, `modeBehavior`, `autoTier2LLMProbe`, and 4 `guardrail*` placeholders to the templater so the Skill prose renders correctly.
- **manifest.json `questions`** expanded from 6 to 7 fields: `usageMode` (single-select × 4) + `autoTier2LLMProbe` (single-select × 2) + `guardrails` (info / non-configurable defaults).
- **Review table** in the install wizard shows two new rows: `usageMode` and `autoTier2`. The latter is suffixed `(auto-mode only)` when `usageMode ≠ auto`.
- **`codex-on-claude status`** now prints active `usageMode` + Tier 2 probe state + PreToolUse gate hook count.

### Migration (existing users)

- **`config.json` migration is silent and conservative.** When `npx codex-on-claude@latest` runs on an install that pre-dates 0.5.0 (no `usageMode` field), the installer fills `usageMode: "synergy"` and `autoTier2LLMProbe: true` **without prompting**. The current behavior is preserved (Codex calls work as before, R1–R5 recipes follow the v9 guidance). The new `## Usage mode` section in each SKILL.md gets rendered with the new defaults on the next reconfigure run.
- **To switch modes**, run `codex-on-claude reconfigure` (prompts §1–§7 surface) or `codex-on-claude reconfigure --usage-mode=max --yes`.
- **PreToolUse gate hook** is only installed when `usageMode === "none"`. Otherwise no new entries appear in `~/.claude/settings.json`.

### Final pre-ship review (5th Codex audit pass — A-series)

Even after 24 prior fixes (F1-F8, G1-G7, H1-H7, B1-B6, H1-H4 Bash-precision, M1-M3), a 5th Codex peer review caught 4 more issues. All applied before publish:

- **A1**: `cmdUninstall` now iterates `installed.agents[]` (v0.4.1+ array) not just legacy `installed.agent`. Previously the fallback reviewer agent (`codex-reviewer-fallback.md`) was orphaned on uninstall — left behind in `~/.claude/agents/` forever. Also: when state is missing, best-effort cleanup against manifest-known targets instead of silent skip. Backward-compat: legacy `installed.agent` singular field still honored.
- **A2**: `applyInstallation` now copies `detect-signals.mjs` + `auto-probe.mjs` into `~/.claude/codex-on-claude/install/`. SKILL.md auto-mode preamble references this path (`node ~/.claude/codex-on-claude/install/detect-signals.mjs`); without the copy, auto mode would be doc-on-arrival broken — Claude would try to invoke a nonexistent file. Tracked as `installed.helpers` in `config.json`. Idempotent — re-runs overwrite with current package version.
- **A3**: `writeJson` / `writeSettings` / `threads.writeJson` now wrap `fs.rename(tmp, target)` in try/catch + `fs.rm(tmp, {force:true})` on failure. Previously cross-FS rename or permission-denied rename would leak `*.tmp-PID-TS` files in user directories.
- **A4**: `docs/release-notes-0.5.0.md` corrected — gate hook description now reflects the actual installed matchers (`mcp__codex__.*` wildcard regex + `Bash` for CLI bypass) and the `--enforce-mode=none` baked-in flag. Was still describing the original two exact matchers from the initial v0.5.0 build.

### Final verification stats (post 5 Codex review cycles)

- **Automated test cases: 168 / 168 PASS** (112 unit + 37 integration + 17 installer-flow + 2 regression with 7 internal cases). Up from 100 in the initial v0.5.0 build.
- **npm tarball: 113 kB / 32 files** (down from initial 14.7 MB / 11,042 files — 99.2% size reduction via explicit `files` allowlist + `.npmignore`).
- **Total fixes applied to v0.5.0**: 28 (F1-F8 + G1-G7 + H1-H7 + B1-B6 + H1-H4 Bash + M1-M3 + A1-A4).
- **5 Codex peer review passes**: L6.1 (initial), L6.2 (adversarial), pre-ship audit (3 sub-agents + 1 Codex), final pre-ship Codex review. All findings resolved before publish.
- **Known limitations**: 1 only — in-flight Codex calls during mode toggle (Claude Code hook system limitation, not our defect).

### Pre-ship audit hardening (B/H/M-series — pass before final A-series)

After H1–H7 (every v0.5.1-deferred item) were implemented, a final pre-ship audit using 3 parallel sub-agents + Codex peer review surfaced 13 additional issues across npm packaging, code-level correctness, and doc drift. **All applied before publish**:

**Ship blockers (6) — all fixed**:
- **B1**: `install/auto-probe.mjs` + `install/detect-signals.mjs` (new v0.5.0 modules) explicitly listed in `package.json:files`. Without explicit listing they would have been omitted from the npm tarball, causing runtime ImportError on consumer installs.
- **B2**: `.npmignore` + explicit `files` allowlist. Tarball shrank from **14.7 MB / 11,042 files** to **113 kB / 32 files** (99% reduction). `install/fixtures/bench/` (53 MB of v1-v9 benchmark data) + `install/fixtures/v05/` (130+ test cases) + internal R&D docs (v5-v9 analysis, test-* logs, implementation-log) now excluded.
- **B3**: `cmdGate` no longer `process.exit(2)` after hard-deny. The previous behavior could (a) truncate stdout JSON because Node's stdout is async on non-TTY streams, and (b) violate Claude Code's "exit 0 with JSON decides" hook contract — making hosts ignore our deny entirely. Now: stderr backstop FIRST (synchronous), then stdout JSON, then natural exit 0. Updated 14 test assertions across hook-shape-dual + cmd-gate-fail-closed.
- **B4**: Bash gate catches shell-wrapper bypasses. `eval "codex exec ..."`, `sh -c '...'`, `bash -lc '...'`, `env CODEX_HOME=/tmp codex exec`, `exec codex exec`, backtick subshells, `$(codex exec)`, compound commands (`; codex`, `&& codex`, `|| codex`, `| codex`) all now correctly denied under `usageMode=none`. Codex L6.2 missed these — the audit caught them.
- **B5**: `uninstall` ALWAYS reconciles actual `~/.claude/settings.json` against our markers, regardless of `state.installed.gateHooks`. Previously a state drift (manual edit, prior version corruption) could leave orphan `--enforce-mode=none` PreToolUse hooks behind, permanently blocking Codex.
- **B6**: Doc drift fixed — `docs/security-review-0.5.0.md` no longer says "Deferred to v0.5.1" for attacks #4 and #5 (both implemented as H1 and H2). `docs/test-execution-results-0.5.0.md` test counts updated to reflect the 161-case suite.

**High-priority (4) — all fixed**:
- **H1 (Bash precision)**: Bash gate no longer false-positives on `grep codex README.md`, `echo "var codex = 1"`, `cat codex.md`, `find . -name "*codex*"`. The regex now requires `codex` to be at a COMMAND position (BOL, `;`, `&&`, `||`, `|`, backtick, `(`, `$(`), not in argument position.
- **H2 (readSettings)**: Malformed `~/.claude/settings.json` no longer silently treated as `{}` (which would clobber the user's entire settings on next write). Now throws with `SETTINGS_MALFORMED`; callers back up to `settings.json.corrupt-<timestamp>` and surface a stderr warning.
- **H3 (adversarial precision)**: "Find naming issues", "Find open issues in GitHub", "Find edge cases in spec" no longer trigger R1. A STRONG defect token (`security|bug|defect|race|injection|xss|xxe|vulnerability|contradiction|adversarial`) is now required alongside the find-pattern.
- **H4 (mergeClassification mode arg)**: `mergeClassification(tier1Result, classification, mode)` — Tier 2 LLM probe path now respects `mode=max` for chain-strict (routes to R4 γ hot-swap), matching Tier 1 (`applyDecisionTree`) behavior. Without this, max mode + ambiguous chain-strict prompts were silently routed to R6 via Tier 2 even though Tier 1 would have routed to R4.

**Medium polish (3) — all fixed**:
- **M1**: `STRICT_FIELD_LIST` threshold raised from ≥3 identifiers to ≥4 (3 commas) for fewer benign-prose false-positives. "Add fields: foo, bar to the response" no longer flags strict-output.
- **M2**: `threads.writeJson` + `auto-probe.logProbe` chmod parent dir to 0700 (best-effort). Previously only `applyInstallation`'s `ensureDir` did this, leaving a window where catalog files / probe logs were created with default umask on a fresh install.
- **M3**: `package.json:files` explicit enumeration (no more `install/` wildcard pulling in fixtures); removed unused `typescript` devDep; added `README.ko.md` to files. (`README.ko.md` was auto-included by npm anyway but the explicit listing makes intent clear.)

### v0.5.0 final hardening (H1–H7 — pre-ship implementation of every deferred item)

Before ship, every item originally deferred to v0.5.1 was implemented and verified against the same 129-test suite. The Known limitations list at the bottom of this entry is now empty for v0.5.0:

- **H1: Dual hook decision shape.** `cmdGate` now emits the legacy `{decision, reason}` AND the new `{hookSpecificOutput: {hookEventName, permissionDecision, permissionDecisionReason}}` shape so the gate works across Claude Code 2.1.x (legacy) and any future version that requires the new schema. Hard-denies (Codex-shaped tools) additionally write the reason to stderr and `process.exit(2)` as a backstop in case the host ignores the JSON output.
- **H2: Race-free gate + atomic state writes.** The gate hook command now embeds `--enforce-mode=none` directly so the gate decision never reads `config.json` (eliminating the sub-second toggle-race window between `settings.json` and `config.json` writes). `saveState`, `writeSettings`, and `threads.writeJson` all use `temp+rename` for atomic writes; concurrent readers never observe a torn JSON document.
- **H3: Gate state reconciliation.** `applyInstallation` now ALWAYS checks the actual `~/.claude/settings.json` PreToolUse state on every reconfigure, regardless of `installed.gateHooks` in `config.json`. Orphan gate entries from manual edits or stale state are cleaned up automatically.
- **H4: `detect-signals` "table" precision.** The word "table" alone no longer triggers `has_strict_output` — output-intent context (e.g. "format as a table", "return ... table") is required. Prevents false-positives on prompts like "inspect the routing table and explain packet loss".
- **H5: Adversarial preserved when mixed with style.** Prompts like "Find security bugs and naming issues" now correctly flag `has_adversarial_defect=true` (previously suppressed by the style-only filter). Policy: adversarial signal wins; pure style-only (no adversarial token) still excludes.
- **H6: Unquoted field-list detection.** Prompts like "Return exactly fields: status, risk, file, line" now flag `has_strict_output=true` via a new regex matching `fields:|keys:|columns:` followed by ≥3 comma-separated identifiers.
- **H7: State directories restricted to 0700.** All `~/.claude/codex-on-claude/{,logs,reports,improvements,threads}` directories are now chmod'd to user-only (0700) at install time. Best-effort: errors are swallowed for filesystems that ignore chmod (FAT/exFAT/network mounts).

### Hardened post-L6 review (G1-G7 quick-win fixes within v0.5.0)

After the L1–L6 verification cycle a second sweep applied 7 follow-up improvements to keep the release shipping-clean (all caught by the same verification suite — see `docs/test-execution-results-0.5.0.md`):

- **G1: CLI positional validation.** `--usage-mode max` (space-separated, a common user mistake) now errors with a helpful hint instead of silently dropping the value. Implementation: `main()` checks the positional arg against an explicit `KNOWN_SUBCOMMANDS` allowlist before falling through to install. Use `--usage-mode=max` (with `=`).
- **G2: Silent-fill info line is now reachable.** Upgrading users now see `usageMode: silent default "synergy" applied for upgrade` when codex-on-claude is auto-detected as a reconfigure (npx upgrade path). Previously this line was unreachable because `main()` always passed `reconfigure: true` for prior-state runs. Added `explicitReconfigure: true` only when the user invoked `coc reconfigure` directly; the §7 prompt now appears only for that explicit case, while npx auto-detected upgrades silently fill `synergy`.
- **G3: Log entries carry `usageMode`.** Every `usage-*.jsonl` row now includes the active `usageMode` field via `readUsageModeSafe()`, enabling per-call mode tracking and accurate `ruleUsageModeDrift` analysis. Both manual `coc log` and PostToolUse hook paths inject the field.
- **G4: Doc drift fixed.** Stale `--mode=manual` reference in `docs/usage-mode-config.md:120` replaced with the correct `--usage-mode=synergy|none` example.
- **G5: `detect-signals` TDD precision.** `edge cases` alone no longer triggers `has_tdd=true`. Only genuine TDD signals (`failing tests?`, `make tests? pass`, `tdd`) qualify. Prevents spurious R3 reasoning=high escalation on general review prompts.
- **G6: Code cleanup.** Removed the dead-code `stripOursFromGroups` helper in `install/hooks.mjs` (superseded by `stripOursFromGroupsByMarker(...)` with explicit MARKER parameter). Callers `install()` / `remove()` updated to the canonical form.
- **G7: `ruleUsageModeDrift` accuracy.** The analyzer rule now ignores log entries written before `config.updatedAt`, eliminating false-positives immediately after a mode switch (e.g. user toggles from `synergy` to `none`; yesterday's legitimate Codex calls no longer fire drift).

### Pre-ship security review (post-L6.2 hardening)

`docs/security-review-0.5.0.md` documents an adversarial Codex review of the `usageMode=none` gate. Three High-feasibility bypass attacks were found and **mitigated before release**:

- **Bash CLI bypass** — gate now intercepts `Bash` tool invocations and denies `codex exec` / `npx codex` / `codex-on-claude threads resume` commands (`install/hooks.mjs:decideGate` + `installGate`). Verified via `install/fixtures/v05/unit/decide-gate-extended.test.mjs`.
- **MCP tool-name variants** — gate matcher widened from two exact strings to the wildcard `mcp__codex__.*`; `decideGate` regex changed from `^mcp__codex__codex` to `^mcp__codex__` (covers future Codex MCP tools). Case-insensitive comparison closes the `MCP__CODEX__CODEX` bypass.
- **Fail-open state read** — `cmdGate` now fails CLOSED when the payload is malformed AND the tool looks Codex-shaped, or when `config.json` is unreadable AND the tool is Codex-shaped. Verified via `install/fixtures/v05/integration/cmd-gate-fail-closed.test.mjs`.

### Known limitations

- **Tier 2 LLM probe adds latency + cost.** Each invocation is ~$0.01–0.02 and 1–3s. Disable via `--auto-tier2-llm-probe=off` or by choosing `synergy` instead of `auto` mode.
- **Mode-aware Skill prose is best-effort.** The PreToolUse gate hook is the only hard enforcement layer (mode=none). Other guardrails (Chain-JSON Trap, Subagent-Strict, Turn Burn) live in Skill prose and depend on the LLM following the guidance. Codex peer review identified this gap; runtime enforcement of all guardrails would need a deeper hook integration (deferred).
- **`max` mode does NOT override hard DO-NOT rules.** Chain+strict prompts get routed to **R4 γ hot-swap** (Codex CLI direct, bypassing the MCP β orchestration). This is by design — the v6/v8 data showed -16~-83pp catastrophe risk for unprotected chain+strict. In `synergy`/`auto` modes the equivalent escape is **R6 Format-Safe Handoff** (Codex prose → Claude format).
- **Auto-probe budget is not capped.** The probe logs every call but doesn't track a session budget. A future release may add `--auto-probe-budget-usd` or per-day quota.
- **In-flight Codex calls during toggle.** When the user runs `reconfigure --usage-mode=none` while a Codex call is mid-flight, the in-flight call is not retroactively cancelled. The H2 race-free gate ensures subsequent calls see the new mode, but calls already past PreToolUse will complete. Restart Claude Code for hard guarantees.

## [0.4.1] — 2026-05-20

### Added — subscription-aware model/reasoning + automatic fallback (largest user-facing change since 0.3.0)

- **Subscription matrix + per-side model & reasoning pinning.** Install now asks for the user's Claude tier (`free / pro / max / team / enterprise`) and Codex tier (`free / plus / pro / team`), then constrains the **primary model + reasoning effort** choices to what each tier actually allows. The two sides are pinned independently — typical setup is `--reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh` for the Claude reviewer subagent plus `--codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh` for direct Codex calls. Reasoning vocabulary (`low / medium / high / xhigh / max`) is shared by both sides: Claude's native `--effort` flag and Codex's `model_reasoning_effort` config key. See README §5–§6 and `install/manifest.json:modelMatrix`.
- **Locked fallback per tier.** Each subscription tier has a `base` model + reasoning that becomes the fallback target. Fallback is automatically locked to that base (the installer warns and re-snaps if you try to override `--*-model-fallback=`). The lock prevents users from accidentally configuring a fallback that the subscription can't reach either.
- **Quota-aware runtime fallback.** When a Codex MCP call returns `rate_limit_exceeded` / `quota` / HTTP `429` / `usage_limit_reached`, the Skill prose retries **once** with the fallback model + reasoning, then logs the event with `outcome=fallback`, `errorKind=quota|rate_limit`. For the reviewer subagent route (`contextPolicy=summarize|mixed`), a sentinel line `CODEX_QUOTA_FALLBACK_NEEDED` from the primary agent triggers re-launch with the new `codex-reviewer-fallback` agent (`install/components/agents/codex-reviewer-fallback.md`). Direct `claude -p` callers use Claude's native `--fallback-model` flag.
- **New analyzer rule `ruleFrequentFallback`.** Surfaces a candidate when ≥5 fallback events are observed in the analyzed window, with recommendation to upgrade the subscription or lower primary reasoning. New deterministic fixture: `install/fixtures/analyze-rules/logs/fallback-flurry.jsonl`.
- **New `install/templater.mjs` module.** Tiny `{{dot.path}}` substitution applied to Skills / agents at install time. Unknown placeholders are left in place so drift surfaces visibly. The installer replaces the prior `copyTree` calls with `renderTree` / `renderFile` so the user's subscription + model choices flow into Skill MUST procedures and agent frontmatter.

### Added — installer UX

- 6 new CLI flags: `--subscription-claude`, `--subscription-codex`, `--codex-model-primary`, `--codex-reasoning-primary`, `--reviewer-model-primary`, `--reviewer-reasoning-primary`. Their fallback counterparts (`--*-fallback`) are accepted but locked to the matrix base.
- The review screen now shows 6 new rows (`sub: claude`, `sub: codex`, `codex primary`, `codex fallback`, `reviewer primary`, `reviewer fallback`). Locked fallback rows render `(locked)` as a suffix that doesn't affect the unchanged/changed comparison.
- `codex-on-claude status` prints the active subscription + primary/fallback model & reasoning for both sides.
- `codex-on-claude reconfigure` pre-fills all 6 new fields from prior state. Subscription downgrade auto-snaps the primary to the new tier's defaults rather than silently writing invalid state.
- `installed.agents` tracking added to state — primary AND fallback agent files are installed when `contextPolicy ∈ {summarize, mixed}`, and both are removed on uninstall. Backward-compat `installed.agent` (single) field preserved.

### Added — docs / test coverage

- New scenario group **G9** in `docs/test-scenarios-codex-calls.md` (8 scenarios): invalid combo rejection, placeholder-substitution gate, MCP-call-template content check, invalid model id with hint, reconfigure pre-fill, fallback prose simulation, analyzer rule on fixture, uninstall removes both agents.
- New companion doc `docs/test-claude-vs-codex-bench.md` — paired α (Claude-only) / β (Claude + codex-on-claude) benchmark harness, 12 scenarios, drives `claude -p --model haiku` subprocesses; harness lives at `install/fixtures/bench/`. Documents the subagent-model-pin caveat (§7 #11).
- README §5–§6 introduce subscription tiers + primary/fallback semantics and document the reasoning-effort vocabulary.

### Internal

- `manifest.json` adds `modelMatrix` + `modelMatrixVersion: "2026-05-20"` + `agentFallback` declaration.
- `installed.agent` retained for backward-compat readers; new code reads `installed.agents` (array) preferentially.
- All 5 user-facing Skills (codex-review / codex-fix / codex-routine / codex-followup / codex-resume) now contain `{{codexPrimaryModel}}` / `{{codexPrimaryReasoning}}` placeholders in their MCP call templates, plus a fallback retry block at the end. Followup and resume inherit the model from the originating thread but include fallback guidance when the thread becomes unrecoverable.
- New regression guard scenarios G9-2 / G9-3: any future `{{...}}` left unsubstituted by the installer or any missing `model=` line in the MCP-call template fails install-time verification.

### Known limitations

- **Subagent reasoning is best-effort prose only.** Claude Code subagent frontmatter doesn't support `reasoning` / `effort` fields (only `model`). The reviewer agent's prose mentions the chosen effort level so a session that can raise effort independently does so, but the installer can't enforce it.
- **Codex MCP doesn't auto-fallback.** The retry-on-quota behavior is encoded in Skill prose — an LLM that ignores the prose won't retry. A hard guarantee would need a wrapper hook around `mcp__codex__codex` calls (deferred).
- **`claude --fallback-model` only swaps model, not reasoning effort.** Native fallback can't carry a separate effort level.
- **`modelMatrix` drift.** Tier lineups shift over time. Stamped via `modelMatrixVersion`; the doctor command may grow a stale-warning in a future release.

## [0.3.5] — 2026-05-20

### Fixed (release-packaging bug from 0.3.4)

- **`npx --yes codex-on-claude@latest` looked like a no-op when upgrading from 0.3.3 → 0.3.4.** `install/manifest.json` was left at `"version": "0.3.3"` in the 0.3.4 release while `package.json` correctly read `"0.3.4"`. The installer reads `manifest.json` for the version it shows in the banner and writes to `~/.claude/codex-on-claude/state.json`, so even though npm delivered the 0.3.4 tarball, users saw `v0.3.3 (same version)` and `state.json` kept recording `"version": "0.3.3"` — the upgrade UX silently broke. Bumped `manifest.json` to match.
- **Added startup drift guard so this can't silently happen again.** `install.mjs:main` now loads `package.json` alongside `manifest.json`; if the two versions disagree it logs a `warn(...)` and uses `package.json` as the source of truth (it is what npm publishes against). Future releases that bump only `package.json` will self-heal the banner / state version and surface a visible warning instead of degrading quietly.

## [0.3.4] — 2026-05-20

### Fixed (production bug fixes — auto-on-skill / threads / hook safety)

- **`threadId` was always `null` in PostToolUse hook log entries.** Claude Code 2.1.x sends `tool_response` to PostToolUse hooks as a **JSON-encoded string**, not a parsed object. The previous `extractFromHookPayload` (install.mjs:799-853) read `response.threadId` directly and the regex fallback couldn't match doubly-escaped quotes, so every `usage-YYYY-MM-DD.jsonl` entry produced by the `auto-on-skill` hook had `"threadId": null`. As a result, analyzer rules that join logs to threads (`ruleSessionNotFound`, `ruleIncidentRepeat`, future threadId-correlated rules) silently degraded. Fix: try `JSON.parse(response)` when `tool_response` is a string, then read `.threadId` / `.thread_id` as before. Verified end-to-end: a real PostToolUse payload now yields the correct UUIDv7 in the log.
- **`elapsedMs` was hardcoded to `0` in hook logs.** Now populated from `payload.duration_ms` (Claude Code's measured tool latency). The fallback stays `0` for synthetic payloads that lack timing.
- **Mixed-ownership hook group could erase user hooks.** `install/hooks.mjs`'s previous `isOursGroup` filter used `.some()` semantics — if a `PostToolUse` group accidentally contained BOTH a user hook and a `codex-on-claude:auto-log` marked hook, the entire group (including the user hook) was deleted on `uninstall` / `reconfigure --improvement-loop=off`. Added `stripOursFromGroups()` (hooks.mjs:50-58) which operates at the hook level — preserves user hooks even when intermixed with our markers. The installer still never produces mixed groups itself; this fix protects against manual edits to `settings.json`.
- **Hook kept logging after `improvementLoop` changed in `config.json` without `reconfigure`.** Once installed, the PostToolUse hook command path (`codex-on-claude log --from-stdin`) was unconditional — silent telemetry from the user's perspective. Added a runtime guard `shouldAcceptAutoHookLog()` (install.mjs:855-863) that the `--from-stdin` path consults before reading stdin: if `~/.claude/codex-on-claude/config.json`'s `improvementLoop` is `off` or `manual`, the hook silently no-ops. Manual `/codex-log` flow (no `--from-stdin`) is unaffected. Corrupt/missing config fail-opens so existing installs don't break unexpectedly. Verified across `off / manual / auto-on-skill / periodic / corrupt-config` — all behave correctly.

### Changed

- **CLI banner moved from stdout to stderr.** `install.mjs:1135` now uses `console.error` for the top-level `codex-on-claude vX.Y.Z` line. Stdout is now clean for data-mode subcommands such as `threads latest --format=id` and `analyze --format=json` — no more `sed 's/\x1b\[[0-9;]*m//g'` workaround in automation. Interactive humans still see the banner inline because most terminals show stderr alongside stdout. Subcommand-specific output (status data, threads list, analyze report, etc.) stays on stdout where it always was.

### Internal (docs / SKILL accuracy / test infrastructure)

- **`codex-resume/SKILL.md` SILENT-new-session trigger condition corrected.** Prior text claimed "codex CLI 0.131 silently starts a new thread if the given id is not on disk." Phase B test execution (this session) confirmed that codex CLI 0.131 actually **returns a clean error (exit 1, `no rollout found for thread id...`) for well-formed UUIDv7 unknown ids**; SILENT_NEW_SESSION fires only for **malformed** thread ids (anything that doesn't parse as a UUID). The detection code in `threads resume` is still correct — only the documented trigger condition was misstated. Also reordered "How to invoke" to lead with the `codex-on-claude threads resume` wrapper (which performs the mismatch check automatically), with bare `codex exec resume` as the fallback / implementation detail.
- **New defensive test scenario `G7-3e`** in `docs/test-scenarios-codex-calls.md` — verifies the `shouldAcceptAutoHookLog` guard end-to-end across `off` / `manual` modes. Companion to existing G7-1 (install-time loop check) so post-install config drift is also covered.
- **New fixtures** under `install/fixtures/analyze-rules/` (15 files): per-rule deterministic seed data for the 9 analyzer rules. Each fixture triggers exactly one rule, so `codex-on-claude analyze` can be regression-tested without waiting for organic usage to accumulate. See `install/fixtures/analyze-rules/README.md` for thresholds, the rule-to-fixture map, and lifecycle (commit-don't-delete) policy.
- **New test scenario doc** `docs/test-scenarios-codex-calls.md` (~64 KB, ~43 scenarios across 8 groups) covering every Codex calling surface (MCP transport, 9 Skills, codex-reviewer Agent, 14 threads subcommands, hooks, analyzer rules, full E2E). Each scenario has Given/Setup/Command/Expected/Notes plus copy-paste commands. Cost ceiling ~$0.50 on Haiku.
- **New execution-results doc** `docs/test-execution-results-2026-05-20.md` — Codex-call ledger (27 calls across this session), per-scenario log for Phase A (10/10 PASS hook scenarios) + Phase B (7/7 PASS resume + SILENT detection), error/deficiency/improvement log, synergy measurement table.

### Deployment note

The fixes above edit `install/install.mjs`, `install/hooks.mjs`, and `install/components/skills/codex-resume/SKILL.md`. Users who installed via `npm install -g codex-on-claude` will pick up the new behavior **after the next `npm install -g codex-on-claude@latest`** and a re-run of `codex-on-claude reconfigure` so the auto-on-skill hook command points at the updated binary. Existing installs whose hook command still calls the previous npm-cached path (`~/.nvm/.../lib/node_modules/codex-on-claude/install/install.mjs` or `~/.npm/_npx/<hash>/...`) will keep logging via the old code until either reinstalled or manually synced.

## [0.3.3] — 2026-05-20

### Added (UX, patch — no flag / CLI signature changes)
- **Unified `npx --yes codex-on-claude@latest`** as the canonical command. When prior install state is found, the no-arg path now flips into reconfigure mode automatically and prints a `vPREV → vCURR` banner so "update + reconfigure" is one obvious step instead of two.
- **`preflight` self-check.** `doctor` (and every install/reconfigure run) now checks whether `which codex-on-claude` resolves and whether it matches the running script's realpath. If they differ, you get a `Run \`hash -r\`` hint — catches the "command not found right after `npm update -g`" stale-shell-hash case.
- **"Next steps" stale-shell hint.** After a fresh install in zsh / bash, the installer reminds you to run `hash -r` if the new binary doesn't resolve in the current shell.

### Changed
- Help text: `codex-on-claude` (no arg) is now documented as "Install or reconfigure (auto-detects existing state)". Examples lead with `npx --yes codex-on-claude@latest`.
- `README.md` Install / Updating / Troubleshooting sections now lead with the canonical `npx --yes codex-on-claude@latest`. New troubleshooting entries for the `command not found` (stale shell hash) and `npx ENOENT ... _npx/<hash>/package.json` (corrupted npx cache) cases.

No behavioral or schema changes — only the no-arg flow's mode auto-flips when state exists, and the reconfigure flow itself is unchanged.

## [0.3.2] — 2026-05-20

### Changed (docs / i18n)
- All installer prompts, status output, deprecation warnings, alias migration lines, and section headers now in English.
- All `install/manifest.json` question and choice labels translated to English (option keys unchanged).
- All Skill / Agent prose translated to English. Code blocks, file paths, and shell snippets preserved verbatim. Stale references refreshed against the v0.3.1 surface (`auto-on-skill` hooks, `threads latest`, silent-new-session detection).
- `install/analyze.mjs` rule titles / findings / recommendations translated to English.
- `README.md` rewritten end-to-end in English and brought current to the 0.3.1 feature set (4-question flow, auto-on-skill PostToolUse hooks, `threads latest`, silent-new-session detection, arrow-key UI). New **"Updating codex-on-claude"** section explains the `npm update` / `npx@latest` / `reconfigure` / rollback / "what update touches" flow. Korean mirror at `README.ko.md`.
- Historical Korean memos moved to `docs/ko/`; new English summaries at `docs/implementation-log.md` and `docs/test-report-2026-05-20.md`.
- `package.json` `description` refreshed to reflect post-0.3.0 reality (no plugin bundle, auto-on-skill hooks, persistent threads).

### Added (UX, still patch — no flag / CLI signature changes)
- Reconfigure now opens with a **"Current selections" panel** so the user sees what was saved before any picker fires.
- Each question's picker opens with the existing answer pre-checked / highlighted (via `@inquirer/prompts` defaults).
- After each pick, a **kept / changed (a → b)** badge prints so the user knows what changed.
- A **final review screen** (both fresh install and reconfigure) lists every selection with "(was: …)" deltas and offers `Apply / Edit again / Cancel`. Choosing **Edit again** loops back with the draft selections pre-checked (so partial changes survive the loop).
- `--yes` skips the review and applies immediately. Non-TTY environments also bypass cleanly.

No behavioral or schema changes beyond the additive UX. Pure documentation / i18n / UX patch.

## [0.3.1] — 2026-05-20

### Added (backward-compatible patch)
- `improvementLoop` now supports four keys instead of three: `off | manual | auto-on-skill | periodic`. The previous `on-demand` value is accepted as an **alias for `manual`** and silently migrated in `~/.claude/codex-on-claude/config.json` on next `reconfigure` (with a one-line info log).
- New `auto-on-skill` mode installs PostToolUse hooks in `~/.claude/settings.json` so every call to `mcp__codex__codex` / `mcp__codex__codex-reply` automatically appends a usage log line — no Skill prose dependence. The hook command is `codex-on-claude log --from-stdin` and uses a marker (`_coc.marker = "codex-on-claude:auto-log"`) so uninstall removes only our own entries.
- `periodic` now implies `auto-on-skill` (hooks + suggestions cron-friendly).
- New `--from-stdin` flag on the `log` subcommand — reads Claude Code's PostToolUse JSON payload and extracts `tool_name`, `tool_input.sandbox`, `tool_response.threadId`, prompt/response lengths, and `session-not-found` signals automatically.
- `status` now prints how many PostToolUse hook groups are currently installed under our marker.

### Notes
- Patch bump (not minor) because the rename uses a transparent alias; `--improvement-loop=on-demand` keeps working, no flag/CLI signature actually changes.
- Hooks are only installed when `improvementLoop ∈ {auto-on-skill, periodic}`. The interactive flow surfaces a one-line consent reminder before applying; `uninstall` removes them; manual cleanup is `codex-on-claude reconfigure --improvement-loop=manual --yes`.
- If `~/.claude/settings.json` already has other hooks, we merge non-destructively.

## [0.3.0] — 2026-05-20

### Changed (BREAKING)
- **Removed `shareScope` install question and `--share-scope` flag.** The interactive flow is now **four** questions (patterns / contextPolicy / improvementLoop / threads). Passing `--share-scope=...` still parses but emits a deprecation warning and is ignored.
- **Plugin bundle auto-generation removed.** `~/.claude/plugins/marketplaces/codex-bridge/` is no longer created. Team distribution should clone the GitHub repo directly. Existing bundles from 0.2.x are **left in place** — `uninstall` no longer touches them; a manual `rm -rf` is required.

### Added
- Interactive install prompts now use arrow-key navigation (↑/↓) and space-to-toggle via `@inquirer/prompts`. Multi-select shows current checked state inline; single-select highlights the default.
- Non-TTY environments (pipes / CI) automatically fall back to defaults without hanging or raising.

### Dependencies
- Added `@inquirer/prompts@^8.x` as a runtime dependency. First-time install costs ~25 transitive packages but they are tiny and stay in npm cache afterwards.

### Migration (0.2.x → 0.3.0)
- No action required. The `shareScope` key in `~/.claude/codex-on-claude/config.json` is silently ignored on next `reconfigure`. If a plugin bundle directory exists from a previous install with `--share-scope=team`, `status` shows a one-line legacy hint and `reconfigure` emits a warning with the manual cleanup command.

### Versioning note
- This is a `minor` bump (rather than the project's default `patch`-only) because removing `--share-scope` is a CLI signature change. Per project policy, future releases revert to patch-only unless explicitly requested.

## [0.2.2] — 2026-05-20

### Added
- `codex-on-claude threads latest [--format=id|json]` — return the most recently-touched thread deterministically. External regression harnesses can use this instead of grepping LLM response text for `threadId`.
- `codex-on-claude doctor` now also verifies the `codex` MCP server is registered and `Connected`. README "Prerequisites" updated accordingly.
- `codex-on-claude threads resume <id> "prompt"` now detects **silent new-session** behavior of codex CLI 0.131 — if `codex exec resume` returns a different `thread_id` than requested, it surfaces `SILENT_NEW_SESSION` to stderr, records an incident on the original thread (`issue=silent-new-session, outcome=lost-context`), and registers the new thread as a bifurcation.

### Changed (docs/Skill prose only — no behavior change)
- `codex-review`, `codex-followup`, `codex-fix`, `codex-resume` SKILL.md now contain an explicit **"MUST do after every call"** section enforcing: (a) ending responses with a deterministic `Thread: <id>` line, (b) registering metadata via `codex-on-claude threads new` when threads are enabled, (c) appending a usage log via `codex-on-claude log` when the improvement loop is enabled. This addresses the "Skill prose ≠ actual LLM behavior" gap surfaced by external regression tests.
- README and `manifest.json` clarify that `improvementLoop=on-demand` does *not* install OS-level hooks — log entries appear because the Skill prose tells the LLM to write them, so any skipped Skill call silently misses a log entry. Hook-based enforcement is queued for v0.3.

### Notes
- External regression suite (`codex-on-claude-test`) verified 4 categories of behavioral gap; this release closes the deterministic surface area while preserving backward compatibility (no flag/CLI signature changes). The remaining gaps (option-key rename, PostToolUse hook auto-logging) are scheduled for v0.3.

## [0.2.1] — 2026-05-20

### Fixed
- **Critical**: removed `postinstall` script from `package.json`. The previous version embedded a `console.log` containing literal backticks around `` `npx codex-on-claude` ``, which `sh -c` interpreted as command substitution. That caused npm to re-invoke `npx codex-on-claude` during install — an infinite-recursion install loop that only terminated on `SIGINT`. Affects 0.2.0 (0.1.0 had the same script but the issue went unnoticed because of caching during initial publish).

### Removed
- `package.json` `scripts.postinstall` (the help line wasn't worth the risk; the installer prints next steps itself when run).

## [0.2.0] — 2026-05-20

### Added — Persistent thread catalog
- New install option `--threads=off|basic|full` (default `basic` when `improvementLoop != off`)
- New CRUD module `install/threads.mjs` storing each Codex thread in `~/.claude/codex-on-claude/threads/<threadId>.json` with a `index.json` rollup
- Thread record schema: `title`, `tags`, `originatingSkill`, `originatingCwd`, `scope (files/sandbox/approvalPolicy)`, `summaries (goal/outcome/decision/note)`, `incidents (issue/resolution/outcome)`, `fallbackStrategy (auto-resume|ask|new)`, `status (active|resolved|archived)`, `turnCount`
- New CLI subcommand `codex-on-claude threads` with: `list / show / new(=upsert=touch) / goal / outcome / decision / note / incident / tag / status / fallback / search / resume / remove`
- `threads resume <id> "prompt"` reads the stored `fallbackStrategy` and either runs `codex exec resume` automatically (`auto-resume`), shows context for the user to decide (`ask`), or guides starting a fresh session with prior summaries as preface (`new`)
- New Skill `codex-threads` so Claude can pick up past Codex work by title/tag/keyword
- Existing Skills (`codex-review`, `codex-followup`, `codex-resume`, `codex-fix`) extended with explicit "thread persistence" sections that show how to push metadata after each call
- Three new analyze rules: stale active threads, repeated incidents on the same thread, similar-tag clustering
- Analyze summary now includes `threads: N total / N active`

### Changed
- `codex-on-claude status` and the install summary now print the `threads` choice
- Help text updated to document the new subcommand and `--threads` flag
- `manifest.json` version field bumped to 0.2.0

### Notes
- `codex-on-claude uninstall` still removes the entire `~/.claude/codex-on-claude/` directory (including `threads/`). Back up the thread catalog before uninstalling if it matters — a future release may add `--keep-data`.
- Thread bodies (prompt/response) are still never stored. Only the metadata you (or a Skill) explicitly write via `threads outcome|decision|note|incident` is persisted.

## [0.1.0] — 2026-05-20

Initial release.

- Installable Skills: `codex-review`, `codex-followup`, `codex-resume`, `codex-fix`, `codex-routine`, plus `codex-analyze` / `codex-improve` / `codex-log` when the improvement loop is enabled
- Optional `codex-reviewer` subagent for isolated large-output reviews
- Optional Plugin bundle for team-wide deployment
- Local-only usage log (`logs/usage-YYYY-MM-DD.jsonl`) and analysis engine
- Subcommands: install (interactive), `reconfigure`, `doctor`, `status`, `uninstall`, `analyze`, `suggest`, `log`
- Automatic preflight (Node 18.17+, `codex`, `claude`, `codex doctor`, `claude auth status`)
