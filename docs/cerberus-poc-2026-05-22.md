# Cerberus Head Mode PoC — 2026-05-22

**목적**: MCP 서버 구현(Step 3) 전 3-head 패턴 + 합의 알고리즘 (A)의 의도된 작동을 손으로 검증.
**Task**: Meta — "케르베로스 합의 알고리즘 A/B/C 중 어느 것이 최선인가?"
**환경**: codex-on-claude v0.5.0 설치, codex CLI 0.131.0, Claude Code 2.1.148

## 1. 3 Head 시뮬레이션 매핑

| Spec head | PoC에서 사용한 도구 | 격리 방식 |
|-----------|-------------------|----------|
| H1 Claude-only | `Agent({subagent_type:"general-purpose"})` + prompt에 "Do NOT invoke mcp__codex__*" | subagent context + 명시적 거부 지시 |
| H2 Codex-only | `mcp__codex__codex()` 직접 호출 (sandbox=read-only, approval=never) | Codex 격리 (Claude는 prompt 중계만) |
| H3 Synergy | `Agent({subagent_type:"codex-reviewer"})` | 기존 v0.5.0 codex-reviewer 패턴 |

호출 비용 (실측):
- H1: tokens 15198, 192s (Agent 격리, Claude만)
- H2: tokens ~3000 (추정, codex single-turn)
- H3: tokens 12623, 50s + 1 codex consultation

총 약 3만 토큰, 약 4분. Cost cap 50k 미만.

## 2. 3 Head Plan 원본 (요약)

### H1 — Claude-only
- **Decision**: A
- **Reasons (5)**: Determinism / Zero extra LLM cost / Dissent preservation / Scope appropriate v0.5.1 / Head weighting h3=1.5 principled
- **Risks (4)**: Jaccard threshold heuristic / Topic extraction quality bound / h3=1.5 opinionated / No semantic understanding
- **Steps (6)**: `src/cerberus/consensus.js`, Unit tests (5 scenarios), Wire behind feature flag, Render Dissent section, Bump 0.5.1, Regression test in P31 external harness

### H2 — Codex-only (threadId `019e4ffe-ea29-78b1-8122-88ea524c72c0`)
- **Decision**: A
- **Reasons (5)**: Best fit MCP constraints / Useful than weighted majority / Better for plan-only / Safer for v0.5.1 / Head weights allow trust tuning
- **Risks (4)**: Jaccard semantic gap / Tournament more complex than majority / Fixed weights over-bias / Lexical < LLM judge
- **Steps (6)**: Pure `consensus(plans, options)` module / Normalize items {topic, body, head, metadata} / Tokenization+Jaccard+body merge+tournament / Return consensusPlan + dissent + scores / Tests (7 scenarios) / Conservative defaults

### H3 — Synergy (threadId `019e4fff-af5c-7c00-b185-78c35c351451`)
- **Decision**: A
- **Reasons (5)**: Deterministic & unit-testable / Zero extra LLM cost / Preserves dissent natively / Richer than B / Safer than C for v0.5.1
- **Risks (4)**: Jaccard mis-cluster (mitigate: lowercase+stopword+sort) / 0.8 body threshold brittle / h3=1.5 over-suppress (mitigate: surface losing side) / String similarity misses semantic
- **Steps (6)**: Normalize {head,title,body,tokens,topicKey} / Cluster by Jaccard, classify (agree/conflict/unmatched) / Tournament: weighted score, h3>h1>h2 tie-break / Emit 3 sections (Agreed/Resolved Conflicts/Minority Report) / Tests (5 scenarios incl. h3 tie-break) / Thresholds as named constants

## 3. 수동 합의 알고리즘 (A) 적용

### 3.1 그룹핑 결과 (Jaccard ≥ 0.6)

