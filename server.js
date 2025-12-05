// server.js
require("dotenv").config();
const express = require('express');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { knex } = require('./db'); // CSAK A KNEX-ET IMPORTÁLJUK ITT! (a pool-t nem használjuk tovább)

const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const jwt = require('jsonwebtoken'); // JWT importálása

// --- ÚJ DEBUG LOG ---
console.log('Backend (server.js startup): process.env.JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded (first 10 chars: ' + process.env.JWT_SECRET.substring(0, 10) + '...)' : 'NOT LOADED or EMPTY!');
// --- VÉGE ÚJ DEBUG LOG ---

const app = express();
// A szerver portja
const PORT = process.env.PORT || 3000;

// !!! FONTOS: Most a reports.js már az inicializálási Promise-t is exportálja
const { router: reportsRouter, initializationPromise } = require('./reports'); // Betöltjük a reports.js fájlt
//Importáljuk az MVM-specifikus routert
const mvmReportsRouter = require('./mvm-reports');



// Importáljuk az óranyilvántartó routert
const timeEntriesRouter = require('./routes/timeEntries');
const scheduleRouter = require('./routes/schedule');

// Middleware beállítások
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Favicon beállítása (PNG formátumhoz)
app.use((req, res, next) => {
  if (req.url === '/favicon.ico') {
    res.redirect(301, '/images/favicon.png');
  } else {
    next();
  }
});

// statikus fájlkiszolgálás
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Az óranyilvántartó router regisztrálása
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/schedule', scheduleRouter);

// Express-session kezelés és Passport inicializálás (ezeknek a middleware-eknek globálisan kell futniuk a szerveren)
app.use(
  session({
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(64).toString('hex'), // Használjunk környezeti változót a titokhoz!
    resave: false,
    saveUninitialized: false,
    rolling: true, // Új kérés esetén frissíti a cookie lejárati idejét.
    cookie: { maxAge: 120 * 60 * 1000 } // Fél óra (30 perc) = 1,800,000 ms
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Passport stratégia - KNEX-re alakítva
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Felhasználó keresése az adatbázisban KNEX-szel
      const user = await knex('users').where({ username: username }).first();

      if (!user) {
        return done(null, false, { message: 'Nem található ilyen felhasználó.' });
      }

      // Jelszó ellenőrzése
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Hibás jelszó.' });
      }

      // Ellenőrizzük, hogy admin-e a felhasználó
      user.isAdmin = user.is_admin; // Az adatbázis mező alapján állítjuk be
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

// Felhasználói adatok sorosítása
passport.serializeUser((user, done) => {
  // A felhasználó 'id' mezőjét és az 'isAdmin' tulajdonságot mentjük
  done(null, { id: user.id, isAdmin: user.isAdmin });
});

// Felhasználói adatok visszanyerése - KNEX-re alakítva
passport.deserializeUser(async (userData, done) => {
  try {
    // Az id alapján keresünk az adatbázisban KNEX-szel
    const user = await knex('users').where({ id: userData.id }).first();

    if (user) {
      user.isAdmin = userData.isAdmin; // Az isAdmin tulajdonságot visszaállítjuk
      done(null, user);
    } else {
      done(new Error('Felhasználó nem található.'));
    }
  } catch (err) {
    done(err);
  }
});

// Admin hozzáadása POST endpoint - KNEX-re alakítva
app.post('/add-admin', (req, res) => {
  const { username, password, email } = req.body;

  bcrypt.hash(password, 10, async (err, hashedPassword) => {
    if (err) {
      console.error('Error hashing password:', err);
      return res.status(500).json({ message: 'Hiba történt a jelszó hash-elésekor' });
    }

    try {
      // Admin felhasználó hozzáadása az adatbázishoz KNEX-szel
      const [newAdmin] = await knex('users').insert({
        username: username,
        password: hashedPassword,
        email: email,
        is_admin: true
      }).returning('*'); // Visszaadja a beszúrt rekordot

      res.status(201).json({ message: 'Admin sikeresen hozzáadva!' });
    } catch (error) {
      console.error('Error adding admin:', error);
      // Kezeld az esetleges egyediségi megsértést (pl. ha a felhasználónév már létezik)
      if (error.code === '23505') { // Postgres unique violation error code
        return res.status(400).json({ message: 'A felhasználónév vagy email cím már foglalt.' });
      }
      res.status(500).json({ message: 'Hiba történt az admin hozzáadásakor.' });
    }
  });
});

// Regisztráció végpont - KNEX-re alakítva
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // Új felhasználó hozzáadása az adatbázishoz KNEX-szel
    await knex('users').insert({
      username: username,
      password: hashedPassword,
      is_admin: false
    });

    res.redirect('/login.html'); // Vagy res.status(201).json({ message: 'Sikeres regisztráció!' });
  } catch (err) {
    console.error('Error registering user:', err);
    if (err.code === '23505') { // Postgres unique violation error code
      return res.status(400).json({ message: 'A felhasználónév már foglalt.' });
    }
    res.status(500).json({ message: 'Hiba történt a regisztráció során' });
  }
});

