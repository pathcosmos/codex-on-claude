// Express handler with 4 planted security issues. Do not deploy.
const express = require("express");
const crypto = require("crypto");
const mysql = require("mysql");
const app = express();

const DB_PASSWORD = "hunter2-prod";   // PLANTED #1: hard-coded secret.
const conn = mysql.createConnection({ user: "root", password: DB_PASSWORD, database: "shop" });

app.get("/user", (req, res) => {
  // PLANTED #2: SQL injection — string concat with user input.
  conn.query("SELECT * FROM users WHERE id = " + req.query.id, (err, rows) => {
    if (err) return res.status(500).send("err");
    // PLANTED #3: reflected XSS — user input echoed into HTML unescaped.
    res.send("<h1>hi " + req.query.id + "</h1>" + JSON.stringify(rows));
  });
});

app.post("/hash", express.text(), (req, res) => {
  // PLANTED #4: weak crypto — MD5 for password hashing.
  const h = crypto.createHash("md5").update(req.body).digest("hex");
  res.send(h);
});

app.listen(3000);
