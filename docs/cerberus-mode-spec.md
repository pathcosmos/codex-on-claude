# Cerberus Head Mode — Specification (v0.5.1 ship, v0.5.2 hardening target)

**Status**: Draft 5 — v0.5.3 n=2 self-review로 식별된 4 critical fix (polarity, empty-token guard, dissent render, Porter isV base case)
**Updated**: 2026-05-23
**Target release**: 0.5.3 (patch)

## 1. 개요

케르베로스 Head 모드는 사용자가 명시적으로 호출했을 때 **하나의 task에 대해 3개의 독립적 plan을 병렬 생성한 뒤 결정적 알고리즘으로 합의된 plan을 반환**하는 모드. Execute/Verify는 다루지 않음(향후 Full 모드).

세 머리(head):
- **H1 Claude-only** — Claude의 자체 추론만. `mcp__codex__*` 전부 차단.
- **H2 Codex-only** — Claude는 위임 orchestrator. 추론은 `mcp__codex__codex`가 담당.
- **H3 Synergy** — 현 `codex-reviewer` 패턴 그대로 (Claude + codex 협업, R1-R6 recipes).

이 세 머리는 **subagent_type + tools allowlist**로 컨텍스트 격리.

## 2. MCP 도구 인터페이스

신규 MCP 서버 `cerberus` (등록명). codex-on-claude 바이너리 자체가 `mcp-server cerberus` 서브커맨드로 stdio JSON-RPC를 제공. `@modelcontextprotocol/sdk` 사용.

### 2.1 `mcp__cerberus__init`

새 run을 시작.

```
입력:
  task         (string, 필수)    사용자가 해결하려는 작업 1~10 문장
  scope        (string, 선택)    "head" (기본) | "full" (이번 릴리즈 disabled — 호출 시 에러)

출력:
  {
    run_id              : "20260522T123456Z-a1b2c3"      // 시작 시각 + 6자 랜덤
    next_action         : "spawn_agents"
    agents              : ["cerberus-h1-claude-only","cerberus-h2-codex-only","cerberus-h3-synergy"]
    head_prompts        : [<H1 prompt>, <H2 prompt>, <H3 prompt>]   // 각 head 전용 task framing + nonce 명령 포함
    validation_nonces   : { h1: "<6-hex>", h2: "<6-hex>", h3: "<6-hex>" }   // v0.5.2 — head별 고유 nonce
    nonce_instruction   : "각 head plan은 'cerberus-nonce: <value>' 라인으로 끝나야 함. mismatch 시 consensus 거부."
    consensus_endpoint  : "mcp__cerberus__consensus"
    cost_cap_tokens     : 50000        // config.cerberus.costCapTokens
    state_dir           : "<absolute path>"
  }

부수효과:
  STATE_DIR/cerberus/runs/<run_id>/plan.json 생성 (status="awaiting_heads", nonces 영속화)
  STATE_DIR/cerberus/runs/<run_id>/events.jsonl 에 init 이벤트 append

v0.5.2 nonce challenge:
  - head_prompts[h*] 각각 끝에 "cerberus-nonce: <nonces[h*]>" 명령 포함됨.
  - orchestrator(Skill/Claude)는 prompt를 변형 없이 그대로 agent에 전달.
  - 변형 시 consensus 호출에서 검증 실패 → 거부.
```

### 2.2 `mcp__cerberus__consensus`

3 head plan을 받아 결정적 합의 알고리즘 실행.

