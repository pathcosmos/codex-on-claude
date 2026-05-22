import express from 'express';
import { exec } from 'child_process';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.post('/thumbnail', (req, res) => {
  const url = req.body.url;
  exec(`node scripts/snapshot.js ${url}`, { timeout: 5000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ path: stdout.trim() });
  });
});

app.listen(3000);