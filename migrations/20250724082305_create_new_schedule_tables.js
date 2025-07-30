// migrations/YYYYMMDDHHMMSS_create_new_schedule_tables.js (ez lesz a tényleges fájlneved)

exports.up = function(knex) {
    return knex.schema
        .createTable('schedules', function(table) {
            table.increments('id').primary(); // Primary Key
            table.date('schedule_date').notNullable().unique(); // Egyedi dátum minden beosztáshoz
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
        })
        .createTable('schedule_rows', function(table) {
            table.increments('id').primary();
            table.integer('schedule_id').unsigned().notNullable();
            table.foreign('schedule_id').references('id').inTable('schedules').onDelete('CASCADE');
            table.text('person_name').notNullable();
            table.integer('row_order').notNullable(); // Sortörléshez, rendezéshez
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            table.unique(['schedule_id', 'person_name']); // Egy névre csak egy sor lehet egy beosztásban
        })
        .createTable('schedule_cells', function(table) {
            table.increments('id').primary();
            table.integer('schedule_row_id').unsigned().notNullable();
            table.foreign('schedule_row_id').references('id').inTable('schedule_rows').onDelete('CASCADE');
            table.integer('day_of_week').notNullable(); // 1=Hétfő, 7=Vasárnap
            table.text('content'); // Cella tartalma
            table.timestamp('created_at').defaultTo(knex.fn.now());
            table.timestamp('updated_at').defaultTo(knex.fn.now());
            table.unique(['schedule_row_id', 'day_of_week']); // Egy sorban egy napra csak egy bejegyzés
        });
};

exports.down = function(knex) {
    return knex.schema
        .dropTableIfExists('schedule_cells')
        .dropTableIfExists('schedule_rows')
        .dropTableIfExists('schedules');
};