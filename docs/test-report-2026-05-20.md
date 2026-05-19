# codex-on-claude v0.1.0 — 새 세션 실사용 검증 보고서

- 작성일: 2026-05-20 (Asia/Seoul)
- 대상 패키지: `codex-on-claude@0.1.0` (npm registry에서 게시 직후 검증)
- 검증 호스트: macOS 25.4.0, zsh
- 사용자: lanco (GitHub/npm: pathcosmos)

## 1. 검증 목표

게시된 패키지가 다음을 실제로 수행하는지 확인한다.

1. 설치 스크립트가 사전 점검을 통과하고 user-scope에 컴포넌트를 정확히 배치한다.
2. **새 Claude Code 서브프로세스가** 설치된 Skill·Agent·MCP를 자동으로 인식한다.
3. 자연어 매칭과 슬래시 명령 양쪽 모두에서 Codex 호출까지 end-to-end로 동작한다.
4. 격리된 `codex-reviewer` 서브에이전트 호출이 메인 응답을 요약 형태로 가져온다.
5. 새 프로세스에서의 `codex-reply`는 의도대로 `Session not found`로 막힌다 (`codex-resume` Skill의 존재 이유).
6. `log → analyze → 보고서 저장` 사이클이 동작한다.

## 2. 환경 정보

| 항목 | 값 |
|---|---|
| Node.js | v22.20.0 |
| Codex CLI | codex-cli 0.131.0 |
| Claude Code | 2.1.144 |
| Codex 인증 | chatgpt mode, doctor 정상 (13 ok · 0 fail) |
| Claude Code 인증 | Claude Max account, `lanco.gh@gmail.com` |
| MCP 등록 상태 | `codex` (stdio, `codex mcp-server`) — ✓ Connected |
| 사전 설치 Skill | `sincenety` 만 존재 |

## 3. 설치 결과

```sh
node install/install.mjs \
  --patterns=review,followup,fix,routine \
  --context-policy=mixed \
  --share-scope=local \
  --improvement-loop=on-demand \
  --yes
```

출력 요지:

```
0. 사전 점검 / Preflight
✓ Node.js 22.20.0
✓ Codex CLI: /Users/lanco/.nvm/versions/node/v22.20.0/bin/codex (codex-cli 0.131.0)
✓ Claude Code: /Users/lanco/.local/bin/claude (2.1.144 (Claude Code))
✓ codex doctor: 정상
✓ Claude 인증: Login method: Claude Max account

1. MCP 서버 상태 확인
✓ MCP server "codex" 이미 등록됨 및 연결 정상

3. 적용
  patterns: review, followup, fix, routine
  contextPolicy: mixed
  shareScope: local
  improvementLoop: on-demand

✓ Skill 설치/갱신: codex-review …
✓ Skill 설치/갱신: codex-followup …
✓ Skill 설치/갱신: codex-resume …
✓ Skill 설치/갱신: codex-fix …
✓ Skill 설치/갱신: codex-routine …
✓ Skill 설치/갱신: codex-analyze …
✓ Skill 설치/갱신: codex-improve …
✓ Skill 설치/갱신: codex-log …
✓ Agent 설치/갱신: codex-reviewer → /Users/lanco/.claude/agents/codex-reviewer.md
✓ 상태 저장: /Users/lanco/.claude/codex-on-claude/config.json
```

설치 직후 현 세션의 system-reminder가 새 Skill 8개를 즉시 노출 — **재시작 없이도 hot-load** 됨이 부수적으로 확인되었다.

## 4. 새 Claude Code 서브프로세스 시나리오

각 테스트는 `claude -p --model haiku --verbose --output-format stream-json --permission-mode dontAsk --allowedTools=...` 로 **별도 프로세스**에서 수행했다.

### 4.1 시스템 환경 (모든 테스트 공통)

새 세션의 첫 system event에 포함된 핵심 값:

| 키 | 값 |
|---|---|
| `mcp_servers` | `[{"name":"codex","status":"connected"}]` |
| `tools` | `…, mcp__codex__codex, mcp__codex__codex-reply` 포함 |
| `agents` | `["claude","codex-reviewer","Explore","general-purpose","Plan","statusline-setup"]` |
| `skills` | `["codex-resume","codex-improve","codex-analyze","codex-routine","codex-followup","codex-fix","codex-log","codex-review", …]` |
| `slash_commands` | `codex-resume`, `codex-improve`, `codex-analyze`, `codex-routine`, `codex-followup`, `codex-fix`, `codex-log`, `codex-review` (자동 슬래시 명령 생성) |
| `model` | `claude-haiku-4-5-20251001` |

