// routes/schedule.js - MÓDOSÍTOTT VERZIÓ
const express = require('express');
const router = express.Router();
const { knex } = require('../db');
const jwt = require('jsonwebtoken');

// --- Middleware-ek (ugyanazok mint a timeEntries.js-ben) ---

/**
 * Hitelesítő middleware: ellenőrzi a JWT tokent a kérés fejlécében.
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Nincs hitelesítve.' });
    }

    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Kérjük, környezeti változóból olvassa be!
    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            console.error('JWT ellenőrzési hiba:', err.message);
            return res.status(403).json({ message: 'Érvénytelen vagy lejárt token. Kérjük, jelentkezzen be újra.' });
        }
        req.user = user;
        next();
    });
};

/**
 * Jogosultság ellenőrző middleware: ellenőrzi, hogy a felhasználó rendelkezik-e a szükséges szerepkörrel.
 * @param {Array<string>} roles - Az engedélyezett szerepkörök listája (pl. ['admin', 'user']).
 */
const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Nincs hitelesítve.' });
        }
        
        let hasPermission = false;
        if (req.user.isAdmin && roles.includes('admin')) {
            hasPermission = true;
        } else if (!req.user.isAdmin && roles.includes('user')) {
            hasPermission = true;
        } else if (req.user.isAdmin && roles.includes('user') && roles.length === 1) { // Az admin is hozzáférhet user végponthoz, ha csak user szerepkör van megadva
            hasPermission = true;
        }

        if (hasPermission) {
            next();
        } else {
            return res.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
        }
    };
};

// --- Segédfunkciók az adatbázis táblák ellenőrzésére/létrehozására ---

/**
 * Ellenőrzi és szükség esetén létrehozza a `schedule_period` táblát,
 * valamint inicializálja egy alapértelmezett rekorddal, ha még üres.
 * Ideális esetben ezt adatbázis migrációval kellene kezelni,
 * de gyors prototípushoz vagy fejlesztéshez hasznos.
 */
async function ensureSchedulePeriodTable() {
    try {
        const tableExists = await knex.schema.hasTable('schedule_period');
        
        if (!tableExists) {
            console.log('Backend: schedule_period tábla nem létezik, létrehozás...');
            await knex.schema.createTable('schedule_period', (table) => {
                table.increments('id').primary();
                table.date('start_date').notNullable();
                table.date('end_date').notNullable();
                table.timestamp('updated_at').defaultTo(knex.fn.now());
                table.timestamp('created_at').defaultTo(knex.fn.now()); // Hozzáadva a consistency miatt
            });
            console.log('Backend: schedule_period tábla sikeresen létrehozva.');
            
            // Alapértelmezett rekord beszúrása, ha nincs
            const existingPeriod = await knex('schedule_period').first();
            if (!existingPeriod) {
                // Példa kezdő és befejező dátumok (éles környezetben dinamikusan állítandó be)
                const today = new Date();
                const defaultStartDate = new Date(today);
                const defaultEndDate = new Date(today);
                defaultEndDate.setDate(today.getDate() + 6); // Egy hét múlva

                await knex('schedule_period').insert({
                    start_date: defaultStartDate.toISOString().split('T')[0],
                    end_date: defaultEndDate.toISOString().split('T')[0],
                    updated_at: knex.fn.now(),
                    created_at: knex.fn.now()
                });
                console.log('Backend: Alapértelmezett beosztási időszak rekord létrehozva.');
            }
        }
        return true;
    } catch (error) {
        console.error('Backend: Hiba a schedule_period tábla ellenőrzésekor/létrehozásakor:', error);
        throw error;
    }
}

/**
 * Ellenőrzi és szükség esetén létrehozza a `schedule_notes` táblát,
 * valamint inicializálja egy alapértelmezett üres rekorddal, ha még üres.
 */
async function ensureScheduleNotesTable() {
    try {
        const tableExists = await knex.schema.hasTable('schedule_notes');
        
        if (!tableExists) {
            console.log('Backend: schedule_notes tábla nem létezik, létrehozás...');
            await knex.schema.createTable('schedule_notes', (table) => {
                table.increments('id').primary();
                table.text('content');
                table.timestamp('created_at').defaultTo(knex.fn.now());
                table.timestamp('updated_at').defaultTo(knex.fn.now());
            });
            console.log('Backend: schedule_notes tábla sikeresen létrehozva.');
            
            // Alapértelmezett üres rekord beszúrása
            await knex('schedule_notes').insert({
                content: '',
                created_at: knex.fn.now(),
                updated_at: knex.fn.now()
            });
            console.log('Backend: Alapértelmezett megjegyzés rekord létrehozva.');
        }
        return true;
    } catch (error) {
        console.error('Backend: Hiba a schedule_notes tábla ellenőrzésekor/létrehozásakor:', error);
        throw error;
    }
}

// --- API Végpontok a Beosztási Időszakhoz (`schedule_period`) ---

/**
 * GET /api/schedule/period
 * Aktuális beosztási időszak lekérdezése.
 * Látható minden felhasználó számára (admin és user).
 */
