# 가이던스 — Claude→Codex 오케스트레이션(β) 이 최선인 경우

> **v5 업데이트 (2026-05-21)**: 170 시나리오 / 614+ runs 통계 검증 후 권장사항 대거 수정.
>
> Evidence: 614+ runs, 170 scenarios. **Bootstrap 95% CI 검증**.
> Detail: [`v5-pattern-validation.md`](v5-pattern-validation.md) + [`v5-meta-findings.md`](v5-meta-findings.md).

## ⚠️ TL;DR (v5 수정)

**v4 의 4 가지 β-win 패턴 중 2 개 REFUTED in synthetic scenarios**. β-win 은 src/ 가 충분히 복잡할 때만 일어남.

| Pattern | v4 | v5 (170 시나리오) | 권장 |
|---|---|---|---|
| Adversarial framing | +25pp (B9) | **+6.1pp (n=19, 95% CI [+1.6, +11.6])** | ✅ **권장** — 안정 lift |
| Self-review loop | +29pp (D1 N=3) | −13.9pp (n=20) | ⚠️ **조건부** — 복잡 src 한정 |
| reasoning=high | +8pp (D2) | −6.4pp (n=30) | ⚠️ **조건부** — α 가 fail 한 진짜 hard 만 |
| TDD followup | +17pp (E3) | −4pp (n=16) | ⚠️ **약함** — 더 검증 필요 |
| Multi-step + strict JSON | −83pp (E10) | **−16.3pp confirmed** | ❌ **회피** — 강력 anti-pattern |
| Subagent 위임 | −11pp (E7) | −5.1pp confirmed | ⚠️ **주의** |

**170 시나리오 평균 Δquality = −4.37pp**. β 는 default 가 아니라 **선택적 / 조건부** 도구.

## v5 의 SYNTHETIC vs COMPLEX 임계점 (핵심)

