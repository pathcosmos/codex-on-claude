# codex-on-claude — Claude-vs-Codex performance benchmark

> 한국어 요약: 동일한 과제를 **(α) Claude 단독** 으로 푸는 경우와 **(β) Claude + codex-on-claude (Codex MCP 호출)** 로 푸는 경우를 같은 입력·같은 채점 기준으로 돌려 성능/품질을 비교하는 12 개 paired 시나리오. 핵심 3개 (B1/B5/B6) 는 N=3 중앙값 보고. Haiku 기준 총 $2.5~3.5 USD.

## 1. Purpose & scope

이 문서는 [`test-scenarios-codex-calls.md`](./test-scenarios-codex-calls.md) 의 **자매(companion) 문서** 다. 그 문서는 32 개 시나리오로 **배관(plumbing)** — install, MCP transport, Skill MUST 절차, threads catalog, hooks — 가 동작하는지를 결정론적으로 검증한다. 이 문서는 그 위에서 *"동일한 코딩 과제를 Claude 단독 vs Claude + Codex로 풀면 결과가 어떻게 다른가"* 라는 한 가지 질문을 다룬다.

**비-목표:**
- Claude vs Codex 모델 비교 아님 (양쪽 다 Claude가 운전, β가 도구로 Codex를 부른다).
- 자동 라우팅 평가 아님 (β 시나리오마다 어떤 Skill 을 쓸지 프롬프트에 못박는다).
- 일반 모델 평가 벤치마크 아님 (단일 repo, 단일 fixture set).

## 2. Prerequisites

벤치 실행 전 host 상태 점검 — 모든 항목은 자매 문서의 시나리오와 1:1 매핑된다.

- [ ] **[G1-1]** `codex-on-claude doctor` 6 항목 모두 ok
- [ ] **[G1-3]** `claude mcp get codex` 가 `connected` 반환 (β arm 필수)
- [ ] **[G2-1]** β arm 설치:
  ```sh
  codex-on-claude --patterns=review,followup,fix \
    --context-policy=direct \
    --improvement-loop=off \
    --threads=basic \
    --yes
  ```
  - `improvement-loop=off` 가 **중요** — PostToolUse auto-log hook 이 켜져 있으면 토큰 측정이 왜곡됨 ([G7-1] 참조)
- [ ] **[G4-2]** `claude -p --output-format stream-json` 이 정상적으로 `message.usage`, `tool_use` 이벤트를 발행

위 5 개를 만족하지 않은 채 벤치를 돌리면 결과는 신뢰할 수 없다.

## 3. Harness 설계

### 디렉터리 레이아웃
```
install/fixtures/bench/
├── run.sh              # ./run.sh <scenario> <alpha|beta>
├── runall.sh           # 전체 N=1 + 핵심 3개 N=3 매트릭스
├── score.mjs           # ORACLE.json + 아티팩트 → result.json
├── report.mjs          # _runs 트리 → 최종 markdown 표
├── B1-large-diff/ ... B12-trap/
└── _runs/<RUN_ID>/run<r>/<scenario>/<alpha|beta>/   (gitignored)
       ├── stream.jsonl       # claude -p --output-format stream-json
       ├── timing.json        # wall_s
       ├── cost.json          # Claude 측 message.usage 합
       ├── cost.codex.json    # Codex 측 토큰 추정 (char/4 휴리스틱)
       ├── tool_calls.jsonl   # tool_use 이벤트 평탄화
       ├── workspace/         # fixture src 의 임시 git repo (이 안에서 Claude 가 작업)
       ├── changed.files.txt  # git diff --stat
       ├── changed.diff       # 전체 diff
       ├── tests.txt          # run_tests.sh stdout (있다면)
       ├── tests.exit         # 그 exit code
       └── result.json        # rubric 점수
```

### 핵심 보강 (Codex 리뷰 반영)

벤치는 plumbing 만으로는 빠지는 3 가지 함정을 보강한다:

1. **파일 편집 시나리오 아티팩트 캡처.** `stream.jsonl` 만으로는 "정말 4 개 파일을 고쳤는지" 검증 불가. `run.sh` 는 매 arm 시작 시 `fixture/src/` 를 임시 `workspace/` 로 복사하고 `git init` → `git commit -m pre` 까지 한 다음 Claude 를 그 CWD 에 가둔다. 끝나면 `git diff` 와 `run_tests.sh` 결과를 캡처한다. → B2/B3/B4/B10 의 모든 "어느 파일이 어떻게 바뀌었나" rubric 이 결정론적으로 통과/실패한다.

2. **주관적 채점 → 구조화된 응답 contract.** B7/B9/B12 는 원래 사람 채점이 필요한 영역이지만, 프롬프트가 **trailing fenced ```json``` block** 을 mandatory 하게 요구하고 `score.mjs` 가 그것만 파싱한다. 응답이 schema 위반이면 자동 fail. → 정성 평가가 binary subcriteria 로 분해된다.

3. **Tool-call 분리 캡처.** `score.mjs` 는 stream.jsonl 에서 `tool_use` 이벤트만 따로 `tool_calls.jsonl` 로 추출한다. → B11 의 "β 가 mcp__codex__codex 를 호출하지 *않아야* 한다" 같은 부정 조건도 텍스트가 아니라 직접 카운트로 확정된다.

### `run.sh` 요약
```bash
SCEN="$1" ARM="$2"
WORK="_runs/$TS/$SCEN/$ARM/workspace"
cp -R "fixtures/$SCEN/src" "$WORK"
( cd "$WORK" && git init -q && git add -A && git commit -q -m pre )
( cd "$WORK" && claude -p --model haiku --output-format stream-json \
    --permission-mode dontAsk "$(cat fixtures/$SCEN/PROMPT.$ARM.md)" \
    > stream.jsonl )
# 그 다음: jq 로 cost.json / tool_calls.jsonl / cost.codex.json 생성
# git diff 와 run_tests.sh 실행, exit code 캡처
# node score.mjs $SCEN $OUT
```

### `runall.sh` (전체 매트릭스)
- 12 시나리오 × {α, β}, 핵심 3 개 (B1, B5, B6) 만 N=3.
- 끝나면 `node report.mjs $RUN_ID` 를 자동 호출해 `_runs/$RUN_ID/report.md` 생성.

## 4. 시나리오 매트릭스

### 4.1 요약 표

| ID  | Goal                                              | Fixture                  | 채점 방식 | α 가설           | β Codex 기여 가설         | 1회 비용 |
|-----|---------------------------------------------------|--------------------------|-----------|-------------------|---------------------------|----------|
| B1  | ~600 LOC 멀티 파일 diff 정합성 리뷰               | `B1-large-diff/`         | JSON+text | 토큰 부담 → skim  | 2nd-opinion 으로 catch    | $0.15    |
| B2  | 4개 파일 cross-file rename                        | `B2-refactor/src/*.js`   | grep test | 둘 다 쉬움        | β 느리고 동급             | $0.12    |
| B3  | 단일 파일 버그 픽스 (failing test → green)        | `B3-bugfix/src/`         | py test   | baseline          | `/codex-fix` allowlist    | $0.10    |
| B4  | 유닛 테스트 생성 (12 함수)                        | `B4-testgen/src/calc.ts` | tsx test  | 커버리지 얕음     | edge case 열거            | $0.18    |
| B5  | 보안 감사 (SQLi, XSS, weak crypto, secret)        | `B5-secaudit/src/`       | JSON+text | 2~3개만 catch     | 4 개 다 catch             | $0.15    |
| B6  | 5-turn 디버깅 (followup 루프)                     | `B6-followup/`           | JSON+tool | α 매 턴 reset     | sticky thread             | $0.20    |
| B7  | 아키텍처 Q&A: "재시도 로직 어디?"                 | `B7-arch/src/mini-...`   | JSON      | 주관              | Codex 대안 제시           | $0.10    |
| B8  | RFC spec 에서 40 (현재 stub: 6) 엔드포인트 추출   | `B8-spec/src/SPEC.md`    | JSON      | volume → truncate | 병렬 read recall ↑        | $0.15    |
| B9  | 모순 제약 hostile prompt                          | `B9-hostile/`            | JSON      | 침묵 선택         | 모호성 표면화             | $0.08    |
| B10 | O(n²) → O(n) 최적화                               | `B10-perf/src/`          | py test   | 둘 다 발견 가능   | 설명 품질                 | $0.10    |
| B11 | **β 절제 테스트**: 한 줄 typo                     | `B11-trivial/src/`       | grep+tool | 자명              | β 가 Codex 호출 X 이어야  | $0.04    |
| B12 | **trap**: 이미 옳은 코드 "검증" 요청              | `B12-trap/src/`          | JSON      | 환각 유도         | Codex 2nd opinion 저항    | $0.08    |

