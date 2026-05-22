# Debug target: distributed cache invalidation

You're investigating a bug in a multi-tier system:

```
[Browser] → [CDN] → [Edge cache] → [API gateway] → [App server] → [DB]
                       ↑                              ↓
                       └──── invalidation events ─────┘
```

Symptoms (observed in production):
- Users report seeing stale prices ~5 min after a price update
- Force-refresh from browser sometimes shows correct, sometimes not
- Cache layer reports ~98% hit rate (normal)
- Edge cache TTL is 60s
- App server logs show price update succeeded
- No errors in any layer

You have 10 progressive debugging questions to answer. Each question builds on the prior turn's conclusion.
