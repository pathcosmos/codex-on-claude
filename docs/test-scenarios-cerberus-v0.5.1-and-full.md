# Cerberus 모드 상세 테스트 시나리오 (Head v0.5.1 + Full PENDING-IMPL)

**Status**: Draft 3 — Cerberus head 모드 self-review로 식별된 6건 spec drift / 시나리오 모순 정정
**작성일**: 2026-05-23
**대상 버전**: v0.5.1 (Head 모드 구현본) + Full 모드 spec 회귀 가드
**기반 문서**: `docs/cerberus-mode-spec.md` (Draft 3), `docs/cerberus-poc-2026-05-22.md`
**Self-review 결과**: `docs/test-execution-results-cerberus-v0.5.1.md` 참조 — Cerberus head로 본 문서를 검증한 결과 Decision 만장일치 `needs-revision` → 본 Draft 3 정정 산출됨

- **Head 모드 시나리오 30건**: HU-01 ~ HU-20 (단위), HC-01 ~ HC-10 (복합) — v0.5.1로 install/reconfigure한 환경에서 즉시 실행 가능
- **Full 모드 시나리오 15건**: FU-01 ~ FU-10 (단위), FC-01 ~ FC-05 (복합) — **PENDING-IMPL**, 향후 Full 구현 시 회귀 가드로 전환

라벨:
- `R` (READ-ONLY) — 환경 변경 없음
- `S` (SANDBOXED) — mktemp + HOME override
- `D` (DESTRUCTIVE) — `~/.claude/` 직접 변경, Phase 0 백업 필요
- `🅐` (AUTO) — 기존 `cerberus-*.test.mjs` 자동화로 커버
- `🅼` (MANUAL) — 사용자 슬래시 또는 별도 트리거 필요

## 카테고리 요약

| 카테고리 | Head 모드 건수 | Full 모드 건수 |
|---------|---------------|---------------|
| 합의 알고리즘 결정성/경계 | HU-01 ~ HU-05 (5) | — |
| 합의 알고리즘 case 분기 | HU-06 ~ HU-10 (5) | — |
| Topic 추출 + Jaccard | HU-11 ~ HU-14 (4) | — |
| MCP 5 tools | HU-15 ~ HU-18 (4) | — |
| 설치 산출물 | HU-19 ~ HU-20 (2) | — |
| opt-in 토글 라이프사이클 | HC-01 ~ HC-03 (3) | — |
| 실제 task end-to-end | HC-04 ~ HC-06 (3) | — |
| 장애 + 격리 | HC-07 ~ HC-08 (2) | — |
| 비용 + 상태 영속화 | HC-09 ~ HC-10 (2) | — |
| Execute consensus | — | FU-01 ~ FU-04 (4) |
| Verify consensus | — | FU-05 ~ FU-08 (4) |
| Iteration loop | — | FU-09 ~ FU-10 (2) |
| Full end-to-end | — | FC-01 ~ FC-05 (5) |
| **합계** | **30** | **15** |

---

## Head 모드 단위 (HU-01 ~ HU-20)

### A. 합의 알고리즘 결정성 + 경계

### HU-01 · 같은 입력 5회 → byte-identical consensus_plan 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T1, T1b`
**절차**: 3 plan 고정 입력으로 `consensus(plans)` 5회 호출, 각 호출 결과의 `consensus_plan`을 SHA-256 비교
**기대**: 5개 sha 모두 동일, `agreement_score` 5개 모두 동일
**실패 조건**: sha 1개라도 다름 → 결정성 회귀 (timestamp/Date.now 같은 비결정 요소 누출)

### HU-02 · Decision case 1 → decisionMultiplier 1.5 적용 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T2`
**절차**: 3 head 모두 `## Decision\nA` 명시한 plan → `consensus()` 호출
**기대**: `decisionUnanimous=true`, `raw.decisionMultiplier=1.5`, `agreement_score >= raw.rawScore`
**실패 조건**: multiplier=1.0 (불일치 인식 실패)

