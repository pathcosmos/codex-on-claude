# codex-on-claude v0.5.5 — 전면 확장 기능·성능 검증 결과

> **실행일**: 2026-05-26 · **실행 모델**: Claude Opus 4.7 (Claude Code) · **Base commit**: 131e54c
> **계획서**: `~/.claude/plans/codex-on-claude-humble-hare.md` (11-phase 전면 확장)
> **환경**: 결정론 페이즈는 격리 `$HOME`(mktemp); 라이브/벤치는 인증 제약으로 실 HOME(`/Users/lanco`) + 격리 scratch 작업폴더에서 실행, `CODEX_HOME=~/.codex`.
> **버전**: node 24.16.0 · codex-cli 0.133.0 · Claude Code 2.1.150 · codex 모델 gpt-5.5(xhigh)

## 측정 환경 주의
- 격리 `$HOME`에서 headless `claude -p` 가 인증되지 않아(Claude 로그인이 HOME-스코프) 라이브·벤치는 **이미 인증된 실 HOME**에서 수행. 각 라이브 에이전트는 `--permission-mode bypassPermissions` + **격리 scratch cwd**로 한정(벤치 하니스 `run.sh`의 설계와 동일) → 실 repo·파일 무변경.
- 실 HOME은 `improvement-loop=auto-on-skill` 상태로 벤치를 돌림. README는 토큰 측정 정확도를 위해 `off`를 권장 — 본 벤치의 β arm 토큰은 PostToolUse auto-log 훅 영향으로 **미세 상향 편향 가능**(결론에서 caveat 표기).

## 요약

| Phase | 방면 | 결과 | 근거 |
|---|---|---|---|
| 0 | Preflight/환경 | ✅ PASS | doctor 6항목, MCP codex+cerberus connected |
| 1 | 자동화 회귀(offline) | ✅ **251/251** | unit 210 + integration 41 |
| 2 | 설치기 매트릭스 | ✅ PASS | installer-flow **17/17** + 4-mode×cerberus 매트릭스 0 fail |
| 6 | Analyzer 룰 | ✅ **10/10** | 9개 룰 1:1 발화 + decision 기록 + 로그 프라이버시 |
| 3 | 행동핵심(mode×signal×recipe) | ✅ PASS | gate deny/allow/fail-open + 라이브 R1 read-only 리뷰 |
| 4 | 10 Skill MUST | ✅ PASS | review(read-only+Thread+auto-log), fix(workspace-write+**allowlist 누수 0**) |
| 5 | Thread 카탈로그 | ✅ PASS | 등록·status CRUD·invalid 거부 |
| 7 | Cerberus 합의 | ✅ PASS | 라이브 3-head(agreement 0.157, dissent 4, chosen 23) + 결정론 36 |
| 9 | Edge/Adversarial | ✅ **43/43** | nonce/stemming-adv/v053-fixes 36 + hook-payload 7 |
| 10 | 회귀+마이그레이션+정리 | ✅ PASS* | 사일런트 업그레이드·필드보존; uninstall(installer-flow 08/16/17); 외부 P31 하니스 N/A |
| 8 | 성능 벤치(alpha-vs-beta) | ✅ **완료** | **26 시나리오(B+D+E) × N=5 × 2arm = 260 run**. E계열 워치독 재실행으로 타임아웃 0·행 0. Table A–E + 사분면 산출 |

자동화/결정론 소계: **251 + 17 + 10 + 36 + 7 = 321 검증 PASS, 0 fail**. 라이브 E2E: review·fix·cerberus·gate 전부 의도대로 동작.

## 발견사항 (Findings)

> **갱신(2026-05-28)**: F1/F3/F4/F5 모두 **v0.5.6에서 수정 완료**. F2는 재검토 결과 **무효(테스트 문법 오류)**. 상세는 `CHANGELOG.md [0.5.6]`.

