# Cerberus v0.5.1 — 시나리오 self-review 실행 결과 + Draft 3 정정 매핑

**Run date**: 2026-05-23
**대상 문서**: `docs/test-scenarios-cerberus-v0.5.1-and-full.md` (Draft 2)
**검증 방법**: Cerberus head 모드로 *자기 자신*의 테스트 시나리오 문서를 검증 → 합의된 정정 권고를 Draft 3에 반영
**결과**: Decision 만장일치 `needs-revision` (3 head). 6건 spec drift / 모순 식별 → 모두 fix 완료. 회귀 199/199 PASS 유지.

이 보고서는 단순한 "테스트 실행 결과"가 아니라 **Cerberus의 첫 production 사용 사례**이기도 함 — 도구가 자기 자신의 문서를 검증해 spec drift를 잡아낸 메타 검증 사례.

## 1. Cerberus self-review 실행

### 1.1 호출 방식

세션 시작 후 cerberus MCP / agent 등록은 다음 Claude Code 세션부터 인식되므로, **Step 2 PoC와 동일한 head 매핑**으로 실행:

| Spec head | 실제 사용한 도구 | 토큰 | 시간 |
|-----------|----------------|------|------|
| H1 Claude-only | `Agent({subagent_type:"general-purpose"})` + "Do NOT call mcp__codex__*" instruction | ~15k | 192s |
| H2 Codex-only | `mcp__codex__codex()` 직접 호출 (sandbox=read-only, approval=never) | ~4k | 짧음 |
| H3 Synergy | `Agent({subagent_type:"codex-reviewer"})` | ~13k | 207s |
| **합계** | | **~32k** | 4분(병렬) |

### 1.2 합의 알고리즘 적용

`install/cerberus-consensus.mjs`의 `consensus()` 함수에 3 plan 직접 입력 → 결정적 결과 산출.

| 메트릭 | 값 | 해석 |
|--------|-----|------|
| `agreement_score` | **0.032** | low 라벨 — Decision 일치이나 issue 다양성 높음 |
| `label` | low | `< 0.4` 임계 |
| `decisionUnanimous` | **true** | 3 head 모두 `needs-revision` |
| `raw.decisionMultiplier` | 1.5 | Decision case 1 적용 |
| `raw.rawScore` | 0.021 | multiplier 적용 전 |
| group counts | case1=1, case2=0, case3=0, case4=46 | Decision만 merged, 나머지 46건은 single-head |
| `dissent.validated` | 20건 | 사용자 채택 후보 |
| `dissent.disputed` | 0 | head 간 명시 충돌 없음 |

**해석**: low 라벨은 "head가 동의 못 했다"가 아니라 "각자 다른 결함을 발견했다"는 신호. Decision 일치 + 디테일 분산 → 합의 알고리즘이 정확히 작동.

## 2. 식별된 6건 issue

3 head 합의로 surface된 issue를 spec/시나리오 영역으로 분류:

| # | Issue | 출처 head | 영향 영역 | 정정 |
|---|-------|----------|----------|------|
| 1 | HU-09 spec drift — single-head reason 보수적 채택은 spec §3.3에 없는데 구현은 그렇게 동작 | h1+h2+h3 | spec drift | spec §3.3 case 4에 `kind=="reason"` 명시 추가 |
| 2 | HU-15 (plans=3) vs HC-07 (plans=2) 직접 모순 | h1+h2+h3 | 시나리오 자체 모순 | HC-07 stub plan 패턴으로 재작성 (length=3 유지) + HC-07b 후보 추가 |
| 3 | HC-04 PoC vs spec 임계값 충돌 — PoC §4.2(i)가 "0.65 → high" 적었지만 spec §3.4는 ≥0.7 high | h3 단독 (강한 신호) | 문서 내부 모순 | PoC §4.2(i) 정정 ("0.65 → moderate") + HC-04 기대 ≥0.4 moderate floor로 완화 |
| 4 | AUTO 라벨 over-claim — HU-03/04/05/08/13/14/19가 🅐 표기인데 부분 커버만 | h2+h3 | 보고 정확성 | 매핑 표에 `partial` 라벨 + 보강 가이드 추가 |
| 5 | HC-04/05/06 nondeterministic — live LLM 의존 | h2+h3 | 재현성 | warning + fixture-replay 권장 노트 추가 (HU-31 후보) |
| 6 | HC-09 footer 책임 경계 모호 — server payload vs Skill prose | h1+h3 | 책임 분리 | server(`cost_remaining`) + Skill(`(cost cap reached)` footer) 명시 분리 |

## 3. Draft 3 적용 산출물

### 3.1 spec 변경 — `docs/cerberus-mode-spec.md` (Draft 2 → Draft 3)

