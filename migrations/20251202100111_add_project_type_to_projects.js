// A létrehozott migrációs fájl tartalma (pl. 20251202110530_add_project_type_to_projects.js)

exports.up = function(knex) {
  // A 'projects' táblát módosítjuk
  return knex.schema.alterTable('projects', function(table) {
    // Hozzáadja a 'project_type' oszlopot.
    // Alapértelmezett értéke: 'IWS Solutions', hogy a meglévő projektek ne sérüljenek.
    table.string('project_type', 50).notNullable().defaultTo('IWS Solutions');
  });
};

exports.down = function(knex) {
  // Ha vissza szeretnéd vonni a migrációt, ez a funkció fut le
  return knex.schema.alterTable('projects', function(table) {
    table.dropColumn('project_type');
  });
};