const fs = require('fs');
const bcrypt = require('bcryptjs');
const pool = require('./db'); // PostgreSQL kapcsolat

// A users.json fájl betöltése
const users = JSON.parse(fs.readFileSync('./users.json', 'utf-8'));

async function migrateUsers() {
    for (const user of users) {
        const isAdmin = user.role === 'admin' || user.isAdmin === true;
        const hashedPassword = await bcrypt.hash(user.password, 10);

        // Módosítás itt: ON CONFLICT (username) DO NOTHING;
        // Mivel a hibaüzenet a "users_username_unique" constraintre utal,
        // valószínűleg a username-re van beállítva az egyedi kényszer, nem az id-re.
        const query = `
            INSERT INTO users (id, username, password, is_admin)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (username) DO NOTHING;`; // <- ITT VAN A VÁLTOZÁS!

        const values = [user.id, user.username, hashedPassword, isAdmin];

        try {
            await pool.query(query, values);
            console.log(`Felhasználó ${user.username} sikeresen migrálva vagy már létezett.`);
        } catch (err) {
            console.error(`Hiba a ${user.username} migrálásakor: `, err);
        }
    }
}

migrateUsers();