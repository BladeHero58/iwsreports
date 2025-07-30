require("dotenv").config();
const express = require('express');
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { pool, knex } = require('./db');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

// --- DEBUG LOG ---
console.log('Backend (server.js startup): process.env.JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded (first 10 chars: ' + process.env.JWT_SECRET.substring(0, 10) + '...)' : 'NOT LOADED or EMPTY!');

const app = express();
// Render.com portkezelés - PORT környezeti változót használja
const PORT = process.env.PORT || 3000;

// !!! FONTOS: Most a reports.js már az inicializálási Promise-t is exportálja
const { router: reportsRouter, initializationPromise } = require('./reports');

// Importáljuk az óranyilvántartó routert
const timeEntriesRouter = require('./routes/timeEntries');
const scheduleRouter = require('./routes/schedule');

// Middleware beállítások
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// statikus fájlkiszolgálás
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Express-session kezelés
app.use(
  session({
    secret: require('crypto').randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
  })
);

// Passport inicializálása
app.use(passport.initialize());
app.use(passport.session());

// Az óranyilvántartó router regisztrálása
app.use('/api/time-entries', timeEntriesRouter);
app.use('/api/schedule', scheduleRouter);

// Sablon motor beállítása
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Globális változók inicializálása
let admins = [];
let projects = [];
let users = [];

// ************************************************************
// FŐ ALKALMAZÁS INDÍTÓ FÜGGVÉNY
// ************************************************************
async function startApplication() {
    try {
        console.log("Initializing application...");
        
        // Aszinkron inicializálások
        console.log("Waiting for Google Cloud Services to initialize from reports.js...");
        await initializationPromise;
        console.log("Google Cloud Services initialization complete.");

        // Most, hogy minden inicializálva van, csatoljuk a reports routert
        app.use('/reports', reportsRouter);

        // Adminok betöltése
        try {
            const adminResult = await pool.query('SELECT * FROM users WHERE is_admin = TRUE');
            admins = adminResult.rows;
            console.log('Admins loaded:', admins.length);
        } catch (err) {
            console.error('Error fetching admins:', err);
        }

        // Projektek betöltése
        try {
            const projectResult = await pool.query('SELECT * FROM projects');
            projects = projectResult.rows;
            console.log('Projects loaded:', projects.length);
        } catch (err) {
            console.error('Error fetching projects:', err);
        }

        // Felhasználók betöltése
        try {
            const userResult = await pool.query('SELECT * FROM users');
            users = userResult.rows;
            console.log('Users loaded:', users.length);
        } catch (err) {
            console.error('Error fetching users:', err);
        }

        // Szerver indítása - egyszerű, Render.com kompatibilis módon
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Szerver fut a http://0.0.0.0:${PORT} címen`);
            console.log("Google Drive Service sikeresen inicializálva.");
            console.log("Alkalmazás sikeresen elindult!");
        });

        server.on('error', (error) => {
            console.error("Szerver hiba:", error);
            process.exit(1);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM kapva, szerver leállítása...');
            server.close(() => {
                console.log('Szerver leállítva.');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error("Alkalmazás indítási hiba:", error);
        process.exit(1);
    }
}

// Passport stratégia
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

      if (!user) {
        return done(null, false, { message: 'Nem található ilyen felhasználó.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Hibás jelszó.' });
      }

      user.isAdmin = user.is_admin;
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

// Middleware: Admin jogosultság ellenőrzése
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.isAdmin) {
    return next();
  }
  res.status(403).send('Nincs jogosultsága az oldal megtekintéséhez.');
}

// Middleware: Autentikáció ellenőrzése
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

//Admin hozzáadása
app.post('/add-admin', (req, res) => {
  const { username, password, email } = req.body;

  bcrypt.hash(password, 10, async (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ message: 'Hiba történt a jelszó hash-elésekor' });
    }

    try {
      const result = await pool.query(
        'INSERT INTO users (username, password, email, is_admin) VALUES ($1, $2, $3, TRUE) RETURNING *',
        [username, hashedPassword, email]
      );

      const newAdmin = result.rows[0];
      res.status(201).json({ message: 'Admin sikeresen hozzáadva!' });
    } catch (error) {
      console.error('Error adding admin:', error);
      res.status(500).json({ message: 'Hiba történt az admin hozzáadásakor.' });
    }
  });
});

// Regisztráció végpont
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = await pool.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, FALSE) RETURNING id',
      [username, hashedPassword]
    );

    res.redirect('/login.html');
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ message: 'Hiba történt a regisztráció során' });
  }
});

