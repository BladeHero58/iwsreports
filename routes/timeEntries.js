// routes/timeEntries.js
const express = require('express');
const router = express.Router();
const { knex } = require('../db'); // Knex importálása a db.js-ből (útvonal ellenőrzése!)
const jwt = require('jsonwebtoken'); // <-- EZT ADD HOZZÁ
// A PDF generálóhoz szükséges könyvtár importálása
const path = require('path'); // <--- EZ HIÁNYZOTT
const PdfPrinter = require('pdfmake'); // <--- VALÓSZÍNŰLEG EZ IS HIÁNYZOTT
const fs = require('fs');

// --- Middleware-ek ---
const authenticateToken = (req, res, next) => {
    console.log('Backend (authenticateToken): Hívás érkezett.');
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) {
        console.log('Backend (authenticateToken): Nincs token a fejlécben, 401 Unauthorized.');
        return res.status(401).json({ message: 'Nincs hitelesítve.' });
    }

    console.log('Backend (authenticateToken): Token a fejlécben (első 10 karakter):', token.substring(0, 10) + '...');

    const jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret_key'; // A secret kulcs
    console.log('Backend (authenticateToken): JWT Secret used for verifying (first 10 chars):', jwtSecret.substring(0, 10) + '...'); // DEBUG LOG

    jwt.verify(token, jwtSecret, (err, user) => { // Használjuk a változót
        if (err) {
            console.error('Backend (authenticateToken): JWT ellenőrzési hiba:', err.message);
            // Ha a token lejárt, vagy érvénytelen, 403 Forbidden
            return res.status(403).json({ message: 'Érvénytelen vagy lejárt token. Kérjük, jelentkezzen be újra.' });
        }
        req.user = user; // A dekódolt felhasználói adatokat hozzáadjuk a kéréshez
        console.log('Backend (authenticateToken): JWT sikeresen dekódolva, req.user:', req.user);
        next();
    });
};

const authorize = (roles) => {
    return (req, res, next) => {
        console.log('Backend (authorize): Hívás érkezett.');
        console.log('Backend (authorize): Received roles array:', roles);
        
        // Alapvető ellenőrzés a req.user objektumra
        if (!req.user || !req.user.id) {
            console.log('Backend (authorize): Nincs req.user (authenticateToken hiba?), 401 Unauthorized.');
            return res.status(401).json({ message: 'Nincs hitelesítve.' });
        }

        console.log(`Backend (authorize): User ID: ${req.user.id}, IsAdmin: ${req.user.isAdmin}, Required roles: ${roles.join(', ')}`);

        let hasPermission = false;
        
        // Ellenőrizzük, hogy a tokenben lévő 'isAdmin' értéke egyértelműen true vagy false
        const userIsAdmin = req.user.isAdmin === true;
        const userIsUser = req.user.isAdmin === false;

        // A logikát robusztusabbá tesszük, hogy kezelje az összes lehetséges esetet
        // Ha a felhasználó admin, hozzáfér minden admin és user végponthoz
        if (userIsAdmin && (roles.includes('admin') || roles.includes('user'))) {
            hasPermission = true;
            console.log('Backend (authorize): Admin jogosultság rendben.');
        }
        // Ha a felhasználó user, hozzáfér a user végpontokhoz
        else if (userIsUser && roles.includes('user')) {
            hasPermission = true;
            console.log('Backend (authorize): Felhasználói jogosultság rendben.');
        }

        if (hasPermission) {
            next();
        } else {
            console.log('Backend (authorize): Nincs jogosultság, 403 Forbidden. Felhasználó adatai:', req.user);
            return res.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
        }
    };
};

// --- API végpontok az időbejegyzésekhez ---