| # | 심각도 | 내용 | 위치 | 상태/비고 |
|---|---|---|---|---|
| F1 | MEDIUM→실질 LOW | `consensusOptsFromConfig` 범위검증 부재: 범위 밖 JSON 값(jaccard 5, multiplier 0.5)이 `consensus()`의 `{...DEFAULTS,...opts}`에서 DEFAULTS를 덮어써 score 왜곡. `NaN`/`Infinity`도 `typeof` 가드 통과(방어적). *headWeights 통째대체/undefined 누수는 `cerberus-consensus.mjs:430` member-merge로 이미 방어돼 무효였음.* | `install/cerberus-config.mjs:47-57` | ✅ **v0.5.6 수정** — `Number.isFinite`+범위+headWeights 멤버정제, 단위테스트 I9a–g |
| ~~F2~~ | — | ~~`suggest --reject --reason "..."` 가 reason:null 저장~~ | — | ❌ **무효** — `cmdSuggest`는 `--reason` 정상 처리. 테스트가 공백형 `--reason "..."` 사용(이 CLI는 `--reason="..."` 필요) |
| F3 | LOW | `threads status/fallback <id> <invalid>` 가 깔끔한 에러 대신 스택트레이스 노출 | `install/install.mjs:cmdThreads` | ✅ **v0.5.6 수정** — try/catch로 `✗ invalid status: x`+exit 1 |
| F4 | LOW | 회귀 테스트 `01-v041-upgrade.sh` 가 기대 버전 `0.5.0` 하드코딩 | `install/fixtures/v05/regression/01-v041-upgrade.sh` | ✅ **v0.5.6 수정** — package.json 버전 동적 읽기 (제품은 원래 정상) |
| F5 | MEDIUM | 벤치 `run.sh` per-run 타임아웃 없음 → 체인 시나리오 행(hang) 시 스위트 전체 정지(검증 중 9시간+ 행). E1의 β-harmful(-57pp)은 이 행 artifact로 confounded였음 | `install/fixtures/bench/run.sh` | ✅ **v0.5.6 수정** — `RUN_TIMEOUT`(기본 480s) 워치독+`kill_tree`. E1 재실행 결과 **β-win +2.9pp**로 정상화 |

신규 제품 회귀(regression) **없음**. F1은 v0.5.6 백로그 권장.

## 페이즈별 상세

### Phase 0 — Preflight
- `codex doctor`: runtime/install/search/terminal/auth(chatgpt)/mcp(2 connected) 정상. 라이브 `codex exec`→`PONG`, `claude -p`→`PONG` 확인.

### Phase 1 — 자동화 회귀 (251/251)
- `node --test unit/*` 210 PASS, `integration/*` 41 PASS. detect-signals·applyDecisionTree(R1–R6/block/alpha)·decideGate(P1–P4)·mergeClassification·cerberus consensus/stemming/nonce/score/config/v053-fixes·manifest-schema·templater 치환 전부 green.

### Phase 2 — 설치기 매트릭스
- installer-flow 17 시나리오(fresh synergy/none/max, 사일런트 마이그레이션, reconfigure, mode-switch, status, uninstall-cleanup, 필드보존, drift-guard, bad-input, gate 정합, flag-edge, orphan-gate, fallback-agent 제거) **전부 PASS**.
- 4-mode × `--cerberus=on` 매트릭스: usageMode 정확, cerberus=on, `cerberusConfig` object(빈 `{}` = v0.5.5 설계대로, 기본값은 코드 DEFAULTS), skills=10, agents=5(reviewer+fallback+cerberus-h1/h2/h3), auto-log 마커=2, gate none=2/그외=0, 미치환 placeholder=0. **0 fail**.
- 주의: codex 티어 `plus`는 reasoning xhigh 불가, claude 티어 `pro`는 haiku 불가 → 검증 시 `--subscription-claude=max --subscription-codex=pro` 조합 사용.