// Login útvonal módosítása
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

      const result = await pool.query('SELECT is_admin FROM users WHERE id = $1', [user.id]);
      const isAdmin = result.rows[0] ? result.rows[0].is_admin : false;

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
          email: user.email,
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
app.get('/admin-dashboard', isAdmin, (req, res) => {
  const user = req.user;
  const projectsData = users.flatMap(user => user.projects || []);

  res.render('admin-dashboard', {
    user: req.user,
    projects: projects
  });
});

// Felhasználói adatok sorosítása
passport.serializeUser((user, done) => {
  done(null, { id: user.id, isAdmin: user.isAdmin });
});

// Felhasználói adatok visszanyerése
passport.deserializeUser(async (userData, done) => {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userData.id]);
    const user = result.rows[0];

    if (user) {
      user.isAdmin = userData.isAdmin;
      done(null, user);
    } else {
      done(new Error('Felhasználó nem található.'));
    }
  } catch (err) {
    done(err);
  }
});

// Projekt hozzáadása form megjelenítése
app.get('/admin/projects/add', isAdmin, (req, res) => {
  res.render('add-project');
});

// Admin: Új projekt hozzáadása
app.post('/admin/projects/add', isAdmin, async (req, res) => {
  const { name, description, status } = req.body;

  try {
    const externalId = uuidv4();

    const checkResult = await pool.query('SELECT COUNT(*) FROM projects WHERE external_id = $1', [externalId]);
    if (parseInt(checkResult.rows[0].count, 10) > 0) {
      throw new Error('Az external_id már létezik. Próbálja újra.');
    }

    const result = await pool.query(
      'INSERT INTO projects (name, description, status, external_id) VALUES ($1, $2, $3, $4) RETURNING id, name',
      [name, description, status, externalId]
    );

    const newProject = result.rows[0];
    console.log('Új projekt hozzáadva:', newProject);

    await pool.query(
      'INSERT INTO project_reports (user_id, created_at, updated_at, project_id, name) VALUES ($1, NOW(), NOW(), $2, $3)',
      [1, newProject.id, newProject.name]
    );

    console.log('Új jegyzőkönyv rekord létrehozva a project_reports táblában.');

    res.redirect('/admin-dashboard');
  } catch (error) {
    console.error('Error adding project:', error);

    if (error.code === '23505') {
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

// Admin: Felhasználó hozzáadása POST
app.post('/admin/users/add', isAdmin, async (req, res) => {
  console.log('POST kérés megérkezett');
  console.log('Received data:', req.body);

  const { username, password, confirmPassword, isAdmin } = req.body;

  if (!username || !password || !confirmPassword) {
    return res.render('add-users', { 
      error: 'Minden mező kitöltése kötelező',
      username 
    });
  }

  if (password !== confirmPassword) {
    return res.render('add-users', { 
      error: 'A két jelszó nem egyezik',
      username 
    });
  }

  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.render('add-users', { 
        error: 'A felhasználónév már foglalt!',
        username 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, isAdmin ? true : false]
    );

    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error adding user:', error);
    res.render('add-users', { 
      error: 'Hiba történt a felhasználó hozzáadása során.',
      username 
    });
  }
});

// Admin: Felhasználó törlése
app.post('/admin/users/delete/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  
  try {
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'A felhasználó nem található!' });
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.redirect('/admin/users');
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Hiba történt a felhasználó törlése során.' });
  }
});

// Admin: felhasználó projekthez rendelése
app.post('/admin/assign-project', isAdmin, async (req, res) => {
  const { userId, projectId } = req.body;

  if (!userId || !projectId) {
    return res.status(400).json({ error: 'Felhasználó és projekt ID szükséges' });
  }

  try {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Felhasználó nem található' });
    }

    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Projekt nem található' });
    }

    await pool.query(
      'INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)',
      [userId, projectId]
    );

    res.redirect('/admin-dashboard');
  } catch (error) {
    console.error('Error assigning project:', error);
    res.status(500).json({ error: 'Hiba történt a projekt hozzárendelésekor.' });
  }
});

// Felhasználó eltávolítása a projekttől (POST)
app.post('/admin/projects/:projectId/remove-user/:userId', isAdmin, async (req, res) => {
  const { projectId, userId } = req.params;

  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).send('Projekt nem található');
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).send('Felhasználó nem található');
    }

    const userProjectResult = await pool.query(
      'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );
    if (userProjectResult.rows.length === 0) {
      return res.status(404).send('Felhasználó nincs hozzárendelve ehhez a projekthez');
    }

    await pool.query(
      'DELETE FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );

    res.redirect(`/admin/projects/${projectId}`);
  } catch (error) {
    console.error('Error removing user from project:', error);
    res.status(500).send('Hiba történt a felhasználó eltávolítása során');
  }
});

