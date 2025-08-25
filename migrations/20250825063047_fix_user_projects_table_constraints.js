exports.up = function(knex) {
  return knex.schema.alterTable('user_projects', function(table) {
    // Távolítsa el a PRIMARY KEY megszorítást a 'user_id' oszlopról
    // Ez a parancs a tábla felépítésétől függően változhat
    // Ha a PRIMARY KEY nem 'user_id'-n van, hanem pl. 'id' oszlopon
    // akkor a 'user_projects_pkey' néven keresendő megszorítás törlése a megfelelő
    // A legjobb megoldás a megszorítás nevének kiderítése az adatbázisból.
    // Példakód:
    table.dropPrimary(); // Ez a sor törli az aktuális PRIMARY KEY-t.

    // Adjon hozzá egy új PRIMARY KEY megszorítást a (user_id, project_id) oszlopokra
    table.primary(['user_id', 'project_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('user_projects', function(table) {
    // Visszavonás: először törölje az új PRIMARY KEY-t
    table.dropPrimary();
    // Majd adja vissza a régit
    table.primary('user_id'); // Vagy a megfelelő régi kulcs definíciója
  });
};