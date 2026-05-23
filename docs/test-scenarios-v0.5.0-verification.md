# codex-on-claude v0.5.0 — 테스트 시나리오 (검증용)

**작성일**: 2026-05-22
**대상 버전**: v0.5.0 (28건 hardening 반영본)
**용도**: 사용자 환경(`~/.claude/`)에 설치된 v0.5.0이 CHANGELOG와 1:1로 일치하는지 검증

- 단위 테스트(U-01 ~ U-20): 단일 기능, 5분 내 실행, 결정적 PASS/FAIL
- 복합 테스트(C-01 ~ C-10): 긴 컨텍스트 / 다단계 / 통합 흐름, 10~30분 소요

표기:
- `🅰` = `~/.claude/`(글로벌)에 설치된 산출물 검증
- `🅿` = 패키지 소스(`/Volumes/.../codex-on-claude/install/`)에 대한 검증
- `🅴` = 외부 테스트 하니스(`/Volumes/P31/after-init/codex-on-claude-test/`) 사용

---

## 단위 테스트 (Unit Tests) — 20건

### U-01 · config.json 신규 필드 존재 검증 🅰
**카테고리**: 설치 산출물 / 마이그레이션
**전제**: v0.4.1 → v0.5.0 업그레이드 직후
**절차**:
1. `cat ~/.claude/codex-on-claude/config.json | jq '.choices | {usageMode, autoTier2LLMProbe, guardrails}'`
**기대**:
- `usageMode == "synergy"`
- `autoTier2LLMProbe == true`
- `guardrails == {chainJsonTrap:"hard-block", subagentStrict:"hard-block", turnBurn:"3-turn-stop", ceilingNoUpside:"warn-and-skip"}`
**실패 조건**: 4필드 중 하나라도 누락 또는 다른 값

---

### U-02 · 사일런트 마이그레이션 (묻지 않고 채우기) 🅿🅴
**카테고리**: 마이그레이션 정책
**전제**: 깨끗한 테스트 환경에서 0.4.1 config만 가진 상태 (`usageMode`, `autoTier2LLMProbe` 키 없음)
**절차**:
1. 테스트 하니스에서 `usageMode/autoTier2LLMProbe`를 의도적으로 빼고 0.4.1 config 작성
2. `npx codex-on-claude@0.5.0` 비대화형(`--yes`) 모드로 실행
**기대**:
- stdout에 `· usageMode: silent default "synergy" applied for upgrade` 라인 출력
- 사용자에게 묻지 않음
- 결과 config에 `usageMode:"synergy"`, `autoTier2LLMProbe:true` 추가됨

---

### U-03 · 명시적 reconfigure는 사일런트 적용 안 함 🅴
**카테고리**: 마이그레이션 정책 (대화형 분기)
**전제**: U-02 직후 또는 이미 v0.5.0 config 보유
**절차**:
1. `codex-on-claude reconfigure` 실행 (대화형)
**기대**:
- §7에서 `usageMode` 질문이 인터랙티브로 노출됨 (4지선다)
- §8에서 `autoTier2LLMProbe` 질문이 노출됨 (auto 선택 시에만 활성)
- "(was: (none)) ← changed" 마커는 더 이상 표시되지 않음

---

### U-04 · `usageMode=none` 시 PreToolUse gate 설치 🅰
**카테고리**: gate hook
**절차**:
1. `codex-on-claude reconfigure --usage-mode=none --yes`
2. `jq '.hooks.PreToolUse' ~/.claude/settings.json`
**기대**:
- `PreToolUse` 배열에 매칭 패턴 2종 이상 등록: `mcp__codex__.*` 와일드카드 + `Bash`
- 각 hook의 command가 `codex-on-claude gate --from-stdin --enforce-mode=none`로 끝남
- `_coc.marker == "codex-on-claude:gate"` 메타 포함

**클린업**: `codex-on-claude reconfigure --usage-mode=synergy --yes` 로 원복

---