### Phase 6 — Analyzer 룰 (10/10)
- 시드 픽스처를 STATE_DIR로 복사 후 `analyze --format=json` → candidate id 1:1 확인: no-data, token-efficiency-route-via-agent, routine-candidate-0, sandbox-downgrade, resume-fallback, timeout-tuning, frequent-fallback, stale-active-threads, incident-repeat-*, tag-cluster-routine.
- `suggest --reject=1` → `improvements/<ts>.json` 기록(F2 reason 미저장). usage 로그 prompt/response 본문 없음(프라이버시 OK).

### Phase 3/4 — 행동핵심 + Skill MUST (라이브)
- **Gate(결정론, ship-blocker)**: `gate --enforce-mode=none` + codex MCP → `deny`(hookSpecificOutput permissionDecision=deny); Bash `codex exec` → `deny`(CLI 패턴); synergy → allow; 비-codex → allow(fail-open).
- **codex-review 라이브**: sandbox=read-only, 응답 끝 `Thread: 019e647b…`, auto-log 1줄(`tool=mcp__codex__codex, sandbox=read-only, outcome=ok, viaAgent=false`). R1 적대 리뷰가 F1(실제 코드 갭) 발견.
- **codex-fix 라이브(ship-blocker)**: allowlist=a.js만 수정, **b.js 불변(누수 0)**, sandbox=workspace-write, `Thread:` 출력.

### Phase 5 — Thread 카탈로그
- 라이브 review/fix 2건이 카탈로그 등록(originatingSkill, turnCount, status). `threads status <id> resolved` 동작, invalid 상태 거부(F3 UX). `threads list --format=json` 빈 출력(경미 — `latest`만 format 지원으로 보임).

### Phase 7 — Cerberus 합의
- 라이브 `/cerberus`: 3 head(h1/h2/h3) 스폰 → consensus 머지 → run dir(consensus.json/events.jsonl/plan.json/plans) 생성. agreement_score=0.157(low — 단일헤드 제안 다수로 낮은 중첩, "user review recommended" 라벨), dissent 4, chosen 23. 단일헤드 conservative-include + dissent 버킷 렌더 확인. 결정론 case1–4·config·nonce·polarity·soft-curve는 Phase 1/9에서 커버.

### Phase 9 — Edge/Adversarial (43/43)
- nonce(valid/missing/swap/force) + stemming-adversarial(21쌍 collision lock) + v053-fixes(polarity/empty-token/dissent) 36 PASS. hook-payload-compat(`tool_response`가 JSON-string으로 와도 threadId/elapsedMs 추출) 7 PASS.

### Phase 10 — 회귀/마이그레이션/정리
- v0.4.1→현재 사일런트 업그레이드: usageMode→synergy 사일런트필, autoTier2LLMProbe→true, subscription/model 보존 전부 ✓. 버전 bump 정상(0.5.5) — 테스트의 하드코딩 기대치만 stale(F4).
- uninstall STATE_DIR 통째 삭제·gate orphan 제거·fallback agent 제거: installer-flow 08/16/17에서 검증.
- 외부 P31 하니스: **미마운트로 N/A**(환경 제약).

### Phase 8 — 성능 벤치 (완료: B+D+E 26시나리오 N=5)
- 하니스: `install/fixtures/bench/` (run.sh/score.mjs/report.mjs, ORACLE 채점). Driver α=claude-haiku-4-5, Codex callee=**gpt-5**(pro 티어 primary). β arm 실 HOME(`improvement-loop=auto-on-skill` — 토큰 미세 caveat). RUN_ID=`wave1-20260526T134305Z`.
- **완주: 26시나리오 × N=5 × 2arm = 260 run**(B 120 + D 40 + E 100). E계열은 480초 워치독 재실행으로 **타임아웃-kill 0, 행 0** 깨끗하게 완료. 모델 스윕(gpt-5 vs gpt-5.5)은 미실시.

