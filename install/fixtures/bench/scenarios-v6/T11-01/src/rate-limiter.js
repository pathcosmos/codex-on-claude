// rate-limiter.js
class RateLimiter {
  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }
  do(arg) { return arg; }
  reset() { this.state.clear(); }
}
module.exports = { RateLimiter };
