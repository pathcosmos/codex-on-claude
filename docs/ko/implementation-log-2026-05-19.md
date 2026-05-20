# Claude Code에서 Codex CLI 서브 에이전트 사용 환경 구축 기록

## 1. 목적과 결론

이 문서는 Claude Code 세션에서 필요할 때 Codex CLI를 보조 에이전트로 호출하기 위해 수행한 기술 점검, 설정 변경, 문제 해결, 검증 결과를 기록한다.

최종 결론은 다음과 같다.

- 기술적으로 가능하다.
- 권장 방식은 Claude Code에 `codex mcp-server`를 user-scope MCP 서버로 등록하는 것이다.
- Claude Code에서 노출되는 Codex 도구는 `mcp__codex__codex`, `mcp__codex__codex-reply`이다.
- 단발 작업은 `mcp__codex__codex` 또는 `codex exec`로 처리할 수 있다.
- 같은 MCP 서버 프로세스 안에서 이어지는 대화는 `mcp__codex__codex-reply`로 처리할 수 있다.
- MCP 서버 재시작 후 `codex-reply`가 세션을 찾지 못하는 경우에는 `codex exec resume <threadId>`로 복구할 수 있다.

## 2. 환경 정보

작업 기준 정보는 다음과 같다.

- 작업일: 2026-05-19부터 2026-05-20까지
- 타임존: `Asia/Seoul`
- 셸: `zsh`
- 표시된 작업 경로: `/Users/lanco/aidata/pathcosmos/codex-on-claude`
- 실제 경로: `/Volumes/minim42tbtmm/pathcosmos/codex-on-claude`
- Claude Code 버전: `2.1.144`
- Codex CLI 버전: `codex-cli 0.131.0`
- Codex 실행 파일: `/Users/lanco/.nvm/versions/node/v22.20.0/bin/codex`
- Claude 실행 파일: `/Users/lanco/.local/bin/claude`
- Codex 기본 모델 설정: `gpt-5.5`
- Claude Code 기본 모델 설정: `opus`

작업 폴더는 git repository가 아니었다. `git status --short`는 다음과 같이 실패했다.

```text
fatal: not a git repository (or any parent up to mount point /Volumes)
Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).
```

따라서 이번 작업은 commit 없이 로컬 설정과 문서 파일 생성으로 마무리했다.

## 3. 초기 설치 및 CLI 확인

먼저 두 CLI가 모두 설치되어 있는지 확인했다.

```sh
which codex
codex --version
codex --help
which claude
claude --version
claude --help
```

확인 결과는 다음과 같았다.

- `codex`: `/Users/lanco/.nvm/versions/node/v22.20.0/bin/codex`
- `codex --version`: `codex-cli 0.131.0`
- `claude`: `/Users/lanco/.local/bin/claude`
- `claude --version`: `2.1.144 (Claude Code)`

`codex --help`에서 확인한 핵심 기능은 다음과 같다.

- `codex exec`: 비대화형 Codex 실행
- `codex review`: 비대화형 코드 리뷰
- `codex mcp-server`: Codex를 stdio MCP 서버로 시작
- `codex resume`, `codex fork`: 기존 Codex 세션 재개/분기
- `codex app-server`, `codex remote-control`: 실험적 app-server/remote-control 기능

`claude --help`에서 확인한 핵심 기능은 다음과 같다.

- `claude -p`, `claude --print`: 비대화형 출력
- `claude mcp`: MCP 서버 등록 및 관리
- `claude agents`: background agents 관리
- `claude --input-format stream-json`, `--output-format stream-json`: 스트리밍 입출력
- `claude --permission-mode`: 권한 모드 지정

## 4. Codex 상태 점검

처음 `codex doctor`를 샌드박스 안에서 실행했을 때는 provider endpoint DNS/reachability 문제가 보였다. 주요 증상은 다음과 같았다.

```text
⚠ websocket    Responses WebSocket failed; HTTPS fallback may still work
✗ reachability one or more required provider endpoints are unreachable over HTTP
DNS lookup failed
```

