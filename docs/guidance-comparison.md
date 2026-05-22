# 3-way 비교 — Claude(α) / Codex CLI(γ) / Claude+Codex(β) 선택 가이드

> **v10 업데이트 (2026-05-22)**: Codex peer review (`019e4e10`) 후 권장사항 재calibration. β-vs-α Lift Leaderboard rename, R6 Format-Safe Handoff 추가.
>
> Evidence: **771+ runs across 217 scenarios** (170 v1-v5 baseline + 35 v6 tiered/real + 12 v7 validation + v5p5 verification).
> Source data: `install/fixtures/bench/_runs/{ALPHABETA-,FULL-,LIFT-,V5-,VERIFY-,V6-,V6R-,V7VAL-}*/`
> Detailed: [`v5-pattern-validation.md`](v5-pattern-validation.md) + [`v6-threshold-analysis.md`](v6-threshold-analysis.md) + [`v7-guidance-validation.md`](v7-guidance-validation.md) + [`v8-validation-sweep.md`](v8-validation-sweep.md)
> Quick reference: [`guidance-quick-ref.md`](guidance-quick-ref.md). Recipes: [`synergy-playbook.md`](synergy-playbook.md). Modes: [`usage-mode-config.md`](usage-mode-config.md).

## ⚠️ v7 validation update (먼저 읽기)