// POST /api/time-entries - Új időbejegyzés létrehozása
router.post('/', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (POST /api/time-entries): Kérés érkezett.');
    
    // A user_id-t mindig a hitelesített tokenből vesszük, nem a req.body-ból
    const userId = req.user.id;
    let { entry_date, project_id, start_time, end_time, entry_type, notes, hours_worked } = req.body; 
    console.log('Backend (POST /api/time-entries): req.body:', req.body);
    console.log(`Backend (POST /api/time-entries): Bejegyzés rögzítése a felhasználónak: ${userId}`);

    // Validáció
    if (!userId || !entry_date || !entry_type) {
        console.log('Backend (POST /api/time-entries): Hiányzó kötelező mezők.');
        return res.status(400).json({ message: 'Hiányzó kötelező mezők: user_id, entry_date, entry_type.' });
    }
    if (!['work', 'leave', 'sick_leave', 'custom'].includes(entry_type)) {
        console.log('Backend (POST /api/time-entries): Érvénytelen bejegyzés típus.');
        return res.status(400).json({ message: 'Érvénytelen bejegyzés típus.' });
    }
    if (isNaN(new Date(entry_date).getTime())) {
        console.log('Backend (POST /api/time-entries): Érvénytelen dátum formátum.');
        return res.status(400).json({ message: 'Érvénytelen dátum formátum az entry_date mezőben.' });
    }

    let calculated_hours_worked; // Ezt használjuk a belső számításra/beállításra

    // Óraszám, start_time és end_time kezelése a típus alapján
    if (['leave', 'sick_leave', 'custom'].includes(entry_type)) {
        calculated_hours_worked = 8; // Automatikusan 8 óra szabadságra/táppénzre/egyedi bejegyzésre
        // Ezeknél a típusoknál nincs értelme konkrét érkezési/távozási időnek, így nullára állítjuk.
        start_time = null;
        end_time = null;
        console.log(`Backend (POST /api/time-entries): Típus ${entry_type}, óraszám beállítva 8-ra, start_time/end_time null.`);
    } else { // 'work' típus
        if (!start_time || !end_time) {
            console.log('Backend (POST /api/time-entries): Munka típushoz érkezési és távozási időpont szükséges.');
            return res.status(400).json({ message: 'Munka típusú bejegyzéshez érkezési és távozási időpont szükséges.' });
        }

        const arrival = new Date(start_time);
        const departure = new Date(end_time);

        if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
            console.log('Backend (POST /api/time-entries): Érvénytelen időpont formátum (start_time vagy end_time).');
            return res.status(400).json({ message: 'Érvénytelen időpont formátum az érkezési vagy távozási idő mezőben.' });
        }

        // Ellenőrizzük, hogy az érkezés és távozás ugyanarra a napra esik-e, és az érkezés megelőzi a távozást
        const entryDateObj = new Date(entry_date);
        if (arrival.toISOString().split('T')[0] !== entryDateObj.toISOString().split('T')[0] ||
            departure.toISOString().split('T')[0] !== entryDateObj.toISOString().split('T')[0]) {
            console.log('Backend (POST /api/time-entries): Az érkezési és távozási időpontnak az entry_date napjára kell esnie.');
            return res.status(400).json({ message: 'Az érkezési és távozási időpontnak az bejegyzés dátumára kell esnie.' });
        }

        if (departure <= arrival) {
            console.log('Backend (POST /api/time-entries): A távozási időpontnak későbbre kell esnie, mint az érkezési időpont.');
            return res.status(400).json({ message: 'A távozási időpontnak későbbre kell esnie, mint az érkezési időpont.' });
        }

        const diffMs = departure.getTime() - arrival.getTime();
        let totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2)); // Milliszekundumból órába, két tizedesjegyre
        
        // *** ÚJ: Automatikus ebédszünet levonása munkaidőből ***
        const lunchBreakMinutes = 30; // 30 perc ebédszünet
        const lunchBreakHours = lunchBreakMinutes / 60; // 0.5 óra
        
        calculated_hours_worked = Math.max(0, parseFloat((totalHours - lunchBreakHours).toFixed(2))); // Levonás és minimum 0 óra
        
        console.log(`Backend (POST /api/time-entries): Típus munka, érkezés: ${start_time}, távozás: ${end_time}`);
        console.log(`Backend (POST /api/time-entries): Nyers munkaidő: ${totalHours} óra, ebédszünet levonás: ${lunchBreakHours} óra`);
        console.log(`Backend (POST /api/time-entries): VÉGSŐ számított óraszám (ebédszünettel): ${calculated_hours_worked} óra`);
    }

    // Projekt ID kezelése a bejegyzés típusa alapján
    if (['leave', 'sick_leave', 'custom'].includes(entry_type)) {
        project_id = null;
        console.log('Backend (POST /api/time-entries): Típus nem munka, project_id null.');
    } else if (entry_type === 'work' && !project_id) {
        console.log('Backend (POST /api/time-entries): Munka típushoz projekt ID szükséges.');
        return res.status(400).json({ message: 'Munka típusú bejegyzéshez projekt ID szükséges.' });
    }

    const insertData = {
        user_id: userId, // <-- ITT HASZNÁLJUK A BIZTONSÁGOS ID-T
        entry_date: entry_date,
        project_id: project_id,
        hours_worked: calculated_hours_worked,
        entry_type: entry_type,
        notes: notes,
        start_time: start_time ? new Date(start_time).toISOString() : null,
        end_time: end_time ? new Date(end_time).toISOString() : null,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
    };

    console.log('Backend (POST /api/time-entries): Adatok Knex-nek küldve:', insertData);

    try {
        const [newTimeEntry] = await knex('time_entries').insert(insertData).returning('*');

        console.log('Backend (POST /api/time-entries): Időbejegyzés sikeresen rögzítve:', newTimeEntry);
        res.status(201).json({ message: 'Időbejegyzés sikeresen rögzítve!', timeEntry: newTimeEntry });

    } catch (error) {
        console.error('Backend (POST /api/time-entries): Hiba az időbejegyzés létrehozásakor:', error);
        res.status(500).json({ message: 'Szerverhiba történt az időbejegyzés rögzítésekor.', error: error.message });
    }
});

