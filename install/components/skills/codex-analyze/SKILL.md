---
name: codex-analyze
description: Use to analyze the local Codex usage log and surface improvement candidates - token-efficiency tweaks, new Skill ideas, sandbox-mode mismatches, repeated prompts, failure patterns. Triggered by /codex-analyze or phrases like "Codex 사용 패턴 분석", "토큰 효율 점검", "codex usage report".
---

# codex-analyze

`~/.claude/codex-on-claude/logs/` 의 JSONL 사용 로그를 분석해서, **상호 사용 효율을 높일 수 있는 개선 후보**를 사용자에게 제시한다.

## What it analyzes

다섯 가지 차원으로 데이터를 본다:

1. **토큰 소비 효율**
   - 평균/최대 응답 크기
   - 메인 컨텍스트에 직접 들어간 응답 vs 격리 Agent를 거친 응답 비율
   - 큰 응답인데 Agent 경유 안 한 호출 → "이런 호출은 다음부터 codex-reviewer로 보내는 게 유리"
2. **반복 패턴**
   - 같은/유사한 prompt 형태가 N회 반복 → 새 Skill 또는 routine 후보
   - 같은 threadId가 며칠에 걸쳐 사용됨 → 장기 세션 관리 권장
3. **Sandbox 적합도**
   - workspace-write를 썼지만 실제 응답이 짧고 수정이 없었던 호출 → read-only로 충분
   - read-only로 했지만 자주 "수정이 필요하다"로 끝남 → fix Skill 도입 권장
4. **실패/재시도 패턴**
   - `session-not-found` 빈도 → codex-resume 자동화 가치
   - timeout 빈도 → prompt 단축, model 변경 검토
5. **시간/빈도 분포**
   - 시간대별 사용량 → 정기 작업으로 묶을 후보
   - 주간 패턴 → routine 자동화 후보

## How to run

```sh
codex-on-claude analyze
```

옵션:
- `--days=N`: 최근 N일만 (기본 14)
- `--format=text|json|markdown` (기본 text)
- `--with-codex`: 추가로 Codex에게 의견 요청 (read-only). 룰 기반에서 놓친 패턴을 LLM이 보강
- `--save`: 결과를 `~/.claude/codex-on-claude/reports/<timestamp>.md`에 저장

## Output structure

```
codex-on-claude analyze (last 14 days)

Summary:
  total calls: 87 | ok 81 | failed 6
  avg response: 1.4 KB | p95: 12 KB
  via agent: 12 / 87

Improvement candidates:
  [1] 토큰 효율 — 큰 응답 5건이 메인 컨텍스트로 직접 들어감
      권장: 이 패턴(>5KB)을 codex-reviewer 격리 호출로 전환
      예상 절감: 메인 컨텍스트 60KB/주

  [2] 새 Skill 후보 — "Review the diff against main" 변형이 11회 반복
      권장: /codex-routine 으로 묶거나 전용 Skill 생성

  [3] Sandbox 다운그레이드 — workspace-write 호출 4건이 실제 수정 0건
      권장: 같은 호출을 read-only로 전환

  ...

Take action:
  codex-on-claude suggest --apply N    # 후보 N번을 채택해 reconfigure 흐름으로 진행
  codex-on-claude suggest --reject N --reason "..."   # 거부 + 사유 기록
```

## Inside Claude Code

이 Skill이 트리거되면, Claude는 위 명령을 Bash로 실행하고 결과를 사용자에게 보여준다. 그 다음 다음 두 가지를 사용자에게 묻는다:

1. 어떤 후보에 관심이 있는지 (번호 선택)
2. 각 후보에 대해 `apply` / `reject` / `skip` 결정

`apply`를 고르면 자동으로 `/codex-improve`를 호출해 적용 흐름으로 들어간다.

## Reports archive

`--save`로 저장된 보고서는 다음 분석 사이클에서 비교 대상으로 사용된다 (이전 권장이 채택되었는지 효과 추적).
