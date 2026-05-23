# Cerberus 모드 상세 테스트 시나리오 (Head v0.5.3 + Full PENDING-IMPL, Opus 4.7 재검증)

**Status**: Draft 1 — Opus 4.6 → 4.7 모델 업그레이드 직후 재검증용
**작성일**: 2026-05-23
**대상 버전**: v0.5.3 (Head 모드 구현본 + 4 critical fix) + Full 모드 spec 회귀 가드
**대상 모델 라인업**: Opus 4.7 (primary) / Sonnet 4.6 / Haiku 4.5
**Base commit**: 46a693d
**기반 문서**: `docs/cerberus-mode-spec.md` (Draft 5), `docs/test-scenarios-cerberus-v0.5.1-and-full.md` (Draft 3)
**선행 결과**: `docs/test-execution-results-cerberus-v0.5.2.md` (메타 self-review 4회차)

- **Head 모드 unit 시나리오 HU-01 ~ HU-20**: 기존 Draft 3 base 그대로. 자동화 75/75 PASS (모델-무관) — 본 문서에서는 0.5.3 fix 반영 사항만 명시.
- **Head 모드 e2e 시나리오 HC-01 ~ HC-10**: 기존 Draft 3 base — HC-04~06 의 expected 부분만 Opus 4.7 변동성 명시.
- **신규 모델 의존 시나리오 HU-31 ~ HU-33, HC-11** — Opus 4.7 paraphrase 분포 변화 대응 회귀 가드.
- **Full 모드 시나리오 FU-01 ~ FU-10, FC-01 ~ FC-05**: 기존 Draft 3 base 그대로 PENDING-IMPL. 단 FC-01 (`scope="full"` 거부) 는 즉시 실행 가능.
- **Hands-on 8단계**: `docs/cerberus-session-restart-checklist.md` 참조 (중복 작성 금지).

라벨:
- `R` (READ-ONLY) — 환경 변경 없음
- `S` (SANDBOXED) — mktemp + HOME override
- `D` (DESTRUCTIVE) — `~/.claude/` 직접 변경, Phase 0 백업 필요
- `🅐` (AUTO) — 기존 `cerberus-*.test.mjs` 자동화로 커버
- `🅼` (MANUAL) — 사용자 슬래시 또는 별도 트리거 필요
- `M` (MODEL-DEPENDENT) — Opus 4.7 으로 결과가 변동될 수 있음

## 카테고리 요약

| 카테고리 | 건수 | 변경점 (vs Draft 3) |
|---------|------|-------------------|
| HU-01 ~ HU-20 unit | 20 | 자동화 71→75 PASS (v053-fixes 4건 추가). expected score 라벨 동일. |
| HC-01 ~ HC-10 e2e | 10 | HC-04~06 expected 에 "Opus 4.7 plan 변동성, score ≥0.4 moderate floor 만 assert" 추가 |
| HU-31 ~ HU-33 신규 unit | 3 | v0.5.3 critical fix 4건 (polarity / empty-token / stemming) 의 실 plan 회귀 가드 |
| HC-11 신규 e2e | 1 | Opus 4.7 plan e2e score 안정성 측정 |
| FU-01 ~ FU-10 + FC-01 ~ FC-05 | 15 | PENDING-IMPL. FC-01 만 즉시 실행. |
| **합계** | **49** | |

---

## §1 Head 모드 unit 시나리오 HU-01 ~ HU-20

기존 `docs/test-scenarios-cerberus-v0.5.1-and-full.md` Draft 3 §A~E (HU-01 ~ HU-20) 와 동일. 본 문서에서는 v0.5.3 변경 사항만 표기:

