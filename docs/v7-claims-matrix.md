# v7 Claims Matrix — 가이던스 8 문서의 모든 정량 claim 추출

> v7 Phase 0 산출.
> 각 claim 의 evidence backing + confidence + cross-doc consistency 검증용.

## Claims Matrix (모든 정량 권장사항)

| # | Source doc | Claim (quantitative) | Evidence (시나리오 + N) | Confidence | Cross-doc consistent? |
|---|---|---|---|---|---|
| **C01** | guidance-comparison §β-synergy by α bucket | "α 50-75% → β +22pp (sweet spot)" | T11-T15 n=5 (v6) | **Medium** (N=5 small) | ✅ v6-threshold §16 일치 |
| **C02** | guidance-comparison | "α 25-50% → β +5.2pp" | T-series n=4 (v6) | Low (N=4) | ✅ v6-threshold |
| **C03** | guidance-comparison | "α 75-95% → β -15.6pp" | T-series n=4 (v6) | Low (N=4) | ✅ |
| **C04** | guidance-comparison | "α 95-100% → β -41.5pp catastrophe" | T-series n=12 (v6) | **High** (N=12) | ✅ |
| **C05** | guidance-comparison | "Spearman ρ = -0.732" | v6 T-series n=25 | **High** | ✅ |
| **C06** | guidance-comparison | "Adversarial framing universal +32pp" | T12 n=5 (v6) | Medium (N=5) | ⚠️ v5-pattern-validation: P2 = +6.1 (n=19) — **수치 불일치** |
| **C07** | guidance-comparison | "Self-review (P1) REFUTED in synthetic, -13.9pp (n=20)" | v5 n=20 | High | ⚠️ **자체 모순**: guidance-comparison §Pareto 와 §DO 1 은 D1 +29pp 를 ★★★ 권장으로 유지 |
| **C08** | guidance-comparison | "Multi-step chain + strict = -16.3pp (n=18)" | v5 + v6 T14 -41, T15 -62 | **High** | ✅ |
| **C09** | guidance-comparison | "γ recovers from β catastrophe (E10 100%)" | E10 γ n=1 | **Low** (N=1) | ✅ guidance-codex-only |
| **C10** | guidance-comparison §Pareto | "D1 self-review +29pp 일관 N=3" | D1 n=3 | High | ⚠️ **자체 모순**: 같은 문서 §확정 패턴에서는 D1 REFUTED in synthetic |
| **C11** | guidance-claude-orchestrates §TL;DR | "v5 mean Δquality = -4.37pp (170 scenarios)" | v5 sweep | **High** | ✅ guidance-claude-only |
| **C12** | guidance-claude-orchestrates §Pattern 1 | "Self-review = 최강의 β-win, +29pp N=3" | D1 n=3 | High in real, **REFUTED in synthetic** | ⚠️ **자체 모순**: same doc TL;DR (line 15) says "조건부 — 복잡 src 한정" |
| **C13** | guidance-claude-orchestrates §Pattern 2 | "Adversarial: B9 +25pp, T3 +10pp 회복" | n=2 | Low | ⚠️ guidance-comparison §확정에서는 +32pp (v6 T12) — **다른 값** |
| **C14** | guidance-claude-orchestrates §임계점 체크 | "β 사용 조건: src ≥ 5KB + α<50% + prose-heavy + chain ≤ 3" | 정성적 | TBD | ⚠️ "α<50%" 가 새 sweet spot (50-75%) 와 충돌 |
| **C15** | guidance-claude-only §TL;DR | "β-win 12%, tie 67%, β-harmful 21% (170 scenarios)" | v5 | **High** | ✅ |
| **C16** | guidance-codex-only | "γ catastrophe recovery: E10 γ=100%" | E10 n=1 | Low (N=1) | ✅ |
| **C17** | guidance-codex-only | "B9 γ=β=100%" | B9 γ n=1 | Low | ✅ |
| **C18** | v5-pattern-validation | "P2 Adversarial: +6.1pp (n=19, 95% CI [+1.6, +11.6])" | v5 N=19 | **High** | ⚠️ guidance-comparison 의 "+32pp" 와 **수치 불일치 (다른 sample)** |
| **C19** | v5-pattern-validation | "P5 Catastrophe: -16.3pp (n=18, 95% CI [-32.5, -2.4])" | v5 N=18 | **High** | ✅ |
| **C20** | v5-pattern-validation | "Mean Δquality 170 scenarios = -4.37pp" | v5 | High | ✅ |
| **C21** | v5-meta-findings | "Self-review loop = 인과적 (T7anti -42pp 가 reverse 증명)" | T7anti n=2 | High | ⚠️ v5 REFUTED + v6 -12.5pp 와 의미상 충돌 (synthetic 에서 인과성 안 보임) |
| **C22** | v5-meta-findings | "β-generation = ORACLE quality 최고 (LB 11/13 vs LA 3/13)" | v5 N=39 | Medium | ✅ (자체 closed loop) |
| **C23** | v6-phase0-finding | "D1 C=2, D2 C=2, E3 C=3 (low complexity)" | complexity-metric | High | ✅ v6-threshold |
| **C24** | v6-phase0-finding | "α의 partial-fail rate (50-95%) 이 진짜 driver" | reasoning | Medium (직접 측정은 v6 Phase 2) | ✅ |
| **C25** | v6-threshold §결론 | "α partial-fail rate 이 다른 모든 요인 보다 강력한 predictor" | v6 sweep | **Medium-High** | ⚠️ **자체 모순**: 같은 doc 의 per-template summary 는 task type (T12 +32 vs T14 -41) 가 가장 큰 spread — task type 이 strongest factor 처럼 보임 |
| **C26** | v6-threshold | "R-series Spearman ρ = -0.794" | R01-R10 n=10 | Medium (N=10) | ✅ |
| **C27** | v6-threshold §Real codebase | "Real codebases 모두 α=100% ceiling → β-harmful (-19pp avg)" | R01-R10 N=10 | High | ⚠️ **반증 가능성**: ORACLE strictness 문제일 수 있음 (자체 인정) |
| **C28** | v6-threshold | "β-WIN at α 50-75% sweet spot universal" | T-series N=5 | Medium | ⚠️ R-series 에서 검증 안 됨 (모두 ceiling 이어서) |

