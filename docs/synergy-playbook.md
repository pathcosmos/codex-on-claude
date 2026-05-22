# Synergy Playbook — 5 Recipes for Claude+Codex 시너지 극대화

> Practical copy-paste recipes. Quick reference: `guidance-quick-ref.md`. Detailed analysis: `v8-validation-sweep.md`.

## R1 — Adversarial Framing (★★★ default for review tasks)

**언제**: Code review, security audit, contradiction detection, subtle bug hunt.

**왜**: v5 P2 broad sweep mean +6.1pp [+1.6, +11.6] (n=19). v6 T12 +32pp narrow. v8 AV01 JWT + AV05 XXE 모두 +30pp — **cross-domain confirmed**.

**Recipe (copy-paste)**:
```markdown
Review [target file] for [task type]. Call /codex-review or mcp__codex__codex with this adversarial framing:

"Find subtle correctness bugs that follow from the code semantics, not just surface-level issues. Specifically look for:
- Contradictions with documented assumptions
- Off-by-one / boundary errors
- Hidden assumptions about state
- Missing edge cases
- [specific bug class for this task: e.g., timing attack / SQL injection / race condition]"

End with: { "critical_issue": "<≤30 words>", "category": "<bug class>", "line_hint": <int> }
```

**Expected**: +6~+30pp lift. **Anti**: 일반 "review this code" 만으로는 lift 약함 (surface-level 만 catch).

**Cost**: ~$0.02-0.05 per invocation.

## R2 — Self-Review 2-Round (conditional, complex real-world only)

**언제**: 
- ✅ Complex real-world doc/code (80+ LOC, 다중 측면, multiple documentable sections)
- ❌ Synthetic / simple src (synth 에서는 -13.9pp 반대 효과)

**왜**: v4 D1 +29pp N=3 (TenantThrottle real complex). v5/v6 synth -13.9pp (T01-T15). **Complex 여부가 결정**.

**Recipe**:
```markdown
[Task: doc authoring / code review / design review]

Execute TWO-ROUND review:
1. Round 1: Write first draft with [N] sections.
2. Call /codex-review on draft: "What sections / edge cases are missing? What's unclear?"
   Capture thread ID.
3. Revise based on findings.
4. Round 2: /codex-followup on same thread: "Any remaining blockers or unclear parts?"
5. Finalize.

End with: { "review_rounds": 2, "thread_id": "<uuid>", ... }
```

**Expected**: +20~+40pp lift on complex real-world. **Anti**: synthetic 시나리오에서는 0 ~ -30pp.

**Cost**: ~$0.10-0.20 (2 Codex calls).

**Sanity check before applying**: src ≥ 5KB OR 5+ documentable sections OR α 가 단발 통과 < 100% 예상.

## R3 — reasoning=high Escalation (when α struggles on hard reasoning)

**언제**: NP-hard / constraint satisfaction / α 가 한 번 시도해서 부분 실패한 algorithm 문제.

**왜**: v4 D2 +8pp (modified N-Queens, α=83%). v6 T13-03 +13pp (α=88%). Hard reasoning 영역에서만 lift.

**Recipe**:
```markdown
[Problem description, e.g., constraint satisfaction puzzle]

Invoke mcp__codex__codex with:
  sandbox: read-only
  approval-policy: never
  reasoning: high

Ask Codex to:
1. Enumerate constraints/requirements step-by-step BEFORE solving
2. Solve
3. Mentally verify each constraint AFTER placement

Combine Codex's output with your own verification.

End with: { "answer": ..., "verifications": {...}, "reasoning_level": "high" }
```

**Expected**: +5~+15pp on hard problems. **Anti**: 표준 / 쉬운 문제는 α 단독으로 충분 (T04 -10pp).

**Cost**: ~$0.05-0.15 (1 high-reasoning call).

## R4 — γ Hot-Swap (β catastrophe rescue)

**언제**: β prompt 가 chain ≥3 steps + strict JSON output 조합 — **catastrophe risk**.

**왜**: v4 E10 β=17% catastrophe (-83pp), γ=100% recovery. v6 T03 family 일관 (γ 평균 83%, β 67%).

**Recipe**:
```sh
# Codex CLI direct (no Claude wrapper)
codex exec \
  --sandbox=read-only \
  --skip-git-repo-check \
  --json \
  -c model_reasoning_effort=high \
  -o final.txt \
  "$(cat my_prompt.md)" \
  < /dev/null \
  > stream.jsonl 2> stderr.txt
```

**`< /dev/null`** 필수 (stdin 차단 — codex CLI 가 piped 감지 시 무한 대기).

