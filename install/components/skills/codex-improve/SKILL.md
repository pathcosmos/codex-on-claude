---
name: codex-improve
description: Use to apply or reject a specific improvement candidate produced by /codex-analyze. Triggered by /codex-improve, "apply suggestion N", "Codex 개선안 적용". Walks the user through a single suggestion, asks for confirmation, applies the change, then asks for a verification check.
---

# codex-improve

`/codex-analyze`가 생성한 개선 후보 중 하나를 **사용자 판단을 받아 적용**하고, 적용 후 효과를 검증하는 흐름을 관리한다.

## Inputs
- 후보 ID 또는 카테고리 (예: `1`, `token-efficiency`, `sandbox-downgrade`)
- 사용자의 `apply | reject | skip` 결정

## Apply flow

1. 선택된 후보의 상세 내용을 사용자에게 다시 보여준다 (현재 상태 vs 제안 상태).
2. 후보 종류별 적용 방식:
   - **Reconfigure (옵션 변경)**: `codex-on-claude reconfigure` 비대화형 호출로 contextPolicy/patterns 변경
     ```sh
     codex-on-claude reconfigure --context-policy=mixed --yes
     ```
   - **새 Skill/Routine 생성**: 사용자에게 이름을 묻고, `~/.claude/skills/<name>/SKILL.md` 또는 `~/.codex-routines/<name>.json` 생성
   - **Sandbox 정책 변경 가이드**: 해당 호출이 일어나는 위치/Skill의 가드레일 텍스트만 안내(자동 수정 X — 사용자 확인 후 수동 반영)
   - **Resume 자동화**: `/codex-resume` Skill을 enable (미설치 시) + 후속 호출에 hint 추가
3. 적용 전후로 다음을 기록한다:
   - `~/.claude/codex-on-claude/improvements/<timestamp>.json`
   - 필드: `candidateId`, `category`, `decision`, `appliedChanges`, `reason`(거부 시), `verifyChecklist`
4. 적용 직후 검증 체크리스트를 사용자에게 보여준다.

## Verification

각 개선 종류별 기본 검증 체크리스트:

- **Reconfigure 변경**: `codex-on-claude status` → 새 옵션 반영 확인 → Claude Code 재시작 후 해당 Skill 1회 시범 호출
- **새 Skill**: Claude Code 재시작 → `/<new-skill>` 트리거 → SKILL.md 로드 확인 → 1회 실행
- **Sandbox 다운그레이드**: 다음 1주일 로그에서 같은 prompt 패턴의 read-only 호출이 성공하는지 확인 (`codex-on-claude analyze --days=7`)
- **Agent 격리 전환**: 큰 응답이 메인 컨텍스트에 더 이상 들어오지 않는지 다음 분석에서 확인

사용자가 "검증 완료"를 표시하면 improvement 기록에 `verifiedAt` 타임스탬프가 추가된다. 미검증 상태는 다음 `/codex-analyze`에서 다시 등장한다.

## Reject flow

거부 시:
1. 사유 입력을 받는다 (선택, 비워도 됨).
2. `~/.claude/codex-on-claude/improvements/<timestamp>.json`에 `decision: "rejected"` + reason 기록.
3. 같은 후보는 최소 14일 동안 다시 제안하지 않는다 (소음 방지).

## Skip flow

지금 결정 보류. 다음 분석 사이클에 다시 보여준다.

## Guardrails
- 적용 명령이 시스템 수준 변경(MCP 재등록, Claude 재시작 등)을 포함하면 **반드시 사용자 동의를 한 번 더 받는다.**
- `danger-full-access`로 sandbox를 올리는 제안은 자동 적용 금지. 사용자가 명시적으로 입력해야만 적용.
- `~/.claude/codex-on-claude/improvements/` 디렉토리는 `chmod 700`.