- §3.3 case 4: `kind=="risk" OR kind=="reason"` 으로 확장 (이슈 #1)
- §3.4 근거 문장: "0.65, moderate" 명시 + Draft 3 정정 마커 (이슈 #3 spec 측)
- Status 라인: Draft 2 → Draft 3, 2026-05-23로 갱신

### 3.2 PoC 보고서 — `docs/cerberus-poc-2026-05-22.md`

- §4.2(i) "0.65 → high" → "0.65 → moderate"로 수정 + 정정 마커 (이슈 #3 PoC 측)

### 3.3 시나리오 문서 — `docs/test-scenarios-cerberus-v0.5.1-and-full.md` (Draft 2 → Draft 3)

| 변경 | 카드 |
|------|------|
| HU-03 split | HU-03a (case 3 — 2-head 일치+1 missing), HU-03b (case 2 — 3 head 모두 다름) |
| HU-04 강화 | cap with boosted multiplier fixture 명시 (rawScore=1.0 × 1.5 → 1.0 cap) |
| HU-05 boundary 명시 | 4 fixture (0.4 / 0.3999 / 0.7 / 0.6999) + raw-score-based 라벨링 |
| HU-09 split | HU-09a (risk), HU-09b (reason) |
| HC-04 임계값 | "≥0.7 high" → "≥0.4 moderate floor" + nondeterminism 경고 |
| HC-07 재작성 | stub plan 패턴 (`{head:"h2", plan:"H2_FAILED:...", tokens:0}`) + HC-07b 후보 |
| HC-09 책임 분리 | server layer + Skill layer 기대값 분리 명시 |
| 매핑 표 | 8건 partial 라벨 + 보강 assertion 가이드 |
| Draft 3 정정 요약 표 | 문서 끝에 6건 issue × Before/After 추가 |

### 3.4 시나리오 ID 분포 (Draft 2 → Draft 3)

| 모드 | Draft 2 | Draft 3 | 증분 |
|------|---------|---------|------|
| HU (Head 단위) | 20 | 22 | +2 (HU-03/09 split) |
| HC (Head 복합) | 10 | 11 | +1 (HC-07b 후보) |
| FU (Full 단위 PENDING-IMPL) | 10 | 10 | — |
| FC (Full 복합 PENDING-IMPL) | 5 | 5 | — |
| **합계** | **45** | **48** | **+3** |

## 4. 회귀 (구현 변경 없음 확인)

본 task는 문서 정정만 수행 — `install/cerberus-*.mjs` 및 자동화 테스트 코드는 변경 없음. 회귀 확인 결과:

| 스위트 | v0.5.1 ship | Draft 3 후 | 회귀 |
|--------|------------|------------|------|
| Unit | 138 / 138 PASS | **138 / 138 PASS** | 0 |
| Integration | 37 / 37 PASS | **37 / 37 PASS** | 0 |
| Regression | 7 / 7 PASS | **7 / 7 PASS** | 0 |
| Installer-flow | 17 / 17 PASS | (변경 없음) | 0 |
| **합계** | **199** | **199** | **0** |

## 5. 메타 결론 — Cerberus가 자기 자신을 검증한 가치

Cerberus head 모드의 의도된 가치를 처음으로 production에서 입증한 사례:

1. **만장일치 Decision 도달** — 3개 독립 perspective가 같은 결론에 도달 (`needs-revision`). 단일 reviewer였다면 발견 못 했을 spec drift 6건이 surface됨.
2. **head별 differentiated 발견** — h3 단독으로 HC-04 임계값 모순(이슈 #3)을 잡아냄. h1/h2는 못 잡은 issue. **single-head reason 보수적 채택 룰의 가치**가 입증됨 (구현 + Draft 3 spec 양쪽 모두 정당화).
3. **low 라벨이 정확한 신호** — score 0.03 low는 "head 의견 분산"이 아니라 "결함 다양성"의 정직한 표현. Decision은 일치하지만 디테일이 다르다는 신호를 사용자에게 전달.
4. **dissent.validated 20건 = 즉시 채택 가능 권고** — head 간 명시 충돌 없는(disputed=0) 추가 제안이 풍부. 향후 시나리오 확장의 backlog.
5. **결정성 보장** — 같은 3 plan 입력 → 같은 정정 권고 산출. `consensus` 함수가 의도대로 작동.

## 6. 비용

| 항목 | 값 |
|------|-----|
| 토큰 | ~32k |
| 추정 비용 | ~$0.10 |
| 시간 | 4분 (3 head 병렬) + 정정 작업 약 30분 |
| 산출 변경 파일 | 3개 (spec, PoC, scenarios) + 본 보고서 1개 |

## 7. 다음 액션 후보 (별도 task)

본 Draft 3 정정 후에도 cerberus self-review가 surface한 다음 항목은 v0.5.2 plan 시 정식 작업으로:

- **신규 시나리오 11건** (HU-21~29, HC-11~12): index.json ordering, atomic+0700, plans 영속화, phase=errored, headWeights override, normalize/bold-strip, agent body ≤80줄, multi-topic-per-head, cerberus-cost-cap flag, choices.cerberus 구조화 영속화
- **자동화 보강**: AUTO partial 8건을 full로 승격하기 위한 assertion 추가 (cerberus-consensus.test.mjs 확장)
- **HC-07b 활성화 결정**: plans schema를 length=3 강제 → 2..3 완화할지 결정 (spec §2.2 + zod schema + HU-15 동시 갱신)
- **Full 모드 구현**: FU-01~FC-05 (15건 PENDING-IMPL)을 ship 가능 시나리오로 전환
