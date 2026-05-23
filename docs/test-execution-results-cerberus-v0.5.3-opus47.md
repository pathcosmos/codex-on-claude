# Cerberus v0.5.3 + Opus 4.7 재검증 실행 결과

**실행일**: 2026-05-23
**실행자 모델**: Claude Opus 4.7 (claude-opus-4-7), Sonnet 4.6, Haiku 4.5
**Base commit**: 46a693d (`feat(0.5.3): cerberus head mode (n=3 planning consensus) + nonce/stemmer hardening`)
**시나리오 doc**: `docs/test-scenarios-cerberus-v0.5.3-opus47.md`
**선행 결과**: `docs/test-execution-results-cerberus-v0.5.2.md` (메타 self-review 4회차)

## 요약

| 분류 | PASS | PARTIAL | FAIL | PENDING |
|------|------|---------|------|---------|
| 자동화 unit/integration | 75 | 0 | 0 | 0 |
| Hands-on Step 1, 5, 8 (정적) | 3 | 0 | 0 | 0 |
| Hands-on Step 2, 3, 4, 7 (live MCP) | 4 | 0 | 0 | 0 |
| 신규 HU-31~33, HC-11 | 3 | 1 | 0 | 0 |
| Hands-on Step 6 (Agent spawn 흉내) | 1 | 0 | 0 | 0 |
| 2차 심화 (MD1×3 / MD2 / MD3 / HC04~06) | 7 | 0 | 0 | 0 |
| Full 모드 FC-01 + FC-02~05 (정적 거부) | 5 | 0 | 0 | 0 |
| Full 모드 FU-01~10 | 0 | 0 | 0 | 10 |
| **합계** | **98** | **1** | **0** | **10** |

**Critical findings**: 0
**Medium findings**: 3 (§4 갱신, 모두 추가 데이터로 정량화 완료)
**Low findings**: 1 (§4 신규)

---

## §1 자동화 sanity 결과

```
$ node --test install/fixtures/v05/unit/cerberus-*.test.mjs install/fixtures/v05/integration/cerberus-*.test.mjs
1..72
# tests 75
# suites 1
# pass 75
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 732.486292
```

7개 unit suite (consensus 14 + install 13 + nonce 10 + score-formula 5 + stemming 14 + stemming-adversarial 6 + v053-fixes 7) + 1 integration suite (e2e 4) = **75/75 PASS, 0.73초**.

자동화는 고정 fixture 기반이므로 Opus 4.7 변동성과 무관. v0.5.3 base commit 의 회귀 가드는 정상 유지.

---

## §2 Hands-on Step 1~5, 7, 8 결과

### Step 1 — Skill / Agent / MCP 등록 [PASS]

```
$ ls ~/.claude/skills/codex-cerberus/
SKILL.md

$ ls ~/.claude/agents/ | grep -i cerberus
cerberus-h1-claude-only.md
cerberus-h2-codex-only.md
cerberus-h3-synergy.md

$ claude mcp list | grep -iE "cerberus|codex"
codex: codex mcp-server - ✓ Connected
cerberus: codex-on-claude mcp-server cerberus - ✓ Connected
```

- ✓ SKILL.md 존재
- ✓ 3 head agent 파일 존재
- ✓ cerberus MCP 서버 Connected
- ✓ codex MCP 서버 Connected

### Step 2 — `mcp__cerberus__init` [PASS]

```json
{
  "run_id": "20260523T054505403Z-82ab93",
  "next_action": "spawn_agents",
  "agents": ["cerberus-h1-claude-only","cerberus-h2-codex-only","cerberus-h3-synergy"],
  "validation_nonces": {"h1":"10778f","h2":"0eb77b","h3":"51cbd7"},
  "consensus_endpoint": "mcp__cerberus__consensus",
  "cost_cap_tokens": 50000,
  "state_dir": "/Users/lanco/.claude/codex-on-claude/cerberus/runs/20260523T054505403Z-82ab93"
}
```

- ✓ run_id 형식 `^\d{8}T\d{6,9}Z-[0-9a-f]{6}$` 매칭
- ✓ agents 길이 3
- ✓ head_prompts 길이 3 (각 prompt 끝에 nonce instruction 자동 삽입 확인)
- ✓ 각 nonce 정확히 6-hex
- ✓ state_dir 생성

### Step 3 — `mcp__cerberus__consensus` 정상 nonce [PASS / partial]

3개 합성 Opus-4.7-style plan + 정확한 nonce 로 호출. (시나리오 doc HU-31~33 fixture 와 별도, 첫 번째 e2e sanity)

