# v9 Phase 0 — Practitioner Audit Feedback

> Date: 2026-05-22
> Method: Sub-agent (general-purpose) read 4 guidance docs as new user with zero prior context. Goal: assess practicality + synergy-maximization bias.

## TL;DR

**3 가지 critical issues**:

1. **Decision time ≥ 3-5 min** (target 60s 못 미침) — 4+ doc hops required for "should I use self-review?"
2. **Strongly anti-β bias** — synergy-maximization goal 과 정반대 방향. 사용자가 반사적으로 α 선택.
3. **Self-review (D1/P1) 자체 모순 미해결** — 같은 doc 안에서 ★★★ + REFUTED.

**LOOSEN 권장 (3개)**:
- Adversarial framing → ★★ → ★★★ (default ON for review tasks)
- α partial-fail bucket → encourage trial (downside bounded)
- TDD followup → ★ → ★★ (try first, fall back)

**TIGHTEN 권장 (3개)**:
- P5 chain+strict → soft "회피" → **hard "DO NOT" bold**
- Subagent + strict output → "caution" → **prohibition**
- Multi-turn ≥5 → soft "회피" → **concrete "STOP at turn 3" rule**

## Verbatim Feedback (essential)

### A. Decision Speed
**No** — under 60s 불가능. Longest path: 4+ document hops. **Realistic time: 3-5 minutes minimum**.

### B. β Bias Balance
**Strongly discourages β**. Receipts:
- "β-harmful 21% > β-win 12% → default α"
- "β default = OFF / opt-in"
- gate requires **all 4 conditions** to fire β
- Counter-bias 약함 (DO 2 adversarial 만 unconditional)
→ **반사적으로 α 선택**. Adversarial review +22pp (line 23) 가 "T12 confounded" warnings 에 묻힘.

### C. Top 3 Confusing Parts
1. **Self-review (D1) contradiction**: 같은 doc 에서 "★★★ High confidence" + "조건부 REFUTED"
2. **Ceiling reframing 불일치**: "math artifact" 라면서 -41.5pp evidence 표 유지
3. **γ visibility**: "only 23/205" caveat 후에도 Pareto table β-vs-α ranking 진행

### D. Missing Actionable Bits
- **1-screen decision card**: 3 Y/N → arm
- **Named anti-patterns**: "Chain-JSON Trap", "Turn Burn", "Sweet-Spot Mirage"
- **Copy-paste recipes** per Skill (one file)
- **Cost stance** 명확화 (quality-only? cost-quality balance?)
- **"If only one paragraph"** TL;DR at top

### E. LOOSEN
1. **Adversarial framing (DO 2)**: +6.1pp CI valid + cross-domain → **★★★ + default ON for review tasks**
2. **α partial-fail trial**: downside bounded by α baseline → **encourage trial**
3. **TDD followup (E3)**: +16.7pp mechanically sensible → **★★, try first**

### F. TIGHTEN
1. **P5 catastrophe (AVOID 1)**: "회피 방법" (soft) → **bold "DO NOT call β"**
2. **Subagent + strict (AVOID 2)**: "주의" → **prohibition**
3. **Multi-turn ≥5 (AVOID 3)**: "회피" → **"STOP at turn 3 unless new context"** concrete rule
4. **Single-round self-review**: "Anti-pattern" but doc still positive → **"either 2 rounds or skip"**

## Action Items (Phase 1-4 입력)

### Phase 1 (adjustment spec) 에 반영
- LOOSEN 3 + TIGHTEN 4 = **7 specific edits** to 4 guidance docs

### Phase 2 (quick-ref) 에 반영
- 3 Y/N decision tree (1-screen)
- Named anti-patterns (P-Chain, P-Burn, P-Ceiling, P-Mirage)
- Top of comparison.md 에 "If only one paragraph" TL;DR

### Phase 3 (playbook) 에 반영
- R1-R5 recipes 모두 copy-paste 가능
- Adversarial recipe 가 default 위치
- Cost stance "quality first + cost mention" 일관 명시

### Phase 4 (in-place update) 에 반영
- Self-review contradiction 해결: 한 곳만 정답 (conditional, real-world)
- Ceiling 표현 일관성: math, not catastrophe
- γ ranking 명시: "β-vs-α only, γ unmeasured" 헤더에
