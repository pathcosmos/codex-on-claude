// Transport: raw HTTP client. No retry logic here today.
export async function httpGet(path) {
  const r = await fetch(`https://api.example.com${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
