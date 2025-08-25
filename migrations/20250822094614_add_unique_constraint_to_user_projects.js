exports.up = function(knex) {
  return knex.schema.table('user_projects', function(table) {
    table.unique(['user_id', 'project_id']);
  });
};

exports.down = function(knex) {
  return knex.schema.table('user_projects', function(table) {
    table.dropUnique(['user_id', 'project_id']);
  });
};