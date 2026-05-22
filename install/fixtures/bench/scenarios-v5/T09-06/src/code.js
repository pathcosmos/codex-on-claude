async function fetchOrTimeout(url) {
  return Promise.race([fetch(url), new Promise((_, r) => setTimeout(() => r('timeout'), 1000))]);
}