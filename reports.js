const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');
const path = require('path');
const mime = require('mime-types');


// PostgreSQL konfiguráció
/*
const pool = new Pool({
    user: 'postgres', // PostgreSQL felhasználónév
    host: 'localhost',     // Ha helyi gépen fut, ez marad
    database: 'project_management', // adatbázis neve
    password: 'dbzzed58', // Az adatbázishoz tartozó jelszó
    port: 5432,            // PostgreSQL alapértelmezett portja
});
*/

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  });
  
  module.exports = pool;

const router = express.Router(); 

// Middleware a form adatok feldolgozására
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Multer konfiguráció memória tárolással
const upload = multer({ 
    storage: multer.memoryStorage()
});

// Képtömörítő funkció
async function compressImage(inputPath, outputPath) {
    try {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`A bemeneti fájl (${inputPath}) nem létezik!`);
        }

        // Ellenőrizzük a kimeneti mappa létrehozását
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Tömörítés és formátumkezelés
        await sharp(inputPath)
            .resize({ 
                width: 1024, 
                height: 1024, 
                fit: 'inside', 
                withoutEnlargement: true 
            })
            .toFormat('jpeg', { 
                quality: 80,
                mozjpeg: true 
            })
            .toFile(outputPath);

    } catch (error) {
        console.error('TÖMÖRÍTÉSI HIBA:', error);
        throw new Error(`A kép feldolgozása sikertelen: ${error.message}`);
    }
}

// Kép feltöltés és tömörítés endpoint
router.post('/upload', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nincs fájl feltöltve' });
        }

        const projectId = req.body.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: 'Project ID hiányzik' });
        }

        // Mappa létrehozása, ha nem létezik
        const uploadDir = path.join(process.cwd(), 'uploads', `project-${projectId}`);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Kép feldolgozása és mentése a megfelelő helyre
        const outputFilename = `compressed_${Date.now()}_${req.file.originalname}`;
        const outputPath = path.join(uploadDir, outputFilename);

        // Képfeldolgozás közvetlenül a buffer-ből
        await sharp(req.file.buffer)
            .resize(800)
            .toFile(outputPath);

        // Válasz összeállítása
        const publicUrl = `/uploads/project-${projectId}/${outputFilename}`;
        res.json({
            success: true,
            url: publicUrl,
            metadata: await sharp(outputPath).metadata()
        });

    } catch (err) {
        console.error('VÉGLEGES HIBA:', err);
        res.status(500).json({ success: false, message: 'Szerver hiba', error: err.message });
    }
});

// Nem használt képek törlése függvény (a router definíció előtt vagy után)
async function cleanupUnusedImages(projectId, usedImageUrls) {
    try {
      // A projekt mappájának elérési útja
      const projectDir = path.resolve(process.cwd(), 'uploads', `project-${projectId}`);
      
      // Ellenőrizzük, hogy létezik-e a mappa
      if (!fs.existsSync(projectDir)) {
        console.log(`A project-${projectId} mappa nem létezik, nincs mit takarítani.`);
        return;
      }
      
      // Az összes fájl listázása a mappában
      const files = fs.readdirSync(projectDir);
      
      // Képfájlok kiszűrése (jpg, jpeg, png kiterjesztések)
      const imageFiles = files.filter(file => 
        /\.(jpg|jpeg|png)$/i.test(file)
      );
      
      // Konvertáljuk a használt URL-eket fájlnevekké
      const usedFileNames = usedImageUrls.map(url => 
        url.replace(`/uploads/project-${projectId}/`, '')
      );
      
      // Nem használt képek meghatározása
      const unusedFiles = imageFiles.filter(file => 
        !usedFileNames.includes(file)
      );
      
      // Nem használt képek törlése
      for (const file of unusedFiles) {
        const filePath = path.join(projectDir, file);
        fs.unlinkSync(filePath);
        console.log(`Nem használt kép törölve: ${filePath}`);
      }
      
      console.log(`Takarítás kész: ${unusedFiles.length} nem használt kép törölve a project-${projectId} mappából.`);
    } catch (error) {
      console.error('Hiba a nem használt képek tisztításakor:', error);
    }
  }

// Kép törlésének endpointja
router.post('/delete-image', async (req, res) => {
    try {
        const imageUrl = req.body.imageUrl;  // A kép URL-jét várjuk
        const imagePath = path.join(__dirname, 'uploads', imageUrl.replace('/uploads/', ''));

        // Ellenőrizzük, hogy létezik-e a fájl
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);  // A fájl törlése
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, message: 'A fájl nem található' });
        }
    } catch (err) {
        console.error('Hiba a fájl törlésekor:', err);
        res.status(500).json({ success: false, message: 'Szerver hiba' });
    }
});

// xlsx fájl beolvasása
function generateExcelFile(data) {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ws = XLSX.utils.json_to_sheet(data); // A JSON-t táblázattá alakítja
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const filePath = path.join(uploadsDir, 'project_table.xlsx');
    XLSX.writeFile(wb, filePath);
    console.log('Fájl generálva:', filePath);
    return filePath;
}

