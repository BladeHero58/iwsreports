const express = require('express');
const router = express.Router();
const path = require('path');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const pool = require('./db');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');

const app = express();
 // A szerver portja
const port = 3000;

const reportRoutes = require('./reports'); // Betöltjük a reports.js fájlt

// Middleware beállítások
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

//statikus fájlkiszolgálás
app.use(express.static(path.join(__dirname, 'public')));
app.use('/reports', reportRoutes); // Összekapcsolva a reports.js-sel. A middlewear után helyezkedik el a kódban.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  next();
});

// Express-session kezelés
app.use(
  session({
    secret: require('crypto').randomBytes(64).toString('hex'),
    resave: false,
    saveUninitialized: false,
  })
);

let admins = [];
pool.query('SELECT * FROM users WHERE is_admin = TRUE', (err, result) => {
  if (err) {
    console.error('Error fetching admins:', err);
  } else {
    admins = result.rows;
  }
});

let projects = [];
pool.query('SELECT * FROM projects', (err, result) => {
  if (err) {
    console.error('Error fetching projects:', err);
  } else {
    projects = result.rows;
  }
});

// Passport inicializálása
app.use(passport.initialize());
app.use(passport.session());

// Felhasználók betöltése (JSON fájlból)
let users = [];
pool.query('SELECT * FROM users', (err, result) => {
  if (err) {
    console.error('Error fetching users:', err);
  } else {
    users = result.rows;
  }
});

// Passport stratégia
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Felhasználó keresése az adatbázisban
      const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
      const user = result.rows[0];

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

//Admin hozzáadása
app.post('/add-admin', (req, res) => {
  const { username, password, email } = req.body;  // Email mező hozzáadása

  bcrypt.hash(password, 10, async (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ message: 'Hiba történt a jelszó hash-elésekor' });
    }

    try {
      // Admin felhasználó hozzáadása az adatbázishoz
      const result = await pool.query(
        'INSERT INTO users (username, password, email, is_admin) VALUES ($1, $2, $3, TRUE) RETURNING *',
        [username, hashedPassword, email]  // Az email mezőt is hozzáadjuk
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
    // Új felhasználó hozzáadása az adatbázishoz
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

// login
app.post(
  '/login',
  (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: 'A felhasználónév és jelszó páros nem megfelelő.' });
      }
      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }
        return next(); // Sikeres hitelesítés, folytatjuk a következő middleware-rel
      });
    })(req, res, next);
  },
  async (req, res) => {
    try {
      // A bejelentkezett felhasználó adatainak ellenőrzése
      const user = req.user; // A felhasználói adatokat a passport biztosítja

      // Ellenőrizzük, hogy admin-e a felhasználó az adatbázis alapján
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
      const currentUser = result.rows[0];

      if (currentUser.is_admin) {
        res.redirect('/admin-dashboard'); // Adminokat az admin dashboardra irányítjuk
      } else {
        res.redirect('/dashboard'); // Normál felhasználók a sima dashboardra kerülnek
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      res.status(500).json({ message: 'Hiba történt a jogosultságok ellenőrzése során.' });
    }
  }
);

// Alapértelmezett útvonal (login oldal)
app.get('/', (req, res, next) => {
  res.render('login', (err, html) => {
    if (err) {
      console.error(err);
      return next(err); // Hibakezelőnek adja át a hibát
    }
    res.send(html);
  });
});

// Login oldal megjelenítése
app.get('/login', (req, res) => {
  res.render('login'); // login.ejs fájl renderelése
});

// Regisztrációs oldal megjelenítése
app.get('/register', (req, res) => {
  res.render('register'); // register.ejs fájl renderelése
});

// Admin jogosultságok ellenőrzése
async function isAdmin(req, res, next) {
  if (req.isAuthenticated()) {
    try {
      // A bejelentkezett felhasználó adatainak ellenőrzése az adatbázisból
      const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      const currentUser = result.rows[0];

      // Ellenőrizzük, hogy admin-e a felhasználó
      if (currentUser && currentUser.is_admin) {
        return next();
      } else {
        return res.redirect('/login'); // Admin jogosultságok hiányában irány a login oldal
      }
    } catch (error) {
      console.error('Error checking admin status:', error);
      return res.redirect('/login'); // Hiba esetén irány a login oldal
    }
  } else {
    return res.redirect('/login'); // Ha nincs bejelentkezve, irány a login oldal
  }
}
  
  // Dashboard oldal megjelenítése normál felhasználóknak
app.get('/dashboard', (req, res) => {
  if (!req.isAuthenticated() || req.user.isAdmin) {
    return res.redirect('/login'); // Ha nincs bejelentkezve, vagy admin, irány a login
  }
  res.render('dashboard', { user: req.user }); // Átadjuk a felhasználó adatokat a dashboard.ejs-nek
});
  
