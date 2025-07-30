// migrateUsers.js
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Ide be kell töltened a Knex konfigurációt és inicializálnod a Knex-et
const environment = process.env.NODE_ENV || 'development';
const knexConfig = require('./knexfile.js')[environment]; // Feltételezi, hogy a knexfile.js a gyökérkönyvtárban van
const knex = require('knex')(knexConfig); // Knex inicializálása

// A users.json fájl betöltése
const users = JSON.parse(fs.readFileSync('./users.json', 'utf-8'));

async function migrateUsers() {
    console.log("Felhasználók migrálása elindult!"); // Hozzáadva egy log, hogy lásd, hol tart
    try {
        for (const user of users) {
            const isAdmin = user.role === 'admin' || user.isAdmin === true;
            const hashedPassword = await bcrypt.hash(user.password, 10);

            // Knex query builder használata az INSERT-hez
            // Az ON CONFLICT rész a Knex 'insert' metódusához adva
            await knex('users').insert({
                id: user.id,
                username: user.username,
                password: hashedPassword,
                is_admin: isAdmin
            }).onConflict('username').ignore(); // <-- Itt van a Knex-es "ON CONFLICT DO NOTHING"

            console.log(`Felhasználó ${user.username} sikeresen migrálva vagy már létezett.`);
        }
        console.log("Felhasználók migrálása befejeződött."); // Log a befejezéshez
    } catch (err) {
        console.error(`Hiba a felhasználók migrálásakor: `, err);
        throw err; // Fontos: dobja tovább a hibát, hogy a process.exit(1) megtörténjen, ha hiba van
    }
}

// Futtassuk a migrációt és zárjuk le a Knex kapcsolatot, ha ez az utolsó fájl, ami adatbázis hozzáférést igényel.
// Mivel a migrate.js futtatja ezt is, és az már kezelte a knex.destroy()-t, itt nem kell.
// DE a server.js-nek KELL kezelnie a knex kapcsolatot.
migrateUsers()
    .then(() => {
        // Fontos: Itt ne zárd le a knex kapcsolatot, ha a server.js is használja,
        // és futni fog a migrateProjects.js is utána.
        // A Knex kapcsolatot a fő alkalmazásnak kell fenntartania.
        console.log("migrateUsers.js sikeresen befejeződött.");
    })
    .catch((error) => {
        console.error("migrateUsers.js futása hibával végződött:", error);
        process.exit(1); // Kilépés hibakóddal, ha hiba történt
    });