// GET: Projekt legfrissebb jelentésének lekérése (módosított verzió)
router.get('/:projectId/report', async (req, res) => {
    const { projectId } = req.params;

    try {
        const result = await pool.query(
            'SELECT * FROM project_reports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
            [projectId]
        );

        if (result.rows.length > 0) {
            const filePath = result.rows[0].file_path;

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, message: "Fájl nem található." });
            }

            const workbook = XLSX.readFile(filePath);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            // Egyesített cellák kinyerése
            const mergeCells = (worksheet['!merges'] || []).map(merge => ({
                row: merge.s.r,
                col: merge.s.c,
                rowspan: merge.e.r - merge.s.r + 1,
                colspan: merge.e.c - merge.s.c + 1
            }));

            let colWidths = [];
            let rowHeights = [];

            try {
                if (result.rows[0].column_sizes) {
                    const cleanColumnSizes = result.rows[0].column_sizes.trim();
                    colWidths = JSON.parse(cleanColumnSizes);
                }
            } catch (e) {
                console.error('Hiba az oszlopszélességek parse-olásakor:', e);
                console.error('Problémás adat:', result.rows[0].column_sizes);
                colWidths = Array(jsonData[0].length).fill(100); // Alapértelmezett szélesség
            }

            try {
                if (result.rows[0].row_sizes) {
                    const cleanRowSizes = result.rows[0].row_sizes.trim();
                    rowHeights = JSON.parse(cleanRowSizes);
                }
            } catch (e) {
                console.error('Hiba a sormagasságok parse-olásakor:', e);
                console.error('Problémás adat:', result.rows[0].row_sizes);
                rowHeights = Array(jsonData.length).fill(24); // Alapértelmezett magasság
            }

            // Cellstílusok kinyerése az adatbázisból - RÉSZLETESEN ELLENŐRZVE ÉS JAVÍTVA
            let cellStyles = [];
            let debug = {
                hasRawCellStyles: false,
                rawCellStylesLength: 0,
                cellStylesLength: 0,
                cellStylesIsArray: false,
                rawCellStylesType: null,
                parseError: null
            };

            if (result.rows.length > 0 && result.rows[0].cell_styles) {
                debug.hasRawCellStyles = true;
                debug.rawCellStylesLength = JSON.stringify(result.rows[0].cell_styles).length;
                debug.rawCellStylesType = typeof result.rows[0].cell_styles;

                try {
                    let rawCellStyles = result.rows[0].cell_styles;

                    if (typeof rawCellStyles !== 'string') {
                        rawCellStyles = JSON.stringify(rawCellStyles);
                    }

                    const cleanCellStyles = rawCellStyles.trim();
                    cellStyles = JSON.parse(cleanCellStyles);

                    debug.cellStylesLength = cellStyles.length;
                    debug.cellStylesIsArray = Array.isArray(cellStyles);

                    cellStyles = cellStyles.map(style => ({
                        ...style,
                        rotation: style.rotation !== undefined ? style.rotation : 0
                    }));
                } catch (e) {
                    console.error('Hiba a cellastílusok parse-olásakor:', e);
                    console.error('Problémás adat:', result.rows[0].cell_styles);
                    console.error('Hiba részletei:', e.message);

                    debug.parseError = e.message;

                    try {
                        console.error("Első 100 karakter:", result.rows[0].cell_styles.slice(0, 100));
                    } catch (e2) {
                        console.error("Nem sikerült kiírni az első 100 karaktert sem:", e2);
                    }

                    cellStyles = [];
                }
            }

            // Alapértelmezett értékek beállítása, ha szükséges
            colWidths = Array.isArray(colWidths) ? colWidths : Array(jsonData[0].length).fill(100);
            rowHeights = Array.isArray(rowHeights) ? rowHeights : Array(jsonData.length).fill(24);

            // Válasz küldése bővített debug információkkal
            res.json({
                success: true,
                data: jsonData.slice(1),
                mergeCells,
                colWidths,
                rowHeights,
                cellStyles,
                debug: debug
            });
        } else {
            res.json({ success: false, message: "Nincs elérhető jegyzőkönyv ehhez a projekthez." });
        }
    } catch (error) {
        console.error("Hiba a jelentés lekérésekor:", error);
        res.status(500).json({ success: false, message: "Adatbázis hiba történt." });
    }
});

