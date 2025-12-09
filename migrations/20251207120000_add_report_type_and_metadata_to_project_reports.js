/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
    const hasReportType = await knex.schema.hasColumn('project_reports', 'report_type');
    const hasMetadata = await knex.schema.hasColumn('project_reports', 'metadata');

    return knex.schema.table('project_reports', function(table) {
        // Hozzáadjuk a report_type oszlopot, ha még nem létezik
        if (!hasReportType) {
            table.string('report_type', 50).defaultTo('IWS Solutions');
        }

        // Hozzáadjuk a metadata oszlopot, ha még nem létezik
        if (!hasMetadata) {
            table.jsonb('metadata');
        }
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