이 실패는 로컬 Codex 설치 문제가 아니라 현재 Codex 작업 샌드박스의 네트워크 제한 때문인지 확인하기 위해, 사용자 승인 후 샌드박스 밖에서 다시 실행했다.

```sh
codex doctor
```

샌드박스 밖 결과는 정상이었다.

```text
Codex Doctor v0.131.0 · macos-aarch64
13 ok · 1 idle · 0 warn · 0 fail ok
```

주요 정상 상태는 다음과 같았다.

- Codex runtime/install 정상
- `~/.codex/config.toml` 로드 정상
- Codex auth configured
- stored auth mode: `chatgpt`
- WebSocket 연결 성공: `HTTP 101 Switching Protocols`
- provider reachability 정상

## 5. Claude Code 인증 상태 점검과 401 문제

Claude Code 쪽도 인증 상태를 점검했다.

```sh
claude auth status --text
```

처음 실제 사용자 권한에서 확인한 상태는 다음과 같았다.

```text
Login method: Claude Max account
Organization: lanco.gh@gmail.com's Organization
Email: lanco.gh@gmail.com
```

JSON 형태로 확인한 값은 다음과 같았다.

```json
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "email": "lanco.gh@gmail.com",
  "orgId": "61f742d9-1cd2-4d48-948a-a3422dc13755",
  "orgName": "lanco.gh@gmail.com's Organization",
  "subscriptionType": "max"
}
```

하지만 실제 모델 호출은 실패했다.

```sh
claude -p --tools "" --output-format json "Return exactly CLAUDE_OK and nothing else."
```

실패 결과는 다음과 같았다.

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": true,
  "api_error_status": 401,
  "result": "Failed to authenticate. API Error: 401 Invalid authentication credentials"
}
```

명시적으로 `--model sonnet`을 지정해도 동일하게 `401 Invalid authentication credentials`가 발생했다. 환경변수도 확인했지만 `ANTHROPIC_API_KEY` 같은 직접적인 override는 없었다.

```sh
env | cut -d= -f1 | rg '^(ANTHROPIC|CLAUDE|AWS|GOOGLE|VERTEX|BEDROCK|API)'
```

확인된 관련 환경변수는 다음 정도였다.

```text
AWS_REGION
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

해결은 Claude Code 재로그인이었다.

```sh
claude auth login --claudeai --email lanco.gh@gmail.com
```

브라우저 로그인 플로우가 열렸고, CLI는 다음 상태에서 대기했다.

```text
Opening browser to sign in…
Paste code here if prompted >
```

브라우저 승인이 끝난 뒤 CLI는 다음을 반환했다.

```text
Login successful.
```

재로그인 후 다시 실행한 Claude 모델 호출은 성공했다.

```sh
claude -p --tools "" --output-format json "Return exactly CLAUDE_OK and nothing else."
```

성공 결과의 핵심 값은 다음과 같았다.

```json
{
  "is_error": false,
  "result": "CLAUDE_OK",
  "session_id": "44eb996b-a256-445e-be93-3c224cae10bb"
}
```

## 6. Codex 비대화형 호출 검증

Claude Code에서 Codex를 서브로 부르는 최소 조건을 확인하기 위해 `codex exec`를 먼저 검증했다.

처음 다음 명령은 `-a` 옵션이 `codex exec`에서 지원되지 않아 실패했다.

```sh
codex exec --ephemeral --skip-git-repo-check -s read-only -a never --json "Return exactly CODEX_OK and nothing else."
```

실패 메시지는 다음과 같았다.

```text
error: unexpected argument '-a' found
```

올바른 명령으로 다시 실행했다.

```sh
codex exec --ephemeral --skip-git-repo-check -s read-only --json "Return exactly CODEX_OK and nothing else."
```

성공 결과는 JSONL 이벤트로 반환되었다.

```json
{"type":"thread.started","thread_id":"019e3f99-2717-7860-b40e-2932df929607"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"CODEX_OK"}}
```

이 결과로 셸에서 Codex를 단발성 서브 에이전트처럼 호출할 수 있음을 확인했다.

## 7. Codex MCP 서버 도구 확인

