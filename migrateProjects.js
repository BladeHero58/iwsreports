const fs = require('fs');
const pool = require('./db'); // Az adatbázis kapcsolat importálása

async function migrateProjects() {
    const projects = JSON.parse(fs.readFileSync('./projects.json', 'utf-8'));

    try {
        for (const project of projects) {
            // Ellenőrizd, hogy létezik-e már a projekt az adatbázisban
            const checkProject = await pool.query(
                `SELECT id FROM projects WHERE external_id = $1`,
                [project.id]
            );

            let projectId;
            if (checkProject.rows.length === 0) {
                // Ha nem létezik, szúrjuk be
                const result = await pool.query(
                    `INSERT INTO projects (external_id, name, description, status)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [project.id, project.name, project.description, project.status]
                );
                projectId = result.rows[0].id;
                console.log(`Inserted project: ${project.name} with ID: ${projectId}`);
            } else {
                // Ha létezik, használjuk a meglévő ID-t
                projectId = checkProject.rows[0].id;
                console.log(`Project already exists: ${project.name} with ID: ${projectId}`);
            }

            // Felhasználók beszúrása a "project_users" táblába
            for (const userId of project.assignedUsers) {
                const checkUser = await pool.query(
                    `SELECT id FROM project_users WHERE project_id = $1 AND user_id = $2`,
                    [projectId, userId]
                );

                if (checkUser.rows.length === 0) {
                    await pool.query(
                        `INSERT INTO project_users (project_id, user_id)
                         VALUES ($1, $2)`,
                        [projectId, userId]
                    );
                    console.log(`Assigned user ${userId} to project ${project.name}`);
                } else {
                    console.log(`User ${userId} already assigned to project ${project.name}`);
                }
            }
        }
    } catch (err) {
        console.error('Error migrating projects:', err);
    } finally {
        pool.end(); // Kapcsolat bezárása
    }
}

// Script futtatása
migrateProjects();

