// Sliding-window rate limiter
class RateLimiter {
  constructor(window, max) { this.window = window; this.max = max; this.requests = []; }
  allow(now) {
    // BUG (off_by_one_at_boundary): boundary inclusion off by one
    this.requests = this.requests.filter((t) => now - t < this.window);
    if (this.requests.length >= this.max) return false;
    this.requests.push(now);
    return true;
  }
}
module.exports = { RateLimiter };
