/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.createTable('project_reports', function(table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.string('file_path', 255);
      table.integer('project_id').unsigned().references('id').inTable('projects');
      table.string('name', 255);
      table.text('column_sizes');
      table.text('row_sizes');
      table.jsonb('cell_styles');
      table.jsonb('table_data');
      table.jsonb('cell_metadata');
    });
  };

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.dropTable('project_reports');
  };


  