---

## 발견된 Internal Inconsistency (자체 모순)

### 🚨 모순 1: Self-review (P1) Pattern verdict

**guidance-comparison.md** 안에 같은 패턴에 대한 **3 가지 다른 verdict**:
- Line 32 (확정 패턴): "P1 Self-review = ❌ REFUTED in synthetic, -13.9pp"
- Line 95 (의사결정 매트릭스): "Self-review iterative refinement → ★★★ +29pp 일관 N=3 → β 사용"
- Line 136 (Synergy 극대화 처방): "★★★ DO 1 — Self-review loop, 예상 lift +20~+40pp (D1 +29pp N=3 일관)"
- Line 273 (신뢰도 요약): "β-WIN: D1 self-review (N=3 + T7anti causal)" — High confidence

**guidance-claude-orchestrates-codex.md** 안에서도:
- Line 15 (TL;DR): "Self-review = ⚠️ 조건부 — 복잡 src 한정"
- Line 39 (Pattern 1): "Self-review = ★ 최강의 β-win"

→ **같은 문서 내에서도 동일 패턴 verdict 가 v4 (positive) ↔ v5/v6 (refuted) 사이 충돌**.

### 🚨 모순 2: Adversarial (P2) +pp 수치

- guidance-comparison §확정 패턴: "P2 Adversarial = +32pp (v6 T12 n=5)"
- v5-pattern-validation §P2: "+6.1pp (n=19, 95% CI [+1.6, +11.6])"
- guidance-claude-orchestrates §Pattern 2: "+25pp (B9 N=1) + +10pp (T3) 회복"

**3 가지 다른 effect size** — 같은 패턴이지만 sample 다름. **각각 명시 안 됨**.

### 🚨 모순 3: α partial-fail "강력한 predictor" 주장

- v6-threshold §TL;DR: "α partial-fail rate 가 다른 모든 요인보다 강력한 predictor"
- v6-threshold §Per-template summary: T12 (+32) vs T14 (-41) — **73pp spread** by task type
- 두 dimension 의 변동량 비교 시 task type 이 더 큰 effect