### HU-03a · Decision case 3 — 2 head 일치 + 1 head missing (불일치 아님) 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T2b` (부분)
**절차**: h1=A, h2=A, h3=(Decision 미명시) — 3 plan으로 consensus
**기대**: Decision 그룹이 case 3로 분류, `decisionUnanimous=false`, `decisionMultiplier=1.0`, `dissent.missing[]`에 h3 표기. `dissent.disputed` 비어있음 (case 3 룰: 2-head 일치는 신호이지 분쟁 아님 — HU-08과 동일)
**실패 조건**: case 2 tournament로 잘못 분기, h2/h1이 disputed에 들어감

### HU-03b · Decision case 2 — 3 head 모두 다른 답 → tournament 🅼 S
**절차**: h1=A, h2=B, h3=C 모두 다른 plan으로 consensus
**기대**: case 2 tournament 작동, h3 가중치 1.5로 winner (또는 동률 시 h3>h1>h2 lex 우선), 나머지 2개 `dissent.disputed`에 기록, `decisionUnanimous=false`, `decisionMultiplier=1.0`
**실패 조건**: case 1로 잘못 분기 (token 빈셋 trap), winner 가중치 무시

### HU-04 · agreement_score cap min(1.0, raw × 1.5) 강제 🅼 R
**절차**: 결정성 fixture — case 1이 7개, 나머지 그룹 0개로 구성 → rawScore = 7/7 × 1.0 = 1.0, ×1.5 multiplier 후보 1.5 → cap → final = 1.0
**기대**: `agreement_score === 1.0` (정확히 1.0, > 1.0 불가), `raw.rawScore = 1.0`, `raw.decisionMultiplier = 1.5`
**실패 조건**: score > 1.0 (cap 실패) 또는 score < raw (잘못된 cap)

### HU-05 · 라벨 임계값 경계 표 🅼 R
**절차**: 4 fixture로 정확한 boundary 값 (raw score 기반) 생성:
- fixture A: rawScore=0.4000 / multiplier=1.0 → score=0.400 → **moderate**
- fixture B: rawScore=0.3999 / multiplier=1.0 → score=0.3999 → **low**
- fixture C: rawScore=0.7000 / multiplier=1.0 → score=0.700 → **high**
- fixture D: rawScore=0.6999 / multiplier=1.0 → score=0.6999 → **moderate**
**기대**: 정확히 위 4 라벨 매칭, raw score 기반 라벨링 (rounded display score 사용 X)
**실패 조건**: 경계 라벨 mismatch, tolerance 오차로 인한 flake

### B. 합의 알고리즘 case 분기

### HU-06 · case 1 (3 head body sim ≥0.8 → merged) 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T3` 일부
**절차**: 같은 reason 3개를 token-거의-동일하게 작성 (3 head 모두)
**기대**: `consensus_plan`의 해당 항목에 `(h1+h2+h3)` 기여자 태그, `raw.groupCounts.case1 >= 1`
**실패 조건**: case 2/3로 분류

### HU-07 · case 2 (3 head body sim <0.8 → tournament) 🅼 S
**절차**: 의역만 다른 3 reason → consensus, `chosen_per_topic[winner].reason`에 `tournament` 단어 포함 확인
**기대**: `raw.groupCounts.case2 >= 1`, winner의 가중치+specificity 점수가 다른 2개보다 큼 (또는 tie 시 h3>h1>h2)
**실패 조건**: case 1 (잘못 merged) 또는 dissent에 winner도 같이 분류

### HU-08 · case 3 (2-head 일치, 1 missing) — disputed 없음 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T8` 일부
**절차**: h1, h3에만 등장하는 reason → consensus
**기대**: `dissent.missing[]` 에 missing head(h2) 표기, `dissent.disputed` 에 loser 미포함 (2 head 일치는 신호이지 분쟁이 아님)
**실패 조건**: loser가 disputed로 분류 → 사용자에게 잘못된 충돌 신호

### HU-09a · case 4 risk 단일 head 보수적 채택 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T4`
**절차**: h3에만 등장하는 unique risk 1개 → consensus
**기대**: `consensus_plan.Risks` 섹션에 그 risk 포함, suffix `_(single-head risk (conservative include))_`. spec §3.3 case 4 명시 룰.
**실패 조건**: dissent.minority로 빠지고 consensus_plan 본문에 미포함