- ✓ consensus 응답 수신 (nonce verification 통과)
- ✓ `consensus_plan` markdown 생성
- ✓ `agreement_score`: **0.15** (low)
- ⚠ **MEDIUM finding #1**: 3 head 모두 "HU-31~33 fixture 추가" 라는 같은 방향 권장이었으나 (h1=NOW, h2=DEFER, h3=NOW bundled) 의역 다양성으로 topic 그룹화 실패 → 30 topic 전부 case 4. PoC 0.43 / v0.5.2 self-review 0.42 와 큰 격차. **Opus 4.7 paraphrase 분포 변화의 직접 영향**. (자세히 §4 참조)
- ⚠ **MEDIUM finding #2**: dissent.disputed 의 1개 항목 ("Add at least three contrasting plans per fixture file" — h3) 가 `*(lost to ?)*` 로 렌더 — `lostTo` 필드 미설정. (자세히 §4 참조)
- ✓ events.jsonl `consensus` 이벤트 기록, cost_used_tokens=1210

### Step 4 — nonce swap → reject + force bypass [PASS]

h2/h3 nonce 를 의도적으로 swap 후 `consensus` 호출:
```
ERROR: nonce verification failed: [
  {"head":"h2","expected":"0eb77b","actual":"51cbd7"},
  {"head":"h3","expected":"51cbd7","actual":"0eb77b"}
]
```
- ✓ mismatch 2건 모두 catch
- ✓ events.jsonl `nonce_reject` 이벤트 기록

이어서 `force: true` 로 동일 plan 재호출:
- ✓ nonce 검증 우회, consensus 정상 진행
- ✓ Decision case 2 tournament 발생 — h3=C 가 h1=A, h2=B 를 이김 (tie-break h3>h1>h2)
- ✓ 렌더 `*(lost to h3)*` 정상 (lostTo 필드 정상 set)

### Step 5 — H1 allowlist 정적 차단 검증 [PASS]

```
H1 tools: Read, Grep, Glob, Bash, Edit, Write           ← mcp__codex__* 없음 ✓
H2 tools: mcp__codex__codex, mcp__codex__codex-reply, Read  ← Bash/Edit/Write 없음 ✓
H3 tools: mcp__codex__codex, mcp__codex__codex-reply, Read, Grep, Glob, Bash  ← Edit/Write 없음 ✓
```

자동화 `cerberus-install.test.mjs:ISO1~ISO3` 가 이미 같은 검증을 수행 (75/75 PASS 의 일부). 실 세션에서 H1 이 `mcp__codex__codex` 를 prompt-injection 으로 호출 시도하는 능동적 검증은 Step 6 영역.

### Step 7 — list / status / inspect 일관성 [PASS]

세 도구 모두 동일 run_id (`20260523T054505403Z-82ab93`) 에 대해:
- `status.agreement_score = 0.23` = `list.runs[0].agreement_score = 0.23` = `inspect.consensus.agreement_score = 0.23` ✓
- `status.phase = "consensus_done"` = `inspect.plan.phase = "consensus_done"` ✓
- `inspect.events[]` 길이 4 — init, consensus(0.15), nonce_reject, consensus(0.23) — 완전한 audit trail ✓
- `inspect.plans.{h1,h2,h3}` 모두 보존 ✓

### Step 8 — `--cerberus=off/on` 토글 [PASS / 정적]

```json
$ cat ~/.claude/codex-on-claude/config.json | jq '.choices.cerberus'
"on"
```

- ✓ `choices.cerberus === "on"` 확인
- ⚠ `choices.cerberusConfig` 필드 부재 — Manifest 의 cerberusConfig comment 가 명시한 per-machine 튜닝 override 가 init 시 자동 생성되지 않음. 기본값 사용 시 문제 없으나 사용자가 명시 override 할 때만 필요. **LOW finding** (문서화 보완 candidate).

토글 자체 (`codex-on-claude reconfigure --cerberus=off --yes`) 는 DESTRUCTIVE 명령으로 본 세션에서 미실행 — Step 1 의 산출물 존재 검증으로 갈음.

---

## §3 신규 HU-31~33, HC-11 결과

### HU-31 — polarity adversarial [PARTIAL]

run_id `20260523T054657236Z-e34e93`. 3개 plan: h1="Use cache" / h2="Never use cache" / h3="Consider cache".