**N=1 합계 ≈ $1.45.** 핵심 3 개 (B1, B5, B6) N=3 으로 늘리면 **+$1.00** → 약 **$2.5 총합**. Codex-side 토큰까지 정확히 회계하고 1~2 회 재시도를 감안하면 **상한은 ~$3.5** 로 잡는다.

### 4.2 시나리오별 채점 기준

각 시나리오의 `ORACLE.json` 이 자동 채점 기준을 담는다. 다음 4 가지 evaluator 가 score.mjs 에서 지원된다:

| Evaluator type            | 용도                                                 |
|---------------------------|------------------------------------------------------|
| `contains_text`           | 최종 응답 텍스트에 substring 존재                    |
| `not_contains_text`       | substring 미존재                                     |
| `word_count_max`          | 응답 단어 수 상한                                    |
| `final_json_field`        | trailing ```json``` block 의 필드값 (equals/in)      |
| `final_json_array_min`    | trailing JSON 배열 필드 length 하한                  |
| `final_json_array_max`    | 동 상한                                              |
| `tests_pass`              | `tests.exit == 0`                                    |
| `changed_files_subset_of` | 변경 파일이 allowlist 부분집합                       |
| `changed_files_min/max`   | 변경 파일 수 범위                                    |
| `tool_call_count_min/max` | 특정 tool_use 횟수                                   |
| `arm_specific`            | "β에만 적용" 등 arm 게이트로 inner evaluator 감싸기  |

자세한 ORACLE 예시는 `install/fixtures/bench/B*/ORACLE.json` 참조.

### 4.3 핵심 가설 (각 시나리오에서 우리가 보고 싶은 것)

- **B1 (large-diff)**: Codex 의 두 번째 모델이 Claude 가 놓친 미묘한 버그를 catch 하는지. β-wins 가 예상되면 검증, 아니라면 다른 모델 페어로 재시도.
- **B2 (refactor)**: 단순 작업에서 Codex 경유로 인한 latency 손실 측정. α-wins (시간/비용) 가 정상.
- **B3 (bugfix)**: `/codex-fix` 의 allowlist 적용이 잘 작동하는지 (out-of-scope 편집 차단).
- **B4 (testgen)**: edge-case 커버리지. β 가 더 폭넓은지.
- **B5 (secaudit)**: Haiku 단독은 보안 취약점 일부를 놓치는 경향이 알려져 있다. Codex 2nd opinion 의 marginal value 가 가장 클 것으로 예상되는 시나리오.
- **B6 (followup)**: 멀티턴 컨텍스트 유지의 가치. β 가 sticky thread 로 5 턴을 일관되게 끌고 갈 수 있는가.
- **B7 (arch)**: 정성적 질문에서 Codex 2nd opinion 이 노이즈가 되는지 시그널이 되는지.
- **B8 (spec)**: 대용량 입력에서 누락률.
- **B9 (hostile)**: 모순 제약을 침묵으로 처리하는 경향 — Codex review 가 이를 surface 시키는지.
- **B10 (perf)**: 알고리즘 최적화 — 둘 다 풀 수 있는 과제에서 품질 차이는 *설명* 에서 나타나는가.
- **B11 (β-restraint)**: β 가 자명한 작업에 Codex 를 부르지 않는 "절제" 능력. Skill prose 가 LLM 실제 행동과 일치하는가 (자매 문서의 [feedback_skill_actual_vs_documented] 메모와 직결).
- **B12 (trap)**: "검증해 주세요" 라는 시그널만으로 환각 버그를 만드는 경향. Codex 2nd opinion 이 brake 역할을 하는지.

