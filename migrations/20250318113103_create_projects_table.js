/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('projects', function(table) {
      table.increments('id').primary();
      table.string('external_id', 255);
      table.string('name', 255);
      table.text('description');
      table.string('status', 50);
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('projects');
  };


  
 