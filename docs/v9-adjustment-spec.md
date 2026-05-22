# v9 Adjustment Spec — A (Reinforce) + B (Loosen) Detailed Edits

> Phase 1 산출. Practitioner audit feedback (`v9-practitioner-feedback.md`) 와 v1-v8 evidence 종합.

## 변경 사양 (7 edits)

### TIGHTEN 4 (reinforce hard rules)

| # | Doc | Section | BEFORE | AFTER | 근거 |
|---|---|---|---|---|---|
| T1 | guidance-comparison.md | §AVOID 1 line 204-216 | "회피 방법: 단순화 / α / γ" (soft) | **"❌ DO NOT call β"** (bold) + 3 mitigation paths | E10 -83pp + v5 CI [-32.5, -2.4] (n=18) + T14 -41 + T15 -62 generalize |
| T2 | guidance-claude-orchestrates-codex.md | §AVOID 2 line 199-204 | "사용 주의" | **"❌ 금기"** + prohibition | E7, E10 -11 ~ -83pp |
| T3 | guidance-comparison.md | §AVOID 3 line 226-232 | "회피: 더 큰 prompt 로 합치기" | **"STOP at turn 3 unless new context arrives"** + concrete stop rule | B6 +213%, E8 +384% cost, 0 quality |
| T4 | guidance-claude-orchestrates-codex.md | §Pattern 1 line 64 | "단일 round 로는 lift 안 됨" + 주변 positive | **"single round = no lift; either 2 rounds (complex real) OR skip"** | v8 + v4 자체 evidence |

### LOOSEN 3 (encourage β trial)

| # | Doc | Section | BEFORE | AFTER | 근거 |
|---|---|---|---|---|---|
| L1 | guidance-comparison.md | §DO 2 line 154-165 | "★★ Adversarial framing" | **"★★★ Adversarial framing — default ON for any review task"** + recipe pointer | v5 +6.1 CI [+1.6, +11.6] (n=19) + v8 AV01/AV05 cross-domain |
| L2 | guidance-comparison.md | §1번 룰 line 38-43 | "α 50-75% sweet spot" | **"α 50-85% partial-fail trial 권장"** (R5 reference) | v8 AV01 α=70% +30pp |
| L3 | guidance-claude-orchestrates-codex.md | §Pattern 4 (TDD E3) | "★ TDD edge-case followup" | **"★★ TDD followup — try first"** + recipe | +16.7pp N=1 mechanistically sensible |

### Self-review Contradiction Resolution (1 fix)

| # | Doc | Action |
|---|---|---|
| SR1 | guidance-claude-orchestrates-codex.md §Pattern 1 + §신뢰도 | **단일 verdict** 로 통일: "★ conditional — complex real-world 에서 +20~+40pp, synthetic 에서는 reverse (-13pp). Sanity check 4 conditions 필수." 신뢰도 표에서 "High" 제거, "Conditional - context-dependent" 로. |

### Ceiling Reframing Consistency (1 fix)

| # | Doc | Action |
|---|---|---|
| CR1 | guidance-comparison.md, guidance-claude-only.md | "-41.5pp catastrophe" mentions → 모두 "**β-α 가 ≤ 0 boundary (math, not arm-specific harm)**" framing. Pattern verdict 표의 "P5 Catastrophe" 와 "α=95-100% Ceiling" 명확 분리 (P5 는 real catastrophe, 95-100% 는 math ceiling). |

### γ Visibility (1 fix)

| # | Doc | Action |
|---|---|---|
| GV1 | guidance-comparison.md §Pareto frontier 헤더 | "**β-vs-α ranking only. γ measured on 23/217 scenarios — Pareto comparison incomplete.**" 헤더 명시. |

## Phase 4 적용 순서

1. **guidance-comparison.md**: T1, T3, L1, L2, CR1, GV1 (6 edits)
2. **guidance-claude-orchestrates-codex.md**: T2, T4, L3, SR1 (4 edits)
3. **guidance-claude-only.md**: CR1 일부 (multi-turn cost-only framing)
4. **guidance-codex-only.md**: 이미 v7 에서 γ N=23 반영됨, additional R4 hot-swap recipe pointer 만 추가

## Success Criteria

- consistency-check.mjs 재실행 시 self-contradiction 0개
- guidance-quick-ref.md 의 3-Q tree 가 docs 와 일관
- synergy-playbook.md 의 R1-R5 모두 docs 에서 명시 지원