### U-05 · `usageMode≠none` 시 gate 미설치 🅰
**카테고리**: gate hook (네거티브)
**절차**:
1. `usageMode=synergy` 상태에서 `jq '.hooks.PreToolUse // []' ~/.claude/settings.json`
**기대**: 빈 배열 또는 codex-on-claude marker가 붙은 entry가 0개
**근거**: CHANGELOG "PreToolUse gate hook은 usageMode === 'none'일 때만 설치"

---

### U-06 · gate JSON 결정 셰이프 — 듀얼 출력(H1) 🅴
**카테고리**: hook 호환성
**절차**:
1. `echo '{"tool_name":"mcp__codex__codex","tool_input":{}}' | codex-on-claude gate --from-stdin --enforce-mode=none`
**기대 stdout**(JSON 1줄):
- 레거시 키: `decision == "block"`, `reason` 문자열 존재
- 신규 키: `hookSpecificOutput.hookEventName == "PreToolUse"`, `permissionDecision == "deny"`, `permissionDecisionReason` 존재
- 종료 코드 0 (B3: exit 2 제거됨, 단 stderr backstop은 먼저 기록)

---

### U-07 · Bash gate — 쉘 래퍼 우회 탐지(B4) 🅴
**카테고리**: 보안 / Bash 매처 정확도
**절차**: 다음 6개 입력을 각각 gate에 stdin으로 흘림 (모두 `usageMode=none`)
```
eval "codex exec --sandbox=read-only ./README.md"
sh -c 'codex exec hello'
bash -lc "codex exec hello"
env CODEX_HOME=/tmp codex exec hello
$(codex exec --json)
foo && codex exec hello
```
**기대**: 6건 모두 `decision == "block"`

---

### U-08 · Bash gate — 인자 위치 false-positive 없음(H1 Bash 정밀도) 🅴
**카테고리**: 보안 / Bash 매처 정확도 (네거티브)
**절차**: 다음 입력을 각각 gate에 흘림
```
grep codex README.md
cat codex.md
find . -name "*codex*"
echo "var codex = 1"
git log --grep=codex
```
**기대**: 5건 모두 `decision != "block"` (허용)

---

### U-09 · detect-signals — 숫자 체인 탐지 🅴
**카테고리**: Tier 1 휴리스틱
**절차**:
1. `node ~/.claude/codex-on-claude/install/detect-signals.mjs <<< "1. Read the file. 2. Refactor. 3. Add tests."`
**기대**: `signals.chainStrict == true`, `confidence >= 0.8`

---

### U-10 · detect-signals — 다형 체인 탐지 🅴
**카테고리**: Tier 1 휴리스틱
**절차**: 아래 4개 패턴 각각 입력
```
A. Read  B. Refactor  C. Test
first ... then ... finally ...
Step 1 ... Step 2 ... Step 3
- [ ] Read - [ ] Refactor - [ ] Test
```
**기대**: 4건 모두 `signals.chainStrict == true`

---

### U-11 · detect-signals — STRICT_FIELD_LIST 임계값 ≥4 (M1) 🅴
**카테고리**: Tier 1 휴리스틱 (네거티브 정밀도)
**절차**:
1. `"Add fields: foo, bar, baz to the response"` → fields 3개
2. `"Add fields: foo, bar, baz, qux"` → fields 4개
**기대**:
- 입력 1: `strictOutput == false`
- 입력 2: `strictOutput == true`

---

### U-12 · detect-signals — 적대적 정밀도(H3) 🅴
**카테고리**: Tier 1 휴리스틱 (네거티브)
**절차**: 다음 3개 입력
```
Find naming issues in the codebase
Find open issues in GitHub
Find edge cases in the spec
```
**기대**: 3건 모두 `adversarial == false` (STRONG defect token 없음)
**추가 검증**: `"Find security bugs"` / `"Find race conditions"` → `adversarial == true`

---