결론: **설치된 Skill/Agent가 새 세션에서 자동으로 발견되고 자동 슬래시 명령으로 노출된다.**

### 4.2 테스트 매트릭스

| ID | 시나리오 | 결과 | 비용(USD) | 핵심 발견 |
|---|---|---|---|---|
| T1 | 직접 `mcp__codex__codex` 도구 호출 (baseline) | ✅ `NEW_SESSION_BASELINE_OK` | 0.1059 | MCP transport 정상, threadId 발급 |
| T2 | 자연어 prompt → `codex-review` Skill description 자동 매칭 | ✅ `T2_REVIEW_OK` | 0.0278 | Claude가 SKILL.md description을 읽고 `mcp__codex__codex` 호출 |
| T3 | 슬래시 명령 `/codex-review` 명시 호출 | ✅ `T3_SLASH_OK` (+ threadId 표시) | 0.0285 | `cwd / sandbox / approval-policy` 등 SKILL.md의 가드레일 인자까지 사용 |
| T4 | T1의 `threadId`로 새 프로세스에서 `codex-reply` (의도된 한계) | ⚠️ `Session not found for thread_id: …` | — | `codex-resume` fallback이 필요한 케이스 정확히 재현 |
| T5 | `Task` 도구로 `codex-reviewer` 서브에이전트 호출 (격리) | ✅ `T5_AGENT_OK` (요약만 메인에) | 0.0656 | 서브에이전트가 MCP 호출 → 요약 4줄만 메인 컨텍스트로 |

총 외부 비용 0.328 USD. 모든 호출이 read-only sandbox로 실행됨.

### 4.3 발췌 — T1 baseline

```json
{"type":"tool_use","name":"mcp__codex__codex","input":{"prompt":"Return exactly NEW_SESSION_BASELINE_OK and nothing else."}}
```

```json
{"type":"tool_result","content":"{\"threadId\":\"019e4178-2f92-79f1-8da7-cd19ab20cbf7\",\"content\":\"NEW_SESSION_BASELINE_OK\"}"}
```

최종 결과: `result="NEW_SESSION_BASELINE_OK"`, `is_error=False`.

### 4.4 발췌 — T3 슬래시 명령

```json
{"type":"tool_use","name":"mcp__codex__codex","input":{
  "prompt":"…",
  "cwd":"/Volumes/minim42tbtmm/pathcosmos/codex-on-claude",
  "sandbox":"read-only",
  "approval-policy":"never"
}}
```

→ Skill 가이드의 **모든 가드레일 인자가 적용**되었음.

### 4.5 발췌 — T4 cross-process 실패

```
Session not found for thread_id: 019e4178-2f92-79f1-8da7-cd19ab20cbf7
```

이 메시지는 정확히 우리 `codex-resume` Skill이 fallback으로 `codex exec resume`을 안내해야 하는 시점이다. 의도된 동작.

### 4.6 발췌 — T5 서브에이전트

상위에서 호출된 도구 시퀀스:

```
tool=Task input_keys=['subagent_type','description','prompt']    ← 메인 세션
tool=mcp__codex__codex input_keys=['prompt','cwd','sandbox','approval-policy']   ← 격리 컨텍스트 내부
```

메인 세션이 받은 응답(요약):

```
Done. The codex-reviewer agent successfully ran Codex on the snippet
'function pow(a,b){return a**b}' and received the 'T5_AGENT_OK' response.
- No critical issues
- One suggestion: add parameter validation and use more descriptive names
- Session thread ID: 019e417a-…
```

Codex 원문 응답 전체가 아니라 약속된 4줄 요약 포맷이 그대로 적용됨 → **컨텍스트 격리 검증**.

## 5. 로깅 → 분석 사이클 검증

T1~T5의 호출 메타를 `codex-on-claude log` 로 적재:

```sh
codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok --prompt-chars=180 --response-chars=12 --elapsed-ms=4500 --notes="T2 nl-match"
# … 5개 적재
```

`~/.claude/codex-on-claude/logs/usage-2026-05-19.jsonl` 마지막 5줄:

