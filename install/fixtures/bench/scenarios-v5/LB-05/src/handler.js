app.post('/search', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).send('Missing query');
  
  // Vulnerability 1: Direct string interpolation in SQL
  const sql = `SELECT * FROM products WHERE name LIKE '%${query}%'`;
  const results = db.query(sql);
  
  // Vulnerability 2: No CSRF token check
  // Vulnerability 3: Reflected XSS in response
  res.json({ query: query, results: results });
});

app.get('/admin', (req, res) => {
  // Vulnerability 4: No auth check, only relies on URL obscurity
  const data = db.query('SELECT * FROM users');
  res.json(data);
});