### HU-09b · case 4 reason 단일 head 보수적 채택 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T5`
**절차**: h3에만 등장하는 unique reason 1개 → consensus
**기대**: `consensus_plan.Reasons` 섹션에 그 reason 포함, suffix `_(single-head reason (conservative include))_`. spec §3.3 case 4 Draft 3에서 명시됨 (risk와 동일 처리).
**실패 조건**: dissent.minority로 빠지고 consensus_plan 본문에 미포함

### HU-10 · case 4 step/decision 3분류 (validated/disputed/minority) 🅼 S
**절차**: h1만 step "Add benchmark suite" 명시, h2/h3 plan에 "benchmark" 키워드 + negation token 부재 / 부재 / 존재 시나리오 각각
**기대**: 부재 → `dissent.validated`, 존재(`avoid/don't`) → `dissent.disputed`, kind=note 또는 일치 토픽 없음 → `dissent.minority`
**실패 조건**: 분류 누락 (전부 minority로 빠짐)

### C. Topic 추출 + Jaccard

### HU-11 · `## Decision` heading + bullet 추출 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T7`
**절차**: `extractTopics(planText, "h1")` 호출, 3개 섹션 (Decision/Reasons/Risks) 입력
**기대**: 반환 topics에 `kind: decision`, `kind: reason`, `kind: risk` 모두 존재. Decision 본문이 단일 라인이어도 (예: "A") topic으로 채집됨
**실패 조건**: Decision 섹션 누락 (heading-only 케이스)

### HU-12 · topicKey 100자 cap + 첫 문장 추출 (Draft 2 §3.1) 🅼 R
**절차**: bullet "Long sentence with multiple clauses. Followed by another sentence about details, expanded over several lines to exceed 100 chars" 1개로 `extractTopics`
**기대**: `topicKey` 길이 ≤ 100, 첫 마침표 전까지만 키, body는 전체 텍스트 보존
**실패 조건**: topicKey 100자 초과 또는 중간 sentence 잘못 선택

### HU-13 · normalizeTokens stopword 제거 + length≥2 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T7b`
**절차**: `normalizeTokens("the and a foo bar")` 호출
**기대**: 반환 `["foo", "bar"]` (the/and/a 제거, "a"는 length<2 제외)
**실패 조건**: stopword 포함 또는 single-char 포함

### HU-14 · Jaccard 대칭 + 빈셋 처리 🅐 R
**자동화**: `cerberus-consensus.test.mjs:T7b`
**절차**: `jaccard(a,b) === jaccard(b,a)`, `jaccard([],[]) === 1`, `jaccard([],["x"]) === 0`
**기대**: 모두 PASS
**실패 조건**: 대칭 깨짐 또는 빈셋이 0 반환 (단일-글자 Decision 처리 함정과 직결)

### D. MCP 서버 5 tools

### HU-15 · `tools/list` → 5개 tool + inputSchema 검증 🅼 S
**절차**: stdio JSON-RPC로 서버에 `initialize` + `notifications/initialized` + `tools/list` 시퀀스 전송
**기대**: 응답에 `init`, `consensus`, `status`, `list`, `inspect` 5개 도구. `consensus.inputSchema.properties.plans.minItems === 3 && maxItems === 3` 확인
**실패 조건**: 도구 누락 또는 plans 크기 제약 누락

### HU-16 · `init` → run_id + agents[3] + state_dir 생성 🅼 S
**절차**: `tools/call init` with `task="smoke"` and `scope="head"` 호출 → 응답 검증, `~/.claude/codex-on-claude/cerberus/runs/<run_id>/plan.json` 존재 확인
**기대**: run_id 형식 `^\d{8}T\d{6,9}Z-[0-9a-f]{6}$`, `agents.length === 3`, `head_prompts.length === 3`, plan.json `phase === "awaiting_heads"`
**실패 조건**: 디렉토리 미생성, run_id 충돌 (같은 ms에 2개 호출 시 동일 ID)

### HU-17 · `init scope="full"` → 명시적 에러 🅼 S
**절차**: `tools/call init` with `scope="full"` 전송
**기대**: 응답 `error.message`에 `disabled in v0.5.1` 포함, run 디렉토리 미생성
**실패 조건**: full로 run 시작됨 → 미구현 모드로 진입

