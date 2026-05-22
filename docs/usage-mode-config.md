# Usage Mode Configuration — none / synergy / auto / max

> codex-on-claude 의 Codex 호출 빈도·성향을 4 mode 로 사용자 선택. v9 가이던스를 실제 사용 패턴에 매핑.
>
> Detail: `guidance-quick-ref.md` + `synergy-playbook.md`.

## 4 Modes 개요

| Mode | 한 줄 정의 | Default? |
|---|---|---|
| **none** | Codex 호출 차단 (α only) | — |
| **synergy** | 가이던스 추종 — Quick-ref 3-Q tree + R1–R6 recipes | **Recommended default** |
| **auto** | 자동 signal detection — heuristic + LLM probe on ambiguous | for power users |
| **max** | 안전 속 극대화 — synergy + γ hot-swap auto + R5 적극 | for quality-first |

## Mode 별 동작 정의

### `none` — Codex 호출 차단

**의미**: 모든 Codex MCP 호출 차단. Claude Code (α) 단독.

**Behavior** (v0.5.0 실제 구현):
- Skills 비활성 (codex-review, codex-fix, codex-followup 등 모두 silent — SKILL.md preamble 의 `none` 분기가 발동)
- MCP `mcp__codex__codex` / `mcp__codex__codex-reply` 호출 시 **PreToolUse 게이트 hook 이 `{decision: "deny", reason: "..."}` 를 stdout 에 출력** → Claude Code 가 해당 호출을 거부 + 사용자에게 사유 표시 (interactive confirm 없음; 하드 블록).
- threads 카탈로그 / log Skill 은 read-only 로 허용 (로컬 파일만 사용, Codex 호출 없음)

**When to use**: 
- Cost-sensitive context (전혀 외부 API 안 쓰겠다)
- Privacy 우려 (Codex 에 코드 노출 안 함)
- α 평가만 하고 싶을 때

### `synergy` — 가이던스 추종 (Recommended default)

**의미**: v9 quick-ref.md 의 3-Q decision tree + R1–R6 recipes (R6 Format-Safe Handoff 포함) 그대로 따름.

**Behavior**:
```
Q1: chain ≥ 3 steps + strict JSON? → β 차단 (Chain-JSON Trap)
Q2: review task with adversarial framing? → R1 default ON
Q3: α partial-fail expected (50-85%)? → R5 cheap trial 제안
otherwise: α only
```

**Activated Skills**:
- ✅ `/codex-review` (R1 adversarial framing) — review task 시 자동 권장
- ✅ `/codex-fix` (R3) — TDD context 시
- ✅ `/codex-followup` (R3 chain only) — 3-turn stop rule
- ⚠️ `/codex-review` ×2 (R2 self-review) — complex real-world 조건 만족 시
- ❌ `codex-reviewer` subagent + strict JSON — **차단** (Subagent-Strict Trap)

**When to use**: 일반 개발 작업. 90% 사용자 default.

### `auto` — Signal Detection Hybrid

**의미**: 사용자가 task 명시 없이 prompt 만 입력 시, **자동으로 mode synergy 의사결정 수행**.

**Signal detection 2-tier**:

#### Tier 1: Heuristic detection (deterministic, $0)

