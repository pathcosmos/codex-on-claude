---
name: codex-followup
description: Use when continuing an existing Codex thread with a follow-up question (e.g., "Codex에 이어서 물어봐", "/codex-followup", "ask Codex again on the same thread"). Requires a known threadId from a previous Codex call. Stays read-only by default.
---

# codex-followup

`mcp__codex__codex-reply`를 사용해 **이전에 받은 `threadId`로 같은 Codex 세션을 이어간다.** 같은 MCP 서버 프로세스 생명주기 안에서 가장 효율적인 방법.

## When to use
- 직전 `/codex-review`나 `mcp__codex__codex` 호출의 `threadId`를 보관 중인 상태에서, 같은 맥락을 유지하며 추가 질의가 필요할 때
- "방금 그 답에서 X 부분만 다시" 같은 컨텍스트 의존적인 후속 작업

## How to invoke

```
tool: mcp__codex__codex-reply
arguments:
  threadId: <기존 응답에서 받은 threadId>
  prompt: |
    <후속 질문>
```

`threadId`가 메인 컨텍스트에 없다면 사용자에게 마지막 Codex 응답을 보여달라고 요청하거나, `/codex-resume`을 안내한다.

## When `codex-reply` fails

다음과 같은 응답이 오면 MCP 서버가 재시작된 것이다.

```json
{ "content": "Session not found for thread_id: ...", "isError": true }
```

이때는 자동으로 `/codex-resume`을 제안한다. `codex exec resume`은 디스크에 저장된 세션을 복구할 수 있다.

## Thread persistence (if `--threads != off`)

후속 응답을 받은 직후 turn 카운트를 올리고, full 모드면 요점을 한 줄로 기록한다.

```sh
codex-on-claude threads new <threadId> --skill=codex-followup --bump-turn
# full 모드:
codex-on-claude threads outcome <threadId> "Follow-up answered: ..."
```

먼저 카탈로그에 있는지 보고 싶을 때:

```sh
codex-on-claude threads show <threadId>
```

## Guardrails
- `threadId`가 없거나 형식이 이상하면(예: 임의의 단어, 빈 값) 호출하지 않는다. 사용자에게 다시 확인한다.
- Sandbox는 이전 세션과 동일하게 유지된다. 별도로 모드를 바꿔야 한다면 새 `mcp__codex__codex` 호출을 권한다.
