---
name: codex-fix
description: Use when the user wants Codex to actually edit files (not just review) under a strict file-scope. Triggered by /codex-fix or phrases like "Codex가 직접 고치게 해줘", "let Codex apply the fix". Enforces workspace-write sandbox with explicit file allowlist.
---

# codex-fix

Codex CLI에게 **파일 수정 권한을 위임**하는 Skill. 단, 항상 다음 가드레일을 강제한다.

1. `sandbox`는 `workspace-write`로만 설정한다. `danger-full-access`는 금지.
2. **수정 허용 파일 경로를 prompt에 명시**한다. Codex가 그 외 파일을 건드리지 못하게 한다.
3. 모델 응답에서 실제 변경 요약(추가/삭제 줄 수, 파일별)을 요구하고, 사용자에게 보고한다.
4. `approval-policy`는 기본 `on-request` (위험 명령은 사용자 동의가 필요하도록).

## When to use
- Codex가 단발 수정(작은 리팩터, 단순 버그픽스, 명확한 추가)을 직접 적용해야 할 때
- 수정 범위가 사전에 명확하게 정해진 파일 목록에 한정될 때

## When NOT to use
- 광범위한 변경 (수십 파일에 걸친 리팩터): Claude가 직접 진행하거나 분할 위임
- 어떤 파일을 수정해야 할지 명확하지 않을 때: `/codex-review`로 먼저 의견을 받는다
- 비밀/인증/배포 관련 파일

## How to invoke

```
tool: mcp__codex__codex
arguments:
  prompt: |
    Edit ONLY the following files: <명시적 경로 목록>.
    Do not create, rename, or delete any other file.
    Task: <구체적 작업 설명>
    After editing, output a JSON summary like:
      { "edited": ["path1", "path2"], "summary": "<one-line per file>" }
    If you cannot complete the task without editing files outside the allowlist,
    STOP and reply with exactly: NEEDS_OUT_OF_SCOPE_FILES followed by the list.
  cwd: <absolute project path>
  sandbox: workspace-write
  approval-policy: on-request
```

## After the call
- Codex가 반환한 `edited` 목록을 사용자에게 보여준다.
- 허용 목록 밖 파일이 수정되었으면 즉시 사용자에게 경고하고, 필요한 경우 git을 통해 되돌릴 것을 안내한다 (직접 되돌리지 않음).
- `threadId`를 보관해 후속 수정/검증에 `/codex-followup`을 사용할 수 있게 한다.

## Verification
설치 직후 다음으로 동작 점검 (실제 수정 없이 dry-run prompt):

```
mcp__codex__codex(
  prompt="List the files in CWD root and reply with FIX_SKILL_OK. Do not edit anything.",
  cwd=<project path>,
  sandbox="workspace-write",
  approval-policy="on-request"
)
```