### U-13 · detect-signals — strict-output 포맷 다양성 🅴
**카테고리**: Tier 1 휴리스틱
**절차**: 4개 입력
```
Return JSON: { "foo": "bar" }
Output YAML with keys foo, bar
Return CSV with columns id,name,score,total
Define a TypeScript schema: type Foo = { bar: string }
```
**기대**: 4건 모두 `strictOutput == true`

---

### U-14 · auto-probe — 로그 적재 형식 🅰
**카테고리**: Tier 2 LLM probe
**전제**: `usageMode=auto`, codex CLI 정상
**절차**:
1. 모호한 프롬프트로 auto-probe 호출 1회 트리거
2. `tail -1 ~/.claude/codex-on-claude/logs/auto-probe.jsonl | jq .`
**기대**: 다음 필드 모두 존재 — `event`, `timestamp`, `latencyMs`, `classification`, `confidence`, `inputHash`

---

### U-15 · auto-probe — codex CLI 부재 시 fail-open 🅴
**카테고리**: Tier 2 LLM probe (장애 내성)
**절차**:
1. `PATH=/usr/bin node ~/.claude/codex-on-claude/install/auto-probe.mjs "test"` (codex 미발견 PATH)
**기대**:
- 종료 코드 0
- stdout JSON `{ "fallback": true, "reason": "codex-cli-missing" }`
- Tier 1 결과로 fall-through

---

### U-16 · mergeClassification — mode=max 라우팅(H4) 🅴
**카테고리**: 모드별 라우팅 일관성
**절차**: Tier 1이 chain-strict 분류, Tier 2가 동일 분류로 합의되는 경우를 시뮬레이션
1. `mergeClassification(tier1{chainStrict}, tier2{chainStrict}, mode="max")` 호출
2. `mergeClassification(..., mode="synergy")` 호출
**기대**:
- max: route == `"R4-gamma-hot-swap"`
- synergy: route == `"R6-format-safe-handoff"` (default)
- 두 호출이 Tier 1 단독 라우팅(applyDecisionTree)과 동일한 결과를 내야 함

---

### U-17 · 원자적 쓰기 — tmp 누수 방지(A3) 🅴
**카테고리**: 안전성
**절차**:
1. `~/.claude/codex-on-claude/` 부모 디렉터리를 일시적으로 read-only로 변경
2. `writeJson()` 시도 (예: reconfigure trigger)
3. 디렉터리에서 `*.tmp-*` 파일 잔존 여부 확인
**기대**:
- 쓰기 실패는 catch되어 사용자에게 에러 출력
- `*.tmp-PID-TS` 잔존 파일 0건

**클린업**: 디렉터리 권한 원복

---

### U-18 · settings.json 손상 시 백업(H2) 🅴
**카테고리**: 안전성
**절차**:
1. `~/.claude/settings.json` 마지막 `}` 제거(문법 깨기)
2. `codex-on-claude reconfigure --yes` 실행
**기대**:
- stderr에 `SETTINGS_MALFORMED` 경고 출력
- `~/.claude/settings.json.corrupt-<ISO-timestamp>` 백업 파일 생성됨
- 사용자의 기존 설정이 빈 `{}`로 덮어쓰이지 않음

---

### U-19 · uninstall — 양쪽 agent 모두 제거(A1) 🅰
**카테고리**: 설치/제거 라이프사이클
**전제**: primary + fallback agent 둘 다 설치된 v0.5.0 상태
**절차**:
1. `ls ~/.claude/agents/codex-reviewer*.md` (사전 확인 — 2개)
2. `codex-on-claude uninstall --yes`
3. `ls ~/.claude/agents/codex-reviewer*.md`
**기대**:
- 사전: 2개 (primary + fallback)
- 사후: 0개 (둘 다 제거)
- `installed.agents` 배열 순회 로직이 작동했다는 stdout 로그 확인

**클린업**: 테스트 종료 후 `npx codex-on-claude@latest`로 재설치 (사용자 환경 복원)

---

