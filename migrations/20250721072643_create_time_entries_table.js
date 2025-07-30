exports.up = function(knex) {
  return knex.schema.createTable('time_entries', function(table) {
    table.increments('id').primary(); // Primary Key
    table.bigInteger('user_id').unsigned().notNullable(); // Foreign Key a users táblára
    table.timestamp('start_time').notNullable(); // Munkaidő kezdete, 'timestamp without time zone'
    table.timestamp('end_time'); // Munkaidő vége, 'timestamp without time zone' (NULLABLE, ha még dolgozik)
    table.integer('break_duration_minutes').defaultTo(0); // Szünetek hossza percekben
    table.text('notes'); // Egyéb megjegyzések

    // created_at és updated_at automatikus kezelése (consistency miatt without time zone)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign Key Constraint
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  })
  .then(() => knex.raw('CREATE TRIGGER update_time_entries_timestamp BEFORE UPDATE ON time_entries FOR EACH ROW EXECUTE FUNCTION update_timestamp();'));
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('time_entries')
    .then(() => knex.raw('DROP TRIGGER IF EXISTS update_time_entries_timestamp ON time_entries;'));
};