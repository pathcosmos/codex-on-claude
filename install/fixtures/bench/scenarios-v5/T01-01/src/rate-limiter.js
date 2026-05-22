// rate-limiter.js — rate-limiter implementation (80 LOC target)
class RateLimiter {
  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }
  consume(arg) { return arg; }
  reset(arg) { return arg; }
  snapshot(arg) { return arg; }
}
module.exports = { RateLimiter };