router.get('/period', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/schedule/period): Kérés érkezett.');
    try {
        await ensureSchedulePeriodTable(); // Biztosítjuk a tábla létezését
        const period = await knex('schedule_period').first();
        if (!period) {
            return res.status(404).json({ message: 'Nincs beállított beosztási időszak.' });
        }
        res.json(period);
    } catch (error) {
        console.error('Backend (GET /api/schedule/period): Hiba a beosztási időszak lekérdezésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a beosztási időszak lekérdezésekor.', error: error.message });
    }
});

/**
 * PUT /api/schedule/period
 * Beosztási időszak frissítése.
 * Csak admin jogosultsággal.
 */
router.put('/period', authenticateToken, authorize(['admin']), async (req, res) => {
    console.log('Backend (PUT /api/schedule/period): Kérés érkezett.');
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
        return res.status(400).json({ message: 'Hiányzó kötelező mezők: start_date, end_date.' });
    }

    if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ message: 'A befejezési dátum nem lehet korábbi a kezdési dátumnál.' });
    }

    try {
        // Feltételezzük, hogy csak egy rekord van a schedule_period táblában, az ID-je 1.
        // Ha nem, akkor keressük meg az elsőt, vagy használjunk más egyedi azonosítót.
        const [updatedPeriod] = await knex('schedule_period')
            .where({ id: 1 }) 
            .update({
                start_date,
                end_date,
                updated_at: knex.fn.now()
            })
            .returning('*');

        if (!updatedPeriod) {
            // Ha mégsem létezne az első rekord (pl. hibás adatbázis állapot), akkor létrehozzuk.
            const [newPeriod] = await knex('schedule_period').insert({
                start_date,
                end_date,
                created_at: knex.fn.now(),
                updated_at: knex.fn.now()
            }).returning('*');
            return res.json({ message: 'Beosztási időszak sikeresen beállítva!', period: newPeriod });
        }

        res.json({ message: 'Beosztási időszak sikeresen frissítve!', period: updatedPeriod });
    } catch (error) {
        console.error('Backend (PUT /api/schedule/period): Hiba a beosztási időszak frissítésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a beosztási időszak frissítésekor.', error: error.message });
    }
});

// --- API Végpontok a Heti Beosztásokhoz (`weekly_schedules`) ---

/**
 * GET /api/schedule/weekly
 * Heti beosztások lekérdezése.
 * A dátum szűrés már nem történik itt, a weekly_schedules tábla már nem tartalmaz start_date/end_date oszlopokat.
 * A frontend felelőssége a megfelelő időszak megjelenítése a /period végpontról lekérdezett dátumok alapján.
 */
router.get('/weekly', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/schedule/weekly): Kérés érkezett.');
    const { employee_name } = req.query; // Már csak employee_name alapján lehet szűrni

    try {
        let query = knex('weekly_schedules')
            .select('*')
            .orderBy('employee_name', 'asc'); // Rendezés employee_name alapján

        if (employee_name) {
            query = query.where('employee_name', 'ilike', `%${employee_name}%`);
        }

        const weeklySchedules = await query;
        res.json(weeklySchedules);
    } catch (error) {
        console.error('Backend (GET /api/schedule/weekly): Hiba a heti beosztások lekérdezésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a heti beosztások lekérdezésekor.', error: error.message });
    }
});

/**
 * POST /api/schedule/weekly
 * Új heti beosztás létrehozása.
 * Csak admin jogosultsággal.
 * A dátumokat már nem kell megadni, azok a schedule_period táblából jönnek.
 */
router.post('/weekly', authenticateToken, authorize(['admin']), async (req, res) => {
    console.log('Backend (POST /api/schedule/weekly): Kérés érkezett.');
    const { 
        employee_name, 
        monday_shift, 
        tuesday_shift, 
        wednesday_shift, 
        thursday_shift, 
        friday_shift, 
        saturday_shift, 
        sunday_shift 
    } = req.body;

    if (!employee_name) {
        return res.status(400).json({ 
            message: 'Hiányzó kötelező mező: employee_name.' 
        });
    }

    try {
        const insertData = {
            employee_name,
            monday_shift: monday_shift || null,
            tuesday_shift: tuesday_shift || null,
            wednesday_shift: wednesday_shift || null,
            thursday_shift: thursday_shift || null,
            friday_shift: friday_shift || null,
            saturday_shift: saturday_shift || null,
            sunday_shift: sunday_shift || null,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
        };

        const [newEntry] = await knex('weekly_schedules').insert(insertData).returning('*');
        res.status(201).json({ message: 'Heti beosztás sikeresen rögzítve!', weeklySchedule: newEntry });
    } catch (error) {
        console.error('Backend (POST /api/schedule/weekly): Hiba a heti beosztás létrehozásakor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a heti beosztás rögzítésekor.', error: error.message });
    }
});

/**
 * PUT /api/schedule/weekly/:id
 * Heti beosztás módosítása.
 * Csak admin jogosultsággal.
 * A dátumokat már nem lehet ezen a végponton módosítani.
 */