다음으로 `codex mcp-server`가 실제로 Claude Code에 붙일 수 있는 MCP 서버인지 확인했다. 먼저 샌드박스 안에서 JSON-RPC handshake를 시도했지만 Codex state DB가 read-only로 열리면서 실패했다.

```text
failed to initialize state runtime at /Users/lanco/.codex: error returned from database: (code: 8) attempt to write a readonly database
```

사용자 승인 후 샌드박스 밖에서 다시 시도했다.

```sh
printf '<initialize/tools-list json-rpc payload>' | codex mcp-server
```

`tools/list` 결과로 다음 두 도구가 노출되는 것을 확인했다.

```text
codex
codex-reply
```

도구별 의미는 다음과 같다.

- `codex`: 새 Codex 세션 시작
- `codex-reply`: 기존 Codex 세션에 `threadId`로 후속 prompt 전달

`codex` 도구 입력 스키마의 핵심 필드는 다음과 같았다.

- `prompt`
- `cwd`
- `sandbox`: `read-only`, `workspace-write`, `danger-full-access`
- `approval-policy`: `untrusted`, `on-failure`, `on-request`, `never`
- `model`
- `developer-instructions`
- `base-instructions`

`codex` 도구 출력 스키마는 다음 구조였다.

```json
{
  "threadId": "string",
  "content": "string"
}
```

## 8. Codex MCP 직접 호출 검증

MCP `tools/call`로 실제 Codex 호출을 수행했다.

요청 요지는 다음과 같았다.

```json
{
  "name": "codex",
  "arguments": {
    "prompt": "Return exactly MCP_CODEX_OK and nothing else.",
    "cwd": "/Volumes/minim42tbtmm/pathcosmos/codex-on-claude",
    "sandbox": "read-only",
    "approval-policy": "never"
  }
}
```

반환된 최종 결과는 다음과 같았다.

```json
{
  "threadId": "019e3f9b-4a09-78c1-b5e9-d6a97dfb99f1",
  "content": "MCP_CODEX_OK"
}
```

이 단계에서 MCP 방식이 단순 등록만 가능한 수준이 아니라 실제 Codex 모델 호출까지 수행할 수 있음을 확인했다.

## 9. Codex 문맥 유지 방식 검증

문맥 유지에는 두 가지 경로가 있었다.

첫째, 같은 MCP 서버 프로세스 안에서는 `codex-reply`가 정상 동작했다. Node.js로 같은 `codex mcp-server` 프로세스를 유지하면서 다음 순서로 검증했다.

1. `codex` 도구로 "Remember token CONTEXT_OK. Reply with only FIRST_OK." 요청
2. 반환된 `threadId` 저장
3. 같은 서버 프로세스에서 `codex-reply`로 "What token were you told to remember?" 요청

검증 결과는 다음과 같았다.

```json
{
  "threadId": "019e3f9c-6470-7ac0-adb4-2f5174b9fcc2",
  "first": {
    "threadId": "019e3f9c-6470-7ac0-adb4-2f5174b9fcc2",
    "content": "FIRST_OK"
  },
  "second": {
    "threadId": "019e3f9c-6470-7ac0-adb4-2f5174b9fcc2",
    "content": "CONTEXT_OK"
  },
  "secondIsError": false
}
```

둘째, 새 MCP 서버 프로세스에서 곧바로 `codex-reply`를 호출하면 세션을 찾지 못했다.

```json
{
  "content": "Session not found for thread_id: 019e3f9b-4a09-78c1-b5e9-d6a97dfb99f1",
  "isError": true
}
```

하지만 같은 `threadId`를 `codex exec resume`에 넘기면 문맥 복구가 가능했다.

```sh
codex exec resume --skip-git-repo-check --json 019e3f9c-6470-7ac0-adb4-2f5174b9fcc2 "What token were you told to remember? Reply with only that token."
```

성공 결과는 다음과 같았다.

```json
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"CONTEXT_OK"}}
```

따라서 운영 기준은 다음과 같이 정했다.

- 같은 Claude Code 세션/MCP 서버 생명주기 안에서는 `mcp__codex__codex-reply`를 사용한다.
- MCP 서버가 재시작되거나 `codex-reply`가 세션을 찾지 못하면 `codex exec resume <threadId>`를 fallback으로 사용한다.