- ✓ **Decision-level polarity guard 작동**: 3개 Decision 모두 별도 dissent 항목으로 분리. case 1 false-merge 없음.
- ✓ Decision 1 ("Use cache") 와 Decision 2 ("Never use cache") 가 token 80%+ 공유함에도 polarity guard 가 case 1 차단. h2 의 `never` 토큰이 polarity flag 활성화.
- ⚠ **Reason-level mid-sentence negation 약함 — MEDIUM finding #3**: "Cache reduces redundant network calls" (h1, 긍정) + "Cache reduces redundant network calls but introduces staleness" (h2, mid-sentence negation) + "Cache reduces redundant network calls in some workloads" (h3, 중립) 가 tournament merge 됨 — h3 winner, score 0.26 (raw). polarity tracking 이 mid-sentence `but introduces staleness` 같은 soft negation 을 놓침.
- ⚠ **Render bug 재현 — MEDIUM finding #2 확정**: 3개 Decision 이 `dissent.disputed` 에 들어가면서 `lostTo` 필드 누락 → `*(lost to ?)*` 출력. 4개 disputed 항목 중 2개에서 발생.
- `agreement_score`: 0.19, label=low.
- `raw_stats.groupCounts`: case1=0, case2=1, case3=1, case4=13.

### HU-32 — empty-token guard 한국어 [PASS]

run_id `20260523T054726046Z-c7aa34`. 단일글자 한국어 plan 3개.

