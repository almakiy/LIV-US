require('../src/config');
const { pool } = require('../src/db');
const { migrate } = require('../src/lib/migrate');

(async () => {
  await migrate();
  console.log('Schema applied.');
  await pool.end();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
