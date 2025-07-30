
exports.up = function(knex) {
  return knex.schema.createTable('appointments', function(table) {
    table.increments('id').primary(); // Primary Key
    table.bigInteger('user_id').unsigned().notNullable(); // Foreign Key a users táblára
    table.timestamp('start_time').notNullable(); // Kezdő időpont, 'timestamp without time zone'
    table.timestamp('end_time'); // Befejező időpont, 'timestamp without time zone' (NULLABLE)
    table.string('location', 255); // Hol fog dolgozni
    table.text('description'); // További megjegyzések

    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
  })
  .then(() => knex.raw('CREATE TRIGGER update_appointments_timestamp BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_timestamp();'));
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('appointments')
    .then(() => knex.raw('DROP TRIGGER IF EXISTS update_appointments_timestamp ON appointments;'));
};