// Login útvonal módosítása - KNEX-re alakítva (a belső lekérdezés)
app.post(
  '/login',
  (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        console.error('Backend (server.js): Passport authentication error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Backend (server.js): Login failed: Invalid username or password.');
        return res.status(401).json({ message: 'A felhasználónév és jelszó páros nem megfelelő.' });
      }
      req.logIn(user, (err) => {
        if (err) {
          console.error('Backend (server.js): req.logIn error:', err);
          return next(err);
        }
        console.log('Backend (server.js): User successfully authenticated via Passport.');
        return next();
      });
    })(req, res, next);
  },
  async (req, res) => {
    try {
      const user = req.user;

      // Lekérdezzük a felhasználó is_admin státuszát az adatbázisból KNEX-szel
      const result = await knex('users').select('is_admin').where({ id: user.id }).first();
      const isAdmin = result ? result.is_admin : false;

      // JWT token generálása
      const token = jwt.sign(
        { id: user.id, username: user.username, isAdmin: isAdmin },
        process.env.JWT_SECRET || 'your_jwt_secret_key',
        { expiresIn: '1h' }
      );

      console.log(`Backend (server.js): Login successful for user: ${user.username}, isAdmin: ${isAdmin}. Token generated.`);

      res.json({
        message: 'Sikeres bejelentkezés!',
        token: token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email, // Ha az email is elérhető a req.user-ből
          isAdmin: isAdmin
        }
      });
    } catch (error) {
      console.error('Backend (server.js): Error during token generation or admin status check:', error);
      res.status(500).json({ message: 'Hiba történt a bejelentkezés során.' });
    }
  }
);

// Alapértelmezett útvonal (login oldal)
app.get('/', (req, res, next) => {
  res.render('login', (err, html) => {
    if (err) {
      console.error(err);
      return next(err);
    }
    res.send(html);
  });
});

// Login oldal megjelenítése
app.get('/login', (req, res) => {
  res.render('login');
});

// Regisztrációs oldal megjelenítése
app.get('/register', (req, res) => {
  res.render('register');
});

// Dashboard oldal megjelenítése normál felhasználóknak
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated() || req.user.isAdmin) {
    return res.redirect('/login');
  }
  res.render('dashboard', { user: req.user });
});

// Admin dashboard oldal megjelenítése
// !!! FONTOS: Mivel a globális 'projects' és 'users' (admins) tömböket töröltük,
//      itt dinamikusan kell lekérni az adatokat.
app.get('/admin-dashboard', isAdmin, async (req, res) => { // 'async' hozzáadva
  const user = req.user;
  let projects = []; // Lokálisan deklaráljuk

  try {
    // Projektek lekérése az adatbázisból KNEX-szel
    projects = await knex('projects').select('*'); // Lekérjük az összes projektet

    // Ha szükséged van a felhasználókra (admins is_admin = true), azokat is itt kérd le:
    // let admins = await knex('users').where({ is_admin: true }).select('*');
    // let users = await knex('users').select('*');

    res.render('admin-dashboard', {
      user: req.user,
      projects: projects // Most már a dinamikusan lekérdezett projektek
    });
  } catch (error) {
    console.error('Error fetching data for admin-dashboard:', error);
    res.status(500).send('Hiba történt az admin dashboard betöltésekor.');
  }
});

// Sablon motor beállítása
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // views mappa beállítása

// Projekt hozzáadása form megjelenítése
app.get('/admin/projects/add', isAdmin, (req, res) => {
  res.render('add-project');
});

// Admin: Új projekt hozzáadása POST - KNEX-re alakítva
app.post('/admin/projects/add', isAdmin, async (req, res) => {
  // 1. BEOLVASSUK az új 'projectType' mezőt a body-ból
  const { name, description, status, projectType } = req.body;

  // 2. Érvényesség ellenőrzés (opcionális, de ajánlott)
  const allowedTypes = ['IWS Solutions', 'MVM Xpert'];
  if (!allowedTypes.includes(projectType)) {
      console.error('Érvénytelen projekttípus próbálkozás:', projectType);
      return res.status(400).json({ message: 'Érvénytelen projekttípus lett kiválasztva. Kérjük, válasszon az engedélyezett típusok közül.' });
  }

  try {
    // Egyedi azonosító generálása
    const externalId = uuidv4();

    // Ellenőrizni, hogy létezik-e már az `external_id` KNEX-szel
    const checkResult = await knex('projects').where('external_id', externalId).count('* as count').first();
    if (parseInt(checkResult.count, 10) > 0) {
      throw new Error('Az external_id már létezik. Próbálja újra.');
    }

    // Adatbázisba mentés KNEX-szel
    // 3. HOZZÁADJUK az új 'project_type' mezőt a beszúráshoz
    const [newProject] = await knex('projects').insert({
      name: name,
      description: description,
      status: status,
      external_id: externalId,
      project_type: projectType // Ezt mentjük el
    }).returning(['id', 'name']); // Visszaadja az id-t és a nevet

    console.log('Új projekt hozzáadva:', newProject);

    // A project_reports rekord létrehozása az új projekthez KNEX-szel
    await knex('project_reports').insert({
      user_id: req.user.id || 1, // Használd a bejelentkezett felhasználó ID-ját, ha elérhető
      created_at: knex.fn.now(), // Knex-specifikus dátum/idő függvény
      updated_at: knex.fn.now(),
      project_id: newProject.id,
      name: newProject.name
    });

    console.log('Új jegyzőkönyv rekord létrehozva a project_reports táblában.');

    res.redirect('/admin-dashboard');
  } catch (error) {
    console.error('Error adding project:', error);

    if (error.code === '23505') { // Postgres unique violation error code
      res.status(400).json({ message: 'Hiba: Az external_id már létezik. Próbáljon újra.' });
    } else {
      res.status(500).json({ message: 'Hiba történt a projekt hozzáadásakor.' });
    }
  }
});