//jelentés mentése route
router.post("/save", async (req, res) => {
    const { projectId, data, mergeCells, columnSizes, rowSizes, cellStyles } = req.body;

    if (!data || !projectId) {
        return res.status(400).json({ success: false, message: "Hiányzó adatok." });
    }

    try {
        // Új rész: korábbi projekt jelentések törlése az adatbázisból
        const oldReports = await pool.query(
            'SELECT file_path FROM project_reports WHERE project_id = $1',
            [projectId]
        );
        
        // Töröljük a régi jelentéseket a fájlrendszerből
        for (const report of oldReports.rows) {
            try {
                if (report.file_path && fs.existsSync(report.file_path)) {
                    fs.unlinkSync(report.file_path);
                }
            } catch (deleteError) {
                console.error("Hiba a régi jelentés fájl törlésekor:", deleteError);
                // Folytassuk a törlést akkor is, ha egy fájl törlése sikertelen
            }
        }
        
        // Töröljük a régi jelentéseket az adatbázisból
        await pool.query(
            'DELETE FROM project_reports WHERE project_id = $1',
            [projectId]
        );
        
        // Az eredeti kód folytatása
        const projectDir = path.resolve(process.cwd(), 'uploads', `project-${projectId}`);
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // 1. Összegyűjtjük a táblázatban használt összes kép URL-jét
        const usedImageUrls = [];
        
        // Végigmegyünk a táblázat celláin
        if (Array.isArray(data)) {
            data.forEach(row => {
                if (Array.isArray(row)) {
                    row.forEach(cell => {
                        // Ha a cella tartalmaz képre utaló URL-t
                        if (typeof cell === 'string' && cell.includes('/uploads/project-')) {
                            usedImageUrls.push(cell);
                        }
                    });
                }
            });
        }

        // Régi fájlok törlése
        fs.readdirSync(projectDir).forEach((file) => {
            if (file.endsWith('.xlsx')) {
                const filePath = path.join(projectDir, file);
                fs.unlinkSync(filePath);
            }
        });

        const fileName = `report-${Date.now()}.xlsx`;
        const filePath = path.join(projectDir, fileName);

        const workbook = XLSX.utils.book_new();

        // 1. Excel fejlécek és adatok előkészítése
        const headers = new Set();
        data.forEach(row => {
            row.forEach((_, index) => {
                headers.add(`Column${index + 1}`);
            });
        });

        const worksheetData = [Array.from(headers)];

        // 2. Képek kezelése és adatkonverzió
        data.forEach(row => {
            const processedRow = [];
            row.forEach((cell, index) => {
                if (typeof cell === 'string' && cell.startsWith('data:image')) {
                    const imageBuffer = Buffer.from(
                        cell.split(';base64,').pop(),
                        'base64'
                    );
                    const imageFileName = `image-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
                    const imagePath = path.join(projectDir, imageFileName);

                    fs.writeFileSync(imagePath, imageBuffer);
                    const imageUrl = `/uploads/project-${projectId}/${imageFileName}`;
                    processedRow[index] = imageUrl;
                    
                    // Az új képet is felvesszük a használt képek listájába
                    usedImageUrls.push(imageUrl);
                } else {
                    processedRow[index] = cell;
                }
            });
            worksheetData.push(processedRow);
        });

        // 3. Munkalap létrehozása
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

        // 4. Egyesített cellák hozzáadása
        if (mergeCells && mergeCells.length > 0) {
            worksheet['!merges'] = mergeCells.map(mc => ({
                s: {
                    r: mc.row,
                    c: mc.col
                },
                e: {
                    r: mc.row + mc.rowspan - 1,
                    c: mc.col + mc.colspan - 1
                }
            }));
        }

        // 5. Excel stílusok hozzáadása
        if (cellStyles && cellStyles.length > 0) {
            // Excel stílus információk inicializálása
            worksheet['!styles'] = {};

            cellStyles.forEach(style => {
                const cellRef = XLSX.utils.encode_cell({
                    r: style.row,
                    c: style.col
                });
                worksheet['!styles'][cellRef] = {
                    backgroundColor: style.backgroundColor,
                    color: style.color,
                    fontWeight: style.fontWeight,
                    fontSize: style.fontSize,
                    textAlign: style.textAlign,
                    borderColor: style.borderColor,
                    className: style.className
                };
            });
        }

        // 6. Oszlop és sor méretek beállítása
        worksheet['!cols'] = columnSizes.map(width => ({
            wpx: width
        }));
        worksheet['!rows'] = rowSizes.map(height => ({
            hpx: height
        }));

        // 7. Excel fájl mentése
        XLSX.utils.book_append_sheet(workbook, worksheet, "Report");

        // Cellastílusok hozzáadása a mentett Excelhez, beleértve a forgatást is
        if (cellStyles && cellStyles.length > 0 && worksheet['!styles']) {
            cellStyles.forEach(style => {
                const cellRef = XLSX.utils.encode_cell({ r: style.row, c: style.col });
                if (worksheet['!styles'][cellRef]) {
                    worksheet['!styles'][cellRef] = {
                        ...worksheet['!styles'][cellRef],
                        rotation: style.rotation
                    };
                } else {
                    worksheet['!styles'][cellRef] = { rotation: style.rotation };
                }
            });
        }

        XLSX.writeFile(workbook, filePath);

        // 8. Adatbázis frissítése
        const cleanColumnSizes = columnSizes?.filter(size => size && !isNaN(size)) || [];
        const cleanRowSizes = rowSizes?.filter(size => size && !isNaN(size)) || [];

        // A mentés előtt alakítsuk át megfelelő formátumra
        const columnSizesJson = JSON.stringify(columnSizes || []);
        const rowSizesJson = JSON.stringify(rowSizes || []);

        await pool.query(
            'INSERT INTO project_reports (project_id, file_path, column_sizes, row_sizes, cell_styles) VALUES ($1, $2, $3, $4, $5)', [
                projectId,
                filePath,
                columnSizesJson,
                rowSizesJson,
                cellStyles ? JSON.stringify(cellStyles) : null
            ]
        );

        // 9. A nem használt képek törlése
        await cleanupUnusedImages(projectId, usedImageUrls);

        res.json({
            success: true,
            filePath
        });
    } catch (error) {
        console.error("Hiba a jegyzőkönyv mentésekor:", error);
        res.status(500).json({
            success: false,
            message: "Hiba történt a mentés során.",
            error: error.message
        });
    }
});

//Szankciós táblázat route
router.get('/fine-list', (req, res) => {
    res.render('fine-list', { title: 'MVM Xpert szankciós lista' });
});

// xlsx fájl generálás
function generateExcelFile(data) {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const ws = XLSX.utils.json_to_sheet(data); // A JSON-t táblázattá alakítja
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const filePath = path.join(uploadsDir, 'project_table.xlsx');
    XLSX.writeFile(wb, filePath);
    console.log('Fájl generálva:', filePath);
    return filePath;
}

// .xlsx letöltési route
router.get('/:projectId/download', async (req, res) => {
    const { projectId } = req.params;

    try {
        // Adatok lekérdezése az adatbázisból
        const result = await pool.query(
            'SELECT * FROM project_reports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
            [projectId]
        );

        if (result.rows.length > 0) {
            const filePath = result.rows[0].file_path;

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ success: false, message: "Fájl nem található." });
            }

            const workbook = XLSX.readFile(filePath);
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            // XLSX fájl generálása a legfrissebb adatból
            const excelFilePath = generateExcelFile(jsonData);

            // Fájl letöltése
            res.download(excelFilePath, 'project_report.xlsx', (err) => {
                if (err) {
                    console.error('Hiba a letöltés során:', err);
                    res.status(500).send('Hiba a letöltés közben.');
                }
            });
        } else {
            res.status(404).json({ success: false, message: "Nincs elérhető jegyzőkönyv ehhez a projekthez." });
        }
    } catch (error) {
        console.error("Hiba a jelentés letöltésekor:", error);
        res.status(500).json({ success: false, message: "Adatbázis hiba történt." });
    }
});

// HTML escape függvény
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

//pdf generálás
router.get('/:projectId/download-pdf', async (req, res) => {
    const { projectId } = req.params;

    try {
        // Először lekérdezzük a projekt nevét
        const projectResult = await pool.query(
            'SELECT name FROM projects WHERE id = $1',
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).send('A projekt nem található.');
        }

        const projectName = projectResult.rows[0].name;
        // Tisztítjuk a projekt nevét, hogy fájlnévként használható legyen
        // Csak a fájlrendszerben tiltott karaktereket cseréljük ki
        const invalidFileChars = /[\/\\?%*:|"<>]/g;
        const safeProjectName = projectName.replace(invalidFileChars, '_');

        const result = await pool.query(
            'SELECT * FROM project_reports WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
            [projectId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('Nincs elérhető jelentés ehhez a projekthez.');
        }

        const reportData = result.rows[0];
        const workbook = XLSX.readFile(reportData.file_path);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            raw: false,
            defval: '',
            header: 1
        }).slice(1);

        const safeParse = (data, defaultValue = []) => {
            if (!data) return defaultValue;
            if (typeof data === 'object') return data;
            try {
                return JSON.parse(data);
            } catch (e) {
                console.warn('Parse error:', e);
                return defaultValue;
            }
        };

        const columnSizes = safeParse(reportData.column_sizes);
        const rowSizes = safeParse(reportData.row_sizes);
        const cellStyles = safeParse(reportData.cell_styles);
        const mergedCells = worksheet['!merges'] || [];

        // Generate HTML with enhanced styling
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
    @page {
        size: A4 portrait;
        margin: 10mm;
    }
    body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
    }
    table {
        border-collapse: separate !important;
        border-spacing: 0 !important;
        width: 100%;
        table-layout: fixed;
        border: 3px solid #000 !important;
        font-size: 0.85em;
        max-width: 100%;
    }
    td {
        position: relative;
        box-sizing: border-box;
        overflow: hidden;
        word-wrap: break-word;
        border: 1.5px solid #000 !important;
        /* Kombinált határvonal a cella körül a jobb láthatóságért */
        outline: 0.5px solid #000 !important;
        box-shadow: inset 0 0 0 1px #000 !important;
    }
    /* Fekete cellák sárga határvonala - kiemelt hangsúllyal */
    .black-cell, td[style*="background-color: black"], td[style*="background-color: #000000"] {
        background-color: black !important;
        color: yellow !important;
        border: 3px solid yellow !important;
        outline: 2px solid yellow !important;
        box-shadow: 0 0 0 1px yellow, inset 0 0 0 1px yellow !important;
        position: relative !important;
        z-index: 1 !important;
        font-weight: bold !important;
    }
    /* Biztosítjuk, hogy a cella tartalma is megörökölje a színeket */
    .black-cell .cell-content, 
    td[style*="background-color: black"] .cell-content, 
    td[style*="background-color: #000000"] .cell-content {
        color: yellow !important;
        font-weight: bold !important;
    }
    .merged-cell {
        background-color: inherit;
        padding: 0;
    }
    .cell-content {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cell-content:not(:has(img)) {
        padding: 4px;
    }
    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    /* Külön stílus a #fff2cc (sáfránysárga) cellákhoz */
    .saffron-yellow-cell {
        background-color: #fff2cc !important;
        color: #000000 !important;
    }
    .saffron-yellow-cell .cell-content {
        color: #000000 !important;
    }
    /* Add custom styles from cellStyles */
    ${generateCustomStyles(cellStyles)}
    </style>
</head>
<body>
    <table>
        <colgroup>
            ${generateColgroup(columnSizes)}
        </colgroup>
        <tbody>
            ${generateTableRows(jsonData, mergedCells, rowSizes, columnSizes, cellStyles)}
        </tbody>
    </table>
</body>
</html>
        `;

        // Enhanced PDF generation settings
        const browser = await puppeteer.launch({
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
        
        const page = await browser.newPage();
        await page.setViewport({
            width: 4000, // Nagyobb szélesség
            height: 3000, // Nagyobb magasság
            deviceScaleFactor: 3.0 // Növelt felbontás a jobb láthatóságért (2.5 helyett 3.0)
        });
        
        await page.setContent(htmlContent, {
            waitUntil: ['load', 'networkidle0'],
            timeout: 60000
        });
        
        const tempDir = path.join(__dirname, 'tmp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const tempFilePath = path.join(tempDir, `project_${projectId}_report.pdf`);
        await page.pdf({
            path: tempFilePath,
            format: 'A4',
            landscape: false,
            printBackground: true,
            margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
            scale: 0.55, // Méretarány megtartása
            preferCSSPageSize: true,
            printBackground: true
        });

        await browser.close();

        // A fájlnév módosítása az új konvenciónak megfelelően
        const fileName = `IWS_Solutions_Munkavedelmi_ellenorzesi_jegyzokonyv_${safeProjectName}.pdf`;
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        fs.createReadStream(tempFilePath).pipe(res);

    } catch (error) {
        console.error('Hiba a PDF generálás során:', error);
        res.status(500).send('Hiba történt: ' + error.message);
    }
});

// Hiányzó getClassStyles függvény - frissítve
function getClassStyles(className) {
    if (!className) return '';
    
    const styleMap = {
        'black-cell': `
            background-color: black !important;
            color: yellow !important;
            border-color: yellow !important;
            outline: 2px solid yellow !important;
            box-shadow: 0 0 0 1px yellow !important;
            font-weight: bold !important;
            font-size: 16px !important;
        `,
        'yellow-row': `
            background-color: yellow !important;
        `,
        'white-row': `
            background-color: white !important;
        `,
        'htCenter': `
            text-align: center !important;
            vertical-align: middle !important;
        `,
        'first-row-style': `
            text-align: center !important;
            font-size: 22px !important;
            font-weight: bold !important;
            text-decoration: underline !important;
            vertical-align: middle !important;
        `,
        'eleventh-row-style': `
            text-align: center !important;
            vertical-align: middle !important;
        `,
        'last-row-style': `
            font-weight: bold !important;
            background-color: lightgrey !important;
            font-size: 18px !important;
            text-align: center !important;
        `
    };

    return className.split(' ')
        .map(cls => styleMap[cls] || '')
        .join('\n');
}

// Helper function to generate custom styles - módosított verzió az első sor rácsok nélkül
function generateCustomStyles(cellStyles) {
    if (!Array.isArray(cellStyles)) return '';

    let baseStyles = `
    /* Alap táblázat stílusok */
    table {
        border-collapse: collapse !important;
        width: 100% !important;
        table-layout: fixed !important;
        border: 2px solid #000 !important; /* Csökkentett külső keret */
        font-size: 0.85em !important;
        max-width: 100% !important;
    }
        /* 12. sortól lefelé középre igazítás */
    tr:nth-child(n+12) td .cell-content {
        justify-content: center !important;
        text-align: center !important;
    }
    td {
        border: 0.75px solid #000 !important; /* Vékonyabb határvonal minden cellához */
        outline: 0.25px solid #000 !important; /* Finomabb kontúr */
        box-shadow: inset 0 0 0 0.5px #000 !important; /* Finomabb belső árnyék */
        padding: 0 !important;
        position: relative !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        word-wrap: break-word !important;
        margin: 0 !important; /* Biztosítja, hogy ne legyen külső margó */
    }
    /* Első három sor cellái rácsok nélkül fehér háttérrel */
    tr:nth-child(-n+3) td {
        border: none !important; 
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
    }
    /* Fekete cellák alapértelmezett formázása - kiemelt sárga szegéllyel */
    td[style*="background-color: black"], 
    td[style*="background-color: #000000"], 
    td.black-cell {
        border: 2px solid yellow !important; /* Kicsit vékonyabb, de még látható */
        outline: 1px solid yellow !important; /* Finomabb kontúr a fekete cellákhoz */
        box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important; /* Finomabb árnyék */
        color: yellow !important;
        font-weight: bold !important;
    }
    /* Első három sor fekete cellái is rácsvonal nélkül és fehér háttérrel */
    tr:nth-child(-n+3) td.black-cell,
    tr:nth-child(-n+3) td[style*="background-color: black"],
    tr:nth-child(-n+3) td[style*="background-color: #000000"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
        color: black !important;
    }
    .merged-cell {
        border: 0.75px solid #000 !important; /* Vékonyabb határvonal az egyesített cellákhoz */
        outline: 0.25px solid #000 !important;
        box-shadow: inset 0 0 0 0.5px #000 !important;
        background-color: inherit;
        padding: 0;
    }
    /* Első három sor egyesített cellái is rácsvonal nélkül és fehér háttérrel */
    tr:nth-child(-n+3) .merged-cell {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
    }
    /* 1-6 indexű sorok balra igazítása */
    tr:nth-child(n+2):nth-child(-n+7) td .cell-content {
        justify-content: flex-start !important;
        text-align: left !important;
    }
    /* Cella tartalom alapértelmezett stílusai */
    .cell-content {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px; /* Itt adtam hozzá a padding-et */
        border: none !important;
        overflow: hidden;
        box-sizing: border-box !important;
    }
    /* Képek kezelése */
    .cell-content:has(img) {
        padding: 0;
    }
    /* Forgatott képek stílusainak javítása */
    .cell-content img {
        max-width: 100%;
        max-height: 100%;
        display: block;
    }
    /* 90/270 fokkal forgatott képek stílusa */
    .rotated-image-90,
    .rotated-image-270 {
        position: relative;
        overflow: hidden;
    }
    .rotated-image-90 img,
    .rotated-image-270 img {
        position: absolute;
        transform-origin: center center;
        width: auto !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
    }
    /* Első sor nem üres celláinak aláhúzása */
    tr:first-child td:not(.empty-cell) .cell-content:not(.empty-content) {
        text-align: center !important;
        font-size: 22px !important;
        font-weight: bold !important;
        text-decoration: underline !important;
        vertical-align: middle !important;
    }
    /* Utolsó sor stílusok */
    tr:last-child td {
        font-weight: bold !important;
        background-color: lightgrey !important;
        font-size: 18px !important;
        text-align: center !important;
        border: 1.5px solid #000 !important; /* Vékonyabb határ az utolsó sorban */
    }
    tr:last-child td .cell-content {
        font-weight: bold !important;
        text-align: center !important;
    }
    /* Utolsó 10 sor 4. oszloptól kezdve rácsvonal nélkül */
    tr:nth-last-child(-n+10) td:nth-child(n+4) {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
    }
    /* Fekete cellák speciális kezelése az utolsó 10 sor 4. oszloptól - ezekről is eltüntetjük a sárga keretet */
    tr:nth-last-child(-n+10) td:nth-child(n+4).black-cell,
    tr:nth-last-child(-n+10) td:nth-child(n+4)[style*="background-color: black"],
    tr:nth-last-child(-n+10) td:nth-child(n+4)[style*="background-color: #000000"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
    }
    /* Sárga hátterű cellák kezelése az utolsó 10 sor 4. oszloptól */
    tr:nth-last-child(-n+10) td:nth-child(n+4).saffron-yellow-cell,
    tr:nth-last-child(-n+10) td:nth-child(n+4)[style*="background-color: #fff2cc"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
    }
    /* Üres cellák */
    .empty-cell .cell-content, .empty-content {
        text-decoration: none !important;
    }
    /* Speciálisan a sárga hátterű cellákhoz */
    .saffron-yellow-cell, td[style*="background-color: #fff2cc"] {
        border: 0.5px solid #000 !important; /* Még vékonyabb határ a sárga cellákhoz */
        outline: 0.15px solid #000 !important; /* Minimális kontúr */
        box-shadow: inset 0 0 0 0.25px #000 !important; /* Nagyon finom belső árnyék */
    }
    /* Sárga hátterű cellák rácsvonal nélkül az első három sorban */
    tr:nth-child(-n+3) .saffron-yellow-cell,
    tr:nth-child(-n+3) td[style*="background-color: #fff2cc"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
    }
    `;
    
    return baseStyles + cellStyles.map((style, index) => {
        if (!style) return '';

        const safeStyle = {
            backgroundColor: style.backgroundColor || 'inherit',
            color: style.color || 'inherit',
            fontWeight: style.fontWeight || 'normal',
            fontSize: style.fontSize || 'inherit',
            textAlign: style.textAlign || 'left',
            borderColor: style.borderColor || '#000',
            rotation: style.rotation || 0
        };

        // Első három sor speciális stílusa - rácsvonalak eltávolítása és fehér háttér
        if (style.row === 0 || style.row === 1 || style.row === 2) {
            return `
                .cell-style-${index} {
                    background-color: white !important;
                    color: ${safeStyle.color} !important;
                    font-weight: ${safeStyle.fontWeight} !important;
                    font-size: ${safeStyle.fontSize} !important;
                    text-align: ${safeStyle.textAlign} !important;
                    border: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                    vertical-align: middle;
                    ${style.className ? getClassStyles(style.className) : ''}
                }
            `;
        }

        // Fekete cellák kezelése - kiemelt sárga határvonalakkal (kivéve az első három sorban)
        if ((style.backgroundColor === 'black' || 
            style.backgroundColor === '#000000' || 
            style.backgroundColor === 'rgb(0, 0, 0)' ||
            (style.className && style.className.includes('black-cell'))) && 
            style.row > 2) {
            return `
                .cell-style-${index} {
                    background-color: ${safeStyle.backgroundColor} !important;
                    color: yellow !important;
                    font-weight: ${safeStyle.fontWeight || 'bold'} !important;
                    font-size: ${safeStyle.fontSize || '16px'} !important;
                    text-align: ${safeStyle.textAlign} !important;
                    border: 2px solid yellow !important; /* Vékonyabb, de még látható sárga keret */
                    outline: 1px solid yellow !important; /* Finomabb kontúr */
                    box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important; /* Finomabb árnyék */
                    vertical-align: middle !important;
                    position: relative !important;
                    z-index: 1 !important;
                    ${style.className ? getClassStyles(style.className) : ''}
                }
                /* Biztosítjuk, hogy a cella tartalom is megörökölje a színeket */
                .cell-style-${index} .cell-content {
                    color: yellow !important;
                    font-weight: ${safeStyle.fontWeight || 'bold'} !important;
                }
            `;
        }
        
        // Fekete cellák az első három sorban - fehér háttérrel és fekete szöveggel
        if ((style.backgroundColor === 'black' || 
            style.backgroundColor === '#000000' || 
            style.backgroundColor === 'rgb(0, 0, 0)' ||
            (style.className && style.className.includes('black-cell'))) && 
            (style.row === 0 || style.row === 1 || style.row === 2)) {
            return `
                .cell-style-${index} {
                    background-color: white !important;
                    color: black !important;
                    font-weight: ${safeStyle.fontWeight} !important;
                    font-size: ${safeStyle.fontSize} !important;
                    text-align: ${safeStyle.textAlign} !important;
                    border: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                    vertical-align: middle;
                    ${style.className ? getClassStyles(style.className) : ''}
                }
                /* Biztosítjuk, hogy a cella tartalom is megörökölje a színeket */
                .cell-style-${index} .cell-content {
                    color: black !important;
                }
            `;
        }

        // #fff2cc színű cellák kezelése - finomabb rácsvonalakkal (kivéve az első három sorban)
        if (style.backgroundColor === '#fff2cc' || style.color === '#fff2cc') {
            if (style.row === 0 || style.row === 1 || style.row === 2) {
                return `
                    .cell-style-${index} {
                        background-color: white !important;
                        color: #000000 !important;
                        font-weight: ${safeStyle.fontWeight} !important;
                        font-size: ${safeStyle.fontSize} !important;
                        text-align: ${safeStyle.textAlign} !important;
                        border: none !important;
                        outline: none !important;
                        box-shadow: none !important;
                        vertical-align: middle;
                        ${style.className ? getClassStyles(style.className) : ''}
                    }
                `;
            } else {
                return `
                    .cell-style-${index} {
                        background-color: ${safeStyle.backgroundColor} !important;
                        color: #000000 !important;
                        font-weight: ${safeStyle.fontWeight} !important;
                        font-size: ${safeStyle.fontSize} !important;
                        text-align: ${safeStyle.textAlign} !important;
                        border: 0.5px solid #000 !important; /* Még vékonyabb rácsvonal a #fff2cc cellákhoz */
                        outline: 0.15px solid #000 !important; /* Minimális kontúr */
                        box-shadow: inset 0 0 0 0.25px #000 !important; /* Nagyon finom belső árnyék */
                        vertical-align: middle;
                        ${style.className ? getClassStyles(style.className) : ''}
                    }
                `;
            }
        }

        // Első sor speciális kezelése
        if (style.className && style.className.includes('first-row-style')) {
            return `
                .cell-style-${index}:not(.empty-cell) .cell-content:not(.empty-content) {
                    background-color: white !important;
                    color: ${safeStyle.color} !important;
                    font-weight: bold !important;
                    font-size: 22px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    text-decoration: underline !important;
                    border: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                }
                .cell-style-${index}.empty-cell .cell-content, .cell-style-${index} .empty-content {
                    text-decoration: none !important;
                }
            `;
        }

        // Utolsó sor speciális kezelése
        if (style.className && style.className.includes('last-row-style')) {
            return `
                .cell-style-${index} {
                    background-color: lightgrey !important;
                    color: ${safeStyle.color} !important;
                    font-weight: bold !important;
                    font-size: 18px !important;
                    text-align: center !important;
                    border: 1.5px solid #000 !important; /* Vékonyabb rácsvonal az utolsó sorhoz */
                    outline: 0.25px solid #000 !important;
                    box-shadow: inset 0 0 0 0.5px #000 !important;
                    vertical-align: middle;
                }
            `;
        }

        // Általános cellák kezelése
        return `
            .cell-style-${index} {
                background-color: ${safeStyle.backgroundColor} !important;
                color: ${safeStyle.color} !important;
                font-weight: ${safeStyle.fontWeight} !important;
                font-size: ${safeStyle.fontSize} !important;
                text-align: ${safeStyle.textAlign} !important;
                border: 0.75px solid #000 !important; /* Vékonyabb rácsvonal az általános cellákhoz */
                outline: 0.25px solid #000 !important;
                box-shadow: inset 0 0 0 0.5px #000 !important;
                vertical-align: middle;
                ${style.className ? getClassStyles(style.className) : ''}
            }
        `;
    }).join('\n');
}

// Helper function to generate colgroup
function generateColgroup(columnSizes) {
    if (!Array.isArray(columnSizes)) return '';

    return columnSizes.map(size => `<col style="width: ${size}px;">`).join('');
}

// Enhanced table row generation with styling
function generateTableRows(jsonData, mergedCells, rowSizes, columnSizes, cellStyles) {
    if (!Array.isArray(jsonData)) return '';

    let tableHtml = '';
    const mergeMatrix = createMergeMatrix(mergedCells, jsonData.length, jsonData[0]?.length || 0);
    const lastRowIndex = jsonData.length - 1;
    const lastTenRowsStartIndex = Math.max(0, jsonData.length - 10); // Az utolsó 10 sor kezdőindexe

    jsonData.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) return;

        const rowHeight = Array.isArray(rowSizes) ? rowSizes[rowIndex] : 'auto';
        let rowClassNames = '';
        
        // Első sor speciális kezelése
        if (rowIndex === 0) {
            rowClassNames = ' first-row';
        }
        
        // Utolsó sor speciális kezelése
        if (rowIndex === lastRowIndex) {
            rowClassNames = ' last-row';
        }

        tableHtml += `<tr class="${rowClassNames}" style="height: ${rowHeight}px;">`;

        row.forEach((cellValue, colIndex) => {
            const mergeInfo = mergeMatrix[rowIndex]?.[colIndex];
            if (mergeInfo && !mergeInfo.isMain) return;

            const style = Array.isArray(cellStyles) ? 
                cellStyles.find(style => style?.row === rowIndex && style?.col === colIndex) : 
                null;

            let styleClass = style ? ` cell-style-${cellStyles.indexOf(style)}` : '';
            
            // Fekete cella detektálása több feltétellel
            const isBlackCell = style && (
                style.backgroundColor === 'black' || 
                style.backgroundColor === '#000000' || 
                style.backgroundColor === 'rgb(0, 0, 0)' ||
                (style.className && style.className.includes('black-cell'))
            );
            
            // Fekete cellák speciális kezelése
            if (isBlackCell) {
                styleClass += ' black-cell';
            }

            // Üres cella ellenőrzése
            const isEmpty = cellValue === undefined || cellValue === null || cellValue === '';
            if (isEmpty) {
                styleClass += ' empty-cell';
            }

            // Első sor speciális kezelése
            if (rowIndex === 0) {
                styleClass += ' first-row-cell';
            }
            
            // Utolsó sor speciális kezelése
            if (rowIndex === lastRowIndex) {
                styleClass += ' last-row-cell';
            }

            const hasSaffronYellowBg = style && 
                (style.backgroundColor === '#fff2cc' || 
                 style.color === '#fff2cc' ||
                 (style.className && style.className.includes('yellow-row')));

            if (hasSaffronYellowBg) {
                styleClass += ' saffron-yellow-cell';
            }

            // Forgatás kezelése a cellában
            const rotation = style?.rotation / 2 || 0;
            let rotationClass = '';
            if (rotation === 90 || rotation === 270) {
                rotationClass = ' rotated-image-cell';
            }

            const width = Array.isArray(columnSizes) ? columnSizes[colIndex] : 'auto';
            const cellHeight = rowHeight !== 'auto' ? rowHeight : 'auto';

            const mergeAttrs = mergeInfo?.isMain ? 
                ` rowspan="${mergeInfo.rowspan}" colspan="${mergeInfo.colspan}"` : '';

            const cellContent = processCellContent(cellValue, width, cellHeight, rowIndex, colIndex, cellStyles);
            
            // Speciális stílus meghatározása
            let cellStyleAttr = `width: ${width}px; height: ${cellHeight}px;`;
    
             // Az első sorban nincs rácsvonal
             if (rowIndex === 0) {
                cellStyleAttr += ` border: none !important; outline: none !important; box-shadow: none !important;`;
            } 
            // Utolsó 10 sor 4. oszloptól nincs rácsvonal
            else if (rowIndex >= lastTenRowsStartIndex && colIndex >= 3) { // 0-tól indexelünk, tehát a 4. oszlop az index 3
                cellStyleAttr += ` border: none !important; outline: none !important; box-shadow: none !important;`;
            }
            // Fekete cellák esetén speciális sárga határvonal (kivéve ha az első sorban vagy az utolsó 10 sor 4. oszloptól van)
            else if (isBlackCell) {
                cellStyleAttr += ` background-color: black !important; color: yellow !important; 
                               border: 2px solid yellow !important; 
                               outline: 1px solid yellow !important; 
                               box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important;
                               position: relative; z-index: 1;`;
            } 

            tableHtml += `<td class="merged-cell${styleClass}${rotationClass}"${mergeAttrs} style="${cellStyleAttr}">${cellContent}</td>`;
        });

        tableHtml += '</tr>';
    });

    return tableHtml;
}

// Helper function to process cell content
function processCellContent(value, width, height, rowIndex, colIndex, cellStyles) {
    if (value === undefined || value === null || value === '') {
        return `<div class="cell-content empty-content" style="min-height: ${height}px; padding: 5px !important;">&nbsp;</div>`;
    }

    const stringValue = String(value);

    if (stringValue.startsWith('data:image') || stringValue.startsWith('/uploads/')) {
        let imgSrc = stringValue;
        if (stringValue.startsWith('/uploads/')) {
            try {
                const absoluteImagePath = path.join(process.cwd(), stringValue);
                if (fs.existsSync(absoluteImagePath)) {
                    const imageBuffer = fs.readFileSync(absoluteImagePath);
                    const base64Image = imageBuffer.toString('base64');
                    const mimeType = mime.lookup(absoluteImagePath) || 'image/png';
                    imgSrc = `data:${mimeType};base64,${base64Image}`;
                } else {
                    console.warn("Kép nem található:", absoluteImagePath);
                    return `<div class="cell-content">Kép nem található</div>`;
                }
            } catch (error) {
                console.error("Kép betöltési hiba:", error);
                return `<div class="cell-content">Hiba: ${escapeHtml(error.message)}</div>`;
            }
        }

        const style = Array.isArray(cellStyles) ? 
            cellStyles.find(style => style?.row === rowIndex && style?.col === colIndex) : 
            null;
        const rotation = style?.rotation || 0; // Teljes forgatási érték használata
        
        // Forgatott képek kezelése
        // 90 vagy 270 fokos forgatasoknál speciális kezelés
        if (rotation === 90 || rotation === 270) {
            return `
                <div class="cell-content" style="position: relative; width: 100%; height: 100%; overflow: hidden;">
                    <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
                        <img 
                            src="${imgSrc}" 
                            alt="Kép" 
                            style="
                                position: absolute;
                                max-width: none;
                                max-height: none;
                                width: ${height}px;
                                height: ${width}px;
                                object-fit: cover;
                                transform: rotate(${rotation}deg) translate(-50%, -50%);
                                transform-origin: 0 0;
                                left: 50%;
                                top: 50%;
                            "
                        >
                    </div>
                </div>
            `;
        }
        
        // Egyéb forgatások kezelése
        return `
            <div class="cell-content" style="position: relative; width: 100%; height: 100%; overflow: hidden;">
                <img 
                    src="${imgSrc}" 
                    alt="Kép" 
                    style="
                        width: 100%;
                        height: 100%;
                        object-fit: cover;
                        transform: rotate(${rotation}deg);
                        transform-origin: center center;
                    "
                >
            </div>
        `;
    }

    return `<div class="cell-content">${escapeHtml(stringValue)}</div>`;
}

// Helper function to create merge matrix
function createMergeMatrix(mergedCells, rowCount, colCount) {
    if (!Array.isArray(mergedCells)) return [];
    
    const matrix = Array.from({ length: rowCount }, () => Array(colCount).fill(null));
    
    mergedCells.forEach(merge => {
        if (!merge || !merge.s || !merge.e) return;
        
        const { s: start, e: end } = merge;
        for (let row = start.r; row <= end.r; row++) {
            for (let col = start.c; col <= end.c; col++) {
                matrix[row][col] = {
                    isMain: row === start.r && col === start.c,
                    rowspan: end.r - start.r + 1,
                    colspan: end.c - start.c + 1,
                    start: start
                };
            }
        }
    });
    
    return matrix;
}

module.exports = router;