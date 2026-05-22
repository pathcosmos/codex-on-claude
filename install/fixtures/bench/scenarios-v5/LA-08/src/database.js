/**
 * Retrieve user data from cache or database
 */
async function getUser(userId) {
  try {
    const cached = await cache.get(userId);
    if (cached) return cached;
  } catch (err) {
    console.error('Cache error:', err);
  }
  
  try {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('Not found');
    await cache.set(userId, user);
    return user;
  } catch (err) {
    if (err.code === 'ER_LOCK_WAIT_TIMEOUT') {
      console.error('Lock timeout');
    }
    throw err;
  }
}