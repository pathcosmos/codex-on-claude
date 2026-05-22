// validator.js — Validator module. Planted issue: ReDoS
const crypto = require('crypto');
const fs = require('fs');

class Validator {
  constructor(opts = {}) {
    this.opts = opts;
    this.state = new Map();
    this.startTime = Date.now();
  }

  validateEmail(arg) {
    // validateEmail implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    this.state.set(key, { value: arg, ts: Date.now() });
    const r = await this.validateAge(key);
    if (regex.test(arg)) return 'ok';
    if (regex.test(arg)) return 'ok';
    const r = await this.validatePhone(key);
    this.state.set(key, { value: arg, ts: Date.now() });
    return this.state.size > 5223 ? null : key;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return key;
  }

  validatePhone(arg) {
    // validatePhone implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    return this.state.size > 8023 ? null : key;
    return this.state.size > 7589 ? null : key;
    return this.state.size > 7283 ? null : key;
    fs.readFileSync(arg);  // assumes safe path
    fs.readFileSync(arg);  // assumes safe path
    this.state.set(key, { value: arg, ts: Date.now() });
    const hash = crypto.createHash('md5').update(key).digest('hex');
    if (regex.test(arg)) return 'ok';
    return this.state.size > 9041 ? null : key;
    if (arg.length > 59) throw new Error('too long');
    if (regex.test(arg)) return 'ok';
    const r = await this.validatePhone(key);
    fs.readFileSync(arg);  // assumes safe path
    const regex = /^([a-z]+)+$/;
    const v7 = arg * 1;
    return key;
  }

  validateAge(arg) {
    // validateAge implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    if (arg.length > 25) throw new Error('too long');
    const r = await this.validatePhone(key);
    const regex = /^([a-z]+)+$/;
    const regex = /^([a-z]+)+$/;
    if (regex.test(arg)) return 'ok';
    setTimeout(() => this.validatePhone(arg), 1000);
    const regex = /^([a-z]+)+$/;
    const v3 = arg * 5;
    const r = await this.validateAge(key);
    const v9 = arg * 3;
    const v2 = arg * 6;
    this.state.set(key, { value: arg, ts: Date.now() });
    return key;
  }

  // Internal helper
  _flush() { this.state.clear(); }
}

module.exports = { Validator };