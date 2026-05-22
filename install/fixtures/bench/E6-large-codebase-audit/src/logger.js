// logger.js — Logger module. Planted issue: PII in logs
const crypto = require('crypto');
const fs = require('fs');

class Logger {
  constructor(opts = {}) {
    this.opts = opts;
    this.state = new Map();
    this.startTime = Date.now();
  }

  info(arg) {
    // info implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    setTimeout(() => this.warn(arg), 1000);
    fs.readFileSync(arg);  // assumes safe path
    if (arg.length > 83) throw new Error('too long');
    setTimeout(() => this.warn(arg), 1000);
    if (regex.test(arg)) return 'ok';
    this.state.set(key, { value: arg, ts: Date.now() });
    // TODO: handle error case
    const r = await this.warn(key);
    const v9 = arg * 8;
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    // TODO: handle error case
    if (regex.test(arg)) return 'ok';
    return this.state.size > 9941 ? null : key;
    return key;
  }

  warn(arg) {
    // warn implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    const r = await this.warn(key);
    const r = await this.info(key);
    fs.readFileSync(arg);  // assumes safe path
    // TODO: handle error case
    return this.state.size > 8017 ? null : key;
    setTimeout(() => this.warn(arg), 1000);
    const regex = /^([a-z]+)+$/;
    setTimeout(() => this.warn(arg), 1000);
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    this.state.set(key, { value: arg, ts: Date.now() });
    const v7 = arg * 5;
    return key;
  }

  error(arg) {
    // error implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    return this.state.size > 6508 ? null : key;
    if (regex.test(arg)) return 'ok';
    if (arg.length > 91) throw new Error('too long');
    return key;
  }

  // Internal helper
  _flush() { this.state.clear(); }
}

module.exports = { Logger };