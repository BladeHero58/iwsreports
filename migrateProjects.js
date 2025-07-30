// migrateProjects.js
const fs = require('fs');

// Ide be kell töltened a Knex konfigurációt és inicializálnod a Knex-et
const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile.js')[environment]; // Feltételezi, hogy a knexfile.js a gyökérkönyvtárban van
const knex = require('knex')(knexConfig); // Knex inicializálása

async function migrateProjects() {
    console.log("Projektek migrálása elindult!"); // Hozzáadva egy log
    const projects = JSON.parse(fs.readFileSync('./projects.json', 'utf-8'));

    try {
        for (const project of projects) {
            let projectId;

            // Ellenőrizd, hogy létezik-e már a projekt az adatbázisban a Knex query builderrel
            const checkProject = await knex('projects')
                .select('id')
                .where('external_id', project.id)
                .first(); // .first() hogy csak az első találatot kapjuk meg

            if (!checkProject) { // Ha a checkProject null vagy undefined
                // Ha nem létezik, szúrjuk be
                const [insertedId] = await knex('projects').insert({
                    external_id: project.id, // Ha az external_id a json-ben szereplő id
                    name: project.name,
                    description: project.description,
                    status: project.status
                }).returning('id'); // A Knex returning metódusa visszaadja a beszúrt id-t

                projectId = insertedId;
                console.log(`Inserted project: ${project.name} with ID: ${projectId}`);
            } else {
                // Ha létezik, használjuk a meglévő ID-t
                projectId = checkProject.id;
                console.log(`Project already exists: ${project.name} with ID: ${projectId}`);
            }

            // Felhasználók beszúrása a "project_users" táblába
            for (const userId of project.assignedUsers) {
                // Ellenőrzés Knex-szel
                const checkUserAssignment = await knex('project_users')
                    .select('id')
                    .where({ project_id: projectId, user_id: userId })
                    .first();

                if (!checkUserAssignment) {
                    await knex('project_users').insert({
                        project_id: projectId,
                        user_id: userId
                    });
                    console.log(`Assigned user ${userId} to project ${project.name}`);
                } else {
                    console.log(`User ${userId} already assigned to project ${project.name}`);
                }
            }
        }
        console.log("Projektek migrálása befejeződött."); // Log a befejezéshez
    } catch (err) {
        console.error('Hiba a projektek migrálásakor:', err);
        throw err; // Fontos: dobja tovább a hibát, hogy a process.exit(1) megtörténjen, ha hiba van
    } finally {
        // Itt ne hívd a knex.destroy()-t vagy pool.end()-et,
        // mert a migrate.js futtatja ezt is, és az kezeli a kapcsolat lezárását,
        // vagy a fő server.js fájl tartja fenn a kapcsolatot.
        // A Knex-kapcsolat bezárását a fő alkalmazásnak (server.js) kell kezelnie,
        // vagy ott, ahol a Knex inicializálva van, és ahol már nincs szükség rá.
    }
}

// Script futtatása
migrateProjects()
    .then(() => {
        console.log("migrateProjects.js sikeresen befejeződött.");
    })
    .catch((error) => {
        console.error("migrateProjects.js futása hibával végződött:", error);
        process.exit(1); // Kilépés hibakóddal, ha hiba történt
    });