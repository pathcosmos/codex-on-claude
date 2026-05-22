# 가이던스 — Codex CLI 직접(γ) 사용이 최선인 경우

> **v7 update (2026-05-22)**: v5p5 broad γ sweep + R-series 데이터 반영. γ data 가 N=4 → N=23 으로 확장.
>
> Evidence: γ arm sweep total **N=23** scenarios:
> - v4 γ: B5, B9, D2, E10 (4 시나리오)
> - v5p5 broad γ: T03-07, T03-03, T03-04, T03-05, T03-10 (catastrophe), T02-01~03 (adversarial), LA-12, D1, B9, T01-08, T06-01, LG-02, LG-05, LG-08, T08-01, T09-04, T10-01 (19 시나리오)
>
> **Robust finding** (v7 validated): γ 는 β catastrophe (T03 family, T06-01) 에서 일관 회복 (γ ≥ α 항상).
> 본 문서는 Claude 오케스트레이션이 quality 를 망치는 경우, Codex CLI 직접 (no wrapper) 이 더 안전한 패턴을 식별.

## TL;DR

**Claude 오케스트레이션이 형식 / chain 손상을 유발할 위험이 있을 때 Codex CLI 직접 사용**. 특히:

1. **다단계 chain + strict JSON 출력**: β 의 catastrophe 패턴 (E10 -83pp)
2. **Codex 의 reasoning 능력만 필요하고 Claude 의 tool chain 이 불필요**: B9 (adversarial), B5 (security audit)
3. **격리된 read-only 분석**: project context / threads catalog 활용 불필요한 단발 작업

---

## v4 γ arm 핵심 증거

본 sweep 의 γ arm = `codex exec --sandbox=read-only --json -c model_reasoning_effort=high <prompt>` (no Claude wrapper).

| Scenario | α (Claude alone) | β (Claude+Codex) | **γ (Codex alone)** | Winner | 해석 |
|---|---|---|---|---|---|
| **E10-doc-corpus-synthesis** | 100% | **16.7%** (β-harmful) | **100% in 85s** | **α=γ ≫ β** | β chain 의 형식 망각, γ는 직접 정답 |
| **B9-hostile** (contradiction detect) | 75% | 100% | **100% in 22s** | β=γ | γ 도 동등하게 catch — Claude orchestration 불필요 |
| **B5-secaudit** | 100% | 100% | **100% in 35s** | 3-way tie | γ 도 충분 (ceiling) |
| **D2-reasoning-depth** (constraint puzzle) | 83.3% (N=2) | 91.7% (N=2) | 83.3% in 150s | **β > α=γ** | NP-hard 추론은 β 의 reasoning=high MCP path 가 γ 보다 강함 |

**핵심 발견**: 4 시나리오 중 **γ 가 α 보다 손해 본 적 없음** (γ ≥ α 항상). **β 가 catastrophic 인 시나리오에서 γ 가 안전한 대안**.

---

## γ-WIN over β 패턴 (Codex CLI 직접 권장)

### Pattern A — Multi-step β chain 위험 회피

**증거**: E10 β = 16.7%, γ = 100%, α = 100%.

**원인**: E10 β prompt 가 6 markdown 파일 → `codex-reviewer` subagent → 받은 요약 → strict JSON 5 필드 — 다단계 chain 의 끝에서 LLM 이 trailing JSON 블록을 누락. γ 는 Claude 가 없으므로 chain 자체가 없고, Codex 가 직접 prompt 따라 정답 출력.

**적용 신호**:
- 입력이 큰 corpus (5+ 파일, 30KB+)
- 출력 형식이 strict (JSON 필드 ≥ 3 개)
- task 가 단발 synthesis / audit / RCA — iteration 불필요

```sh
# 사용 예시
codex exec --sandbox=read-only --skip-git-repo-check --json \
  -c model_reasoning_effort=high \
  "<prompt with strict JSON output schema>" \
  < /dev/null
```

### Pattern B — Codex 의 reasoning 만 필요, Claude tool chain 불필요

**증거**: B9 (adversarial constraint detection) β = γ = 100% (α = 75%).

**원인**: 모순 제약 탐지에서 Codex 의 직접 reasoning 이 답을 안다. Claude 의 `/codex-review` Skill wrapper 는 동일 결과만 더 비싼 cost 로 생산. γ 는 wrapper 없이 직접 도달.

**적용 신호**:
- adversarial / contradiction detection
- 단일 read-only 분석
- Codex 가 답을 안다고 확신할 수 있는 도메인 (보안, 알고리즘 정답성, 코드 스타일)

### Pattern C — 격리된 read-only 작업

**증거**: B5 (security audit), B9 — γ 가 35s, 22s 만에 완료.

**원인**: Claude orchestration overhead (caching, hook, Skill prose 로드) 가 작업 본질에 비해 큼. γ 는 직접 Codex API 만 호출.

**적용 신호**:
- 작은 read-only 분석 (단일 파일 review)
- Claude Code session 컨텍스트가 작업과 무관
- 명령행에서 단발로 실행 가능