// Admin: Felhasználó hozzáadása GET
app.get('/admin/users/add', isAdmin, (req, res) => {
  console.log('GET kérés megérkezett a felhasználó hozzáadása oldalra');
  res.render('add-user');
});

// Admin: Felhasználó hozzáadása POST - KNEX-re alakítva
app.post('/admin/users/add', isAdmin, async (req, res) => {
  console.log('POST kérés megérkezett');
  console.log('Received data:', req.body);

  const { username, password, confirmPassword, isAdmin: isNewUserAdmin } = req.body; // isNewUserAdmin néven a névütközés elkerülésére

  if (!username || !password || !confirmPassword) {
    return res.render('add-user', { // add-users helyett add-user, ha az a template neve
      error: 'Minden mező kitöltése kötelező',
      username
    });
  }

  if (password !== confirmPassword) {
    return res.render('add-user', { // add-users helyett add-user
      error: 'A két jelszó nem egyezik',
      username
    });
  }

  try {
    // Ellenőrizzük, hogy a felhasználónév egyedi-e KNEX-szel
    const userCheck = await knex('users').where({ username: username }).first();
    if (userCheck) {
      return res.render('add-user', { // add-users helyett add-user
        error: 'A felhasználónév már foglalt!',
        username
      });
    }

    // Titkosítjuk a jelszót
    const hashedPassword = await bcrypt.hash(password, 10);

    // Új felhasználó adatainak mentése az adatbázisba KNEX-szel
    const [newUser] = await knex('users').insert({
      username: username,
      password: hashedPassword,
      is_admin: isNewUserAdmin ? true : false
    }).returning('*');

    res.redirect('/admin/users'); // Feltételezem, hogy van ilyen oldal
  } catch (error) {
    console.error('Error adding user:', error);
    res.render('add-user', { // add-users helyett add-user
      error: 'Hiba történt a felhasználó hozzáadása során.',
      username
    });
  }
});

// ************************************************************
// FŐ ALKALMAZÁS INDÍTÓ FÜGGVÉNY
// ************************************************************
async function startApplication() {
    // Aszinkron inicializálások, amiknek csak egyszer kell lefutniuk
    console.log("Waiting for Google Cloud Services to initialize from reports.js...");
    await initializationPromise;
    console.log("Google Cloud Services initialization complete.");

    // Most, hogy minden inicializálva van, csatoljuk a reports routert
    app.use('/reports', reportsRouter);
    app.use('/', mvmReportsRouter);

    // Itt lekérjük az adminokat és projekteket.
    // Ezt a részt kivettük a globális scope-ból, most csak deklarációk
    let admins = []; // Deklaráció a scope-ban, de most már nem töltjük fel itt
    let projects = []; // Deklaráció a scope-ban, de most már nem töltjük fel itt

    // Port próbálgatás ciklus
    let currentPort = PORT;
    const MAX_PORT_RETRIES = 5;
    let retries = 0;

    // Port foglaltság ellenőrző függvény
    function tryStartServer(port) {
        return new Promise((resolve, reject) => {
            const server = app.listen(port, () => {
                console.log(`Szerver fut a http://localhost:${port} címen`);
                console.log("Google Drive Service sikeresen inicializálva.");
                resolve(server);
            });

            server.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    console.log(`Port ${port} már használatban van, próbálkozás a következő porttal...`);
                    reject(new Error(`Port ${port} foglalt`));
                } else {
                    console.error("Szerver hiba:", error);
                    reject(error);
                }
            });
        });
    }

    while (retries < MAX_PORT_RETRIES) {
        try {
            await tryStartServer(currentPort);
            return;
        } catch (error) {
            if (error.message.includes('foglalt')) {
                currentPort++;
                retries++;
                console.log(`Próbálkozás a ${currentPort} porttal... (${retries}/${MAX_PORT_RETRIES})`);
            } else {
                console.error("Alkalmazás indítási hiba:", error);
                process.exit(1);
            }
        }
    }

    console.error(`Nem sikerült elindítani a szervert ${MAX_PORT_RETRIES} próbálkozás után.`);
    console.error(`Próbált portok: ${PORT} - ${currentPort - 1}`);
    process.exit(1);
}

