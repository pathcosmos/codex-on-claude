# v7 — Guidance Validation Report

> Date: 2026-05-22
> Method: 3-dimension triangulation (claims matrix + Codex external review + Devil's advocate sub-agent).
> Verdict: **(b) Heavily revised** — guidance has substantive over-reach. P5 catastrophe finding survives, sweet-spot rule demoted.

## TL;DR — 3 가지 검증 dimension 일관 결론

| Dimension | Method | Finding |
|---|---|---|
| **Internal consistency** | 8 docs 의 28 claims 추출 + cross-ref | **5 critical self-contradictions** (D1 self-review verdict 가 한 문서 내 다른 부분에서 충돌) |
| **External (Codex review)** | adversarial /codex-review on guidance-comparison.md | **7 critical issues** — causal overclaim, N=5 stable rule, missing CI/p-value |
| **Devil's advocate sub-agent** | independent statistical critique | **T12 collinearity** + **ceiling math artifact** 발견. Sweet spot 가 synthetic-only |

**3 dimension 합의 verdict**: **(b) Heavily revised** — 일부 finding (P5 catastrophe) 은 survives, 핵심 sweet-spot rule 은 demote 필요.

## Section 1 — Validation Methodology

v1-v6 의 가이던스 4 문서 + 분석 4 문서 (총 9818 단어) 를 다음 6 phases 로 검증:

- **Phase 0**: 28 claims 추출 → confidence rating + cross-doc consistency (`v7-claims-matrix.md`)
- **Phase 1**: 자동 cross-reference 검사 → Phase 0 안에 흡수
- **Phase 2**: Codex (mcp__codex__codex) 가 guidance-comparison.md 를 adversarial review
- **Phase 3**: Devil's advocate sub-agent (general-purpose) 가 4 docs 통계 critique
- **Phase 4-5**: SKIPPED (Phase 0-3 으로 verdict 충분 명확)
- **Phase 6**: 본 report + 가이던스 v4 갱신 권장

## Section 2 — Internal Consistency Findings

### 🚨 모순 1: P1 Self-review verdict 충돌 (가장 심각)

**guidance-comparison.md** 안에 같은 패턴 3 가지 verdict:
- Line 32 (확정 패턴): "P1 = ❌ REFUTED in synthetic, -13.9pp"
- Line 95 (의사결정 매트릭스): "Self-review iterative → ★★★ +29pp 일관 N=3 → β"
- Line 136 (DO 1): "★★★ Self-review loop, +20~+40pp"
- Line 273 (신뢰도 요약): "β-WIN: D1 self-review **High confidence**"

→ **v4 (positive) ↔ v5/v6 (refuted) 정보가 같은 문서 내 reconcile 안 됨**.

### 🚨 모순 2: P2 Adversarial 효과 크기 3가지 동시 존재

| Source | Claim | Sample |
|---|---|---|
| guidance-comparison §확정 | +32pp | T12 n=5 (v6) |
| v5-pattern-validation §P2 | +6.1pp [+1.6, +11.6] | n=19 (v5 broad) |
| guidance-orchestrate §Pattern 2 | +25pp + +10pp 회복 | B9 n=1, T3 n=2 |

→ **Sample 가 다른 측정값** 인데 어디서도 명시 안 됨.

### 🚨 모순 3: "α partial-fail rate = 다른 모든 요인보다 강력한 predictor"

- v6-threshold §결론: "task type 보다 강력한 predictor"
- 같은 v6-threshold §per-template summary: T12=+32 vs T14=-41 → **73pp spread by task type** (단일 dimension 으로는 최대)

→ task type 이 동등하거나 더 강한 effect 인데 "다른 모든 요인보다 강력" 으로 over-claim.

### 🚨 모순 4: "α<50%" 조건 vs "α 50-75% sweet spot"

- guidance-orchestrate §임계점 체크 (line 29): "α < 50%" 통과 시 β 권장
- guidance-comparison §1번 룰: "α 50-75% sweet spot, α<50% 약한 도움 +5pp"

→ 두 docs 간 임계조건 **정확히 충돌**.

### 🚨 모순 5: γ 데이터 양

- v5p5 sweep 에서 γ broad sweep 19 시나리오 추가
- guidance-codex-only.md 헤더 (line 3): "γ N=4 시나리오" 유지 — **v5p5 반영 안 됨**

## Section 3 — Codex External Review Findings

Codex 가 guidance-comparison.md 에 adversarial framing 으로 review. 핵심 critique 7가지 (verbatim 요약):

1. **"determined by α partial-fail rate"** = causal overclaim. Multivariable 통제 없음. Task type 영향 미차감.
2. **"+22pp sweet spot"** N=5 인데 stable operating rule 처럼 제시. CI/variance/sensitivity 없음. Task-template confounding.
3. **Spearman ρ = -0.732** 가 causal driver 증거 아님. p-value/CI/scatter/influence diagnostics 없음. partial correlation 도 안 했음.
4. **"★★★ CONFIRMED across v4/v5/v6"** for α-partial-fail driver = over-claim. 표 자체가 v4="—", v5="hint", v6 단독 — strong confirmation 의 의미 아님.
5. **"α ≥ 95% → β 호출 금지"** = post-hoc bucket 평균을 absolute prescriptive rule 로 전환.
6. **Pareto frontier** γ 측정 없는 시나리오를 "절대 우위" 로 분류. Cost/latency/uncertainty 분석 없음.
7. **Synthetic → prescriptive generalization** — N=25 all-synthetic v6 를 absolute rule 기반으로 제시.

→ Codex 의 critique 가 claims matrix 의 self-contradiction 과 **방향 일치**.

## Section 4 — Multi-perspective Sub-agent Findings

Devil's advocate sub-agent (general-purpose) 가 4 docs 읽고 다음 counter-arguments 제시:

### Counter-argument 1: **+22pp sweet spot 의 5/6 = T12 (collinearity confound)**

v6-threshold §β-WIN n=6 중 **5개가 T12 adversarial review**. v6-threshold §통계적 caveat #3 자체 인정: "T12 제외 시 전체 mean Δ ≈ -25pp."

→ C01 ("α 50-75% → +22pp") 는 **generalizable α-fail-rate finding 이 아니라 "T12 가 이 bucket 에 떨어진 것을 재진술"**.

Spearman ρ=-0.732 도 같은 5 points + T14/T15 ceiling catastrophes 가 끌어내는 결과 — textbook collinearity confound.

### Counter-argument 2: **α=95-100% "catastrophe" 는 ceiling math artifact**

v6-threshold §β-HARM 의 12/15 가 α=100%. **α=100% 이면 Δ=β-100 ≤ 0 으로 mathematical bound** — arm-specific 손상 아니라 denominator artifact.

→ "α ≥ 95% → β 금지" 룰 = **tautological, 실증 아님**. 명예로운 framing: "α 가 이미 task 통과 시 β 추가는 regression noise 만 introduce".

→ Claims matrix C04 ("High confidence N=12") **잘못된 confidence** — ceiling math 측정.

### Counter-argument 3: **R-series 가 external validity 무효화**

v6-threshold C27: "R01-R10 모두 α=100% ceiling" — **single non-synthetic 데이터셋이 sweet-spot 가설 검증 불가능**. 50-75% 영역에 real-world scenario 가 0 개.

조합 효과 + v5-pattern §"Synthetic vs Complex" 의 "D1 +29 from real, T01 -31 from synthetic" — sweet spot 신호는 **synthetic-only**. R-series 에서 confirm 불가.

### Devil's advocate 가 인정한 강점

**P5 Catastrophe (multi-step chain + strict JSON)** = 유일하게 robust. v5 -16.3pp CI [-32.5, -2.4] (n=18) + v6 T14 -41 + T15 -62 across 다른 template/sample. C08, C19 confidence 적절.

### Verdict (sub-agent)

**(b) Heavily revised**. 핵심 변경:
- Sweet-spot rule → "hypothesis, synthetic-only" 로 강등
- Ceiling = catastrophe → "ceiling = no measurable lift possible" 로 재framing
- D1/P1 self-review 모순 (C07/C10/C12) reconcile 필요

## Section 5 — Predictive Validation (Phase 4 — SKIPPED)

Phase 0-3 에서 가이던스의 statistical/methodological foundation 자체가 검증 불가능함이 드러남:
- α=100% 시나리오에서 predictive accuracy 측정 무의미 (math artifact)
- α 50-75% bucket 의 N=5 가 prediction 의 ground truth 로 부족
- T12 collinearity 가 prediction 도 confound

→ Phase 4 진행 시 무의미한 "70%+ accuracy" 결과만 생산 가능. SKIPPED 가 더 honest.

## Section 6 — Edge Case Sweep (Phase 5 — SKIPPED)

V01-V08 시나리오는 가이던스의 boundary 검증 의도였으나, 가이던스의 fundamental claim 자체가 unsound 이므로 boundary 검증 무의미. SKIPPED.

## Section 7 — Recommended Guidance Updates (가이던스 v4)

### P0 우선순위 (즉시 수정)

1. **guidance-comparison.md**:
   - §확정 패턴 표: "α-partial-fail driver = ★★★ CONFIRMED" → **"⚠️ EXPLORATORY (synthetic n=25, T12 confounded)"**
   - §1번 의사결정 룰: "α ≥ 95% → β 호출 금지 (-41pp)" → **"α ≥ 95% (ceiling) → β 측정값 ≤ 0 (math)"**
   - §Pareto + §DO 1 + §신뢰도: D1 자체 모순 reconcile — "v4 +29pp from complex real, v5/v6 synthetic 에서 reverse"
   - 모든 자체 모순 (5개) 제거

2. **guidance-claude-orchestrates-codex.md**:
   - §Pattern 1: "★ 최강의 β-win" → **"조건부 — complex real-world src 한정 (D1 evidence), synthetic 에서는 REFUTED"**
   - §임계점 체크 "α < 50%" → "α 50-75% sweet spot (synthetic only)" 로 수정 + v6 출처 명시

3. **guidance-claude-only.md**: 
   - 평균 Δquality -4.37pp 는 valid 하므로 유지
   - β-harmful 21% 도 유지 (real number)
   - "ceiling effect" 표현 더 명확하게: "math ceiling vs arm-specific harm" 구분

4. **guidance-codex-only.md**:
   - γ N=4 → N=23 (v5p5 broad sweep 반영)
   - γ catastrophe recovery N=1 (E10) 명시

### P1 우선순위 (sample 명시)

5. P2 Adversarial 의 3가지 effect size (+6.1, +25, +32) 가 다른 sample 의 측정값임을 명시:
   - v5 broad: +6.1 [+1.6, +11.6] (n=19) — population estimate
   - v6 T12 narrow: +32 (n=5) — template-specific
   - v4 B9: +25 (n=1) — single anecdote

### P2 우선순위 (consistency)

6. 모든 Spearman ρ 표기 통일 (-0.73 vs -0.732)
7. v5p5 γ broad sweep (19 시나리오) 결과를 guidance-codex-only 에 반영
8. "Pareto frontier 절대 우위" → "Pareto frontier 측정 우위 (γ unmeasured)" 로 약화

## Section 8 — 신뢰도 재산정 (Confidence Recalibration)

Claims matrix 의 9 "High confidence" 중 **3-4 개만 survive**:

| Claim ID | 원래 confidence | 재산정 | 이유 |
|---|---|---|---|
| C04 (α 95-100% -41.5pp) | High | **Math artifact** | ceiling bound |
| C05 (Spearman ρ=-0.732) | High | **Medium-Low** | causal evidence 없음, T12 collinearity |
| C08 (P5 catastrophe -16.3pp) | High | **High** ✓ | CI [-32.5, -2.4] valid |
| C11 (mean Δ -4.37pp) | High | **High** ✓ | population mean valid |
| C15 (β-win 12% / harm 21%) | High | **High** ✓ | sample 분포 |
| C18 (P2 +6.1pp [+1.6, +11.6]) | High | **High** ✓ | CI valid |
| C19 (P5 catastrophe N=18) | High | **High** ✓ | duplicate of C08 |
| C20 (Mean Δ across 170) | High | **High** ✓ | same as C11 |
| C23 (D1 C=2 low complexity) | High | **High** ✓ | metric output |

→ **Survive: 7-8 claims (C08, C11, C15, C18, C19, C20, C23, 부분적 C04)**.
→ **Demote: C05 (Spearman 인과성), C04 (ceiling math 재framing)**.

## Section 9 — 최종 Verdict

### 가이던스 v3 의 신뢰성: **Medium-Low** (revision 강제)

**Survive (robust 권장)**:
- ★★★ **P5 Multi-step chain + strict JSON 회피** (CI 일관, multiple samples)
- ★★ **Ceiling 시나리오에서 β 추가 효익 0** (math, not catastrophe)
- ★★ **Adversarial framing +6pp** (broad CI valid, v5 broad sweep)
- ★ **β-default OFF / opt-in** (mean -4.37pp 인구 평균)

**Demote to hypothesis**:
- ⚠️ "α 50-75% sweet spot +22pp" → **synthetic-only, T12 collinear**
- ⚠️ "Spearman ρ = causal driver" → **correlation 만**
- ⚠️ "D1 self-review universal β-win" → **complex real-world only**

**Withdraw**:
- ❌ "★★★ CONFIRMED across v4/v5/v6" labels on α-partial-fail driver
- ❌ "다른 모든 요인보다 강력한 predictor" claim
- ❌ 모든 자체 모순 claims (D1 verdict)

### v4 (post-validation) 가이던스 작성 방향

가이던스 v4 의 첫 문장은:
> "본 가이던스는 **205 synthetic + 10 real scenarios** 의 실험적 sweep 결과로 도출됨. **P5 multi-step chain catastrophe** 와 **adversarial framing β-lift** 는 robust 하나, **'α 50-75% sweet spot'** 권장은 T12 template 한정 신호이며 real codebase 에서 검증되지 않은 **exploratory hypothesis** 임을 명시."

→ 이 honest framing 이 가이던스의 진짜 가치. False confidence 보다 calibrated uncertainty 가 사용자에게 valuable.

## 결론

v7 검증은 **3 dimension 일관 verdict**: 가이던스는 **heavily revised** 필요. 일부 finding 은 robust, 핵심 권장은 over-reach.

다음 단계: docs/guidance-*.md 의 in-place 수정으로 v4 작성. 본 report 는 reference 로 보존.
