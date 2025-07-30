//knexfile.js
require('dotenv').config();

module.exports = {
  // Ezt a development blokkot is beállíthatod, ha külön configot szeretnél
  // de a legegyszerűbb, ha a production blokkot tesszük okosabbá
  development: { // <-- Eltávolítva a komment
    client: 'pg',
    connection: {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      user: process.env.PGUSER || 'postgres', // HELYI DB FELHASZNÁLÓNÉV
      password: process.env.PGPASSWORD || 'dbzzed58', // HELYI DB JELSZÓ
      database: process.env.PGDATABASE || 'project_management', // HELYI DB NÉV
      ssl: false, // Helyi környezetben kikapcsoljuk az SSL-t
    },
    migrations: {
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  }, // <-- Eltávolítva a komment és a záró vessző is fontos!

  production: {
    client: 'pg',
    connection: {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
    },
    seeds: {
      directory: './seeds',
    },
  },
};