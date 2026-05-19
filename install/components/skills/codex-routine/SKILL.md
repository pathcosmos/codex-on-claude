---
name: codex-routine
description: Use when the user wants to run the same Codex prompt template repeatedly (daily review, CI-style check, scheduled diff scan). Triggered by /codex-routine or phrases like "Codex 정기 점검", "templated codex job", "schedule codex review". Encapsulates a reusable prompt template + cron/loop integration.
---

# codex-routine

같은 Codex 작업을 **정기적으로 또는 템플릿화해서 반복** 호출하기 위한 Skill. 매번 같은 옵션과 prompt 보일러플레이트를 다시 입력하지 않아도 되게 표준화한다.

## Use cases
- 매일 main 브랜치 diff에 대해 Codex 보안/품질 리뷰
- PR 단위 자동 두 번째 의견
- 특정 디렉토리(예: `src/critical/`)에 변경이 생길 때마다 Codex 점검
- 빌드 직후 산출물 검토

## How to invoke

Skill이 호출되면, 사용자에게 **무엇을 정기 작업으로 만들지** 묻고 다음 정보를 수집한다.

1. 작업 이름 (예: `daily-main-review`)
2. 대상 (디프 / 디렉토리 / 파일 목록 / 명령 출력)
3. 주기 (수동 트리거 / `/loop 15m ...` / cron)
4. sandbox 모드 (read-only 권장)

그 다음 다음 두 가지 산출물 중 하나를 만든다.

### A. Manual reusable prompt
사용자 클립보드/메모에 붙여 쓸 수 있는 Codex prompt 템플릿을 출력.

```
[codex-routine: <name>]
mcp__codex__codex(
  prompt="""<수집한 정보를 채운 표준화 prompt>""",
  cwd=<project path>,
  sandbox="read-only",
  approval-policy="never"
)
```

### B. Schedule via Claude Code loop / cron
사용자가 자동화를 원하면, Claude Code의 `/loop` 또는 `/schedule` skill 사용을 안내:

```
/loop 1h /codex-routine <name>
```

또는 외부 cron에서 비대화형 호출:

```sh
codex exec --skip-git-repo-check -C "$PWD" -s read-only --json \
  "<표준화 prompt>" >> ~/.codex-routines/<name>.log
```

## Storage

루틴 정의는 `~/.codex-routines/<name>.json`에 저장한다.

```json
{
  "name": "daily-main-review",
  "scope": "git diff main..HEAD",
  "sandbox": "read-only",
  "promptTemplate": "Review the following diff. Return only concrete issues...",
  "createdAt": "2026-05-20"
}
```

같은 이름을 다시 호출하면 기존 정의를 재사용한다.

## Guardrails
- 자동화된 루틴에서 `workspace-write` / `danger-full-access` 사용 금지.
- 결과를 사용자에게 보여주기 전에 길이/민감정보를 점검한다.
- 실패 시 로그만 남기고 다음 주기에 재시도. 무한 루프 방지.