### U-20 · Skill prose 템플릿 렌더링 🅰
**카테고리**: Skill 산출물
**절차**:
1. `grep -l "{{usageMode}}\|{{guardrail" ~/.claude/skills/codex-*/SKILL.md`
2. `head -30 ~/.claude/skills/codex-review/SKILL.md`
**기대**:
- 출력 결과 0건(즉, 미치환 placeholder 없음 — 모두 실제 값으로 렌더링됨)
- `## Usage mode (v0.5.0)` 섹션이 SKILL.md 상단에 존재
- `synergy` 분기 텍스트가 실제로 보임 (현재 모드와 일치)

---

## 복합 / 긴 컨텍스트 시나리오 (Composite) — 10건

### C-01 · 4-모드 라운드트립(none → synergy → auto → max → synergy)
**소요**: ~15분 · **컨텍스트**: 짧음 (CLI 위주)
**목적**: 모드 전환의 부작용(hook drift, 산출물 누락)이 누적되지 않음을 보장
**단계**:
1. `--usage-mode=none --yes` → gate hook 2개 설치 확인 (U-04)
2. `--usage-mode=synergy --yes` → gate hook 제거 + auto-log hook 유지 확인
3. `--usage-mode=auto --yes` → autoTier2LLMProbe 인터랙티브 토글 노출 확인
4. `--usage-mode=max --yes` → SKILL.md preamble이 "Hard DO-NOT rules still enforced"로 갱신
5. `--usage-mode=synergy --yes`로 복원 → 최종 state diff == 시작 state
**합격 기준**:
- 4회 전환 후 `~/.claude/settings.json` 의 codex-on-claude marker가 정확히 3개(PostToolUse 2 + PreToolUse 0)
- B5 보장: 수동으로 추가한 가짜 marker가 있어도 마지막 단계에서 정리됨

---

### C-02 · synergy R1 리뷰 풀 플로우(threadId 연속성)
**소요**: ~10분 · **컨텍스트**: 긴 diff(~500 lines)
**목적**: Skill → Agent → MCP call → 로그 → catalog 의 5단계 체인이 끊김 없이 작동
**단계**:
1. 임의 PR 또는 `git stash` 변경 준비
2. Claude Code에서 `/codex-review` 호출 → codex-reviewer agent로 위임 확인
3. 응답 끝줄 `Thread: <id>` 추출
4. `cat ~/.claude/codex-on-claude/threads/catalog.json | jq` → 해당 threadId entry 존재 + `title/tags/lastUsed` 갱신
5. `tail -1 ~/.claude/codex-on-claude/logs/usage.jsonl` → PostToolUse 자동 로그가 동일 threadId로 기록
6. 같은 세션에서 `/codex-followup "rationale for finding #2"` → 동일 threadId로 이어짐
**합격 기준**: 6단계 모두에서 threadId가 정확히 동일

---

### C-03 · auto 모드 Tier 1→Tier 2 에스컬레이션
**소요**: ~10분 · **컨텍스트**: 모호 프롬프트 1개
**목적**: 신뢰도 < 0.7 임계가 실제로 Tier 2를 트리거하고 결과 머지가 정확함을 검증
**단계**:
1. `usageMode=auto`, `autoTier2LLMProbe=on`
2. Tier 1만으로 분류 모호한 프롬프트 입력: `"Look at this and tell me what's off"` (체인/strict/adversarial 모두 약함)
3. `tail -F ~/.claude/codex-on-claude/logs/auto-probe.jsonl` 모니터
4. 프롬프트 처리 후 probe 로그 1줄 추가 확인
5. 최종 라우팅이 Tier 1 단독과 다른지(또는 confidence가 올라갔는지) 검증
**합격 기준**:
- probe 로그 latencyMs > 0, classification 유효
- `event == "tier2-merge"` 1건 추가됨
- $0.01~$0.02 비용 (대략 totalTokens 약 800~1500)

---

