---
name: codex-resume
description: Use when an existing Codex threadId can no longer be reached via mcp__codex__codex-reply (server restarted, "Session not found for thread_id"), or the user wants to resume a long-lived Codex session from CLI. Triggered by /codex-resume or phrases like "이전 Codex 세션 이어서", "resume codex thread". Always checks for SILENT_NEW_SESSION before claiming success.
---

## CRITICAL: silent new-session detection

`codex exec resume <id>` (CLI 0.131) 은 주어진 id가 디스크에 없으면 **에러 없이 새 thread를 시작**한다. 사용자는 "이어가기" 의도였는데 실제로는 컨텍스트 손실. 이 Skill이 호출되면 다음을 반드시 수행한다.

1. resume 호출 응답에서 `thread_id` 추출
2. **입력 threadId와 다르면**, 메인 컨텍스트에 다음을 명시적으로 출력:
   ```
   ⚠ SILENT_NEW_SESSION: resume requested <input-id> but codex returned <returned-id>.
   Prior context is NOT carried over. The new threadId is registered separately as bifurcation.
   ```
3. 카탈로그에 incident 자동 기록 (catalog 활성 환경):
   ```sh
   codex-on-claude threads incident <inputId> \
     --issue=silent-new-session \
     --resolution="codex created new threadId <returnedId>" \
     --outcome=lost-context
   ```
4. 사용자에게 다음 선택지를 제시:
   - (a) 새 thread로 계속 진행 (기존 context는 손실 수용)
   - (b) 작업 중단하고 원래 thread에 무엇이 들어있었는지 사용자가 확인하도록

`codex-on-claude threads resume <id> "prompt"` 서브커맨드는 이 검사를 자동으로 수행하므로, 가능하면 직접 `codex exec resume` 대신 이걸 호출하라.

# codex-resume

`mcp__codex__codex-reply`가 `Session not found for thread_id`를 반환하거나, 새 Claude Code 세션에서 이전 Codex `threadId`를 이어가야 할 때 사용하는 fallback 절차.

`codex exec resume`은 디스크에 저장된 Codex 대화를 다시 시작한다.

## When to use
- `codex-reply` 응답에 `Session not found for thread_id: <id>` 가 보일 때
- 새 터미널/세션에서 이전 작업의 `threadId`만 알고 있을 때
- MCP 서버 프로세스를 재시작해야 했고, 이전 작업을 이어가야 할 때

## How to invoke

Bash 도구로 다음 명령을 실행한다.

```sh
codex exec resume --skip-git-repo-check --json <threadId> "<후속 prompt>"
```

`--json`이 붙으면 결과가 JSONL 이벤트로 반환된다. 최종 메시지는 다음 형태로 들어온다:

```json
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"<답변>"}}
```

이 텍스트만 추출해서 사용자에게 보고하면 된다.

## After resume

resume이 성공하면 같은 `threadId`로 다시 `mcp__codex__codex-reply`도 동작할 수 있다. 다음 turn부터는 `/codex-followup`을 우선 시도해도 된다.

## Thread persistence integration (if `--threads != off`)

영속 카탈로그가 활성화되어 있으면, **재개를 시도하기 전에** 카탈로그에서 fallback 전략을 먼저 확인하라:

```sh
codex-on-claude threads show <threadId>          # fallbackStrategy 확인
codex-on-claude threads resume <threadId> "<후속 prompt>"
# 내부적으로:
#  - auto-resume → 즉시 `codex exec resume` 실행
#  - ask         → 사용자에게 어떤 방식으로 진행할지 물어보고 결정
#  - new         → 같은 cwd/sandbox로 새 mcp__codex__codex 호출 권장 (이전 summaries 요약을 prefix로)
```

문제가 발생한 시점에는 incident도 함께 기록한다 (full 모드).

```sh
codex-on-claude threads incident <threadId> \
  --issue=session-not-found \
  --resolution="codex exec resume" \
  --outcome=recovered
```

같은 threadId에 incident가 3건 이상 쌓이면 `/codex-analyze`가 fallbackStrategy 변경(예: `ask` → `new`)을 권할 수 있다.

## Guardrails
- resume에 전달하는 prompt에 민감 정보(토큰, 비밀번호)를 그대로 넣지 않는다.
- `threadId`는 메인 컨텍스트에 그대로 노출해도 무방하다 (식별자일 뿐).
- 같은 `threadId`로 resume이 반복 실패하면 새 `mcp__codex__codex` 세션을 시작하라.