```javascript
function detectSignals(prompt, expectedOutput, history = {}) {
  const text = `${prompt || ''}\n${expectedOutput || ''}`;  // null-safe (Codex peer review)
  return {
    // Chain: numbered, lettered, bullet steps (multi-format per Codex review)
    has_chain: (text.match(/^\s*(\d+\.|[A-Z]\.|first|then|finally|step\s+\w)\s+/gim) || []).length >= 2,

    // Structured output: JSON, YAML, schema, table — not only JSON (Codex review)
    has_strict_output: /\b(valid json|json only|no prose|schema|required fields|yaml|csv|table)\b/i.test(text) ||
                       /```(json|yaml|ts|typescript)\b/.test(expectedOutput || '') ||
                       (expectedOutput && (expectedOutput.match(/"[\w_]+":/g) || []).length >= 4),

    // Adversarial defect-finding (not style review)
    has_adversarial_defect: /\b(find\s+(bugs|issues|vulnerabilities|contradictions|subtle)|security\s+audit|adversarial|race\s+condition|injection|XSS|XXE|TOCTTOU)\b/i.test(text) &&
                            !/\b(style|format|readability|naming)\b/i.test(text),

    // TDD context
    has_tdd: /\b(failing\s+test|edge\s+cases?|TDD|implement.*pass.*tests?)\b/i.test(text),

    // Hard reasoning (verifiable by test/proof per Codex review)
    has_hard_reasoning: /\b(NP-hard|constraint\s+satisf|SAT|puzzle|prove|algorithm\s+correctness)\b/i.test(text),

    // α-ceiling estimated from cached history, NOT prompt regex (Codex peer review)
    known_alpha_ceiling: history?.task_profile_alpha_rate >= 0.95,

    // Context
    prompt_length: prompt?.length || 0,
    is_long_context: (prompt?.length || 0) > 20000,
  };
}
```

**Codex peer review fixes applied**:
- ✅ null-safe (`prompt`, `expectedOutput` may be undefined)
- ✅ Chain detection includes lettered / first-then-finally / step variants
- ✅ Structured output covers YAML / CSV / TS / schema 키워드 (not only JSON)
- ✅ `has_adversarial_defect` excludes style review
- ✅ `known_alpha_ceiling` from history cache (NOT prompt regex) — programmatic detection impossible from prompt alone

→ **명확한 case** (chain+strict, adversarial review, ceiling) 즉시 결정.

#### Tier 2: LLM-judged on ambiguous (~$0.01-0.02)

Heuristic 가 confident 못 한 case 만 (e.g., prompt 가 ambiguous, signal mixed):

```sh
# Quick meta-classification call
codex exec --sandbox=read-only --json \
  "Classify this task: chain+strict | adversarial review | TDD | reasoning | doc authoring | other.
   Estimate α success rate (rough): high (>90%) / medium (50-90%) / low (<50%).
   Prompt: [first 500 chars of user prompt]" \
  < /dev/null
```

→ Decision rule applied based on Codex's classification.

**Behavior**:
- Signal detect → quick-ref 3-Q tree 적용
- Detection 결과를 user 에게 surface ("Detected: adversarial review, applying R1")
- 사용자가 mode 자체를 다시 고정 가능: `codex-on-claude reconfigure --usage-mode=synergy` (signal detection 끄고 synergy 룰만 따름) 또는 `--usage-mode=none` (Codex 호출 완전 차단)

**When to use**: User 가 prompt 만 입력 + 자동 최적화 원할 때. 약간의 cost overhead (LLM probe).

### `max` — 안전 속 극대화 (Option C)

**의미**: synergy 의 모든 권장 + γ 자동 hot-swap + R5 aggressive trial. **Hard DO-NOT 룰은 유지** (catastrophe 회피).

**Definition (Codex peer-reviewed)**: "max = **quality-first bounded automation**; apply all eligible recipes, auto-hot-swap γ on catastrophe signals, **never bypass hard β blocks**."

**Behavior**:
```
1. synergy mode 의 의사결정 우선 (Q1 ceiling → Q2 chain+strict → Q3 adversarial → Q4 partial-fail)
2. Defect-finding review 조건이면 R1 무조건 발동 (★★★)
3. Strict output + adversarial 시 R6 Format-Safe Handoff (Codex prose → Claude format)
4. Self-review 조건 (≥5KB OR ≥5 sections OR 200+ LOC + α<100%) 이면 R2 발동
5. **Hard DO-NOT 감지 시 (Q2 = YES)**:
   - β orchestration 차단 (override 안 함)
   - γ hot-swap (R4) 자동 발동 if Codex CLI available
   - γ unavailable → α fallback + warning ("β catastrophe risk; γ not configured")
