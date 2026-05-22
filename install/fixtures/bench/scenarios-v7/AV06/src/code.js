async function proxyFetch(url) {
  // BUG: no allowlist - allows http://localhost:6379 etc
  const res = await fetch(url);
  return await res.text();
}