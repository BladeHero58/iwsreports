
const { Pool } = require('pg');


const pool = new Pool({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost',       // Ha helyi gépen fut, ez marad
    database: 'project_management', // Az általad létrehozott adatbázis neve
    password: 'dbzzed58', // Az adatbázishoz tartozó jelszó
    port: 5432,                 // PostgreSQL alapértelmezett portja
});

module.exports = pool;

/*
//Éles környezet
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool;
*/