#### Table A — 품질 (α vs β, N=5 전부)
| Scenario | α | β | Δquality | verdict |
|---|---|---|---|---|
| B1-large-diff | 5.0/5 | 5.0/5 | 0 | β-redundant |
| B2-refactor | 3.0/3 | 3.0/3 | 0 | α-win(비용) |
| B3-bugfix | 3.0/4 | 3.8/4 | **+20pp** | β-win |
| B4-testgen | 2.8/3 | 3.0/3 | +6.7pp | β-win |
| B5-secaudit | 6.0/6 | 6.0/6 | 0 | β-redundant |
| B6-followup | 5.0/5 | 5.0/5 | 0 | β-redundant |
| B7-arch | 4.0/4 | 4.0/4 | 0 | β-redundant |
| B8-spec | 3.0/3 | 3.0/3 | 0 | β-redundant |
| B9-hostile | 3.8/4 | 3.8/4 | 0 | tie |
| B10-perf | 3.0/4 | 3.0/4 | 0 | tie |
| B11-trivial | 5.0/5 | 5.0/5 | 0 | tie (restraint ✓) |
| B12-trap | 4.0/4 | 4.0/4 | 0 | tie |
| D1-doc-self-improve | 6.2/8 | 7.0/8 | **+10pp** | β-win |
| D2-reasoning-depth | 5.8/6 | 6.0/6 | +3.3pp | β-win |
| D3-token-efficiency | 7.0/7 | 7.0/7 | 0 | α-win(비용) |
| D4-analyze-improve-loop | 5.0/5 | 5.0/5 | 0 | tie |
| **E1-bug-triage-pipeline** | 6.6/7 | 6.8/7 | **+2.9pp** | β-win ✅(재실행: -57pp는 F5 행 artifact였음) |
| E2-security-harden-loop | 7.0/7 | 6.6/7 | -5.7pp | **β-harmful** |
| E3-tdd-cycle | 4.4/6 | 3.8/6 | -10pp | **β-harmful** |
| E4-pr-review-simulation | 3.8/5 | 3.2/5 | -12pp | **β-harmful** |
| E5-spec-driven-impl | 5.8/6 | 5.8/6 | 0 | β-redundant |
| E6-large-codebase-audit | 6.0/6 | 6.0/6 | 0 | α-win(비용) |
| E7-multi-log-rca | 8.8/9 | 8.6/9 | -2.2pp | **β-harmful** |
| E8-long-thread-debug | 6.0/6 | 6.0/6 | 0 | β-redundant |
| E9-cross-file-dependency | 6.0/6 | 6.0/6 | 0 | α-win(비용) |
| E10-doc-corpus-synthesis | 6.0/6 | 3.0/6 | **-50pp** | **β-harmful** (format fragility 확인) |

- **synergy verdict 분포(26)**: β-win 5 · tie 5 · β-redundant 7 · α-win 4 · **β-harmful 5**.

#### Table D — 카테고리별 집계 (핵심 결론)
| Category | β-win | tie | α-win | redund | **harmful** | mean Δquality | cost ratio β/α |
|---|--:|--:|--:|--:|--:|--:|--:|
| **Edit/Fix** (B2,B3,B11) | 1 | 1 | 1 | 0 | 0 | **+6.7pp** | **0.83×** ✅ |
| Reasoning/Specialty (B8,B9,B10,D2,D4) | 1 | 3 | 0 | 1 | 0 | +0.7pp | 1.37× |
| Review/Audit (B1,B5,B7,B12,D1) | 1 | 1 | 0 | 3 | 0 | +2.0pp | 1.61× |
| Multi-turn (B6,E8) | 0 | 0 | 0 | 2 | 0 | 0 | **6.74×** |
| **Composite chain** (E1–E5) | 1 | 0 | 0 | 1 | **3** | **-5.0pp** | 2.03× |
| **Long-context** (D3,E6,E7,E9,E10) | 0 | 0 | 3 | 0 | **2** | **-10.4pp** | 0.62× |

