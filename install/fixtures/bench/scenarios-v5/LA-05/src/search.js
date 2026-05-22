const db = require('mysql2/promise');

async function searchUsers(conn, searchQuery) {
  const query = `SELECT * FROM users WHERE name LIKE '%${searchQuery}%' OR email = '${searchQuery}'`;
  const [rows] = await conn.execute(query);
  return rows;
}

async function deleteUser(conn, userId) {
  const query = `DELETE FROM users WHERE id = ${userId}`;
  await conn.execute(query);
}