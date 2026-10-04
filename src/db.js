const { Pool } = require('pg');
const { types } = require('pg');
types.setTypeParser(1082, (v) => v); // DATE → 'YYYY-MM-DD' string (avoid timezone shifts)
// PG_SCHEMA (optional): run inside a dedicated schema, e.g. when sharing one database with another app.
const schema = /^[a-z_][a-z0-9_]*$/i.test(process.env.PG_SCHEMA || '') ? process.env.PG_SCHEMA : null;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ...(schema ? { options: `-c search_path=${schema},public` } : {}) });
const q = (text, params) => pool.query(text, params);
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
module.exports = { pool, q, tx };