### C-04 · max 모드 + Chain-JSON Trap 가드레일
**소요**: ~5분 · **컨텍스트**: 긴 적대적 프롬프트
**목적**: max 모드가 가드레일을 override 하지 않음(P5 catastrophe 방어 유지) 검증
**단계**:
1. `usageMode=max`
2. 프롬프트: `"Adversarially review this auth flow AND return strict JSON {findings:[...], severity:'...'} per finding"` (R1 + strict-output 동시)
3. `/codex-review` 호출
**기대 라우팅**: **R4 γ hot-swap이 아니라 R6 Format-Safe Handoff** (Codex가 prose 출력, Claude가 JSON 정규화)
**합격 기준**:
- 응답 텍스트에 R6 마커(예: "Format normalization by Claude") 또는 SKILL.md 분기 흔적 확인
- guardrails.chainJsonTrap = `"hard-block"` 이 max에서도 enforce됨을 로그/응답에서 확인

---

### C-05 · none 모드 4중 봉쇄
**소요**: ~10분 · **컨텍스트**: 다양한 우회 시도
**목적**: PreToolUse gate가 MCP 경로뿐 아니라 Bash 우회까지 모두 차단함
**단계**: `usageMode=none` 상태에서 다음 4개 경로로 codex 호출 시도
1. `/codex-review` (Skill 경유 mcp__codex__codex)
2. 직접 MCP 호출 (`mcp__codex__codex-reply` with known threadId)
3. Bash로 `codex exec --json hello`
4. eval 우회 `eval "$(printf 'codex exec hello')"`
**기대**:
- 4건 모두 차단 + 각각의 `permissionDecisionReason` 텍스트에 모드명("none") 포함
- 동시에 codex-log / codex-threads Skill은 정상 작동 (로컬 파일만 만짐 → CHANGELOG의 예외 조항)

---

### C-06 · 장기 스레드 + CLI 재시작 후 resume
**소요**: ~20분 · **컨텍스트**: 매우 김 (10~15 turn)
**목적**: codex-reply 세션이 서버 재시작으로 끊겨도 codex-resume Skill이 catalog 기반으로 컨텍스트 복구함을 검증
**단계**:
1. `/codex-review` 시작, 5턴 추가 followup으로 대화 누적 (~10턴, 컨텍스트 ~30KB)
2. threadId 기록 + catalog 확인
3. Claude Code 세션 종료 후 재실행
4. `/codex-resume <threadId>` 호출
5. Skill이 SILENT_NEW_SESSION 마커 확인 → 자동으로 catalog에서 goals/outcomes/decisions 주입 → 신규 세션을 시작했음을 명시
**합격 기준**:
- Skill 응답에 `SILENT_NEW_SESSION` 또는 "resumed via catalog rehydrate" 명시
- 새 threadId가 catalog에 `resumedFrom: <oldId>` 메타와 함께 추가
- 첫 응답이 이전 작업의 맥락을 정확히 참조함

---

### C-07 · 개선 루프 완주(auto-log → analyze → improve → drift)
**소요**: ~30분 (또는 1주일 백그라운드 데이터 누적) · **컨텍스트**: 길지 않으나 다세션 누적
**목적**: improvement loop의 데이터 → 인사이트 → 적용 → 검증 사이클이 폐쇄형으로 돈다
**단계**:
1. 자연 사용으로 20회 이상 mcp__codex__codex 호출 누적 (PostToolUse hook이 자동 로깅)
2. `/codex-analyze` → 후보 3건 이상 surface (token-efficiency, mode mismatch, repeated prompts 등)
3. 후보 1건 선택해 `/codex-improve N` 적용 → 실제 SKILL.md 또는 config 변경
4. `ruleUsageModeDrift` analyzer 재실행 → 변경 후 coherent 상태로 떨어졌는지 확인
**합격 기준**:
- analyze 출력에 사용된 입력 로그 라인 수가 ≥20
- improve 적용 전후 diff가 1개 파일에 국한
- drift rule이 "coherent" 또는 "no-drift" 상태로 갱신됨

