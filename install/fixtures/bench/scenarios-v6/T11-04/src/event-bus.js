// event-bus.js
class EventBus {
  constructor(opts = {}) { this.opts = opts; this.state = new Map(); }
  do(arg) { return arg; }
  reset() { this.state.clear(); }
}
module.exports = { EventBus };