### HU-18 · `inspect` → 전체 raw 데이터 🅼 S
**절차**: init → consensus 1 cycle → `tools/call inspect` 호출
**기대**: 응답에 `plan`, `plans.h{1,2,3}`, `consensus`, `events[]` 모두 포함. events 배열에 최소 2건 (`init`, `consensus`)
**실패 조건**: 누락 필드 또는 events.jsonl 파싱 실패

### E. 설치 산출물

### HU-19 · manifest.cerberusAgents 3개 + 파일 존재 🅐 R
**자동화**: `cerberus-install.test.mjs:M4`
**절차**: `install/manifest.json` 의 `cerberusAgents` 배열 + 각 `source` 경로 존재 확인
**기대**: 길이 3, name=`cerberus-h{1,2,3}-*`, 모든 source 파일이 `install/components/agents/` 아래 존재
**실패 조건**: source 누락 또는 잘못된 path

### HU-20 · H1/H2/H3 tools allowlist 격리 검증 🅐 R
**자동화**: `cerberus-install.test.mjs:ISO1, ISO2, ISO3`
**절차**: 3 agent의 frontmatter `tools` 라인 파싱
**기대**: H1 ⊅ `mcp__codex__*`, H2 ⊅ `Bash/Edit/Write`, H3 ⊃ `mcp__codex__codex` + `Bash`
**실패 조건**: 격리 약화 (H1이 codex 호출 가능, H2가 임의 명령 실행 가능)

---

## Head 모드 복합 (HC-01 ~ HC-10)

### A. opt-in 토글 라이프사이클

### HC-01 · cerberus=off → on 전체 활성화 🅼 D
**전제**: 현재 `cerberus=off`
**절차**:
1. `codex-on-claude reconfigure --cerberus=on --yes`
2. `claude mcp list | grep cerberus`, `ls ~/.claude/skills/codex-cerberus/`, `ls ~/.claude/agents/cerberus-*.md`
**기대**: cerberus MCP `✓ Connected`, SKILL.md 존재, 3개 agent 파일 존재, config.json `choices.cerberus === "on"`
**실패 조건**: 산출물 일부 누락
**클린업**: `--cerberus=off --yes`로 원복

### HC-02 · cerberus=on → off (MCP 잔존 warn) 🅼 D
**전제**: 현재 `cerberus=on`
**절차**: `codex-on-claude reconfigure --cerberus=off --yes`
**기대**: SKILL.md + 3 agents 제거, stdout에 `cerberus=off but the cerberus MCP server is still registered. Remove with: claude mcp remove cerberus -s user` warn 출력, MCP는 등록 상태 유지 (사용자 의도적 결정)
**실패 조건**: warn 미출력 또는 MCP가 자동 제거 (cross-project 영향)

### HC-03 · idempotent reconfigure 🅼 R/D
**전제**: 현재 `cerberus=on`
**절차**:
1. config.json sha 캡처
2. 같은 flag로 reconfigure 2회 반복
3. config.json sha 비교
**기대**: 2회 반복 후에도 `choices.cerberus` semantic 동일 (`updatedAt`은 제외하고 비교), Skill/Agent 파일 sha 동일
**실패 조건**: 반복마다 차이 발생 → 의도치 않은 부수효과

### B. 실제 task end-to-end

> **HC-04/05/06 nondeterminism 주의 (Draft 3)**: 아래 3개 시나리오는 live LLM 응답에 의존하므로 PASS/FAIL이 model variance를 반영할 수 있음. 정밀 검증이 필요하면 별도 fixture-replay (3개 인공 plan markdown을 `mcp__cerberus__consensus`에 직접 입력) 시나리오로 보강 권장 (HU-31 후보 — 신규).

