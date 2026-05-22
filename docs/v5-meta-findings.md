# v5 — Meta-findings (새로 발견된 패턴)

> v5 sweep (170 scenarios, 614+ runs) 에서 v4 가 놓친 또는 잘못 해석한 메타 패턴.

## 메타-Finding #1: **Synthetic-vs-Complex 임계점**

가장 결정적 발견. v4 의 β-win 패턴 (D1 self-review +29pp, D2 reasoning +8pp) 는 모두 **실제로 복잡한 src/** 에서 측정. v5 의 합성(synthetic) src/ 에서는 **정확히 반대 결과**.

| 패턴 | 복잡 src/ 결과 | 합성 src/ 결과 | Δ |
|---|---|---|---|
| Self-review loop (P1) | D1 +29pp | T01 −31pp | **−60pp 반전** |
| reasoning=high (P3) | D2 +8pp | T04 −10pp | **−18pp 반전** |
| TDD followup (P4) | E3 +17pp | T05 +2pp | -15pp 감쇠 |

**이론**: β 의 추가 layer (Codex review, reasoning=high) 는 **fixed overhead** + **gain-only-on-detection**. src/ 가 단순해 α 가 이미 정답을 알 때, gain=0 + overhead 가 noise/format-loss 로 전환되어 β-harmful 발생.

**가이던스 영향**: "β 사용 권장" 의 모든 조건에 **"src/ 충분히 복잡할 때만"** 단서 추가 필요.

**임계점 추정**: src 크기 약 5KB 이상 OR α 가 단발 task 에서 50% 이하 통과율일 때 β 검토 가치.

## 메타-Finding #2: **Catastrophe Pattern 의 강력한 일반화**

P5 (multi-step + strict-JSON) catastrophe 는 v4 → v5 에서 **가장 robust 한 finding**.

- v4: E10 -83pp (N=1)
- v5: P5 카테고리 mean Δpp = **−16.3** (n=18), 95% CI [−32.5, −2.4]
- 극단 사례: T03-07 = −100pp (α=100%, β=0%)
- T2 perturbation (chain 제거) 가 회복 → **chain 이 인과적 요인 확정**

**가이던스 권장**: chain ≥ 3 steps + JSON output strictness > 0.5 조합은 **절대 회피**.

## 메타-Finding #3: **Adversarial Framing 의 도메인 횡단 가치**

P2 (adversarial framing) 만이 v4 → v5 에서 일관 **양의 effect**.

- v4: B9 +25pp (N=1)
- v5: P2 카테고리 mean Δpp = **+6.1** (n=19), 95% CI [+1.6, +11.6] — 0 을 cross 안 함
- T02 ceiling 에도 불구하고 LA-12 +40pp 등 개별 시나리오 lift

**가이던스 권장**: review task 에 "find blockers AND subtle bugs that follow from the change, not just what's in it" 류 적대적 framing 명시 → **+5~25pp 안정 lift**.

## 메타-Finding #4: **β 가 평균적으로 −4pp 손해**

170 시나리오 종합 mean Δquality = **−4.37pp** [−7.96, −1.29].

- β-win 12%
- Tie 67%
- β-harmful 21%

**해석**: β 를 자동으로 모든 task 에 적용하면 평균 **−4pp** 손해. β 의 가치는 **선택적 / 조건부**.

**가이던스 권장**: β 의 default 설정은 **off / opt-in** 이어야 한다. "어떤 task 에 β 를 쓸지" 가 사용자의 핵심 의사결정.

## 메타-Finding #5: **LB (β-generated) 가 LA/LG 보다 quality 높음**

LLM-generated 시나리오 39 개에서:
- LA (α-generated): 13개 중 10개 broken (77%) — Claude 의 ORACLE schema 위반 비율 높음
- LB (β-generated via Claude+Codex): 13개 중 2개 broken (15%) — 가장 quality 높음. Self-meta-review 효과.
- LG (γ-generated via Codex CLI): 13개 중 7개 broken (54%)

**해석**: β orchestration 으로 시나리오 생성 시, 내부 Codex review 가 ORACLE 의 형식 오류 catch. **β 가 시나리오 작성 자체에는 일관 가치 있음** — 단지 시나리오 실행 시점에는 시나리오 종속.

**메타-가이던스**: 새 ORACLE / benchmark 작성 시 **반드시 β 로 self-meta-review** 거쳐야 함.

## 메타-Finding #6: **자동 생성 src/ 의 한계**

T01-T10 100 시나리오 중 **92 개 ceiling** (α=100%). 결정적 원인: generate.mjs 의 src/ generator 가 너무 단순.

| 템플릿 | Ceiling 비율 | 추정 원인 |
|---|---|---|
| T01 (self-review doc) | 9/10 | code module 5-method skeleton, 너무 단순 |
| T02 (adversarial) | 10/10 | planted bug 가 obvious |
| T03 (catastrophe synthesis) | 9/10 | random markdown content, no real structure |
| T04 (hard reasoning) | 4/10 | **6/10 discriminative** ✓ (이론 문제는 실제로 어려움) |
| T05 (TDD) | 9/10 | test skeleton 이 trivial |
| T07 (ceiling baseline) | 10/10 | **의도된 ceiling** ✓ (P6 null hypothesis 검증) |
| T08 (i18n) | 10/10 | planted i18n issue 가 obvious |
| T09 (concurrency) | 10/10 | 알려진 race pattern 이 obvious |
| T10 (SQL opt) | 10/10 | 표준 SQL anti-pattern, Haiku 가 잘 앎 |

**해석**: synthetic 시나리오의 **fundamental 한계**. 진짜 어려운 src/ 만들려면 real-world 코드 / 미묘한 bug / 의외의 edge case 가 필요. 자동 생성으로는 trivial 만 만들기 쉬움.

**가이던스 영향**: pattern validation 시 **반드시 real-world 시나리오** 포함 필수. 합성 시나리오 단독 결론은 위험.

## 메타-Finding #7: **D1 의 +29pp 가 우연 아닌 systematic — 단, 매우 특수한 조건**

D1 N=3 (mini+full sweep) 에서 정확히 +29pp 일관. v5 의 다른 synthetic P1 시나리오에서 같은 lift 안 나옴.

D1 의 특수 조건 분석:
- src: TenantThrottle 80 LOC, 4 메서드 (constructor, _bucketFor, consume, snapshot)
- ORACLE: 8 criteria including `doc_section_exists` (5 sections), `no_tbd`, `word_count_max` 700, `tool_call_count_min` 2
- 결정적 요인: α 가 5/8 통과 (3 sections 누락 + word count 초과)
- β 의 2-round /codex-review 가 누락 sections 식별 → 7-8/8 통과

**이론**: src/ 가 **5 개 sections 만큼 풍부한** 정도여야 self-review 가 누락을 catch 할 수 있다. T01 modules 는 5 sections 채우기에 충분히 풍부하지 못함 → 단발 doc 으로도 OK → β 의 review 가 무가치.

**가이던스**: self-review loop 를 권장하려면 **(a) src/ 가 다중 documentable 측면 보유** + **(b) ORACLE 이 section coverage 강제** + **(c) α 가 부분 통과 가능**. 세 조건 모두 만족 안 하면 β-win 안 일어남.

## 종합 권장사항 변경

| v4 권장 | v5 수정 |
|---|---|
| "Self-review loop 적극 활용" | "복잡한 src 위 doc authoring 일 때만" |
| "Hard reasoning 에 reasoning=high" | "α 가 단발 fail 한 진짜 hard 문제일 때만" |
| "TDD followup 활용" | "약한 효과, 검토 필요" |
| "Multi-step chain + strict JSON 회피" | **유지, 강화** |
| "Subagent 위임 주의" | **유지** |
| "Adversarial framing 활용" | **유지, 안정 +6pp** |

다음: `docs/guidance-*.md` 4 종 in-place 갱신 (v5 evidence 반영).
