const { Pool } = require('pg');

let pool;

// Ellenőrizzük a környezetet
if (process.env.NODE_ENV === 'production') {
  // Production környezetben használjuk a DATABASE_URL-t
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Railway-en gyakran szükséges SSL beállítás
    }
  });
} else {
  // Development környezetben használhatjuk a lokális beállításokat
  pool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: process.env.PGDATABASE || 'project_management',
    password: process.env.PGPASSWORD || 'dbzzed58',
    port: process.env.PGPORT || 5432
  });
}

module.exports = pool;