- **자동화 커버 확대 (Draft 5)**: `cerberus-v053-fixes.test.mjs` 7 테스트 추가 → 총 71 → 75 PASS. polarity / empty-token / render / leading-y 4 fix 의 회귀 가드.
- **HU-04 cap**: 변경 없음. case4Conservative 0.3 점 가중치는 `rawScore` 계산 내부에서만 영향 — agreement_score cap 1.0 동일.
- **HU-05 라벨 경계**: 변경 없음.
- **HU-13/14 stopword/Jaccard**: v0.5.3 에서 `STOPWORDS` 에서 `"not"` 제거 (polarity tracking 으로 이전). normalizeTokens 결과에 `not` 포함 — fixture 갱신 필요한 경우 명시.
- **HU-17 scope=full 거부**: 메시지 변경 — `"disabled in v0.5.1"` → `"disabled in this release"` (release-agnostic 문구). Test fixture 갱신 시 정규식 패턴 사용 권장.

자세한 시나리오 본문은 Draft 3 doc 그대로 참조 (`docs/test-scenarios-cerberus-v0.5.1-and-full.md` HU-01 ~ HU-20 섹션).

---

## §2 Head 모드 e2e 시나리오 HC-01 ~ HC-10

기존 Draft 3 base 그대로. 단 **HC-04 / HC-05 / HC-06** expected output 부분에 다음을 추가:

> **Opus 4.7 변동성 (v0.5.3 추가)**: Opus 4.7 은 4.6 대비 plan 표현이 더 풍부/의역다양 → topic 추출 후 Jaccard 매칭률이 낮아질 수 있음. HC-04 의 score 기대치는 byte-identical 이 아니라 **agreement_score ≥ 0.4 moderate floor** 만 assert. PoC 0.43 (v0.5.0) / v0.5.1 self-review 0.03 / v0.5.2 self-review 0.42 / **v0.5.3 + Opus 4.7 실측 0.15 (M finding 1)** 으로 변동 폭이 크다. 절대값 기준 PASS/FAIL 대신 score band (low/moderate/high) 와 dissent 분류 정합성 으로 판정.

나머지 HC-01 ~ HC-10 본문은 Draft 3 그대로.

---

## §3 신규 모델 의존 시나리오 HU-31 ~ HU-33, HC-11

### HU-31 · polarity adversarial — 정반대 의견 3개의 case 4 분류 🅼 R M

**Given**: 동일 주제 (caching) 에 대해 polarity 가 다른 3개 plan fixture.
- h1: Decision="Use cache for the API responses." Reason "Cache reduces redundant network calls."
- h2: Decision="Never use cache for the API responses." Reason "Cache reduces redundant network calls but introduces staleness."
- h3: Decision="Consider cache for the API responses if benchmarks justify it." Reason "Cache reduces redundant network calls in some workloads."

**When**: `mcp__cerberus__consensus(run_id, plans=[h1,h2,h3])` 호출.

**Then**:
- ✓ 3개 Decision (kind=decision) 모두 별도 항목으로 `dissent.disputed` 또는 `dissent.validated` 에 분리 — false-merge 금지.
- ✓ 부정 토큰 (`never`, `not`) 감지 → polarity guard 가 case 1 merge 차단.
- ⚠ `*(lost to ?)*` 렌더링 회피 — case-4 decision 이 dissent.disputed 에 들어갈 때 `lostTo` 필드 누락되면 안 됨. **현재 v0.5.3 알려진 버그** (MEDIUM finding 2, 본 결과 문서 §4 참조).
- ⚠ mid-sentence negation ("Cache reduces ... but introduces staleness") 는 polarity 감지가 약함 — h1/h2/h3 reason 이 tournament merge 될 수 있음 (MEDIUM finding 3).

**실패 조건**: case 1 으로 잘못 merge, polarity 무시.

**Source**: `install/cerberus-consensus.mjs:detectPolarity()` (line 41-43), `groupByJaccard()` polarity guard.

---

### HU-32 · empty-token guard — 한국어 단일글자 🅼 R M

**Given**: 한국어 단일글자 fixture 3개 plan.
- h1: Decision=`예`. Reasons=[`예`, `좋`, `가`]. Risks=[`음`]. Steps=[`함`].
- h2: Decision=`아니오`. Reasons=[`아`, `또`, `그`]. Risks=[`험`]. Steps=[`말`].
- h3: Decision=`글쎄`. Reasons=[`글`, `쎄`, `음`]. Risks=[`흠`]. Steps=[`보`].

