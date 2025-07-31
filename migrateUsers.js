
// migrateUsers.js
console.log("MIGRATE_USERS_STARTUP_DEBUG: Fájl eleje elérve.");

const fs = require('fs');
console.log("MIGRATE_USERS_STARTUP_DEBUG: fs betöltve.");

const path = require('path'); // Hozzáadva a path modul
console.log("MIGRATE_USERS_STARTUP_DEBUG: path betöltve.");

const bcrypt = require('bcryptjs');
console.log("MIGRATE_USERS_STARTUP_DEBUG: bcrypt betöltve.");

// Ide be kell töltened a Knex konfigurációt és inicializálnod a Knex-et
const environment = process.env.NODE_ENV || 'development';
console.log(`MIGRATE_USERS_STARTUP_DEBUG: Environment: ${environment}`);

let knex; // Knex inicializálása
try {
    const knexConfig = require('./knexfile.js')[environment]; // Feltételezi, hogy a knexfile.js a gyökérkönyvtárban van
    console.log("MIGRATE_USERS_STARTUP_DEBUG: knexfile.js betöltve.");
    // Logoljuk a knexConfig egy részét, de ne az egészet, ha érzékeny adatot tartalmaz
    console.log("MIGRATE_USERS_STARTUP_DEBUG: knexConfig objektum (első 100 karakter):", JSON.stringify(knexConfig).substring(0, 100) + '...');

    knex = require('knex')(knexConfig); // Knex inicializálása
    console.log("MIGRATE_USERS_STARTUP_DEBUG: knex inicializálva.");

} catch (knexError) {
    console.error("MIGRATE_USERS_FATAL_ERROR: Hiba a Knex inicializálásakor:", knexError.message);
    console.error("MIGRATE_USERS_FATAL_ERROR: Stack trace (Knex startup):", knexError.stack);
    process.exit(1); // Kritikus hiba, leállunk
}

// A users.json fájl betöltése
let users;
const usersFilePath = path.join(process.cwd(), 'users.json'); // Használjuk a path-t a biztonságos útvonalhoz
console.log(`MIGRATE_USERS_STARTUP_DEBUG: Keresem a users.json fájlt itt: ${usersFilePath}`);

try {
    if (!fs.existsSync(usersFilePath)) { // Ellenőrizzük, létezik-e a fájl
        console.error(`MIGRATE_USERS_ERROR: A users.json fájl nem található a megadott útvonalon: ${usersFilePath}`);
        throw new Error(`A users.json fájl nem található: ${usersFilePath}`);
    }
    const fileContent = fs.readFileSync(usersFilePath, 'utf-8');
    console.log("MIGRATE_USERS_DEBUG: users.json sikeresen beolvasva.");
    users = JSON.parse(fileContent);
    console.log("MIGRATE_USERS_DEBUG: users.json sikeresen feldolgozva.");
} catch (error) {
    console.error("MIGRATE_USERS_FATAL_ERROR: Hiba a users.json beolvasásakor vagy feldolgozásakor!", error.message);
    console.error("MIGRATE_USERS_FATAL_ERROR: Stack trace (users.json):", error.stack);
    process.exit(1); // Kritikus hiba, leállunk
}


async function migrateUsers() {
    console.log("MIGRATE_USERS_DEBUG: Felhasználók migrálása elindult!");
    try {
        for (const user of users) {
            if (!user || !user.id || !user.username || !user.password) { // Ellenőrizzük a felhasználó adatok integritását
                console.warn("MIGRATE_USERS_WARNING: Hibás felhasználó bejegyzés a JSON-ban, kihagyva:", user);
                continue;
            }

            try { // Egyedi try-catch blokk minden felhasználóhoz
                const isAdmin = user.role === 'admin' || user.isAdmin === true;
                const hashedPassword = await bcrypt.hash(user.password, 10);

                await knex('users').insert({
                    id: user.id,
                    username: user.username,
                    password: hashedPassword,
                    is_admin: isAdmin
                }).onConflict('username').ignore();

                console.log(`MIGRATE_USERS_DEBUG: Felhasználó ${user.username} sikeresen migrálva vagy már létezett.`);
            } catch (userMigrateError) {
                console.error(`MIGRATE_USERS_ERROR: Hiba a felhasználó ${user.username} migrálásakor:`, userMigrateError.message);
                console.error("MIGRATE_USERS_ERROR: Stack trace (user migration):", userMigrateError.stack);
                // Folytatjuk a következő felhasználóval, nem állítjuk le a teljes migrációt egyetlen felhasználó miatt
            }
        }
        console.log("MIGRATE_USERS_DEBUG: Felhasználók migrálása befejeződött.");
    } catch (mainLoopError) {
        console.error(`MIGRATE_USERS_FATAL_ERROR: Súlyos hiba a felhasználók fő migrálási ciklusában:`, mainLoopError.message);
        console.error("MIGRATE_USERS_FATAL_ERROR: Stack trace (main loop):", mainLoopError.stack);
        throw mainLoopError; // Fontos: dobja tovább a hibát
    }
}

// Futtassuk a migrációt és zárjuk le a Knex kapcsolatot
migrateUsers()
    .then(() => {
        console.log("MIGRATE_USERS_SUCCESS: migrateUsers.js sikeresen befejeződött.");
    })
    .catch((error) => {
        console.error("MIGRATE_USERS_FATAL_ERROR: migrateUsers.js futása hibával végződött, leállás:", error.message);
        console.error("MIGRATE_USERS_FATAL_ERROR: Stack trace (fatal):", error.stack);
    })
    .finally(() => {
        if (knex) { // Csak akkor próbáljuk meg lezárni, ha létrejött
            knex.destroy();
            console.log("MIGRATE_USERS_DEBUG: Knex kapcsolat lezárva.");
        }
        process.exit(0); // MINDIG 0-val lépünk ki, hogy a && operátor továbbengedje a server.js-re
                        // Ez a hibakereséshez ideális, mert így látjuk, ha a server.js elindul.
    });