## 5. 사용법

### 한 arm 만 실행
```sh
cd install/fixtures/bench
TS=$(date -u +%Y%m%dT%H%M%SZ)
TS="$TS/run1" ./run.sh B3-bugfix alpha
TS="$TS/run1" ./run.sh B3-bugfix beta
```

### Smoke 테스트 (가장 싼 B11 만)
```sh
TS=smoke ./run.sh B11-trivial alpha
TS=smoke ./run.sh B11-trivial beta
node report.mjs smoke
```

### 전체 매트릭스
```sh
./runall.sh        # 약 30~45 분, $2.5~3.5 소모
```

산출물은 `_runs/<RUN_ID>/report.md` 에 markdown 표로 정리된다.

## 6. 보고 표 템플릿

`report.mjs` 가 다음 형식으로 생성한다:

```markdown
# Bench report — run <RUN_ID>

| Scenario       | N | α wall(s) | β wall(s) | α tok(in/out) | β tok(in/out) | β codex~ | α score | β score | Verdict  |
|----------------|---|-----------|-----------|---------------|---------------|----------|---------|---------|----------|
| B1-large-diff  | 3 | 18        | 41        | 12000/2000    | 6000/1000     | ~8000    | 2.0/5   | 4.0/5   | β wins   |
| B2-refactor    | 1 | 22        | 35        | 3000/1000     | 3000/1000     | ~2000    | 3/3     | 3/3     | tie      |
| ...            | . | ...       | ...       | ...           | ...           | ...      | ...     | ...     | ...      |
| **Aggregate**  |   | median    | median    | sum           | sum           | sum~     | avg     | avg     | β:x α:y t:z |
```

- `α wall` 은 N>1 일 때 중앙값.
- 토큰 컬럼은 N 회 **합**. N 별 비교가 필요하면 N 으로 나눠 보면 된다.
- `β codex~` 의 `~` 는 char/4 추정값임을 표기.
- Verdict 는 score fraction 차이 > 0.01 을 기준으로 결정.

## 7. 측정하지 않는 것 (caveats)

이 벤치는 *probe* 다. 다음 항목은 **고의로 측정하지 않는다** — 결과를 해석할 때 잊지 말 것:

1. **모델 분산**: Haiku 는 non-deterministic. 핵심 3개만 N=3 median 으로 보고, 나머지는 N=1 (indicative).
2. **Codex 측 토큰 정확도**: MCP `usage` 필드가 노출되는 경우만 정확. 누락 시 `responseChars/4` 휴리스틱 (±30%) 사용. 표에서는 `~` 마커.
3. **네트워크 latency**: Codex 는 OpenAI 망 너머. wall time 은 모델 품질 + 망 품질의 혼합.
4. **B7/B9/B12 정성 평가**: JSON contract 로 mechanize 했지만, 응답 *내용의* 적절성은 검증하지 않음 — inter-rater agreement 확인 안 함.
5. **β 가 Codex 를 "선택" 했는지** 는 측정하지 않음. 시나리오마다 어떤 Skill 을 쓸지 prompt 에 고정. Auto-routing 평가는 별도 과제.
6. **이 suite 는 단일 repo / 단일 fixture set** — 결론을 codex-on-claude 전반으로 일반화하지 말 것.
7. **>50k 컨텍스트 시나리오 없음** — Haiku context 한계 + 비용. 향후 과제.
8. **재시도 없음** — 실패는 실패로 기록 (β fragility 가 정직히 표면화).
9. **stream-json schema 의존** — Claude CLI 가 `assistant.message.content[].type=="tool_use"`, `message.usage.input_tokens` 등을 발행한다는 가정 위에 score/cost 가 짜여 있음. CLI major bump 시 `score.mjs`/`run.sh` 둘 다 손봐야 함.
10. **Codex MCP response usage 변동** — Codex 서버가 `usage` 필드를 항상 채워주지는 않을 수 있어 추정값이 들어가는 시나리오 발생 가능. 해당 셀에 `~` 표기.
11. **Subagent 모델 핀이 `--model haiku` 를 우회 (v0.4.1)** — β arm 이 `/codex-review` 를 호출할 때 `contextPolicy ∈ {summarize, mixed}` 면 `codex-reviewer` subagent 가 사용되고, install 시 `codex-reviewer.md` 의 frontmatter `model:` 가 사용자가 고른 `reviewerPrimaryModel` 로 치환된다. 즉 메인 세션은 Haiku 라도 subagent 안에서는 (예) Opus 가 돈다. 우회는 `--context-policy=direct` 로 설치하거나, 측정 시 두 모델 비용을 별도로 계상해 정직히 보고. modelMatrix + primary/fallback 검증은 자매 문서 G9 그룹 참조.

