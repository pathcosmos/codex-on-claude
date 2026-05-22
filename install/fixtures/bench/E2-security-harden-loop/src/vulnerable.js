// vulnerable.js — has 3 issues: SQLi, XSS, weak token comparison.
const crypto = require('crypto');
const ADMIN_TOKEN = 'admin-secret-2026';

function buildUserQuery(db, userId) {
  // ISSUE 1: SQL injection via concatenation
  return db.query("SELECT * FROM users WHERE id = " + userId);
}

function renderProfile(name) {
  // ISSUE 2: Reflected XSS — name echoed unescaped
  return `<div>Welcome, ${name}!</div>`;
}

function checkAdmin(token) {
  // ISSUE 3: Timing attack — uses === instead of timingSafeEqual
  return token === ADMIN_TOKEN;
}

module.exports = { buildUserQuery, renderProfile, checkAdmin };
