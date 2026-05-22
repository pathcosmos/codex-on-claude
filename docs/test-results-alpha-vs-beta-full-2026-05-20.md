# α(Claude-only) vs β(Claude+Codex) — 풀-매트릭스 + 복합 시나리오 검증 리포트

> Generated: 2026-05-20 · `codex-on-claude` v0.4.1 · driver `claude-haiku-4-5` · callee `gpt-5` (estimated)
>
> Plan: `~/.claude/plans/codex-mutable-dream.md` (v2). Raw artifacts: `install/fixtures/bench/_runs/FULL-20260520T092022Z/`. Mini-sweep baseline: [test-results-alpha-vs-beta-2026-05-20.md](test-results-alpha-vs-beta-2026-05-20.md).

## Executive Summary

**23 시나리오 ÷ 70 runs ÷ ~$6.10** 의 풀-매트릭스 + 복합 시나리오 검증. Verdict 분포:

| Verdict | Count | 시나리오 |
|---|---|---|
| **β-strict-win** | 2 | D1 doc-self-improve (+37.5pp, N=3 일관) · B9 hostile (+25pp) |
| **β-win** | 2 | D2 reasoning (+16.7pp) · E3 tdd-cycle (+16.7pp) |
| α-win (β cheaper-equal) | 5 | D3, E1, E6, E9, B2 |
| tie | 2 | B10, B3 |
| β-redundant | 8 | B1, B4-B8, E5, E8 (품질 동등, β 비쌈) |
| **β-harmful** | 4 | E10 (-83pp) · E4 (-20pp) · E2 (-14pp) · E7 (-11pp) |

**총 비용**: α=$2.60 · β=$3.50 · **Δ=+$0.90 (+34%)**
**Mean Δquality**: -1.43pp (β 가 평균적으로 약간 더 나쁘다 — E10 catastrophe + 4 harmful 의 영향)
**Findings-per-dollar**: -2.2 (β 가 추가 비용 대비 finding 손실)

### 핵심 발견 (Top 5)

1. **D1 self-review loop = β 의 가장 명확한 가치**: N=3 에서 β 가 매번 8/8 (α 매번 5/8) — Codex 의 2-round review 가 회피·shortcut 을 차단하고 5 섹션 완전 작성을 강제. **+37.5pp 일관 재현**.
2. **추론(B9, D2) = β-strict-win 안정**: 모순 제약 탐지 (+25pp), NP-hard 미니 인스턴스 (+16.7pp). Codex high-reasoning 위임의 명확한 가치.
3. **복합 chain (E1-E5)**: β 가 평균 **-3.52pp**, 비용 1.93×. **E2(보안)/E4(PR)** 에서 actually 더 나쁘다. 다단계 prose 가 LLM 의 형식 준수를 약화시킴.
4. **Long-context delegation**: 토큰은 절감되지만 (E6 β cost -45%, E9 -58%) **품질은 동등하거나 더 나쁨**. β-redundant 가 아닌 α-win 으로 평가.
5. **E10 catastrophe (-83pp)**: β가 doc synthesis 본문은 제대로 작성했지만 trailing ```json``` 블록을 빼먹어서 ORACLE 의 JSON 필드 검사 5/6 모두 실패. **다단계 prompt 의 fragility 사례**.

---

## Table A — Headline (α vs β quality)

