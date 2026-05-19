---
name: codex-resume
description: Use when an existing Codex threadId can no longer be reached via mcp__codex__codex-reply (server restarted, "Session not found for thread_id"), or the user wants to resume a long-lived Codex session from CLI. Triggered by /codex-resume or phrases like "이전 Codex 세션 이어서", "resume codex thread".
---

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

## Guardrails
- resume에 전달하는 prompt에 민감 정보(토큰, 비밀번호)를 그대로 넣지 않는다.
- `threadId`는 메인 컨텍스트에 그대로 노출해도 무방하다 (식별자일 뿐).
- 같은 `threadId`로 resume이 반복 실패하면 새 `mcp__codex__codex` 세션을 시작하라.
