'use strict';
// PostgreSQL connection pool. "pg" is loaded lazily so unit tests (which use an
// in-memory repository) never need a database driver or a running database.
function createDb(config) {
  const { Pool } = require('pg');
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  // An idle client dropping (e.g. DB restart) must not crash the process.
  pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

  return {
    query: (text, params) => pool.query(text, params),
    ping: async () => { await pool.query('SELECT 1'); },
    close: () => pool.end(),
  };
}

module.exports = { createDb };
