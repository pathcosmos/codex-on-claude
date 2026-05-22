class SharedCache {
  constructor() {
    this.data = {};
    this.pending = {};
  }

  async get(key) {
    if (this.data[key]) return this.data[key];
    if (this.pending[key]) return this.pending[key];
    
    this.pending[key] = this.fetchFromDB(key);
    const result = await this.pending[key];
    this.data[key] = result;
    delete this.pending[key];
    return result;
  }

  async fetchFromDB(key) {
    await new Promise(r => setTimeout(r, 100));
    return { key, value: Math.random() };
  }
}