const express = require('express');
const cors    = require('cors');
const Database = require('better-sqlite3');
const path    = require('path');
const crypto  = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'kpi.db');

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Database ────────────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS kpi_state (
    id         INTEGER PRIMARY KEY,
    data       TEXT NOT NULL,
    creds      TEXT NOT NULL,
    saved_by   TEXT,
    saved_at   TEXT,
    version    INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS kpi_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    data       TEXT NOT NULL,
    saved_by   TEXT,
    saved_at   TEXT,
    note       TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL,
    entity     TEXT,
    active     INTEGER DEFAULT 1
  );
`);

// Seed initial state if empty
const existing = db.prepare('SELECT id FROM kpi_state').get();
if (!existing) {
  db.prepare(`
    INSERT INTO kpi_state (id, data, creds, saved_by, saved_at, version)
    VALUES (1, '{}', '{}', 'system', datetime('now'), 1)
  `).run();
}

// ── Routes ──────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    name: 'KPI Plataforma RR3',
    version: '1.0.0',
    time: new Date().toISOString()
  });
});

// Load current state (data + creds)
app.get('/api/load', (req, res) => {
  try {
    const row = db.prepare('SELECT data, creds, saved_by, saved_at, version FROM kpi_state WHERE id=1').get();
    if (!row) return res.json({ ok: false, error: 'No data found' });
    res.json({
      ok: true,
      data:     JSON.parse(row.data   || '{}'),
      creds:    JSON.parse(row.creds  || '{}'),
      savedBy:  row.saved_by,
      savedAt:  row.saved_at,
      version:  row.version
    });
  } catch(e) {
    console.error('/api/load error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Save current state
app.post('/api/save', (req, res) => {
  try {
    const { data, creds, savedBy, note } = req.body;
    if (!data) return res.status(400).json({ ok: false, error: 'No data provided' });

    const dataStr  = JSON.stringify(data);
    const credsStr = JSON.stringify(creds || {});
    const now      = new Date().toISOString();

    // Save to history before updating
    const current = db.prepare('SELECT data, saved_by, saved_at FROM kpi_state WHERE id=1').get();
    if (current && current.data !== '{}') {
      db.prepare(`
        INSERT INTO kpi_history (data, saved_by, saved_at, note)
        VALUES (?, ?, ?, ?)
      `).run(current.data, current.saved_by, current.saved_at, note || '');
    }

    // Update main state
    db.prepare(`
      UPDATE kpi_state 
      SET data=?, creds=?, saved_by=?, saved_at=?, version=version+1
      WHERE id=1
    `).run(dataStr, credsStr, savedBy || 'unknown', now);

    const updated = db.prepare('SELECT version FROM kpi_state WHERE id=1').get();
    res.json({ ok: true, version: updated.version, savedAt: now });
  } catch(e) {
    console.error('/api/save error:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Initialize with platform data (first time setup)
app.post('/api/init', (req, res) => {
  try {
    const { data, creds, secret } = req.body;
    if (secret !== process.env.INIT_SECRET && secret !== 'kpi-init-2026') {
      return res.status(403).json({ ok: false, error: 'Invalid secret' });
    }
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE kpi_state 
      SET data=?, creds=?, saved_by=?, saved_at=?, version=1
      WHERE id=1
    `).run(JSON.stringify(data), JSON.stringify(creds||{}), 'init', now);
    res.json({ ok: true, message: 'Platform initialized successfully' });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List history snapshots
app.get('/api/history', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, saved_by, saved_at, note
      FROM kpi_history
      ORDER BY id DESC
      LIMIT 20
    `).all();
    res.json({ ok: true, history: rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Restore a history snapshot
app.post('/api/restore/:id', (req, res) => {
  try {
    const snap = db.prepare('SELECT * FROM kpi_history WHERE id=?').get(req.params.id);
    if (!snap) return res.status(404).json({ ok: false, error: 'Snapshot not found' });
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE kpi_state SET data=?, saved_by=?, saved_at=?, version=version+1 WHERE id=1
    `).run(snap.data, 'restore:'+snap.saved_by, now);
    res.json({ ok: true, restoredFrom: snap.saved_at });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Serve the platform HTML
app.get('/plataforma', (req, res) => {
  const htmlPath = path.join(__dirname, 'plataforma_kpi.html');
  if (require('fs').existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).json({ error: 'Platform HTML not found. Upload plataforma_kpi.html to the server.' });
  }
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ KPI Server running on port ${PORT}`);
  console.log(`📊 Database: ${DB_PATH}`);
});