### HC-04 · 합의 task → moderate 이상 agreement (fixture-replay 권장) 🅼 D
**전제**: cerberus=on, 사용자 세션
**절차**: `/cerberus head "Choose between (A) deterministic merge and (B) LLM-judge for consensus"`
**기대**: 응답에 `Cerberus consensus (run: ..., agreement: 0.XX, label: moderate|high)` 라인, Decision 섹션에 단일 답변(A or B), Reasons 3+, **agreement_score ≥ 0.4** (moderate floor — high는 nondeterministic). 실제 PoC 데이터에서 0.43 score(Decision 일치 + reason 분산)가 multiplier 적용 후 0.65 moderate로 안정화됨을 참고.
**실패 조건**: 합의 plan 없이 raw 3 plan만 나열, score < 0.4 (low), Decision 섹션 비어있음

### HC-05 · Decision 갈리는 task → case 2 tournament 가시화 🅼 D
**전제**: cerberus=on
**절차**: `/cerberus head "Choose: rewrite in Rust, port to Go, or stay in Node"`
**기대**: Decision tournament 동작 (3 head 답이 갈리면 score 낮고 label=moderate/low), Dissent.disputed 섹션 표시, 어느 head가 어떤 선택을 했는지 명시
**실패 조건**: 강제 merge로 단일 답이 나오고 dissent가 비어 있음

### HC-06 · 모호한 task → case 4 풍부 🅼 D
**절차**: `/cerberus head "Look at this codebase and tell me what's off"`
**기대**: Reasons/Risks 섹션 모두 case 4 항목 다수 (각 head별 unique 관찰), label=low/moderate, dissent.validated 다수
**실패 조건**: 빈약한 Reasons (case 4 보수적 채택 실패)

### C. 장애 + 격리

### HC-07 · 한 head 실패 → 실패 stub 포함 3-plan consensus (Draft 3) 🅼 D
**전제**: cerberus=on. **변경 근거**: MCP 스키마는 `plans` 길이=3 강제 (HU-15). 따라서 한 head 실패 시 Skill prose가 실패 본문을 stub plan으로 packaging하여 길이 3 contract 유지.
**절차**:
1. `/cerberus head "<task>"` 호출
2. 도중에 H2 agent가 실패 (`CODEX_QUOTA_FALLBACK_NEEDED` 또는 timeout)
3. Skill이 실패를 stub plan으로 변환: `{head:"h2", plan:"H2_FAILED: <reason>", tokens:0, elapsedMs:0}`
4. `mcp__cerberus__consensus(run_id, plans=[h1_real, h2_stub, h3_real])` 호출
**기대**: consensus가 stub의 빈약한 토픽들을 case 4(minority)로 분류, h2의 contribution이 거의 0이라 score는 case 3 분포에 가까운 패턴. response footer에 `H2 failed` 명시. plans 배열은 정확히 3.
**실패 조건**: Skill이 plans=[h1,h3] (length 2) 직접 호출 → MCP 스키마 위반으로 즉시 에러

### HC-07b · (선택) 2-plan consensus contract 완화 시 — 시나리오 후보 🅼 PENDING-SPEC
**Status**: 현 v0.5.1 spec은 plans=3 강제. 향후 `plans.minItems: 2` 완화가 결정되면 본 시나리오 활성화.
**의도**: stub 없이 `plans=[h1, h3]`로 직접 consensus 호출 → case 3 자연 분류
**조건**: spec §2.2 + MCP zod schema + HU-15 동시 갱신 후 검증

### HC-08 · H1 격리 실제 강제 🅼 D
**전제**: cerberus=on, Claude Code 활성 세션
**절차**: H1 agent가 prompt 내에서 `mcp__codex__codex` 도구 호출 시도 (예: 의도적 prompt injection)
**기대**: Claude Code의 `tools` allowlist가 차단 → 도구 호출 실패, H1은 자체 추론으로만 plan 생성. 시스템 로그 또는 agent 응답에 거부 흔적
**실패 조건**: H1이 codex 호출 성공 → 격리 무효화

### D. 비용 + 상태 영속화

