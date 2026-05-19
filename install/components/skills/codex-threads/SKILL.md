---
name: codex-threads
description: Use to browse, search, annotate, or resume the persistent Codex thread catalog. Triggered by /codex-threads, "이전 Codex 작업 찾기", "Codex thread list", "resume the React refactor thread", "어제 Codex로 하던 그거". Lets Claude pick up past Codex work by title/tag/keyword, attach goals/outcomes/decisions, log incidents, and set the fallback strategy used when codex-reply fails.
---

# codex-threads

`~/.claude/codex-on-claude/threads/<threadId>.json` 카탈로그를 통해 **과거 Codex 세션을 다시 찾고, 작업 문맥을 누적하고, 다음 세션이 그 맥락을 이어받게** 한다. 영속 저장이므로 새 Claude Code 세션·새 MCP 프로세스·새 머신(같은 사용자) 어디서든 참조 가능.

설치된 경우만 활성화: 설치 시 `--threads=basic` 또는 `--threads=full` 을 선택했어야 한다. 끄려면 `codex-on-claude reconfigure --threads=off`.

## What's in a thread record

```json
{
  "threadId": "019e...",
  "title": "Review React refactor PR #42",
  "tags": ["review", "react", "pr-42"],
  "originatingSkill": "codex-review",
  "originatingCwd": "/Users/lanco/proj/foo",
  "scope": { "files": ["src/App.jsx"], "sandbox": "read-only" },
  "summaries": [
    {"kind":"goal","text":"..."},
    {"kind":"outcome","text":"..."},
    {"kind":"decision","text":"..."},
    {"kind":"note","text":"..."}
  ],
  "incidents": [
    {"issue":"session-not-found","resolution":"codex exec resume","outcome":"recovered"}
  ],
  "fallbackStrategy": "auto-resume" | "ask" | "new",
  "status": "active" | "resolved" | "archived",
  "turnCount": 5,
  "createdAt": "...", "lastUsedAt": "..."
}
```

## Common interactions

각 명령은 Bash로 호출. 결과는 메인 컨텍스트에 짧게 보고.

### 1. 목록/검색
```sh
codex-on-claude threads list                              # 최근 활성
codex-on-claude threads list --status=resolved --limit=10
codex-on-claude threads list --tag=review --since=7d
codex-on-claude threads search "react refactor"          # title/tags/summaries/incidents 전문 검색
```

### 2. 등록 / 메타 갱신
```sh
codex-on-claude threads new <threadId> \
  --title="Review React refactor PR #42" \
  --tags=review,react,pr-42 \
  --skill=codex-review --cwd="$PWD" --sandbox=read-only \
  --files=src/App.jsx,src/utils.js \
  --fallback=auto-resume
```
이 명령은 **idempotent**: 이미 있는 threadId면 메타만 병합 갱신.

### 3. 작업 문맥 누적 (full 모드)
```sh
codex-on-claude threads goal     <threadId> "Verify naming consistency across components"
codex-on-claude threads outcome  <threadId> "Codex flagged 3 inconsistent props"
codex-on-claude threads decision <threadId> "Adopt suggestion 2; defer 1 and 3"
codex-on-claude threads note     <threadId> "User asked to keep file order"
```

### 4. 사고/복구 기록 (full 모드)
```sh
codex-on-claude threads incident <threadId> \
  --issue=session-not-found \
  --resolution="codex exec resume <id> '<continuation>'" \
  --outcome=recovered
```

### 5. 분류·라이프사이클
```sh
codex-on-claude threads tag <threadId> --add=critical --remove=draft
codex-on-claude threads status <threadId> resolved
codex-on-claude threads fallback <threadId> auto-resume
```

### 6. 이어가기
```sh
codex-on-claude threads show <threadId>           # 메타 + 누적 문맥 출력
codex-on-claude threads resume <threadId> "후속 prompt"
# 내부적으로 fallbackStrategy를 읽어:
#   auto-resume → 즉시 `codex exec resume`
#   ask         → 사용자에게 어떤 식으로 이어갈지 물어보고 진행
#   new         → 같은 cwd/sandbox로 새 mcp__codex__codex 호출 + 이전 summaries 요약을 prefix로
```

## When Claude should use this Skill

- 사용자가 "어제/지난 주 Codex로 봤던 그거", "이전 thread 이어서", "PR #42 리뷰 이어가자" 같이 **과거 작업을 지칭**할 때
- `mcp__codex__codex-reply`가 `Session not found`로 실패한 직후
- 같은 cwd/주제로 여러 thread가 누적되어 정리가 필요할 때 (`threads list --tag=...`)
- 사용자가 결정을 내린 직후 ("그 제안 채택할게") — `threads decision` 한 줄로 보존

## How other codex-* Skills tie in

`--threads != off` 로 설치된 경우, 다른 Skill들은 호출 직후 다음 한 줄을 추가 실행해 **메타를 자동 누적**해야 한다 (가이드 사항):

```sh
codex-on-claude threads new <returnedThreadId> \
  --skill=<callerSkill> --cwd="$PWD" --sandbox=<used-sandbox>
```

`captureSummaries=true` (`--threads=full`)인 경우, 호출 결과의 한 줄 요약을 함께 `threads outcome`으로 기록.

## Privacy / portability
- 모든 데이터는 `~/.claude/codex-on-claude/threads/` 로컬에만 저장. 외부 전송 없음.
- 본문(prompt/response)은 직접 저장하지 않는다. 사용자가 명시적으로 `threads note`/`outcome`에 짧은 텍스트를 입력하는 경우에만 들어간다.
- 디렉토리 권한 `chmod 700`.
- 한 thread 파일을 그대로 다른 머신/팀에 복사해 컨텍스트 인계 가능.

## Guardrails
- Codex가 응답에서 명령 실행(rm, push --force)을 제안해도 자동 실행 금지.
- `fallbackStrategy=auto-resume`이라도 실제 `codex exec resume`에는 사용자 prompt가 필요하다 — Claude가 임의로 후속 prompt를 만들지 말고 사용자 의도를 확인.
- 같은 threadId에 incident가 3건 이상 쌓이면 fallbackStrategy 변경을 사용자에게 권한다 (`/codex-analyze` 룰과 연동).