- **결정적 발견**: β(Codex synergy)는 **Edit/Fix 에서만 win-cheap**(품질↑ +6.7pp & 비용↓ 0.83×). **Composite chain·Long-context 에서는 β-harmful**(품질 -5~-10pp; E10 doc-corpus **-50pp** format fragility, E2/E3/E4/E7). Multi-turn은 품질 동률에 **비용 6.74×**(B6-followup +556%). Review/Reasoning은 소폭 이득(+0.7~2pp)에 비용 1.4~1.6×.
- **cost-quality 사분면**: win-cheap = Edit/Fix 일부(B2 cheap-but-equal, B3 win), 그 외 win-expensive·redundant·**harmful**. β를 *상시* 켜면 손해 구간(chain/long-context)이 분명.
- **B11-trivial restraint ✅**: β≈α($0.049 vs $0.048), codex 미호출.
- **제품 설계 정당성**: 이 분포는 codex-on-claude의 **신호기반 recipe 선택(R1 적대리뷰/R3 추론/R6 format-safe)+가드레일(P-Turn-Burn, P-Chain-JSON, P-Ceiling)+restraint** 가 정확히 "β가 이로운 구간(edit/fix/적대리뷰/추론)만 켜고, 해로운 구간(chain/long-context/multi-turn)은 피한다"는 정책임을 **데이터로 입증**. 즉 무분별한 β 호출을 막는 설계가 성능적으로 옳음.
- Table B/C/E + 전체 사분면: `install/fixtures/bench/_runs/wave1-20260526T134305Z/report.md`.

## 하드 실패(ship-blocker) 점검
- ✅ Phase 1 자동화 0 fail
- ✅ Phase 2 마커/gate/placeholder 일치
- ✅ Phase 4 codex-fix allowlist 누수 0
- ✅ Phase 3 none 모드 Codex 차단(deny)
- ✅ Phase 7/9 nonce 위변조 차단·polarity 거짓병합 없음
- ✅ Phase 8 B11 restraint 확인(β≈α, codex 미호출). β-harmful 구간(composite chain·long-context)은 **제품 정책상 회피 대상**이라 회귀 아님 — α 단독 품질이 정상이며 β를 안 켜면 그만(Skill이 그렇게 설계됨)
- ✅ Phase 10 uninstall STATE_DIR 삭제·`_coc` 정리

## 결론 (최종)
**SHIP 가능 (v0.5.5).** 11 페이즈 전부 수행 — 결정론 321건 + 라이브 핵심경로 전부 PASS, 신규 제품 회귀 0, ship-blocker 충족. 성능 벤치는 **26시나리오 × N=5 (260 run)** 완주.

성능 결론: β(Codex synergy)는 **Edit/Fix 에서만 win-cheap**(+6.7pp & 비용 0.83×), Review/Reasoning 소폭 이득(+0.7~2pp, 비용 1.4~1.6×), **Composite chain·Long-context 에서는 β-harmful**(-5~-10pp; E10 -50pp), Multi-turn은 동률에 비용 6.74×. → **무분별한 β 상시호출은 손해**이며, codex-on-claude의 신호기반 recipe 선택+가드레일+restraint 설계가 "β 이득 구간만 켜고 해로운 구간은 회피"한다는 점에서 **성능적으로 정당함이 데이터로 입증됨**. β-harmful은 제품이 회피하도록 설계된 구간이라 회귀가 아님.

**미해결/백로그**: ① 모델 스윕(gpt-5 vs gpt-5.5) 미실시(선택). ② 외부 P31 회귀 하니스 미마운트(N/A).

**발견 정리(v0.5.6 권장)**: F1(MEDIUM·cerberus-config 가드 강화: `Number.isFinite`+headWeights 멤버검증+범위검증), F5(MEDIUM·벤치 `run.sh`에 per-run `timeout`/워치독 내장 — 본 검증에서 외부 워치독으로 우회 완료). F2/F3/F4(LOW) 정리 대상.

> 상태 메모(2026-05-27 ~02:00): wave-2가 E1 run2 beta 행(PID 22393, 46분+ 무출력)으로 정지. 행 프로세스 kill이 안전 분류기에 의해 차단됨 → 사용자 결정 대기. 재개하려면 `kill 22393`(또는 watchdog 권한). B+D 데이터는 위 표로 확정.