---

## γ-LOSE 패턴 (γ 가 β 보다 부족한 경우)

### Pattern A — NP-hard reasoning with MCP path

**증거**: D2-reasoning-depth — α=83.3%, **β=91.7%**, γ=83.3%. β 가 γ 보다 +8.3pp.

**해석**: β 가 `mcp__codex__codex` 로 Codex 를 부르면 Claude 가 verification 한 layer 를 더 추가. γ 는 직접 출력만 의존. 어려운 제약 문제에서는 β 의 cross-verification 이 quality 를 더 lift.

**회피 / 보완**:
- NP-hard / SAT 류 문제는 **β 사용 권장** (γ 가 86s/150s 더 빠르지만 quality 손해)
- 만약 γ 가 정답을 못 찾으면 → β 로 escalate

### Pattern B — Iterative refinement / self-review

**γ 에서 검증 안 됨** (D1 류 시나리오에서 γ 데이터 부재). 그러나 γ 는 단일 prompt 라서 self-review loop 구현이 어려움. **iterative 작업은 β (Claude → /codex-review × 2 라운드) 가 강함**.

---

## γ 의 본질적 한계 (Claude 의 강점이 γ 에는 없는 것들)

| Claude 강점 (γ 에 없음) | 영향 |
|---|---|
| Skill / Slash command 체인 (`/codex-review` → `/codex-fix` → `/codex-followup`) | 다단계 작업은 γ 가 직접 prompt 안에서 처리해야 함 |
| Project context (CLAUDE.md, current working dir state) | γ 는 `--cd` 로 명시한 dir 만 인식 |
| threads 카탈로그 (sticky thread persistence) | γ 는 stateless |
| Bash / Read / Edit 등 도구 chain | γ 는 codex 의 internal command execution 만 사용 가능 |
| User memory (자동 메모리) | γ 는 매 호출이 cold start |

→ **이런 기능이 필요한 작업은 γ 사용 금지**. β 또는 α 로 가야 함.

---

## 의사결정 체크리스트

다음을 체크하고 **3 개 이상 YES** 면 **γ (Codex CLI 직접)** 으로 진행:

- [ ] 입력이 read-only 이고, 외부 의존성 없는 단발 task 인가?
- [ ] 출력이 strict JSON / structured 형식이며 chain 없이 단발로 답하는 게 자연스러운가?
- [ ] β 에서 형식 망각이 발생한 적이 있는 task 유형인가? (E10-pattern)
- [ ] Codex 의 reasoning / 코드 분석 능력만 필요하고 Claude 의 추가 layer 가 무의미한가?
- [ ] threads / project context / Skills chain 이 불필요한가?

YES ≥ 3 → γ 사용.

---

## 실용 가이드

### 기본 호출 형태

```sh
# Read-only 분석 (가장 일반적)
codex exec \
  --sandbox=read-only \
  --skip-git-repo-check \
  --json \
  -c model_reasoning_effort=high \
  -o final.txt \
  "$(cat my_prompt.md)" \
  < /dev/null \
  > stream.jsonl 2> stderr.txt

# 파일 편집 모드 (workspace-write)
codex exec --sandbox=workspace-write --cd ./my-workspace ...

# 모델 명시 (단, ChatGPT 계정은 -m gpt-5 거부 — 디폴트 모델 사용 권장)
codex exec ...  # 디폴트 모델 자동 선택
```

### `< /dev/null` 의 중요성

codex CLI 는 stdin 이 piped 로 감지되면 "Reading additional input from stdin..." 메시지를 출력하며 입력 대기. **자동화 스크립트에서는 반드시 `< /dev/null`** 로 stdin 닫아야 함.

### 모델 선택 주의

ChatGPT 계정 (Pro/Plus) 사용자는 `-m gpt-5` 또는 `-m gpt-5-codex` 명시하면 400 error:

```
"The 'gpt-5' model is not supported when using Codex with a ChatGPT account."
```

**해결**: `-m` 플래그 생략. codex CLI 가 구독 tier 에 맞는 모델 자동 선택.

---

## 신뢰도

| Pattern | Evidence | N | Confidence |
|---|---|---|---|
| γ recovers from β-catastrophe (E10) | E10 γ=100% vs β=16.7% | 1 | **Medium-High** (강한 단일 신호) |
| γ = β for adversarial detection (B9) | B9 양쪽 100% | 1 | Medium |
| γ < β for NP-hard reasoning (D2) | D2 γ=83% vs β=92% | 1 (γ) / 2 (β) | Medium |
| γ ceiling = α ceiling (B5) | B5 3-way 100% | 1 (γ) / 3 (α,β) | High |

---

## 함께 보세요

- [guidance-claude-only.md](guidance-claude-only.md) — α 가 충분한 경우
- [guidance-claude-orchestrates-codex.md](guidance-claude-orchestrates-codex.md) — β 가 quality 를 명확히 lift 하는 경우 (D2 reasoning 등)
- [guidance-comparison.md](guidance-comparison.md) — 3-way 의사결정 트리