**Anti**: ChatGPT account 는 `-m gpt-5` 명시 시 400 error. 디폴트 모델 사용 (`-m` 생략).

**Expected**: β catastrophe -83pp → γ ~100% recovery. **Cost**: ~$0.30-0.50.

## R5 — Cheap β Trial (probe when uncertain, Codex peer-reviewed)

**언제**: α 가 partial-fail 가능성 있을 때 (정확한 numeric measurement 불가).

**왜**: 사용자에게 benchmark scoring 없으므로 "β > α + 5pp" 측정 불가능. **Adjudication rule** 으로 대체.

**Recipe**:
```markdown
Step 1. α 단독으로 task 수행 (default).
Step 2. R1-adversarial probe ($0.02-0.05) 1 회.
Step 3. Adjudication:
   - Codex 가 **source-grounded (file:line 인용)** 구체 issue 제시? → β 채택
   - Codex 응답이 generic / α 와 겹침 / no source grounding? → α 유지
   - Codex 가 hallucination 의심? → α 유지 + R3 escalation 고려
```

**Adjudication rule (Codex peer-reviewed)**:
- ❌ NOT "β > α + 5pp" (benchmark 없으면 측정 불가)
- ✅ "Codex finding 이 verifiable + source-grounded + α 가 놓친 것이면 채택"

**Cost**: ~$0.02-0.05 single β probe.

---

## R6 — Format-Safe Handoff (신규, Codex peer-review 권장)

**언제**: Adversarial review (R1) 가 필요 + 출력 형식이 strict JSON/schema/YAML.

**왜**: Codex 에 reasoning chain + strict JSON 동시 요구 시 P5 Chain-JSON Trap. Codex 의 reasoning 가치를 살리면서 format 안전.

**Recipe (2-step handoff)**:
```markdown
Step 1. Codex prose reasoning ($0.03-0.05):
   /codex-review with adversarial framing.
   Codex 출력: prose with file:line evidence (R1 style, NO JSON requirement).

Step 2. Claude format normalization ($0):
   Claude 가 Codex prose 를 schema 로 변환.
   "Codex found N issues. Format as JSON: { issues: [...] }"
```

**Pattern**:
- Codex 는 reasoning 만 — prose, evidence-based, no schema burden
- Claude 는 formatting 만 — Codex output 를 user-requested schema 로 conversion

**Expected**: R1 의 +6~+30pp 유지 + Chain-JSON Trap 회피. **Best of both worlds**.

**Cost**: R1 cost + Claude format overhead = $0.04-0.06.

**Anti-pattern**: Codex 에 "review + return strict JSON" 동시 요청. Format loss risk.

## 🚫 Anti-Recipes (절대 피할 것)

### P-Chain-JSON Trap (catastrophe pattern)
다단계 chain + strict JSON output. β catastrophe -16~-83pp. 대신:
- α 직접 read + synthesize, OR
- γ hot-swap (R4), OR
- chain 을 single-round 로 단순화 (T2 가 E10 -83pp → 0pp 회복)

### P-Subagent-Strict (subagent + strict JSON)
`codex-reviewer` subagent 가 받은 요약을 main Claude 가 strict JSON 으로 reformat. 형식 망각 → -11~-83pp.
**대신**: main Claude 가 직접 처리 OR γ.

### P-Turn-Burn (multi-turn followup 5+)
새 정보 없이 5+ turns. Quality 동일 + cost +213-384%.
**Stop rule**: 3 turns 후 새 context 없으면 stop. 단일 prompt 로 합치기.

### P-Self-Review-Synth (synthetic 에 self-review)
Synthetic / 단순 task 에 2-round self-review. -13.9pp (n=20).
**대신**: complex real-world 에만 R2 적용. Synthetic 는 single-round 또는 skip.

## 📋 Recipe Selection Cheat Sheet

| Task type | Recipe |
|---|---|
| Defect-finding review (security audit, subtle bug, contradiction) | **R1 Adversarial framing** ★★★ default |
| **Adversarial review + strict JSON output** | **R6 Format-Safe Handoff** (NEW) |
| Documentation (complex real, ≥5KB OR ≥5 sections) | R2 Self-review 2-round |
| Documentation (synthetic / simple) | α only, NO self-review |
| NP-hard reasoning / α 1회 fail 후 | R3 reasoning=high |
| Multi-doc synthesis with strict JSON | ❌ DO NOT β orchestrate. α direct OR R4 γ OR R6 |
| Multi-turn debug | α (3-turn stop rule, P-Turn-Burn 회피) |
| 큰 코드베이스 audit | R1 + R4 backup if β fails format |
| Unsure / first time | **R5 Cheap β trial** (adjudication-based) |