## 8. 비용 상한 표

| 항목                          | N=1 합계 | N=3 (B1/B5/B6) 추가 | 합     |
|-------------------------------|---------:|---------------------:|-------:|
| Claude 측 (Haiku, 양 arm 합)  | ~$1.20   | +$0.80               | $2.00  |
| Codex 측 (gpt-5.x, β only)    | ~$0.25   | +$0.20               | $0.45  |
| 재시도/오버헤드 (~15%)        | ~$0.22   | +$0.15               | $0.37  |
| **상한**                      |          |                      | **~$2.8~3.5** |

`runall.sh` 한 번 → 위 표의 마지막 행. 같은 시나리오 set 을 매주 돌리는 등 빈도가 높아지면 N=1 만 유지하고 그 합 ($1.45) 으로 끊는 것을 권장.

## 9. 향후 확장

이 vNext 에서 다루지 않은 것들 — 후속 PR 후보:

- **C-그룹 시나리오** (옵션 정책 비교): `--context-policy=direct vs summarize vs mixed` 에서 같은 B-시나리오를 돌리는 사분면.
- **D-그룹** (Skill 자동 라우팅): β prompt 에서 "어떤 Skill 을 쓸지" 명시를 빼고 Claude 가 골랐을 때의 hit rate.
- **B8 expansion**: SPEC.md 를 40 엔드포인트까지 확장 (현재 6 stub).
- **B6 multi-thread**: 의도적으로 thread 가 죽어 `/codex-resume` SILENT_NEW_SESSION 경로를 타게 만드는 변형.
- **Token-cost 모델별 비교**: Sonnet/Opus arm 추가 (현재는 Haiku 만).

## 10. 자매 문서와의 cross-reference

| 본 문서 항목         | 자매 문서 항목           | 의존성 종류                              |
|----------------------|--------------------------|------------------------------------------|
| §2 Prerequisites     | G1-1 doctor              | hard prerequisite                        |
| §2 Prerequisites     | G1-3 MCP register        | hard prerequisite (β only)               |
| §2 Prerequisites     | G2-1 install             | hard prerequisite                        |
| §2 Prerequisites     | G4-2 stream-json sanity  | hard prerequisite (모든 arm)             |
| §2 Prerequisites     | G7-1 hook installation   | **negative** dep — hook 은 꺼져 있어야 함 |
| §4.3 B5 hypothesis   | G5-1/G5-2 codex-review   | Skill MUST 절차가 통과해야 β 가 가능     |
| §4.3 B3/B10 β arm    | G5-5/G5-6 codex-fix      | Skill MUST 절차 + sandbox 가드레일        |
| §4.3 B6 β arm        | G5-3 codex-followup      | turnCount, sticky thread                 |
| §3 tool_calls.jsonl  | G7-3 hook payload        | (간접) hook 비활성 상태에서의 stream 캡처 |
| §7 caveat #5         | G6-* threads 14 sub-cmd  | thread 선택 자동화 평가는 별도           |
| §7 caveat #11        | G9-2/G9-3 placeholder    | subagent 모델 핀의 effect 가 install-time 에 정해짐 (v0.4.1) |
| §4.3 B5 β arm        | G9-6 fallback 시뮬레이션 | quota 시 prose retry 동작 검증           |
