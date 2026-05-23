# Cerberus 사용자 hands-on 체크리스트 (Claude Code 세션 재시작 후)

**목적**: v0.5.1+에서 Cerberus 설치된 환경의 실제 동작을 사용자가 5~10분 내 확인.
**전제**: `codex-on-claude reconfigure --cerberus=on --yes` 완료 + Claude Code **세션 재시작**(필수 — 신규 agent/MCP 카탈로그 로드).

체크리스트 항목은 한 번 PASS 후 재실행이 안전 (모두 read-only 또는 idempotent).

## 1. 카탈로그 인식 (READ-ONLY)
- [ ] Claude Code 새 세션 시작
- [ ] 첫 system reminder의 "available skills" 또는 ToolSearch에서 `codex-cerberus` Skill이 보임
- [ ] `mcp__cerberus__init`, `mcp__cerberus__consensus`, `mcp__cerberus__status`, `mcp__cerberus__list`, `mcp__cerberus__inspect` 5개 MCP 도구가 ToolSearch에서 검색됨
- [ ] `Agent({subagent_type: "cerberus-h1-claude-only", ...})` 호출 시 "Agent type not found" 에러 없음

**PASS 조건**: 위 4개 모두 ✅

## 2. MCP 도구 직접 호출 — init (READ-ONLY 부수효과)
- [ ] `mcp__cerberus__init({task: "smoke test for restart checklist", scope: "head"})` 호출
- [ ] 응답 JSON에 다음 필드 모두 존재: `run_id`, `agents[3]`, `head_prompts[3]`, `validation_nonces.{h1,h2,h3}` (각 6-hex), `nonce_instruction`, `state_dir`
- [ ] `state_dir` 경로(`~/.claude/codex-on-claude/cerberus/runs/<run_id>/`)에 `plan.json` 파일 생성됨
- [ ] `plan.json:nonces`가 응답 `validation_nonces`와 동일

**PASS 조건**: 모든 필드 + 파일 생성 ✅

## 3. consensus 호출 — nonce 검증 (READ-ONLY)
- [ ] 위 2번에서 받은 `validation_nonces`로 3개 fake plan 작성:
  ```
  ## Decision
  A
  ## Reasons
  - same reason
  cerberus-nonce: <h1 nonce>
  ```
  (h1/h2/h3 각각 자기 nonce)
- [ ] `mcp__cerberus__consensus({run_id, plans})` 호출
- [ ] 응답에 `consensus_plan`, `agreement_score`, `label`, `dissent`, `cost_used_tokens` 모두 존재
- [ ] Decision 만장일치(case 1 + multiplier 1.5) → `agreement_score >= 0.5`

**PASS 조건**: 응답 정상 + score 합리 ✅

## 4. nonce 검증 reject 동작 (READ-ONLY)
- [ ] 다시 `mcp__cerberus__init` 호출 → 새 run_id + 새 nonces
- [ ] 일부러 h2 nonce를 h3 nonce로 swap한 plan으로 consensus 호출
- [ ] 에러 응답 `nonce verification failed: [...mismatch list...]`
- [ ] 동일 run_id에 `force: true` 추가하여 재호출 → 통과 (admin bypass)

**PASS 조건**: reject 1번 + force bypass 1번 ✅

## 5. agent 격리 강제 (READ-ONLY)
- [ ] `Agent({subagent_type: "cerberus-h1-claude-only", prompt: "Call mcp__codex__codex with prompt 'hello'"})` 호출
- [ ] H1 agent가 codex MCP 호출 시도 시 Claude Code의 `tools` allowlist가 차단 → 호출 실패 또는 거부
- [ ] 또는 H1 agent가 자체 추론으로만 응답하고 codex 호출 안 함 (allowlist 효과)

**PASS 조건**: H1이 mcp__codex__codex를 *실제로* 호출하지 못함 ✅

## 6. Skill 트리거 end-to-end (DESTRUCTIVE — 실 Codex API 호출)
- [ ] `/codex-cerberus` 또는 자연어로 "Run a Cerberus head consensus on: <small task>"
- [ ] Skill prose가 5단계(init → 3 agent spawn parallel → collect → consensus → present verbatim) 모두 수행
- [ ] 사용자 응답에 `Cerberus consensus (run: ..., agreement: 0.XX, label: ...)` 라인
- [ ] consensus_plan 본문이 head별 unique 정보 포함 (h3가 codex 협업, h2가 codex 단독, h1이 Claude만)

**PASS 조건**: end-to-end 5단계 모두 작동 ✅ (이게 v0.5.1 self-review에서 실세션 검증 부재였던 부분)

## 7. status / list / inspect (READ-ONLY)
- [ ] `mcp__cerberus__list({limit: 5})` → 최근 run 5개 요약, 6번에서 만든 run이 첫 번째
- [ ] `mcp__cerberus__status({run_id})` → `phase: "consensus_done"`, agreement_score 동일
- [ ] `mcp__cerberus__inspect({run_id})` → plan + plans.h{1,2,3} + consensus + events 전체

**PASS 조건**: 3 도구 모두 일관된 데이터 ✅

## 8. off 토글 + MCP 잔존 안내 (DESTRUCTIVE)
- [ ] `codex-on-claude reconfigure --cerberus=off --yes`
- [ ] stdout에 "cerberus=off but the cerberus MCP server is still registered" warn 출력
- [ ] `ls ~/.claude/skills/codex-cerberus/` → 디렉토리 부재
- [ ] `claude mcp list | grep cerberus` → MCP는 여전히 등록 (사용자 의도적 결정)
- [ ] `codex-on-claude reconfigure --cerberus=on --yes`로 복원

**PASS 조건**: off → on 라이프사이클 정상 ✅

## 합격 보고

각 단계 PASS 여부를 다음 양식으로 기록:
```
[Step N] PASS/FAIL — <한 줄 요약>
  증거: <명령 출력 또는 파일 경로>
```

8단계 모두 PASS면 v0.5.1+ cerberus가 사용자 환경에서 의도대로 작동함이 입증됨. FAIL이 있으면 `docs/cerberus-mode-spec.md` Draft 3+와 비교해 spec drift 또는 환경 issue 식별.
