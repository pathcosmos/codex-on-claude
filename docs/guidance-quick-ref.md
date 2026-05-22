# Quick Reference — Claude(α) / Codex+Claude(β) / Codex CLI(γ) 선택

> **30 초 의사결정 카드**. 상세는 `guidance-comparison.md`. Recipes: `synergy-playbook.md`. Mode 옵션: `usage-mode-config.md`.
>
> **이 카드는 `usageMode = synergy` (기본) / `auto` 의 default rule**. `mode=none` 은 모든 호출 차단, `mode=max` 는 R1/R5 default + γ hot-swap auto — 둘 다 본 룰을 상위 정책으로 감싸지만 hard DO-NOT 룰 (P5/Subagent/Turn-Burn) 은 mode 와 무관하게 유지.

## 🚦 3-Question Decision Tree (Codex-reviewed order)

```
Q1. α 가 이 task 에서 ≈100% 통과 예상 (ceiling)?
    │
    ├─ YES → ✅ Use α. β 가 lift 만들 여유 없음 (math: β-α ≤ 0).
    │        ⚠️ 단, "complex code review with subtle bug suspicion" 면 R1 trial 가능 — α의 통과는 surface-level 만일 수 있음.
    │
    └─ NO ↓
Q2. Task 가 ANY 신호 보유? — multi-step chain (≥2 numbered steps) + structured output (JSON / YAML / strict schema / 4+ fields)
    │
    ├─ YES → ❌ DO NOT call β orchestration.
    │        Catastrophe risk -16~-83pp (P5 confirmed).
    │        Mitigation: α direct read+synth, OR γ (Codex CLI 직접, R4), OR R6 Format-Safe Handoff
    │
    └─ NO ↓
Q3. Task 가 adversarial defect-finding review (subtle bug / contradiction / security audit)?
    │
    ├─ YES → ✅ **TRY β with adversarial framing** (R1).
    │        "Find bugs from semantics, not surface. Look for {specific bug class}."
    │        Expected: +6 ~ +30pp (P2 cross-domain confirmed).
    │        ⚠️ 제외: style review, summarization, known-ceiling 큰 audit
    │
    └─ NO ↓
Q4. α partial-fail 예상 (50-85%)?
    │
    ├─ YES → ⚠️ **β cheap trial** (R5). adjudication: Codex 가 source-grounded 구체 issue 제시 시만 채택 (numeric threshold 아님).
    │
    └─ NO → α default.
```

**Edge cases (Codex peer review 발견)**:
- 2-step chain + strict JSON: Q2 의 "≥2 steps" 포함 (이전 ≥3 threshold 는 너무 느슨)
- YAML/schema/CSV output: Q2 의 "structured output" 포함 (JSON 만이 아님)
- Long-context audit (>20KB): Q1 ceiling check 우선, 결과 ceiling 이면 α 또는 γ

## ✅ DO Recipes (synergy 극대화)

| Recipe | 언제 | Cost | Expected Lift |
|---|---|---|---|
| **R1 Adversarial framing** | defect-finding review (subtle bug / security / contradiction) | $0.02-0.05 | **+6~+30pp** (★★★) |
| **R2 Self-review × 2 rounds** | complex real-world doc/code (≥5KB **OR** ≥5 documentable sections **OR** 200+ LOC) | $0.10-0.20 | +20~+40pp (conditional) |
| **R3 reasoning=high** | α 가 1회 fail 한 적 OR 답이 외부 verifiable (test pass / proof) | $0.05-0.15 | +5~+15pp (NOT 일반 추론) |
| **R4 γ hot-swap** | β chain catastrophe 의심 시 (Q2 YES) | $0.30-0.50 | β -83pp → γ 100% recovery |
| **R5 Cheap β trial** | α partial-fail 예상 시 (50-85%) | $0.02 | adopt only if Codex finds **source-grounded** issue (verified, not numeric Δ) |
| **R6 Format-Safe Handoff** ★신규 | structured output 필요 + adversarial framing 원할 때 | $0.05 | bypass Chain-JSON Trap (Codex prose → Claude format) |

## ❌ DO NOT (hard rules)

| Anti-pattern | Why | Mitigation |
|---|---|---|
| **P-Chain-JSON Trap** (≥3 steps + strict JSON output) | -16 ~ -83pp confirmed (n=18 CI [-32.5, -2.4]) | α direct OR γ rescue |
| **P-Subagent-Strict** (codex-reviewer + strict JSON) | -11 ~ -83pp (E7, E10) | main Claude 직접 OR γ |
| **P-Turn-Burn** (5+ followup turns, 새 정보 없이) | quality 동일 + cost +213-384% | **3 턴 후 stop unless new context** |
| **P-Self-Review-Synth** (synthetic / simple src 에 2-round) | -13.9pp (n=20) | synthetic 에는 single-round 또는 skip |

## 📊 Confidence (N + 95% CI)

| 권장사항 | N | CI / 신뢰도 |
|---|---|---|
| P-Chain-JSON Trap 회피 | 18 | CI [-32.5, -2.4] **High** |
| Adversarial framing β-WIN | 19 broad + 7 cross-domain | CI [+1.6, +11.6] **High** |
| β default OFF 일반 | 170 | mean -4.37pp **High** |
| Self-review (conditional) | 3 (real) + 20 (synth) | mixed evidence — **conditional** |
| Sweet spot 50-85% | 7 (T12+AV) at partial-fail | +22~+30pp **Medium-High** |
| α=95-100% no-upside (math) | 12 | tautological boundary **High** |

## 🔄 명시 caveat

1. **γ data scarce**: 23/217 시나리오만 γ 측정. Pareto / 3-way 비교 시 γ unmeasured 영역 caution.
2. **Synthetic vs real**: D1 (+29pp) 같은 큰 lift 는 complex real-world 한정. Synthetic 에서는 reverse.
3. **T12 collinearity**: v6 sweet spot 의 5/6 = T12, 하지만 AV01 (JWT) + AV05 (XXE) 가 cross-domain 입증.
4. **Cost stance**: synergy = **quality 우선**. Cost 정보는 P-Turn-Burn 같은 anti-pattern 식별에만 사용.

## 🏃 Speed run (60 초)

```
1. "chain + strict JSON?" 체크 (10초)
2. "adversarial review?" 체크 (10초) → YES 면 R1 적용 (40초)
3. NO 면 "α 가 100% 통과?" 체크 (10초) → YES α / NO R5 trial (40초)
```

상세: `synergy-playbook.md` → `guidance-comparison.md` → `v8-validation-sweep.md`.
