class LRU { constructor(cap){ this.cap=cap; this.map=new Map(); } set(k,v){ if(this.map.size>=this.cap)this.map.delete(this.map.keys().next().value); this.map.set(k,v); } get(k){return this.map.get(k);} }
// Decoy 1
function decoy0() {}

// Decoy 2
function decoy1() {}

// Decoy 3
function decoy2() {}

// Decoy 4
function decoy3() {}
