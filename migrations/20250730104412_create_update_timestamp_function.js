exports.up = function(knex) {
  return knex.schema.createTable('appointments', function(table) {
    table.increments('id').primary(); // Egyedi azonosító a bejegyzésnek
    table.integer('user_id').unsigned().notNullable(); // Melyik felhasználóhoz tartozik
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');

    table.integer('project_id').unsigned(); // Melyik projekthez tartozik (opcionális)
    table.foreign('project_id').references('id').inTable('projects').onDelete('SET NULL');

    table.string('title').notNullable(); // A beosztás címe
    table.text('description'); // Leírás a beosztásról (opcionális)
    table.dateTime('start_time').notNullable(); // Beosztás kezdete
    table.dateTime('end_time').notNullable(); // Beosztás vége
    table.string('location'); // Helyszín (opcionális)

    // Ezt a két sort add hozzá vagy ellenőrizd, hogy léteznek-e:
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now()); // Ez az oszlop, amit a trigger frissíteni fog

  })
  .then(() => {
    // Ezt a blokkot kell hozzáadnod, ha még nincs benne, VAGY ha a tábla létrehozásán belül volt:
    // Itt hozzuk létre a triggert, miután a tábla már létezik
    return knex.raw(`
      CREATE TRIGGER update_appointments_timestamp
      BEFORE UPDATE ON appointments
      FOR EACH ROW
      EXECUTE FUNCTION update_timestamp();
    `);
  });
};

exports.down = function(knex) {
  // A down függvény fordított sorrendben kell, hogy működjön
  // Először a triggert töröljük, aztán a táblát
  return knex.raw(`
    DROP TRIGGER IF EXISTS update_appointments_timestamp ON appointments;
  `)
  .then(() => {
    return knex.schema.dropTableIfExists('appointments');
  });
};