```
입력:
  run_id   (string, 필수)
  plans    (array, 필수, 길이 정확히 3)
           각 원소: { head: "h1"|"h2"|"h3", plan: <string>, model: <string>, elapsedMs: <int>, tokens: <int> }
           plan 끝줄에 'cerberus-nonce: <init이 발급한 nonce>' 포함 필수 (v0.5.2).
  force    (boolean, 선택, default false)   // v0.5.2 — true 시 nonce 검증 우회 (test/admin 전용)

출력:
  {
    run_id            : "...",
    next_action       : "present_to_user"
    consensus_plan    : <merged plan, markdown>
    agreement_score   : 0.0~1.0  // 1.0 = 세 head 완전 일치, 0 = 완전 불일치
    dissent           : [ { topic: "<항목>", h1: "...", h2: "...", h3: "..." }, ... ]
    chosen_per_topic  : [ { topic: "<항목>", winner: "h1|h2|h3|merged", reason: "..." }, ... ]
    cost_used_tokens  : <sum from input plans>
    cost_remaining    : <cap - used>
  }

부수효과:
  STATE_DIR/cerberus/runs/<run_id>/consensus.json 저장
  STATE_DIR/cerberus/runs/<run_id>/plans/{h1,h2,h3}.json 각 head 원본 보존
  events.jsonl 에 consensus 이벤트 append
```

### 2.3 `mcp__cerberus__status`

```
입력: run_id (string, 필수)
출력: {
  run_id, phase: "awaiting_heads"|"consensus_done"|"errored",
  costSoFar, iterations: 1, createdAt, updatedAt
}
```

### 2.4 `mcp__cerberus__list`

```
입력: limit (int, 선택, 기본 10)
출력: {
  runs: [ {run_id, task: "<처음 80자>", phase, agreement_score|null, createdAt}, ... ]
}
```

### 2.5 `mcp__cerberus__inspect`

```
입력: run_id (string, 필수)
출력: {
  run_id, task, plans: [...], consensus: {...}, events: [...]   // 모든 raw 데이터
}
```

## 3. 합의 알고리즘 (A) — Merge non-conflict + Tournament on conflicts

이번 릴리즈에서 ship할 유일한 알고리즘. 다른 옵션(B simple majority, C LLM-judge)은 코드에 hook 만 두고 향후 확장.

### 3.1 입력 정규화

세 head의 plan 텍스트(또는 객체)를 **항목 리스트**로 분해:
```
extractTopics(plan_text) → [
  { kind: "decision",   topic: "라이브러리 선택",    body: "..." },
  { kind: "step",       topic: "1단계",            body: "..." },
  { kind: "constraint", topic: "성능 임계",        body: "..." },
  { kind: "risk",       topic: "롤백 전략",        body: "..." },
  ...
]
```

추출 규칙(휴리스틱, pure-Node 정규식):
- markdown heading (`## `, `### `) → kind="section"
- numbered/lettered list 항목 → kind="step"
- "결정", "선택", "사용", "**Decision**", "Choose" 등 키워드 → kind="decision"
- "위험", "risk", "Caveat", "Trade-off" → kind="risk"
- "제약", "constraint", "must" → kind="constraint"
- 나머지 → kind="note"

**Draft 2 추가** (PoC §4.2(iii) 반영):
- 각 bullet의 **첫 문장**(또는 첫 100자, 더 짧은 쪽)만 `topicKey` 로 사용. 나머지 텍스트는 `body` 에 fold.
- 줄바꿈 없는 긴 bullet도 첫 100자가 키.
- markdown bold/italic 마커는 키 추출 시 제거 (`**Decision**` → `Decision`).

**Draft 4 추가 — Porter Stemmer (v0.5.2)**:
- `normalizeTokens()` 가 토큰을 정제한 뒤 `stem()` 적용 (pure-JS Porter Stemmer 5-step 자체 구현, ~80줄).
- `deterministic / deterministically` 같은 의역이 같은 stem(예: `determinist`)으로 정규화 → Jaccard 매칭 가능.
- `normalizeTokens(text, { stem: false })` 로 비활성화 (자동화 테스트 dual coverage).
- 비결정성 도입 없음: stemmer는 순수 함수.

