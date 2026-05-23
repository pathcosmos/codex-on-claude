# Cerberus v0.5.3.1 + v0.5.4 개선 계획

**작성일**: 2026-05-23
**기반**: `docs/test-execution-results-cerberus-v0.5.3-opus47.md` (98 PASS / 1 PARTIAL / 0 FAIL)
**대상 commit**: 46a693d (v0.5.3)
**현재 manifest version**: 0.5.3

두 개의 release line 으로 분리:
- **v0.5.3.1 patch** — MEDIUM #2 render 한 줄 수정 + 회귀 가드. ~10분. 즉시 ship 가능.
- **v0.5.4 minor** — MEDIUM #1 (decision multiplier soft-curve), MEDIUM #3 (contrast conjunction polarity), LOW (cerberusConfig seed), HU-33 plan-level test. ~3시간.

---

## 1. v0.5.3.1 patch — MEDIUM #2 render 버그 (Top 우선순위, quick win)

### 1.1 진단 (확정)

`install/cerberus-consensus.mjs:506` 의 `classifyCase4(item, topicsByHead)` 가 case-4 step/decision 을 `dissent.disputed` 로 push 할 때 `lostTo` 필드 미설정:

```js
// install/cerberus-consensus.mjs:507  (case4 classifyCase4 → 'disputed' 경로)
dissent[bucket].push({ topic: item.topicKey, head: item.head, body: item.body, kind: item.kind });
```

대비: case 1/2/3 의 정상 tournament push 경로 (line 457, 483) 는 `lostTo: winner.head` 를 명시.

렌더러 `install/cerberus-consensus.mjs:608` 에서 fallback 발화:

```js
const lostTo = d.lostTo || "?"; // defensive — case-4 disputed has no winner
out.push(`- \`[${d.head}]\` ${d.body}  *(lost to ${lostTo})*`);
```

사용자에게 보이는 결과: `*(lost to ?)*` — 의미 불명.

### 1.2 발생 빈도 (실측)

| run | '?' 건수 | trigger |
|-----|---------|---------|
| HU-31 (054657Z-e34e93) | 2건 | 3-way Decision polarity split |
| Step 3 (054505Z-82ab93) | 1건 | step 단건 |
| MD2-step (060909Z-dbd8b9) | 1건 | step + negation peer |
| Step 6 real spawn (061427Z-bed595) | 2건 | Opus 4.7 자연 발현 |

총 4개 run 에서 6건. Opus 4.7 이 `do not / NOT / is not` 을 caveat 표현에 흔히 써서 trigger 가 lab 추정보다 잦음.

### 1.3 fix (1줄 패치)

`install/cerberus-consensus.mjs:608`:

```js
// before
const lostTo = d.lostTo || "?";
out.push(`- \`[${d.head}]\` ${d.body}  *(lost to ${lostTo})*`);

// after
const suffix = d.lostTo
  ? `*(lost to ${d.lostTo})*`
  : `*(disputed — opposing polarity)*`;