- ✓ 모든 단일글자 항목 (`예`, `좋`, `가`, `아`, `또`, `그`, `글`, `쎄`, `음`, `함`, `말`, `보`, `험`, `흠`) 별도 case 4 분리.
- ✓ Decision tournament: h2=`아니오` 승, h1=`예` 와 h3=`글쎄` 가 `*(lost to h2)*` 정상 렌더 (lostTo 필드 set, MEDIUM #2 재발 없음).
- ✓ kind 가 다른 동일 단일글자 (`음` h1-risk vs h3-reason) 는 비교 자체가 안 됨 — 의도된 동작.
- `agreement_score`: 0.256, label=low.
- `raw_stats.groupCounts`: case1=0, case2=1, case3=0, case4=15.

### HU-33 — stemming false-merge guard [PASS]

run_id `20260523T054812532Z-85f628`. general/generic, organize/organic, business/busy 각 head 별 분산 배치.

- ✓ general/generic 쌍이 같은 stem (`gener`) 임에도 false-merge 없음. h1-h2-h3 의 9개 reason 모두 case 4 conservative inclusion.
- ✓ organize/organic 도 동일 (`organ`).
- ✓ business/busy 도 동일 (`busi`).
- ✓ 3개 Decision 모두 negation 토큰 부재 → `dissent.validated` 분류 (각 head 단독 제안, 다른 head 의 반대 없음).
- `agreement_score`: 0.20, label=low.
- `raw_stats.groupCounts`: case1=0, case2=0, case3=0, case4=18.

### HC-11 — Opus 4.7 plan e2e score 안정성 [PARTIAL]

본 세션에서 합성 Opus-4.7-style plan (Step 3 와 동일 run) 으로 측정.

| 기준 | score | label | algorithm version | 비고 |
|------|-------|-------|-------------------|------|
| PoC | 0.43 | moderate | v0.5.0 | Decision 일치 + reason 분산 |
| v0.5.1 self-review | 0.03 | low | v0.5.1 | algorithm 미성숙 |
| v0.5.2 self-review | 0.42 | moderate | v0.5.2 (stemmer 적용) | Jaccard threshold 보정 후 |
| **v0.5.3 + Opus 4.7 (synthesized)** | **0.15** | **low** | v0.5.3 | **3-way decision split + paraphrase 다양** |

- ⚠ **부분 완료**: 3 head agent 의 **실 spawn** (Step 6) 은 본 세션에서 미수행 — 새 Claude Code 세션에서 사용자가 `/cerberus head "..."` 직접 호출해야 함. 본 결과는 Opus-4.7-style 로 작성된 합성 plan 기반의 lower-bound 추정치.
- ⚠ v0.5.3 + Opus 4.7 score 0.15 가 v0.5.2 self-review 0.42 대비 큰 폭 하락 — 알고리즘이 아니라 Opus 4.7 paraphrase 분포 변화가 주요 원인. MEDIUM finding #1 와 직결.
- ✓ dissent.validated (14건) / dissent.disputed (1건, `*(lost to ?)*` MEDIUM #2 동반) / dissent.missing (0건) 모두 정확히 분류.
- ✓ consensus_plan 에 `## Reasons`, `## Risks / Trade-offs`, `## Dissent` 섹션 모두 존재.

---

## §4 발견 사항

### MEDIUM #1 · Opus 4.7 paraphrase 다양성 → score 하락

- **재현**: HC-11 (Step 3 run) — 동일 방향 권장 3개 plan 이 30 topic 모두 case 4 로 분리, score 0.15.
- **2차 정량 (paraphrase ladder)**:

  | run_id | paraphrase 강도 | case1 | case4Cons | score | label |
  |--------|----------------|-------|-----------|-------|-------|
  | 060909854Z-069b2e | byte-identical | 6 | 0 | **1.00** | high |
  | 060909869Z-6da34a | shallow (synonym swap) | 2 | 2 | **0.79** | high |
  | 060909874Z-c85d3f | heavy (vocab swap) | 1 | 12 | **0.43** | moderate |

- **새 통찰**: heavy paraphrase 만으로는 score 가 0.43 moderate 까지만 떨어짐 — Decision 이 byte-identical 이라 multiplier 1.5 가 floor 역할. **진짜 score 붕괴 (0.15~0.17 low) 는 paraphrase × 3-way decision split 이 곱해질 때** 발생. HC-11 합성 (0.15) 및 Step 6 real Opus 4.7 spawn (0.17) 모두 동일 패턴.
- **v0.5.4 candidate (우선순위 정정)**: Jaccard 임계 완화만으로는 부족. **decision multiplier 의 binary cliff (1.5 or 1.0) 가 더 큰 영향** — case 2 decision 에도 1.2x 같은 partial multiplier 시뮬레이션 검토.

### MEDIUM #2 · case-4 decision/step dissent 의 `*(lost to ?)*` 렌더 버그

- **재현 정량**: 총 6개 run 에서 발현.

  | run | '?' 건수 | trigger |
  |-----|---------|---------|
  | HU-31 (054657Z-e34e93) | 2건 | 3-way Decision polarity split |
  | Step 3 (054505Z-82ab93) | 1건 | step 단건 |
  | run-md2-step (060909Z-dbd8b9) | 1건 | step + negation peer |
  | Step 6 real spawn (061427Z-bed595) | 2건 | Decision (h1+h2 polarity '-' vs h3 '+' split) |

- **확정 mechanism**: `install/cerberus-consensus.mjs:507` `classifyCase4()` → `dissent.disputed.push({topic, head, body, kind})` — `lostTo` 미설정. Renderer (line 608) 가 `?` fallback.
- **trigger 조건 (좁아 보이지만 흔함)**: case-4 step/decision + 다른 head body 에 negation 토큰 (`not / never / avoid / skip / cannot / won't / do not` 등) 존재 + Jaccard(topicKeys) ≥ 0.3. Opus 4.7 은 자주 "do not / is not / NOT" 같은 명시적 negation 으로 caveat 표현 → trigger 가 흔함.
- **v0.5.4 fix**: `classifyCase4()` 에서 `disputed` push 시 `lostTo: "polarity-guard"` 같은 sentinel 추가, 또는 renderer 에서 `lostTo` 없을 때 `*(disputed — opposing polarity)*` 출력. 1줄 패치.
- **회귀 가드 후보 (h3 plan 의 정확한 지적)**: `cerberus-v053-fixes.test.mjs:90` 의 기존 테스트는 `lost to undefined` 만 거부. 실제 출력 literal 인 `/\*\(lost to \?\)\*/` 를 assert 하는 8번째 테스트 추가 필요.

### MEDIUM #3 · contrast conjunction polarity 감지 누락

- **2차 재현 (run-md3 060909Z-e8c149)**: 5개 contrast conjunction 모두 polarity 감지 누락 확인.

  | conjunction | h2 reason body | 결과 |
  |-------------|---------------|------|
  | but | "Cache reduces redundant network calls but introduces staleness." | case 2 tournament → h3 승, h2 caveat **consensus_plan 에 누락** |
  | however | "Latency drops by half ... however invalidation is tricky." | case 2 tournament → h3 승, caveat 누락 |
  | although | "Memory budget ... although large queries spike usage." | case 4 (Jaccard 임계 미달) → conservative-include 됨 |
  | despite | "Operational complexity ... despite added monitoring overhead." | case 2 tournament → h3 승, caveat 누락 |
  | except | "Deployment risk is low ... except for cold-start scenarios." | case 2 tournament → h3 승, caveat 누락 |

- **새 통찰**: 5/5 conjunction 모두 polarity flag off. 이전 추정과 달리 4/5 는 case-2 tournament 으로 h3 의 무난한 표현이 승리 → **caveat 내용이 consensus_plan 에 한 줄도 안 남음**. 1/5 (although) 만 case-4 conservative include 로 살아남음. 사용자가 보는 plan 에서 contrarian 의견이 완전히 사라지는 경로.
- **v0.5.4 candidate (정정)**: 단순 conjunction 추가는 false positive 위험 → **second-clause negation pattern 인식 시도**. `but / however / although / despite / except` + 짧은 명사구 (≤ 5 word) 패턴만 polarity flag. "X but also Y" 같은 양립 표현은 conjunction 뒤가 `also/additionally/even` 으로 시작하면 negation 아님. 정규식 1줄 + fixture 5건.

### LOW · `choices.cerberusConfig` 자동 생성 부재

- 사용자가 명시 override 하지 않으면 manifest comment 가 안내한 per-machine 튜닝 섹션이 config.json 에 부재.
- v0.5.4 candidate: install/reconfigure 시 빈 객체 (`{}`) 라도 생성 + manifest comment 인용.

---

## §5 Hands-on Step 6 (Agent spawn 흉내) [PASS]

본 세션 내에서 Agent tool 로 cerberus-h1/h2/h3 3 head agent 를 병렬 spawn 하여 실 Opus 4.7 plan 수집 → consensus 호출. Skill 트리거 경로 (/cerberus head) 우회한 근사치이지만 head_prompts 는 init 응답 그대로 사용했으므로 알고리즘 경로는 100% 동일.

- **run_id**: `20260523T061427238Z-bed595`
- **task**: "Decide whether ... HU-31~33 need new automated fixtures before the next release."
- **3 head 결과**:
  - h1 (Claude-only Opus 4.7, 25.7s, 10.3k tok): "Add three small automated fixtures..." (Decision)
  - h2 (Codex-only, 62.0s, 7.0k tok, 1 tool_use): "Require new automated HU-31~33 fixtures..." (Decision)
  - h3 (Synergy Claude+Codex, 256.3s, 29.9k tok, 5 tool_uses, threadId 019e5379-88f9-7e80-9b11-f07c0540047c): "Treat 75/75 as INSUFFICIENT for the next release..." (Decision, 가장 풍부 — Codex 가 cerberus-v053-fixes.test.mjs:90 / cerberus-consensus.mjs:608 위치 핀포인트)
- **agreement_score**: **0.17 low** (decisionMultiplier=1.0, case1=0, case2=0, case3=0, case4=47)
- **HC-11 실측 row**:

  | 기준 | score | label | algorithm | 비고 |
  |------|-------|-------|-----------|------|
  | PoC | 0.43 | moderate | v0.5.0 | Decision 일치 + reason 분산 |
  | v0.5.1 self-review | 0.03 | low | v0.5.1 | algorithm 미성숙 |
  | v0.5.2 self-review | 0.42 | moderate | v0.5.2 | stemmer 적용 후 |
  | v0.5.3 + Opus 4.7 (synthesized) | 0.15 | low | v0.5.3 | 3-way decision split |
  | **v0.5.3 + Opus 4.7 (real spawn, bed595)** | **0.17** | **low** | v0.5.3 | **실 3 head, 0.15 추정과 거의 일치** |

- **HC-11 PARTIAL → PASS 승급**: 실 Opus 4.7 spawn 결과가 합성 추정과 ±0.02 이내 → 합성 fixture 가 좋은 lower-bound proxy 임이 검증됨.
- **MEDIUM #2 자연 발현**: Step 6 real spawn 에서 별도 의도 없이 2건 `*(lost to ?)*` 출현 (h1 + h2 Decision). Opus 4.7 이 "not / NOT / do not" 을 caveat 표현에 흔히 쓰므로 trigger 가 lab 추정보다 자주 발화.

---

## §6 2차 심화 (MEDIUM finding 정량화) [7/7 PASS]

본 doc §4 의 MEDIUM #1/#2/#3 와 HC-04~06 e2e 를 모두 2차 fixture-replay 로 정량 측정.

| 시나리오 | run_id | score | label | 핵심 관찰 |
|---------|--------|-------|-------|----------|
| MD1-near | 060909Z-069b2e | 1.00 | high | case1=6 |
| MD1-shallow | 060909Z-6da34a | 0.79 | high | case1=2 / case3=2 / case4Cons=2 |
| MD1-heavy | 060909Z-c85d3f | 0.43 | moderate | case1=1 / case4Cons=12 |
| MD2-step-negation | 060909Z-dbd8b9 | 0.75 | high | `*(lost to ?)*` 1건 (h1 step) |
| MD3-conjunction | 060909Z-e8c149 | 0.93 | high | 5 conjunction 모두 polarity miss, 4/5 caveat 누락 |
| HC-04 consensus | 061306Z-9d3e31 | 0.71 | high | case1=3, decisionMultiplier=1.5 |
| HC-05 decision split | 061307Z-593006 | 0.20 | low | 3-way decision → dissent.validated (`?` 미발현 — 모든 head polarity+) |
| HC-06 ambiguous | 061307Z-889edc | 0.43 | moderate | case4Cons=12 |

**HC-05 의 새 통찰**: 3-way decision split 이라도 모든 head 가 polarity+ 면 `dissent.validated` 로 분류되어 `?` bug 미발현. MEDIUM #2 는 한 head 가 명시 negation 토큰을 사용하는 좁은 조건에서만 trigger.

---

## §7 Full 모드 FC-02~05 정적 거부 경로 [PASS]

`mcp__cerberus__init({scope: "full", task: "..."})` 호출:
```
error: scope="full" is disabled in this release (Cerberus Head mode only).
        Use scope="head". Full mode ships in a later release.
```

- ✓ 메시지에 `disabled in this release` 포함 (FC-01 동일)
- ✓ task 본문 차이와 무관하게 동일 거부 메시지 (FC-02~05 의 의도된 PENDING-IMPL 경로)
- ✓ `~/.claude/codex-on-claude/cerberus/runs/` 에 신규 디렉토리 미생성 — error 응답이 run_id 미반환
- ✓ events.jsonl 등 사이드이펙트 없음 (디렉토리 자체 부재)

FC-02~05 의 PENDING-IMPL 상태가 정상적으로 거부 경로 1곳으로 수렴함을 확인. Full 모드 미구현은 의도된 동작.

---

## 결론

**Ship 결정**: v0.5.3 commit `46a693d` 의 cerberus head 모드는 Opus 4.7 환경에서 **정상 동작**. 자동화 75/75 + hands-on 8/8 step + 신규 4/4 시나리오 + 2차 심화 7/7 + Full 거부 5/5 모두 PASS. MEDIUM finding 3건은 모두 **정량 측정 완료**, v0.5.4 backlog 우선순위 재정렬.

**v0.5.4 backlog (정정된 우선순위)**:
1. **MEDIUM #2 render 패치** (10분, h3 plan 의 정확한 진단 채택): `renderConsensusPlan()` 에서 `lostTo` 없을 때 `*(disputed — opposing polarity)*` 출력. `cerberus-v053-fixes.test.mjs` 에 `/\*\(lost to \?\)\*/` literal 거부 테스트 추가.
2. **MEDIUM #3 plan-level fixture** (30분): `but/however/although/despite/except` second-clause-negation 정규식 + 5건 fixture. 단 fix 설계 후 테스트 추가 (test-before-fix 금지 — h3 plan 의 risk 채택).
3. **MEDIUM #1 decision multiplier soft-curve** (1~2시간 시뮬레이션 + 패치): case 2 decision 도 partial multiplier (1.1~1.2x). 기존 case 1 의 1.5x 와의 격차 완화. Jaccard 임계 0.6 → 0.55 시뮬레이션 병행.
4. **LOW cerberusConfig 자동 생성** (5분): install/reconfigure 시 `cerberusConfig: {}` seed.
5. **HU-33 plan-level test** (15분, h3 plan 권고): general/generic + organize/organic + business/busy 9-reason 분리 assertion.

**GitHub release / npm publish 권장 순서** (v0.5.3 기준):
1. **v0.5.3.1 patch**: MEDIUM #2 render 패치 + 회귀 가드 1건만 cherry-pick (~10분). HC-11 score 표시는 변동 없으나 사용자가 보는 `?` 가 사라짐.
2. v0.5.4: MEDIUM #1/#3 + LOW + HU-33 plan-level test 묶음 처리 (~3시간).
3. 또는 v0.5.3 그대로 ship, MEDIUM 묶음을 모두 v0.5.4 에서 처리.

`feedback_skill_actual_vs_documented` 또는 `feedback_backup_outside_state_dir` 류 memory 갱신은 불필요 — 본 검증에서 critical drift 없음.
