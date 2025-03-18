const knex = require('knex')(require('./knexfile.js').development); // development környezet

async function runMigrations() {
  try {
    console.log('Adatbázis kapcsolat ellenőrzése...');
    await knex.raw('SELECT 1'); // Egyszerű lekérdezés az adatbázis kapcsolat ellenőrzésére
    console.log('Adatbázis kapcsolat sikeres!');

    console.log('Migrációk futtatása...');
    await knex.migrate.latest();
    console.log('Migrációk sikeresen futottak!');

    process.exit(0); // Sikeres futás esetén kilépés
  } catch (error) {
    console.error('Hiba a migrációk futtatása közben:', error);
    process.exit(1); // Hibás futás esetén kilépés
  } finally {
    await knex.destroy(); // Adatbázis kapcsolat lezárása
  }
}

runMigrations();