// Ez a blokk biztosítja, hogy a startApplication() csak akkor hívódjon meg,
// ha a server.js a fő modul (azaz közvetlenül futtatják, nem importálják).
if (require.main === module) {
    startApplication();
}

// Admin ellenőrző middleware (feltételezem, hogy valahol definiálva van)
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user && req.user.isAdmin) {
        return next();
    }
    res.redirect('/login');
}

// Sablon motor beállítása (ezeket a startApplication-ön kívül kell, hogy az Express lássa)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Admin: Felhasználó törlése - KNEX-re alakítva
app.post('/admin/users/delete/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;

  try {
    // Ellenőrizzük, hogy a felhasználó létezik-e KNEX-szel
    const userCheck = await knex('users').where({ id: userId }).first();
    if (!userCheck) { // Ha userCheck null, akkor nem található a felhasználó
      return res.status(404).json({ error: 'A felhasználó nem található!' });
    }

    // Törölni a felhasználót az adatbázisból KNEX-szel
    await knex('users').where({ id: userId }).del();

    // Átirányítás a felhasználók oldalra sikeres törlés után
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Hiba történt a felhasználó törlése során.' });
  }
});

// Admin: felhasználó projekthez rendelése - KNEX-re alakítva
app.post('/admin/assign-project', isAdmin, async (req, res) => {
  const { userId, projectId } = req.body;

  if (!userId || !projectId) {
    return res.status(400).json({ error: 'Felhasználó és projekt ID szükséges' });
  }

  try {
    // Ellenőrizzük, hogy létezik-e a felhasználó KNEX-szel
    const userResult = await knex('users').where({ id: userId }).first();
    if (!userResult) {
      return res.status(404).json({ error: 'Felhasználó nem található' });
    }

    // Ellenőrizzük, hogy létezik-e a projekt KNEX-szel
    const projectResult = await knex('projects').where({ id: projectId }).first();
    if (!projectResult) {
      return res.status(404).json({ error: 'Projekt nem található' });
    }

    // A felhasználó és projekt összekapcsolása a kapcsolótáblában KNEX-szel
    // Az ON CONFLICT DO NOTHING opció segít elkerülni a duplikált bejegyzéseket, ha már létezik
    await knex('user_projects').insert({
      user_id: userId,
      project_id: projectId
    }).onConflict(['user_id', 'project_id']).ignore(); // Vagy .merge() ha frissíteni szeretnéd

    res.redirect('/admin-dashboard');
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({ error: 'Hiba történt a projekt hozzárendelésekor.' });
  }
});

// Felhasználó eltávolítása a projekttől (POST) - KNEX-re alakítva
app.post('/admin/projects/:projectId/remove-user/:userId', isAdmin, async (req, res) => {
  const { projectId, userId } = req.params;

  try {
    // Ellenőrizzük, hogy létezik-e a projekt KNEX-szel
    const projectResult = await knex('projects').where({ id: projectId }).first();
    if (!projectResult) {
      return res.status(404).send('Projekt nem található');
    }

    // Ellenőrizzük, hogy létezik-e a felhasználó KNEX-szel
    const userResult = await knex('users').where({ id: userId }).first();
    if (!userResult) {
      return res.status(404).send('Felhasználó nem található');
    }

    // Felhasználó eltávolítása a kapcsolótáblából KNEX-szel
    const deletedRows = await knex('user_projects')
      .where({ user_id: userId, project_id: projectId })
      .del();

    if (deletedRows === 0) {
      return res.status(404).send('Felhasználó nincs hozzárendelve ehhez a projekthez');
    }

    res.redirect(`/admin/projects/${projectId}`);
  } catch (error) {
    console.error('Error removing user from project:', error);
    res.status(500).send('Hiba történt a felhasználó eltávolítása során');
  }
});