**Draft 5 추가 — Polarity tracking (v0.5.3)**:
- `STOPWORDS`에서 `"not"` 제거. negation token은 polarity flag로 추적: `detectPolarity(text) ∈ {"+", "-"}`.
- 각 `topic` 객체에 `polarity` 필드. negation token (`not / never / avoid / skip / cannot / won't / don't / doesn't / didn't / no need` word-bounded) 발견 시 `"-"`, 아니면 `"+"`.
- `groupByJaccard` 가 동일 polarity 토픽만 같은 그룹에 모음. 정반대 의견(`"use cache"` / `"do not use cache"`)이 false-merge 되지 않음.
- 영향: n=2 self-review에서 H2+H3가 critical로 지적한 polarity blindness bug 해소.

**Draft 5 추가 — Empty-token guard (v0.5.3)**:
- `groupByJaccard()` 에서 후보 그룹의 `anchorTokens` 와 신규 토픽의 `keyTokens` 가 둘 다 빈 셋이고 `kindHint !== "decision"` 인 경우 매칭을 거부.
- 이전 v0.5.2까지는 `jaccard([],[])===1` 룰이 Decision 단일 글자뿐 아니라 **한국어/짧은 라벨/비-ASCII bullet** 도 false-merge 시켜 case 1로 잘못 분류.
- 단 Decision 그룹은 별도 exact-body match 경로(§3.3 case 분기 진입 직전)를 이미 보유 → A/B/C 같은 단일 글자 케이스는 정상 작동 유지.

**Known limitation — over-stemming (false-merge)** (`cerberus-stemming-adversarial.test.mjs:AS6` 회귀 가드):

v0.5.2 stemmer는 **21쌍/36 (58%)** 의 의미적으로 구분되는 단어를 같은 stem으로 정규화합니다. 영향 큰 케이스:

| 충돌 | 공유 stem | 의미 차이 |
|------|----------|----------|
| `business` / `busy` | `busi` | 사업체 vs 바쁜 |
| `new` / `news` | `new` | 새로운 vs 뉴스 |
| `organize` / `organic` | `organ` | 정리하다 vs 유기적 |
| `general` / `generic` / `generation` | `gener` | 일반적 vs 통속적 vs 세대 |
| `operate` / `operation` / `operative` | `oper` | 운영 vs 작전 |
| `assist` / `assistance` / `assistant` | `assist` | 돕다 vs 도움 vs 도우미 |
| `nature` / `natural` / `naturally` | `natur` | 자연 vs 자연스러운 |
| `universal` / `universe` | `univers` | 보편적 vs 우주 |
| `national` / `nation` | `nation` | 국가의 vs 국가 |
| `secure` / `security` | `secur` | 안전한 vs 보안 |
| `digit` / `digital` | `digit` | 숫자 vs 디지털 |

**실제 영향**: head별 plan에서 이 단어들이 등장하면 false case-1/case-2 merge로 분류되어 `agreement_score`가 부풀려질 수 있음. 단 사용자에게 보이는 `consensus_plan`의 본문은 head 원문 body를 사용하므로 텍스트 자체는 왜곡 없음 — **score signal만 false-positive 위험**.

**Mitigation**:
- `normalizeTokens(text, { stem: false })` 로 비활성화 (paraphrase miss와의 trade-off).
- v0.5.3+ 에서 embedding-based similarity (옵션 C) 평가 시 본 limitation이 우선 트리거.
- spec §3.2 회귀 가드: `cerberus-stemming-adversarial.test.mjs:AS6`이 21쌍을 snapshot lock.

각 topic을 **유사도 키**로 그룹핑(아래 3.2).

### 3.2 유사도 기반 그룹핑

3 head의 topic을 다음 절차로 매칭:
1. 각 topic의 정규화된 키 생성: `normalize(body) = lowercase + stopwords 제거 + 첫 10 단어 정렬 합`
2. Jaccard similarity ≥ 0.6 인 topic들을 같은 그룹으로 묶음
3. 한 그룹 내에서 각 head가 0개 또는 1개의 topic을 가짐 (한 head가 같은 그룹에 여러 topic을 가지면 가장 긴 body 유지, 나머지 dissent로 별도)

