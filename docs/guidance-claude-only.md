# 가이던스 — Claude Code 단독(α) 사용이 최선인 경우

> **v7 업데이트 (2026-05-22)**: v6 의 "α≥95% → β-catastrophe -41pp" 권장이 **math artifact** 임을 v7 validation 에서 확인 (β-α ≤ 0 boundary-bound). 정확한 framing: "ceiling = β 측정값이 ≤ α 만 가능" (no upside).
>
> **Robust 권장 (변경 없음)**: β-default OFF — 170 scenario mean -4.37pp.
>
> Detail: [`v6-threshold-analysis.md`](v6-threshold-analysis.md).
>
> 핵심 metric: **Synergy (Δquality pp) — 비용 무시, 품질만**.
> Detail: [`v5-pattern-validation.md`](v5-pattern-validation.md) + [`v5-meta-findings.md`](v5-meta-findings.md).

## ⚠️ v5 결정적 권장 — α 가 default

**170 시나리오 평균 Δquality (β−α) = −4.37pp**. β 는 평균 quality 손해.

| Verdict | 비율 |
|---|---|
| β-win (>+2pp) | **12%** |
| Tie (\|Δ\|≤2pp) | 67% |
| β-harmful (<−2pp) | **21%** |

**β-harmful 비율 (21%) 이 β-win (12%) 보다 높다**. 따라서 default → α 사용. β 는 명시적 조건 만족 시에만 opt-in.

## TL;DR

다음 5 가지 신호 중 **2 개 이상** 해당하면 **Claude 단독(α)** 으로 가라. Codex 호출은 quality 추가 안 되고 무한대 추가 latency 만 발생.

1. **α 가 이미 100% 통과**: ORACLE 통과율이 이미 ceiling 이면 β 추가 통과 불가능 (ceiling effect)
2. **다단계 chain (>3 steps) + strict JSON 출력**: chain 의 형식 망각 위험 (E10 -83pp catastrophe 발생)
3. **Multi-turn 디버그 (~5-10 turns)**: Haiku 자체 컨텍스트로 충분
4. **단순 편집/픽스** (오타, off-by-one 등): Codex orchestration overhead 만 추가
5. **이미 α 의 성능이 β 와 같거나 좋다는 증거가 있다**: 본 sweep 의 β-harmful/α-win 패턴에 해당

---

## v5/v6 증거 카드 (v7 validated)

### Pattern 1 — **Ceiling effect**: α 가 이미 100% → β 추가 효익 0 (math)

| Scenario | α | β | γ | 결론 |
|---|---|---|---|---|
| B1-large-diff | 100% (N=3) | 100% (N=3) | — | β-redundant |
| B4-testgen | 100% | 100% | — | β-redundant |
| B5-secaudit | 100% (N=3) | 100% (N=3) | 100% | 3-way tie |
| B6-followup | 100% (N=3) | 100% (N=3) | — | β cost +213% with 0 quality lift |
| B7-arch | 100% | 100% | — | β-redundant |
| B8-spec | 100% | 100% | — | β-redundant |
| B11-trivial | 100% | 100% | — | β 가 자제 (codex_call=0) |
| B12-trap | 100% | 100% | — | 환각 양쪽 모두 회피 |
| D3-token-efficiency | 100% | 100% | — | β cost 절감 있지만 quality 동일 |
| D4-analyze-improve-loop | 100% | 100% | — | 직접 분석으로 충분 |
| E6-large-codebase-audit | 100% | 100% | — | subagent 위임 무의미 |
| E9-cross-file-dependency | 100% | 100% | — | 파일 8 개 정도는 α 직접 가능 |
| T1a-B5-self-review | 100% | 100% | — | self-review 추가 무가치 (ceiling) |

**v7 calibration**: α=100% 인 시나리오는 **β 측정값이 ≤ α** 만 수학적으로 가능 (β-α≤0 boundary). 따라서 "ceiling = β-harmful catastrophe" 가 아니라 **"ceiling = β 가 lift 만들 여유 없음"**. v6 에서 본 -41pp 평균은 ceiling 시나리오에서 β 가 noise 추가한 결과 — arm-specific harm 아니라 measurement artifact.

**13 시나리오에서 β 의 quality 추가가 0** → 이런 ceiling task profile 은 **Claude 단독 사용 권장** (예측 가능한 효과 부재).

13 시나리오 + v5 expansion (170 scenarios 중 67% tie) 일관 패턴.

### Pattern 2 — **β-harmful**: β 가 α 보다 **나쁘다** (호출 금기)

