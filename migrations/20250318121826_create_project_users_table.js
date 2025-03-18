/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('project_users', function(table) {
      table.increments('id').primary();
      table.integer('project_id').unsigned().references('id').inTable('projects');
      table.string('user_id', 255); // character varying 255-öt feltételezek
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
  };

  /**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */

exports.down = function(knex) {
    return knex.schema.dropTable('project_users');
  };


  
 