// Admin: Projekt törlése
app.post('/admin/projects/delete', isAdmin, async (req, res) => {
  const { projectId } = req.body;

  try {
    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await pool.query('DELETE FROM user_projects WHERE project_id = $1', [projectId]);

    const result = await pool.query('SELECT * FROM projects');
    const updatedProjects = result.rows;

    res.render('projects', { 
      projects: updatedProjects,
      message: 'A projekt sikeresen törlésre került.' 
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).send('Hiba történt a projekt törlése során');
  }
});

// Felhasználók hozzárendelése egy projekthez
app.post('/admin/projects/:projectId/assign-users', isAdmin, async (req, res) => {
  const projectId = req.params.projectId;
  let assignedUsers = req.body.assignedUsers;
  
  if (typeof assignedUsers === 'string') {
    assignedUsers = [assignedUsers];
  } else if (!assignedUsers) {
    assignedUsers = [];
  }
  
  try {
    const existingAssignments = await pool.query(
      'SELECT user_id FROM user_projects WHERE project_id = $1',
      [projectId]
    );
    
    const existingUserIds = existingAssignments.rows.map(row => row.user_id);
    
    const newUsers = assignedUsers.filter(userId => !existingUserIds.includes(parseInt(userId)));
    
    for (const userId of newUsers) {
      await pool.query(
        'INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, projectId]
      );
    }
    
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectResult.rows[0];
    
    const assignedUsersResult = await pool.query(
      'SELECT users.id, users.username FROM users ' +
      'JOIN user_projects ON users.id = user_projects.user_id ' +
      'WHERE user_projects.project_id = $1',
      [projectId]
    );
    
    project.assignedUsers = assignedUsersResult.rows;
    
    const usersResult = await pool.query('SELECT id, username FROM users');
    const users = usersResult.rows;
    
    res.render('project-details', { 
      project, 
      users,
      message: 'Felhasználók sikeresen hozzárendelve a projekthez.'
    });
    
  } catch (error) {
    console.error('Error assigning users to project:', error);
    res.status(500).send('Hiba történt a felhasználók hozzárendelése során');
  }
});

// Felhasználó projektjeinek lekérése adatbázisból
app.get('/user/projects', isAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    const result = await pool.query(
      'SELECT projects.* FROM projects ' +
      'JOIN user_projects ON projects.id = user_projects.project_id ' +
      'WHERE user_projects.user_id = $1',
      [userId]
    );

    const userProjects = result.rows;

    if (userProjects.length === 0) {
      return res.status(404).render('user-projects', { projects: [], message: 'Nincsenek megjeleníthető projektek.' });
    }

    res.render('user-projects', { projects: userProjects });
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).send('Hiba történt a projektek lekérése során');
  }
});

// Felhasználó: projekt adatok megjelenítése adatbázisból 
app.get('/user/projects/:projectId', isAuthenticated, async (req, res) => { 
  const { projectId } = req.params;
  const userId = req.user.id;
  const isUserAdmin = req.user.is_admin;
  
  try { 
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]); 
    if (projectResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }
    
    const project = projectResult.rows[0]; 
    
    if (!isUserAdmin) {
      const assignmentResult = await pool.query( 
        'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2', 
        [userId, projectId] 
      );
      
      if (assignmentResult.rows.length === 0) {
        return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt megtekintéséhez.' }); 
      }
    }
    
    res.render('user-project-details', { project, projectId }); 
  } catch (error) { 
    console.error('Error fetching project details:', error); 
    res.status(500).send('Hiba történt a projekt adatok lekérése során');
  } 
});

// Ez a blokk biztosítja, hogy a startApplication() csak akkor hívódjon meg,
// ha a server.js a fő modul
if (require.main === module) {
    startApplication();
}

// Admin: projekt részletek lekérése a hozzárendelt felhasználókkal
app.get('/admin/projects/:projectId', isAdmin, async (req, res) => {
  const { projectId } = req.params;
  
  try {
    // Projekt alapadatainak lekérése
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    
    if (projectResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }
    
    const project = projectResult.rows[0];
    
    // Hozzárendelt felhasználók lekérése
    const assignedUsersResult = await pool.query(
      'SELECT users.id, users.username FROM users ' +
      'JOIN user_projects ON users.id = user_projects.user_id ' +
      'WHERE user_projects.project_id = $1',
      [projectId]
    );
    
    project.assignedUsers = assignedUsersResult.rows;
    
    // Összes felhasználó lekérése a kiválasztó mezőhöz
    const usersResult = await pool.query('SELECT id, username FROM users');
    const users = usersResult.rows;
    
    // Projekt adatok, hozzárendelt felhasználók és összes felhasználó átadása a sablonnak
    res.render('project-details', { project, users });
    
  } catch (error) {
    console.error('Error fetching project details:', error);
    res.status(500).render('error', { message: 'Hiba történt a projekt adatok lekérése során' });
  }
});

