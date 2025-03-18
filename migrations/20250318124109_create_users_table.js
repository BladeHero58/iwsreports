/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('users', function(table) {
      table.increments('id').primary();
      table.string('username', 255).unique().notNullable();
      table.string('password', 255).notNullable();
      table.boolean('is_admin').defaultTo(false);
    }).then(() => {
      return knex('users').insert({
        id: 2,
        username: 'admin',
        password: '$2a$10$Y1EeDieI2B6iM3ejFl4VcO7AGmTD3egMmPhFcPUUbg0iCvNTpZ2k.',
        is_admin: true,
      });
    });
  };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('users');
  };


  
  