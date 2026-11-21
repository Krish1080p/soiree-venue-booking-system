const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const disableSsl =
  process.env.DATABASE_SSL === 'false' ||
  (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=disable'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000,
  ...(!disableSsl && isProduction ? { ssl: { rejectUnauthorized: false } } : {})
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

module.exports = pool;