// Jelszó frissítése
app.post('/update-password', isAuthenticated, async (req, res) => {
  const { newPassword, confirmPassword } = req.body;

  // Ellenőrizzük, hogy a két jelszó megegyezik-e
  if (newPassword !== confirmPassword) {
    return res.send("A két jelszó nem egyezik.");
  }

  try {
    // Hash-eljük az új jelszót
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Frissítjük a felhasználó jelszavát az adatbázisban
    const userId = req.user.id;
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING *',
      [hashedPassword, userId]
    );

    if (result.rows.length === 0) {
      return res.send("Felhasználó nem található.");
    }

    // Sikeres jelszófrissítés
    res.send("Jelszó sikeresen frissítve.");
  } catch (err) {
    console.error("Hiba történt a jelszó módosításakor:", err);
    res.send("Hiba történt a jelszó módosításakor.");
  }
});

// Profil oldal megjelenítése
app.get('/profile', isAuthenticated, async (req, res) => {
    try {
        // 1. Lekérjük a felhasználói adatokat az adatbázisból (Knex-szel)
        const user = await knex('users').where({ id: req.user.id }).first();

        if (!user) {
            return res.status(404).render('error', { message: 'Felhasználó nem található.' });
        }

        // 2. Lekérjük a felhasználó saját időbejegyzéseit (time_entries)
        // Csatlakozunk a 'projects' táblához, hogy lekérjük a projekt nevét is
        const timeEntries = await knex('time_entries')
            .leftJoin('projects', 'time_entries.project_id', 'projects.id') // LEFT JOIN, mert project_id lehet NULL
            .where('time_entries.user_id', req.user.id)
            .select(
                'time_entries.id',
                'time_entries.entry_date',
                'time_entries.hours_worked',
                'time_entries.entry_type',
                'time_entries.notes',
                'projects.name as project_name' // Lekérjük a projekt nevét
            )
            .orderBy('time_entries.entry_date', 'desc'); // Rendezés dátum szerint, legújabb elöl

        // 3. Lekérjük a felhasználó saját beosztásait (appointments)
        const appointments = await knex('appointments')
            .where({ user_id: req.user.id })
            .select('*')
            .orderBy('start_time', 'asc'); // Rendezés kezdő idő szerint

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
    if (err) { return res.send('Kijelentkezési hiba'); } // Ha hiba van, hibaüzenet küldése
    res.redirect('/login'); // Kijelentkezés után irány a login oldal
  });
});

const projectsFilePath = './projects.json';
let projectsAll = [];

// Induláskor töltsd be a projekteket
async function loadProjects() {
  try {
    const result = await pool.query('SELECT * FROM projects');
    projectsAll.push(...result.rows); // A projekteket hozzáadjuk a projektek tömbjéhez
  } catch (err) {
    console.error('Hiba a projektek betöltésekor:', err);
  }
}

// Betöltés az alkalmazás indításakor
loadProjects();

// Middleware az adminisztrációs jogosultság ellenőrzésére
async function isAdmin(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    if (!user || !user.is_admin) {
      return res.status(403).send('Nincs jogosultsága az oldal megtekintéséhez.');
    }

    return next();
  } catch (err) {
    console.error('Hiba az admin ellenőrzésénél:', err);
    res.status(500).redirect('/login');
  }
}

// Projektek megjelenítése
app.get('/admin/projects', isAdmin, async (req, res) => {
  try {
    // Lekérjük a projekteket és felhasználókat az adatbázisból
    const projectsResult = await pool.query('SELECT * FROM projects');
    const usersResult = await pool.query('SELECT * FROM users');

    const projects = projectsResult.rows;
    const users = usersResult.rows;

    res.render('projects', { projects, users }); // Mindkét adat átadása a sablonnak
  } catch (err) {
    console.error('Hiba a projektek megjelenítésekor:', err);
    res.status(500).send('Hiba történt a projektek betöltésekor.');
  }
});

