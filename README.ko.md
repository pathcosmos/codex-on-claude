# codex-on-claude (한국어 미러)

> Claude Code 안에서 OpenAI **Codex CLI**를 보조 에이전트로 호출하는 다리.
> 본문은 [README.md](README.md) (영어) 가 정본입니다. 이 문서는 빠른 한국어 안내입니다.

[![npm version](https://img.shields.io/npm/v/codex-on-claude.svg)](https://www.npmjs.com/package/codex-on-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 한 줄 요약

```sh
codex --version && claude --version    # 사전 설치 + 로그인이 끝났는지 확인
npx codex-on-claude                    # 인터랙티브 설치
```

설치 단계:
1. 사전 점검 (Node 18.17+, `codex`, `claude`, `codex doctor`, `claude auth`, `codex` MCP 연결)
2. **네 가지 질문** — 화살표 ↑/↓ 이동, 스페이스 토글, Enter 확정
3. 최종 review 화면 — `Apply / Edit again / Cancel`
4. 선택한 Skill (+ 선택적 Agent / hook) 을 `~/.claude/` 아래에 배치

언제든 `codex-on-claude reconfigure` 로 다시 — 이전 선택이 미리 체크되어 나옵니다.

---

## 업데이트 방법

- **npx 사용자**: 별도 조치 없음. `npx codex-on-claude` (또는 `npx codex-on-claude@latest`) 가 최신을 받습니다.
- **글로벌 설치 사용자**:
  ```sh
  npm update -g codex-on-claude
  # 또는 명시 버전:
  npm install -g codex-on-claude@latest
  codex-on-claude --version
  ```
- 업데이트 후 `codex-on-claude reconfigure` 를 한 번 실행하면, 이전 답이 미리 선택된 상태로 옵션을 다시 검토할 수 있습니다. 마지막 review 화면에서 저장 직전 확인 가능.
- 롤백: `npm install -g codex-on-claude@0.3.1` 처럼 명시 설치 후 reconfigure.
- `npm update` 자체는 `~/.claude/...` 아래 파일을 건드리지 않습니다. CLI 바이너리만 교체됩니다.

---

## 사전 요구사항

| 항목 | 최소 | 확인 |
|---|---|---|
| Node.js | 18.17 | `node --version` |
| Claude Code | 2.1.x | `claude --version` |
| Codex CLI | 0.13.x | `codex --version`, `codex doctor` |
| `codex` MCP | `Connected` | `claude mcp get codex` |

한 번에 점검: `codex-on-claude doctor`

---

## 설치 시 묻는 네 가지 옵션

자세한 동작은 [README.md](README.md) 의 *"The four install questions"* 섹션을 보세요.

### 1. patterns (다중)
- One-shot read-only review → `codex-review`
- Long multi-turn session → `codex-followup`, `codex-resume`
- Workspace-write delegation → `codex-fix` (파일 허용목록 강제)
- Templated repeating job → `codex-routine`

### 2. contextPolicy (단일)
- `direct` — 응답을 메인 컨텍스트에 그대로
- `summarize` — `codex-reviewer` Agent 통해 요약만 메인으로
- `mixed` (권장) — Skill이 매 호출 시 선택

### 3. improvementLoop (단일)
- `off` — 로깅/분석 끔
- `manual` (기본) — Skill prose 가 명시적으로 `codex-on-claude log` 호출 (이전 `on-demand` 키는 alias)
- `auto-on-skill` — `~/.claude/settings.json` 에 PostToolUse hook 등록, mcp__codex__codex 호출마다 자동 로깅
- `periodic` — `auto-on-skill` + 정기 분석 가이드

### 4. threads (단일, v0.2+)
영속 thread 카탈로그 `~/.claude/codex-on-claude/threads/<id>.json`
- `off` — 끔
- `basic` (improvement loop on 시 기본) — threadId + title + tags + lastUsed
- `full` — 위에 + goal/outcome/decision/note + incidents + fallbackStrategy

비대화형 예:

```sh
codex-on-claude \
  --patterns=review,followup,fix \
  --context-policy=mixed \
  --improvement-loop=manual \
  --threads=basic \
  --yes
```

`--share-scope` 는 v0.3 부터 deprecated (무시됨). 팀 배포는 GitHub repo 를 그대로 공유하세요.

---

## 자주 쓰는 명령

```sh
codex-on-claude                    설치 (인터랙티브)
codex-on-claude reconfigure        재구성 (이전 답을 기본값으로)
codex-on-claude doctor             사전 점검만
codex-on-claude status             현재 설치 상태
codex-on-claude uninstall          제거
codex-on-claude analyze            사용 로그 분석 + 개선 후보
codex-on-claude suggest            개선 후보 채택/거부 기록
codex-on-claude log                수동 로그 추가
codex-on-claude threads ...        thread 카탈로그 관리 (list/show/new/note/resume...)
codex-on-claude help               도움말
```

---

## 프라이버시

- 모든 로그 / 카탈로그 / 결정 기록은 로컬에만 저장. 외부 전송 없음 (Codex/Claude API 자체 호출은 제외).
- 로그는 **메타데이터만** — timestamp / skill / sandbox / prompt 길이 / response 길이 / threadId / outcome.
- prompt / response **본문은 절대 기록되지 않음.**
- 언제든 끄기: `codex-on-claude reconfigure --improvement-loop=off --threads=off` (hook 도 제거됨).
- 완전 제거: `codex-on-claude uninstall` 또는 `rm -rf ~/.claude/codex-on-claude/`.

---

## 트러블슈팅

- **`claude mcp get codex` 가 "Failed to connect"** → 보통 sandbox 셸. 일반 터미널에서 다시 시도.
- **`Session not found for thread_id`** → MCP 서버 재시작됨. `/codex-resume` 또는 `codex-on-claude threads resume <id> "..."`.
- **`401 Invalid authentication credentials`** → `claude auth login --claudeai --email <당신>` 으로 재로그인.
- **새 세션에서 Skill 인식 안 됨** → Claude Code 완전 재시작.

---

## 자세한 내용 / 변경 이력

- 정본 사용 안내: [README.md](README.md)
- [`CHANGELOG.md`](CHANGELOG.md)
- 한국어 역사 기록:
  - [`docs/ko/implementation-log-2026-05-19.md`](docs/ko/implementation-log-2026-05-19.md) — 최초 구축 기록 (영어 요약: [`docs/implementation-log.md`](docs/implementation-log.md))
  - [`docs/ko/test-report-2026-05-20.md`](docs/ko/test-report-2026-05-20.md) — 2026-05-20 검증 보고서 (영어 요약: [`docs/test-report-2026-05-20.md`](docs/test-report-2026-05-20.md))

이슈 / PR: <https://github.com/pathcosmos/codex-on-claude>
라이선스: MIT