// GET /api/time-entries - Időbejegyzések lekérdezése (MINDIG CSAK A SAJÁTJA)
router.get('/', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/time-entries): Kérés érkezett.');
    try {
        let query = knex('time_entries')
            .leftJoin('projects', 'time_entries.project_id', 'projects.id')
            .select(
                'time_entries.id',
                'time_entries.user_id',
                'time_entries.entry_date',
                'time_entries.project_id',
                'time_entries.hours_worked',
                'time_entries.entry_type',
                'time_entries.notes',
                'time_entries.start_time',
                'time_entries.end_time',
                'time_entries.created_at',
                'time_entries.updated_at',
                'projects.name as project_name'
            )
            .where('time_entries.user_id', req.user.id) // <-- MINDEN ESETBEN A SAJÁT ID-t SZŰRJÜK
            .orderBy('time_entries.entry_date', 'desc')
            .orderBy('time_entries.created_at', 'desc');

        console.log(`Backend (GET /api/time-entries): Szűrés user_id: ${req.user.id} alapján.`);

        const timeEntries = await query;

        // Fordítás és formázás a frontend számára
        const formattedTimeEntries = timeEntries.map(entry => {
            let formattedEntry = { ...entry };
            if (entry.entry_type === 'sick_leave') {
                formattedEntry.entry_type_display = 'Táppénz';
            } else if (entry.entry_type === 'leave') {
                formattedEntry.entry_type_display = 'Szabadság';
            } else if (entry.entry_type === 'work') {
                // Csak akkor formázzuk, ha van start és end time
                if (entry.start_time && entry.end_time) {
                    const startDate = new Date(entry.start_time);
                    const endDate = new Date(entry.end_time);
                    // Az óraszám már tartalmazza az ebédszünet levonását az adatbázisban
                    formattedEntry.start_time_display = startDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                    formattedEntry.end_time_display = endDate.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                    formattedEntry.entry_type_display = 'Munkaóra'; // Vagy tetszőlegesen "Munka"
                } else {
                    formattedEntry.entry_type_display = 'Munkaóra';
                }
            } else {
                formattedEntry.entry_type_display = entry.entry_type; // Egyéb típusok maradhatnak
            }
            return formattedEntry;
        });

        console.log('Backend (GET /api/time-entries): Sikeresen lekérdezett időbejegyzések száma:', formattedTimeEntries.length);
        res.json(formattedTimeEntries);

    } catch (error) {
        console.error('Backend (GET /api/time-entries): Hiba az időbejegyzések lekérdezésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt az időbejegyzések lekérdezésekor.', error: error.message });
    }
});

