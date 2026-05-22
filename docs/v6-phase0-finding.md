# v6 Phase 0 — Hypothesis Refutation (즉각 발견)

> Date: 2026-05-21
> Phase 0 (complexity-metric.mjs) 실행 후 sweep 없이 발견된 finding.

## TL;DR

v6 의 출발 가설 **"β-win = src complexity 가 high 일 때만"** 가 **이미 v1-v5 데이터로 REFUTE**.

| v4 β-WIN scenario | C (v6 metric) | 예측 (v6 hypothesis) | 결과 |
|---|---|---|---|
| **D1-doc-self-improve** (+29pp N=3) | **C=2** | C ≥ 8 | ❌ 틀림 |
| **D2-reasoning-depth** (+8pp) | **C=2** | C ≥ 8 | ❌ 틀림 |
| **E3-tdd-cycle** (+17pp) | **C=3** | C ≥ 8 | ❌ 틀림 |
| **B9-hostile** (+25pp) | (no src) | — | inapplicable |

반대로 high-C scenarios (T06, E6 family C=5-10) 는 모두 β-redundant 또는 β-harmful.

→ **src complexity 는 β-win 의 결정요인이 아님**.

## 진짜 driver — α 의 partial-fail rate

v4 β-WIN scenarios 의 α score:
- D1: α=66.7% (5/8 N=3 일관) — partial fail
- D2: α=83.3% N=2 — partial fail
- E3: α=66.7% (4/6) — partial fail
- B9: α=75% — partial fail

**공통점**: α 가 50-95% 범위에 위치 — **부분적 통과**.

반면 v5 의 ceiling scenarios (T06, E6 등 high-C):
- α=100% — β 가 추가로 catch 할 게 없음

## 새 가설 (v6 redirect)

> **β-win 의 진짜 조건** = α 가 단발에서 **50-95% partial-fail** 하는 task profile

이를 결정하는 요인은 **src complexity 가 아니라**:
1. **ORACLE 의 criteria diversity** — α 가 5/8 missing 가능
2. **Spec 의 under-specification** — α 가 "충분히 covered" 라고 가정해서 빠지는 부분 있음
3. **Task 의 multi-faceted nature** — 여러 측면 중 1-2개를 α 가 놓치는 경향

## v6 plan 갱신 필요 사항

### 폐기 / 약화
- ❌ "src complexity dial" (T11-T15 tiered): src 자체 LOC 늘려도 β-win 안 일어남
- ❌ "LOC, file_count 기반 임계점": 무관

### 채택 / 재초점
- ✅ **ORACLE complexity dial**: criteria 수 + 다양성 변동
- ✅ **α partial-fail probability**: smoke test 에서 α 가 50-95% 통과하는 시나리오만 채택
- ✅ **Task subtlety dial**: spec 의 명시 vs implicit 비율 변동

### 새 통제 변수

| 신규 dimension | Low | Mid | High |
|---|---|---|---|
| **ORACLE 다양성** | 3 simple criteria | 6 mixed | 10+ multi-faceted |
| **α partial-fail target** | α=100% | α=70-90% | α=40-60% |
| **Spec under-spec ratio** | 모두 명시 | 일부 implicit | 다수 implicit |

이 dimensions 에서 변동을 줘서 **α partial-fail rate** 를 통제 변수로 직접 변동 → β 의 capture rate 측정.

## 다음 결정 (사용자 확인 필요)

3 가지 진행 옵션:

**Option A — v6 폐기, v5 결과로 종료**
- v5 의 가이던스가 이미 정확 (synthetic vs complex 정성 표현)
- 더 비싼 sweep 없이 종료

**Option B — v6 가설 재정의 후 진행** (recommended)
- complexity-metric → α-partial-fail-target 으로 치환
- T11-T15 tiered 대신 **α-fail-rate tiered** 작성
- 시나리오 25 + real codebase 15 사용하되 ORACLE 다양성 / spec 명시도 다이얼

**Option C — Phase 0 결과만 정리해서 가이던스 v3 갱신**
- v6 sweep 없이 이 finding 만 가이던스에 반영
- ~$0 추가, ~1h
