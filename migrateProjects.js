// migrateProjects.js
console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: Fájl eleje elérve."); // EZ A LEGELSŐ LOG

const fs = require('fs');
console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: fs betöltve.");

const path = require('path');
console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: path betöltve.");

const environment = process.env.NODE_ENV || 'development';
console.log(`MIGRATE_PROJECTS_STARTUP_DEBUG: Environment: ${environment}`);

try {
    const knexConfig = require('./knexfile.js')[environment];
    console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: knexfile.js betöltve.");
    console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: knexConfig objektum (első 100 karakter):", JSON.stringify(knexConfig).substring(0, 100) + '...');

    const knex = require('knex')(knexConfig);
    console.log("MIGRATE_PROJECTS_STARTUP_DEBUG: knex inicializálva.");

    async function migrateProjects() {
        console.log("MIGRATE_PROJECTS_DEBUG: Projektek migrálása elindult!"); // Ezt már láttuk
        // ... a korábbi migrateProjects függvényed többi része ...

        let projects;
        const projectFilePath = path.join(process.cwd(), 'projects.json');
        console.log(`MIGRATE_PROJECTS_DEBUG: Keresem a projects.json fájlt itt: ${projectFilePath}`);

        try {
            if (!fs.existsSync(projectFilePath)) {
                console.error(`MIGRATE_PROJECTS_ERROR: A projects.json fájl nem található a megadott útvonalon: ${projectFilePath}`);
                throw new Error(`A projects.json fájl nem található: ${projectFilePath}`);
            }
            const fileContent = fs.readFileSync(projectFilePath, 'utf-8');
            console.log("MIGRATE_PROJECTS_DEBUG: projects.json sikeresen beolvasva.");
            projects = JSON.parse(fileContent);
            console.log("MIGRATE_PROJECTS_DEBUG: projects.json sikeresen feldolgozva.");
        } catch (error) {
            console.error("MIGRATE_PROJECTS_ERROR: Hiba a projects.json beolvasásakor vagy feldolgozásakor!", error.message);
            console.error("MIGRATE_PROJECTS_ERROR: Stack trace:", error.stack);
            throw error;
        }

        try {
            for (const project of projects) {
                if (!project || !project.id || !project.name) {
                    console.warn("MIGRATE_PROJECTS_WARNING: Hibás projekt bejegyzés a JSON-ban, kihagyva:", project);
                    continue;
                }

                try {
                    const existingProject = await knex('projects')
                        .where('external_id', project.id)
                        .first();

                    let projectId;
                    if (!existingProject) {
                        const [insertedProject] = await knex('projects').insert({
                            external_id: project.id,
                            name: project.name,
                            description: project.description,
                            status: project.status
                        }).returning('id');
                        projectId = typeof insertedProject === 'object' ? insertedProject.id : insertedProject;
                        console.log(`MIGRATE_PROJECTS_DEBUG: Projekt beszúrva: ${project.name} (ID: ${projectId})`);
                    } else {
                        projectId = existingProject.id;
                        console.log(`MIGRATE_PROJECTS_DEBUG: Projekt már létezik, kihagyva: ${project.name} (ID: ${projectId})`);
                    }

                    for (const userId of project.assignedUsers || []) {
                        try {
                            const existingAssignment = await knex('user_projects')
                                .where({ project_id: projectId, user_id: userId })
                                .first();

                            if (!existingAssignment) {
                                await knex('user_projects').insert({
                                    project_id: projectId,
                                    user_id: userId
                                });
                                console.log(`MIGRATE_PROJECTS_DEBUG: Felhasználó (${userId}) hozzárendelve a projekthez: ${project.name}`);
                            } else {
                                console.log(`MIGRATE_PROJECTS_DEBUG: Felhasználó (${userId}) már hozzá van rendelve a projekthez: ${project.name}`);
                            }
                        } catch (userAssignError) {
                            console.error(`MIGRATE_PROJECTS_ERROR: Hiba a felhasználó (${userId}) hozzárendelésekor a projekthez (${project.name}):`, userAssignError.message);
                            console.error("MIGRATE_PROJECTS_ERROR: Stack trace (user assignment):", userAssignError.stack);
                        }
                    }
                } catch (projectDbError) {
                    console.error(`MIGRATE_PROJECTS_ERROR: Hiba a projekt (${project.name}) adatbázis művelete során:`, projectDbError.message);
                    console.error("MIGRATE_PROJECTS_ERROR: Stack trace (project DB operation):", projectDbError.stack);
                }
            }
            console.log("MIGRATE_PROJECTS_DEBUG: Minden projekt feldolgozása befejeződött.");
        } catch (mainLoopError) {
            console.error("MIGRATE_PROJECTS_ERROR: Hiba a fő migrációs ciklus során:", mainLoopError.message);
            console.error("MIGRATE_PROJECTS_ERROR: Stack trace (main loop):", mainLoopError.stack);
            throw mainLoopError;
        }
    }

    // Futtatás és a folyamat bezárása
    migrateProjects()
        .then(() => {
            console.log("MIGRATE_PROJECTS_SUCCESS: Projektek migrálása sikeresen befejeződött.");
        })
        .catch((error) => {
            console.error("MIGRATE_PROJECTS_FATAL_ERROR: Súlyos hiba a projektek migrálása során, leállás:", error.message);
            console.error("MIGRATE_PROJECTS_FATAL_ERROR: Stack trace (fatal):", error.stack);
        })
        .finally(() => {
            knex.destroy();
            console.log("MIGRATE_PROJECTS_DEBUG: Knex kapcsolat lezárva.");
            process.exit(0);
        });

} catch (startupError) {
    console.error("MIGRATE_PROJECTS_FATAL_ERROR: Hiba a migrateProjects.js indításakor (knexfile/knex inicializálás):", startupError.message);
    console.error("MIGRATE_PROJECTS_FATAL_ERROR: Stack trace (startup):", startupError.stack);
    process.exit(1); // Itt már kilépünk hibával, mert a Knex nélkül nem tudunk mit tenni.
}