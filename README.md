# codex-on-claude

> Claude Code 안에서 OpenAI **Codex CLI**를 보조 에이전트로 호출하기 위한 다리.
> MCP 기반 호출 + 표준 Skill/Agent/Plugin + **지능적 지속 개선 루프**까지 한 번에 설치한다.

[![npm version](https://img.shields.io/npm/v/codex-on-claude.svg)](https://www.npmjs.com/package/codex-on-claude)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## TL;DR

```sh
# 1. Codex CLI와 Claude Code가 이미 설치/로그인되어 있어야 함
codex --version && claude --version

# 2. 인터랙티브 설치 (권장)
npx codex-on-claude

# 또는 전역 설치
npm install -g codex-on-claude
codex-on-claude
```

설치 스크립트는 다음을 자동으로 수행한다:

1. **사전 점검(preflight)** — Node 18.17+, `codex`, `claude` 가 PATH에 있는지 확인. `codex doctor`와 `claude auth status`도 자동으로 점검. 누락된 항목이 있으면 설치 안내와 함께 중단할지 묻는다.
2. `claude mcp` 등록 상태 확인 → 미등록이면 `codex` MCP server를 user-scope로 등록 제안
3. 네 가지 옵션 인터랙티브 질문 → 답에 따라 Skill/Agent/Plugin을 `~/.claude/` 아래에 배치
4. 사용 로그/분석/개선 루프 활성화 (옵트인)
5. 다음번에 `codex-on-claude reconfigure` 한 번이면 옵션을 다시 바꿀 수 있다

사전 점검만 단독으로 돌리려면:

```sh
codex-on-claude doctor
```

---

## 왜 만들었나

Claude Code(주 에이전트)와 Codex CLI(보조 에이전트) 사이의 호출 경로는 MCP 한 줄이면 되지만, **실전 운용에 필요한 것은 그 위의 추상화**다:

- 매번 같은 옵션/지시문을 입력하지 않게 만드는 **Skill**
- 큰 응답이 메인 컨텍스트를 잡아먹지 않게 격리하는 **Agent**
- 팀에 그대로 배포할 수 있는 **Plugin** 번들
- 사용 패턴을 보고 더 효율적인 방식을 **자동으로 제안**하는 분석 엔진

이 패키지는 위 네 가지를 한 번에 설정하고, **시간이 지날수록 더 똑똑해지는 사용 방법**을 추적한다.

---

## 사전 요구사항

| 항목 | 최소 버전 | 비고 |
|---|---|---|
| Node.js | 18.17+ | 설치 스크립트 실행용 |
| Claude Code (`claude`) | 2.1.x | `claude --version`으로 확인 |
| Codex CLI (`codex`) | 0.13.x+ | `codex --version`, `codex doctor` |
| codex MCP 서버 | Connected | `claude mcp get codex` → `Status: ✓ Connected` |
| zsh 또는 bash | - | 설치 스크립트가 사용 |

Claude/Codex 모두 정상 로그인 + MCP 등록 상태여야 한다.

```sh
claude auth status --text
codex doctor --summary
claude mcp get codex          # Status: ✓ Connected 가 보여야 정상
codex-on-claude doctor        # 한 번에 모두 점검
```

---

## 설치

### A. npm (권장)

```sh
# 단발 실행 — 글로벌 설치 없이
npx codex-on-claude

# 전역 설치 후 임의 시점에 재호출 가능
npm install -g codex-on-claude
codex-on-claude
```

### B. 소스에서

```sh
git clone https://github.com/pathcosmos/codex-on-claude.git
cd codex-on-claude
node install/install.mjs
```

### C. 비대화형 설치 (CI/팀 자동화)

```sh
codex-on-claude \
  --patterns=review,followup,fix,routine \
  --context-policy=mixed \
  --improvement-loop=on-demand \
  --threads=basic \
  --yes
```

> v0.3에서 `--share-scope` 플래그는 deprecated. 팀 배포는 GitHub repo (https://github.com/pathcosmos/codex-on-claude)를 직접 clone하여 동봉된 `install/install.mjs` 를 실행하는 방식을 권장합니다.

---

## 설치 시 묻는 네 가지 옵션 (v0.3+)

각 답에 따라 설치되는 컴포넌트가 달라진다. 모든 옵션은 나중에 `codex-on-claude reconfigure`로 변경 가능.

### 1. 사용 패턴 (multi-select)

| 선택 | 설치 컴포넌트 |
|---|---|
| 단발 read-only 검토 | `/codex-review` |
| 긴 멀티턴 세션 | `/codex-followup` + `/codex-resume` |
| 워크스페이스 수정 위임 | `/codex-fix` (workspace-write 가드레일) |
| 정형화된 반복 작업 | `/codex-routine` |

### 2. 컨텍스트 정책 (single)

| 선택 | 결과 |
|---|---|
| `direct` — 응답을 메인에 직접 표시 | Skill만 설치, Agent 없음 |
| `summarize` — 격리 권장 | `codex-reviewer` Agent 추가 설치 |
| `mixed` — 상황별 혼용 (추천) | Skill + Agent 둘 다 |

### 3. 지속 개선 루프 (single)

| 선택 | 동작 |
|---|---|
| `off` | codex-analyze/improve/log Skill 미설치, 자동 분석 없음 |
| `on-demand` (추천) | codex-* Skill의 MUST 절차에 따라 **Skill 호출 시 명시 트리거로** `codex-on-claude log` 가 호출됨. 분석은 사용자가 `/codex-analyze` 또는 `codex-on-claude analyze`로 트리거. **OS hook 자동 기록은 없음** (v0.3 PostToolUse 통합 예정) |
| `periodic` | 위와 동일 + cron/loop와 결합한 정기 analyze 가이드 |

> 로깅은 **메타데이터만** 기록한다. prompt/response 본문은 절대 기록하지 않음. 외부 전송 없음. `chmod 700`. 언제든 `~/.claude/codex-on-claude/logs/` 삭제 가능.
>
> 자동화 시점에 대한 주의: `on-demand` 모드는 *Skill 본문이 그렇게 안내하기 때문에* log가 쌓이지, OS 레벨 hook이 자동으로 가로채는 게 아니다. LLM이 절차를 건너뛰면 해당 호출은 로그에 누락된다. 결정적 누락 방지가 필요하면 v0.3+ 의 `auto-on-skill` 옵션 (PostToolUse hook 기반) 또는 직접 `codex-on-claude log ...` 명령을 호출 후 실행하라.

### 4. Thread 영속 저장 (single, v0.2+)

| 선택 | 결과 |
|---|---|
| `off` | thread 카탈로그 사용 안 함 |
| `basic` (추천) | `threadId + title + tags + lastUsed + turnCount` 만 저장 |
| `full` | 위에 더해 `goal/outcome/decision/note` 작업 문맥 + `incidents` + `fallbackStrategy` 까지 |

저장 위치: `~/.claude/codex-on-claude/threads/<threadId>.json` + `index.json`. 외부 전송 없음. prompt/response 본문은 저장 안 함 — 사용자/Skill이 명시적으로 작성한 짧은 메모만 들어간다.

활용:

- 새 세션·새 머신에서 과거 Codex 작업을 `threads list/search`로 찾고 `threads resume`으로 이어간다
- `codex-reply`가 실패하면 thread 메타의 `fallbackStrategy`에 따라 자동 처리 (`auto-resume` / `ask` / `new`)
- 같은 thread에 incident가 누적되면 `analyze`가 fallback 전략 변경을 권장

---

## 설치 후 받는 도구

설치 결과는 선택에 따라 일부만 활성화된다.

### Skills (`~/.claude/skills/codex-*/SKILL.md`)
- `codex-review` — 현재 변경/디프에 대한 단발 read-only 리뷰
- `codex-followup` — 같은 threadId로 후속 질의
- `codex-resume` — MCP 세션 끊겼을 때 CLI fallback
- `codex-fix` — workspace-write로 파일 수정 위임 (가드레일 강제)
- `codex-routine` — 정기 반복 작업 템플릿화
- `codex-analyze` — 사용 로그 분석 + 개선 후보 표시 *(개선 루프 활성화 시)*
- `codex-improve` — 특정 개선 후보 채택/거부 *(개선 루프 활성화 시)*
- `codex-log` — Codex 호출 메타 로깅 *(개선 루프 활성화 시)*
- `codex-threads` — 영속 thread 카탈로그 탐색/주석/재개 *(threads ≠ off, v0.2+)*

### Agent (`~/.claude/agents/codex-reviewer.md`)
대량 응답을 격리 컨텍스트에서 처리하고 메인엔 요약만 반환. 컨텍스트 정책이 `summarize` 또는 `mixed`일 때 설치.

### Plugin bundle (deprecated v0.3+)
이전 버전(0.2.x)에서 `--share-scope=team` 으로 설치한 사용자에게는 `~/.claude/plugins/marketplaces/codex-bridge/` 가 남아 있을 수 있습니다. v0.3부터는 자동 생성/제거하지 않으며, 필요 시 사용자가 직접 정리합니다. 팀 배포는 GitHub 저장소를 그대로 clone해서 설치 스크립트를 공유하세요.

---

## 운영 흐름

```
┌───────────────────────────────────────────────────────────┐
│ Claude Code 세션                                          │
│                                                            │
│   사용자가 /codex-review 등 Skill 호출                     │
│            │                                               │
│            ▼                                               │
│   Skill 가이드대로 mcp__codex__codex 호출                  │
│            │                                               │
│            ▼                                               │
│   ┌─────── MCP Transport (codex mcp-server) ──────────┐   │
│   │   → Codex 모델 호출                                │   │
│   │   ← threadId + content                             │   │
│   └────────────────────────────────────────────────────┘   │
│            │                                               │
│            ▼                                               │
│   응답을 메인 컨텍스트로 (또는 codex-reviewer Agent로)     │
│            │                                               │
│            ▼                                               │
│   /codex-log 가 호출 메타를 ~/.claude/codex-on-claude/    │
│   logs/usage-YYYY-MM-DD.jsonl 에 append                    │
└───────────────────────────────────────────────────────────┘

주기적으로 또는 사용자가 원할 때:

   codex-on-claude analyze
       │
       ▼
   사용 로그 분석 → 개선 후보 (토큰 효율, 새 Skill, sandbox 조정 등)
       │
       ▼
   /codex-improve 로 후보별 채택/거부 결정 → 적용 + 검증
       │
       ▼
   결정 이력 ~/.claude/codex-on-claude/improvements/ 에 저장
   다음 분석에서 효과 추적
```

---

## CLI 레퍼런스

```
codex-on-claude               설치 (인터랙티브, 사전 점검 포함)
codex-on-claude reconfigure   옵션 재선택 (기존 답을 기본값으로)
codex-on-claude doctor        사전 점검만 단독 실행
codex-on-claude status        현재 설치 상태 표시
codex-on-claude uninstall     설치된 컴포넌트 제거
codex-on-claude analyze       사용 로그 분석 및 개선 후보 표시
codex-on-claude suggest       특정 후보 채택/거부 기록
codex-on-claude log           수동으로 사용 기록 추가
codex-on-claude threads ...   영속 thread 카탈로그 관리 (v0.2+)
codex-on-claude help          도움말
```

### threads 서브커맨드 (v0.2+)

```sh
codex-on-claude threads list [--status=active|resolved|archived] [--tag=...] [--since=7d]
codex-on-claude threads latest [--status=...] [--format=id|json]    # deterministic 최근 thread
codex-on-claude threads show <threadId>
codex-on-claude threads new  <threadId> --title="..." --tags=a,b --skill=codex-review --cwd="$PWD" --sandbox=read-only
codex-on-claude threads goal     <threadId> "Verify naming consistency"
codex-on-claude threads outcome  <threadId> "Codex flagged 3 issues"
codex-on-claude threads decision <threadId> "Adopt suggestion 2"
codex-on-claude threads note     <threadId> "임의 메모"
codex-on-claude threads incident <threadId> --issue=session-not-found --resolution="codex exec resume" --outcome=recovered
codex-on-claude threads tag      <threadId> --add=critical --remove=draft
codex-on-claude threads status   <threadId> resolved
codex-on-claude threads fallback <threadId> auto-resume
codex-on-claude threads search   "react refactor"
codex-on-claude threads resume   <threadId> "후속 prompt"
```

### 자주 쓰는 조합

```sh
# 설치 상태 확인
codex-on-claude status

# 옵션 재구성 (예: 격리 Agent 추가)
codex-on-claude reconfigure --context-policy=mixed --yes

# 최근 7일 분석을 마크다운으로 저장
codex-on-claude analyze --days=7 --format=markdown --save

# 분석 결과 2번 후보를 채택 기록
codex-on-claude suggest --apply=2

# 같은 후보를 사유와 함께 거부
codex-on-claude suggest --reject=2 --reason="의도된 패턴이라 유지"

# 전부 제거
codex-on-claude uninstall
```

---

## 검증 (설치 후)

### 1. MCP 등록 확인

```sh
claude mcp get codex
# Status: ✓ Connected 이 보여야 정상
```

### 2. Skill end-to-end (Claude Code 안에서)

새 Claude Code 세션을 시작하고 사용자 입력:

```
/codex-review 이 프로젝트의 README가 무엇을 약속하는지 한 문장으로 평가해.
```

Claude가 `mcp__codex__codex`를 호출하고, Codex의 답을 그대로(또는 격리 Agent 경유 요약) 보여주면 성공.

### 3. CLI에서 Codex 직접 호출

```sh
codex exec --skip-git-repo-check -C "$PWD" -s read-only --json \
  "Return exactly CODEX_OK and nothing else."
```

JSONL 이벤트가 흐르고 마지막에 `CODEX_OK`가 보이면 정상.

### 4. 분석 동작 확인

샘플 로그를 한 줄 만들고 analyze:

```sh
codex-on-claude log --skill=codex-review --sandbox=read-only \
  --prompt-chars=120 --response-chars=600 --elapsed-ms=2100 --outcome=ok
codex-on-claude analyze --days=1
```

---

## 운영 가이드

- **기본 sandbox는 `read-only`**. 수정이 필요한 명확한 작업에만 `workspace-write`. `danger-full-access`는 이 워크플로에서 사용하지 않는다.
- Claude와 Codex는 숨은 문맥을 자동 공유하지 않는다. 목표/파일/제약을 **Claude가 Codex에 명시적으로 전달**해야 한다.
- `threadId`는 메인 컨텍스트에 노출되어도 안전한 식별자다. 같은 MCP 프로세스 내 후속 질의는 `/codex-followup`을 우선, 실패 시 `/codex-resume`.
- `claude auth status`가 정상이어도 401이 발생할 수 있다 → `claude auth login --claudeai --email <you>` 재로그인.
- 설치 옵션을 줄이면 이전에 설치된 불필요 컴포넌트는 `reconfigure`가 자동으로 제거한다.

---

## 프라이버시 정책

- 사용 로그는 **로컬에만** 저장된다. 외부 전송 없음.
- 로그 항목은 **메타데이터만** 포함: timestamp, skill 이름, sandbox 모드, prompt/response 글자 수, threadId, 결과 코드.
- prompt/response **본문은 절대 기록하지 않는다.**
- 디렉토리 `~/.claude/codex-on-claude/`는 `chmod 700`.
- `codex-on-claude reconfigure`로 `improvement-loop=off`를 선택하면 로깅이 즉시 중단된다.
- 전체 삭제: `codex-on-claude uninstall` 또는 `rm -rf ~/.claude/codex-on-claude/`.

---

## 디렉토리 구조

```
codex-on-claude/
├── README.md                    이 문서
├── LICENSE
├── package.json                 npm 패키지 정의 (bin: codex-on-claude)
├── install/
│   ├── install.mjs              메인 설치/재구성/분석 CLI
│   ├── analyze.mjs              분석 + 개선 후보 생성 엔진
│   ├── manifest.json            옵션 ↔ 컴포넌트 매핑
│   └── components/
│       ├── agents/
│       │   └── codex-reviewer.md
│       └── skills/
│           ├── codex-review/SKILL.md
│           ├── codex-followup/SKILL.md
│           ├── codex-resume/SKILL.md
│           ├── codex-fix/SKILL.md
│           ├── codex-routine/SKILL.md
│           ├── codex-analyze/SKILL.md
│           ├── codex-improve/SKILL.md
│           └── codex-log/SKILL.md
└── docs/
    └── codex-on-claude-implementation-log.md   초기 구축 기록 (한국어)
```

설치 결과:

```
~/.claude/
├── skills/
│   ├── codex-review/SKILL.md         (선택 시)
│   ├── codex-followup/SKILL.md       (선택 시)
│   ├── codex-resume/SKILL.md         (선택 시)
│   ├── codex-fix/SKILL.md            (선택 시)
│   ├── codex-routine/SKILL.md        (선택 시)
│   ├── codex-analyze/SKILL.md        (improvement-loop ≠ off)
│   ├── codex-improve/SKILL.md        (improvement-loop ≠ off)
│   └── codex-log/SKILL.md            (improvement-loop ≠ off)
├── agents/
│   └── codex-reviewer.md             (context-policy ∈ {summarize, mixed})
└── codex-on-claude/
    ├── config.json                   설치 시 선택 결과
    ├── logs/usage-YYYY-MM-DD.jsonl   사용 로그
    ├── reports/                      analyze --save 결과
    └── improvements/                 채택/거부 이력
```

---

## 트러블슈팅

### `claude mcp get codex`가 "Failed to connect"

샌드박스 환경 안에서 실행한 경우 정상. 일반 셸에서 다시 실행:

```sh
claude mcp get codex
claude mcp list
```

### `Session not found for thread_id`

MCP 서버가 재시작된 것. fallback:

```sh
codex exec resume --skip-git-repo-check --json <threadId> "<후속 prompt>"
```

또는 Claude 안에서 `/codex-resume`.

### `401 Invalid authentication credentials`

`claude auth status`가 정상이라도 모델 호출이 401이면 재로그인:

```sh
claude auth login --claudeai --email <your-email>
```

### Skill이 새 세션에서 인식 안 됨

Claude Code를 완전히 재시작. Skill은 세션 시작 시점에 한 번 로드된다.

---

## 기여 / 라이선스

- 이슈/PR 환영: <https://github.com/pathcosmos/codex-on-claude>
- 라이선스: MIT

---

## 영어 요약 (English summary)

`codex-on-claude` installs a curated bridge of **Skills**, an optional isolated **Agent**, an optional **Plugin** bundle, and a **continuous improvement loop** so Claude Code can call OpenAI Codex CLI through MCP without re-typing options each time.

```sh
npx codex-on-claude              # interactive install
codex-on-claude reconfigure      # change options later
codex-on-claude status           # show current install
codex-on-claude analyze          # local-only usage analysis
codex-on-claude suggest --apply=N   # adopt an improvement
codex-on-claude uninstall        # remove everything
```

All logs are **local-only**, metadata-only, opt-in, and revocable at any time.

See sections above for the four install questions (patterns, context policy, share scope, improvement loop) and verification commands.
