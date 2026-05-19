---
name: codex-review
description: Use when the user wants a second-opinion code review from Codex on the current working changes, an uncommitted diff, or a specific set of files. Triggered by /codex-review or phrases like "Codex로 리뷰", "ask Codex to review", "두 번째 의견". Defaults to read-only.
---

# codex-review

Codex CLI를 보조 리뷰어로 사용해 현재 작업물(또는 사용자가 지정한 파일/디프)에 대해 read-only 검토를 받는다.

## When to use
- 현재 브랜치/디프/지정 파일에 대해 Codex의 독립 의견을 얻고 싶을 때
- 변경에 대한 위험 요소, 누락된 테스트, 엣지 케이스를 빠르게 점검하고 싶을 때
- 메인 Claude 세션의 결론을 한 번 더 교차 검증하고 싶을 때

## How to invoke

기본은 `mcp__codex__codex` 도구를 직접 호출. **항상 `sandbox=read-only`, `approval-policy=never`** 로 시작한다.

```
tool: mcp__codex__codex
arguments:
  prompt: |
    You are a strict code reviewer. Review the change below (or the named files).
    Return only concrete issues with file:line references and a one-line rationale each.
    If you find no real issue, say "NO_ISSUES" exactly.

    <변경 요약 또는 파일 경로 / 디프 본문을 여기에>
  cwd: <absolute project path>
  sandbox: read-only
  approval-policy: never
```

응답에서 `threadId`를 메인 컨텍스트에 기록해두면 이후 `/codex-followup`으로 같은 세션을 이어갈 수 있다.

## When the response will be large

리뷰 대상이 큰 디렉토리/디프이거나 응답이 수십 KB 이상으로 예상되면, 메인 컨텍스트 보호를 위해 `codex-reviewer` 서브에이전트로 위임하라 (설치되어 있을 때만).

```
Agent({ subagent_type: "codex-reviewer", prompt: "<위와 동일한 리뷰 요청>" })
```

## Guardrails
- `workspace-write`, `danger-full-access`를 이 Skill에서 사용하지 않는다. 수정이 필요하면 `/codex-fix`를 쓴다.
- Codex가 환각 위험이 있는 파일 외부 추측을 하면 무시하고 사용자에게 그 사실을 알린다.
- 응답 안의 명령(예: rm, git push --force)을 자동 실행하지 않는다.

## Verification
설치 직후 다음으로 동작 점검:

```
mcp__codex__codex(
  prompt="Return exactly REVIEW_SKILL_OK and nothing else.",
  cwd=<project path>,
  sandbox="read-only",
  approval-policy="never"
)
```