// Tesztelő kód - add hozzá ideiglenesen valamelyik route-hoz
app.get('/test-schema', async (req, res) => {
    try {
        // PostgreSQL-ben ellenőrizd a táblákat
        const tables = await knex.raw(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '%project%'
        `);
        
        console.log('Tables:', tables.rows);
        
        // Ellenőrizd a foreign key-eket
        const constraints = await knex.raw(`
            SELECT 
                tc.constraint_name,
                tc.table_name,
                kcu.column_name,
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND tc.table_name LIKE '%project%'
        `);
        
        console.log('Foreign keys:', constraints.rows);
        res.json({ tables: tables.rows, constraints: constraints.rows });
        
    } catch (error) {
        console.error('Schema check error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: Projekt törlése - BŐVÍTETT VERZIÓ (minden kapcsolódó tábla)
app.post('/admin/projects/delete', isAdmin, async (req, res) => {
    const { projectId } = req.body;

    if (!projectId) {
        return res.status(400).send("Hiányzik a projectId a kérésből.");
    }

    try {
        await knex.transaction(async trx => {
            // 1. Töröljük a user_projects táblából
            console.log(`Trying to delete entries from user_projects for project ID: ${projectId}`);
            const deletedUserProjectsCount = await trx('user_projects')
                .where({ project_id: projectId })
                .del();
            console.log(`Deleted ${deletedUserProjectsCount} entries from user_projects.`);

            // 2. Töröljük a project_users táblából
            console.log(`Trying to delete entries from project_users for project ID: ${projectId}`);
            const deletedProjectUsersCount = await trx('project_users')
                .where({ project_id: projectId })
                .del();
            console.log(`Deleted ${deletedProjectUsersCount} entries from project_users.`);

            // 3. ÚJ: Töröljük a project_reports táblából
            console.log(`Trying to delete entries from project_reports for project ID: ${projectId}`);
            const deletedProjectReportsCount = await trx('project_reports')
                .where({ project_id: projectId })
                .del();
            console.log(`Deleted ${deletedProjectReportsCount} entries from project_reports.`);

            // 4. Ha van time_entries tábla is, azt is törölni kell
            try {
                console.log(`Trying to delete entries from time_entries for project ID: ${projectId}`);
                const deletedTimeEntriesCount = await trx('time_entries')
                    .where({ project_id: projectId })
                    .del();
                console.log(`Deleted ${deletedTimeEntriesCount} entries from time_entries.`);
            } catch (timeEntriesError) {
                // Ha nincs time_entries tábla vagy oszlop, csak logoljuk
                console.log('No time_entries to delete or table does not exist');
            }

            // 5. Végül töröljük magát a projektet
            console.log(`Trying to delete project with ID: ${projectId}`);
            const deletedProjectCount = await trx('projects')
                .where({ id: projectId })
                .del();
            console.log(`Deleted ${deletedProjectCount} projects.`);

            if (deletedProjectCount === 0) {
                console.log(`Warning: Project with ID ${projectId} not found to delete.`);
            }
        });

        const updatedProjects = await knex('projects').select('*');

        res.render('projects', {
            projects: updatedProjects,
            message: 'A projekt és az összes kapcsolódó adat sikeresen törlésre került.'
        });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).send(`Hiba történt a projekt törlése során: ${error.message}`);
    }
});

// Felhasználók hozzárendelése egy projekthez - JAVÍTOTT VERZIÓ
app.post('/admin/projects/:projectId/assign-users', isAdmin, async (req, res) => {
  const projectId = req.params.projectId;
  let assignedUsers = req.body.assignedUsers;

  // Ha nincs kiválasztva senki, ne csináljunk semmit
  if (!assignedUsers || (Array.isArray(assignedUsers) && assignedUsers.length === 0)) {
    return res.redirect(`/admin/projects/${projectId}`);
  }

  // String-ből array-t csinálunk
  if (typeof assignedUsers === 'string') {
    assignedUsers = [assignedUsers];
  }

  try {
    await knex.transaction(async trx => {
      // Adatstruktúra elkészítése a beillesztéshez
      const insertData = assignedUsers.map(userId => ({
        user_id: userId,
        project_id: projectId
      }));

      // ⭐ VÁLTOZÁS: Csak HOZZÁADJUK az új felhasználókat, NEM TÖRÖLJÜK a régieket!
      if (insertData.length > 0) {
        await trx('user_projects')
          .insert(insertData)
          .onConflict(['user_id', 'project_id'])
          .ignore(); // Ha már létezik, akkor ignoráljuk (duplikáció elkerülése)
      }

      // ⭐ TÖRLÉS LOGIKÁT KIVETTÜK - már NEM töröljük a felhasználókat automatikusan
    });

    // Redirect a GET route-ra
    res.redirect(`/admin/projects/${projectId}`);

  } catch (error) {
    console.error('Error assigning users to project:', error);
    res.status(500).send('Hiba történt a felhasználók hozzárendelése során');
  }
});

//Felhasználó projektek megjelenítéséhez autentikáció
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next(); // Folytatjuk a következő middleware-t vagy route kezelőt
  }
  res.redirect('/login'); // Ha nincs bejelentkezve, irányítjuk a bejelentkező oldalra
}

// Felhasználó projektjeinek lekérése adatbázisból - KNEX-re alakítva
app.get('/user/projects', isAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    // Lekérjük a felhasználóhoz tartozó projekteket KNEX-szel
    const userProjects = await knex('projects')
      .select('projects.*')
      .join('user_projects', 'projects.id', 'user_projects.project_id')
      .where('user_projects.user_id', userId);

    // Ha nincs hozzárendelt projekt, értesítjük a felhasználót
    if (userProjects.length === 0) {
      return res.status(404).render('user-projects', { projects: [], message: 'Nincsenek megjeleníthető projektek.' });
    }

    // A projekteket átadjuk az EJS sablonnak
    res.render('user-projects', { projects: userProjects });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).send('Hiba történt a projektek lekérése során');
  }
});

// Felhasználó: projekt adatok megjelenítése adatbázisból - KNEX-re alakítva
app.get('/user/projects/:projectId', isAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const isUserAdmin = req.user.isAdmin;

  try {
    // 1. Projekt lekérdezése (ez tartalmazza a project_type-ot!)
    const project = await knex('projects').where({ id: projectId }).first();
    if (!project) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }

    // 2. Jogosultság ellenőrzés (a meglévő logika)
    if (!isUserAdmin) {
      const assignment = await knex('user_projects')
        .where({ user_id: userId, project_id: projectId })
        .first();

      if (!assignment) {
        return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt megtekintéséhez.' });
      }
    }

    // 3. 🚦 TÍPUS ALAPÚ SABLONVÁLASZTÁS 🚦
    
    // Meghatározzuk a sablon nevét
    let templateName;
    
    if (project.project_type === 'MVM Xpert') {
      // Ha MVM Xpert, egy új, dedikált sablont használunk
      templateName = 'mvm-user-project-details'; // Pl. mvm-project-details.ejs
    } else {
      // Alapértelmezett (IWS Solutions)
      templateName = 'user-project-details'; // A meglévő user-project-details.ejs
    }

    // A projekt adatainak és projectId átadása a KIVÁLASZTOTT EJS sablonnak
    res.render(templateName, { project, projectId });
    
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).send('Hiba történt a projekt adatok lekérése során');
  }
});

// Admin: projekt részletek lekérése a hozzárendelt felhasználókkal - KNEX-re alakítva
app.get('/admin/projects/:projectId', isAdmin, async (req, res) => {
  const { projectId } = req.params;

  try {
    // 1. Projekt alapadatainak lekérése KNEX-szel (beleértve a project_type-ot)
    const project = await knex('projects').where({ id: projectId }).first();

    if (!project) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }

    // 2. Hozzárendelt felhasználók lekérése KNEX-szel (ugyanaz a logika)
    project.assignedUsers = await knex('users')
      .select('users.id', 'users.username')
      .join('user_projects', 'users.id', 'user_projects.user_id')
      .where('user_projects.project_id', projectId);

    // 3. Összes felhasználó lekérése a kiválasztó mezőhöz KNEX-szel
    const users = await knex('users').select('id', 'username');

    // 4. 🚦 TÍPUS ALAPÚ SABLONVÁLASZTÁS 🚦
    
    let templateName;
    
    if (project.project_type === 'MVM Xpert') {
      // Ha MVM Xpert, egy új, dedikált admin sablont használunk
      templateName = 'mvm-admin-project-details'; // Pl. mvm-admin-project-details.ejs
    } else {
      // Alapértelmezett (IWS Solutions) - a meglévő sablon
      templateName = 'project-details'; // A meglévő project-details.ejs
    }

    // Projekt adatok, hozzárendelt felhasználók és összes felhasználó átadása a KIVÁLASZTOTT sablonnak
    res.render(templateName, { project, users });

  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).render('error', { message: 'Hiba történt a projekt adatok lekérése során' });
  }
});

// MVM Xpert Jegyzőkönyv Készítéshez - Típus Alapú Irányítás
app.get('/projects/:projectId/new-report', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;
    const category = req.query.category; // Kategória ID az URL-ből

    try {
        // 1. Projektdatok lekérése, beleértve a project_type-ot
        const project = await knex('projects')
            .where('id', projectId)
            .first();

        if (!project) {
            return res.status(404).render('error', { message: 'Projekt nem található.' });
        }
        
        // 2. Szükséges Jogosultság Ellenőrzés (ha nem admin, hozzá van-e rendelve?)
        if (!req.user.isAdmin) {
             const assignment = await knex('user_projects')
                .where({ user_id: userId, project_id: projectId })
                .first();

             if (!assignment) {
                 return res.status(403).render('error', { message: 'Nincs jogosultsága ehhez a projekthez.' });
             }
        }

        // 3. Típus Alapú Sablonválasztás
        if (project.project_type === 'MVM Xpert') {
            // Ha van kategória paraméter, akkor kategória-specifikus oldal
            if (category) {
                // Kategória specifikus sablon betöltése
                const categoryTemplates = {
                    '1': 'mvm-documentation',
                    '2': 'mvm-personal-conditions',
                    '3': 'mvm-work-environment',
                    '4': 'mvm-machinery',
                    '5': 'mvm-electrical-safety',
                    '6': 'mvm-personal-protective-equipment',
                    '7': 'mvm-first-aid',
                    '8': 'mvm-hazardous-materials',
                    '9': 'mvm-omissions',
                    '10': 'mvm-other'
                };

                const templateName = categoryTemplates[category];
                
                if (!templateName) {
                    return res.status(404).render('error', { message: 'Érvénytelen kategória.' });
                }

                return res.render(templateName, { 
                    project: project,
                    user: req.user,
                    category: category
                });
            }
            
            // Ha nincs kategória, akkor az MVM kategória választó oldal
            res.render('mvm_xpert_report_form', { 
                project: project,
                user: req.user
            }); 
        } else {
            // Alapértelmezett (IWS Solutions) jegyzőkönyv sablon
            res.render('iws_solutions_report_form', { 
                project: project,
                user: req.user
            });
        }
        
    } catch (error) {
        console.error('Hiba a jegyzőkönyv űrlap betöltésekor:', error);
        res.status(500).render('error', { message: 'Hiba történt az űrlap lekérése közben.' });
    }
});

// Jelszó frissítése - KNEX-re alakítva
app.post('/update-password', isAuthenticated, async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.send("A két jelszó nem egyezik.");
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const userId = req.user.id;

    // Frissítjük a felhasználó jelszavát az adatbázisban KNEX-szel
    const updatedRows = await knex('users')
      .where({ id: userId })
      .update({ password: hashedPassword });

    if (updatedRows === 0) {
      return res.send("Felhasználó nem található.");
    }

    res.send("Jelszó sikeresen frissítve.");
  } catch (err) {
    console.error("Hiba történt a jelszó módosításakor:", err);
    res.status(500).send("Hiba történt a jelszó módosításakor.");
  }
});

// Profil oldal megjelenítése - MÁR KNEX-ES VOLT, DE ÁTMENETILEG IDE TETTÜK A TELJESSÉG MIATT
// EZ A RÉSZ MÁR HELYESEN VOLT KÉSZÍTVE AZ ELŐZŐ VÁLASZODBAN!
app.get('/profile', isAuthenticated, async (req, res) => {
  try {
    // 1. Lekérjük a felhasználói adatokat az adatbázisból (Knex-szel)
    const user = await knex('users').where({ id: req.user.id }).first();

    if (!user) {
      return res.status(404).render('error', { message: 'Felhasználó nem található.' });
    }

    // 2. Lekérjük a felhasználó saját időbejegyzéseit (time_entries)
    const timeEntries = await knex('time_entries')
      .leftJoin('projects', 'time_entries.project_id', 'projects.id')
      .where('time_entries.user_id', req.user.id)
      .select(
        'time_entries.id',
        'time_entries.entry_date',
        'time_entries.hours_worked',
        'time_entries.entry_type',
        'time_entries.notes',
        'projects.name as project_name'
      )
      .orderBy('time_entries.entry_date', 'desc');

    // 3. Lekérjük a felhasználó saját beosztásait (appointments)
    const appointments = await knex('appointments')
      .where({ user_id: req.user.id })
      .select('*')
      .orderBy('start_time', 'asc');

    // 4. Rendereljük a profile.ejs oldalt, és átadjuk az összes adatot
    res.render('profile', {
      user,
      timeEntries,
      appointments
    });

  } catch (err) {
    console.error('Hiba a profil betöltésekor:', err);
    res.status(500).send('Hiba történt a profil megjelenítésekor.');
  }
});

// Kijelentkezés
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) { return res.send('Kijelentkezési hiba'); }
    res.redirect('/login');
  });
});

// Middleware az adminisztrációs jogosultság ellenőrzésére - KNEX-re alakítva
async function isAdmin(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  try {
    // Ellenőrizzük a felhasználó admin státuszát az adatbázisból KNEX-szel
    const user = await knex('users').where({ id: req.user.id }).first();

    if (!user || !user.is_admin) {
      return res.status(403).send('Nincs jogosultsága az oldal megtekintéséhez.');
    }

    return next();
  } catch (err) {
    console.error('Hiba az admin ellenőrzésénél:', err);
    res.status(500).redirect('/login');
  }
}

// Projektek megjelenítése - KNEX-re alakítva
app.get('/admin/projects', isAdmin, async (req, res) => {
  try {
    // Lekérjük a projekteket és felhasználókat az adatbázisból KNEX-szel
    const projects = await knex('projects').select('*');
    const users = await knex('users').select('*');

    res.render('projects', { projects, users }); // Mindkét adat átadása a sablonnak
  } catch (err) {
    console.error('Hiba a projektek megjelenítésekor:', err);
    res.status(500).send('Hiba történt a projektek betöltésekor.');
  }
});

// Admin: Projekt adatai, projektre kattintáskor - KNEX-re alakítva
app.get('/admin/projects/:id', isAdmin, async (req, res) => {
  const projectId = req.params.id;
  try {
    // Lekérjük a projekt adatokat az adatbázisból KNEX-szel
    const project = await knex('projects').where({ id: projectId }).first();
    if (!project) {
      return res.status(404).send('Projekt nem található');
    }

    // Lekérjük a projekthez rendelt felhasználókat KNEX-szel
    const assignedUsers = await knex('users')
      .select('u.id', 'u.username')
      .from('users as u')
      .join('user_projects as up', 'u.id', 'up.user_id')
      .where('up.project_id', projectId);

    // Lekérjük az összes felhasználót az adatbázisból KNEX-szel
    const users = await knex('users').select('*');

    // Hozzárendeljük a felhasználókat a projekt objektumhoz
    project.assignedUsers = assignedUsers;

    res.render('project-details', { project, users }); // Adatok átadása az EJS-nek
  } catch (err) {
    console.error('Hiba a projekt adatai lekérésénél:', err);
    res.status(500).send('Hiba történt a projekt adatainak lekérésekor.');
  }
});

// Admin: Projekt szerkesztése GET - KNEX-re alakítva
app.get('/admin/projects/edit/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Lekérjük a projektet az adatbázisból KNEX-szel
    const project = await knex('projects').where({ id: id }).first();

    if (!project) {
      return res.status(404).send('Projekt nem található');
    }

    res.render('edit-project', { project });
  } catch (err) {
    console.error('Hiba a projekt szerkesztésekor:', err);
    res.status(500).send('Hiba történt a projekt szerkesztésekor.');
  }
});

// Admin: Projekt szerkesztése (mentés) POST - KNEX-re alakítva
app.post('/admin/projects/edit/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;

  try {
    // Projektadatok módosítása KNEX-szel
    const updatedRows = await knex('projects')
      .where({ id: id })
      .update({ name: name, description: description, status: status });

    if (updatedRows === 0) {
      return res.status(404).send('Projekt nem található a frissítéshez.');
    }

    res.redirect('/admin/projects'); // Visszairányítás a projektek listájára
  } catch (err) {
    console.error('Hiba a projekt módosításakor:', err);
    res.status(500).send('Hiba történt a projekt módosításakor!');
  }
});

// Felhasználó: Projekt szerkesztése GET - KNEX-re alakítva
app.get('/user/projects/edit/:projectId', isAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  try {
    // Ellenőrizzük, hogy a projekt létezik-e és a felhasználóhoz van-e rendelve KNEX-szel
    const project = await knex('projects').where({ id: projectId }).first();
    if (!project) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }

    // Ellenőrizzük, hogy a projekt hozzá van-e rendelve a felhasználóhoz KNEX-szel
    const assignment = await knex('user_projects')
      .where({ user_id: userId, project_id: projectId })
      .first();

    if (!assignment) {
      return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt szerkesztéséhez.' });
    }

    // A projekt adatainak átadása az EJS sablonnak
    res.render('user-edit-project', { project, projectId });
  } catch (error) {
    console.error('Error fetching project details for editing:', error);
    res.status(500).send('Hiba történt a projekt adatok lekérése során');
  }
});

// Felhasználó: Projekt szerkesztésének mentése POST - KNEX-re alakítva
app.post('/user/projects/edit/:projectId', isAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const { name, description, status } = req.body;

  try {
    // Ellenőrizzük, hogy a projekt hozzá van-e rendelve a felhasználóhoz KNEX-szel
    const assignment = await knex('user_projects')
      .where({ user_id: userId, project_id: projectId })
      .first();

    if (!assignment) {
      return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt szerkesztéséhez.' });
    }

    // Projektadatok módosítása KNEX-szel
    const updatedRows = await knex('projects')
      .where({ id: projectId })
      .update({ name: name, description: description, status: status });

    if (updatedRows === 0) {
      return res.status(404).send('Projekt nem található a frissítéshez.');
    }

    res.redirect(`/user/projects/${projectId}`); // Visszairányítás a projekt részleteihez
  } catch (err) {
    console.error('Hiba a projekt módosításakor:', err);
    res.status(500).send('Hiba történt a projekt módosításakor!');
  }
});

// Admin: Felhasználók megjelenítése - KNEX-re alakítva
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    // Felhasználók lekérdezése az adatbázisból
    const users = await knex('users').select('*');

    // Felhasználókhoz tartozó projektek lekérdezése JOIN-nal KNEX-szel
    const userProjectsRaw = await knex('users as u')
      .select(
        'u.id as user_id',
        'u.username',
        'u.is_admin',
        'p.id as project_id',
        'p.name as project_name'
      )
      .leftJoin('user_projects as up', 'u.id', 'up.user_id')
      .leftJoin('projects as p', 'up.project_id', 'p.id');

    // A raw adatok feldolgozása a `usersWithProjects` struktúrába
    const usersWithProjects = users.map(user => {
      const projects = userProjectsRaw
        .filter(row => row.user_id === user.id && row.project_id !== null) // Szűrjük azokat, amikhez tartozik projekt
        .map(row => ({
          id: row.project_id,
          name: row.project_name,
        }));
      return { ...user, projects };
    });

    res.render('admin-users', { users: usersWithProjects });
  } catch (err) {
    console.error('Hiba a felhasználók lekérésekor:', err);
    res.status(500).send('Hiba történt a felhasználók lekérésekor.');
  }
});