out.push(`- \`[${d.head}]\` ${d.body}  ${suffix}`);
```

근거: case 1/2/3 disputed 는 항상 tournament winner 가 있어 `lostTo` set. `lostTo` 부재 = polarity guard 가 case-4 로 분리한 경우 = "opposing polarity" 가 정확한 description.

### 1.4 회귀 가드 (h3 plan 의 정확한 지적)

`install/fixtures/v05/unit/cerberus-v053-fixes.test.mjs:90` 기존 테스트는 `lost to undefined` literal 만 거부 — 실 사용자가 보는 `lost to ?` literal 은 missing.

추가 테스트 8번째 (이름 후보: `F3c`):

```js
test("F3c: disputed render guards against literal 'lost to ?' (MEDIUM #2)", () => {
  // 3개 plan: h1/h2 polarity '-' (negation 토큰), h3 polarity '+' — case-4 decision split.
  const plans = [
    { head: "h1", plan: "## Decision\nDo not enable caching for the API.\n\ncerberus-nonce: x" },
    { head: "h2", plan: "## Decision\nNever enable caching for the API.\n\ncerberus-nonce: y" },
    { head: "h3", plan: "## Decision\nEnable caching for the API.\n\ncerberus-nonce: z" },
  ];
  const r = consensus(plans);
  // 알고리즘은 disputed bucket 사용을 계속 허용. 단 사용자 출력에 '?' 가 나타나면 fail.
  assert.ok(!/\*\(lost to \?\)\*/.test(r.consensus_plan),
    "render must not emit '*(lost to ?)*' — use 'opposing polarity' suffix");
});
```

### 1.5 검증 + ship

```
node --test install/fixtures/v05/unit/cerberus-*.test.mjs install/fixtures/v05/integration/cerberus-*.test.mjs
→ 76/76 PASS (기존 75 + F3c 1건)
```

manifest.json + package.json 버전 0.5.3 → 0.5.3.1 (patch bump per `feedback_versioning` memory).

ship 절차:
1. patch + 테스트 commit (`fix(0.5.3.1): render *(disputed — opposing polarity)* for polarity-split case-4 + F3c guard`)
2. release notes 1줄 ("MEDIUM #2 cosmetic fix — case-4 polarity-split disputed entries no longer render '?'")
3. tag v0.5.3.1, push.

**예상 소요**: 10분 (패치 1줄 + 테스트 1건 + version bump + commit).

---

## 2. v0.5.4 — MEDIUM #3 contrast conjunction polarity (의미상 가장 위험)

### 2.1 진단 (실측)

`install/cerberus-consensus.mjs:39` `NEGATION_RE`:

```js
const NEGATION_RE = /\b(not|never|avoid|skip|cannot|won't|wouldn't|shouldn't|don't|doesn't|didn't|no\s+need)\b/i;
```

contrast conjunction (`but / however / although / despite / except`) 미포함 → `detectPolarity()` 가 '+' 반환.

run-md3 (060909Z-e8c149) 실측: 5/5 conjunction 모두 case-1/2 false-merge. 4/5 는 case-2 tournament 에서 h3 의 무난한 표현이 승 → **caveat 내용이 consensus_plan 에 한 줄도 안 남음**. 1/5 (although) 만 case-4 conservative include 로 생존.

사용자 영향: "high agreement" 라벨을 보면서 정작 반대 의견을 못 봄 → consensus 알고리즘이 잘못된 신호 발신.

### 2.2 fix 후보 비교

| 옵션 | 노력 | false positive 위험 | 효과 |
|------|------|-------------------|------|
| A. 단순 conjunction 추가 | 5분 | 높음 ("X but also Y" 같은 양립 표현 오감지) | 단순 |
| B. second-clause-negation 패턴 | 30분 | 낮음 (양립 케이스 예외) | 정확 |
| C. LLM-judge 보조 | 수시간 | 낮음 | 비용 큼, opt-in 만 |

**채택 B**. 정규식 1줄 + 양립 예외 처리.

### 2.3 패치 (h3 plan 의 risk 반영)

`install/cerberus-consensus.mjs:39` 다음에 추가:

```js
// v0.5.4: second-clause negation. Contrast conjunction (but/however/although/despite/except)
// followed by a short negation-bearing clause flags polarity '-'. The trailing word lookhead
// (\w+) ensures we're matching a clause, not a sentence-ending fragment. The negative lookahead
// (?!\s+(also|additionally|even|too)) keeps reciprocal phrases like "X but also Y" polarity '+'.
const CONTRAST_NEGATION_RE = /\b(but|however|although|despite|except)\s+(?!(also|additionally|even|too)\b)\w+/i;

