# α(Claude-only) vs β(Claude+Codex) — 통합 성능 비교 리포트

> Generated: 2026-05-20 · `codex-on-claude` v0.4.1 · driver `claude-haiku-4-5` · callee `gpt-5` (estimated pricing)
>
> Plan: `~/.claude/plans/codex-mutable-dream.md`. Raw artifacts: `install/fixtures/bench/_runs/ALPHABETA-20260520T081723Z/`.

## Executive Summary

이 리포트는 Claude Code 단독 구동(α)과 Claude Code 가 codex-on-claude 를 통해 Codex 를 자유자재로 호출하는 상호 구동(β)을 **품질·토큰·지연·비용 4 축** 에서 비교한다.

- **범위**: 대표 6 시나리오 (B5 보안감사 · B11 자제 테스트 · B12 환각 트랩 · D1 문서 자체발전 루프 · D2 추론 깊이 · D4 분석→개선 루프) × α/β 양쪽 = 12 runs
- **메트릭**: ORACLE 기반 점수, Claude 토큰(in/out/cache_read/cache_creation), 추정 Codex 토큰(char/4 of `mcp__codex__codex*` tool_results), USD 비용(PRICING.json 기준), wall-clock 지연
- **방법론**: `install/fixtures/bench/run.sh` 가 각 시나리오를 격리된 git 워크스페이스에서 `claude -p --model haiku --output-format stream-json` 으로 실행, `score.mjs` 가 ORACLE.json 룰로 채점, `report.mjs` 가 3-표로 집계

전체 16 시나리오 (B1-B12 + D1-D4) × N=3 on critical 풀-매트릭스는 `BENCH_ISOLATE=1 ./install/fixtures/bench/runall.sh` 로 별도 실행 가능 (~$3.35, ~2-3 시간).

---

## Table A — Headline (α vs β quality)

| Scenario | N | α score | β score | Δscore | Synergy verdict |
|---|---:|---:|---:|---:|---|
| B5-secaudit | 1 | 6.0/6 | 6.0/6 | 0.0pp | tie |
| B11-trivial | 1 | 5.0/5 | 5.0/5 | 0.0pp | tie |
| B12-trap | 1 | 4.0/4 | 4.0/4 | 0.0pp | α-win |
| D1-doc-self-improve | 1 | 6.0/8 | **7.0/8** | **+12.5pp** | **β-win** |
| D2-reasoning-depth* | 1 | 5.0/6 | 5.0/6 | 0.0pp | β-redundant |
| D4-analyze-improve-loop | 1 | 5.0/5 | 5.0/5 | 0.0pp | tie |

`*` D2 의 `tests_pass` 가 양쪽 모두 false 로 나왔지만, 수동 검증 결과 **α 와 β 모두 유효한 6-queens 배치를 찾았음** (run_tests.sh 가 result.json 의 final_json 을 score.mjs 가 작성하기 전에 읽으려는 인프라 버그). 실질적으로 6/6 tie. 자세한 사항은 § "한계" 참조.

## Table B — Cost & latency (USD, wall-clock seconds)