**When**: `consensus()` 호출.

**Then**:
- ✓ 모든 단일글자 항목이 case 4 분리 — false-merge 금지 (`groupByJaccard()` empty-token guard 작동).
- ✓ 동일 단일글자 (`음` h1-risk vs h3-reason) 는 kind 가 달라 비교 자체가 안 됨 — 정상.
- ✓ Decision 3개는 polarity 무관 (한국어 stopword 없음, 부정 토큰 없음) → `dissent.validated` 또는 tournament 후 1개 winner + 2개 `dissent.disputed`. tournament winner 시 `*(lost to <winner>)*` 정상 렌더.

**실패 조건**: 단일글자 토큰이 Jaccard=1 로 case 1 false-merge.

**Source**: `install/cerberus-consensus.mjs:groupByJaccard()` empty-token guard (Draft 5 §3.3, v0.5.3 critical fix #2).

---

### HU-33 · stemming false-merge guard — 21쌍 어근 충돌 🅼 R M

**Given**: Porter Stemmer 가 같은 stem 으로 정규화하지만 의미가 다른 단어 쌍 (general/generic, organize/organic, business/busy) 을 의도적으로 다수 배치한 3개 plan.
- h1: Reasons=["A general approach reduces ramp-up time.", "A business case justifies the upfront cost.", "Organize tasks by domain owner."]
- h2: Reasons=["A generic approach loses domain detail.", "A busy schedule prevents large refactors.", "Organic ownership emerges over time."]
- h3: Reasons=["A general framework supports both approaches.", "A generic checklist covers minimum criteria.", "Organize for large teams, organic for small."]

**When**: `consensus()` 호출.

**Then**:
- ✓ general/generic 쌍이 같은 stem (`gener`) 임에도 별도 topic 으로 분리. body text 의 차이로 Jaccard 임계 미달.
- ✓ organize/organic 도 동일 (`organ`).
- ✓ business/busy 도 동일 (`busi`).
- ✓ 9개 reason 모두 case 4 conservative inclusion — false-merge 없음.

**실패 조건**: Porter Stemmer 의 21쌍 충돌이 실 plan 환경에서 case 1 false-merge 유발. score 가 인공적으로 0.7+ high 로 부풀려짐.

**Source**: `install/cerberus-consensus.mjs:stem()` (line 94-165), `install/fixtures/v05/unit/cerberus-stemming-adversarial.test.mjs` 21쌍 snapshot.

---

### HC-11 · Opus 4.7 plan e2e score 안정성 측정 🅼 D M

**Given**: cerberus=on, 본 세션 (또는 새 세션) 에서 다음 task 호출.
> `/cerberus head "Decide whether the Cerberus Head mode v0.5.3 + Opus 4.7 re-test should treat the existing 75/75 automated suite as sufficient, or whether HU-31~33 (polarity / empty-token / stemming) need new automated fixtures before the next release."`

**When**: 3 head agent 가 실제로 spawn 되어 Opus 4.7 plan 산출 → consensus.

**Then**:
- ✓ `agreement_score` 기록 — historic 비교:
  - v0.5.0 PoC: 0.43 moderate (Decision 일치 + 의역 분산)
  - v0.5.1 self-review: 0.03 low (algorithm 미성숙)
  - v0.5.2 self-review: 0.42 moderate (algorithm 개선 후)
  - v0.5.3 + Opus 4.7 합성 fixture (본 doc 검증): **0.15 low** (3-way decision split, 모두 case 4)
- ✓ `dissent.validated` / `dissent.disputed` / `dissent.minority` / `dissent.missing` 4 bucket 모두 정확히 분류 + 렌더링.
- ✓ consensus_plan 에 `## Reasons` `## Risks / Trade-offs` `## Dissent` 섹션 모두 존재.
- ⚠ Opus 4.7 plan 의 의역 다양성이 stemming 으로 흡수되는지 / case 4 로 분리되는지 — 시나리오 본문이 아니라 PoC 데이터로 검증. score < 0.4 (low) 가 반복되면 stemming 임계 조정 또는 LLM-judge 보조가 v0.5.4 candidate.

**실패 조건**: Decision/Reasons/Risks 누락, nonce reject 실패 (잘못된 nonce 임에도 통과), score 계산 오류 (NaN, > 1.0, < 0).

**Source**: live MCP 호출 — `mcp__cerberus__init` + `mcp__cerberus__consensus`. 실 spawn 은 `docs/cerberus-session-restart-checklist.md` Step 6 (사용자 hands-on).

---

## §4 Full 모드 가드 시나리오 FU-01 ~ FU-10 + FC-01 ~ FC-05

기존 Draft 3 base 그대로 **PENDING-IMPL**. 본 문서에서는 v0.5.3 변경점만:

- **FC-01 (`scope="full"` 거부)** — 즉시 실행 가능. **PASS 조건**: `mcp__cerberus__init({scope:"full"})` 호출 시 응답 error 메시지에 `disabled in this release` 포함, run 디렉토리 미생성.
- **나머지 FU-01 ~ FU-10, FC-02 ~ FC-05** — 향후 Full 모드 구현 시 회귀 가드로 전환. 현 시점 실행하면 모두 FAIL (의도된 동작).

자세한 시나리오 본문은 Draft 3 doc 그대로 (`docs/test-scenarios-cerberus-v0.5.1-and-full.md` Full 모드 섹션).

---

## §5 Hands-on 8단계 체크리스트

`docs/cerberus-session-restart-checklist.md` 참조. 본 문서에서 중복 작성하지 않음.

본 재검증에서 진행한 단계:
- Step 1 (Skill / Agent / MCP 등록) — `docs/test-execution-results-cerberus-v0.5.3-opus47.md` §2 참조
- Step 2 (init) — 동
- Step 3 (consensus 정상) — 동
- Step 4 (nonce swap → reject + force bypass) — 동
- Step 5 (H1 allowlist 차단 정적 검사) — 동
- Step 7 (list/status/inspect 일관성) — 동
- Step 8 (--cerberus=off/on 토글) — config.json 검증으로 대체

**deferred (사용자 hands-on 필요)**:
- Step 6 (실 `/cerberus head` 트리거 + 3 agent 병렬 spawn) — 새 Claude Code 세션 재시작 필요. 본 plan 안에서 완결 불가.

---

## 실행 순서 권장

| 우선순위 | 범위 | 소요 |
|---------|------|------|
| 스모크 | HU-31, HU-32, FC-01, HC-11 (synthesized) | ~10분 |
| 자동화 sanity | 75/75 PASS 확인 | ~1분 |
| Hands-on partial (Step 1~5, 7, 8) | 본 doc 의 §5 | ~30분 |
| Hands-on Step 6 | 사용자 새 세션 `/cerberus head` | ~10분 (사용자 액션) |
| Full 회귀 (PENDING-IMPL) | FU-01 ~ FU-10, FC-02 ~ FC-05 | Full 구현 후 약 1일 |

## 합격 보고 템플릿

각 시나리오 결과를 `docs/test-execution-results-cerberus-v0.5.3-opus47.md` 에 기록:

```
[HU-XX] PASS/FAIL/PENDING-IMPL/PARTIAL — <한 줄 요약>
  실제: <관찰된 값>
  기대: <명시된 PASS 조건>
  증거: <로그/파일 경로 또는 cerberus run_id>
```

Head 모드 30건 + 신규 4건 PASS, Full 모드 14건 PENDING-IMPL, FC-01 PASS 가 v0.5.3 + Opus 4.7 시점의 정상 상태. PARTIAL/FAIL 발생 시 `feedback_skill_actual_vs_documented` 메모리 갱신 후 v0.5.4 backlog 등록.