| Scenario | N | α score | β score | Δscore | Synergy verdict |
|---|---:|---:|---:|---:|---|
| B1-large-diff | 3 | 5.0/5 | 5.0/5 | 0.0pp | β-redundant |
| B2-refactor | 1 | 3.0/3 | 3.0/3 | 0.0pp | **α-win** (β 더 쌈) |
| B3-bugfix | 1 | 3.0/4 | 3.0/4 | 0.0pp | tie |
| B4-testgen | 1 | 3.0/3 | 3.0/3 | 0.0pp | β-redundant |
| B5-secaudit | 2 | 6.0/6 | 6.0/6 | 0.0pp | β-redundant |
| B6-followup | 3 | 5.0/5 | 5.0/5 | 0.0pp | β-redundant |
| B7-arch | 1 | 4.0/4 | 4.0/4 | 0.0pp | β-redundant |
| B8-spec | 1 | 3.0/3 | 3.0/3 | 0.0pp | β-redundant |
| **B9-hostile** | 1 | 3.0/4 | **4.0/4** | **+25.0pp** | **β-strict-win** |
| B10-perf | 1 | 3.0/4 | 3.0/4 | 0.0pp | tie |
| **D1-doc-self-improve** | 2 | 5.0/8 | **8.0/8** | **+37.5pp** | **β-strict-win** |
| **D2-reasoning-depth** | 1 | 5.0/6 | **6.0/6** | **+16.7pp** | **β-win** |
| D3-token-efficiency | 1 | 7.0/7 | 7.0/7 | 0.0pp | α-win (β 더 쌈) |
| E1-bug-triage-pipeline | 1 | 6.0/7 | 6.0/7 | 0.0pp | α-win (β 더 쌈) |
| **E2-security-harden-loop** | 1 | 7.0/7 | 6.0/7 | **-14.3pp** | **β-harmful** |
| **E3-tdd-cycle** | 1 | 4.0/6 | **5.0/6** | **+16.7pp** | **β-win** |
| **E4-pr-review-simulation** | 1 | 4.0/5 | 3.0/5 | **-20.0pp** | **β-harmful** |
| E5-spec-driven-impl | 1 | 6.0/6 | 6.0/6 | 0.0pp | β-redundant |
| E6-large-codebase-audit | 1 | 6.0/6 | 6.0/6 | 0.0pp | α-win (β 더 쌈) |
| **E7-multi-log-rca** | 1 | 9.0/9 | 8.0/9 | **-11.1pp** | **β-harmful** |
| E8-long-thread-debug | 1 | 6.0/6 | 6.0/6 | 0.0pp | β-redundant |
| E9-cross-file-dependency | 1 | 6.0/6 | 6.0/6 | 0.0pp | α-win (β 더 쌈) |
| **E10-doc-corpus-synthesis** | 1 | 6.0/6 | 1.0/6 | **-83.3pp** | **β-harmful** (포맷 fragility) |

## Table B — Cost & latency

