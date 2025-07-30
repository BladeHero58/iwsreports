// migrations/YYYYMMDDHHMMSS_alter_time_entries_for_manual_entry.js
exports.up = function(knex) {
  return knex.schema.alterTable('time_entries', function(table) {
    table.date('entry_date').notNullable().defaultTo(knex.fn.now()); // Dátum, alapértelmezett a mai nap
    table.integer('project_id').nullable(); // Projekt ID, lehet NULL
    table.foreign('project_id').references('id').inTable('projects').onDelete('SET NULL'); // Külső kulcs
    table.decimal('hours_worked', 5, 2).notNullable().defaultTo(0.00); // Órák száma (pl. 8.00 vagy 4.5)
    table.string('entry_type', 50).notNullable().defaultTo('work'); // Bejegyzés típusa (pl. 'work', 'leave', 'sick_leave')
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('time_entries', function(table) {
    table.dropForeign('project_id'); // Először a külső kulcsot kell törölni
    table.dropColumn('entry_date');
    table.dropColumn('project_id');
    table.dropColumn('hours_worked');
    table.dropColumn('entry_type');
  });
};