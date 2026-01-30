const { Pool } = require('pg');

// URL encoded password: @ -> %40
const connectionString = 'postgresql://postgres:%40SagarGupta0902@db.tasdstquvpvuzbyreefa.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
