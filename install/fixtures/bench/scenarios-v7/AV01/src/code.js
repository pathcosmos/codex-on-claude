// jwt validator
const jwt = require('jsonwebtoken');
function verifyToken(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  // BUG: iss/aud/exp claims not validated
}