router.put('/weekly/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    console.log('Backend (PUT /api/schedule/weekly/:id): Kérés érkezett.');
    const { id } = req.params;
    const { 
        employee_name, 
        monday_shift, 
        tuesday_shift, 
        wednesday_shift, 
        thursday_shift, 
        friday_shift, 
        saturday_shift, 
        sunday_shift 
    } = req.body;

    try {
        const existingEntry = await knex('weekly_schedules').where({ id }).first();
        if (!existingEntry) {
            return res.status(404).json({ message: 'Heti beosztás nem található.' });
        }

        const updateData = { updated_at: knex.fn.now() };

        // Csak az engedélyezett mezők frissítése
        if (employee_name !== undefined) updateData.employee_name = employee_name;
        if (monday_shift !== undefined) updateData.monday_shift = monday_shift;
        if (tuesday_shift !== undefined) updateData.tuesday_shift = tuesday_shift;
        if (wednesday_shift !== undefined) updateData.wednesday_shift = wednesday_shift;
        if (thursday_shift !== undefined) updateData.thursday_shift = thursday_shift;
        if (friday_shift !== undefined) updateData.friday_shift = friday_shift;
        if (saturday_shift !== undefined) updateData.saturday_shift = saturday_shift;
        if (sunday_shift !== undefined) updateData.sunday_shift = sunday_shift;

        const [updatedEntry] = await knex('weekly_schedules')
            .where({ id })
            .update(updateData)
            .returning('*');

        res.json({ message: 'Heti beosztás sikeresen módosítva!', weeklySchedule: updatedEntry });
    } catch (error) {
        console.error('Backend (PUT /api/schedule/weekly/:id): Hiba a heti beosztás módosításakor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a heti beosztás módosításakor.', error: error.message });
    }
});

/**
 * DELETE /api/schedule/weekly/:id
 * Heti beosztás törlése.
 * Csak admin jogosultsággal.
 */
router.delete('/weekly/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    console.log('Backend (DELETE /api/schedule/weekly/:id): Kérés érkezett.');
    const { id } = req.params;

    try {
        const existingEntry = await knex('weekly_schedules').where({ id }).first();
        if (!existingEntry) {
            return res.status(404).json({ message: 'Heti beosztás nem található.' });
        }

        const deletedCount = await knex('weekly_schedules').where({ id }).del();

        if (deletedCount === 0) {
            return res.status(404).json({ message: 'Heti beosztás nem található (törlés után).' });
        }

        res.json({ message: 'Heti beosztás sikeresen törölve!' });
    } catch (error) {
        console.error('Backend (DELETE /api/schedule/weekly/:id): Hiba a heti beosztás törlésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a heti beosztás törlésekor.', error: error.message });
    }
});

// --- API Végpontok a Megjegyzésekhez (`schedule_notes`) ---

/**
 * GET /api/schedule/notes
 * Megjegyzések lekérdezése.
 * Látható minden felhasználó számára (admin és user).
 */
router.get('/notes', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/schedule/notes): Kérés érkezett.');
    try {
        await ensureScheduleNotesTable();
        
        const notes = await knex('schedule_notes')
            .select('*')
            .orderBy('updated_at', 'desc')
            .first();

        console.log('Backend (GET /api/schedule/notes): Megjegyzések lekérdezve:', notes);
        // Ha nincs még rekord, üres contenttel tér vissza
        res.json(notes || { content: '', updated_at: null });
    } catch (error) {
        console.error('Backend (GET /api/schedule/notes): Hiba a megjegyzések lekérdezésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a megjegyzések lekérdezésekor.', error: error.message });
    }
});

/**
 * PUT /api/schedule/notes
 * Megjegyzések frissítése.
 * Csak admin jogosultsággal.
 */
router.put('/notes', authenticateToken, authorize(['admin']), async (req, res) => {
    console.log('Backend (PUT /api/schedule/notes): Kérés érkezett.');
    const { content } = req.body;

    if (content === undefined || content === null) {
        return res.status(400).json({ message: 'Hiányzó content mező.' });
    }

    try {
        const existingNotes = await knex('schedule_notes')
            .select('*')
            .orderBy('updated_at', 'desc')
            .first();

        let updatedNotes;
        
        if (existingNotes) {
            await knex('schedule_notes')
                .where({ id: existingNotes.id })
                .update({
                    content: content,
                    updated_at: knex.fn.now()
                });
            
            updatedNotes = await knex('schedule_notes')
                .where({ id: existingNotes.id })
                .first();
            
        } else {
            // Ha még nincs rekord, hozzuk létre
            const insertResult = await knex('schedule_notes')
                .insert({
                    content: content,
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now()
                })
                .returning('*');
            
            updatedNotes = insertResult[0];
        }
        
        res.json({ message: 'Megjegyzések sikeresen frissítve!', notes: updatedNotes });
        
    } catch (error) {
        console.error('Backend (PUT /api/schedule/notes): HIBA:', error);
        res.status(500).json({ message: 'Szerverhiba történt a megjegyzések frissítésekor.', error: error.message });
    }
});

module.exports = router;