// Admin dashboard oldal megjelenítése
app.get('/admin-dashboard', isAdmin, (req, res) => {
 // A bejelentkezett felhasználó adatai
 const user = req.user;

 // Projektek adatainak biztosítása (ezek az adatok kell, hogy jöjjenek a projektekből)
 const projectsData = users.flatMap(user => user.projects || []); // Minden felhasználóhoz tartozó projektek

 // A sablon renderelése, felhasználó és projektek adataival
 res.render('admin-dashboard', {
   user: req.user, // Bejelentkezett felhasználó adatai
   projects: projects // Projektek a projects.json-ból
 });
});

// Felhasználói adatok sorosítása
passport.serializeUser((user, done) => {
  // A felhasználó 'id' mezőjét és az 'isAdmin' tulajdonságot mentjük
  done(null, { id: user.id, isAdmin: user.isAdmin });
});

// Felhasználói adatok visszanyerése
passport.deserializeUser(async (userData, done) => {
  try {
    // Az id alapján keresünk az adatbázisban
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [userData.id]);
    const user = result.rows[0];

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

// Sablon motor beállítása
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // views mappa beállítása

// Projekt hozzáadása form megjelenítése
app.get('/admin/projects/add', isAdmin, (req, res) => {
  res.render('add-project'); // Az `add-project.ejs` nevű sablon megjelenítése
});

// Admin: Új projekt hozzáadása
app.post('/admin/projects/add', isAdmin, async (req, res) => {
  const { name, description, status } = req.body;

  try {
    // Egyedi azonosító generálása
    const externalId = uuidv4();

    // Ellenőrizni, hogy létezik-e az `external_id`
    const checkResult = await pool.query('SELECT COUNT(*) FROM projects WHERE external_id = $1', [externalId]);
    if (parseInt(checkResult.rows[0].count, 10) > 0) {
      throw new Error('Az external_id már létezik. Próbálja újra.');
    }

    // Adatbázisba mentés
    const result = await pool.query(
      'INSERT INTO projects (name, description, status, external_id) VALUES ($1, $2, $3, $4) RETURNING id, name',
      [name, description, status, externalId]
    );

    const newProject = result.rows[0];
    console.log('Új projekt hozzáadva:', newProject);

    // A project_reports rekord létrehozása az új projekthez
    await pool.query(
      'INSERT INTO project_reports (user_id, created_at, updated_at, project_id, name) VALUES ($1, NOW(), NOW(), $2, $3)',
      [1, newProject.id, newProject.name] // Az alapértelmezett user_id = 1, ezt a tényleges értékekre módosíthatod
    );

    console.log('Új jegyzőkönyv rekord létrehozva a project_reports táblában.');

    res.redirect('/admin-dashboard');
  } catch (error) {
    console.error('Error adding project:', error);

    // Az egyediség megsértésének kezelése
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

  // Ellenőrizzük, hogy van-e felhasználónév és jelszó
  if (!username || !password || !confirmPassword) {
    return res.render('add-users', { 
      error: 'Minden mező kitöltése kötelező',
      username 
    });
  }

  // Ellenőrizzük, hogy a két jelszó egyezik-e
  if (password !== confirmPassword) {
    return res.render('add-users', { 
      error: 'A két jelszó nem egyezik',
      username 
    });
  }

  try {
    // Ellenőrizzük, hogy a felhasználónév egyedi-e
    const userCheck = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.render('add-users', { 
        error: 'A felhasználónév már foglalt!',
        username 
      });
    }

    // Titkosítjuk a jelszót
    const hashedPassword = await bcrypt.hash(password, 10);

    // Új felhasználó adatainak mentése az adatbázisba
    const result = await pool.query(
      'INSERT INTO users (username, password, is_admin) VALUES ($1, $2, $3) RETURNING *',
      [username, hashedPassword, isAdmin ? true : false]
    );

    // Egyszerű átirányítás az admin/users oldalra sikeres létrehozás után
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
    // Ellenőrizzük, hogy a felhasználó létezik-e
    const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'A felhasználó nem található!' });
    }
    
    // Törölni a felhasználót az adatbázisból
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    // Átirányítás a felhasználók oldalra sikeres törlés után
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
    // Ellenőrizzük, hogy létezik-e a felhasználó
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Felhasználó nem található' });
    }

    // Ellenőrizzük, hogy létezik-e a projekt
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Projekt nem található' });
    }

    // A felhasználó és projekt összekapcsolása a kapcsolótáblában
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
    // Ellenőrizzük, hogy létezik-e a projekt
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) {
      return res.status(404).send('Projekt nem található');
    }

    // Ellenőrizzük, hogy létezik-e a felhasználó
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).send('Felhasználó nem található');
    }

    // Ellenőrizzük, hogy a felhasználó hozzárendelve van-e a projekthez a user_projects táblában
    const userProjectResult = await pool.query(
      'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2',
      [userId, projectId]
    );
    if (userProjectResult.rows.length === 0) {
      return res.status(404).send('Felhasználó nincs hozzárendelve ehhez a projekthez');
    }

    // Felhasználó eltávolítása a kapcsolótáblából
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
    // Projekt törlése az 'projects' táblából
    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);

    // Felhasználói projektek törlése a 'user_projects' táblából
    await pool.query('DELETE FROM user_projects WHERE project_id = $1', [projectId]);

    // A frissített projektek betöltése és megjelenítése
    const result = await pool.query('SELECT * FROM projects');
    const updatedProjects = result.rows;

    // A projektek oldal megjelenítése a törlés után
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
  
  // Ha egy felhasználó van kiválasztva, akkor stringként érkezik
  if (typeof assignedUsers === 'string') {
    assignedUsers = [assignedUsers];
  } else if (!assignedUsers) {
    assignedUsers = [];
  }
  
  try {
    // A meglévő hozzárendelések ellenőrzése
    const existingAssignments = await pool.query(
      'SELECT user_id FROM user_projects WHERE project_id = $1',
      [projectId]
    );
    
    const existingUserIds = existingAssignments.rows.map(row => row.user_id);
    
    // Az új felhasználók azonosítása (akik még nincsenek hozzáadva)
    const newUsers = assignedUsers.filter(userId => !existingUserIds.includes(parseInt(userId)));
    
    // Csak az új felhasználókat adjuk hozzá, a meglévőket nem bántjuk
    for (const userId of newUsers) {
      await pool.query(
        'INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, projectId]
      );
    }
    
    // A projekt adatok újbóli lekérése a frissített adatokkal
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const project = projectResult.rows[0];
    
    // Hozzárendelt felhasználók lekérése
    const assignedUsersResult = await pool.query(
      'SELECT users.id, users.username FROM users ' +
      'JOIN user_projects ON users.id = user_projects.user_id ' +
      'WHERE user_projects.project_id = $1',
      [projectId]
    );
    
    project.assignedUsers = assignedUsersResult.rows;
    
    // Összes felhasználó lekérése
    const usersResult = await pool.query('SELECT id, username FROM users');
    const users = usersResult.rows;
    
    // Oldal renderelése az frissített adatokkal
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

//Felhasználó projektek megjelenítéséhez autentikáció
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next(); // Folytatjuk a következő middleware-t vagy route kezelőt
  }
  res.redirect('/login'); // Ha nincs bejelentkezve, irányítjuk a bejelentkező oldalra
}