// >>>>>>>>>>>>> ÚJ VÉGPONT A PROJEKTEK LEKÉRÉSÉHEZ (BENNE A timeEntries.js-ben) <<<<<<<<<<<<<<<
// GET /api/time-entries/projects - A bejelentkezett felhasználóhoz rendelt projektek lekérdezése
router.get('/projects', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/time-entries/projects): Kérés érkezett a projektek lekérésére.');
    try {
        const userId = req.user.id;
        console.log(`Backend (GET /api/time-entries/projects): Lekérdezés user ID: ${userId}.`);

        // Mindig a bejelentkezett felhasználóhoz rendelt projekteket kérjük le
        let projectsQuery = knex('projects')
            .select('projects.id', 'projects.name')
            .join('user_projects', 'projects.id', 'user_projects.project_id')
            .where('user_projects.user_id', userId)
            .orderBy('projects.name', 'asc');

        const projects = await projectsQuery;
        console.log('Backend (GET /api/time-entries/projects): Sikeresen lekérdezett projektek:', projects);
        res.json(projects);
    } catch (error) {
        console.error('Backend (GET /api/time-entries/projects): Hiba a projektek lekérésekor:', error);
        res.status(500).json({ message: 'Szerverhiba történt a projektek lekérésekor.' });
    }
});

// GET /api/time-entries/:userId - Ez a végpont el lett távolítva a kérésnek megfelelően.
// Az adminok sem tudnak más felhasználók bejegyzéseit lekérdezni.

