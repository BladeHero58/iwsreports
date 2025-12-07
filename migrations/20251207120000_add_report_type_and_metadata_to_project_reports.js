/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema.table('project_reports', function(table) {
        // Hozzáadjuk a report_type oszlopot (VARCHAR típusú, alapértelmezett érték: 'IWS Solutions')
        table.string('report_type', 50).defaultTo('IWS Solutions');

        // Hozzáadjuk a metadata oszlopot (JSONB típusú, lehet NULL)
        table.jsonb('metadata');
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema.table('project_reports', function(table) {
        table.dropColumn('report_type');
        table.dropColumn('metadata');
    });
};