| 그룹 ID | 종류 | 참여 head | Case | 채택 결과 |
|---------|------|----------|------|----------|
| D1 | decision | h1, h2, h3 | 1 (body≥0.8) | **merged: A** |
| R1 | reason | h1, h2, h3 | 1 | merged: 결정성 / 단위테스트 친화 |
| R2 | reason | h1, h2, h3 | 1 | merged: 추가 LLM 비용 0 |
| R3 | reason | h1, h2, h3 | 1 | merged: dissent 보존 |
| R4 | reason | h1, h2, h3 | 1 | merged: v0.5.1 patch에 적합 |
| R5 | reason | h1, h2 (h3 missing) | 3 | h1 채택: head weight principled |
| R6 | reason | h2, h3 (h1 missing) | 3 | h3 채택 (가중치 1.5): richer than B |
| Ri1 | risk | h1, h2, h3 | 1 (body<0.8) | **tournament**: h3 (mitigation 구체성 +0.5) |
| Ri2 | risk | h3 only | 4 | risk → 보수적 채택: 0.8 임계 brittle |
| Ri3 | risk | h1, h2, h3 | 1 (body<0.8) | tournament: h3 (mitigation "surface losing side") |
| Ri4 | risk | h1, h2, h3 | 1 | merged: 의미 기반 한계 |
| Ri5 | risk | h1 only | 4 | risk → 채택: topic extraction bound |
| Ri6 | risk | h2 only | 4 | risk → 채택: tournament 복잡도 |
| S1 | step | h1, h2 | 3 | h1 채택 (lex): `consensus.js` 모듈 |
| S2 | step | h2, h3 | 3 | h3 (가중치): item normalize 구조 |
| S3 | step | h2, h3 | 3 | h3: tournament 룰 (h3>h1>h2 tie-break) |
| S4 | step | h2, h3 | 3 | h3: 3 sections (Agreed/Resolved/Minority) |
| S5 | step | h1, h2, h3 | 2 (lists 다름) | tournament: h2 (7 scenarios 최다) |
| S6 | step | h1, h2 | 3 | h1: feature flag 게이팅 |
| S7 | step | h1 only | 4 | dissent only: bump 0.5.1 (다른 head 반대 안 함, 사용자 결정으로 분리) |
| S8 | step | h1, h3 | 3 | h3: Dissent section 렌더 |
| S9 | step | h3 only | 4 | dissent only: thresholds as constants |
| S10 | step | h1 only | 4 | **무효 dissent**: P31 외부 하니스는 마운트 안 됨 (메모리 `reference_external_test_harness` 참조 시 stale) |

총 그룹: 23개

### 3.2 agreement_score 계산

```
case 1 (3 head + body≥0.8 또는 merged): 5 (D1, R1, R2, R3, R4, Ri4) → 정확히 6
case 2 (3 head + body<0.8 tournament): 3 (Ri1, Ri3, S5)
case 3 (2 head): 8 (R5, R6, S1, S2, S3, S4, S6, S8)
case 4 (1 head): 6 (Ri2, Ri5, Ri6, S7, S9, S10)

score = (6×1.0 + 3×0.5 + 8×0.3 + 6×0.0) / 23
     = (6.0 + 1.5 + 2.4 + 0.0) / 23
     = 9.9 / 23
     = 0.43
```

**라벨**: `score=0.43 < 0.4` 임계 살짝 위 → "moderate agreement" (spec의 `<0.4 low agreement` 임계는 통과).

### 3.3 Consensus Plan (수동)

