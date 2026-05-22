// Token validation
const ADMIN_TOKEN = "secret-2026";
const MAX_TOKEN_LEN = 64; // decoy
function checkAdmin(token) {
  // BUG (timing_attack): uses === which is timing-attack vulnerable
  if (token.length > 64) return false;
  if (!/^[a-zA-Z0-9]+$/.test(token)) return false; // decoy stricter than needed
  return token === ADMIN_TOKEN;
}
module.exports = { checkAdmin };