### HC-09 · cost cap 50k 초과 시 (책임 경계 명시, Draft 3) 🅼 D
**전제**: cerberus=on. **책임 분리** — server는 `cost_remaining` 숫자만 반환 (현 구현, `cerberus-server.mjs:toolConsensus`), `(cost cap reached)` footer는 **Skill prose**가 사용자 출력 시 첨부 (codex-cerberus/SKILL.md). 두 layer 분리 검증.
**절차**: 3 head 모두 토큰 합 50k 초과한 plans로 `mcp__cerberus__consensus` 호출 + 별도로 Skill 트리거 시뮬레이션
**기대 (server layer)**: 응답에 `cost_used_tokens >= 50000`, `cost_remaining: 0`. consensus_plan markdown 자체에는 footer 부재 (server 책임 아님).
**기대 (Skill layer)**: Skill이 server 응답을 받아 사용자 출력 시 agreement 라인 끝에 `(cost cap reached)` footer 추가.
**실패 조건**: server가 footer 직접 쓰거나 (책임 경계 침범), Skill이 cost_remaining=0 무시

### HC-10 · 동일 run_id 재consensus 호출 → idempotent 🅼 D
**전제**: cerberus=on, run_id 1개 보유
**절차**: 같은 run_id로 `consensus` 2회 호출, 두 번째는 약간 다른 plans
**기대**: `consensus.json` 마지막 결과로 덮어쓰기, events.jsonl에 두 번째 `consensus` 이벤트 추가 라인, plan.json `updatedAt` 갱신
**실패 조건**: 중복 호출 거부 또는 events 누락

---

## Full 모드 단위 (FU-01 ~ FU-10) — **PENDING-IMPL**

> 본 섹션의 시나리오는 모두 Cerberus Full 모드 미구현 상태. 향후 Full 구현 시 회귀 가드로 변환.
> 현 시점 `mcp__cerberus__init({scope:"full"})`은 명시적 에러 → 이 시나리오들은 실제 실행하면 모두 FAIL (의도된 동작).

### A. Execute consensus

### FU-01 · 3 worktree 격리 + diff 생성 PENDING-IMPL S
**의도**: 합의된 plan 받아 H1/H2/H3 각자 `Agent({isolation:"worktree"})`로 격리 worktree에서 plan 구현 → 3 diff 산출
**검증할 항목**: 각 worktree가 시작 sha 동일, 끝 sha 다름, head 간 worktree 디렉토리 비교차

### FU-02 · diff merge 알고리즘: 같은 파일 동일 변경 → merged, 충돌 → tournament PENDING-IMPL R
**의도**: consensus algorithm의 diff 버전. file:line 단위로 같은 변경 → merge, 다른 변경 → head 가중치 tournament
**검증할 항목**: 3-way merge 결정성 (같은 입력 → 같은 출력 diff), conflict 카운트, h3 우선 tie-break

### FU-03 · file path allowlist 강제 PENDING-IMPL S
**의도**: codex-fix 패턴 차용 — `/cerberus full --paths=a.js,b.js`로 시작 시 allowlist 외 파일 변경 거부
**검증할 항목**: allowlist 외 변경 시도 시 execute phase에서 거부, 또는 verify phase에서 FAIL 라벨

### FU-04 · execution rollback: verify 실패 시 worktree 초기화 PENDING-IMPL D
**의도**: verify가 FAIL 반환하면 worktree를 origin sha로 리셋 + events.jsonl `rollback` 이벤트 기록
**검증할 항목**: rollback 후 worktree git status clean, events에 rollback 이벤트 1건

### B. Verify consensus

### FU-05 · 3 head 각자 검증 → 합의 PENDING-IMPL S
**의도**: 각 head가 execute 산출물에 대해 test/lint/manual review 수행 → verdict 3개
**검증할 항목**: 3개 verdict 합의 알고리즘 (PASS/FAIL/PARTIAL 3-state 머지)

### FU-06 · verify 충돌: PASS/FAIL/PARTIAL → 보수적 FAIL PENDING-IMPL R
**의도**: 만장일치 PASS만 PASS, 한 head라도 FAIL이면 전체 FAIL (보수적)
**검증할 항목**: 진리표 (PASS,PASS,PASS) → PASS, (PASS,FAIL,PASS) → FAIL, (PASS,PARTIAL,PASS) → PARTIAL

### FU-07 · verify 산출물 비교 (artifact diff Jaccard) PENDING-IMPL S
**의도**: 각 head가 test output, log, artifact 등 산출. Jaccard로 비교하여 sim 측정
**검증할 항목**: 동일 코드에 대해 3 head test 결과 동일 → sim=1, 다르면 < 1, dissent 가능