v4 의 β-win 시나리오 (D1, D2) 는 모두 **실제로 복잡한 src/** 위에서 발생. 합성 / 단순 src/ 에서는 정반대 (−31pp ~ −10pp). β 의 추가 layer 가 "complex case 에서 missed detail 식별" 가능할 때 lift, 단순 case 에서는 noise/format-loss 발생.

**β 사용 전 임계점 체크**:
- ☐ src/ ≥ 5KB OR 다중 측면 (e.g., 5+ documentable sections, 10+ methods, multi-file)
- ☐ α 가 단발에서 < 50% 통과 또는 부분 실패 이력 있는 task profile
- ☐ Output 이 prose-heavy (strict JSON ratio < 0.5)
- ☐ Chain length ≤ 3 (chain ≥ 4 + strict = catastrophe)

위 4 조건 **모두 만족** 시에만 β 의 P1/P3/P4 권장 적용. 1 개라도 안 맞으면 α 사용.

---

## ✅ β-WIN 패턴 (호출 권장 — v7 calibrated)

> **v7 update (2026-05-22)**: Self-review (P1) verdict 가 v4 (positive D1+29pp) ↔ v5/v6 synthetic (-13.9pp REFUTED) 사이 conflict. 두 evidence 모두 valid 한 다른 sample. 정확한 framing 은 **"complex real-world src 에서 자연발생, synthetic 에서 reverse"**. 자세한 사항: [`v7-guidance-validation.md`](v7-guidance-validation.md).

### Pattern 1 — **Self-review loop** ⚠️ **조건부** (synthetic 에서는 REFUTED)

**v4 evidence (complex real)**:
- **D1-doc-self-improve**: α=66.7% N=3, β=95.8% N=3 → **+29.2pp** in complex doc-authoring
- **T7anti** (D1 strip self-review): β=50%, α=62.5% → -12.5pp — self-review 제거 시 reverse

**v5/v6 evidence (synthetic)**:
- T01 (synthetic doc-authoring): mean **-31pp** (반대 방향, n=10)
- T11 (v6 α-fail dial doc): mean **-12.5pp** (n=5)
- v5 P1 broad: **-13.9pp** (n=20)

**해석**: D1 의 +29pp 는 reproducible (N=3 일관) 하지만, **synthetic doc-authoring 에서는 반대 방향**. 진짜 driver 는 self-review loop 자체가 아니라 **task complexity + spec implicitness 가 충분히 높은 real-world src**. 단정 권장 불가.

**적용 신호**:
- 작업이 본질적으로 **iterative refinement** (문서 작성, 다단계 review)
- 초안 → 검토 → 수정 → 재검토 흐름이 자연스러운 task
- `output_strict_ratio < 0.5` (형식이 너무 strict 하지 않음)

**적용 prompt 패턴** (D1 의 검증된 구조):

```markdown
1. 초안 작성 — 5 섹션 (Description / How-to / Guardrails / MUST / Edge cases) 포함
2. `/codex-review` (Round 1) — Codex 에 "누락된 섹션, 모호한 부분, 빠진 edge case 를 지적해줘"
3. Codex finding 을 반영해 revision
4. `/codex-review` (Round 2, 같은 threadId) — "남은 blocker 없음" 확인
5. 최종 출력

End with: { "review_rounds": 2, "thread_id": "<uuid>", ... }
```

**Anti-pattern**: 단일 round review (`/codex-review` 한 번만) 으로는 lift 안 됨. **두 번의 round 가 핵심**.

### Pattern 2 — **Adversarial detection on review**

**증거**:
- **B9-hostile** (모순 제약 4 개): α=75%, **β=100% → +25pp**
- **T3-E4-simplified-chain** (E4 +adversarial framing): α=80%, β=90% → **+10pp** (E4 base 의 -20pp 에서 +30pp 회복)

**적용 신호**:
- review 대상에 **숨겨진 모순 / 미묘한 버그** 가 있을 수 있는 task
- 단순 surface check 가 아닌 **deep correctness check** 필요
- "find blockers AND subtle bugs that follow from the diff, not just what's in it" 류 prompt 효과

**적용 prompt 패턴** (T3 검증):

```markdown
/codex-review with adversarial framing:
"Find blockers AND subtle correctness bugs that follow from the change, not just what's in it.
Specifically: contradictions, off-by-one, missing edge cases, hidden assumptions."
End with: { "issues_found": [...], "merge_recommendation": "block"|"approve-with-changes"|"approve" }
```

**Anti-pattern**: 일반적 review prompt ("review this code") 만으로는 lift 안 됨. **adversarial framing 명시 필요**.

### Pattern 3 — **NP-hard reasoning with `reasoning=high` MCP**

**증거**:
- **D2-reasoning-depth** (constraint puzzle): α=83.3% N=2, **β=91.7% N=2 → +8.3pp**
- **γ 비교**: γ=83.3% N=1 (β > γ by 8.3pp). β 의 MCP path 가 γ direct 보다 강함.

**적용 신호**:
- NP-hard / constraint satisfaction / SAT-like 문제
- α 가 단발 reasoning 으로 fail 한 적 있는 task profile
- 다중 검증이 필요한 알고리즘 정답성 문제

**적용 prompt 패턴**:

```markdown
Invoke mcp__codex__codex with sandbox=read-only, approval-policy=never, reasoning=high.
Ask Codex to:
1. Enumerate constraints step-by-step BEFORE solving
2. Solve
3. Mentally verify each constraint AFTER placement
Then combine with your own verification.
```

**γ 대신 β 사용 이유**: γ 도 reasoning=high 가능하지만 D2 에서 γ < β. β 의 추가 verification layer (Claude 가 받아서 자체 검증) 가 catch rate 를 올림.

### Pattern 4 — **TDD with edge-case followup**

**증거**:
- **E3-tdd-cycle**: α=66.7%, **β=83.3% → +16.7pp**

**적용 신호**:
- 실패 테스트 → impl → 추가 test cases 필요한 흐름
- Codex 가 "내가 놓친 edge case" 를 surface 할 수 있는 도메인 (코드 분석)

**적용 prompt 패턴**:

```markdown
1. /codex-fix (sandbox=workspace-write, allowlist=['<impl_file>']) — 실패 테스트 통과하도록 impl
2. /codex-followup (same thread) — "내가 놓친 edge case 2 개 만 알려줘"
3. Codex suggest 한 edge case 를 테스트 파일에 추가
4. node test.js 로 verify
```

---

## ❌ β-HARMFUL 패턴 (호출 금지)

이 패턴들에 해당하면 **β 가 quality 를 손상**. Claude 단독(α) 또는 Codex 단독(γ) 으로 가야 함.

### Anti-pattern 1 — **Multi-step chain + strict JSON 형식** (catastrophe)

**증거 (가장 강한 부정 신호)**:
- **E10-doc-corpus-synthesis**: α=100%, **β=16.7% → -83.3pp**
- **E4-pr-review-simulation**: α=80%, **β=60% → -20pp**
- **E2-security-harden-loop**: α=100%, **β=85.7% → -14.3pp**

**공통 패턴**:
- β prompt 가 3+ steps 의 chain (`Round 1 → Round 2 → ...`)
- 출력이 strict JSON 5+ fields 또는 형식 검사 strict
- `output_strict_ratio > 0.4` AND `chain_length > 3`

**원인**: 다단계 prose 끝에서 LLM 이 trailing fenced ```json 블록을 누락 또는 잘못된 JSON 출력. ORACLE 의 형식 검사 5+ 가 모두 실패.

**회피 방법**:
- 단일 round 로 단순화 (T3 E4 가 -20pp → +10pp 회복)
- 또는 chain 유지하되 형식 검사를 prose 검사로 완화
- 또는 γ (Codex CLI 직접) 사용 (E10 γ=100% 회복)

### Anti-pattern 2 — **Subagent delegation with strict output**

**증거**:
- **E7-multi-log-rca**: α=100%, **β=88.9% → -11.1pp**
- **E10**: subagent + chain + strict = catastrophe (-83pp)

**원인**: `codex-reviewer` subagent 가 받은 요약을 main Claude 가 재포장하면서 detail 손실 + 형식 망각.

**회피 방법**:
- Subagent 위임 시 출력 형식 검사 완화
- 또는 large input 을 chunk 로 나눠 main Claude 가 직접 처리
- 또는 γ 직접 사용 (E10 evidence)

### Anti-pattern 3 — **Multi-turn followup with no new info per turn**

**증거**:
- **B6-followup** (5 turns): α=100%, β=100% — quality 동일, β cost +213%
- **E8-long-thread-debug** (10 turns): α=100%, β=100% — quality 동일, β cost +384%

**원인**: 5-10 턴 정도는 Haiku 의 자체 컨텍스트로 충분. β 의 thread persistence 는 cost 추가만.

**회피**: thread 카탈로그 / sticky persistence 가 필요한 작업은 10+ turns 이상으로 명확한 long-context 일 때만.

### Anti-pattern 4 — **Ceiling effect**: α 가 이미 100%

α 가 이미 ORACLE 통과율 100% 면 β 의 lift 가능성 0. 11+ 시나리오에서 검증됨. **이런 task profile 에서는 β 호출 자체가 무의미**.

---

## Skill 별 활용 권장 매트릭스

본 sweep 에서 관찰된 각 codex-on-claude Skill 의 synergy 기여:

| Skill | β-win 증거 | β-harmful 증거 | 권장 사용처 (v9 calibrated) |
|---|---|---|---|
| `/codex-review` (adversarial framing) | B9 +25, AV01 +30, AV05 +30, T12 +32, v5 broad +6.1 CI [+1.6, +11.6] | E2/E4/E10 (chain 내) | **★★★ default for review tasks** (R1) |
| `/codex-review` (×2 self-review) | D1 +29pp **complex real only** | v5 synth -13.9pp, T11 synth -31pp | ⚠️ **conditional** — complex real-world 80+ LOC AND α partial-fail 시만 |
| `/codex-fix` | E3 +16.7pp | E2 -14pp (chain 내), P-Chain-JSON Trap | TDD impl, 단일 파일 fix |
| `/codex-followup` | E3 +16.7pp | B6/E8 multi-turn redundant | **★★ try first** (R3/R4 chain) — Turn Burn (3+ turns no info) 방지 |
| `/codex-analyze` + `/codex-improve` | D4 +0pp, 정성 가치 | — | 사용 패턴 발견 (offline) |
| `codex-reviewer` subagent | — | E10 -83pp, E7 -11pp | **❌ 금기** — Subagent-Strict Trap (formal output 과 결합 금지) |

---

## 의사결정 체크리스트

다음 신호 중 **2 개 이상** 해당하면 **β 사용 권장**:

- [ ] 작업이 iterative refinement (self-review × 2 rounds) 자연스러운가?
- [ ] 입력에 모순 / 미묘한 버그 / 적대적 요소 가능성이 있는가?
- [ ] NP-hard / constraint / SAT 류 hard reasoning 필요한가?
- [ ] 실패 테스트가 있고, 추가 edge case 가 필요한 TDD 흐름인가?
- [ ] α 가 이전에 동일 task 에서 < 100% 성능이었는가?

**위 신호 하나도 없고 + α 가 보통 100% 인 task profile** → α 사용 권장 (guidance-claude-only.md 참조).

---

## 신뢰도 (Confidence — v9 calibrated)

| Pattern | Evidence | N | Confidence |
|---|---|---|---|
| **Adversarial framing β-WIN** | v5 broad +6.1 CI [+1.6, +11.6] + v6 T12 +32 + v8 AV01 JWT +30 + v8 AV05 XXE +30 | 19 + 5 + 2 = **26 cross-domain** | **★★★ High** (most validated) |
| **Chain+strict catastrophe** | v5 -16.3 CI [-32.5, -2.4] + v6 T14 -41 + T15 -62 + E10 -83 | 18 + multi-template | **★★★ High** (재현 + recovery 둘 다 입증) |
| Self-review loop (D1) | v4 +29pp N=3 complex real; v5/v6 synthetic -13~-31pp | mixed evidence | **⚠️ Conditional** — context-dependent (complex real only) |
| reasoning=high MCP (D2) | v4 +8.3pp N=2; v5/v6 synth -2.5~-6.4 | mixed | ⚠️ Conditional (hard α-fail problems only) |
| TDD edge-case followup (E3) | +16.7pp N=1 mechanistic | 1 | **★★ Medium** (try first per R3/R4) |
| α=95-100% no-upside | math boundary β-α≤0 | 12 | **★★★ High** (tautological) |

---

## 실용 가이드 — codex-on-claude 설치 옵션

β 활용 극대화하려면:

```sh
codex-on-claude --patterns=review,followup,fix \
  --context-policy=mixed \
  --improvement-loop=auto-on-skill \
  --threads=full \
  --yes
```

- `patterns=review,followup,fix`: D1 self-review, E3 followup, E2 fix 모두 사용 가능
- `context-policy=mixed`: codex-reviewer subagent 도 가능 (단, 형식 strict task 는 주의)
- `improvement-loop=auto-on-skill`: PostToolUse 자동 로그로 패턴 누적
- `threads=full`: thread 카탈로그 활성 (sticky persistence)

---

## 함께 보세요

- [guidance-claude-only.md](guidance-claude-only.md) — α 가 충분한 경우 (β-harmful 회피)
- [guidance-codex-only.md](guidance-codex-only.md) — β catastrophe 패턴의 γ 우회 방법
- [guidance-comparison.md](guidance-comparison.md) — 3-way 의사결정 트리
