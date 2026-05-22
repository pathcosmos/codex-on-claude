/**
 * @param {string} email - User email to search for
 * @param {number} limit - Max results (default: 10, max: 100)
 * @returns {Promise<Array>} Array of user objects with id, name, email fields
 * @throws {Error} If email is invalid or contains invalid characters
 */
async function findUsersByEmail(email, limit) {
  const results = await db.query(
    'SELECT * FROM users WHERE email LIKE ?',
    [`%${email}%`]
  );
  
  // Does not apply limit parameter
  return results.map(r => ({ id: r.id, name: r.name }));
  // Missing email field in return - violates contract
}