## 10. Claude Code에 Codex MCP 서버 등록

최종 등록은 Claude Code의 user-scope MCP 설정으로 진행했다.

```sh
claude mcp add --scope user codex -- codex mcp-server
```

결과는 다음과 같았다.

```text
Added stdio MCP server codex with command: codex mcp-server to user config
File modified: /Users/lanco/.claude.json
```

등록 직후 샌드박스 안에서 `claude mcp list`를 실행하면 `Failed to connect`가 나왔다. 원인은 `claude mcp list`가 실제로 stdio MCP 서버를 실행하며 건강 상태를 확인하는데, 샌드박스 안에서는 Codex state DB 접근과 네트워크 제한의 영향을 받기 때문이다.

사용자 승인 후 샌드박스 밖에서 다시 확인했다.

```sh
claude mcp get codex
```

결과는 다음과 같았다.

```text
codex:
  Scope: User config (available in all your projects)
  Status: ✓ Connected
  Type: stdio
  Command: codex
  Args: mcp-server
  Environment:

To remove this server, run: claude mcp remove "codex" -s user
```

전체 MCP 목록도 확인했다.

```sh
claude mcp list
```

결과는 다음과 같았다.

```text
claude.ai Google Drive: https://drivemcp.googleapis.com/mcp/v1 - ✓ Connected
claude.ai Google Calendar: https://calendarmcp.googleapis.com/mcp/v1 - ✓ Connected
claude.ai Gmail: https://gmailmcp.googleapis.com/mcp/v1 - ✓ Connected
codex: codex mcp-server - ✓ Connected
```

## 11. Claude에서 Codex MCP 호출 검증

Claude Code가 실제로 등록된 Codex MCP 도구를 호출할 수 있는지 검증했다.

처음 다음 명령은 `--allowedTools` 옵션 전달 방식이 애매해 prompt 인식에 실패했다.

```sh
claude -p --output-format json --permission-mode dontAsk --allowedTools mcp__codex__codex "Use the Codex MCP tool..."
```

실패 메시지는 다음과 같았다.

```text
Error: Input must be provided either through stdin or as a prompt argument when using --print
```

옵션을 `--allowedTools=mcp__codex__codex` 형태로 다시 전달했다.

```sh
claude -p --output-format json --permission-mode dontAsk --allowedTools=mcp__codex__codex "Use the Codex MCP tool to ask Codex: Return exactly CLAUDE_TO_CODEX_OK and nothing else. Then return Codex's exact answer and nothing else."
```

결과는 성공이었다.

```json
{
  "is_error": false,
  "result": "CLAUDE_TO_CODEX_OK",
  "session_id": "9bdb9d2e-416d-4b2b-be81-39d1f1fb7441"
}
```

최종적으로 도구 호출 이벤트까지 명확히 보려고 `stream-json`으로 다시 검증했다. `stream-json`은 `--verbose`가 필요했다.

```sh
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk \
  --allowedTools=mcp__codex__codex \
  "Use the Codex MCP tool to ask Codex: Return exactly STREAM_CODEX_OK and nothing else. Then return Codex's exact answer and nothing else."
```

초기 system 이벤트에서 다음을 확인했다.

```json
{
  "mcp_servers": [
    {
      "name": "codex",
      "status": "connected"
    }
  ],
  "tools": [
    "mcp__codex__codex",
    "mcp__codex__codex-reply"
  ],
  "model": "claude-haiku-4-5-20251001"
}
```

Claude가 실제 호출한 도구 이벤트는 다음과 같았다.

```json
{
  "type": "tool_use",
  "name": "mcp__codex__codex",
  "input": {
    "prompt": "Return exactly STREAM_CODEX_OK and nothing else."
  }
}
```

Codex MCP의 tool result는 다음과 같았다.

```json
{
  "threadId": "019e4132-7f33-7af2-9abd-f07163eb56cb",
  "content": "STREAM_CODEX_OK"
}
```

Claude의 최종 반환값도 다음과 같았다.

```text
STREAM_CODEX_OK
```