**v7 (2026-05-22)** 3-dim triangulation (claims matrix + Codex review + Devil's advocate) 결과 v6 의 핵심 권장이 **partially refuted**:

- **"α 50-75% sweet spot +22pp"** = **T12 collinearity confound** (6 β-WIN 중 5 가 T12). T12 제거 시 mean Δ ≈ -25pp.
- **"α=95-100% catastrophe -41.5pp"** = **mathematical ceiling artifact** (β-α≤0 boundary-bound). Arm-specific harm 아님.
- **Spearman ρ=-0.732** = **correlation only**, causal 증거 아님.

상세: [`v7-guidance-validation.md`](v7-guidance-validation.md).

### β-synergy by α-actual bucket (v6, N=25) — **exploratory, T12-confounded**

| α 통과율 | mean Δquality | 비고 |
|---|---|---|
| **50-75%** (partial-fail "sweet spot") | **+22.0pp** | ⚠️ T12 collinear, n=5 only |
| 25-50% | +5.2pp | weak |
| 75-95% | -15.6pp | confounded |
| **95-100%** (ceiling) | **-41.5pp** | math artifact, not arm harm |

### v7 calibrated pattern verdicts

| 패턴 | v7 calibration | Confidence |
|---|---|---|
| **P5 Catastrophe** (chain+strict) | v5 -16.3 CI [-32.5, -2.4] (n=18) + v6 multi-template confirm | ★★★ **CONFIRMED robust** |
| **P2 Adversarial framing** | v5 broad +6.1 CI [+1.6, +11.6] (n=19) — robust. v6 T12 +32pp 는 narrow template | ★★ **CONFIRMED population, template-specific lift varies** |
| **NEW α-partial-fail driver** | T12 collinearity, synthetic-only — not yet generalizable | ⚠️ **EXPLORATORY hypothesis** |
| P3 reasoning=high | v5 -6.4 (n=30), v6 -2.5 (n=5) | ❌ **REFUTED in synthetic** |
| P1 Self-review | v4 D1 +29 (complex real, N=3) vs v5/v6 synthetic -13.9 ~ -12.5 | ⚠️ **conditional — complex real-world only** |

## 🎯 1번 의사결정 룰 (v9 calibrated — synergy 극대화 bias)

**Robust 권장 (high confidence)**:
- **Adversarial review = β default ON** (★★★) — +6.1pp CI [+1.6, +11.6] population + cross-domain (T12+JWT+XXE) 입증
- **Multi-step chain + strict JSON output = β 절대 금지** (P5 catastrophe -16 ~ -83pp) — γ rescue 가능
- **β default OFF except**: adversarial review (R1) + complex doc 2-round (R2) + α partial-fail trial (R5)
- 170-scenario mean Δ = -4.37pp (overall population)

**Encouraged (synergy bias)**:
- **α 50-85% 추정 → β cheap trial** (R5, $0.02) — partial-fail evidence: T11-04 +0, T12-04 +20, T13-03 +13, AV01 +30, AV05 +30 (mean +15pp at partial-fail)
- **TDD edge-case followup** (★★) — +16.7pp mechanistic
- **NP-hard reasoning** (★★) — α 가 fail 한 적 있을 때 R3 적용

**Math ceiling (no upside, not harm)**:
- α ≥ 95% 추정 → β 측정값 ≤ α (β-α boundary-bound). β 호출 무의미하지만 catastrophe 아님.

**Withdraw (v6 over-claim)**:
- "Spearman ρ = causal driver" → correlation only
- "다른 모든 요인보다 강력한 predictor" → task type 동등 영향

---

## 📊 결정 트리 (ASCII Flowchart)

```
                    [작업 시작]
                         │
              ┌──────────┴──────────┐
              │   "α 가 이미 100%   │
              │    근접일 것" YES?  │   (ceiling 시나리오)
              └─────────┬───────────┘
                        │ YES              NO
                        ▼                   ▼
                  ┌──────────┐        ┌──────────────────┐
                  │ ✅ α 사용 │        │ "self-review 가  │
                  │  Ceiling │        │  도움 될 task?"  │
                  └──────────┘        └────────┬─────────┘
                                               │
                          YES (iterative refine) │  NO
                          ▼                      ▼
                    ┌──────────┐         ┌─────────────────┐
                    │ ✅ β 사용 │         │ "Multi-step +   │
                    │ D1 패턴  │         │  strict JSON?"  │
                    └──────────┘         └────────┬────────┘
                                                  │
                                YES (catastrophe risk) │ NO
                                  ▼                    ▼
                           ┌────────────┐    ┌────────────────┐
                           │ ✅ γ 사용  │    │ "NP-hard /     │
                           │ E10 패턴  │    │  adversarial?" │
                           │ 형식 안전 │    └────────┬───────┘
                           └────────────┘             │
                                          YES (β-win) │  NO
                                                ▼      ▼
                                          ┌──────┐  ┌──────┐
                                          │ ✅ β │  │ ✅ α │
                                          │ D2/B9│  │ 기본 │
                                          └──────┘  └──────┘
```

---

## 📋 3-way 의사결정 매트릭스

| Task profile | Claude(α) | Codex CLI(γ) | Claude+Codex(β) | 권장 |
|---|---|---|---|---|
| **α 이미 100% (math ceiling)** — B1, B5, B7, B11, B12, D3, D4, E6, E9 | ✅ 안정 | ✅ 동등 | ⚠️ no upside (β-α≤0 boundary) | **α** |
| **Self-review (complex real-world only)** — D1 doc (80+ LOC, 다중 측면) | △ ceiling 미달 (5/8) | ❓ no data | ⚠️ +29pp N=3 (real) / -13pp (synthetic) | **β conditional** — sanity check 4 conditions 필수 |
| **Adversarial / contradiction detect** — B9, hostile prompts | △ 75% | ✅ 100% | ✅ 100% | **β = γ** |
| **NP-hard reasoning** — D2, SAT/CSP | △ 83% | △ 83% | ★ 92% | **β** |
| **TDD with edge cases** — E3 | △ 67% | ❓ | ★ 83% | **β** |
| **Multi-step + strict JSON** — E10 (β catastrophe risk) | ✅ 100% | ✅ 100% (β 회복) | ❌ **β-harmful** -83pp | **α 또는 γ** |
| **Review chain (2-round)** — E2/E4 (β catastrophe risk) | ✅ | ❓ | ❌ β-harmful -14~20pp | **α** (또는 single-round β = T3 부분 회복) |
| **Subagent delegation + strict output** — E7, E10 | ✅ | ✅ (E10) | ❌ -11~-83pp | **α 또는 γ** |
| **Multi-turn debug 5-10 turns** — B6, E8 | ✅ 100% | ❓ stateless | ⚠️ quality 동일, cost +213~384% | **α** |
| **Long-context audit (>20KB)** — E6, E7, E9, E10 | ✅ 100% but big tokens | ✅ (E10) | △ cost 절감, harmful 위험 | **α 또는 γ** |

**범례**: ★★★ 강한 권장 / ★★ 권장 / ★ 약한 권장 / ✅ 작동 / ⚠️ 주의 / ❌ 회피 / ❓ 데이터 없음

---

## 🏆 β-vs-α Lift Leaderboard

> **Renamed from "Pareto Frontier" (v10 Codex peer review)**: γ column informational only — γ measured on **23/217 scenarios**. True 3-way Pareto frontier cannot be computed for γ-unmeasured scenarios. Lift values below are β-vs-α only.

| Rank | Scenario | α | β | γ | β-vs-α | 주의 |
|---|---|---:|---:|---:|---:|---|
| 1 | D1-doc-self-improve | 67% | **96%** | 100% (N=1) | +29 | v4 complex real, synthetic 에서는 reverse |
| 2 | B9-hostile | 75% | 100% | 100% | +25 | β=γ (Codex 단독으로 충분) |
| 3 | E3-tdd-cycle | 67% | **83%** | — | +17 | N=1, γ unmeasured |
| 4 | T3-E4-simplified-chain | 80% | **90%** | — | +10 | adversarial framing T3 회복 |
| 5 | D2-reasoning-depth | 83% | **92%** | 83% | +8 | β > γ on NP-hard |
| 6-26 | (다수 동률) | — | — | — | 0 | majority |
| 27 | E7-multi-log-rca | 100% | 89% | — | -11 | ⚠️ math ceiling artifact |
| 28 | T7anti-D1-stripped | 63% | 50% | — | -13 | self-review removal test |
| 29 | E2-security-harden-loop | 100% | 86% | — | -14 | ⚠️ math ceiling + chain |
| 30 | E4-pr-review-simulation | 80% | 60% | — | -20 | chain catastrophe |
| 31 | **E10-doc-corpus-synthesis** | 100% | **17%** | **100%** | **-83** | ⚠️ chain catastrophe (γ rescues) |

**Pareto interpretation (v7)**:
- **β 가 quality lift**: D1, B9, D2, T3, E3 (5 시나리오, mostly v4 complex). 모두 small N, v7 caution applies.
- **γ 가 catastrophe 회복**: B9 (β=γ), E10 (γ 가 β 의 -83pp 회복). γ data 가 더 많이 필요.
- **ceiling 시나리오는 β 측정 ≤ α** (math, not harm).

---

## 🎯 Synergy 극대화 처방 (DO) — **v7 calibrated**

> **v7 update**: DO 1 (Self-review) verdict 가 v4 (positive) ↔ v5/v6 synthetic (negative) 충돌. **Complex real-world** 시나리오에 한정해 권장.

### ⚠️ DO 1 — Self-review loop (조건부, complex real-world only)

**언제 적용**: 문서 작성, 코드 review **이면서** src 가 충분히 복잡 (실제 production code 200+ LOC, 다중 측면).

**Evidence**:
- ✅ v4 D1 (TenantThrottle real complex): **+29pp N=3 일관**
- ❌ v5 T01 (synthetic doc): **-31pp** (반대 방향)
- ❌ v5 P1 broad: **-13.9pp** (n=20)

**prompt 템플릿** (D1 의 검증된 구조):
```markdown
1. Round 1 — /codex-review on [target]
2. Apply revisions
3. Round 2 — /codex-followup on same thread: "any remaining issues?"
End with: { "review_rounds": 2, "thread_id": "<uuid>", ... }
```

**예상 lift**: complex real 에서 +20~+40pp (D1 evidence). Synthetic 에서는 reverse (-13pp 평균).

**⚠️ 적용 전 체크**: src 가 80+ LOC + 5+ documentable sections + α 가 단발에 < 100% 통과 예상 → 모두 YES 일 때만.

### ★★★ DO 2 — Adversarial framing (default ON for review tasks)

**Most-validated β-WIN pattern** — v5 broad +6.1pp CI [+1.6, +11.6] (n=19) + v6 T12 +32pp + v8 AV01 JWT +30pp + v8 AV05 XXE +30pp = **cross-domain confirmed**.

**언제 적용**: **모든 review task default**. 특히 contradiction / subtle bug hunt 가능성 있을 때.

**prompt 템플릿**:
```markdown
/codex-review with adversarial framing:
"Find subtle correctness bugs that follow from the semantics, not surface issues.
Specifically: contradictions, off-by-one, hidden assumptions, missing edge cases,
[bug class for this task: e.g., timing attack / SQL injection / race condition]."
```

**예상 lift**: +6~+30pp (broad CI valid).

**Recipe pointer**: `synergy-playbook.md` §R1.

### ★★ DO 3 — High-reasoning escalation (D2 패턴)

**언제 적용**: NP-hard, constraint satisfaction, 알고리즘 정답성, 복잡한 추론

**prompt 템플릿**:
```markdown
Invoke mcp__codex__codex with sandbox=read-only, reasoning=high.
Ask Codex to:
1. Enumerate constraints/requirements step-by-step BEFORE solving
2. Solve
3. Self-verify each constraint AFTER

Combine Codex output with your own verification.
```

**예상 lift**: +5~+15pp (D2 +8.3pp N=2, γ 보다 우위)

### ★ DO 4 — TDD edge-case followup (E3 패턴)

**언제 적용**: 실패 테스트 → impl → 추가 edge case 필요한 흐름

**prompt 템플릿**:
```markdown
1. /codex-fix to implement [target_file] to pass [test_file]
2. /codex-followup on same thread: "what 2 edge cases am I missing?"
3. Add Codex-suggested edge cases to test file
4. Verify all pass
```

**예상 lift**: +15~+20pp (E3 +16.7pp N=1)

---

## 🚫 Synergy 보호 처방 (AVOID)

이 4 가지 안티 패턴은 β quality 를 손상. **회피하거나 다른 arm 으로 이동**.

### ❌ DO NOT 1 — Multi-step chain + strict JSON 출력 (**Chain-JSON Trap**)

**Hard rule — β 호출 금지** (v5 CI [-32.5, -2.4], n=18 + v6 T14 -41pp + T15 -62pp + v4 E10 -83pp).

**탐지 신호** (ANY of):
- Prompt 가 3+ 단계 numbered list
- 출력이 fenced ```json 의 4+ 필드 검사
- E10 패턴: subagent delegation + 위 두 조건

**Mitigation** (선택):
1. **단순화**: chain → single-round (T3 가 E4 -20pp → +10pp 회복)
2. **α 직접**: synthesize (T2 가 E10 -83pp → 0pp 회복)
3. **γ rescue**: Codex CLI 직접 (E10 γ=100% recovery) — **R4 Hot-Swap** recipe

### ❌ DO NOT 2 — Subagent delegation + strict output (**Subagent-Strict Trap**)

**Hard rule — 금기** (v5 + v6 E7, E10 -11 ~ -83pp 일관).

**탐지 신호**: `codex-reviewer` agent invocation + strict JSON output schema.

**Mitigation**: main Claude 직접 처리 OR γ 직접 호출 (R4).

### ❌ DO NOT 3 — Multi-turn 5+ turns without new context (**Turn Burn**)

**Concrete stop rule**: **β multi-turn followup 은 3 턴 후 멈춘다 unless new context arrives**.

**탐지 신호**:
- 5+ followup turns
- 각 turn 이 새 정보 추가 안 함 (Codex 가 같은 답변 반복)

**손해**: quality 동일 + cost +213~+384% (B6 N=3, E8 N=1).

**Mitigation**: 단일 Claude 세션에서 큰 prompt 로 합치기. Long thread 가 정말 필요하면 명시적 새 context 추가 시에만 turn 진행.

### ❌ AVOID 4 — Ceiling 시나리오에서 β 호출

**탐지 신호**: 동일 task profile 에서 α 가 이전에 100% 통과한 경우

**예상 손해**: cost 만 ↑, quality lift 0 (B1/B5/B7/B11/B12 등 다수)

**우회**: 명확한 lift 신호 (위 ★ DO 1-4) 없으면 α 사용

---

## ⚖️ 사례 매핑 — Worked Examples

### Example 1 — "SKILL.md 신규 문서 작성" (v10 calibrated)
- **Profile**: doc authoring, output prose-heavy
- **Conditional check**: src 가 ≥5KB OR ≥5 documentable sections OR 200+ LOC 인가?
- **신호 매치**:
  - YES (complex real-world doc) → **β with R2 self-review × 2 rounds** (+20~40pp expected, D1 pattern)
  - NO (simple synthetic doc) → **α single-pass** (v5/v6 evidence: synthetic 에서 -13pp reverse)

### Example 2 — "50KB 코드베이스에서 보안 이슈 탐지"
- **Profile**: large input + 단발 audit + α 가 보통 100% (B5/B7 패턴)
- **신호 매치**: ceiling (대부분의 audit 가 100%) + AVOID 4
- **추천**: **α** (Claude 단독). 대안: γ (Codex CLI) cost 절감 + 동등 quality

### Example 3 — "6 markdown 문서에서 아키텍처 종합"
- **Profile**: long-context (~35KB) + strict JSON 출력 + synthesis
- **신호 매치**: AVOID 1 (E10 catastrophe risk)
- **추천**: **α 단발 read + synthesize** (T2 가 0pp 로 회복) 또는 **γ** (E10 γ=100% 회복)

### Example 4 — "Constraint satisfaction puzzle 풀기"
- **Profile**: NP-hard reasoning, multi-constraint, α 가 fail 한 적 있음
- **신호 매치**: DO 3 (high-reasoning escalation)
- **추천**: **β with mcp__codex__codex reasoning=high** (D2 +8pp)

---

## 신뢰도 요약

| Pattern type | High confidence | Medium | Low / TBD |
|---|---|---|---|
| β-WIN | D1 self-review (N=3 + T7anti causal) | B9 adversarial (N=1), D2 reasoning (N=2), E3 TDD (N=1) | — |
| β-HARMFUL | E10 catastrophe (N=1 + T2 recovery confirm) | E2/E4 chain (N=1) | E7 RCA (N=1) |
| γ-WIN | E10 γ recovers (1 strong signal) | B9 γ=β (N=1) | D2 γ<β (single comparison) |
| α 충분 | Ceiling (N=11+ 시나리오) | Multi-turn redundancy | — |

---

## 함께 보세요

- [guidance-claude-only.md](guidance-claude-only.md) — α 가 충분한 경우 + β-harmful 회피
- [guidance-codex-only.md](guidance-codex-only.md) — γ 의 강점 + β catastrophe 우회
- [guidance-claude-orchestrates-codex.md](guidance-claude-orchestrates-codex.md) — β-WIN 4 가지 처방 + Skill 별 매트릭스
- [test-results-alpha-vs-beta-full-2026-05-20.md](test-results-alpha-vs-beta-full-2026-05-20.md) — v2 full sweep raw 데이터