export function detectPolarity(text) {
  if (typeof text !== "string") return "+";
  if (NEGATION_RE.test(text)) return "-";
  if (CONTRAST_NEGATION_RE.test(text)) return "-";
  return "+";
}
```

### 2.4 회귀 가드 (HU-31 style)

`install/fixtures/v05/unit/cerberus-v053-fixes.test.mjs` 에 5건 추가 (F4a~F4e):

```js
test("F4a: 'but' second-clause flags polarity '-'", () => {
  assert.equal(detectPolarity("Cache reduces calls but introduces staleness."), "-");
});
test("F4b: 'however' second-clause flags polarity '-'", () => {
  assert.equal(detectPolarity("Latency drops however invalidation is tricky."), "-");
});
test("F4c: 'although' second-clause flags polarity '-'", () => {
  assert.equal(detectPolarity("Memory is small although large queries spike usage."), "-");
});
test("F4d: 'despite' second-clause flags polarity '-'", () => {
  assert.equal(detectPolarity("Complexity is acceptable despite added monitoring."), "-");
});
test("F4e: 'except' second-clause flags polarity '-'", () => {
  assert.equal(detectPolarity("Deployment risk is low except for cold-start scenarios."), "-");
});
// 양립 표현 false positive 가드
test("F4f: 'but also' stays polarity '+' (compatible expression)", () => {
  assert.equal(detectPolarity("Cache reduces calls but also reduces freshness control."), "+");
});
```

### 2.5 plan-level e2e 가드

run-md3 (e8c149) fixture 를 frozen 상태로 `cerberus-e2e.test.mjs` 에 추가. 5 reasons 각각이 case-4 (conservative include) 로 분리되어 caveat 내용이 consensus_plan 에 살아남는지 assert:

```js
test("E5: contrast conjunction caveats survive to consensus_plan", () => {
  const plans = [/* h1 neutral, h2 with 5 conjunctions, h3 mid-paraphrase — run-md3 fixture */];
  const r = consensus(plans);
  // 5개 caveat 모두 dissent 또는 conservative-include 에 출현해야 함
  for (const caveat of ["introduces staleness", "invalidation is tricky", "large queries spike",
                        "added monitoring overhead", "cold-start scenarios"]) {
    assert.ok(r.consensus_plan.includes(caveat), `caveat lost: ${caveat}`);
  }
});
```

**예상 소요**: 30분 (패치 + 6 unit test + 1 e2e).

---

## 3. v0.5.4 — MEDIUM #1 decision multiplier binary cliff

### 3.1 진단 (실측 데이터 재정렬)

이전 추정과 달리 score 붕괴의 진짜 원인은 Jaccard 임계가 아니라 decision multiplier 의 binary cliff:

| 시나리오 | decision | paraphrase | multiplier | score |
|---------|---------|-----------|-----------|-------|
| MD1-near | byte-identical | 없음 | 1.5 | 1.00 |
| MD1-shallow | byte-identical | 약함 | 1.5 | 0.79 |
| MD1-heavy | byte-identical | 강함 | 1.5 | 0.43 |
| HC-05 | 3-way split | — | **1.0** | **0.20** |
| Step 6 real | 3-way split | 강함 | **1.0** | **0.17** |
| HU-31 (Step 3) | 3-way polarity | 강함 | **1.0** | **0.15** |

heavy paraphrase 만으로는 0.43 moderate 까지만. 진짜 0.15~0.20 cliff 는 decision split 이 multiplier 를 1.0 으로 떨어뜨릴 때 발생.

### 3.2 fix 설계

case-1 decision (3-head exact match) → 1.5x.
case-2 decision (tournament, 3 head 모두 참여) → **1.2x 신규** (부분 합의 신호).
case-4 decision (split, polarity guard) → 1.0x (현행 유지).

`install/cerberus-consensus.mjs` 변경:

```js
// 기존: 단일 decisionMultiplier 1.5
export const DEFAULTS = Object.freeze({
  // ...
  decisionMultiplier: 1.5,
  decisionPartialMultiplier: 1.2,  // v0.5.4 신규 — case 2 decision 부분 합의 가중
});

// consensus() 내부 변경:
let decisionMultiplier = 1.0;
if (decisionCase1) decisionMultiplier = opt.decisionMultiplier;
else if (decisionCase2) decisionMultiplier = opt.decisionPartialMultiplier;  // 신규