6. α partial-fail 추정 시 → R5 cheap trial (adjudication: source-grounded finding 채택)
7. 3-turn stop rule (P-Turn-Burn 방지)
8. R3 (reasoning=high) auto when α 1회 fail 또는 verifiable answer (test pass / proof)
```

**핵심 caveat**: max 는 hard DO-NOT 룰 (Chain-JSON Trap, Subagent-Strict, Turn Burn) 을 **override 하지 않는다**. 안전 가드 유지하면서 권장 recipes 를 최대 활성.

**Activated Skills** (전체):
- ✅ `/codex-review` (R1) — review task 무조건 발동
- ✅ `/codex-fix` (R3) — TDD impl 시 발동
- ✅ `/codex-followup` (R3) — 3-turn stop rule 적용
- ✅ `/codex-review` ×2 (R2) — complex real 시 발동
- ✅ `codex-routine` — 정기 점검 활성
- ✅ `codex-analyze` + `codex-improve` — periodic 발동
- ❌ `codex-reviewer` + strict JSON — **여전히 차단** (catastrophe 회피)

**Quality estimate**:
- synergy mode 대비 +5~+10pp lift (R5 trial 효과 + γ rescue)
- Cost +200~+400% 가능 (R5 무차별 + γ 호출 증가)

**When to use**: Quality 우선, cost 비제약. Critical task / 학습 가치 높은 case.

## Per-Skill Activation Matrix

| Skill | none | synergy | auto | max |
|---|---|---|---|---|
| `/codex-review` (R1 adversarial) | ❌ | ✅ defect-finding review only | ✅ detect | ✅ all review tasks |
| `/codex-review` ×2 (R2 self-review) | ❌ | ⚠️ conditional (complex real) | ⚠️ detect+judge | ✅ conditional |
| `/codex-fix` (TDD impl) | ❌ | ⚠️ TDD only | ⚠️ detect | ✅ TDD context |
| `/codex-followup` (chain) | ❌ | ⚠️ 3-turn limit | ⚠️ 3-turn limit | ⚠️ 3-turn limit |
| `mcp__codex__codex` reasoning=high (**R3**) | ❌ | ⚠️ α 1회 fail 후 | ⚠️ detect | ✅ default high |
| γ hot-swap (**R4**) | ❌ | manual | manual | ✅ **auto on catastrophe** |
| R5 cheap β trial (adjudication-based) | ❌ | ⚠️ user-initiated | ⚠️ user-initiated | ✅ **always probe** |
| **R6 Format-Safe Handoff** | ❌ | ✅ strict-output review | ✅ detect+strict | ✅ auto when adversarial+strict |
| `codex-reviewer` subagent + strict | ❌ | ❌ DO NOT | ❌ DO NOT | ❌ **여전히 차단** (Subagent-Strict Trap) |
| `codex-analyze` + `codex-improve` | ❌ | offline | offline | ✅ periodic |
| `codex-routine` | ❌ | ⚠️ user-defined | ⚠️ user-defined | ✅ active |
| `codex-log` | minimal | ✅ | ✅ | ✅ |
| `codex-threads` | read-only | ✅ | ✅ | ✅ |

> **Codex peer review note**: 이전 매트릭스에서 R3/R4 label 가 swapped 됨. **R3 = reasoning=high MCP**, **R4 = γ hot-swap**. R6 = Format-Safe Handoff 신규 추가. `/codex-fix` 와 `/codex-followup` 는 recipe 번호가 아닌 Skill 이름.

## 구현 (configuration schema)

### CLI flag

```sh
# 설치 시 mode 선택 (반드시 `=` 사용 — `--usage-mode max` 같은 공백 분리는 v0.5.0 부터 error)
codex-on-claude --usage-mode=synergy ...   # default
codex-on-claude --usage-mode=none ...
codex-on-claude --usage-mode=auto ...
codex-on-claude --usage-mode=max ...

