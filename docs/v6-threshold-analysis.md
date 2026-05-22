# v6 Threshold Analysis — α-Partial-Fail Rate 가 β-Synergy 의 진짜 Driver

> Date: 2026-05-21
> Sample: 25 v6 tiered scenarios × α/β × N=2 = 100 runs.
> RUN_ID: V6-20260521T082731Z
> Method: Spearman correlation + α-actual bucket analysis.

## TL;DR

**v6 새 가설 CONFIRMED**: β-win 의 진짜 driver 는 src complexity 가 아니라 **α 의 task partial-fail rate**.

- **Spearman ρ = -0.732** (α_actual vs Δpp): 강한 음의 상관
- **β-WIN sweet spot = α 50-75%** (mean +22pp)
- **β-harmful zone = α 95-100% (ceiling)** (mean -41.5pp)

## Synergy by α-actual bucket (핵심 표)

| α range | N | mean Δpp | 해석 |
|---|---:|---:|---|
| 25-50% (severely under) | 4 | **+5.2** | β 가 약간 회복 도움 |
| **50-75%** (partial-fail sweet spot) | 5 | **+22.0** | ★ **β 최대 효과** |
| 75-95% (mostly success) | 4 | **-15.6** | β 가 오히려 손상 |
| 95-100% (ceiling) | 12 | **-41.5** | ★ **catastrophic** |

→ **β 호출의 가치는 α 의 partial-fail probability 에 의해 결정** — 다른 모든 요인 (src complexity, task type) 보다 강력한 predictor.

## β-WIN 시나리오 (n=6)

전체 25 시나리오 중 6 개가 Δpp > 5 (β-WIN). 모두 **α 가 partial-fail** 상태:

| Scenario | Template | α | β | Δ | 패턴 |
|---|---|---|---|---|---|
| T12-03 | adversarial review | 60% | **100%** | **+40** | partial-fail + adversarial |
| T12-01 | adversarial review | 40% | 70% | +30 | partial + adversarial |
| T12-04 | adversarial review | 60% | 90% | +30 | partial + adversarial |
| T12-02 | adversarial review | 70% | 100% | +30 | partial + adversarial |
| T12-05 | adversarial review | 70% | 100% | +30 | partial + adversarial |
| T13-03 | reasoning | 88% | 100% | +13 | near-ceiling + hard reasoning |

**관찰**: 6 β-WIN 중 5 개가 T12 (adversarial review). v5 의 P2 adversarial CONFIRMED 가 v6 에서도 일관 (+32pp mean for T12 template).

## β-HARM 시나리오 (n=15)

대부분 α=100% ceiling 시나리오 (12/15):

| Scenario | α | β | Δ | 패턴 |
|---|---|---|---|---|
| T14-02 | 100% | 20% | **-80** | synthesis chain catastrophe |
| T15-03 | 100% | 25% | -75 | TDD chain |
| T15-01 | 100% | 33% | -67 | TDD chain |
| T15-02 | 100% | 33% | -67 | TDD chain |
| T15-05 | 88% | 25% | -63 | TDD chain |
| T14-05 | 100% | 50% | -50 | synthesis chain |
| T14-01 | 100% | 63% | -38 | synthesis catastrophe |
| T15-04 | 100% | 63% | -38 | TDD chain |
| T11-01 | 100% | 67% | -33 | self-review on simple |
| T14-03 | 100% | 75% | -25 | synthesis chain |
| T11-02 | 60% | 40% | -20 | self-review on partial |
| T14-04 | 100% | 86% | -14 | synthesis chain |
| T13-01 | 88% | 75% | -13 | reasoning near-ceiling |
| T13-02 | 100% | 88% | -13 | reasoning ceiling |
| T11-05 | 50% | 41% | -9 | self-review on partial |

**관찰**:
- α=100% ceiling scenarios are systematically β-harmful
- Chain-heavy templates (T14 synthesis, T15 TDD) hit catastrophe
- Self-review (T11) doesn't help even when α partial-fails — confirms v5 finding

## Per-template β 효과

| Template | mean α% | mean β% | mean Δpp | β 활용 권장? |
|---|---:|---:|---:|---|
| **T12 Adversarial review** | 60.0 | **92.0** | **+32.0** | ✅ **권장** |
| T13 Hard reasoning | 92.5 | 90.0 | -2.5 | ⚠️ 약함 (ceiling 영향) |
| T11 Self-review doc | 56.6 | 44.1 | -12.5 | ❌ 비권장 (synthetic 한정) |
| T14 Multi-doc synthesis | 100.0 | 58.6 | **-41.4** | ❌❌ **catastrophe** |
| T15 TDD chain | 97.5 | 35.8 | **-61.7** | ❌❌ **catastrophe** |