---

### C-08 · codex-fix workspace-write + 파일 allowlist
**소요**: ~15분 · **컨텍스트**: 중간(수정 대상 2~3 파일)
**목적**: codex-fix Skill이 enforce하는 file scope가 실제로 작동(허용 외 경로 거부)
**단계**:
1. 임의 파일 2개 선정 (예: `install/utils.mjs`, `docs/usage-mode-config.md`)
2. `/codex-fix paths=install/utils.mjs,docs/usage-mode-config.md "rename foo() to bar()"` 호출
3. Codex가 의도적으로 allowlist 밖 파일을 수정하려 시도하는 prompt 변형 추가 ("also update README.md to mention bar()")
**기대**:
- 두 allowlist 파일은 수정됨 (`git diff --stat` 확인)
- README.md는 수정 시도 차단 또는 명시적 거절 응답
- Skill 응답 끝줄 `Thread: <id>` 및 edited file list 기록 확인

---

### C-09 · 모델 fallback 트립(opus → sonnet locked)
**소요**: ~10분 · **컨텍스트**: 큰 diff(opus 토큰 한도 트리거)
**목적**: rate-limit / capacity 시 primary → fallback 자동 전환 및 reasoning 등급 lock 동작
**단계**:
1. 일부러 opus 한도에 가까운 큰 입력 생성 (대형 PR diff 50KB+) 또는 `CLAUDE_FORCE_FALLBACK=1` 모의 환경변수 주입
2. `/codex-review` 호출 → 라우팅이 codex-reviewer-fallback agent로 전환됨을 stderr/응답에서 확인
3. 응답에 사용된 모델: `sonnet`, reasoning: `medium` (locked tier) 확인
**합격 기준**:
- agent 전환 marker (`CODEX_QUOTA_FALLBACK_NEEDED` 또는 동등 신호) 또는 정책 라우터 로그 확인
- fallback agent의 reasoning이 사용자가 설정한 primary(xhigh)가 아닌 **locked medium**임을 검증
- 결과 품질은 다소 낮을 수 있으나 빈 응답은 아님

---

### C-10 · codex-routine + cron + 다세션 누적
**소요**: 1주일(자연 경과) 또는 가속 모드 ~30분 · **컨텍스트**: 누적
**목적**: Routine으로 등록된 codex 작업이 cron으로 반복 실행되고, 누적 결과가 analyze에 피드됨
**단계**:
1. `/codex-routine create "daily review" template="/codex-review HEAD~1..HEAD" cron="0 9 * * *"`
2. routine entry가 `~/.claude/codex-on-claude/routines/*.json` 에 등록됨 확인
3. cron 실행(또는 `codex-on-claude routine run <id>` 강제 트리거) 7회
4. 누적 후 `/codex-analyze` 호출
**합격 기준**:
- routine 정의가 `template + cron + lastRunAt + runs[]` 구조로 저장됨
- 각 run마다 threadId가 catalog에 등록 (7개의 별개 threadId)
- analyze 출력에 routine 출처 호출이 명시적으로 grouping 됨(예: `source: routine/daily-review`)

---

## 실행 순서 권장

**스모크(15분)**: U-01, U-02, U-05, U-20, C-02
**풀 단위(2시간)**: U-01 ~ U-20 (병렬 가능 항목 묶음)
**풀 통합(반나절~1주)**: C-01 ~ C-10
**리그레션 픽**(diff 발생 시): U-04 / U-06 / U-07 / U-08 / U-19 / C-01 / C-04 / C-05

## 합격 보고 템플릿

각 테스트 결과를 다음 형식으로 기록:
```
[U-XX] PASS/FAIL — <한 줄 요약>
  실제: <관찰된 값>
  기대: <CHANGELOG 인용>
  로그: <relevant log path/line>
```

CHANGELOG의 "168 / 168 PASS" 자동화 스위트와는 별도 — 본 문서는 사용자 환경 정착(post-install) 검증용 시나리오임.
