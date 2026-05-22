# v5 — 25 Category Domain Map

> Maps each test scenario to one of 25 categories. v5 expansion targets 200 total scenarios.

| # | Category | hypothesis_target | Existing (v1-v4) | v5 target |
|---|---|---|---|---|
| 1 | Code review (single-shot) | P6_ceiling / P2_adversarial | B1, B5, B12 | +5 |
| 2 | Bug fix (single-shot) | P6_ceiling | B3, B11, E1 | +5 |
| 3 | Refactoring | P6_ceiling | B2 | +5 |
| 4 | TDD / Test generation | P4_tdd_followup | B4, E3 | +10 (T05) |
| 5 | Documentation authoring | P1_self_review | D1, T7anti | +10 (T01) |
| 6 | Multi-doc synthesis | P5_catastrophe | E10, T2 | +10 (T03) |
| 7 | Security audit | P2_adversarial | B5, E2, T1a | +5 |
| 8 | Performance optimization | P3_reasoning_high | B10 | +5 |
| 9 | Hard reasoning / constraint | P3_reasoning_high | B9, D2, T5 | +10 (T04) |
| 10 | Architecture / design review | P6_ceiling / P2 | B7 | +5 |
| 11 | Multi-log RCA | P7_subagent_risk | E7 | +5 |
| 12 | i18n / l10n audit | NEW | — | +5 (T07) |
| 13 | Container / K8s manifest | NEW | — | +5 (T08) |
| 14 | Regex / ReDoS detection | P2_adversarial | — | +5 |
| 15 | Concurrency / race condition | P3_reasoning_high | — | +5 (T09) |
| 16 | SQL query optimization | NEW | — | +5 (T10) |
| 17 | Parser / DSL writing | NEW | — | +4 |
| 18 | Cryptography review | P2_adversarial | — | +5 |
| 19 | Type inference (TS / Python) | NEW | — | +5 |
| 20 | API contract testing | P4_tdd_followup | — | +5 |
| 21 | GDPR / compliance review | NEW | — | +5 |
| 22 | Distributed systems / CAP | P3_reasoning_high | — | +5 |
| 23 | Mock / fixture generation | NEW | — | +4 |
| 24 | Memory leak detection | P3_reasoning_high | — | +5 |
| 25 | ML model interface review | NEW | — | +4 |
| Composite | Multi-Skill chain (β) | P5_catastrophe / P2 | E1-E10 | +20 (T02, T06) |
| **합계** | | | **31** | **+170 = 201** |

## hypothesis_target 의 의미

| Target | 검증 가설 |
|---|---|
| `P1_self_review` | self-review loop 가 β-win 의 인과적 요인인가? (D1 +29pp 일반화 가능?) |
| `P2_adversarial` | adversarial framing 이 β-win 을 만드는가? (B9 +25pp 일반화 가능?) |
| `P3_reasoning_high` | reasoning=high MCP 가 hard reasoning 에서 β-win 인가? (D2 +8pp 일반화?) |
| `P4_tdd_followup` | TDD + followup 이 β-win 인가? (E3 +16.7pp 일반화?) |
| `P5_catastrophe` | multi-step + strict_format 이 β-harmful 인가? (E10 -83pp 일반화?) |
| `P6_ceiling` | α 이미 100% 인 case 에서 β 가 redundant? (대다수 시나리오 검증) |
| `P7_subagent_risk` | subagent 위임이 quality 손실? (E7/E10 일반화?) |
| `NEW` | 가설 없이 자연 분포 수집 (신규 카테고리) |