// Felhasználó projektjeinek lekérése adatbázisból
app.get('/user/projects', isAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    // Lekérjük a felhasználóhoz tartozó projekteket
    const result = await pool.query(
      'SELECT projects.* FROM projects ' +
      'JOIN user_projects ON projects.id = user_projects.project_id ' +
      'WHERE user_projects.user_id = $1',
      [userId]
    );

    const userProjects = result.rows;

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

// Felhasználó: projekt adatok megjelenítése adatbázisból 
app.get('/user/projects/:projectId', isAuthenticated, async (req, res) => { 
  const { projectId } = req.params;
  const userId = req.user.id;
  const isUserAdmin = req.user.is_admin; // Feltételezve, hogy a felhasználó objektum tartalmazza az admin jogosultságot
  
  try { 
    // Ellenőrizzük, hogy a projekt létezik-e 
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]); 
    if (projectResult.rows.length === 0) {
      return res.status(404).render('error', { message: 'Projekt nem található.' });
    }
    
    const project = projectResult.rows[0]; 
    
    // Ha a felhasználó nem admin, ellenőrizzük, hogy a projekt hozzá van-e rendelve
    if (!isUserAdmin) {
      const assignmentResult = await pool.query( 
        'SELECT * FROM user_projects WHERE user_id = $1 AND project_id = $2', 
        [userId, projectId] 
      );
      
      if (assignmentResult.rows.length === 0) {
        return res.status(403).render('error', { message: 'Nincs jogosultsága a projekt megtekintéséhez.' }); 
      }
    }
    
    // A projekt adatainak és projectId átadása az EJS sablonnak
    res.render('user-project-details', { project, projectId }); 
  } catch (error) { 
    console.error('Error fetching project details:', error); 
    res.status(500).send('Hiba történt a projekt adatok lekérése során');
  } 
});

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
    // Lekérjük a felhasználói adatokat az adatbázisból
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).render('error', { message: 'Felhasználó nem található.' });
    }

    // Ha be van jelentkezve, rendereljük a profile.ejs oldalt, és átadjuk a felhasználói adatokat
    res.render('profile', { user });
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

// Szerver indítása
app.listen(port, () => {
    console.log(`Szerver fut a http://localhost:${port} címen`);
  });