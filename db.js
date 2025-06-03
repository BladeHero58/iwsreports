const { Pool } = require('pg');

let pool;

// Ellenőrizzük, hogy létezik-e a DATABASE_URL környezeti változó
if (process.env.DATABASE_URL) {
  // Éles környezet
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  // Lokális fejlesztői környezet
  pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'project_management',
    password: 'dbzzed58',
    port: 5432,
  });
}

module.exports = pool;