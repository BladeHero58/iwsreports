exports.up = function(knex) {
  return knex.schema.alterTable('time_entries', function(table) {
    table.timestamp('start_time').nullable().alter(); // Engedélyezi a NULL-t és módosítja az oszlopot
    table.timestamp('end_time').nullable().alter();   // Engedélyezi a NULL-t és módosítja az oszlopot
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('time_entries', function(table) {
    // Ha vissza szeretnéd állítani a NOT NULL kényszert
    table.timestamp('start_time').notNullable().alter();
    table.timestamp('end_time').notNullable().alter();
  });
};