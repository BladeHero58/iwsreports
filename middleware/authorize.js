// middleware/authorize.js

const authorize = (roles) => {
    return (req, res, next) => {
        // Ellenőrizzük, hogy a req.user objektum létezik-e (az authenticateToken middleware-től)
        if (!req.user) {
            return res.status(401).json({ message: 'Nincs hitelesítve. Kérjük, jelentkezzen be.' });
        }

        // Admin szerep ellenőrzése
        if (roles.includes('admin') && req.user.isAdmin) {
            return next(); // Admin felhasználó hozzáfér
        }

        // Normál felhasználó szerep ellenőrzése
        if (roles.includes('user')) {
            // Ha a route egy adott felhasználó ID-jére vonatkozik (pl. /api/time-entries/:userId)
            // és a bejelentkezett felhasználó ID-je megegyezik a kérésben szereplő ID-vel,
            // akkor engedélyezzük.
            if (req.params.userId && parseInt(req.params.userId) === req.user.id) {
                return next();
            }
            // Ha a route nem specifikus felhasználóra vonatkozik (pl. /api/time-entries GET),
            // és a felhasználó normál felhasználó, akkor engedélyezzük.
            if (!req.params.userId && !req.user.isAdmin) {
                return next();
            }
        }

        // Ha egyik feltétel sem teljesül, nincs jogosultság
        return res.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
    };
};

module.exports = authorize;