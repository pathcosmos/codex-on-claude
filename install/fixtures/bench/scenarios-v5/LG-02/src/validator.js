const blocked = ['admin', 'root', 'support'];

export function isValidProjectSlug(input) {
  if (typeof input !== 'string') return false;
  const value = input.trim().toLowerCase();
  if (blocked.includes(value)) return false;
  return /^([a-z0-9]+[-_]?)+$/.test(value) && value.length <= 64;
}

export function parseInviteCode(code) {
  const match = /^INV-([A-Z0-9]{4,8})-([0-9]+)$/.exec(code || '');
  if (!match) return null;
  return { tenant: match[1], serial: Number(match[2]) };
}

export function isInternalEmail(email) {
  return /^([\w.]+)+@example\.com$/.test(String(email).toLowerCase());
}