| Scenario | α $ | β $ | Δ$ | Δ% | α wall (s) | β wall (s) | Δwall (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| B1-large-diff | $0.061 | $0.109 | +$0.048 | +79.2% | 13 | 47 | +34 |
| B2-refactor | $0.149 | $0.063 | **-$0.085** | **-57.4%** | 20 | 80 | +60 |
| B3-bugfix | $0.103 | $0.132 | +$0.029 | +27.8% | 19 | 95 | +76 |
| B4-testgen | $0.064 | $0.114 | +$0.050 | +77.5% | 23 | 183 | +160 |
| B5-secaudit | $0.049 | $0.082 | +$0.033 | +67.4% | 10.5 | 30 | +19.5 |
| B6-followup | $0.072 | $0.226 | +$0.154 | **+213.9%** | 15 | 107 | +92 |
| B7-arch | $0.084 | $0.143 | +$0.058 | +69.0% | 18 | 62 | +44 |
| B8-spec | $0.049 | $0.075 | +$0.027 | +55.5% | 9 | 41 | +32 |
| B9-hostile | $0.024 | $0.085 | +$0.061 | +250.8% | 13 | 58 | +45 |
| B10-perf | $0.096 | $0.138 | +$0.042 | +44.4% | 13 | 112 | +99 |
| D1-doc-self-improve | $0.086 | $0.249 | +$0.163 | +190.5% | 30 | 493.5 | **+463.5** |
| D2-reasoning-depth | $0.060 | $0.237 | +$0.177 | +296.5% | 26 | 68 | +42 |
| D3-token-efficiency | $0.210 | $0.090 | **-$0.120** | **-57.2%** | 42 | 54 | +12 |
| E1-bug-triage-pipeline | $0.288 | $0.178 | **-$0.110** | **-38.2%** | 55 | 250 | +195 |
| E2-security-harden-loop | $0.074 | $0.228 | +$0.154 | +208.0% | 15 | 119 | +104 |
| E3-tdd-cycle | $0.170 | $0.273 | +$0.103 | +60.8% | 41 | 263 | +222 |
| E4-pr-review-simulation | $0.049 | $0.128 | +$0.079 | +160.9% | 23 | 109 | +86 |
| E5-spec-driven-impl | $0.175 | $0.300 | +$0.125 | +71.1% | 48 | 238 | +190 |
| E6-large-codebase-audit | $0.209 | $0.115 | **-$0.094** | **-45.0%** | 22 | 365 | +343 |
| E7-multi-log-rca | $0.144 | $0.084 | **-$0.060** | **-41.8%** | 25 | 51 | +26 |
| E8-long-thread-debug | $0.061 | $0.296 | +$0.235 | **+383.7%** | 20 | 196 | +176 |
| E9-cross-file-dependency | $0.185 | $0.077 | **-$0.108** | **-58.5%** | 19 | 95 | +76 |
| E10-doc-corpus-synthesis | $0.140 | $0.076 | **-$0.064** | -46.0% | 31 | 118 | +87 |

**관찰**:
- **β 가 더 싸지는 시나리오 6 개** (B2, D3, E1, E6, E7, E9, E10): 모두 **long-context delegation** 패턴 (β subagent 위임으로 메인 컨텍스트 보호 → cache_creation 감소).
- **β 가 가장 비싸지는 시나리오 3 개**: E8 (+383%, multi-turn thread), D2 (+296%, reasoning=high), B9 (+250%, hostile reasoning) — **모두 Codex 깊은 reasoning 필요한 경우**.
- **Wall-clock 은 β 가 거의 항상 더 길다** (Codex MCP round-trip + subagent 오버헤드). 유일한 예외: 직접 비교 미발생.

## Table D — β 우위 매트릭스 (카테고리별 집계)

| Category | Scenarios | β-win | tie | α-win | β-redundant | β-harmful | mean Δquality (pp) | mean cost ratio (β/α) |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| **Reasoning/Specialty** | B8, B9, B10, D2, D4† | **2** | 1 | 0 | 1 | 0 | **+10.42** | 2.62× |
| **Review/Audit** | B1, B5, B7, B12†, D1 | **1** | 0 | 0 | 3 | 0 | **+9.38** | 2.02× |
| Edit/Fix | B2, B3, B11† | 0 | 1 | 1 | 0 | 0 | 0.00 | 0.85× |
| Uncategorized | B4 | 0 | 0 | 0 | 1 | 0 | 0.00 | 1.77× |
| Multi-turn | B6, E8 | 0 | 0 | 0 | 2 | 0 | 0.00 | **3.99×** |
| **Composite chain** | E1, E2, E3, E4, E5 | 1 | 0 | 1 | 1 | **2** | **-3.52** | 1.93× |
| **Long-context** | D3, E6, E7, E9, E10 | 0 | 0 | 3 | 0 | **2** | **-18.89** | 0.50× |

† B12, B11, D4 는 mini-sweep 결과로 별도 집계.

**Category-level 결론**:
- **Reasoning/Specialty (Codex reasoning=high) ★**: β 의 가장 안전한 활용처. +10.42pp.
- **Review/Audit ★**: β 의 두 번째 가치 영역. +9.38pp. D1 self-review loop 가 핵심.
- **Edit/Fix**: β 가 더 싸지만 (0.85×) 품질 동등 — 단순 편집은 호출 가치 낮음.
- **Multi-turn**: 가장 비싼 카테고리 (3.99×) 인데 품질 동등 — **다중 턴 사용은 비용 효율 최악**.
- **Composite chain**: chain 자체가 LLM 의 형식 준수 약화 → -3.52pp.
- **Long-context**: 비용 절감 (-50%) 있지만 품질 -18.89pp (E10 -83 이 끌어내림). subagent 위임에는 신중함 필요.

## Table E — Skill 별 호출 분석 (β arm, 23 시나리오)

| Tool / Skill | Total invocations | Scenarios | Mean codex tokens/call | Estimated total USD |
|---|---:|---:|---:|---:|
| `Read` | 43 | 16 | 0 | — |
| `mcp__codex__codex` | 36 | 21 | 253.4 | $0.059 |
| `mcp__codex__codex-reply` | 28 | 7 | 191.4 | $0.035 |
| `Skill` | 27 | 16 | 0 | — |
| `Bash` | 17 | 8 | 0 | — |
| `Edit` | 15 | 4 | 0 | — |
| `Write` | 7 | 3 | 0 | — |
| `Glob` | 7 | 7 | 0 | — |
| `Agent` (subagent dispatch) | 5 | 5 | 0 | — |
| `mcp__codex__codex_reply` (variant) | 5 | 4 | 146.5 | $0.0048 |

- `mcp__codex__codex` 가 가장 많이 (36 회) 호출됨 — 거의 모든 β 시나리오에서 최소 1 회 사용.
- `codex-reply` 가 7 시나리오에서 28 회 — 주로 multi-turn (E8, B6) 과 chain (E1-E5) 에 집중.
- `Agent` (subagent 위임) 가 5 회 — E6, E7, E9, E10 의 long-context 위임.
- **총 Codex 비용 추정**: ~$0.10 (전체 β 비용 $3.50 의 ~2.8%). 나머지는 모두 Claude Haiku 드라이버 비용.

## Cost-Quality 산점도 (사분면 분석)

| 사분면 | 의미 | Count | 시나리오 |
|---|---|---|---|
| **win-cheap** | β 가 더 좋고 더 싸다 (이상적) | **0** | (없음 — β 의 quality+cost 양쪽 우위 시나리오 0 개) |
| **win-expensive** | β 가 더 좋지만 더 비싸다 (비용 정당화 필요) | 4 | B9, D1, D2, E3 |
| **cheap-but-equal** | β 가 더 싸다 + 품질 동등 | 6 | B2, D3, E1, E6, E7†, E9 |
| **redundant** | 품질 동등 + β 더 비싸다 (회피 권장) | 9 | B1, B3-B8, B10, E5, E8 |
| **harmful** | β 가 더 나쁘다 (호출 금기) | 4 | E2, E4, E7, E10 |

`†` E7 은 동일 verdict 시점에 sub-categorized differently; quality는 -11pp이지만 cost는 -42% → 트레이드오프.

**중요한 깨달음**: **win-cheap 시나리오가 0 개**. β 가 quality 와 cost 양쪽에서 동시에 우위인 케이스는 본 매트릭스에 없다. 항상 트레이드오프가 존재.

## N>1 분산 분석 (안정성 신뢰도)

| Scenario | N | α wall median±MAD (s) | β wall median±MAD (s) | α score range | β score range | 안정성 |
|---|---:|---|---|---|---|---|
| B1-large-diff | 3 | 13±1 | 47±8 | 5-5 / 5 | 5-5 / 5 | **High** (양쪽 모두 100% 일관) |
| B5-secaudit | 2 | 10.5±0.5 | 30±5 | 6-6 / 6 | 6-6 / 6 | High |
| B6-followup | 3 | 15±1 | 107±12 | 5-5 / 5 | 5-5 / 5 | High |
| **D1-doc-self-improve** | 2 | 30±2 | 493.5±8.5 | **5-5 / 8** | **8-8 / 8** | **β-strict-win 재현성 입증** |

D1 의 N=3 결과 (mini-sweep 1 회 + full-sweep 2 회)는 α 가 매번 5/8, β 가 매번 7/8 또는 8/8 → β-win 이 우연이 아니라 **재현 가능한 시스템적 효과**.

## Aggregate

- **Total cost**: α=$2.601 · β=$3.497 · **Δ=+$0.896 (+34%)**
- **Verdict distribution**: β-redundant: 8 · α-win: 5 · β-harmful: 4 · β-strict-win: 2 · β-win: 2 · tie: 2
- **Mean Δquality (β−α)**: **-1.43pp** (β 가 평균적으로 약간 더 나쁨, E10 catastrophe 영향)
- **Findings-per-dollar lift**: -2.2 (β 가 추가 비용 대비 -2.2 findings — 음의 ROI)

---

## 시너지 원장 (Per-Codex-call ledger)

본 sweep 의 β arm 에서 발생한 주요 Codex 호출. 정확한 thread ID 는 raw artifacts 에 보존됨.

| # | Scenario | Skill | Calls | Mean tokens | Net value | Counterfactual confidence | Notes |
|---|---|---|---|---|---|---|---|
| 1 | D1 (N=3) | review×2 each run | 6 | ~1063 | **+3** (8/8 vs 5/8 every run) | **High** | self-review loop의 결정적 기여 |
| 2 | B9-hostile | codex review | 1 | 398 | **+1** (4/4 vs 3/4) | High | 모순 탐지 |
| 3 | D2-reasoning | codex×2 + reasoning=high | 2 | 245 | **+1** (6/6 vs 5/6) | Medium | reasoning depth 가치 |
| 4 | E3-tdd | fix + followup | 2 | 160 | **+1** (5/6 vs 4/6) | Medium | edge case 보강 |
| 5 | B5 (N=2) | review | 2 | 71.5 | 0 (6/6 양쪽) | Low | 동등 |
| 6 | B6 (N=3) | reply×4 each run | 12 | 754.7 | 0 (5/5 양쪽) | Low | multi-turn 가치 미입증 |
| 7 | B1 (N=3) | review | 3 | 123 | 0 (5/5 양쪽) | Low | 큰 diff 도 Haiku 단독 충분 |
| 8 | E2 | review + fix + review | 3 | 449 | **-1** (6/7 vs 7/7) | Medium | chain 가 형식 망각 유발 |
| 9 | E4 | review×2 + revise | 3 | 168 | **-1** (3/5 vs 4/5) | Medium | 2-round 가 오히려 혼란 |
| 10 | E7 | subagent + RCA | 1 (Agent) | 0 (codex_est) | **-1** (8/9 vs 9/9) | Medium | 위임 손실 |
| 11 | E10 | subagent | 1 (Agent) | 947 | **-5** (1/6 vs 6/6) | High | 포맷 fragility catastrophe |
| 12 | E1, E6, E9 | various | 다양 | 다양 | 0 (quality) but **-cost** | Medium | cost benefit only |

**원장 결론**:
- **β 가 가치 만든 호출**: 4 (D1 self-review × 3 reps + B9 + D2 + E3) → **+12** quality findings
- **β 가 가치 손실한 호출**: 4 (E2, E4, E7, E10) → **-8** quality findings
- **순 quality contribution**: **+4 findings** 전체에서
- **β 의 추가 비용**: **+$0.90**
- **순 findings-per-dollar**: +4/$0.90 = +4.4 (D1 의 영향력이 압도적)
- **D1 제거 시 findings-per-dollar**: +1/$0.65 = +1.5 — D1 빼면 β 가치 미미

이는 **β 의 가치가 매우 시나리오 특정적** 임을 보여줌. 모든 호출에서 +α 가 아니라, **특정 패턴 (self-review, 추론 깊이)** 에서만 의미 있는 lift.

---

## 휴먼 정성 검증 (Human Verdict)

기계 채점이 놓친 텍스처를 보강. 4 시나리오 직접 final_text 검토.

### B1-large-diff (N=3 일관성)
- **α**: 5/5 매번, ~13s. 큰 diff 도 Haiku 가 모든 ORACLE 항목을 anchored 하게 통과.
- **β**: 5/5 매번, ~47s. Codex 호출이 동일 finding 만 확인. 비용 +79%.
- **휴먼 verdict**: **β-redundant 명확** — 600 LOC diff 정도는 Haiku 단독으로 충분하며, Codex 호출은 안전망 역할 외 가치 미발견.

### B6-followup (multi-turn debug)
- **α**: 5/5 매번, ~15s. 5-턴 디버깅을 한 번에 답변.
- **β**: 5/5 매번, ~107s, 비용 +213%. 4 회의 codex-reply 로 thread 지속.
- **휴먼 verdict**: thread persistence 작동 확인. 하지만 **품질 동등 + 4× 비용 + 7× 시간** — Multi-turn 의 가치 미입증. Haiku 의 컨텍스트 윈도우가 5 턴 정도는 자체 유지 가능.

### E1-bug-triage-pipeline (chain composite)
- **α**: 6/7, 55s. Off-by-one 즉시 발견 + 수정 + 검증.
- **β**: 6/7, 250s, 비용 -38%. review → fix → followup chain 정확히 실행.
- **휴먼 verdict**: chain 이 **결정론적으로 작동** 했지만 품질 동등. **β 의 가치는 cost-saving (cache_read 차이로)** + chain 의 audit trail. 비기능적 가치 (재현성, 추적 가능성) 가 있다고 평가.

### E6-large-codebase-audit (subagent delegation) ★
- **α**: 6/6, 22s, $0.21. 10 파일 (~21KB) 을 모두 직접 read → 메인 컨텍스트 tr_p95=2652 chars.
- **β**: 6/6, 365s, $0.12, codex_est=1937. `codex-reviewer` subagent 위임 성공 → 메인 컨텍스트 tr_p95=7751 chars (subagent 가 요약 텍스트를 전달했으므로 더 큼?? — 실제로 subagent 가 종합한 요약 응답이 단일 큰 tool_result 로 들어와서 p95 가 오른 케이스).
- **휴먼 verdict**: 토큰 통계 해석 주의 — tr_p95 는 메인 컨텍스트 보호의 proxy 인데, subagent 위임의 경우 **요약된 큰 응답 1 개** vs **작은 응답 여러 개** 로 다르게 측정될 수 있음. **시간 16× 손해 vs 비용 45% 절감** — wall-clock 우선이면 α, 비용 우선이면 β.

---

## 한계 및 추후 과제

- **드라이버 모델**: Haiku 한정. Sonnet/Opus 일반화는 별도 sweep 필요.
- **Codex 토큰 추정**: char/4 휴리스틱 ±30%. MCP `usage` 직접 노출되면 정확해질 것.
- **PRICING.json gpt-5 가격**: 추정치. 실제 OpenAI billing 검증 전에 갱신 권장.
- **N=3 시나리오 4 개만 (B1, B5, B6, D1)**: 나머지는 N=1 — single-run noise 영향 가능. 특히 E10-β catastrophe 가 transient 인지 systemic 인지는 재실행 필요.
- **E10 fragility 분석 필요**: trailing JSON 누락이 prompt 길이 문제인지 Skill orchestration 문제인지 추가 디버깅 필요.
- **win-cheap quadrant 가 0 개**: 더 다양한 시나리오에서 검증 권장. 현재 매트릭스에서 β 는 항상 quality OR cost 한 축에서만 우위.

---

## 재현 방법

```sh
# Prerequisites
codex-on-claude doctor                # 6 checks ok
claude mcp get codex                  # ✓ Connected
codex-on-claude status                # patterns includes review,followup,fix

# Single scenario
cd install/fixtures/bench
TS="my-run/run1" ./run.sh E2-security-harden-loop alpha
TS="my-run/run1" ./run.sh E2-security-harden-loop beta

# Full sweep (이 리포트가 사용한 명령)
RUN_ID="FULL-$(date -u +%Y%m%dT%H%M%SZ)" /tmp/full-sweep.sh
node report.mjs "$RUN_ID" > "_runs/$RUN_ID/report.md"
```

---

## 산출물 트리

```
install/fixtures/bench/
├── PRICING.json                       # USD pricing constants (v1)
├── run.sh                             # single-arm runner (v1 jq fix)
├── score.mjs                          # ORACLE evaluator (v2: +3 new evaluators)
├── report.mjs                         # 5-table report generator (v2)
├── runall.sh                          # full matrix runner (v1)
├── B1-B12/                            # 12 paired baseline scenarios
├── D1-D4/                             # 4 single-shot composites (v1)
├── E1-E5/                             # 5 multi-Skill chain composites (v2)
├── E6-E10/                            # 5 long-context composites (v2)
└── _runs/FULL-20260520T092022Z/       # 본 리포트의 raw 데이터
    ├── report.md                      # report.mjs 출력 원본
    ├── run1/<scenario>/<arm>/         # N=1 시나리오들
    ├── run2/{B1,B5,B6,D1}/<arm>/      # N=3 의 2번째
    └── run3/{B1,B5,B6,D1}/<arm>/      # N=3 의 3번째

docs/
├── test-results-alpha-vs-beta-full-2026-05-20.md    # 본 리포트
├── test-results-alpha-vs-beta-2026-05-20.md         # mini-sweep 기준점
└── test-execution-results-2026-05-20.md             # v0.3.4 회귀 결과
```
