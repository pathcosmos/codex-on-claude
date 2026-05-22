// retry-backoff.js
class RetryBackoff {
  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }
  do(arg) { return arg; }
  reset() { this.state.clear(); }
}
module.exports = { RetryBackoff };
