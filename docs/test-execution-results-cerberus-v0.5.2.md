# Cerberus v0.5.2 — self-review 재실행 (메타 검증 3회차)

**Run date**: 2026-05-23
**대상**: v0.5.1 self-review에서 얻은 3 head plan을 v0.5.2 알고리즘으로 재실행
**목적**: stemming + case-4 conservative partial credit 두 개선이 score signal에 미친 영향 측정
**결과**: 0.03 low → **0.42 moderate**, 13배 개선. label 1단계 상승. v0.5.1 self-critique #3(의역 취약)이 가시적으로 해소됨.

## 비교 표

| 메트릭 | v0.5.1 (Draft 2) | v0.5.2 (Draft 4) | 개선 |
|--------|------------------|------------------|------|
| `agreement_score` | 0.032 | **0.42** | ×13 |
| `label` | low | **moderate** | +1 단계 |
| `decisionUnanimous` | true | true | (유지) |
| 총 그룹 수 | 47 | **10** | -78% (stemming 그룹핑) |
| `case1` | 1 (Decision만) | 1 (Decision만) | (유지) |
| `case4` | 46 (전부 single-head) | 9 (case4Conservative 6 + case4Other 3) | -80% |
| `case4` 점수 기여 | 0 | **2.4** (6 × 0.3 × 1.5 multiplier) | +∞ |
| `rawScore` | 0.021 | **0.28** | ×13 |
| `decisionMultiplier` | 1.5 | 1.5 | (유지) |

## 해석

### 두 개선이 각각 기여한 부분

1. **Porter Stemmer (Track C)** — 같은 어근 토큰들이 그룹핑됨:
   - "deterministic" / "deterministically" / "determinism" → 같은 stem "determinist"
   - "reason" / "reasoning" / "reasons" → "reason"
   - "merge" / "merged" / "merging" → "merg"
   - 결과: 47 그룹 → 10 그룹 (의역만 다른 reason/risk가 자연스럽게 묶임)

2. **case-4 conservative partial credit (Track C)** — 단일 head reason/risk도 신호로 인정:
   - 9건 case 4 중 6건이 reason/risk → consensus_plan에 채택됨 → 0.3 가중치
   - 이전: 0 기여 → 점수에 반영 안 됨 (misleading)
   - 이후: 1.8 (6 × 0.3) 기여 → multiplier 후 2.7 효과

### Decision 만장일치는 v0.5.1 그대로 유지

`decisionUnanimous: true`, `decisionMultiplier: 1.5` 모두 동일 — 3 head가 `needs-revision`에 합의했다는 신호가 그대로 보존됨. v0.5.2는 점수 공식만 정직화한 것이지 합의 판단을 바꾸지 않음.

### 사용자 직관 정합

v0.5.1: 사용자 입장 — "label=low? head들이 의견이 갈렸나?" → 실제로는 만장일치였음. 도구의 신호가 misleading.

v0.5.2: 사용자 입장 — "label=moderate, agreement=0.42, Decision unanimous" → "head들이 핵심엔 동의했고, 디테일이 다양하다"는 정직한 시그널. 추가 정보(dissent 섹션)와 일관.

## v0.5.1 self-critique 3건 처리 결과

| Self-critique # | 약점 | v0.5.2 처리 | 가시적 결과 |
|----------------|------|------------|-----------|
| #1 | 실세션 e2e 검증 부재 | Track A1: `cerberus-end-to-end.test.mjs` (4 test, MCP stdio booting) + Track A2: 사용자 hands-on 체크리스트 8단계 | 자동 4건 PASS, 사용자 hands-on은 세션 재시작 후 실행 |
| #2 | SKILL.md prose 의존성 | Track B: nonce challenge (init이 head별 6-hex nonce 발급, consensus가 검증) — Skill이 1 head만 spawn하거나 fake plan 만들면 백엔드가 즉시 reject | e2e test "consensus rejects when nonces are missing/wrong" PASS — 백엔드 강제 작동 입증 |
| #3 | 의역 취약 — score misleading | Track C: Porter Stemmer + case-4 partial credit | 본 보고서 — score 0.03 → 0.42 (의역 정규화 + 신호 정직화) |

## 회귀 (모두 PASS 유지)

| 스위트 | v0.5.1 | v0.5.2 | 증분 |
|--------|--------|--------|------|
| Unit | 138 | **167** (138 + 29 신규) | +29 (stemming 14 + nonce 10 + score-formula 5) |
| Integration | 37 | **41** (37 + 4 신규 e2e) | +4 |
| Regression | 7 | 7 | — |
| Installer-flow | 17 | 17 | — |
| **합계** | **199** | **232** | **+33** |

회귀 0건 — v0.5.1 기존 자동화 모두 통과 (Porter Stemmer가 기존 fixture 영향 없음, normalizeTokens 옵션 둘 다 결정적).

## 비용

| 항목 | v0.5.1 self-review | v0.5.2 self-review |
|------|-------------------|-------------------|
| Codex API 호출 | ~32k 토큰 (~$0.10) | **0 토큰** (이전 plan 재사용, 알고리즘만 재계산) |
| 시간 | 4분 | **<1초** (pure function) |

본 메타 검증은 알고리즘 변경 효과만 측정하므로 새 head spawn 불필요 → 0 비용 / 즉시.

## 메타 결론

Cerberus가 자기 자신을 검증한 사례가 누적 3회:
1. **v0.5.1 self-review** (2026-05-23) — spec drift 6건 발견 → Draft 3로 정정
2. **사용자 self-critique 요청** (직접 검증) — 구조적 약점 3건 발견 → v0.5.2 plan 산출
3. **v0.5.2 self-review 재실행** (본 보고서) — 약점 #3(의역) 13× 개선 가시화

이 패턴이 **도구가 자기 자신을 발전시키는 폐쇄 루프**의 첫 production 사례. v0.5.3+에서는 자기 호출이 더 풍부한 dissent.validated 추가 권고를 surface할 가능성 (현재 dissent.validated 0건 — 신규 plan을 받지 않았기 때문).

## Known limitations remaining

| Self-critique # | 처리 정도 | 남은 부분 |
|----------------|----------|----------|
| #1 | 자동 e2e PASS, 사용자 hands-on은 미실행 | 사용자가 세션 재시작 후 `cerberus-session-restart-checklist.md` 8단계 PASS 확인 필요 |
| #2 | nonce challenge로 백엔드 강제 OK | "verbatim present" 강제는 여전히 prose — 사용자에게 보일 텍스트 변형 가능. presentation_checksum 같은 추가 가드는 v0.5.3+ |
| #3 | 13배 개선 OK | embedding-based similarity는 여전히 미도입 (옵션 C 미구현). PoC fixture에서 0.43 → ~0.77 high 도달 가능했으나, 본 self-review 재실행에서는 0.42 moderate (input plan 분포 차이) — 더 풍부한 head 합의 신호가 필요한 케이스에는 stemming + partial credit이 부족할 수 있음 |

v0.5.3 backlog: 위 3건 + Cerberus Full 모드 (FU-01~FC-05, 15건) + presentation_checksum + embedding 옵션 평가.