// PUT /api/time-entries/:id - Időbejegyzés módosítása
router.put('/:id', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    const { id } = req.params;
    console.log(`Backend (PUT /api/time-entries/${id}): Kérés érkezett.`);
    // Hozzáadjuk a start_time és end_time mezőket
    let { entry_date, project_id, start_time, end_time, entry_type, notes, hours_worked } = req.body; // <-- IDE ADD HOZZÁ: hours_worked
    console.log(`PUT /api/time-entries/${id}: req.body:`, req.body);

    const updateData = { updated_at: knex.fn.now() };

    // Először lekérdezzük az eredeti bejegyzést, mert szükségünk lehet az eredeti típusra
    const existingEntry = await knex('time_entries').where({ id }).first();
    if (!existingEntry) {
        console.log(`Backend (PUT /api/time-entries/${id}): Időbejegyzés nem található.`);
        return res.status(404).json({ message: 'Időbejegyzés nem található.' });
    }
    // Az adminok is csak a saját bejegyzéseiket módosíthatják
    if (existingEntry.user_id !== req.user.id) {
        console.log(`Backend (PUT /api/time-entries/${id}): Jogosultsági hiba: felhasználó más bejegyzését próbálja módosítani.`);
        return res.status(403).json({ message: 'Nincs jogosultságod más felhasználó időbejegyzését módosítani.' });
    }

    // Dátum validáció
    if (entry_date !== undefined) {
        if (isNaN(new Date(entry_date).getTime())) {
            console.log(`Backend (PUT /api/time-entries/${id}): Érvénytelen dátum formátum.`);
            return res.status(400).json({ message: 'Érvénytelen dátum formátum az entry_date mezőben.' });
        }
        updateData.entry_date = entry_date;
    }
    // Típus validáció
    if (entry_type !== undefined) {
        if (!['work', 'leave', 'sick_leave', 'custom'].includes(entry_type)) {
            console.log(`PUT /api/time-entries/${id}: Érvénytelen bejegyzés típus.`);
            return res.status(400).json({ message: 'Érvénytelen bejegyzés típus.' });
        }
        updateData.entry_type = entry_type;
    } else {
        // Ha a típus nem változik, használjuk az eredetit a logikához
        entry_type = existingEntry.entry_type;
        console.log(`Backend (PUT /api/time-entries/${id}): entry_type nem változott, eredeti típus: ${entry_type}`);
    }
    if (notes !== undefined) updateData.notes = notes;

    let calculated_hours_worked; // Változó a számított óraszám tárolására
    // Óraszám, Start_time és End_time kezelése a típus alapján
    if (['leave', 'sick_leave', 'custom'].includes(entry_type)) {
        calculated_hours_worked = 8; // Automatikusan 8 óra
        updateData.project_id = null; // Ezeknél a típusoknál nincs projekt
        updateData.start_time = null; // Töröljük a start_time-ot
        updateData.end_time = null; // Töröljük az end_time-ot
        console.log(`PUT /api/time-entries/${id}: Típus ${entry_type}, óraszám 8, project_id null, start_time/end_time null.`);
    } else { // 'work' típus
        // Ha valamelyik időpont hiányzik, hiba
        if (!start_time || !end_time) {
            console.log(`PUT /api/time-entries/${id}: Munka típushoz érkezési és távozási időpont szükséges.`);
            return res.status(400).json({ message: 'Munka típusú bejegyzéshez érkezési és távozási időpont szükséges.' });
        }

        const arrival = new Date(start_time);
        const departure = new Date(end_time);

        if (isNaN(arrival.getTime()) || isNaN(departure.getTime())) {
            console.log(`Backend (PUT /api/time-entries/${id}): Érvénytelen időpont formátum (start_time vagy end_time).`);
            return res.status(400).json({ message: 'Érvénytelen időpont formátum az érkezési vagy távozási idő mezőben.' });
        }

        // Ellenőrizzük, hogy az érkezés és távozás ugyanarra a napra esik-e, és az érkezés megelőzi a távozást
        const currentEntryDate = entry_date ? new Date(entry_date) : new Date(existingEntry.entry_date);
        if (arrival.toISOString().split('T')[0] !== currentEntryDate.toISOString().split('T')[0] ||
            departure.toISOString().split('T')[0] !== currentEntryDate.toISOString().split('T')[0]) {
            console.log('Backend (PUT /api/time-entries): Az érkezési és távozási időpontnak az entry_date napjára kell esnie.');
            return res.status(400).json({ message: 'Az érkezési és távozási időpontnak az bejegyzés dátumára kell esnie.' });
        }

        if (departure <= arrival) {
            console.log(`PUT /api/time-entries/${id}: A távozási időpontnak későbbre kell esnie, mint az érkezési időpont.`);
            return res.status(400).json({ message: 'A távozási időpontnak későbbre kell esnie, mint az érkezési időpont.' });
        }

        const diffMs = departure.getTime() - arrival.getTime();
        let totalHours = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2)); // Milliszekundumból órába

        // *** ÚJ: Automatikus ebédszünet levonása munkaidőből (módosításnál is) ***
        const lunchBreakMinutes = 30; // 30 perc ebédszünet
        const lunchBreakHours = lunchBreakMinutes / 60; // 0.5 óra
        
        calculated_hours_worked = Math.max(0, parseFloat((totalHours - lunchBreakHours).toFixed(2))); // Levonás és minimum 0 óra

        updateData.start_time = arrival.toISOString();
        updateData.end_time = departure.toISOString();

        if (project_id === undefined || project_id === null) {
            console.log(`PUT /api/time-entries/${id}: Munka típushoz projekt ID szükséges.`);
            return res.status(400).json({ message: 'Munka típusú bejegyzéshez projekt ID szükséges.' });
        }
        updateData.project_id = project_id;
        
        console.log(`PUT /api/time-entries/${id}: Típus munka, project_id: ${updateData.project_id}`);
        console.log(`PUT /api/time-entries/${id}: Nyers munkaidő: ${totalHours} óra, ebédszünet levonás: ${lunchBreakHours} óra`);
        console.log(`PUT /api/time-entries/${id}: VÉGSŐ számított óraszám (ebédszünettel): ${calculated_hours_worked} óra`);
    }
    
    // Frissítjük a hours_worked-öt, ha a payload tartalmazza, VAGY ha a logika alapján számoltuk.
    // Fontos: a frontend által küldött hours_worked-et felülírjuk, ha az nem munka típus, vagy ha munka típusnál időpontokból számolunk.
    updateData.hours_worked = calculated_hours_worked; // <-- ITT ÁLLÍTJUK BE MINDIG A SZÁMÍTOTT ÉRTÉKET

    console.log(`PUT /api/time-entries/${id}: Adatok Knex-nek küldve:`, updateData);

    try {
        const [updatedTimeEntry] = await knex('time_entries')
            .where({ id })
            .update(updateData)
            .returning('*');

        console.log(`Backend (PUT /api/time-entries/${id}): Időbejegyzés sikeresen módosítva:`, updatedTimeEntry);
        res.json({ message: 'Időbejegyzés sikeresen módosítva!', timeEntry: updatedTimeEntry });

    } catch (error) {
        console.error(`PUT /api/time-entries/${id}: Hiba az időbejegyzés módosításakor:`, error);
        res.status(500).json({ message: 'Szerverhiba történt az időbejegyzés módosításakor.', error: error.message });
    }
});


