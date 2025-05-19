/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
   return knex.schema.alterTable('project_reports', (table) => {
    table.string('latest_report_id').unique(); // Hozzáadjuk az oszlopot, egyedi is lehet, ha biztosan csak egy legutolsó van
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.alterTable('project_reports', (table) => {
    table.dropColumn('latest_report_id');
  });
};