| Scenario | α | β | γ | Δβ-α | 패턴 |
|---|---|---|---|---|---|
| **E10-doc-corpus-synthesis** | 100% | **16.7%** | 100% | **-83.3pp** | 다단계 + strict JSON + subagent = catastrophe |
| **E4-pr-review-simulation** | 80% | 60% | — | **-20pp** | 2-round chain prose 가 형식 망각 |
| **E2-security-harden-loop** | 100% | 85.7% | — | **-14.3pp** | review→fix→review chain |
| **T7anti-D1-stripped** | 62.5% | 50% | — | **-12.5pp** | D1 의 self-review 제거 (anti-test) |
| **E7-multi-log-rca** | 100% | 88.9% | — | **-11.1pp** | subagent 가 RCA detail 손실 |

**공통점**: 다단계(chain ≥3) + 형식 strict (output_strict_ratio > 0.4) + 일부 subagent. **이 조합에서는 Codex 호출 금지**.

### Pattern 3 — Multi-turn 디버그 (sticky thread) 의 redundancy

| Scenario | α | β | β cost vs α | 결론 |
|---|---|---|---|---|
| B6-followup (5 turns) | 100% (N=3) | 100% (N=3) | **+213%** | quality 0 lift, cost ↑↑ |
| E8-long-thread-debug (10 turns) | 100% | 100% | **+384%** | 동일 |

**해석**: 5-10 턴 정도의 thread persistence 는 Claude Haiku 의 자체 컨텍스트로 충분. β 의 `codex-reply` 체인은 cost burn 만.

---

## 의사결정 체크리스트 (3 분 안에)

다음을 체크하고 **2 개 이상 YES** 면 **Claude 단독(α)** 으로 진행:

- [ ] 출력에 strict JSON / fenced block 등 형식 요구가 ≥ 40% 있는가?
- [ ] 작업이 3 단계 이상의 chain (review → fix → followup 등) 으로 명시되어 있는가?
- [ ] 입력이 < 20KB 이고 Claude Haiku 가 단발로 처리 가능해 보이는가?
- [ ] 이전 유사 task 에서 β 가 quality 를 추가하지 않은 적이 있는가?
- [ ] Multi-turn 디버그가 5-10 turns 이내인가?

YES ≥ 2 → **α 사용**.

---

## 안티 패턴 — Codex 를 호출하지 말아야 할 경우

| 안티 패턴 | 증거 | 회피 방법 |
|---|---|---|
| 단발 보안 감사 (<200 LOC) | B5 양쪽 100% N=3 | `/codex-review` 호출 생략, Claude 단독 |
| 단순 typo / off-by-one fix | B11 양쪽 동일 | `/codex-fix` 호출 생략 |
| 5-턴 디버그 | B6 N=3 동일, cost +213% | thread 카탈로그 없이 단일 Claude 세션 |
| 다단계 + strict JSON | E10 -83pp | β prompt 단순화 OR Claude 단독 OR γ (Codex CLI 직접) |
| 이미 α 가 정답 알고 있는 검증 | E1, E6, E9 양쪽 100% | β 의 cost 절감 효과만 있으나 quality 차이 무 |

---

## 실용 가이드 — codex-on-claude 설치 옵션

α 중심으로 쓰려면 codex-on-claude 의 Skill 자동 트리거를 끄거나, 명시 호출만 받도록 설정:

```sh
# Skills 제거 (Codex 호출 surface 최소화)
codex-on-claude reconfigure --patterns= --improvement-loop=off --threads=off --yes

# 또는: Skills 유지하되 자동 호출 차단 (사용자 명시 입력만)
codex-on-claude reconfigure --patterns=review,fix --context-policy=direct --improvement-loop=off --yes
```

`improvement-loop=off` 가 핵심 — PostToolUse 자동 로그 훅이 cost 측정에 노이즈를 추가하지 않음.

---

## 신뢰도 (Confidence)

| Pattern | N (시나리오) | Confidence |
|---|---|---|
| Ceiling effect (α=100%) | 13 | **High** |
| β-harmful with chain+strict | 4 (E10/E4/E2/E7) | **Medium-High** (N=1 4개) |
| Multi-turn redundancy | 2 (B6 N=3 + E8 N=1) | High |
| Anti-pattern T7 (self-review 제거 → β-harmful) | 1 (N=2) | Medium |

---

## 함께 보세요

- [guidance-claude-orchestrates-codex.md](guidance-claude-orchestrates-codex.md) — β 가 quality 를 명확히 lift 하는 경우
- [guidance-codex-only.md](guidance-codex-only.md) — Codex CLI 직접 사용이 β 보다 안전한 경우 (E10 catastrophe 패턴)
- [guidance-comparison.md](guidance-comparison.md) — 3-way 의사결정 트리 + Pareto frontier
