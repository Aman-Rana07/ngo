require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

// Explicit CORS configuration
const corsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token', 'authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Serve the main homepage at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'homepage.html'));
});

// Simple in-memory session tokens for admin
const adminSessions = new Map();

// Simple admin credentials (change as needed)
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Initialize SQLite DB
const dbFile = path.join(__dirname, 'volunteers.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Failed to open database', err);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS pending_volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    age INTEGER,
    interests TEXT,
    experience TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    age INTEGER,
    interests TEXT,
    experience TEXT,
    approved_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Public API: register volunteer -> goes to pending
app.post('/api/register', (req, res) => {
  const { name, email, phone, age, interests, experience } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const stmt = db.prepare(`INSERT INTO pending_volunteers (name, email, phone, age, interests, experience) VALUES (?,?,?,?,?,?)`);
  stmt.run(name, email, phone || null, age || null, interests || null, experience || null, function (err) {
    if (err) {
      console.error('DB insert error', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json({ message: 'Registration submitted for admin approval', id: this.lastID });
  });
  stmt.finalize();
});

// Admin login -> returns token
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  
  console.log(`ATTEMPT -> User: [${username}] Pass: [${password}]`);

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(24).toString('hex');
    adminSessions.set(token, { created: Date.now() });
    return res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

function requireAdminToken(req, res, next) {
  const token = req.headers['x-admin-token'] || req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Missing admin token' });
  const raw = token.startsWith('Bearer ') ? token.slice(7) : token;
  if (!adminSessions.has(raw)) return res.status(401).json({ error: 'Invalid or expired token' });
  req.adminToken = raw;
  next();
}

// Get pending volunteers
app.get('/api/admin/pending', requireAdminToken, (req, res) => {
  db.all('SELECT * FROM pending_volunteers ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ pending: rows });
  });
});

// Approve volunteer: move to volunteers table and remove from pending
app.post('/api/admin/approve', requireAdminToken, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  db.get('SELECT * FROM pending_volunteers WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: 'Pending record not found' });

    const insert = db.prepare(`INSERT INTO volunteers (name, email, phone, age, interests, experience) VALUES (?,?,?,?,?,?)`);
    insert.run(row.name, row.email, row.phone, row.age, row.interests, row.experience, function (insErr) {
      if (insErr) {
        console.error('Insert volunteers error', insErr);
        return res.status(500).json({ error: 'Failed to add volunteer (maybe already approved)' });
      }

      db.run('DELETE FROM pending_volunteers WHERE id = ?', [id], (delErr) => {
        if (delErr) console.error('Failed to delete pending', delErr);
        return res.json({ message: 'Approved and added to volunteers', volunteerId: this.lastID });
      });
    });
    insert.finalize();
  });
});

// Deny volunteer: remove from pending
app.post('/api/admin/deny', requireAdminToken, (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'Missing id' });

  db.run('DELETE FROM pending_volunteers WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Denied and removed' });
  });
});

// Optional: list approved volunteers
app.get('/api/admin/volunteers', requireAdminToken, (req, res) => {
  db.all('SELECT * FROM volunteers ORDER BY approved_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ volunteers: rows });
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});