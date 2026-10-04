require('../src/config');
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

// The schema lives in src/ so folder clean-ups of "db/" (e.g. by hosting tools) cannot remove it.
const candidates = [path.join(__dirname, '..', 'src', 'schema.sql'), path.join(__dirname, '..', 'db', 'schema.sql')];
(async () => {
  const file = candidates.find((f) => fs.existsSync(f));
  if (!file) throw new Error(`Schema file not found. Looked in: ${candidates.join(', ')}. Pull the latest code (git) and try again.`);
  await pool.query(fs.readFileSync(file, 'utf8'));
  console.log(`Schema applied (${path.relative(process.cwd(), file)}).`);
  await pool.end();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
