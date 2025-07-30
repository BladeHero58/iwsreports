// db.js
const { Pool } = require('pg');
const knex = require('knex'); // Knex könyvtár importálása
const knexfile = require('./knexfile'); // Knex konfigurációs fájl importálása

let pgPool; // Átnevezzük 'pool'-ról 'pgPool'-ra a tisztaság kedvéért
let knexInstance; // Knex példány

// PG Pool inicializálása
if (process.env.DATABASE_URL) {
    // Éles környezet
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
} else {
    // Lokális fejlesztői környezet
    pgPool = new Pool({
        user: process.env.PGUSER || 'postgres', // Használjuk a környezeti változókat
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'project_management',
        password: process.env.PGPASSWORD || 'dbzzed58', // FIGYELEM: IDE A VALÓDI JELSZAVADAT ÍRD, VAGY HAGYD ÜRESEN, HA A .ENV-BŐL JÖN!
        port: process.env.PGPORT || 5432,
        ssl: false // Helyi környezetben kikapcsoljuk az SSL-t
    });
}

// Knex inicializálása
// Mivel a knexfile.js már tartalmazza a dinamikus SSL logikát,
// egyszerűen a production configot használjuk, ami a NODE_ENV alapján vált.
knexInstance = knex(knexfile.production);

// Exportáljuk mindkét objektumot
module.exports = {
    pool: pgPool, // A régi kódok továbbra is ezt használják
    knex: knexInstance // Az új kódok (pl. óranyilvántartás) ezt használják
};