### 3.3 합의 규칙

각 그룹 G에 대해:

```
case 1: 세 head 모두 같은 그룹에 기여 + body 유사도 ≥ 0.8
  → merged plan 에 채택, chosen=merged

case 2: 세 head 모두 기여하지만 body 유사도 < 0.8
  → tournament:
     - h3 가중치 1.5, h1/h2 가중치 1.0 (config.cerberus.headWeights)
     - body 길이 점수: log(chars)/10 (max +0.3)
     - 구체성 점수:
         · file:line 또는 절대경로 참조 +0.5
         · 숫자/임계값(예: "0.8", "50000") +0.3
         · list 하위 항목 수 × 0.1 (max +0.5)        ← Draft 2 추가 (PoC §4.2(iv))
     - 최종 점수 = weight × (body length + specificity)
     - winner의 body 채택, 나머지는 dissent 배열에 기록
     - tie-break: h3 > h1 > h2 lex 순서
case 3: 두 head 만 기여 (1개 head 누락)
  → 2개 중 가중치 더 큰 head 채택, 누락 head는 dissent에 "missing" 표기
case 4: 한 head 만 기여 — Draft 2 (PoC §4.2(ii)) 3분류 dissent
  → kind 별 처리:
     · kind=="risk" OR kind=="reason" → consensus_plan 의 해당 섹션(Risks / Reasons)에 보수적 채택
       (Draft 3 — Cerberus self-review로 식별됨: 구현이 reason도 conservative include 하므로 spec도 동일 명시)
       (단일 head warning 또는 단일 head 근거 보존, "_(single-head <kind> (conservative include))_" suffix 추가)
     · kind=="step" or "decision":
         - "validated"   : 다른 head plans 에 해당 topicKey의 negation 키워드("avoid", "don't", "not", "skip") 부재
                          → dissent.validated 배열에 별도 그룹으로 출력 (사용자가 채택/거부 판단)
         - "disputed"    : 다른 head 가 명시적으로 반대 키워드 사용
                          → dissent.disputed 배열
         - 기타 → dissent.minority 배열
     · kind=="note" → 무시 (consensus_plan 미반영)
case 5: 어느 head도 기여 안 함 (불가)
  → 무시
```

### 3.4 agreement_score 계산 (Draft 4 — v0.5.2 case 4 conservative partial credit)

```
case4Conservative = (case 4 중 risk/reason 보수적 채택되어 consensus_plan 에 포함된 그룹 수)
case4Other        = (case 4 중 step/decision/note — dissent 또는 미반영)

rawScore = (Σ case1 × 1.0
          + Σ case2 × 0.5
          + Σ case3 × 0.3
          + case4Conservative × 0.3      ← v0.5.2 추가
          + case4Other × 0.0)
           / (총 그룹 수)

decisionMultiplier = 1.5  if Decision 그룹이 case 1 (3 head 일치)
                     1.0  otherwise

score = min(1.0, rawScore × decisionMultiplier)
```

**근거 (v0.5.2)**: case 4 risk/reason은 이미 consensus_plan에 채택되어 사용자에게 보임 → 실질적으로 case 3 (2-head 일치)와 동등한 가치. v0.5.1까지는 0 가중치로 점수에서 누락 → 실제 합의 정도 대비 score가 비현실적으로 낮았음. PoC 0.43, self-review 0.03 두 사례에서 misleading low 라벨 발생. v0.5.2 보정 후 PoC 데이터로 계산 시 ~0.77 high로 직관과 일치.

라벨:
- `score ≥ 0.7` → "high agreement"
- `0.4 ≤ score < 0.7` → "moderate agreement"
- `< 0.4` → "low agreement — user review recommended"

