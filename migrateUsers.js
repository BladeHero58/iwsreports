const fs = require('fs');
const bcrypt = require('bcryptjs');
const pool = require('./db'); // PostgreSQL kapcsolat

// A users.json fájl betöltése
const users = JSON.parse(fs.readFileSync('./users.json', 'utf-8'));

async function migrateUsers() {
  for (const user of users) {
    const isAdmin = user.role === 'admin' || user.isAdmin === true;
    const hashedPassword = await bcrypt.hash(user.password, 10);

    const query = `
      INSERT INTO users (id, username, password, is_admin)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING;`;

    const values = [user.id, user.username, hashedPassword, isAdmin];

    try {
      await pool.query(query, values);
      console.log(`Felhasználó ${user.username} sikeresen migrálva.`);
    } catch (err) {
      console.error(`Hiba a ${user.username} migrálásakor: `, err);
    }
  }
}

migrateUsers();
