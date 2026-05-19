---
name: codex-log
description: Use after any mcp__codex__codex or mcp__codex__codex-reply call to record metadata to the local usage log. Triggered automatically by /codex-review, /codex-followup, /codex-fix, or manually via /codex-log. Local-only, opt-in (only installed when improvementLoop != off).
---

# codex-log

Codex 호출 메타데이터를 **로컬 JSONL 로그**에 추가한다. 외부 전송 없음. 분석/개선 제안의 데이터 기반.

## When this runs
- 다른 codex-* Skill이 Codex 호출을 마친 직후 자동으로 (Skill 내부에서 명시적으로 호출)
- 사용자가 `/codex-log`로 수동 기록 추가할 때

## Log location
- `~/.claude/codex-on-claude/logs/usage-YYYY-MM-DD.jsonl`
- 한 줄 = 한 호출

## Log entry schema

```json
{
  "ts": "2026-05-20T12:34:56.000Z",
  "skill": "codex-review",
  "tool": "mcp__codex__codex",
  "sandbox": "read-only",
  "approvalPolicy": "never",
  "threadId": "019e...",
  "promptChars": 412,
  "responseChars": 1834,
  "elapsedMs": 4823,
  "viaAgent": false,
  "outcome": "ok",
  "errorKind": null,
  "notes": null
}
```

`outcome`은 `ok | session-not-found | tool-error | user-cancelled | timeout` 중 하나.

## How to append

Bash로 다음 명령을 실행한다 (jsonl append-only).

```sh
mkdir -p ~/.claude/codex-on-claude/logs
echo '<JSON 한 줄>' >> ~/.claude/codex-on-claude/logs/usage-$(date +%Y-%m-%d).jsonl
```

또는 codex-on-claude CLI가 있으면 더 안전:

```sh
codex-on-claude log --skill=codex-review --sandbox=read-only --outcome=ok \
  --prompt-chars=412 --response-chars=1834 --elapsed-ms=4823 --thread-id=<id>
```

## Privacy policy
- prompt/response **본문**은 절대 기록하지 않는다. 길이/메타만.
- threadId는 식별자로만 기록 (Codex 측 세션 복구에 필요).
- `notes`는 사용자가 명시적으로 넣은 짧은 메모만.
- 로그 디렉토리는 `chmod 700`. 외부 노출 없음.
- 사용자가 언제든 `rm -rf ~/.claude/codex-on-claude/logs/`로 삭제 가능.

## Disabling
설치 시 `improvementLoop=off`를 선택했거나, `codex-on-claude reconfigure`로 off로 바꾸면 이 Skill은 제거된다.
