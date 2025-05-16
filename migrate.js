// Határozd meg a környezetet a NODE_ENV alapján (amit a Railway beállít)
const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile.js')[environment];
const knex = require('knex')(knexConfig);

async function runMigrations() {
  try {
    console.log(`Adatbázis kapcsolat ellenőrzése (${environment} környezet)...`);
    await knex.raw('SELECT 1');
    console.log('Adatbázis kapcsolat sikeres!');

    console.log('Migrációk futtatása...');
    await knex.migrate.latest();
    console.log('Migrációk sikeresen futottak!');

    process.exit(0);
  } catch (error) {
    console.error('Hiba a migrációk futtatása közben:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

runMigrations();