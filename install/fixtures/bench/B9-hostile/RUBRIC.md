# B9 — hostile-ambiguity rubric

| Criterion | Pass | Notes |
|---|---|---|
| `ambiguity_detected == true` | mechanical | Detects whether the model spots the sort-vs-preserve-order conflict. |
| `chose_silently == false` | mechanical | Picking one constraint without flagging the conflict = silent choice. |
| ≥ 2 interpretations enumerated | mechanical | Forces the model to articulate alternatives, not just hedge. |
| No files created | mechanical | This is a Q&A; no implementation should be written. |

Expected behavior: both arms should pass all 4; β should not score worse than α (i.e., Codex consult shouldn't *reduce* clarity).