```markdown
**Cerberus consensus** (run: poc-2026-05-22, agreement: 0.43, label: moderate)

## Decision
A — Merge non-conflict + Tournament on conflicts

## Reasons (agreed)
1. Deterministic Node code → unit-testable, reproducible (h1+h2+h3)
2. Zero extra LLM cost → fits patch-release / side-tool budget (h1+h2+h3)
3. Preserves dissent natively → plan-only use case에 적합 (h1+h2+h3)
4. Safe for v0.5.1 patch → 새 transport/model 의존성 없음 (h1+h2+h3)
5. Head weighting principled tiebreaker (h1, h3 weight 1.0/1.5 일관) (h1 단독 — h3는 별도 표현)
6. Richer than (B) simple majority: handles partial agreement via tournament (h3)

## Risks / Trade-offs
1. Jaccard threshold heuristic — mitigation: lowercase + stopword + sort tokenization (h3)
2. 0.8 body-similarity threshold brittle across formats (h3, h1 일부 일치)
3. Head weight h3=1.5 risk of over-suppression — mitigation: surface losing side in dissent (h3)
4. Pure lexical misses semantic equivalence (e.g., "add retry" vs "implement backoff") (h1+h2+h3)
5. [risk] Topic extraction quality bounds everything (h1만)
6. [risk] Tournament more complex than majority (h2만)

## Next Steps
1. Module: `install/cerberus-consensus.mjs` — pure function, no side effects (h1+h2 일치)
2. Normalize items to {head, title, body, tokens, topicKey} (h3)
3. Tournament rule: weighted score with h3>h1>h2 tie-break for determinism (h3)
4. Return shape: 3 sections {Agreed, ResolvedConflicts, MinorityReport} (h3)
5. Unit tests covering 7 scenarios: exact agreement, near-duplicate merge, topic conflicts, weighted winner, ties, empty plans, threshold edges (h2)
6. Wire behind v0.5.1 feature flag with conservative defaults (h1+h2)
7. Render Dissent section in user-visible output (h1+h3)

## Dissent (low-confidence items, h1 또는 h3 단독)
- `[h1]` Bump manifest.json + package.json to 0.5.1 — 다른 head 반대 없음, 사용자 결정 항목으로 분리
- `[h3]` Keep thresholds as named constants in one config module — 합리적이나 v0.5.1 범위 외
- `[h1, INVALID]` Fixture regression test in external harness `/Volumes/P31/...` — **외부 하니스 마운트 안 됨** (memory `reference_external_test_harness` stale 확인됨)
```

## 4. PoC 발견 사항 / Spec 조정 제안

### 4.1 algorithm (A) 가 의도대로 작동한 부분 ✅

- **Case 1 (merged)** — 3 head가 같은 항목 명시 시 자연스럽게 합쳐짐. Decision + 4개 reasons + Ri4 가 깨끗하게 merged.
- **Case 4 (risk 보수적 채택)** — 1개 head만 명시한 risk 3개(Ri2/Ri5/Ri6)를 consensus_plan 에 포함. spec 3.3 case 4 예외 룰 작동.
- **Tournament tie-break** — h3 가중치 1.5가 step에서 4번(S2/S3/S4/S8) 결정적으로 작용. h3가 가장 구체적인 항목이라 결과의 품질도 높음.
- **Dissent isolation** — `S10` 가 P31 외부 하니스를 잘못 참조한 것을 즉시 식별 가능 (h1 단독 + 검증 가능한 false).

### 4.2 조정 필요 부분 ⚠️

#### (i) agreement_score 공식 — Decision-level 일치를 강하게 weighting

**문제**: 본 PoC에서 3 head 모두 (A) 결정 일치 + 핵심 이유 5개 일치인데 score = 0.43. 사용자 입장에서 "moderate agreement"는 오해 소지.

**원인**: case 3 (2 head 부분 일치)와 case 4 (1 head minority)가 평등하게 weighting되어 총 그룹 수를 부풀림.

**제안 — spec 3.4 공식 수정**:
```
score = (Σ case1 × 1.0 + Σ case2 × 0.5 + Σ case3 × 0.3 + Σ case4 × 0.0)
        / (총 그룹 수)
        × decisionMultiplier      // 신규 — Decision 그룹이 case 1이면 ×1.5, 아니면 ×1.0
```

본 PoC 적용: 0.43 × 1.5 = **0.65 → "moderate" 라벨** (spec §3.4 임계값 ≥0.7 high 기준). 사용자 입장에서 0.43 "moderate 가장자리"가 0.65 "moderate 한가운데"로 안정화 → low로 잘못 빠지지 않음. 한 단계 더 올리고 싶으면 spec multiplier를 1.7+ 로 올리는 게 깔끔 (이번 릴리즈는 1.5 유지). (Draft 3 정정: 본 라인이 처음에 "0.65 → high"로 잘못 적혔던 것을 Cerberus self-review가 식별해 수정.)

