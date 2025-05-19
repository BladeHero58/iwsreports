/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('report_data', (table) => {
    table.increments('id').primary();
    table.integer('project_id').notNullable();
    table.string('report_id').notNullable().unique();
    table.jsonb('data');
    table.jsonb('merge_cells');
    table.jsonb('column_sizes');
    table.jsonb('row_sizes');
    table.jsonb('cell_styles');
    table.timestamps(true, true); // created_at és updated_at
    table.index('project_id');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('report_data');
};