// Admin: Projekt adatai, projektre kattintáskor
app.get('/admin/projects/:id', isAdmin, async (req, res) => {
  const projectId = req.params.id;
  try {
    // Lekérjük a projekt adatokat az adatbázisból
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectResult.rows[0];
    if (!project) {
      return res.status(404).send('Projekt nem található');
    }

    // Lekérjük a projekthez rendelt felhasználókat
    const assignedUsersResult = await pool.query(
      `SELECT u.id, u.username 
       FROM users u
       INNER JOIN user_projects up ON u.id = up.user_id
       WHERE up.project_id = $1`,
      [projectId]
    );
    const assignedUsers = assignedUsersResult.rows;

    // Lekérjük az összes felhasználót az adatbázisból
    const usersResult = await pool.query('SELECT * FROM users');
    const users = usersResult.rows;

    // Hozzárendeljük a felhasználókat a projekt objektumhoz
    project.assignedUsers = assignedUsers;

    res.render('project-details', { project, users }); // Adatok átadása az EJS-nek
  } catch (err) {
    console.error('Hiba a projekt adatai lekérésénél:', err);
    res.status(500).send('Hiba történt a projekt adatainak lekérésekor.');
  }
});

// Admin: Projekt szerkesztése
app.get('/admin/projects/edit/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    // Lekérjük a projektet az adatbázisból
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const project = projectResult.rows[0];

    if (!project) {
      return res.status(404).send('Projekt nem található');
    }

    res.render('edit-project', { project });
  } catch (err) {
    console.error('Hiba a projekt szerkesztésekor:', err);
    res.status(500).send('Hiba történt a projekt szerkesztésekor.');
  }
});

// Admin: Projekt szerkesztése (mentés)
app.post('/admin/projects/edit/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, description, status } = req.body;
  
  try {
    // Lekérjük a projektet az adatbázisból
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const project = projectResult.rows[0];

    if (!project) {
      return res.status(404).send('Projekt nem található');
    }

    // Projektadatok módosítása
    await pool.query('UPDATE projects SET name = $1, description = $2, status = $3 WHERE id = $4', [name, description, status, id]);

    res.redirect('/admin/projects'); // Visszairányítás a projektek listájára
  } catch (err) {
    console.error('Hiba a projekt módosításakor:', err);
    res.status(500).send('Hiba történt a projekt módosításakor!');
  }
});

// Felhasználó: Projekt szerkesztése
app.get('/user/projects/edit/:projectId', isAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;

  try {
    // Ellenőrizzük, hogy a projekt létezik-e és a felhasználóhoz van-e rendelve
    const projectResult = await pool.query(
      'SELECT * FROM projects WHERE id = $1', 
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }

    const project = projectResult.rows[0];

    // Ellenőrizzük, hogy a projekt hozzá van-e rendelve a felhasználóhoz
    const assignmentResult = await pool.query(
      'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt szerkesztéséhez.' });
    }

    // A projekt adatainak átadása az EJS sablonnak
    res.render('user-edit-project', { project, projectId });
  } catch (error) {
    console.error('Error fetching project details for editing:', error);
    res.status(500).send('Hiba történt a projekt adatok lekérése során');
  }
});

// Felhasználó: Projekt szerkesztésének mentése
app.post('/user/projects/edit/:projectId', isAuthenticated, async (req, res) => {
  const { projectId } = req.params;
  const userId = req.user.id;
  const { name, description, status } = req.body;
  
  try {
    // Ellenőrizzük, hogy a projekt hozzá van-e rendelve a felhasználóhoz
    const assignmentResult = await pool.query(
      'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt szerkesztéséhez.' });
    }

    // Projektadatok módosítása
    await pool.query(
      'UPDATE projects SET name = $1, description = $2, status = $3 WHERE id = $4', 
      [name, description, status, projectId]
    );

    res.redirect(`/user/projects/${projectId}`); // Visszairányítás a projekt részleteihez
  } catch (err) {
    console.error('Hiba a projekt módosításakor:', err);
    res.status(500).send('Hiba történt a projekt módosításakor!');
  }
});

// Admin: Felhasználók megjelenítése
app.get('/admin/users', isAdmin, async (req, res) => {
  try {
    // Felhasználók lekérdezése az adatbázisból
    const usersResult = await pool.query('SELECT * FROM users');
    const users = usersResult.rows;

    // Felhasználókhoz tartozó projektek lekérdezése
    const userProjectsResult = await pool.query(`
      SELECT u.id AS user_id, u.username, u.is_admin, p.id AS project_id, p.name AS project_name
      FROM users u
      LEFT JOIN user_projects up ON u.id = up.user_id
      LEFT JOIN projects p ON up.project_id = p.id
    `);

    // Felhasználók összekapcsolása a projektekkel
    const usersWithProjects = users.map(user => {
      const projects = userProjectsResult.rows
        .filter(row => row.user_id === user.id)
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

