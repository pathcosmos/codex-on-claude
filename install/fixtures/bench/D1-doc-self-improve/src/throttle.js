// throttle.js — token-bucket rate limiter for a multi-tenant API gateway.
// No documentation. The benchmark asks the model to author SKILL.md-style docs.

class TokenBucket {
  constructor({ capacity, refillPerSec, now = Date.now }) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.tokens = capacity;
    this.last = now();
    this.now = now;
  }
  _refill() {
    const t = this.now();
    const dt = (t - this.last) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.refillPerSec);
    this.last = t;
  }
  tryConsume(n = 1) {
    this._refill();
    if (this.tokens >= n) { this.tokens -= n; return { ok: true, retryAfterMs: 0 }; }
    const deficit = n - this.tokens;
    return { ok: false, retryAfterMs: Math.ceil((deficit / this.refillPerSec) * 1000) };
  }
}

class TenantThrottle {
  constructor({ defaultCapacity = 100, defaultRefill = 10, perTenant = {} } = {}) {
    this.buckets = new Map();
    this.defaultCapacity = defaultCapacity;
    this.defaultRefill = defaultRefill;
    this.perTenant = perTenant;
  }
  _bucketFor(tenantId) {
    if (!this.buckets.has(tenantId)) {
      const cfg = this.perTenant[tenantId] || { capacity: this.defaultCapacity, refillPerSec: this.defaultRefill };
      this.buckets.set(tenantId, new TokenBucket(cfg));
    }
    return this.buckets.get(tenantId);
  }
  consume(tenantId, weight = 1) { return this._bucketFor(tenantId).tryConsume(weight); }
  reset(tenantId) { this.buckets.delete(tenantId); }
  snapshot() {
    const out = {};
    for (const [k, v] of this.buckets) out[k] = { tokens: v.tokens, capacity: v.capacity };
    return out;
  }
}

module.exports = { TokenBucket, TenantThrottle };
