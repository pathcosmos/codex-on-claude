function deepMerge(target, source) {
  for (const key in source) {
    if (typeof source[key] === 'object') {
      target[key] = target[key] || {};
      deepMerge(target[key], source[key]);
    } else { target[key] = source[key]; }
  }
  return target; // BUG: __proto__/constructor pollution
}