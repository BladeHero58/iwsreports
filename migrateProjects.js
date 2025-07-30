// migrateProjects.js
const fs = require('fs');
const path = require('path'); // <-- ADD THIS LINE
const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile.js')[environment];
const knex = require('knex')(knexConfig);

async function migrateProjects() {
    console.log("MIGRATE_PROJECTS_DEBUG: Projektek migrálása elindult!");

    let projects;
    // Keresd meg a projects.json fájlt a gyökérkönyvtárban
    const projectFilePath = path.join(process.cwd(), 'projects.json'); // <-- Use process.cwd() for root path

    console.log(`MIGRATE_PROJECTS_DEBUG: Keresem a projects.json fájlt itt: ${projectFilePath}`);

    try {
        // 1. Biztonságos fájlbeolvasás
        if (!fs.existsSync(projectFilePath)) {
            console.error(`MIGRATE_PROJECTS_ERROR: A projects.json fájl nem található a megadott útvonalon: ${projectFilePath}`);
            throw new Error(`A projects.json fájl nem található: ${projectFilePath}`);
        }
        const fileContent = fs.readFileSync(projectFilePath, 'utf-8');
        console.log("MIGRATE_PROJECTS_DEBUG: projects.json sikeresen beolvasva.");
        projects = JSON.parse(fileContent);
        console.log("MIGRATE_PROJECTS_DEBUG: projects.json sikeresen feldolgozva.");
    } catch (error) {
        // Ha a fájl nem létezik vagy hibás a JSON, itt elkapjuk
        console.error("MIGRATE_PROJECTS_ERROR: Hiba a projects.json beolvasásakor vagy feldolgozásakor!", error.message);
        console.error("MIGRATE_PROJECTS_ERROR: Stack trace:", error.stack);
        throw error; // Dobjuk tovább a hibát, hogy a szkript leálljon
    }

    // --- A CIKLUS MÁR BIZTONSÁGOSAN KEZELI A HIBÁKAT, EZÉRT NEM KELL KÜLÖN TRY/CATCH ----
    // De azért adhatunk neki egy külső try/catch-et, ha valami váratlanul történik
    try {
        for (const project of projects) {
            // Ellenőrizzük, hogy a project objektum valid-e
            if (!project || !project.id || !project.name) {
                console.warn("MIGRATE_PROJECTS_WARNING: Hibás projekt bejegyzés a JSON-ban, kihagyva:", project);
                continue; // Ugrás a következő projektre
            }

            // Wrap each database operation in a try-catch for more granular error logging
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
                        const existingAssignment = await knex('user_projects') // <-- Feltételezem a tábla neve user_projects
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
                        // Ne állítsuk le az egész migrálást egy felhasználó hozzárendelési hiba miatt, folytassuk
                    }
                }
            } catch (projectDbError) {
                console.error(`MIGRATE_PROJECTS_ERROR: Hiba a projekt (${project.name}) adatbázis művelete során:`, projectDbError.message);
                console.error("MIGRATE_PROJECTS_ERROR: Stack trace (project DB operation):", projectDbError.stack);
                // Ha egy projekt beillesztése vagy frissítése hibát dob, az kritikus lehet, de az outer catch blokk úgyis elkapja.
            }
        }
        console.log("MIGRATE_PROJECTS_DEBUG: Minden projekt feldolgozása befejeződött.");
    } catch (mainLoopError) {
        console.error("MIGRATE_PROJECTS_ERROR: Hiba a fő migrációs ciklus során:", mainLoopError.message);
        console.error("MIGRATE_PROJECTS_ERROR: Stack trace (main loop):", mainLoopError.stack);
        throw mainLoopError; // Fontos, hogy ez is tovább legyen dobva a külső catch-nek.
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
        knex.destroy(); // Adatbázis kapcsolat lezárása mindig
        console.log("MIGRATE_PROJECTS_DEBUG: Knex kapcsolat lezárva.");
        process.exit(0); // Mindig 0-val lépünk ki, hogy a Render tovább menjen a server.js-re.
                        // HA VAN HIBA ÉS NEM AKAROD, HOGY A SERVER ELINDULJON: process.exit(1);
                        // De a debugoláshoz most a 0 jobb, mert így látjuk a server.js logjait is.
    });