**근거**: Decision 일치는 plan-level의 핵심 — 디테일이 갈려도 사용자에게 "근본은 같다"는 신호. PoC 데이터(rawScore 0.43, Decision case 1 → 0.43×1.5=0.65) → spec 룰로 **moderate** 라벨링됨. low(임계 0.43 살짝 위)에서 moderate로 한 단계 상승 → 직관과 일치. (Draft 3 정정: 이전 문서에서 "high" 라벨로 잘못 표기되었던 부분은 spec §3.4 임계값 ≥0.7 high 기준 적용 시 잘못이며, 본 라벨 룰이 권위 있음.)

### 3.5 결정성 보장

- 그룹핑 순서: 그룹의 첫 topic의 head 순서(h1→h2→h3) + topic 인덱스 오름차순
- tournament tie-break: head 순서 (h3 > h1 > h2 가중치 동일 시 h3 우선)
- 같은 입력 → 같은 출력 (단위 테스트 5회 반복 검증, plan 텍스트 비교 단순화 위해 timestamp 제외)

## 4. Agent Frontmatter (3개)

기존 `codex-reviewer.md` 패턴을 그대로 따름.

### 4.1 `cerberus-h1-claude-only.md`

```yaml
---
name: cerberus-h1-claude-only
description: Cerberus Head #1 — Claude's own reasoning, no Codex consultation. Used as one of three independent planners in Cerberus mode. Returns a plan in markdown.
tools: Read, Grep, Glob, Bash, Edit, Write
model: {{reviewerPrimaryModel}}
---
```

`tools`에 `mcp__codex__*` **부재** → Claude Code가 H1 컨텍스트에서 codex 호출을 거부.

### 4.2 `cerberus-h2-codex-only.md`

```yaml
---
name: cerberus-h2-codex-only
description: Cerberus Head #2 — Codex CLI is the primary planner. Claude relays only. One of three Cerberus heads.
tools: mcp__codex__codex, mcp__codex__codex-reply, Read
model: {{reviewerPrimaryModel}}
---
```

`tools`에 Bash/Edit/Write 부재 → Claude가 자체 추론으로 plan 생성 못함, codex MCP 호출 결과만 정리.

### 4.3 `cerberus-h3-synergy.md`

```yaml
---
name: cerberus-h3-synergy
description: Cerberus Head #3 — Claude + Codex synergy (R1-R6 recipes from v0.5.0). One of three Cerberus heads.
tools: mcp__codex__codex, mcp__codex__codex-reply, Read, Grep, Glob, Bash
model: {{reviewerPrimaryModel}}
---
```

현 `codex-reviewer.md`의 tools 와 동일.

세 agent의 body는 공통 prose (1~2 paragraph) + 각자의 "역할 차이" 1단락. 길이 ≤ 80줄로 제한.

## 5. State Schema

```
~/.claude/codex-on-claude/cerberus/
├── runs/
│   └── <run-id>/
│       ├── plan.json              # {run_id, task, scope, createdAt, phase, ...}
│       ├── consensus.json         # mcp__cerberus__consensus 출력 전체
│       ├── plans/
│       │   ├── h1.json            # head 별 원본 plan + 메타
│       │   ├── h2.json
│       │   └── h3.json
│       └── events.jsonl           # init/consensus/error 이벤트 append
└── index.json                     # 최근 run 요약 (mcp__cerberus__list 용)
```

`writeJson()` (`install/threads.mjs:26-43`) 재활용 — atomic temp+rename, chmod 0700 자동.
`events.jsonl` append는 `analyze.mjs:appendLog` 패턴 재활용.

## 6. Config 블록

`install/manifest.json:questions` 에 추가:

```json
"cerberus": {
  "type": "info",
  "label": "Cerberus mode (multi-head planning consensus)",
  "defaults": {
    "defaultScope": "head",
    "consensus": "merge-then-tournament",
    "headWeights": { "h1": 1.0, "h2": 1.0, "h3": 1.5 },
    "costCapTokens": 50000,
    "maxIterations": 1
  }
}
```

