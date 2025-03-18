/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('user_projects', function(table) {
      table.integer('user_id').unsigned().references('id').inTable('users').primary();
      table.integer('project_id').unsigned().references('id').inTable('projects').primary();
      table.primary(['user_id', 'project_id']); // Összetett elsődleges kulcs definíciója
    });
  };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('user_projects');
  };


  
 