| Scenario | α $ | β $ | Δ$ | Δ% | α wall (s) | β wall (s) | Δwall (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| B5-secaudit | $0.060 | $0.075 | $+0.015 | +25.8% | 10 | 50 | +40 |
| B11-trivial | $0.059 | $0.059 | $+0.0001 | +0.1% | 12 | 10 | -2 |
| B12-trap | $0.060 | $0.049 | $-0.011 | -18.6% | 12 | 13 | +1 |
| D1-doc-self-improve | $0.079 | $0.214 | $+0.135 | +170.9% | 28 | 343 | +315 |
| D2-reasoning-depth | $0.046 | $0.099 | $+0.053 | +116.4% | 186 | 67 | -119 |
| D4-analyze-improve-loop | $0.075 | $0.088 | $+0.013 | +16.9% | 24 | 16 | -8 |

**관찰**: D2 에서 β 가 α 보다 **빠름** (-119s). Codex high-reasoning 위임이 Haiku 의 자체 reasoning 보다 단축. D1 은 self-review loop 때문에 β 시간 12 배 증가하지만 품질 +12.5pp 으로 보상.

## Table C — Token detail (per-run averages; β includes Codex split)

| Scenario | Arm | claude_in | claude_out | claude_cache_read | codex_est | tr_p95(chars) | driver $ | codex $ | total $ |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| B5-secaudit | alpha | 46 | 15 | 170,509 | 0 | 1,028 | $0.060 | $0.0000 | $0.060 |
| B5-secaudit | beta | 72 | 16 | 342,628 | 97 | 1,028 | $0.075 | $0.0006 | $0.075 |
| B11-trivial | alpha | 52 | 14 | 239,738 | 0 | 253 | $0.059 | $0.0000 | $0.059 |
| B11-trivial | beta | 52 | 10 | 239,920 | 0 | 252 | $0.059 | $0.0000 | $0.059 |
| B12-trap | alpha | 46 | 15 | 170,509 | 0 | 610 | $0.060 | $0.0000 | $0.060 |
| B12-trap | beta | 36 | 18 | 141,764 | 0 | 610 | $0.049 | $0.0000 | $0.049 |
| D1-doc-self-improve | alpha | 60 | 14 | 283,609 | 0 | 1,849 | $0.079 | $0.0000 | $0.079 |
| D1-doc-self-improve | beta | 186 | 43 | 1,102,853 | 1,357 | 5,139 | $0.205 | $0.0088 | $0.214 |
| D2-reasoning-depth | alpha | 48 | 19 | 198,231 | 0 | 991 | $0.046 | $0.0000 | $0.046 |
| D2-reasoning-depth | beta | 86 | 34 | 411,694 | 203 | 991 | $0.097 | $0.0013 | $0.099 |
| D4-analyze-improve-loop | alpha | 60 | 7 | 281,867 | 0 | 2,703 | $0.075 | $0.0000 | $0.075 |
| D4-analyze-improve-loop | beta | 70 | 50 | 310,922 | 0 | 2,703 | $0.088 | $0.0000 | $0.088 |

**관찰**:
- **B11 자제 동작 확인**: β 의 `codex_est=0` — Skill 의 trivial 회피 가드 가동.
- **B12 비용 역전**: β 가 α 보다 싸다 (-18.6%). 이미 올바른 코드에 환각 안 함 + 짧은 응답.
- **D1 의 캐시 4 배 증가**: β 의 `claude_cache_read=1.1M` vs α 의 283K — self-review loop 가 컨텍스트 재사용 (캐시 히트) 으로 비용 완화.
- **B5 codex 토큰 97**: 가장 작은 Codex 사용. 충분히 풍부한 review.
- **D4 의 분석기 우회**: β 가 `/codex-analyze` 호출 대신 직접 패턴 매칭 (codex_est=0) — Skill 의 prose 보다 LLM 의 즉답이 빠른 사례.

## Aggregate

- **총 비용**: α=$0.378 · β=$0.584 · **Δ=+$0.205 (+54%)**
- **Verdict 분포**: tie 3 (B5, B11, D4) · α-win 1 (B12) · β-win 1 (D1) · β-redundant 1 (D2)
- **Mean Δquality (β−α)**: **+2.08 pp** — β 가 평균 2pp 더 많은 criteria 통과
- **Findings-per-dollar lift**: 4.9 extra findings per extra $1 spent on β
- **총 wall-clock**: α 합 = 272s, β 합 = 499s. **β 가 +83% 길지만** D2 에서는 단축됨

---

## 메트릭 정의

| 컬럼 | 의미 | 출처 |
|---|---|---|
| **α score / β score** | ORACLE.json criteria 통과 개수 / 전체 | `score.mjs` |
| **Δscore** | β-α 의 pp 차이 (criteria 통과율 기준) | `report.mjs` |
| **Synergy verdict** | `{β-strict-win > β-win > tie > α-win > β-redundant > β-harmful}` enum. β-redundant = β 품질 ≥ α 이지만 비용 > 1.5×α | `report.mjs:synergyVerdict()` |
| **α $ / β $** | 시나리오별 USD 비용. driver(Claude) + callee(Codex) 합산. PRICING.json (`as_of: 2026-05-20`) | `report.mjs` |
| **claude_in/out** | 시나리오별 Claude 입력/출력 토큰 (per-run 평균) | `cost.json` (assistant message.usage 합산) |
| **claude_cache_read** | 캐시 히트 토큰 — 비용 효율의 핵심 지표 | `cost.json` |
| **codex_est** | Codex tool_result 의 `chars / 4` (±30%) | `cost.codex.json` (v0.4.2+: tool_use_id 페어링으로 정확히 `mcp__codex__codex*` 만 계산) |
| **tr_p95(chars)** | 메인 컨텍스트로 들어온 모든 tool_result 응답 크기의 p95 — D3 토큰 효율 측정 | `tool_result_sizes.json` |
| **wall (s)** | `claude -p` 실행 시작-종료 wall-clock 초 | `timing.json` |

---

## 시나리오별 상세

### B5 — Security audit (4 planted issues: SQLi, XSS, MD5, hardcoded secret)
- **α 가정**: Claude Haiku 단독으로 4 개 보안 이슈를 모두 식별
- **β 가정**: `/codex-review` 위임으로 Codex 의 보안 도메인 강점 활용
- **차별점**: β 가 더 일관되게 4 개 모두 잡을 것 (특히 약한 모델일 때)

### B11 — Trivial typo fix (β-restraint test)
- **α 가정**: Claude Haiku 가 한 줄 오타 즉시 수정
- **β 가정**: `/codex-review` 호출하지 **않음** (Skill 의 "trivial 회피" 가드 가동)
- **차별점**: β 가 Codex 호출하면 β-redundant verdict — 의도된 부정 케이스

### B12 — Trap (already-correct code, hallucination resistance)
- **α 가정**: 이미 올바른 코드에 "버그 찾아라" 요구를 받고 환각 저항
- **β 가정**: 동일, Codex 2 차 의견으로 환각 가능성 더 낮춤
- **차별점**: 양쪽 모두 환각하지 않으면 tie / α-win

### D1 — Doc writing + self-review loop (신규)
- **α 가정**: SKILL.md 5 섹션 1 패스 작성
- **β 가정**: 초안 → `/codex-review` → 반영 → `/codex-review` 재확인 (2-round 루프)
- **차별점**: β 가 빠진 섹션/에지 케이스를 잡아내 더 완성도 높음. β 만 `tool_call_count_min=2` 조건

### D2 — Constraint puzzle (modified N-queens, 4 stacked constraints) (신규)
- **α 가정**: Haiku 단독 추론으로 4 개 제약 동시 만족 6-queens 찾기
- **β 가정**: Codex `reasoning=high` 호출로 NP-hard mini 인스턴스 탐색
- **차별점**: 검증 스크립트(`run_tests.sh`)가 실제 placement 의 4 가지 제약을 모두 검사

### D4 — Analyze → Improve loop (신규)
- **α 가정**: 시드 로그(repeated-prompts + large-direct-responses) 를 직접 읽고 패턴 추론
- **β 가정**: `/codex-analyze` 호출로 `ruleRepeatedPrompts` + `ruleLargeResponsesNotAgent` 자동 감지
- **차별점**: β 의 분석기가 결정론적으로 룰 fire — α 의 자유형 추론보다 일관성 높음

---

## 시너지 원장 (Per-Codex-call ledger)

본 sweep 의 6 β-arm 실행에서 발생한 모든 Codex 호출. 총 **5 calls / 4 scenarios** (B5: 1, D1: 2, D2: 2, B11/B12/D4: 0).

| # | scenario | thread (short) | call_type | finding_status | severity | actionability | counterfactual_confidence | codex_est_tokens | net_value |
|---|---|---|---|---|---|---|---|---|---|
| 1 | B5-secaudit | 019e4476… | review | accepted: 4 issues identified (SQLi, XSS, MD5, secret) | matches-α (tie) | direct | low (α also found 4) | 97 | +0 (safety net, not differentiator) |
| 2 | D1-doc-self-improve | 019e4478… | review (round 1) | accepted: caught missing edge cases in initial draft | spec-extending | direct | high (α stopped at 6/8) | 678 | +1 (drove the +1 criterion pass) |
| 3 | D1-doc-self-improve | 019e447b… | review (round 2) | accepted: confirmed no remaining blockers | confirmation | none | medium | 679 | +0.5 (closure) |
| 4 | D2-reasoning-depth | 019e4480… | reasoning-depth | accepted: valid placement [[0,3],[1,1],[2,6],[3,2],[4,0],[6,4]] found | match-α (both valid) | direct | low (α also valid) | ~102 | +0 (β-redundant verdict) |
| 5 | D2-reasoning-depth | (same thread) | reasoning-verify | accepted: secondary verification | confirmation | none | low | ~101 | +0 |

**원장 집계**:
- `accepted` rate: 5/5 = 100%
- `counterfactual_confidence=high` rate: 1/5 (D1 round-1)
- Codex 가 **결정적 차별점을 만든 호출**: 1/5 (D1 round-1, 한 criterion 추가 통과)
- Codex 가 **안전망 / 확정** 역할만 한 호출: 4/5 (B5, D1-round2, D2-1, D2-2)
- Findings/dollar (β-only Codex spend): $0.0107 의 codex 토큰 비용으로 +1 finding 확정 → **~93 findings/$1**

**해석**: 5 호출 중 1 호출만이 β 의 점수를 올린 결정적 기여를 했다. 나머지 4 호출은 (a) α 가 이미 정답을 알고 있는 경우의 확인 (B5, D2) 이나 (b) 자체 검토 루프의 두 번째 라운드 (D1-round2). 이는 **시너지가 시나리오 종속** 임을 시사 — Codex 의 자유 호출이 항상 가치를 만드는 게 아니라, 도메인 갭이 있을 때 / 반복 검토가 필요할 때만 의미 있다.

---

## 휴먼 정성 검증 (Human Verdict)

ORACLE 기계 채점이 놓친 텍스처를 보강. 직접 final_text 읽고 1-2 문장 verdict.

### B5-secaudit (보안감사)
- **α**: 4 개 보안 이슈를 정확히 식별 + 각 항목에 구체적 remediation 제시 (bcrypt/Argon2 권고 등). 형식·내용 모두 깔끔.
- **β**: 양적·질적으로 α 와 거의 동일. 마지막에 통합 remediation 체크리스트 + Codex thread ID 자동 부착.
- **휴먼 verdict**: **실질 tie**. β 의 Codex 호출은 안전망 가치는 있으나 결과를 바꾸지 않음. Haiku 단독으로도 충분한 보안 영역.

### D1-doc-self-improve (문서 자체발전 루프) ★ 결정적 차별점
- **α**: 다섯 섹션을 실제로 작성하지 **않고** "다음 5 섹션을 포함한 문서를 작성했다" 라는 **메타-요약** 으로 회피. 118 단어. 트레일링 JSON 의 `sections_authored: []` 가 빈 배열. 룰 6/8.
- **β**: 두 차례 `/codex-review` 가 모두 "실제 섹션 작성" 강제. 결과는 5 개 섹션을 빠짐없이 채운 585~718 단어의 완성 문서. "Floating-point precision", "Process restart burst" 같은 비범한 edge case 도 자체 검토에서 추가됨. 룰 7/8 (단어수 미세 초과).
- **휴먼 verdict**: **β 의 결정적 승리**. self-review loop 가 "shortcut 회피" 강제 — Codex 의 가치가 알고리즘적 발견보다 **규율 강제** 에서 나옴.

### D2-reasoning-depth (constraint puzzle)
- **α placement**: `[[0,2],[1,4],[2,6],[5,1],[6,3],[7,5]]` — 수동 검증: 4 제약 모두 만족 ✓
- **β placement**: `[[0,3],[1,1],[2,6],[3,2],[4,0],[6,4]]` — 수동 검증: 4 제약 모두 만족 ✓
- **휴먼 verdict**: **양쪽 모두 유효한 해를 찾음**. β 는 Codex `reasoning=high` 위임에 67s, α 는 자체 reasoning 에 186s. β 가 빠르지만 (-119s) 비용은 +116% → speed/quality 동등, cost 손해. 본 시나리오 난이도가 충분하지 않았을 가능성 (Haiku 단독으로 해결 가능). 더 어려운 SAT/CSP 변형이 필요.

### B11-trivial, B12-trap, D4-analyze (요약)
- **B11**: 양쪽 동일한 1-줄 패치. β 가 codex 호출 자제 — Skill 가드 작동.
- **B12**: α 가 환각 안 함, β 도 환각 안 함. β 가 조금 더 짧고 싸다.
- **D4**: 양쪽 모두 `repeated-prompts` 패턴 정확히 식별. β 는 분석기 호출 없이 직접 추론 (시나리오 prose 의 "OR simulate" 분기).

---

## 한계 (Caveats)

- **드라이버 모델**: `run.sh:42` 의 `--model haiku` 하드코딩 → 본 결과는 **Haiku 사용자 기준**. Sonnet/Opus 일반화는 별도 실행 필요.
- **Codex 토큰 추정**: 실제 OpenAI billing 토큰이 아니라 `tool_result` 의 chars/4 휴리스틱 (±30%). MCP `usage` 필드가 stream-json 에 안정적으로 노출되면 정확해질 예정.
- **PRICING.json 의 OpenAI 가격**: 추정치. 실제 청구 검증 전에 갱신 필요. Anthropic 가격은 2026-05-20 기준.
- **N=1 mini-sweep**: B5/B11/B12/D1/D2/D4 모두 단일 실행. 풀 매트릭스 (N=3 on B1/B5/B6) 는 `BENCH_ISOLATE=1 ./runall.sh` 로 별도 (~$3.35, ~2-3h).
- **호스트 환경**: `improvementLoop=auto-on-skill` 상태로 실행 → PostToolUse 자동 로그 훅이 매 Codex 호출마다 fires (≤10ms 오버헤드, 토큰 측정에는 미반영).
- **B6 multi-turn (5 turns), B1/B2/B3/B4/B7/B8/B9/B10 제외**: 시간/비용 절약을 위해 mini-sweep 에서 제외. 패턴 차별점이 가장 명확한 6 시나리오만 실행.
- **D3 (token-efficiency) 제외**: 90KB 파일 입력이라 첫 실행에서 토큰 측정 오버헤드 크게 변동 가능. 별도 검증 권장 (D3 의 `tool_call_response_size_p95_max` evaluator 가 실측됨).
- **D2-reasoning-depth `tests_pass` 인프라 버그**: `D2-reasoning-depth/run_tests.sh` 는 score.mjs 가 result.json 을 쓴 후에 실행되어야 하지만 run.sh 의 순서상 그 전에 호출됨 (`install/fixtures/bench/run.sh:86-89` vs `:92`). 양쪽 모두 `FAIL: result.json not found` → exit 1 → tests_pass=false. **수동 검증 결과 α 와 β 둘 다 4 가지 제약을 모두 만족하는 유효한 placement 를 반환했음**. 향후 수정: queens 를 stream.jsonl 의 마지막 fenced ```json 블록에서 직접 파싱하도록 D2/run_tests.sh 재작성, 혹은 run.sh 의 test/score 순서 교환.
- **하네스 변경분 (Phase 0.5)**: `run.sh`, `score.mjs`, `report.mjs`, `runall.sh`, `PRICING.json` 모두 본 PR 에 포함되는 변경. 기존 `_runs/smoke/` baseline 과 동등성 확인됨.

---

## 재현 방법

```sh
# Prerequisites
codex-on-claude doctor         # 6 checks ok
claude mcp get codex           # ✓ Connected

# Single scenario (single arm)
cd install/fixtures/bench
TS="my-run/run1" ./run.sh B5-secaudit alpha
TS="my-run/run1" ./run.sh B5-secaudit beta

# Full mini-sweep (~$1.4, ~45 min)
RUN_ID=my-run BENCH_ISOLATE=1 bash -c '
  for s in B5-secaudit B11-trivial B12-trap D1-doc-self-improve D2-reasoning-depth D4-analyze-improve-loop; do
    rm -rf "$HOME/.claude/codex-on-claude/threads"/* 2>/dev/null
    for arm in alpha beta; do TS="$RUN_ID/run1" ./run.sh "$s" "$arm" || true; done
  done
'

# Full matrix (~$3.35, ~2-3h)
BENCH_ISOLATE=1 ./runall.sh

# Regenerate report from any run
node report.mjs "<RUN_ID>" > "_runs/<RUN_ID>/report.md"
```

---

## 산출물 트리

```
install/fixtures/bench/
├── PRICING.json                                  # USD pricing constants (Phase 0.5 신규)
├── run.sh                                        # 단일-arm 러너 (jq 필터 수정됨)
├── score.mjs                                     # ORACLE 룰 채점 (doc_section_exists / tool_result_sizes 추가)
├── report.mjs                                    # Table A/B/C + synergy_verdict + USD 환산 (재작성됨)
├── runall.sh                                     # 풀 매트릭스 (D1-D4 포함, BENCH_ISOLATE 지원)
├── B1-B12/                                       # 기존 12 시나리오
├── D1-doc-self-improve/                          # 신규
├── D2-reasoning-depth/                           # 신규 (run_tests.sh 포함)
├── D3-token-efficiency/                          # 신규 (~360KB access.log)
├── D4-analyze-improve-loop/                      # 신규
└── _runs/ALPHABETA-20260520T081723Z/             # 본 리포트의 raw 데이터
    └── run1/<scenario>/<arm>/
        ├── stream.jsonl
        ├── cost.json
        ├── cost.codex.json
        ├── tool_result_sizes.json                # 신규
        ├── tool_calls.jsonl
        ├── timing.json
        ├── changed.{files.txt,diff}
        └── result.json
```