## v4/v5/v6 패턴 통합 verdict

| Pattern | v4 (1 시나리오) | v5 (n≥10) | v6 (n=25) | 최종 |
|---|---|---|---|---|
| **P2 Adversarial framing** | B9 +25 | +6.1 (n=19) | +32.0 (n=5 T12) | ★★★ **CONFIRMED 일관** |
| **P3 reasoning=high** | D2 +8 | -6.4 (n=30) | -2.5 (n=5 T13) | ⚠️ **WEAK** — context-dependent |
| **P1 Self-review** | D1 +29 | -13.9 (n=20) | -12.5 (n=5 T11) | ❌ **REFUTED** in synthetic |
| **P5 Catastrophe** (chain + strict) | E10 -83 | -16.3 (n=18) | -41.4 (T14), -61.7 (T15) | ★★★ **CONFIRMED 강력** |
| **NEW**: α-partial-fail driver | — | (가설 등장) | +22pp at α 50-75% | ★★★ **CONFIRMED in v6** |

## 정량 임계점 (가이던스 v3 용)

### β 사용 의사결정 룰

**조건 A** (α-fail-rate 기반):
```
α 예상 점수 < 50%    → β 호출해도 회복 제한적 (broken)
α 예상 점수 50-75%   → ★ β 호출 권장 (sweet spot, mean +22pp)
α 예상 점수 75-95%   → β 비권장 (-15pp 평균)
α 예상 점수 95-100%  → β 절대 금지 (-41pp 평균, catastrophe)
```

**조건 B** (task type 기반):
```
Adversarial review (T12)          → β 강력 권장 (+32pp 일관)
Catastrophe risk (T14 synthesis,
T15 multi-step TDD)               → β 절대 금지 (-41 ~ -62pp)
Self-review on doc/code           → src 충분히 복잡 + α partial-fail 시만
```

### 실용 체크리스트

β 호출 전:
- [ ] α 가 이 task profile 에서 100% 가깝게 통과하는가? → YES 면 **β 호출 금지** (ceiling)
- [ ] Task 가 multi-step chain + strict JSON output 인가? → YES 면 **β 호출 금지** (catastrophe)
- [ ] α 가 50-75% 통과 예상되는 partial-fail 영역인가? → YES 면 **β 호출 권장** (sweet spot)
- [ ] Task 가 adversarial review (contradiction / subtle bug hunt)? → YES 면 **β 강력 권장**

## 통계적 caveat

1. **Sample size**: 25 시나리오, n=2 per condition. 더 큰 N=3 검증이 이상적.
2. **α actual 이 target 과 다름**: 가령 T11-02 target=90% actual=60%. dial 절대값 calibration 추가 필요.
3. **T12 의 +32pp 가 강하게 통계 풀을 끌어올림**: T12 제외 시 전체 mean Δ ≈ -25pp. **카테고리 종속성 명확**.
4. **Synthetic vs real**: v6 모두 synthetic. v6 Phase 1b (real codebase) 후속 검증 필요.

## 가이던스 v3 변경 가이드

- `guidance-claude-only.md`: α 95-100% ceiling 시나리오 = α default 권장 (강화)
- `guidance-claude-orchestrates-codex.md`: β 권장 조건 = **α partial-fail 50-75% AND task is adversarial review (T12 pattern)**
- `guidance-comparison.md`: 새 decision tree — "α 가 partial-fail 할 것인가?" 가 가장 첫 질문

## 결론

**v5 의 "Synthetic-vs-Complex" 메타-finding** 은 v6 에서 더 정확하게 refine 되었다:

> ❌ β-win 의 driver 는 src complexity (LOC/file count) 가 아니다.
>
> ✅ β-win 의 driver 는 **α 의 task partial-fail rate** (~50-75% 가 sweet spot).
>
> 그리고 **task type 이 가장 강한 multiplier** — T12 adversarial 은 sweet spot 에서 +32pp lift, T14/T15 chain 은 partial-fail 에서도 catastrophe.

→ v3 가이던스의 권장 조건은 **"α 가 부분적으로 fail 할 가능성이 있는 adversarial review task"** 로 정량 narrow 됨.