# reconfigure 로 변경
codex-on-claude reconfigure --usage-mode=auto
```

### PreToolUse 게이트 동작 (v0.5.0 hardening)

`usageMode=none` 선택 시 `~/.claude/settings.json` 에 등록되는 hook command 는:

```
codex-on-claude gate --from-stdin --enforce-mode=none
```

- **`--enforce-mode=none` baked-in**: gate 가 `config.json` 을 읽지 않고 명령행 인자로 mode 를 확정. 모드 toggle 시 race window 제거 (H2 fix).
- **Hook 결정 JSON dual-shape**: deny 시 legacy `{decision, reason}` + 새 `{hookSpecificOutput: {hookEventName, permissionDecision, permissionDecisionReason}}` 둘 다 emit. Hard-deny 는 추가로 `process.exit(2)` + stderr backstop (H1 fix).
- **Wildcard MCP matcher**: hook matcher 는 `mcp__codex__.*` regex + `Bash` 두 개. Bash 매처는 명령행에서 `codex exec` / `codex-on-claude threads resume` / `npx ...codex...` / path-qualified codex 를 검출해 deny (F2 fix).
- **Fail-CLOSED**: tool 이 Codex 모양이면서 `config.json` 손상 또는 payload malformed 시 deny (F3 fix). 일반 tool 은 fail-open 유지.

수동 점검:

```sh
# 현재 등록된 gate 명령 확인
jq '.hooks.PreToolUse[]? | select(.hooks[]?._coc.marker == "codex-on-claude:usage-gate")' ~/.claude/settings.json
```

### Config schema (`~/.claude/codex-on-claude/config.json`) — v0.5.0 실제 schema

```json
{
  "version": "0.5.0",
  "choices": {
    "patterns": ["review", "followup", "fix"],
    "contextPolicy": "mixed",
    "improvementLoop": "auto-on-skill",
    "threads": "basic",
    "subscription": { "claude": "max", "codex": "pro" },
    "model": {
      "codex":    { "primary": { "id": "gpt-5.5", "reasoning": "xhigh" }, "fallback": { "id": "gpt-5", "reasoning": "medium" } },
      "reviewer": { "primary": { "id": "opus",    "reasoning": "xhigh" }, "fallback": { "id": "sonnet","reasoning": "medium" } }
    },
    "usageMode": "synergy",
    "autoTier2LLMProbe": true,
    "guardrails": {
      "chainJsonTrap": "hard-block",
      "subagentStrict": "hard-block",
      "turnBurn": "3-turn-stop",
      "ceilingNoUpside": "warn-and-skip"
    }
  },
  "installed": {
    "skills": ["codex-review", "codex-followup", "..."],
    "agents": ["codex-reviewer", "codex-reviewer-fallback"],
    "hooks": true,
    "gateHooks": false,
    "removed": []
  },
  "mcp": { "name": "codex", "status": "connected" },
  "updatedAt": "2026-05-22T..."
}
```

> `gateHooks: true` 는 `usageMode === "none"` 일 때만 채워집니다 (PreToolUse 게이트가 실제로 `~/.claude/settings.json` 에 등록된 상태).

### Runtime hook chain (concept)

```javascript
// In Skill prose / Agent definition
const mode = readConfig().choices.usageMode;
const signals = detectSignals(userPrompt, expectedOutput);

