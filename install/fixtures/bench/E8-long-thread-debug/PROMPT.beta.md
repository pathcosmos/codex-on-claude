Read `system.md`. Then execute a 10-turn debugging conversation with Codex via `mcp__codex__codex` + `mcp__codex__codex-reply` (sticky thread):

- Turn 1: `mcp__codex__codex` with first question + capture threadId.
- Turns 2-10: `mcp__codex__codex-reply` on the SAME thread, each turn building on Codex's prior response.

The 10 progressive questions:
1. Given 98% hit rate and 60s TTL but 5-min staleness, what's the most likely caching layer at fault?
2. What's the difference between a successful price update at the app server vs. successful invalidation propagation?
3. List 3 ways an invalidation event could fail silently.
4. If invalidation events use HTTP POST to edge cache nodes, what failure modes affect "no errors in logs"?
5. How would you confirm whether edge cache received the invalidation?
6. If edge confirms receipt but TTL still shows old value, what data path are you suspecting next?
7. What's the role of CDN in caching layer? Could it cache the response BEFORE edge processed invalidation?
8. CDN cache-control headers: what header value would cause this exact symptom?
9. Propose a fix that doesn't require disabling CDN caching globally.
10. List the 3 monitoring metrics that would have caught this earlier.

After turn 10, summarize and end with:

```json
{ "root_cause_layer": "browser"|"cdn"|"edge"|"api-gw"|"app"|"db", "turns_completed": 10, "fix_proposed": "<≤30 words>", "codex_thread_id": "<uuid>", "codex_reply_count": 9 }
```

Prose ≤ 600 words.