`choices.cerberus` 에 동일 구조로 사용자 값 저장. 이번 릴리즈는 비대화형 default 고정 + `--cerberus-default-scope=head|full`, `--cerberus-cost-cap=<int>` flag 지원.

`defaultScope: "full"` 선택 시 install 단계에서 warn 출력 ("Cerberus Full mode is disabled in current release — defaultScope ignored, treated as head").

## 7. SKILL.md Prose

`install/components/skills/codex-cerberus/SKILL.md` 의 정확한 문구:

```markdown
---
name: codex-cerberus
description: Use when the user invokes /cerberus or asks for a multi-head planning consensus on a task. Spawns three independent planners (Claude-only, Codex-only, Claude+Codex synergy) and returns a deterministically merged plan via the cerberus MCP server. Read-only with respect to the working tree.
---

# codex-cerberus

Triggered by `/cerberus head "<task>"` (or just `/cerberus "<task>"` — default scope is `head`).

## Required steps (do not skip or reorder)

1. Call `mcp__cerberus__init(task=<user task>, scope="head")`. Receive `{run_id, agents, head_prompts, ...}`.
2. Spawn three Agents **in parallel** (single message, three tool uses):
   - `Agent({subagent_type: agents[0], prompt: head_prompts[0]})`
   - `Agent({subagent_type: agents[1], prompt: head_prompts[1]})`
   - `Agent({subagent_type: agents[2], prompt: head_prompts[2]})`
3. Collect the three Agent results (each is a markdown plan string).
4. Call `mcp__cerberus__consensus(run_id, plans=[{head:"h1",plan:r1,...},{head:"h2",plan:r2,...},{head:"h3",plan:r3,...}])`.
5. Present the returned `consensus_plan` to the user **verbatim**, prefixed with the `agreement_score` and a one-line `dissent` summary if `agreement_score < 0.8`.

## Do not
- Modify the consensus_plan, summarize it further, or skip the consensus call.
- Spawn fewer than three agents (e.g. if one head looks "redundant" — the algorithm needs all three).
- Use this Skill for execution or verification. It is plan-only. After the user reviews the consensus_plan, they choose how to proceed (`/codex-fix`, manual implementation, `/codex-review`, etc.).

## Output format

```
**Cerberus consensus** (run: <run_id>, agreement: <score>)
[if score < 0.8] *Note: heads disagreed on {N} points — see dissent.*

<consensus_plan body verbatim>
```

## Failure handling

- `mcp__cerberus__init` returns error → tell the user "Cerberus init failed: <reason>" and exit.
- Any Agent fails → still call `mcp__cerberus__consensus` with the remaining plans (consensus algorithm handles case 3 / case 4).
- `cost_used_tokens > cost_cap_tokens` warning from consensus → present plan as usual but append a "(cost cap reached)" footer.
```

본문은 정확히 위 7개 절. 합의 로직, head 차이, 가중치 같은 결정성 항목은 **언급하지 않음** — 메모리 `feedback_skill_actual_vs_documented` 위반 회피.

## 8. 검증 — Step 6 단위 테스트가 다룰 것

- 합의 결정성 (3.5)
- agreement_score 경계 (3.4)
- dissent 누락 head 처리 (3.3 case 3, 4)
- run-id unique (`Date.now()` 충돌 회피)
- state 디렉토리 atomic 쓰기
- MCP 도구 5개 schema 준수 (`@modelcontextprotocol/sdk` validator)
- Skill 호출 → 3 Agent spawn → consensus 호출 end-to-end

## 9. 범위 외 (이번 릴리즈 제외)

- Cerberus Full 모드 (execute + verify)
- iterative re-plan loop
- 합의 알고리즘 B (simple majority), C (LLM-judge)
- headWeights 인터랙티브 설정 (수동 config 편집만)
- run-id GC (오래된 run 자동 정리)