// flag tracking 추가
let decisionCase2 = false;
// (case 2 decision tournament 경로에서 set)
```

### 3.3 시뮬레이션 (먼저)

패치 적용 전, 8개 기존 run 의 raw stats 로 새 multiplier 적용 시뮬레이션. 검증:
- score 단조 증가 (regression 없음)
- moderate floor 가 0.4 미만으로 내려가지 않음 (HC-05/Step 6 정도가 0.20 → 0.24 로 올라감)
- case-1 decision 케이스는 변동 없음 (1.5x 유지)

스크립트 위치 후보: `scripts/cerberus-multiplier-simulation.mjs` (one-off, 측정 후 삭제 가능).

### 3.4 Jaccard 임계 시뮬레이션 (병행)

`jaccardGroupThreshold: 0.6` → `0.55` 도 동일 8개 run 으로 시뮬레이션. 새 임계가 false-merge 를 유발하는지 확인. MD3 fixture 처럼 contrast-conjunction 케이스에서 part of caveat 가 잘못 흡수되지 않는지 정밀 검증 필요.

### 3.5 회귀 가드

`install/fixtures/v05/unit/cerberus-score-formula.test.mjs` 에 2건 추가:

```js
test("S6: case-2 decision triggers partial multiplier 1.2", () => {
  // 3개 plan, decision 갈리고 reasons 합의 — case 2 decision
  const r = consensus(/* HC-05 simplified fixture */);
  assert.equal(r.raw.decisionMultiplier, 1.2);
  assert.ok(r.agreement_score >= 0.24, "case 2 decision should not collapse below moderate floor");
});
test("S7: case-1 decision still triggers full multiplier 1.5", () => {
  // 기존 보장 — 회귀 가드
  const r = consensus(/* MD1-near fixture */);
  assert.equal(r.raw.decisionMultiplier, 1.5);
});
```

**예상 소요**: 시뮬레이션 1시간 + 패치 30분 + 테스트 30분 = ~2시간.

---

## 4. v0.5.4 — LOW · `choices.cerberusConfig` 자동 생성

### 4.1 진단

`config.json` 의 `choices.cerberusConfig` 가 install/reconfigure 시 미생성. manifest comment 가 안내한 per-machine 튜닝 (Jaccard 임계, multiplier, cost cap 등) override 섹션이 사용자에게 안 보임.

### 4.2 fix

`install/configure.mjs` (또는 reconfigure 진입점) 에서 `choices.cerberus = "on"` 일 때 다음 seed:

```js
choices.cerberusConfig = choices.cerberusConfig ?? {
  // Per-machine overrides for Cerberus consensus. Defaults shown — uncomment to override.
  // jaccardGroupThreshold: 0.6,
  // bodyMergeThreshold: 0.8,
  // decisionMultiplier: 1.5,
  // decisionPartialMultiplier: 1.2,  // v0.5.4
  // headWeights: { h1: 1.0, h2: 1.0, h3: 1.5 },
  // costCapTokens: 50000,
};
```

manifest.json comment 도 신규 필드 안내.

### 4.3 회귀 가드

`install/fixtures/v05/unit/cerberus-install.test.mjs` 에 1건 추가:

```js
test("I7: cerberus=on seeds choices.cerberusConfig = {}", () => {
  const cfg = configureFromChoices({ cerberus: "on", /* ... */ });
  assert.ok("cerberusConfig" in cfg.choices);
});
```

**예상 소요**: 5분.

---

## 5. v0.5.4 — HU-33 plan-level test (h3 plan 권고)

### 5.1 진단

기존 `cerberus-stemming-adversarial.test.mjs:45` 는 21쌍 어근 충돌을 **stem/token 레벨** 에서만 검증. plan-level consensus() 호출 시 9 reasons (general/generic + organize/organic + business/busy × 3 head) 가 실제로 9 distinct topic group 으로 분리되는지는 가드 부재.

HU-33 측정에서 PASS 였으나 미래 알고리즘 변경 시 회귀 가능성 있음.

### 5.2 fix (test only)

`install/fixtures/v05/unit/cerberus-stemming-adversarial.test.mjs` 에 추가:

```js
test("A22: plan-level — 9 stem-collision reasons stay distinct (HU-33)", () => {
  const plans = [/* HU-33 fixture from test scenarios doc */];
  const r = consensus(plans);
  // groupCounts case4 == 9 (all single-head, no false-merge)
  assert.equal(r.raw.groupCounts.case4Conservative, 9);
  assert.equal(r.raw.groupCounts.case1, 0, "no false-merge across stem-collision pairs");
});
```

**예상 소요**: 15분.

---

## 6. 종합 verification matrix

| 항목 | release | unit test | e2e test | manual repro |
|------|---------|----------|----------|-------------|
| MEDIUM #2 render | v0.5.3.1 | F3c (신규) | — | HU-31 run 재실행, '?' 부재 확인 |
| MEDIUM #3 polarity | v0.5.4 | F4a~f (신규 6건) | E5 (신규) | run-md3 재실행, 5 caveat 모두 생존 |
| MEDIUM #1 multiplier | v0.5.4 | S6, S7 (신규) | — | HC-05 / Step 6 재실행, score ≥ 0.24 |
| LOW config seed | v0.5.4 | I7 (신규) | — | reconfigure 후 config.json grep |
| HU-33 plan-level | v0.5.4 | A22 (신규) | — | 자동화로만 |

총 신규 unit test: 13건. e2e: 1건. 75 → 89 test pass 목표.

---

## 7. ship 순서 (권장)

### Phase 1 — v0.5.3.1 patch (즉시)
1. § 1.3 패치 적용 (1줄)
2. § 1.4 F3c 테스트 추가
3. 자동화 76/76 PASS 확인
4. version bump 0.5.3 → 0.5.3.1
5. commit `fix(0.5.3.1): render *(disputed — opposing polarity)* for polarity-split case-4 + F3c guard`
6. tag + push

### Phase 2 — v0.5.4 minor (Phase 1 ship 후)
1. § 3.3 multiplier 시뮬레이션 스크립트 작성 + 8개 run replay
2. § 3.4 Jaccard 임계 시뮬레이션
3. § 3.2 multiplier 패치
4. § 2.3 polarity 패치 + § 2.4 F4a~f 테스트
5. § 4 config seed
6. § 5 HU-33 plan-level test
7. § 2.5 e2e E5 + § 3.5 S6/S7 unit
8. 자동화 89/89 PASS 확인
9. 새 Claude Code 세션에서 hands-on Step 6 1회 재실행 — Step 6 real spawn score 가 0.17 → 0.24+ 로 상승 확인
10. version bump 0.5.3.1 → 0.5.4
11. commit `feat(0.5.4): polarity extension + decision soft-multiplier + cerberusConfig seed + HU-33 plan guard`
12. tag + push

### Phase 3 — 검증 + 결과 문서 갱신
1. `docs/test-execution-results-cerberus-v0.5.4.md` 신규 작성 (98 → 113 PASS 목표)
2. MEDIUM #1/#2/#3 모두 RESOLVED 표기
3. v0.5.3-opus47 결과 doc 에 cross-reference 추가

---

## 8. risk + rollback

| 항목 | risk | mitigation |
|------|------|----------|
| § 1.3 render 패치 | 기존 case 1/2/3 disputed (lostTo set) 에는 영향 없음 — 단순 분기 추가 | F3c 가드로 회귀 catch. rollback = patch revert 1줄 |
| § 2.3 polarity 확장 | "X but also Y" false positive | F4f 가드 + run-md3 e2e 가드. 양립 케이스 5건 이상 추가 권장 |
| § 3.2 multiplier 변경 | case 2 decision 케이스 score 가 0.20 → 0.24 로 상승 — moderate band 진입 → user 출력 라벨 변경 가능 | release notes 에 명시. CI 의 hard score assertion 이 있다면 사전 검토 |
| § 4 config seed | 기존 사용자 config 에 cerberusConfig 부재 시 자동 추가 — 부수효과 거의 없음 | nullish coalescing 으로 기존 값 보존 |

---

## 9. 미반영 (v0.5.5+ 후보)

- LLM-judge 보조 (high-cost opt-in) — MEDIUM #1 의 추가 layer
- Full 모드 FU-01~10 + FC-02~05 14건 PENDING-IMPL — 별도 minor release
- run.json index 페이지 (web UI) — 별도 feature
- multi-language stemmer (한국어/일본어) — empty-token guard 보강이 우선
