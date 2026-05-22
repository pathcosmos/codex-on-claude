Read `system.md`. Then answer these 10 debugging questions sequentially. Each answer should be ≤2 sentences and lead naturally to the next.

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

End with a fenced ```json block:

```json
{ "root_cause_layer": "browser"|"cdn"|"edge"|"api-gw"|"app"|"db", "turns_completed": 10, "fix_proposed": "<≤30 words>" }
```

Prose ≤ 600 words total.
