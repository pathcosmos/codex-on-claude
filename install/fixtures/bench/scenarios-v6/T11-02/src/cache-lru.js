// cache-lru.js
class CacheLru {
  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }
  do(arg) { return arg; }
  reset() { this.state.clear(); }
}
module.exports = { CacheLru };
