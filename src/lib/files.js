// Durable store for credential PDFs and partner logos. The bytes live in PostgreSQL (stored_files), which survives
// redeploys and is covered by database backups; hosts such as Replit drop files written to disk when an app is
// redeployed. A copy is still written under STORAGE_DIR so an older release of the app keeps finding its files.
// Each key is written once: a database trigger refuses updates, so an issued credential keeps its exact bytes.
// Nothing here renders a PDF: a file that is lost everywhere is reported, never regenerated.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('../config');
const { q } = require('../db');

const TYPES = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const typeOf = (key) => TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
// Keys are the relative paths kept on the records (pdfs/<partner>/<credential>.pdf, logos/<partner>-<time>.png).
const validKey = (key) => typeof key === 'string' && /^[\w.-]+(\/[\w.-]+)+$/.test(key) && !key.split('/').includes('..');
const diskPath = (key) => path.join(cfg.storageDir, ...key.split('/'));

// Until the schema has created the table, files stay on disk only (the previous behavior) instead of failing.
let ready = false; let checkedAt = 0;
async function durable() {
  if (ready || Date.now() - checkedAt < 60 * 1000) return ready;
  checkedAt = Date.now();
  ready = (await q("SELECT to_regclass('stored_files') IS NOT NULL AS ok")).rows[0].ok;
  if (!ready) console.warn('[files] table stored_files is missing (the schema was not applied); files are kept on disk only until it exists.');
  return ready;
}

function writeDisk(key, buf) {
  try {
    const p = diskPath(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, buf);
    return p;
  } catch (e) { console.warn(`[files] disk copy of ${key} not written: ${e.message}`); return null; }
}

async function insert(run, key, buf) {
  const { rowCount } = await run('INSERT INTO stored_files (key, content, sha256, bytes, content_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key) DO NOTHING',
    [key, buf, sha256(buf), buf.length, typeOf(key)]);
  return rowCount;
}

/**
 * Saves a new file. Pass the transaction client so the file commits or rolls back with its record.
 * Returns the disk path written (callers remove it if their transaction fails), or null.
 */
async function putFile(key, buf, client) {
  if (!validKey(key)) throw new Error(`Invalid file key: ${key}`);
  if (await durable()) {
    const run = client ? (t, p) => client.query(t, p) : q;
    if (!(await insert(run, key, buf))) {
      const { rows: [f] } = await run('SELECT sha256 FROM stored_files WHERE key = $1', [key]);
      if (f.sha256 !== sha256(buf)) throw new Error(`File ${key} already exists with different content`);
    }
  }
  return writeDisk(key, buf);
}

/** Returns { content, type } or null. A file found only on disk (stored before this module existed) is copied in. */
async function getFile(key) {
  if (!validKey(key)) return null;
  const db = await durable();
  if (db) {
    const { rows: [f] } = await q('SELECT content, content_type FROM stored_files WHERE key = $1', [key]);
    if (f) return { content: f.content, type: f.content_type };
  }
  const p = diskPath(key);
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p);
  if (db) await insert(q, key, content).catch((e) => console.warn(`[files] ${key} not copied to the database: ${e.message}`));
  return { content, type: typeOf(key) };
}

// Every key a record points to: credential PDFs and partner logos.
const REFERENCED = `SELECT pdf_path AS key, 'credential' AS kind, cert_number AS ref FROM certificates WHERE pdf_path IS NOT NULL
  UNION ALL SELECT logo_path, 'logo', company_name FROM platforms WHERE logo_path IS NOT NULL`;

/** Copies files that exist only on disk into the database, byte for byte. Returns the number copied. */
async function backfill() {
  if (!(await durable())) return 0;
  const { rows } = await q(`SELECT r.key FROM (${REFERENCED}) r WHERE NOT EXISTS (SELECT 1 FROM stored_files f WHERE f.key = r.key)`);
  let copied = 0;
  for (const { key } of rows) {
    if (!validKey(key) || !fs.existsSync(diskPath(key))) continue;
    copied += await insert(q, key, fs.readFileSync(diskPath(key)));
  }
  return copied;
}

/** Storage health for the administrator: counts, size, and records whose file is not stored anywhere. */
async function health() {
  if (!(await durable())) return { durable: false };
  const { rows: [s] } = await q('SELECT count(*)::int AS files, coalesce(sum(bytes), 0)::bigint AS bytes FROM stored_files');
  const { rows } = await q(`SELECT r.* FROM (${REFERENCED}) r WHERE NOT EXISTS (SELECT 1 FROM stored_files f WHERE f.key = r.key)`);
  const diskOnly = rows.filter((r) => validKey(r.key) && fs.existsSync(diskPath(r.key)));
  const missing = rows.filter((r) => !diskOnly.includes(r));
  return { durable: true, files: s.files, bytes: Number(s.bytes), diskOnly: diskOnly.length, missing };
}

/** Recomputes every stored file's SHA-256 (on request: it reads all the bytes). Returns { checked, mismatched: [keys] }. */
async function checkIntegrity() {
  if (!(await durable())) return { checked: 0, mismatched: [] };
  const { rows } = await q("SELECT key, encode(sha256(content), 'hex') = sha256 AS ok FROM stored_files");
  return { checked: rows.length, mismatched: rows.filter((r) => !r.ok).map((r) => r.key) };
}

module.exports = { putFile, getFile, backfill, health, checkIntegrity, validKey, typeOf };
