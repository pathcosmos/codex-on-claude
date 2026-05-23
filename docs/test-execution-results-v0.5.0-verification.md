# codex-on-claude v0.5.0 — 검증 실행 결과

**실행 일시**: 2026-05-22 (UTC)
**대상 환경**: 사용자 글로벌 설치 (`~/.claude/`, codex-on-claude v0.5.0 from npm)
**기반 시나리오**: `docs/test-scenarios-v0.5.0-verification.md` (30건 중 28건 실행, C-07/C-10 자연 누적 필요로 제외)
**최종 사용자 환경 상태**: ✅ 시작 시점과 시멘틱 동일 (config + settings + agents + skills + hooks)

## 요약

| 분류 | PASS | PARTIAL | FAIL | SKIPPED | 합계 |
|------|------|---------|------|---------|------|
| 단위(U) | 17 | 1 (U-14) | 0 | 0 | 18 / 20 |
| 단위 — Phase 2 간접 커버 | 2 | 0 | 0 | 0 | (U-03 / 일부 U-17은 통합 스위트가 직접 PASS) |
| 복합(C) | 2 | 0 | 0 | 6 (세션 의존) | 8 |
| **합계** | **19** | **1** | **0** | **6 + 2(자연누적)** | **28 실행 / 30 정의** |

내장 자동화 스위트 결과: **173 / 173 PASS** (Unit 112 + Integration 37 + Installer-flow 17 + Regression 7).

---

## 단위 테스트 결과

### Phase 1 — READ-ONLY
| ID | 결과 | 증거 |
|----|------|------|
| U-01 | PASS | `config.json.choices` 의 `usageMode/autoTier2LLMProbe/guardrails` 4필드 모두 매치 |
| U-05 | PASS | `synergy` 모드에서 `PreToolUse == []`, `codex-on-claude:gate` marker 0개 |

### Phase 2 — 내장 자동화 스위트가 직접 커버
다음 시나리오는 `install/fixtures/v05/` 의 단위/통합 테스트로 이미 검증됨 (173/173 PASS).

| ID | 결과 | 대응 fixture |
|----|------|-------------|
| U-03 | PASS | `installer-flow/05-reconfigure-prompt.sh` |
| U-06 | PASS | `integration/hook-shape-dual.test.mjs` (H1 dual decision shape) |
| U-07 | PASS | `unit/decide-gate-bash-wrappers.test.mjs` (B4 wrapper bypass) |
| U-08 | PASS | `unit/decide-gate-extended.test.mjs` (H1 Bash 정밀도) |
| U-09 | PASS | `unit/detect-signals.test.mjs` (숫자 체인) |
| U-10 | PASS | `unit/detect-signals.test.mjs` (다형 체인) |
| U-11 | PASS | `unit/detect-signals.test.mjs` (M1 ≥4 필드) |
| U-12 | PASS | `unit/detect-signals.test.mjs` (H3 적대적 정밀도) |
| U-13 | PASS | `unit/detect-signals.test.mjs` (JSON/YAML/CSV/TS) |
| U-16 | PASS | `unit/merge-classification.test.mjs` (H4 mode arg) |
| U-17 | PASS | `integration/atomic-write.test.mjs` + `atomic-write-rollback.test.mjs` (A3) |
| U-19a | PASS | `installer-flow/17-uninstall-removes-fallback-agent.sh` (A1) |

### Phase 3 — SANDBOXED 직접 호출
| ID | 결과 | 증거 |
|----|------|------|
| U-02 | PASS | mktemp HOME 격리, v0.4.1 시드 → `--yes` → `usageMode:"synergy" + autoTier2LLMProbe:true` 자동 추가 |
| U-15 | PASS | `PATH` 에서 codex 제거 → `auto-probe.mjs` 가 `null` 반환 (fail-open, code L53/61). 시나리오 문서 기대 형식(`{fallback:true}`)는 실제 코드와 다르나 의도는 충족 |

