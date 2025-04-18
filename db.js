/*
 const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost',     // Ha helyi gépen fut, ez marad
    database: 'project_management', // Az általad létrehozott adatbázis neve
    password: 'dbzzed58', // Az adatbázishoz tartozó jelszó
    port: 5432,            // PostgreSQL alapértelmezett portja
});

module.exports = pool;
*/


const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

module.exports = pool;