```
{"ts":"…","skill":"baseline","outcome":"ok","threadId":"019e4178-…", "notes":"T1 baseline MCP"}
{"ts":"…","skill":"codex-review","outcome":"ok","notes":"T2 nl-match"}
{"ts":"…","skill":"codex-review","outcome":"ok","threadId":"019e4179-…", "notes":"T3 slash"}
{"ts":"…","skill":"codex-followup","outcome":"session-not-found","errorKind":"session-not-found","notes":"T4 cross-process"}
{"ts":"…","skill":"codex-reviewer-agent","outcome":"ok","viaAgent":true,"responseChars":480,"notes":"T5 subagent"}
```

`codex-on-claude analyze --days=1` 결과:

```
Summary:
  total calls: 5 | ok 4 | failed 1
  avg response: 0.1 KB | p95: 0.5 KB
  via agent: 1 / 5

개선 후보 없음. 현재 사용 패턴이 양호하거나 데이터가 부족합니다.
```

분석 임계치(룰별 최소 발화 건수: session-not-found ≥2 등) 미달 → 정상적으로 "후보 없음" 출력. `--format=markdown --save` 도 동작해 `~/.claude/codex-on-claude/reports/2026-05-19T18-24-01-562Z.md` 에 저장.

## 6. 발견 사항 및 한계

1. **Skill hot-load 가능성** — 설치 직후 현재 Claude Code 세션의 system-reminder가 새 Skill 8개를 즉시 노출. 일반적으로 "재시작 권장"으로 안내하지만, 실제로는 일부 케이스에서 즉시 인식된다. README의 "다음 단계" 문구는 **보수적인 안내로 유지**한다.
2. **자동 로깅의 한계** — `codex-log` Skill은 가이드 문서이지 자동 hook이 아니다. 현재 로깅은 Claude가 명시적으로 Bash로 jsonl 한 줄을 append하거나 사용자가 `codex-on-claude log`를 호출해야 발생한다. 완전 자동화는 `~/.claude/settings.json`의 PostToolUse hook 통합이 필요(향후 작업).
3. **cross-process threadId 영속성 없음** — 같은 머신이라도 새 MCP 서버 프로세스에서는 `codex-reply`가 실패. `codex exec resume` fallback은 작동하지만, 현재는 사용자가 threadId를 메인 컨텍스트나 별도 메모로 관리해야 한다. → **v0.2에서 thread persistence (parsist threadId 카탈로그 + 작업 문맥 기록) 도입 예정.**
4. **분석 임계치 노출** — 룰별 최소 발화 건수(예: session-not-found ≥ 2)가 현재는 코드 상수다. 큰 변동 폭에서 의미 있는 신호만 잡기 위함이지만, 사용자가 임계치를 만지고 싶을 수도 있다. 향후 manifest의 옵션으로 노출 검토.

## 7. 결론

게시된 `codex-on-claude@0.1.0`은 **설치 → 새 세션 자동 인식 → Skill/Agent 실호출 → 로그 → 분석** 사이클을 처음부터 끝까지 정상 수행한다. T1~T5 모든 케이스가 예상된 성공·실패로 종결했고, T4의 의도된 실패는 `codex-resume` 가치 검증으로 이어졌다.

다음 마일스톤은 본 보고서의 §6.3 — **persistent thread catalog**.

## 부록 A — 재현 명령

```sh
# 사전
node --version           # ≥ 18.17
codex doctor --summary   # 정상
claude auth status --text

# 설치 (사용자 실제 HOME)
node install/install.mjs \
  --patterns=review,followup,fix,routine \
  --context-policy=mixed \
  --share-scope=local \
  --improvement-loop=on-demand \
  --yes

# T1
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk --allowedTools=mcp__codex__codex \
  "Use the Codex MCP tool to ask Codex: Return exactly NEW_SESSION_BASELINE_OK and nothing else."

# T3
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk --allowedTools=mcp__codex__codex,Skill,Bash \
  "/codex-review For the snippet 'const x = 1', ask Codex to return exactly T3_SLASH_OK and nothing else."

# T5
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk --allowedTools=Task,mcp__codex__codex,Bash \
  "Use the Task tool with subagent_type='codex-reviewer' to ask Codex on a snippet, expecting T5_AGENT_OK."

# 분석
codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok \
  --prompt-chars=120 --response-chars=12 --elapsed-ms=4000 --thread-id=…
codex-on-claude analyze --days=1 --format=markdown --save
```

## 부록 B — 원본 캡처

전체 stream-json 출력은 `/tmp/coc-test-<timestamp>/{t1..t5}.jsonl` 에 보존되었다 (임시 디렉토리, 세션 종료 시 정리 예정).