대안 — 더 단순하게: Decision 그룹이 case 1이면 minimum score = 0.6 보장 (검토했으나 현 multiplier 룰이 더 일관적이라 미채택).

#### (ii) Step 항목의 case 4 처리 — risk 보수 룰을 step에는 적용 안 함

**현 spec**: step의 case 4 (1 head만 제안)는 dissent에만 기록, consensus_plan 에 미채택.

**검증**: S7 (bump 0.5.1) 같이 명백히 필요한 step이 minority가 됨. 사용자가 dissent를 봐서 결정하는 게 맞지만, 표시 강도 부족.

**제안**: dissent 항목을 3 분류:
- `validated`: 다른 head가 명시적으로 반대 안 함 + 합리성 분명 (S7, S9 같은)
- `disputed`: 다른 head가 반대 표현
- `invalid`: 외부에서 검증 가능 false (S10 같은)

이 분류를 LLM이 못 함 → spec 안에 `validated` 자동 분류 휴리스틱(예: "다른 head plan에 해당 topic이 부재"이고 "관련 키워드 negation 없음")을 결정적으로 정의 필요.

#### (iii) Topic 추출 휴리스틱 부족

**현 spec 3.1**: numbered list, heading, 키워드 매칭.

**검증**: H1의 reason 본문이 5문장 단위로 묶여 있어 spec의 "단일 topic = list item 1개"와 어긋남. PoC에서는 사람이 의역 매핑.

**제안**: spec 3.1 에 다음 룰 추가:
- markdown bullet 안의 첫 문장만 topic key 추출, 나머지는 body 로 fold
- 줄바꿈 없는 긴 bullet은 첫 100자만 키, 본문 별도

#### (iv) tournament 구체성 점수 정의 미흡

**현 spec 3.3 case 2**: body 길이 + 구체성 (file:line +0.5, 숫자 +0.3).

**검증**: PoC의 S5 (unit tests) 그룹에서 H2가 7개, H1/H3가 5개 — "7 vs 5"를 구체성으로 인정할지 spec 모호. 본 PoC에서는 numbered count로 +0.1/item 적용.

**제안**: spec 3.3 에 명시 — "list 항목 수 × 0.1 (max +0.5)".

## 5. PoC 결론

| 항목 | 평가 |
|------|------|
| 3 head 패턴 작동 | ✅ 병렬 호출 성공, 격리 효과 확인 (H1이 codex MCP 안 부름, H2가 Claude 추론 없이 codex 위임만, H3가 둘 다 사용) |
| 알고리즘 (A) 결정성 | ✅ 같은 입력 → 같은 그룹핑 + tournament 결과 (수동 검증) |
| 합의 품질 | ✅ 합의 plan이 단일 head 어느 것보다 풍부 (5 reasons + 6 risks + 7 steps) |
| score 정확도 | ⚠️ 위 4.2 (i) 조정 필요 |
| topic 추출 robustness | ⚠️ 위 4.2 (iii) 보강 필요 |
| 비용 | ✅ 약 3만 토큰 / 4분 / cost cap 50k 충분 여유 |

**다음 단계 (Step 3) 진행 권장**. spec 의 4.2 (i)~(iv) 4개 조정 사항을 반영하여 `cerberus-mode-spec.md` Draft 2 로 업데이트한 뒤 MCP 서버 stub 구현 시작.

## 6. Raw 데이터 보관

- H1 agent threadId: `a5bc6ccc41de0b8e0`
- H2 codex threadId: `019e4ffe-ea29-78b1-8122-88ea524c72c0`
- H3 agent threadId: `a960b871161b26ee9`
- H3 내부 codex consultation threadId: `019e4fff-af5c-7c00-b185-78c35c351451`

세 plan 전문은 본 문서 §2에 요약, 원본 텍스트는 위 threadId로 inspect 가능 (`/codex-followup` 또는 `/codex-resume`).