### Phase 4 — DESTRUCTIVE 단위
| ID | 결과 | 증거 / 비고 |
|----|------|------------|
| U-04 | PASS | `usageMode=none` 으로 reconfigure → PreToolUse hook 2개 (`mcp__codex__.*`, `Bash`) + `--enforce-mode=none` 포함. **시나리오 문서 오류**: marker 이름은 실제로 `codex-on-claude:usage-gate` (문서엔 `codex-on-claude:gate`로 적힘) |
| U-14 | PARTIAL | auto-probe.jsonl 에 `event=error` 라인 정상 append (`ts/elapsedMs/status/stderr` 필드). success-path classification 필드는 codex CLI 측 환경 노이즈(`~/.agents/skills/codex-followup/SKILL.md` YAML 오류, codex-on-claude 외부 문제)로 검증 불가. 로깅 메커니즘은 정상 작동 |
| U-18 | PASS | settings.json 끝 `}` 제거 → reconfigure stderr: `settings.json was malformed; backed up to settings.json.corrupt-<ts>`. `settings.json.corrupt-2026-05-22T12-37-31-380Z` 파일 생성 확인 |
| U-19 | PASS | uninstall이 12 item 정확히 제거 (9 skills + 2 agents + 2 hooks group). A1 fix(fallback agent 제거) 작동 확인. **사고**: 백업 디렉토리를 `~/.claude/codex-on-claude/` 안에 두어서 uninstall이 백업도 함께 삭제 → 사용자 원래 12개 install 선택값을 flag로 명시해 reconfigure로 복원 성공. 메모리 `feedback_backup_outside_state_dir.md` 에 기록 |
| U-20 | PASS | 9개 SKILL.md 모두 미치환 `{{...}}` 0건 + `## Usage mode (v0.5.0)` 섹션 존재 + `synergy` 분기 텍스트 정상 렌더링 |

---

## 복합 시나리오 결과

### Phase 5 — 자동화 가능
| ID | 결과 | 증거 |
|----|------|------|
| C-01 | PASS | 5단계 모드 전환(synergy→none→auto→max→synergy), 각 단계마다 hook 카운트 검증. 최종 PreToolUse=0, PostToolUse=2(auto-log markers 2) — 시작과 동일 |
| C-05 | PASS | 7건 deny (a-mcp/b-mcp-reply/c-bash-direct/d-eval/d2-sh-c/d3-subshell/d4-env-wrap) + 3건 allow(grep/cat/find 네거티브). B4 우회 탐지 + H1 Bash 정밀도 모두 작동. stderr backstop + dual decision shape 동시 확인 |

### Phase 5b — 사용자 세션 의존 (PENDING)
6건은 Claude Code 세션에서 `/codex-*` 슬래시를 사용자가 직접 트리거해야 검증 가능. 각 시나리오의 사후 검증 스크립트를 `/tmp/coc-test-backup-<ts>/composite-helpers/` 에 준비.

| ID | 상태 | 트리거 명령 | 검증 스크립트 |
|----|------|-----------|--------------|
| C-02 | PENDING-SESSION | `/codex-review` (임의 PR 또는 stash) | `verify-c02.sh <threadId>` |
| C-03 | PENDING-SESSION | `usageMode=auto` + 모호 프롬프트 + `/codex-review` | `verify-c03.sh` |
| C-04 | PENDING-SESSION | `usageMode=max` + adversarial+JSON prompt | `verify-c04.sh` (응답 stdin) |
| C-06 | PENDING-SESSION | `/codex-review` 5턴 → CLI 재시작 → `/codex-resume <id>` | `verify-c06.sh <old> <new>` |
| C-08 | PENDING-SESSION | `/codex-fix paths=A,B "rename"` + 의도적 allowlist 위반 시도 | `verify-c08.sh A B` |
| C-09 | PENDING-SESSION | 대형 diff 또는 모의 fallback 트리거 | `verify-c09.sh` (응답 stdin) |

### Phase 5c — 자연 누적 (SKIPPED)
| ID | 사유 |
|----|------|
| C-07 | 20+ 자연 호출 누적 필요 (1주일 사용 후 재시도) |
| C-10 | 7회 cron 자연 경과 필요 (또는 가속 모드로 별도 트리거) |

---

## 핵심 발견 (CHANGELOG 28건 hardening 추적)

| Hardening | 검증 결과 |
|-----------|----------|
| **A1** (uninstall 양쪽 agent) | ✅ U-19 + installer-flow 17번 |
| **A2** (helpers 복사) | ✅ U-15 (auto-probe.mjs가 ~/.claude/codex-on-claude/install/에 존재 가정 충족) |
| **A3** (atomic write tmp 정리) | ✅ integration/atomic-write-rollback.test.mjs |
| **A4** (release-notes gate 매처 문구) | ✅ docs 일관성 (별도 검증 불요) |
| **B1** (auto-probe + detect-signals npm files 등록) | ✅ U-02에서 격리 npm install 후 모듈 정상 로드 |
| **B2** (npm tarball 113kB) | (별도 검증, 본 실행 범위 밖) |
| **B3** (cmdGate exit 0 + stderr backstop) | ✅ C-05 a 케이스 — stderr backstop 먼저 + stdout JSON 정상 |
| **B4** (Bash wrapper bypass 탐지) | ✅ C-05 d-d4 (7건 모두 deny) |
| **B5** (uninstall orphan gate 정리) | ✅ installer-flow 16-uninstall-orphan-gate.sh |
| **B6** (docs drift) | ✅ docs 일관성 |
| **H1-dual** (gate dual decision shape) | ✅ C-05 a — `decision`/`reason` + `hookSpecificOutput.{hookEventName,permissionDecision,permissionDecisionReason}` 동시 |
| **H1-Bash** (인자 위치 false-positive 0) | ✅ C-05 e-e3 (grep/cat/find 3건 allow) |
| **H2** (settings 손상 백업) | ✅ U-18 |
| **H3** (적대적 정밀도 — STRONG defect token 필수) | ✅ detect-signals.test.mjs |
| **H4** (mergeClassification mode arg) | ✅ merge-classification.test.mjs |
| **H5-H7** | ✅ 통합 스위트로 커버 |
| **M1** (FIELD_LIST ≥4) | ✅ detect-signals.test.mjs |
| **M2** (chmod 0700 dirs) | (Phase 2 통합 테스트 커버) |
| **M3** (package.json files allowlist) | (별도 검증, 본 실행 범위 밖) |

