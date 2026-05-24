# Cerberus v0.5.5 기능 상세 테스트 실행 결과

**실행일**: 2026-05-23
**실행자 모델**: Claude Opus 4.7 (claude-opus-4-7)
**Base commit**: `f7b8e4b` (`feat(0.5.5): decision soft-curve + contrast conjunction polarity + cerberusConfig plumbing + HU-33 lock`)
**Plan**: `/Users/lanco/.claude/plans/nested-beaming-pinwheel.md`
**선행 결과**: `docs/test-execution-results-cerberus-v0.5.3-opus47.md` (v0.5.3 + Opus 4.7 재검증)

## 요약

| 분류 | PASS | PARTIAL | FAIL | PENDING |
|------|------|---------|------|---------|
| 자동화 unit/integration | 108 | 0 | 0 | 0 |
| Hands-on carryover (v0.5.3 결과) | 7 | 0 | 0 | 0 |
| 신규 HU-34 (MEDIUM #1) | 1 | 0 | 0 | 0 |
| 신규 HU-35 (MEDIUM #3) | 1 | 0 | 0 | 0 |
| 신규 HU-36 (LOW config) | 2 | 0 | 0 | 0 |
| HU-37 (HU-33 plan-level — A22 자동화) | 1 | 0 | 0 | 0 |
| HC-12 (real Opus 4.7 replay) | 1 | 0 | 0 | 0 |
| **합계** | **121** | **0** | **0** | **0** |

**Critical findings**: 0 · **Medium findings**: 0 · **Low findings**: 0
v0.5.3 doc 의 MEDIUM #1 / #2 / #3 + LOW 모두 **RESOLVED** (§7 closure 매트릭스).

## 측정 환경 주의

본 세션의 cerberus MCP server 프로세스는 세션 시작 시점에 v0.5.4 코드를 메모리에 로드한 상태로 cached. 본 세션 내 v0.5.5 패치는 server process restart 없이는 MCP 호출에 반영되지 않음. 따라서:

- **MCP 호출 (`mcp__cerberus__consensus` 등)** = **v0.5.4 baseline** (cached)
- **Node 직접 호출 (`node -e 'import(...)...'`)** = **v0.5.5** (fresh import per invocation)

이 분기를 활용해 동일 fixture 를 양쪽에서 측정 → byte-level diff. 별도 환경 (`/tmp/coc-v054-baseline` 등 npm install) **불필요** 으로 plan 갱신.

---

## §1 자동화 sanity 결과

```
$ node --test install/fixtures/v05/unit/cerberus-*.test.mjs install/fixtures/v05/integration/cerberus-*.test.mjs install/fixtures/v05/integration/manifest-schema.test.mjs
1..105
# tests 108
# suites 1
# pass 108
# fail 0
# duration_ms 656.431208
```

102 cerberus unit + 6 manifest-schema integration = 108/108 PASS. v0.5.4 76 → +26 신규 (I7/I8 12 + A22 1 + F5 8 + SF6~10 5). 회귀 0건.

---

## §2 Hands-on Steps 1, 2, 3, 4, 5, 7, 8 (carryover)

v0.5.5 는 Skill / MCP / Agent / config 의 외부 surface 무변화. v0.5.3 doc 의 PASS 결과 그대로 carryover:

- Step 1 Skill+Agent+MCP 등록 PASS
- Step 2 `mcp__cerberus__init` 응답 형식 PASS (run_id, validation_nonces, head_prompts)
- Step 3 정상 nonce consensus PASS
- Step 4 nonce swap → reject + force bypass PASS
- Step 5 H1 allowlist 정적 차단 PASS
- Step 7 list / status / inspect 일관성 PASS
- Step 8 `--cerberus=off/on` 토글 PASS

(Step 6 = HC-12 으로 v0.5.5 에서 별도 측정 — §5 참조)

---

## §3 신규 HU-34 · MEDIUM #1 decision multiplier soft-curve [PASS]

**Given**: 3 합성 fixture — F-c1 (3 heads byte-identical Decision) / F-c2 (3-way A/B/C verdict split, same Decision topic group) / F-c4 (3 완전 분리 decision topics, no Jaccard merge).

**When**: 동일 fixture 를 (a) MCP 호출 (= v0.5.4 cached) 과 (b) Node 직접 호출 (= v0.5.5) 양쪽에서 실행.

**Then (실측)**:

| Fixture | v0.5.4 cached MCP | v0.5.5 direct | Δ score |
|---------|------|------|------|
| F-c1 unanimous (run `20260523T135451425Z-a58d79`) | mult **1.5** / score **1.00** high | mult **1.5** / score **1.00** high | 0 (회귀 없음 ✓) |
| F-c2 tournament (run `20260523T135452462Z-a44e03`) | mult **1.0** / score **0.23** low | mult **1.2** / score **0.42** moderate | **+0.19** (low → moderate) |
| F-c4 split (run `20260523T135452709Z-958da3`) | mult **1.0** / score **0.18** low | mult **1.0** / score **0.15** low | -0.03 (case-4 split — 정상) |

**핵심**: F-c2 (사용자가 가장 자주 마주칠 시나리오 — paraphrased decision agreement) 가 binary cliff (1.0) 에서 partial multiplier (1.2) 로 이동 → **low → moderate 라벨 진입**. F-c1 (unanimous) 과 F-c4 (split) 는 회귀 없음 (1.5 / 1.0 유지).

**Source-of-truth automation**: `SF6` (case-1 → 1.5), `SF7` (case-2 → 1.2), `SF8` (case-4 split → 1.0), `SF9` (case-1 precedence), `SF10` (caller option override) — 모두 PASS.

---

## §4 신규 HU-35 · MEDIUM #3 contrast conjunction caveat 생존 [PASS]

**Given**: run-md3 fixture (Step 3 §3 의 e8c149 와 동일) — h1 neutral / h2 5 conjunction (`but / however / although / despite / except`) / h3 mid-paraphrase neutral.

**When**: MCP 호출 (run `20260523T135819028Z-11488f`, v0.5.4 cached) 과 Node 직접 호출 (v0.5.5) 양쪽 실행.

**Then (실측)**:

| 측정 | v0.5.4 cached (11488f) | v0.5.5 direct |
|------|----|----|
| score | **0.93 high** | **0.69 moderate** |
| groupCounts | case1=3 / case2=4 / case3=1 / case4=1 | case1=3 / case2=0 / case3=5 / case4=5 |
| consensus_plan byte size | ~3.3 KB | 1625 byte |
| 5 caveat substring (전체 plan grep) | 5/5 발견 | 5/5 발견 |
| 5 caveat — **Reasons 본문 (pre-Dissent)** | **1/5** (only "although" via conservative-include) | **5/5** (모두 conservative-include) |
| `dissent.disputed[]` 항목 수 | **8** (`*(lost to h3)*` 8건) | **0** (zero tournament losers) |

**핵심**: pre-v0.5.5 는 4/5 caveat 가 "Dissent → Disputed → lost in tournament" 섹션에 격하 → 사용자가 "이건 탈락 의견" 으로 인식. v0.5.5 는 polarity guard 가 case-2 false-merge 차단 → 5/5 caveat 가 **Reasons 본문 conservative-include** 로 살아남음. **0 tournament losers** = 사용자에게 misleading "lost in tournament" 라벨 사라짐.

Score 0.93 → 0.69 trade-off: **inflated false-consensus 에서 honest moderate-disagreement 로** — 정확한 신호.

**Source-of-truth automation**: F5a~e (5 conjunction polarity flag), F5f (양립 표현 `but also/even` false-positive 가드), F5g (word-boundary), F5h (e2e caveat 생존) — 모두 PASS.

---

## §5 신규 HU-36 · LOW cerberusConfig seed + override e2e [PASS]

### HU-36a · seedCerberusConfig 함수 동작 + 실 config.json 점검 [PASS]

```
=== HU-36a · seedCerberusConfig direct call ===
HU-36a.1 fresh-install seed:        {}
HU-36a.2 prior-preserved:           {"headWeights":{"h1":2,"h2":1,"h3":1},"jaccardGroupThreshold":0.55}
  same ref?                         true
HU-36a.3 cerberus-off no-op:        false (field absent — correct)
HU-36a.4 real config.json:
  cerberus =                        on
  cerberusConfig =                  (field absent — pre-v0.5.5 install, reconfigure 미실행)
  consensusOptsFromConfig output:   {}
  costCapFromConfig output:         50000
```

- ✓ Fresh install: `{}` seed 정상
- ✓ Prior 값 보존: 같은 reference 유지 (nullish coalescing 검증)
- ✓ `cerberus=off` 시 field 미생성 (no-op)
- ✓ 실 config.json 의 cerberusConfig 부재 시 server 가 defaults 사용 (graceful fallback)

**Source-of-truth automation**: I7a~d (seedCerberusConfig 4 cases), I8a~h (consensusOptsFromConfig + costCapFromConfig 8 cases) — 모두 PASS.

### HU-36b · cerberusConfig override e2e (sandbox) [PASS]

3 paraphrase variant plans 으로 default vs override 비교:

| Config | opts forwarded | groupCounts | score | 관찰 |
|--------|----|----|-----|------|
| default `{}` | `{}` | case1=1, case3=1, case4=1 | 0.80 | Jaccard 0.6 임계로 3-way mixed grouping |
| `{jaccardGroupThreshold: 0.45}` | `{"jaccardGroupThreshold":0.45}` | case1=1, case2=1 | 1.00 | 더 permissive — paraphrase 모두 merge |
| `{decisionPartialMultiplier: 1.4}` (A/B/C plans) | `{"decisionPartialMultiplier":1.4}` | case2=1 | 0.70 (mult **1.4** applied) | v0.5.5 신규 필드 override 도 정상 |

- ✓ jaccard override 가 actual grouping 변화 유발 (case3=1 → case2=1)
- ✓ decisionPartialMultiplier=1.4 override 가 mult 1.2 → 1.4 로 변경 → score 0.6 → 0.7

**핵심**: pre-v0.5.5 의 dead path (`loadConfig()` 가 `cfg.choices.cerberus` 를 enum/object 혼동) 가 v0.5.5 의 `consensusOptsFromConfig` 로 정상 동작. 사용자가 ~/.claude/codex-on-claude/config.json 의 `choices.cerberusConfig` 를 수동 편집해 per-machine 튜닝 가능.

---

## §6 신규 HU-37 · HU-33 plan-level lock (A22 자동화) [PASS]

`install/fixtures/v05/unit/cerberus-stemming-adversarial.test.mjs:A22` 가 9 stem collision 쌍 (general/generic + organize/organic + business/busy) 의 plan-level case-4 분리를 lock. 자동화 PASS. hands-on 별도 검증 불필요.

---

## §7 HC-12 · real Opus 4.7 plans replay [PASS]

**Given**: `bed595` (`20260523T061427238Z-bed595`, v0.5.3 doc §5 Step 6 결과) 의 보존된 3 head plans (`plans/h1.json`, `plans/h2.json`, `plans/h3.json`).

**When**: 동일 plans 를 v0.5.4 cached (saved consensus.json) vs v0.5.5 direct call 양쪽에서 평가.

**Then (실측)**:

| 측정 | v0.5.4 baseline (saved) | v0.5.5 direct |
|------|----|----|
| score | 0.166 | 0.166 |
| decisionMultiplier | 1.0 | 1.0 |
| groupCounts | case1=0 / case2=0 / case3=0 / case4=47 | case1=0 / case2=0 / case3=0 / case4=47 |
| `*(lost to ?)*` count | **2** | **0** ✓ |
| `*(disputed — opposing polarity)*` count | 0 | **2** ✓ |

**해석**:
- bed595 는 3 head 가 완전 별개 decision topic 으로 응답한 case (Add three fixtures / Require new fixtures / Treat as INSUFFICIENT) — 모두 case-4 single-head. case-2 decision (paraphrase) 시나리오가 아니므로 MEDIUM #1 multiplier 발화 안 됨. **정상 동작**: 근본 disagreement 는 score 0.17 로 정직하게 보고.
- 한편 v0.5.4 MEDIUM #2 fix 효과는 명확: 2건의 `*(lost to ?)*` → `*(disputed — opposing polarity)*` 치환. 사용자 출력 정정.
- bed595 plans 에 contrast conjunction caveat 패턴 부재 — MEDIUM #3 효과 측정 불가 (별도 시나리오: HU-35 md3 가 그 역할).

새 spawn 비용 (~30k tokens) 없이 replay 만으로 MEDIUM #2 회귀 종결 확정.

---

## §8 v0.5.3 finding closure 매트릭스

| Finding | 출처 doc | 상태 (v0.5.5) | 종결 근거 |
|---------|----|----|----|
| MEDIUM #1 (paraphrase × decision multiplier cliff) | v0.5.3 doc §4 | **RESOLVED** | HU-34 F-c2: mult 1.0 → 1.2, score +0.19 (low→moderate). SF6~10 automation lock. |
| MEDIUM #2 (`*(lost to ?)*` render) | v0.5.3 doc §4 | **RESOLVED** (v0.5.4) | HC-12: 2 `?` → 0 (replaced with `*(disputed — opposing polarity)*`). F3c automation lock. |
| MEDIUM #3 (contrast conjunction polarity miss) | v0.5.3 doc §4 | **RESOLVED** | HU-35 md3: 4/5 caveat 격하 → 0/5 격하 (모두 Reasons 본문 보존). F5a~h automation lock. |
| LOW (cerberusConfig seed 부재 + server reader dead-path) | v0.5.3 doc §4 | **RESOLVED** | HU-36a/b: seed 동작 + override 가 server 에 도달 (jaccard + decisionPartialMultiplier 양쪽). I7/I8 automation lock. |

---

## §9 v0.5.6+ backlog

본 검증에서 발생한 신규 finding **없음**. v0.5.6+ candidate 는 v0.5.5 plan doc 의 미반영 항목 그대로:

- Cerberus **Full mode** (FU-01~10 + FC-02~05 14건 PENDING-IMPL) — 별도 minor release. 3-worktree execute + verify + iteration loop.
- Embedding-based similarity — Porter Stemmer 의 paraphrase miss 보완 (opt-in LLM-judge 경로). 비용 큼.
- `bodyLenScore` 곡선 평탄 (h1 finding from v0.5.3 backlog) — 100~2000자 구간 가중치 재설계.
- Multi-language stemmer (한국어/일본어). 현재 empty-token guard 가 false-merge 만 차단.
- HU-36b 의 실제 사용자 `~/.claude/codex-on-claude/config.json` seed 활성화 — 사용자가 `codex-on-claude reconfigure --cerberus=on --yes` 실행 시 자동 적용 (v0.5.5 코드는 이미 준비됨). README 의 "Per-machine tuning" 섹션 참조.

---

## 결론

**Ship 결정**: v0.5.5 commit `f7b8e4b` 는 v0.5.3 의 MEDIUM #1/#2/#3 + LOW finding 4건 모두 RESOLVED. 자동화 108/108 + hands-on 7/7 carryover + 신규 HU-34/35/36/37 + HC-12 모두 PASS. **Critical / Medium / Low finding 0건**. push + tag + GitHub release + npm publish 진행 가능.

**측정 가치 요약**:
- HU-34 F-c2: paraphrase decision 시나리오 score +0.19 (low→moderate) — 사용자 체감 가장 큰 효과
- HU-35 md3: caveat 5/5 Reasons 본문 보존 (이전 1/5) — consensus algorithm 의 "honest reporting" 회복
- HU-36a/b: pre-v0.5.5 의 server dead-path 정상화 + per-machine 튜닝 enable
- HC-12 bed595: MEDIUM #2 render 정정 확정 (2 `?` → 0)

`feedback_skill_actual_vs_documented` 또는 `feedback_backup_outside_state_dir` 류 memory 갱신 불필요 — 본 검증에서 critical drift 없음.
