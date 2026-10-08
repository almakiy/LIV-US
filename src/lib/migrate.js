// Applies the idempotent schema (src/schema.js). Used by `npm run migrate` and at server start, so a host that only runs
// `npm start` (such as a Replit deployment) still gets new tables. The schema runs as one transaction; an advisory lock
// keeps two starting servers from applying it at the same time.
const { pool } = require('../db');
const schema = require('../schema');

async function migrate() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(727002)');
    await c.query(schema);
  } finally {
    await c.query('SELECT pg_advisory_unlock(727002)').catch(() => {});
    c.release();
  }
}
module.exports = { migrate };
