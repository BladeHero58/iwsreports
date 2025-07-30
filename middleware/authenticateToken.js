// middleware/authenticateToken.js
const jwt = require('jsonwebtoken'); // Feltételezve, hogy JWT-t használsz az autentikációhoz
const { knex } = require('../db'); // Knex importálása a db.js-ből (útvonal ellenőrzése!)

const authenticateToken = async (req, res, next) => {
    // Ellenőrizzük, hogy van-e Authorization fejléc
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Token kinyerése a "Bearer TOKEN" formátumból

    if (token == null) {
        return res.status(401).json({ message: 'Nincs hozzáférési token. Kérjük, jelentkezzen be.' });
    }

    // Token ellenőrzése
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, user) => {
        if (err) {
            // Token érvénytelen vagy lejárt
            return res.status(403).json({ message: 'Érvénytelen vagy lejárt token. Kérjük, jelentkezzen be újra.' });
        }

        // Ha a token érvényes, lekérjük a felhasználót az adatbázisból,
        // hogy megbizonyosodjunk a létezéséről és lekérjük az isAdmin státuszát.
        try {
            // Feltételezve, hogy a JWT payload tartalmazza a felhasználó 'username'-jét vagy 'id'-jét
            // Ha a token csak az ID-t tartalmazza: const dbUser = await knex('users').where({ id: user.id }).first();
            // Ha a token a username-et tartalmazza:
            const dbUser = await knex('users').where({ username: user.username }).first();

            if (!dbUser) {
                return res.status(403).json({ message: 'A tokenben szereplő felhasználó nem található az adatbázisban.' });
            }

            // Hozzáadjuk a felhasználói adatokat a kérés objektumhoz
            req.user = {
                id: dbUser.id,
                username: dbUser.username,
                isAdmin: dbUser.is_admin // Feltételezve, hogy van egy 'is_admin' oszlop a 'users' táblában
            };
            next(); // Folytatjuk a következő middleware-rel vagy útvonallal

        } catch (error) {
            console.error('Hiba a felhasználó adatbázisból történő lekérdezésekor a hitelesítés során:', error);
            res.status(500).json({ message: 'Szerverhiba történt a hitelesítés során.' });
        }
    });
};

module.exports = authenticateToken;