→ "다른 모든 요인보다 강력" 주장은 **데이터로 비교 안 한 over-claim**.

### 🚨 모순 4: γ data 양

- guidance-comparison §β-vs-γ comparison: γ N≥3 시나리오 사용
- guidance-codex-only TL;DR: "γ N=4 시나리오만" 명시 (more conservative)
- v5p5 sweep 에서 γ 추가 19개 — guidance-codex-only 가 v5p5 결과 미반영

### 🚨 모순 5: "α<50%" 조건 vs "α 50-75% sweet spot"

- guidance-claude-orchestrates §임계점 체크 (line 29): "α 가 단발에서 < 50% 통과 또는 부분 실패"
- guidance-comparison §1번 룰: "α 50-75% 가 sweet spot"

→ **α<50% (broken)** 영역이 v6 에서는 β 별 도움 안 됨 (+5pp). guidance-orchestrate 의 조건이 잘못됨.

---

## Cross-doc Numerical Consistency Check

| Pattern | guidance-comparison | guidance-orchestrate | v5-pattern | v6-threshold | 일관? |
|---|---|---|---|---|---|
| P1 Self-review | +29pp/v4 + REFUTED/v5/v6 | 최강 β-win + 조건부 | -13.9pp (n=20) | -12.5pp (n=5) | ❌ |
| P2 Adversarial | +32pp (v6) | +25/+10 (v4) | +6.1pp (n=19) | +32 (T12) | ⚠️ sample different OK 하지만 명시 부족 |
| P3 reasoning=high | -2.5 (v6 T13) | +8 (D2) → 조건부 | -6.4pp (n=30) | -2.5 (n=5) | ⚠️ |
| P5 catastrophe | -16.3 + -41 + -62 | -41 ~ -62 | -16.3pp (n=18) | -41 ~ -62 | ✅ |
| P7 subagent | -5.1 (v5) | -11/-83 (v4) | -5.1pp (n=14) | mild | ✅ |
| α=95-100% catastrophe | -41.5 (T n=12) | (조건만 명시) | — | -41.5 (n=12) | ✅ |
| α 50-75% sweet spot | +22.0 (T n=5) | (sweet spot 미명시) | — | +22.0 (n=5) | ✅ (orchestrate doc 에 명시 추가 필요) |

---

## Confidence Scoring

| Confidence | Criteria | Count |
|---|---|---|
| **High** | N ≥ 15 + ≥ 2 docs 인용 일관 | C04, C05, C08, C11, C15, C18, C19, C20, C23 = **9** |
| **Medium** | N ≥ 5 + 단일 doc 인용 | C01, C02, C03, C06, C09, C24, C25, C26, C27, C28 = **10** |
| **Low** | N ≤ 4 또는 self-contradictory | C07, C10, C12, C13, C14, C16, C17, C21, C22 = **9** |

**위험**: 9 개 (32%) 의 권장사항이 Low confidence — 가이던스 신뢰도 substantial issue.

---

## 권장 수정 (Phase 6 입력)

### 우선순위 P0 (즉시 수정 필요)
1. **guidance-comparison.md §Pareto + §DO 1 + §신뢰도** — D1 self-review 권장을 "조건부 (복잡 real-world src)" 로 다운그레이드
2. **guidance-claude-orchestrates §Pattern 1** — "최강의 β-win" 표현 제거, "조건부 (synthetic 에서 -13.9pp)" 명시
3. **guidance-claude-orchestrates §임계점 체크** — "α<50%" 를 "α 50-75% sweet spot" 으로 수정

### 우선순위 P1 (sample size 명시 필요)
4. P2 Adversarial 의 +pp 값들 (-6.1 vs +32) 가 sample 다름을 명시 — "v5 broad sweep mean = +6, v6 T12 narrow = +32"
5. C25 "다른 모든 요인보다 강력" 표현을 "약한 predictor" 또는 "task type 과 비슷한 강도" 로 약화
6. C09, C16, C17 의 γ claim 에 "N=1, 추가 검증 필요" 명시

### 우선순위 P2 (consistency)
7. v5p5 γ broad sweep 결과를 guidance-codex-only 에 반영 (γ N=4 → N=23)
8. 모든 doc 헤더의 Spearman ρ 표기 통일 (-0.73 vs -0.732)