이로써 Claude Code -> Codex MCP -> Codex 모델 호출 -> Claude Code 응답 경로가 end-to-end로 검증되었다.

## 12. 생성된 결과물

이번 작업으로 생성되거나 변경된 결과물은 다음과 같다.

### Claude Code 사용자 설정

`/Users/lanco/.claude.json`에 user-scope MCP 서버가 추가되었다.

등록 내용은 Claude CLI 기준으로 다음과 같이 보인다.

```text
codex:
  Scope: User config (available in all your projects)
  Status: ✓ Connected
  Type: stdio
  Command: codex
  Args: mcp-server
  Environment:
```

### 프로젝트 README

`README.md`를 생성해 기본 사용법, fallback 명령, 검증 명령을 기록했다.

핵심 내용은 다음과 같다.

- Claude Code에서 사용할 도구명: `mcp__codex__codex`, `mcp__codex__codex-reply`
- read-only 리뷰 명령
- `codex exec resume` fallback
- `claude auth login --claudeai --email lanco.gh@gmail.com` 재로그인 절차

### 상세 진행 문서

이 문서 `docs/codex-on-claude-implementation-log.md`를 추가해 진행 과정과 검증 결과를 상세 기록했다.

## 13. 운영 기준

실제 업무에서 사용할 때의 권장 기준은 다음과 같다.

- 기본은 Codex를 `read-only` 보조 검토자로 사용한다.
- 코드 수정이 필요하면 `workspace-write`를 쓰되, Claude가 Codex에 파일 범위와 작업 책임을 명시해야 한다.
- `danger-full-access`는 이 워크플로에서 사용하지 않는다.
- Claude와 Codex는 숨은 문맥을 자동 공유하지 않는다. Claude가 Codex에 목표, 관련 파일, 현재 결론, 제약 조건을 명시적으로 전달해야 한다.
- 새 Claude Code 세션을 시작해야 MCP 서버 목록과 도구 목록이 확실히 반영된다.
- Codex가 반환하는 `threadId`는 장기 작업에서 따로 보존한다.
- 같은 MCP 서버 프로세스에서는 `codex-reply`를 우선 사용하고, 실패하면 `codex exec resume <threadId>`로 전환한다.

## 14. 재현 명령 모음

Codex 상태 확인:

```sh
codex doctor --summary
```

Claude 인증 확인:

```sh
claude auth status --text
```

Claude 재로그인:

```sh
claude auth login --claudeai --email lanco.gh@gmail.com
```

Codex MCP 등록:

```sh
claude mcp add --scope user codex -- codex mcp-server
```

Codex MCP 등록 확인:

```sh
claude mcp get codex
claude mcp list
```

Claude에서 Codex MCP 호출 확인:

```sh
claude -p --model haiku --verbose --output-format stream-json \
  --permission-mode dontAsk \
  --allowedTools=mcp__codex__codex \
  "Use the Codex MCP tool to ask Codex: Return exactly STREAM_CODEX_OK and nothing else. Then return Codex's exact answer and nothing else."
```

Codex 단발 실행:

```sh
codex exec --skip-git-repo-check -C "$PWD" -s read-only --json \
  "Return exactly CODEX_OK and nothing else."
```

Codex 문맥 재개:

```sh
codex exec resume --skip-git-repo-check --json <threadId> \
  "Continue from the previous Codex context."
```

## 15. 남은 주의사항

- `claude auth status`가 로그인 상태를 보여도 실제 `claude -p` 호출이 `401 Invalid authentication credentials`를 낼 수 있다. 이 경우 재로그인이 필요하다.
- 샌드박스 안에서의 `codex doctor`, `claude mcp list`, `codex mcp-server` 결과는 실제 로컬 환경과 다를 수 있다.
- `codex-reply`는 같은 MCP 서버 프로세스 안에서는 정상 동작했지만, 새 MCP 서버 프로세스에서는 `Session not found for thread_id`가 발생할 수 있다.
- 이 폴더는 git repository가 아니므로 변경 이력 관리는 별도로 하지 않았다.
- OAuth URL, 인증 코드, 토큰, 쿠키, keychain 내부 값은 보안상 이 문서에 기록하지 않았다.