if (mode === 'none') return SKIP_CODEX;
if (mode === 'synergy') return applyDecisionTree(signals);
if (mode === 'auto') {
  const heuristic = applyDecisionTree(signals);
  if (heuristic.confidence < 0.7) {
    const llmJudge = invokeCodexClassifier(userPrompt);
    return applyDecisionTree({ ...signals, ...llmJudge });
  }
  return heuristic;
}
if (mode === 'max') {
  if (signals.has_chain && signals.has_strict_json) return HOT_SWAP_GAMMA;
  return APPLY_ALL_RECIPES;
}
```

## 가이던스 doc 매핑

| Mode | 주요 참조 doc |
|---|---|
| **none** | `guidance-claude-only.md` (α 단독 강화) |
| **synergy** | `guidance-quick-ref.md` + `synergy-playbook.md` |
| **auto** | 위 + `usage-mode-config.md` (this) — signal detection layer |
| **max** | 위 + `guidance-claude-orchestrates-codex.md` (전체 recipe 활성) |

## Quality vs Cost 예상

| Mode | Expected α-baseline diff | Cost (relative) |
|---|---|---|
| none | 0 (α only) | 1.0× |
| synergy | -2 ~ +5pp (selective β) | 1.0~1.3× |
| auto | -1 ~ +6pp (similar + LLM probe) | 1.1~1.4× |
| max | +0 ~ +10pp (aggressive trial + rescue) | 2.0~4.0× |

(170-scenario v5 base 기준 추정. Task profile 에 따라 변동.)

## Decision flow chart

```
사용자 task
    │
    ▼
[Mode check]
    │
    ├─ none → α only, skip all Codex ──────────────┐
    │                                                │
    ├─ synergy → quick-ref 3-Q tree → recipe          │
    │                                                │
    ├─ auto → signal detect Tier 1                  │
    │           │                                    │
    │           ├─ confident → quick-ref 3-Q tree    │
    │           │                                    │
    │           └─ ambiguous → LLM probe (Tier 2)    │
    │                            → tree              │
    │                                                │
    └─ max → synergy 의사결정                         │
              │                                      │
              ├─ adversarial → R1 무조건             │
              ├─ catastrophe risk → γ hot-swap (R4)  │
              ├─ otherwise → R5 cheap trial          │
              └─ ........                            │
                                                     │
                                                     ▼
                                                  Result
```

## v0.5.0 에서 구현 완료 (모든 P0-P4 적용)

| 우선순위 | 항목 | 구현 위치 | 상태 |
|---|---|---|---|
| **P0** | `--usage-mode` flag + validation + config write | `install/install.mjs:1101-1129` (flag parse), `install/manifest.json:158` (question schema), `install/install.mjs:1438-1442` (apply summary) | ✅ |
| **P1** | Skill prose mode-aware preamble | `install/components/skills/*/SKILL.md` (9 파일, 각 파일 상단 `## Usage mode (v0.5.0)` 섹션), `install/install.mjs:515-553` (`buildModelVars` 가 `{{usageMode}}` + `{{modeBehavior}}` 채움) | ✅ |
| **P2** | Tier 1 heuristic 모듈 | `install/detect-signals.mjs` (`detectSignals`, `applyDecisionTree`, `computeConfidence` exports + CLI entry) | ✅ |
| **P3** | Tier 2 LLM probe + flag | `install/auto-probe.mjs` (`invokeCodexClassifier`, `shouldProbe`, `mergeClassification`), `install/install.mjs` `--auto-tier2-llm-probe=on\|off` | ✅ |
| **P4** | γ hot-swap auto invocation in max mode | `install/detect-signals.mjs:applyDecisionTree` (max + chain+strict → recipe="R4"), `install/components/skills/codex-review/SKILL.md` mode preamble | ✅ |
| **신규** | PreToolUse runtime gate (mode=none) | `install/hooks.mjs:installGate` + `removeGate` + `decideGate`, `install/install.mjs:cmdGate` (`codex-on-claude gate --from-stdin`) | ✅ |
| **신규** | analyzer drift detection | `install/analyze.mjs:ruleUsageModeDrift` | ✅ |

CHANGELOG entry: [`../CHANGELOG.md`](../CHANGELOG.md) `## [0.5.0]`.

## 가이던스 충족도 (최종 평가)

| Mode | v9 가이던스 + 본 문서 충족도 |
|---|---|
| none | ✅ **100%** |
| synergy | ✅ **100%** |
| auto | ✅ **90%** (Tier 1 heuristic 명시, Tier 2 LLM prompt 명시) |
| max | ✅ **95%** (Option C semantics 정의, γ hot-swap rule 명시) |

→ 본 문서로 **모드 구현에 필요한 모든 의사결정 spec 완료**.