### FU-08 · verify timeout PENDING-IMPL S
**의도**: 한 head의 verify가 long-running (>5분) → timeout + 그 head는 missing 처리
**검증할 항목**: timeout 라벨, missing head 표기, 나머지 2 head로 case 3 진행

### C. Iteration loop

### FU-09 · verify FAIL → re-plan trigger + new run_id PENDING-IMPL D
**의도**: verify가 FAIL이면 dissent + failure detail을 입력으로 새 plan 사이클 시작. new run_id는 `parentRunId` 필드로 이전 run 연결
**검증할 항목**: 부모-자식 run_id 관계 events.jsonl/index.json 모두 기록

### FU-10 · maxIterations=3 도달 → cap reached 응답 PENDING-IMPL D
**의도**: 3회 반복 후에도 verify FAIL → `iteration cap reached` 응답 + 마지막 시도 산출물 보존 (자동 폐기 금지)
**검증할 항목**: 마지막 worktree 보존, response에 명시적 cap 라벨, 사용자에게 manual review 안내

---

## Full 모드 복합 (FC-01 ~ FC-05) — **PENDING-IMPL**

### FC-01 · Plan → Execute → Verify (성공) end-to-end PENDING-IMPL D
**의도**: 작은 task ("rename foo to bar in single file")로 Full 사이클 전체 1회 수행 → 최종 PASS
**검증**: 3 phase 모두 events.jsonl 기록, consensus.json 3개(plan/exec/verify) 모두 존재, 사용자에게 단일 머지된 diff 반환

### FC-02 · Plan → Exec → Verify FAIL → Re-Plan → ... PASS PENDING-IMPL D
**의도**: 의도적으로 첫 plan이 부족 (테스트 누락 등) → verify FAIL → 자동 re-plan → 두 번째 cycle PASS
**검증**: 2개 run_id 연결 (parentRunId), 두 번째 cycle에서 추가된 step (테스트 추가) 반영

### FC-03 · chain-execute: head 산출물 위에 빌드 PENDING-IMPL D
**의도**: H1이 인터페이스 정의 → H2가 그 위에 구현 → H3가 통합. 직렬 dependency
**검증**: head 간 worktree 공유 또는 stash 패턴, 산출 diff 순서대로 누적

### FC-04 · worktree 머지 충돌 시 사용자 위임 PENDING-IMPL D
**의도**: 3 head diff가 같은 파일 같은 라인을 다르게 변경 → tournament로도 결정 불가 → 사용자에게 conflict marker로 제시
**검증**: response에 `MERGE_CONFLICT` 라벨 + 충돌 파일 목록 + 각 head 버전 인용

### FC-05 · 비용 cap mid-iteration abort + 부분 산출물 보존 PENDING-IMPL D
**의도**: iteration 2에서 비용 cap 초과 → 즉시 abort, iteration 1의 산출물은 보존
**검증**: events.jsonl `cost_cap_abort` 이벤트, 마지막 성공 iteration의 worktree 보존 안내

---

## 실행 순서 권장

| 우선순위 | 범위 | 소요 |
|---------|------|------|
| 스모크 | HU-01, HU-15, HU-16, HC-01, HC-04 | ~10분 |
| 풀 단위 (Head) | HU-01 ~ HU-20 | ~1시간 (자동화 14건 포함 시 30분) |
| 풀 복합 (Head) | HC-01 ~ HC-10 | ~3시간 (사용자 세션 트리거 필요한 8건) |
| Full 회귀 (PENDING-IMPL) | FU-01 ~ FU-10, FC-01 ~ FC-05 | Full 구현 후 약 1일 |
| 리그레션 픽 (diff 발생 시) | HU-04, HU-15, HU-20, HC-01, HC-02, HC-08 | ~30분 |

## 자동화 ↔ 시나리오 매핑 (Draft 3 — Cerberus self-review로 정정)