// DELETE /api/time-entries/:id - Időbejegyzés törlése
router.delete('/:id', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    const { id } = req.params;
    console.log(`Backend (DELETE /api/time-entries/${id}): Kérés érkezett.`);

    try {
        const existingEntry = await knex('time_entries').where({ id }).first();
        if (!existingEntry) {
            console.log(`Backend (DELETE /api/time-entries/${id}): Időbejegyzés nem található.`);
            return res.status(404).json({ message: 'Időbejegyzés nem található.' });
        }
        // Az adminok is csak a saját bejegyzéseiket törölhetik
        if (existingEntry.user_id !== req.user.id) {
            console.log(`Backend (DELETE /api/time-entries/${id}): Jogosultsági hiba: felhasználó más bejegyzését próbálja törölni.`);
            return res.status(403).json({ message: 'Nincs jogosultságod más felhasználó időbejegyzését törölni.' });
        }

        const deletedCount = await knex('time_entries').where({ id }).del();

        if (deletedCount === 0) {
            console.log(`Backend (DELETE /api/time-entries/${id}): Időbejegyzés nem található (törlés után).`);
            return res.status(404).json({ message: 'Időbejegyzés nem található.' });
        }

        console.log(`DELETE /api/time-entries/${id}: Időbejegyzés sikeresen törölve.`);
        res.json({ message: 'Időbejegyzés sikeresen törölve!' });

    } catch (error) {
        console.error(`DELETE /api/time-entries/${id}: Hiba az időbejegyzés törlésekor:`, error);
        res.status(500).json({ message: 'Szerverhiba történt az időbejegyzés törlésekor.', error: error.message });
    }
});


// --------------------------------------------------------------------------
 //  Új PDF generáló végpont
 // ---------------------------------------------------------------------------

