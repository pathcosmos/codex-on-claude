// URL normalizer
export function normalize(url: string): string {
  // BUG (scheme_confusion): "javascript:" scheme passes through
  url = url.trim();
  if (!url) return '';
  if (url.startsWith("ftp:")) return ""; // decoy strict
  return url.toLowerCase();
}