| 자동화 테스트 | 커버 시나리오 ID | 커버 수준 |
|--------------|----------------|----------|
| `cerberus-consensus.test.mjs:T1,T1b` | HU-01 | **full** |
| `cerberus-consensus.test.mjs:T2` | HU-02 | full |
| `cerberus-consensus.test.mjs:T2b` | HU-03a (부분) | **partial** — case 3 분류만, disputed 비어있음 단언 미포함 |
| `cerberus-consensus.test.mjs:T3` | HU-05 fixture C (high) | **partial** — 0.7/0.6999/0.4/0.3999 boundary 미커버 |
| `cerberus-consensus.test.mjs:T3b` | HU-04 (부분) | **partial** — 범위만 체크, cap with boosted multiplier 단언 미포함 |
| `cerberus-consensus.test.mjs:T4` | HU-09a | full |
| `cerberus-consensus.test.mjs:T5` | HU-09b | full |
| `cerberus-consensus.test.mjs:T6/T6b/T6c` | (입력 검증) | full |
| `cerberus-consensus.test.mjs:T7` | HU-11 | full |
| `cerberus-consensus.test.mjs:T7b` | HU-13, HU-14 (부분) | **partial** — stopword 제거 + 빈셋 명시 단언 보강 필요 |
| `cerberus-consensus.test.mjs:T8` | HU-08 (부분) | **partial** — bucket key 존재만, case-3 missing 동작 단언 미포함 |
| `cerberus-install.test.mjs:M1-M5` | HU-19 (부분) | **partial** — manifest path 검증만, 파일 실재 확인 필요 |
| `cerberus-install.test.mjs:ISO1-4` | HU-20 | full |
| `cerberus-install.test.mjs:SKILL1,2,PAT1` | (Skill prose 가드, 회귀용) | full |

**🅐 라벨 정확화**: Draft 2에서 🅐로 표기된 HU-03/04/05/06/08/13/14/19는 부분 커버. 향후 `cerberus-consensus.test.mjs`에 다음 assertion 추가 시 full 승격:
- HU-04 cap: `consensus(fixture_full_case1).agreement_score === 1.0` 명시
- HU-05 boundary: rawScore 4점(0.4/0.3999/0.7/0.6999) fixture 4건
- HU-08 case 3: `dissent.missing[].missingHead === "h2"` 단언
- HU-13/14: `normalizeTokens("the and a foo")` → `["foo"]`, `jaccard([],[]) === 1` 명시 단언
- HU-19: `fs.access(source)` resolves OK 추가

## Draft 3 정정 요약 (Cerberus self-review 결과)

| Issue | Before (Draft 2) | After (Draft 3) |
|-------|------------------|----------------|
| HU-03 spec 모순 (case 3 vs tournament) | 단일 카드 | HU-03a (case 3) + HU-03b (case 2) split |
| HU-09 reason 미명시 | 통합 (risk+reason) | HU-09a (risk) + HU-09b (reason) split + spec §3.3 명시 |
| HC-07 plans=2 vs HU-15 plans=3 충돌 | 직접 모순 | stub plan 패턴으로 length=3 유지 + HC-07b 후보 |
| HC-04 score 임계 (PoC vs spec) | "≥0.7 high" 기대 | "≥0.4 moderate floor" + fixture-replay 권장 |
| HC-09 footer 책임 경계 모호 | "consensus_plan footer" | server (cost_remaining) + Skill prose (footer) 분리 |
| AUTO 라벨 over-claim | 14건 모두 full | partial 마킹 (HU-03/04/05/08/13/14/19) + 보강 항목 명시 |
| **신규 자동화 후보** | HU-07, HU-10, HU-12, HU-17, HU-18 |

## 합격 보고 템플릿

각 시나리오 결과를 다음 형식으로 기록 (별도 보고서 파일 `docs/test-execution-results-cerberus-v0.5.1.md` 권장):

```
[HU-XX] PASS/FAIL/PENDING-IMPL — <한 줄 요약>
  실제: <관찰된 값>
  기대: <명시된 PASS 조건>
  증거: <로그/파일 경로>
```

Head 모드 30건 PASS, Full 모드 15건 PENDING-IMPL이 v0.5.1 시점의 정상 상태. Head에서 1건이라도 FAIL이 발생하면 `feedback_skill_actual_vs_documented` 또는 `feedback_backup_outside_state_dir` 류 메모리 갱신 후 fix 진행.