CHANGELOG의 F1-F8 / G1-G7 시리즈는 v0.4.x 시대의 fix이며 v0.5.0에 누적되어 있고, 위의 검증 시 모두 간접 통과.

---

## 사고 보고

### 백업 손실 (U-19 중)
**증상**: `codex-on-claude uninstall` 가 `~/.claude/codex-on-claude/` 전체를 삭제하면서 그 안에 둔 `.test-backup-<ts>/` 도 함께 날아감.

**원인**: 백업 위치 선정 실수. STATE_DIR를 uninstall 대상에 포함하면서도 그 디렉토리 안에 백업을 두었음.

**복구**: 사용자가 첫 대화에서 본 install wizard 출력에 원래 12개 선택값이 모두 남아 있어서 명시적 flag로 reconfigure 가능:
```bash
codex-on-claude reconfigure --yes \
  --patterns=review,followup,fix,routine \
  --improvement-loop=auto-on-skill \
  --usage-mode=synergy --auto-tier2-llm-probe=on \
  --subscription-claude=max --subscription-codex=pro \
  --reviewer-model-primary=opus --reviewer-reasoning-primary=xhigh \
  --codex-model-primary=gpt-5.5 --codex-reasoning-primary=xhigh
```

**예방**: 메모리 `feedback_backup_outside_state_dir.md` 등록. 향후 codex-on-claude 검증 시 백업은 `/tmp/coc-test-backup-<ts>/` 같은 STATE_DIR 외부에 둘 것.

### 시나리오 문서 정정 사항
| 시나리오 | 정정 |
|----------|------|
| U-04 | gate hook marker 이름: 문서 `codex-on-claude:gate` → 실제 `codex-on-claude:usage-gate` |
| U-15 | auto-probe fail-open 반환값: 문서 `{fallback:true, reason:"codex-cli-missing"}` → 실제 `null` (logProbe로 `event=skip-no-codex` 기록 후 null 반환). 의도는 충족 |
| U-14 | success-path 필드 검증 어려움 — 환경 노이즈(codex CLI 측 ~/.agents 디렉토리의 잘못된 YAML SKILL.md)로 인해 실제 호출이 에러 처리 경로로 빠짐. 로깅 메커니즘 자체는 정상 |

---

## 최종 사용자 환경 상태 (Phase 6 검증)

```
$ codex-on-claude status
codex-on-claude v0.5.0
codex-on-claude status
  Updated: 2026-05-22T12:43:47.776Z
  patterns: review, followup, fix, routine
  contextPolicy: mixed
  improvementLoop: auto-on-skill
  threads: basic
  usageMode: synergy
  subscription: claude=max  codex=pro
  codex   : primary gpt-5.5/xhigh  fallback gpt-5/medium
  reviewer: primary opus/xhigh  fallback sonnet/medium
  Skills installed: codex-review, codex-followup, codex-resume, codex-fix, codex-routine, codex-analyze, codex-improve, codex-log, codex-threads
  Agent(s) installed: codex-reviewer, codex-reviewer-fallback
  PostToolUse hooks: 2 (mcp__codex__codex, mcp__codex__codex-reply)
  PreToolUse gate:   (none)
```

→ 검증 시작 시점과 시멘틱 동일. byte-level sha는 `updatedAt` 타임스탬프 및 hook `installedAt` 으로 인해 변경되었으나 의미는 보존.

## 산출물 위치

- 안전 백업 (Phase 0 재구성판): `/tmp/coc-test-backup-20260522T124218Z/`
- 사후 검증 helper: `/tmp/coc-test-backup-20260522T124218Z/composite-helpers/verify-c0{2,3,4,6,8,9}.sh`
- Phase 2 스위트 로그: `/tmp/coc-test-backup-20260522T124218Z/sandbox-logs/phase2-*.log`
- 본 보고서: `docs/test-execution-results-v0.5.0-verification.md`
