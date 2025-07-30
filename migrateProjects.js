// migrateProjects.js
const fs = require('fs');
const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile.js')[environment];
const knex = require('knex')(knexConfig);

async function migrateProjects() {
    console.log("Projektek migrálása elindult!");

    let projects;
    try {
        // 1. Biztonságos fájlbeolvasás
        const fileContent = fs.readFileSync('./projects.json', 'utf-8');
        projects = JSON.parse(fileContent);
    } catch (error) {
        // Ha a fájl nem létezik vagy hibás a JSON, itt elkapjuk
        console.error("Hiba a projects.json beolvasásakor!", error);
        throw error; // Dobjuk tovább a hibát, hogy a szkript leálljon
    }

    for (const project of projects) {
        // Ellenőrizzük, hogy a project objektum valid-e
        if (!project || !project.id || !project.name) {
            console.warn("Hibás projekt bejegyzés a JSON-ban, kihagyva:", project);
            continue; // Ugrás a következő projektre
        }

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
            // A returning viselkedése adatbázisonként eltérő lehet
            projectId = typeof insertedProject === 'object' ? insertedProject.id : insertedProject;
            console.log(`Projekt beszúrva: ${project.name} (ID: ${projectId})`);
        } else {
            projectId = existingProject.id;
        }

        // 2. Biztonságos ciklus a felhasználókon
        for (const userId of project.assignedUsers || []) {
            const existingAssignment = await knex('user_projects') // <-- Feltételezem a tábla neve user_projects
                .where({ project_id: projectId, user_id: userId })
                .first();

            if (!existingAssignment) {
                await knex('user_projects').insert({
                    project_id: projectId,
                    user_id: userId
                });
                console.log(`Felhasználó (${userId}) hozzárendelve a projekthez: ${project.name}`);
            }
        }
    }
}

// Futtatás és a folyamat bezárása
migrateProjects()
    .then(() => {
        console.log("Projektek migrálása sikeresen befejeződött.");
        knex.destroy(); // Adatbázis kapcsolat lezárása
        process.exit(0); // Kilépés 0-s (siker) kóddal
    })
    .catch((error) => {
        console.error("Súlyos hiba a projektek migrálása során:", error);
        knex.destroy(); // Adatbázis kapcsolat lezárása
        process.exit(1); // Kilépés 1-es (hiba) kóddal
    });