// GET /api/time-entries/download-report?year=2025&month=7
router.get('/download-report', authenticateToken, authorize(['admin', 'user']), async (req, res) => {
    console.log('Backend (GET /api/time-entries/download-report): PDF letöltési kérés érkezett.');

    const { year, month } = req.query;
    const userId = req.user.id;
    const userName = req.user.username;

    if (!year || !month) {
        return res.status(400).json({ message: 'Hiányzó query paraméterek: year és month.' });
    }

    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const timeEntries = await knex('time_entries')
            .leftJoin('projects', 'time_entries.project_id', 'projects.id')
            .where('time_entries.user_id', userId)
            .whereBetween('entry_date', [
                knex.raw('?::date', [startDate.toISOString().split('T')[0]]),
                knex.raw('?::date', [endDate.toISOString().split('T')[0]])
            ])
            .select(
                'entry_date',
                'hours_worked',
                'entry_type',
                'notes',
                'start_time',
                'end_time',
                'projects.name as project_name'
            )
            .orderBy('entry_date', 'asc');

        console.log(`PDF generálás: Lekérdezett bejegyzések száma: ${timeEntries.length}`);

        // Időbejegyzések napok szerint csoportosítása és összesítők számítása
        const entriesByDay = {};
        let totalWorkHours = 0;
        let totalLeaveDays = 0;
        let totalSickLeaveDays = 0;

        timeEntries.forEach(entry => {
            const day = new Date(entry.entry_date).getDate();
            entriesByDay[day] = entry;

            // Összesítők számítása - az óraszám már tartalmazza az ebédszünet levonását
            if (entry.entry_type === 'work' || entry.entry_type === 'custom') {
                totalWorkHours += parseFloat(entry.hours_worked || 0);
            } else if (entry.entry_type === 'leave') {
                totalLeaveDays += 1;
            } else if (entry.entry_type === 'sick_leave') {
                totalSickLeaveDays += 1;
            }
        });

        // Hónap neve magyar nyelvű
        const monthNames = [
            'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
            'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December'
        ];
        const monthName = monthNames[month - 1];

        const tableBody = [];

        // Táblázat oszlopfejlécei
        tableBody.push([
            { text: 'Kelt', style: 'tableSubHeader' },
            { text: 'Érkezési/távozási\nidőpont', style: 'tableSubHeader' },
            { text: 'Munkaidő\nórában', style: 'tableSubHeader' },
            { text: 'Aláírás', style: 'tableSubHeader' },
            { text: 'Előjegyzések', colSpan: 2, style: 'tableSubHeader' },
            {}
        ]);

        const specialEntries = {
            17: { text: 'Munkaidő elszám.', value: totalWorkHours },
            18: { text: 'Ledolgozott', value: '' },
            19: { text: 'Szabadság', value: totalLeaveDays },
            20: { text: 'Fizetett ünnep', value: '' },
            21: { text: 'Beteg szabadság', value: totalSickLeaveDays },
            22: { text: 'Táppénzes idő', value: '' },
            23: { text: 'Igazolatlan', value: '' },
            24: { text: 'Egyéb', value: '' },
            26: { text: 'Összesen', value: '' }
        };

        // Hónap napjainak száma
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let i = 1; i <= 31; i++) {
            const rowContent = [
                { text: i.toString(), style: 'tableBody' }
            ];

            // Ha ez a nap a hónap határain belül van és van rá bejegyzés
            if (i <= daysInMonth && entriesByDay[i]) {
                const entry = entriesByDay[i];
                
                // Érkezési/távozási időpont oszlop
                let timeText = '';
                let hoursText = '';
                
                if (entry.entry_type === 'work' && entry.start_time && entry.end_time) {
                    const startTime = new Date(entry.start_time);
                    const endTime = new Date(entry.end_time);
                    const startHour = startTime.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                    const endHour = endTime.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                    timeText = `${startHour} - ${endHour}`;
                    // Az óraszám már tartalmazza az ebédszünet levonását
                    hoursText = entry.hours_worked ? entry.hours_worked.toString() : '';
                } else if (entry.entry_type === 'leave') {
                    timeText = ''; // Üres érkezési/távozási időpont
                    hoursText = 'Szabadság'; // A munkaidő oszlopba kerül
                } else if (entry.entry_type === 'sick_leave') {
                    timeText = ''; // Üres érkezési/távozási időpont
                    hoursText = 'Táppénz'; // A munkaidő oszlopba kerül
                } else if (entry.entry_type === 'custom') {
                    // Egyéb típus ugyanúgy kezeljük mint a munkanapot
                    if (entry.start_time && entry.end_time) {
                        const startTime = new Date(entry.start_time);
                        const endTime = new Date(entry.end_time);
                        const startHour = startTime.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                        const endHour = endTime.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
                        timeText = `${startHour} - ${endHour}`;
                    }
                    // Az óraszám már tartalmazza az ebédszünet levonását
                    hoursText = entry.hours_worked ? entry.hours_worked.toString() : '';
                }
                
                rowContent.push(
                    { text: timeText, style: 'tableBody' }, // Érkezési/távozási időpont
                    { text: hoursText, style: 'tableBody' } // Munkaidő órában
                );
            } else {
                // Üres mezők, ha nincs bejegyzés erre a napra
                rowContent.push(
                    { text: '', style: 'tableBody' }, // Érkezési/távozási időpont
                    { text: '', style: 'tableBody' }  // Munkaidő órában
                );
            }

            // Aláírás oszlop (mindig üres)
            rowContent.push({ text: '', style: 'tableBody' });

            // Speciális bejegyzések kezelése - 17. sortól kezdve két oszlop, előtte egyesített
            if (specialEntries[i]) {
                const entry = specialEntries[i];
                rowContent.push(
                    { text: entry.text, style: 'tableBody', alignment: 'left' }, // 5. oszlop: leírás
                    { text: entry.value.toString(), style: 'tableBody' } // 6. oszlop: érték
                );
            } else if (i >= 17) {
                // 17. sortól kezdve két külön oszlop, de üres
                rowContent.push(
                    { text: '', style: 'tableBody' }, // 5. oszlop üres
                    { text: '', style: 'tableBody' }  // 6. oszlop üres
                );
            } else {
                // 16. sorig egyesített oszlop
                rowContent.push(
                    { text: '', colSpan: 2, style: 'tableBody' }, // Egyesített üres oszlop
                    {} // Placeholder a colSpan miatt
                );
            }
            
            tableBody.push(rowContent);
        }

        const docDefinition = {
            header: function() {
                return {
                    stack: [
                        // Első sor: Logó és dokumentum adatok
                        {
                            columns: [
                                // 1. oszlop: Logó
                                {
                                    image: path.join(__dirname, '..', 'public', 'images', 'iws-logo.jpg'),
                                    width: 60
                                },
                                // 2. oszlop: Dokumentum adatok (több sorban)
                                {
                                    stack: [
                                        { text: 'Kibocsátotta: Zentainé Virányi Ágnes', style: 'headerDocText' },
                                        { text: 'Jóváhagyta: Klujber Dénes, Hatályba lépés dátuma: 2018.11.05.', style: 'headerDocText' },
                                        
                                    ],
                                    alignment: 'right'
                                }
                            ],
                            widths: ['auto', '*']
                        }
                    ],
                    margin: [40, 15, 40, 25]
                };
            },
            footer: function() {
                return {
                    stack: [
                        { text: 'Dok. szám: 03-002-FORM-2; Verzió: 1; Oldalszám: 1/1', style: 'footerText' },
                        { text: 'IWS Solutions Kft..', style: 'footerText' },
                        { text: '2040 Budaörs (Terrapark), Puskás Tivadar út 14/C.', style: 'footerText' },
                        { text: 'A dokumentum sokszorosítása, továbbítása, értékesítése és tartalmának közlése nem megengedett. Minden jog fenntartva.', style: 'footerLegalText' }
                    ],
                    alignment: 'center',
                    margin: [40, 0, 40, 20]
                };
            },
            content: [
                {
                    columns: [
                        { text: `A munkavállaló neve: ${userName}`, style: 'tableMainHeader' },
                        { text: `Aktuális év, hónap: ${year}. ${monthName}`, style: 'tableMainHeader', alignment: 'right' }
                    ],
                    margin: [0, 10, 0, 5]
                },
                { text: 'JELENLÉTI ÍV', style: 'documentTitle', alignment: 'center', margin: [0, 0, 0, 10] },
                {
                    style: 'tableExample',
                    table: {
                        headerRows: 1,
                        widths: ['auto', '*', '*', '*', '*', '*'],
                        body: tableBody
                    }
                }
            ],
            styles: {
                headerMainText: {
                    fontSize: 12,
                    bold: true
                },
                headerSubText: {
                    fontSize: 11,
                    bold: true
                },
                headerDocText: {
                    fontSize: 8,
                    alignment: 'right'
                },
                footerText: {
                    fontSize: 8,
                    alignment: 'center'
                },
                footerLegalText: {
                    fontSize: 6,
                    alignment: 'center'
                },
                documentTitle: {
                    fontSize: 14,
                    bold: true,
                    alignment: 'center'
                },
                tableMainHeader: {
                    bold: true,
                    fontSize: 10
                },
                tableSubHeader: {
                    bold: true,
                    fontSize: 8,
                    alignment: 'center',
                    fillColor: '#EEEEEE'
                },
                tableBody: {
                    fontSize: 8,
                    alignment: 'center'
                },
                tableExample: {
                    margin: [0, 5, 0, 15]
                }
            },
            defaultStyle: {
                font: 'Roboto'
            }
        };

        const fonts = {
            Roboto: {
                normal: path.join(__dirname, '..', 'fonts', 'Roboto-Regular.ttf'),
                bold: path.join(__dirname, '..', 'fonts', 'Roboto-Medium.ttf'),
                italics: path.join(__dirname, '..', 'fonts', 'Roboto-Italic-VariableFont_wdght.ttf'),
                bolditalics: path.join(__dirname, '..', 'fonts', 'Roboto-MediumItalic.ttf')
            }
        };
        
        const printer = new PdfPrinter(fonts);
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=jelenleti_iv_${userName}_${year}_${month}.pdf`);
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error('Backend (GET /api/time-entries/download-report): Hiba a PDF generálása során:', error);
        res.status(500).json({ message: 'Szerverhiba történt a PDF generálása során.', error: error.message });
    }
});


module.exports = router;