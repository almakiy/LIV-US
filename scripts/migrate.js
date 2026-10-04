require('../src/config');
const { pool } = require('../src/db');
const schema = require('../src/schema');

(async () => {
  await pool.query(schema);
  console.log('Schema applied.');
  await pool.end();
})().catch((e) => { console.error(e.message || e); process.exit(1); });
