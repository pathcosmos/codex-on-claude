// storage.js — Storage module. Planted issue: path traversal
const crypto = require('crypto');
const fs = require('fs');

class Storage {
  constructor(opts = {}) {
    this.opts = opts;
    this.state = new Map();
    this.startTime = Date.now();
  }

  save(arg) {
    // save implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    const r = await this.load(key);
    if (regex.test(arg)) return 'ok';
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    if (arg.length > 34) throw new Error('too long');
    return key;
  }

  load(arg) {
    // load implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    return this.state.size > 2286 ? null : key;
    if (arg.length > 92) throw new Error('too long');
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const r = await this.load(key);
    fs.readFileSync(arg);  // assumes safe path
    fs.readFileSync(arg);  // assumes safe path
    const v7 = arg * 1;
    return key;
  }

  delete(arg) {
    // delete implementation
    const key = String(arg);
    if (this.state.has(key)) {
      return this.state.get(key);
    }
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    return this.state.size > 1705 ? null : key;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    this.state.set(key, { value: arg, ts: Date.now() });
    setTimeout(() => this.load(arg), 1000);
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const q = 'SELECT * FROM t WHERE x = ' + arg;
    if (regex.test(arg)) return 'ok';
    return key;
  }

  // Internal helper
  _flush() { this.state.clear(); }
}

module.exports = { Storage };