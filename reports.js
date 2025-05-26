require("dotenv").config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const path = require('path');
const stream = require('stream');
const mime = require('mime-types');
//const { getOrCreateFolder, uploadPdfToDrive, driveService, uploadImagesToDrive, createDailyFolder } = require('./googleDrive');
const axios = require('axios');
const { google } = require('googleapis')
const MAIN_DRIVE_FOLDER_ID = '1yc0G2dryo4XZeHmZ3FzV4yG4Gxjj2w7j'; // Állítsd be a saját főmappa ID-t!

const { Storage } = require('@google-cloud/storage');

console.log('DATABASE_URL a server.js-ben:', process.env.DATABASE_URL);

// PostgreSQL konfiguráció

//Éles környezet adatbázis
const pool = require('./db');

const router = express.Router(); 

// Middleware a form adatok feldolgozására
router.use(express.urlencoded({ extended: true }));
router.use(express.json());

// Multer konfiguráció memória tárolással
const upload = multer({
    storage: multer.memoryStorage(), // Vagy más storage konfiguráció
    // ADD HOZZÁ EZT A SORT, VAGY NÖVELD AZ ÉRTÉKÉT, HA MÁR OTT VAN
    limits: { fileSize: 10 * 1024 * 1024 } // Például 10 MB (10 * 1024 * 1024 bájt)
});

// GCS kliens, bucket és bucket név deklarálása globális hatókörben
let storage;
let bucket;
let gcsBucketName; // <-- EZ A FONTOS MÓDOSÍTÁS!
let driveService; // Ezt is itt érdemes deklarálni globálisan, ha a Google Drive-ot is itt inicializálod.

// ************************************************************
// GOOGLE CLOUD SZOLGÁLTATÁSOK INICIALIZÁLÁSA ASYNC FÜGGVÉNYBEN
// Ez a függvény visszatér egy Promise-szel, amit a server.js várni fog.
// ************************************************************
async function initializeGoogleServices() {
    try {
        let credentials;

        // 1. Megpróbáljuk beolvasni a JSON-t a környezeti változóból (Render.com)
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            try {
                credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
                console.log('✅ Google Cloud hitelesítő adatok betöltve a környezeti változóból.');
            } catch (parseError) {
                throw new Error(`HIBA: A GOOGLE_APPLICATION_CREDENTIALS_JSON környezeti változó tartalma érvénytelen JSON: ${parseError.message}`);
            }
        }
        // 2. Ha az nem létezik, megpróbáljuk a fájl elérési útjáról (lokális .env)
        else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            const fullKeyPath = path.join(process.cwd(), keyFilePath);

            if (fs.existsSync(fullKeyPath)) {
                credentials = JSON.parse(fs.readFileSync(fullKeyPath, 'utf8'));
                console.log(`✅ Google Cloud hitelesítő adatok betöltve a fájlból: ${fullKeyPath}`);
            } else {
                throw new Error(`HIBA: A Service Account kulcsfájl nem található: ${fullKeyPath}. Kérlek, ellenőrizd a .env fájlban az útvonalat és a fájl meglétét.`);
            }
        } else {
            // Ha egyik sem érhető el
            throw new Error("Kritikus HIBA: Sem a GOOGLE_APPLICATION_CREDENTIALS_JSON, sem a GOOGLE_APPLICATION_CREDENTIALS környezeti változó nincs beállítva. A Google Cloud és Drive szolgáltatások nem inicializálhatók.");
        }

        // Most, hogy a credentials objektum elkészült, használjuk a Storage és Drive inicializálásához

        // GCS inicializálás
        if (!credentials) { // Redundáns ellenőrzés, de nem árt
             throw new Error("HIBA: Nincsenek hitelesítő adatok a Google Cloud Storage inicializálásához.");
        }
        storage = new Storage({ credentials });

        gcsBucketName = process.env.GCS_BUCKET_NAME;
        if (!gcsBucketName) {
            throw new Error("HIBA: A GCS_BUCKET_NAME környezeti változó nincs beállítva.");
        }
        bucket = storage.bucket(gcsBucketName);

        console.log(`Google Cloud Storage bucket inicializálva: ${gcsBucketName}`);

        // Google Drive inicializálás
        const authClient = new google.auth.GoogleAuth({
            credentials: credentials, // Ugyanazt a credentials objektumot használjuk
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const auth = await authClient.getClient();
        driveService = google.drive({ version: 'v3', auth });
        console.log('Google Drive Service sikeresen inicializálva.');

    } catch (error) {
        console.error("Kritikus hiba a Google Cloud Storage/Drive inicializálásakor:", error.message);
        // Itt nem hívjuk meg a process.exit(1)-et, mert a server.js fogja kezelni,
        // ha az initializationPromise-t elkapja.
        throw error; // Fontos, hogy a Promise elutasítását kiváltsuk
    }
}

// ************************************************************
// INNENTŐL KEZDŐDNEK A SEGÉDFÜGGVÉNYEK ÉS ENDPOINT-OK
// *ű***********************************************************

// Segédfüggvény a kép letöltéséhez URL-ről
async function downloadImageFromUrl(imageUrl) {
    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    } catch (error) {
        console.error(`Hiba a kép letöltésekor az URL-ről (${imageUrl}): ${error.message}`);
        throw error;
    }
}

// uploadBufferToDrive függvény DEFINÍCIÓJA!
async function uploadBufferToDrive(buffer, fileName, parentFolderId, mimeType) {
    if (!driveService) {
        // Ez a hiba már a server.js-ben elkapható lenne, de itt is lehet ellenőrizni
        throw new Error("driveService nincs inicializálva.");
    }

    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };

    try {
        const readableStream = stream.Readable.from(buffer);

        const response = await driveService.files.create({
            resource: fileMetadata,
            media: {
                mimeType: mimeType,
                body: readableStream,
            },
            fields: 'id, webViewLink',
        });
        return response.data;
    } catch (error) {
        console.error(`Hiba a fájl feltöltése során (${fileName}):`, error.message);
        throw error;
    }
}

// Képtömörítő funkció (ezt a funkciót nem használja közvetlenül az /upload endpoint, de benne hagytam)
async function compressImage(inputPath, outputPath) {
    try {
        if (!fs.existsSync(inputPath)) {
            throw new Error(`A bemeneti fájl (${inputPath}) nem létezik!`);
        }

        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

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
        // Ellenőrizzük, hogy a GCS szolgáltatások inicializálva vannak-e
        if (!bucket || !gcsBucketName) {
            console.error('HIBA: A GCS szolgáltatások nincsenek inicializálva, mielőtt a feltöltési endpointot hívták.');
            return res.status(503).json({ success: false, message: 'A szerver még nem állt készen a képfeltöltésre. Kérjük, próbálja újra később.' });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Nincs fájl feltöltve' });
        }

        const projectId = req.body.projectId;
        if (!projectId) {
            return res.status(400).json({ success: false, message: 'Project ID hiányzik' });
        }

        const compressedBuffer = await sharp(req.file.buffer)
            .resize(800)
            .toBuffer();

        const outputFilename = `compressed_${Date.now()}_${req.file.originalname}`;
        const filePathInGCS = `project-${projectId}/${outputFilename}`;

        const file = bucket.file(filePathInGCS);
        await file.save(compressedBuffer, {
            metadata: { contentType: req.file.mimetype },
            resumable: false,
        });

        const publicUrl = `https://storage.googleapis.com/${gcsBucketName}/${filePathInGCS}`;
        res.json({
            success: true,
            url: publicUrl,
            metadata: await sharp(compressedBuffer).metadata()
        });

    } catch (err) {
        console.error('VÉGLEGES HIBA a kép feltöltésekor a GCS-re:', err);
        res.status(500).json({ success: false, message: 'Szerver hiba', error: err.message });
    }
});

// Nem használt képek törlése függvény (duplikálva volt, az egyiket kivettem)
async function cleanupUnusedImages(projectId, usedImageUrls) {
    try {
        if (!bucket || !gcsBucketName) {
            console.error('HIBA: A GCS szolgáltatások nincsenek inicializálva a takarítási funkció hívásakor.');
            return; // Nem tudunk takarítani, ha nincs GCS kapcsolat
        }

        const [files] = await bucket.getFiles({ prefix: `project-${projectId}/` });

        const unusedGCSFilePaths = files
            .filter(file => {
                const fileName = file.name;
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
                const gcsFileUrl = `https://storage.googleapis.com/${gcsBucketName}/${fileName}`;
                return isImage && !usedImageUrls.includes(gcsFileUrl);
            })
            .map(file => file.name);

        for (const filePathInGCS of unusedGCSFilePaths) {
            const file = bucket.file(filePathInGCS);
            await file.delete();
            console.log(`Nem használt kép törölve a GCS-ből: gs://${gcsBucketName}/${filePathInGCS}`);
        }

        console.log(`Takarítás kész: ${unusedGCSFilePaths.length} nem használt kép törölve a project-${projectId} mappából a GCS-en.`);
    } catch (error) {
        console.error('Hiba a nem használt képek tisztításakor a GCS-en:', error);
    }
}

// Kép törlésének endpointja
router.post('/delete-image', async (req, res) => {
    try {
        if (!bucket || !gcsBucketName) {
            console.error('HIBA: A GCS szolgáltatások nincsenek inicializálva a törlési endpoint hívásakor.');
            return res.status(503).json({ success: false, message: 'A szerver még nem állt készen a kép törlésére.' });
        }

        const imageUrl = req.body.imageUrl;

        if (!imageUrl || !imageUrl.startsWith(`https://storage.googleapis.com/${gcsBucketName}/`)) {
            return res.status(400).json({ success: false, message: 'Érvénytelen GCS kép URL.' });
        }

        const filePathInGCS = imageUrl.substring(`https://storage.googleapis.com/${gcsBucketName}/`.length);
        const file = bucket.file(filePathInGCS);

        const [exists] = await file.exists();
        if (exists) {
            await file.delete();
            console.log(`Kép törölve a GCS-ből: ${imageUrl}`);
            res.json({ success: true, message: 'Kép sikeresen törölve.' });
        } else {
            res.status(404).json({ success: false, message: 'A kép nem található a GCS-en.' });
        }
    } catch (err) {
        console.error('Hiba a kép törlésekor a GCS-ből:', err);
        res.status(500).json({ success: false, message: 'Szerver hiba a törlés során.', error: err.message });
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

//Jelentés betöltése route
router.get('/:projectId/report', async (req, res) => {
    const { projectId } = req.params;

    try {
        const projectReportResult = await pool.query(
            'SELECT latest_report_id FROM project_reports WHERE project_id = $1',
            [projectId]
        );

        if (projectReportResult.rows.length > 0 && projectReportResult.rows[0].latest_report_id) {
            const latestReportId = projectReportResult.rows[0].latest_report_id;

            const reportDataResult = await pool.query(
                'SELECT data, merge_cells, column_sizes, row_sizes, cell_styles FROM report_data WHERE report_id = $1',
                [latestReportId]
            );

            if (reportDataResult.rows.length > 0) {
                res.json({
                    success: true,
                    data: reportDataResult.rows[0].data,
                    mergeCells: reportDataResult.rows[0].merge_cells,
                    colWidths: reportDataResult.rows[0].column_sizes,
                    rowHeights: reportDataResult.rows[0].row_sizes,
                    cellStyles: reportDataResult.rows[0].cell_styles
                });
            } else {
                res.json({ success: false, message: "Nem található a legutolsó jegyzőkönyv adatai." });
            }
        } else {
            res.json({ success: false, message: "Nincs mentett jegyzőkönyv ehhez a projekthez." });
        }

    } catch (error) {
        console.error("Hiba a jelentés lekérésekor az adatbázisból:", error);
        res.status(500).json({ success: false, message: "Adatbázis hiba történt." });
    }
});

// Jelentés mentése route (MÓDOSÍTOTT)
router.post("/save", async (req, res) => {
    const { projectId, data, mergeCells, columnSizes, rowSizes, cellStyles } = req.body;
    const reportId = `report-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    if (!data || !projectId) {
        return res.status(400).json({ success: false, message: "Hiányzó adatok." });
    }

    try {
        // Töröljük a korábbi jelentéseket a report_data táblából ehhez a projekthez
        await pool.query('DELETE FROM report_data WHERE project_id = $1', [projectId]);

        // Beszúrjuk az új jelentést a report_data táblába
        // A 'data' (ami a táblázat tartalmát jelenti) most már a GCS URL-eket tartalmazza
        await pool.query(
            'INSERT INTO report_data (project_id, report_id, data, merge_cells, column_sizes, row_sizes, cell_styles) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [projectId, reportId, JSON.stringify(data), JSON.stringify(mergeCells), JSON.stringify(columnSizes), JSON.stringify(rowSizes), JSON.stringify(cellStyles)]
        );

        // Frissítjük a project_reports táblát a legutolsó report_id-val
        await pool.query(
            'INSERT INTO project_reports (project_id, latest_report_id) VALUES ($1, $2) ON CONFLICT (project_id) DO UPDATE SET latest_report_id = $2',
            [projectId, reportId]
        );

        // Használt képek URL-jeinek kinyerése a data-ból (MÓDOSÍTOTT)
        const usedImageUrls = [];
        if (Array.isArray(data)) {
            data.forEach(row => {
                if (Array.isArray(row)) {
                    row.forEach(cell => {
                        // Most már a GCS URL-ekre keresünk, amik "https://storage.googleapis.com/"-mal kezdődnek
                        if (typeof cell === 'string' && cell.startsWith('https://storage.googleapis.com/')) {
                            usedImageUrls.push(cell);
                        }
                        // Ha a data URI-kat is figyelembe szeretnéd venni, az eredeti logikád maradhat itt
                        // else if (typeof cell === 'string' && cell.startsWith('data:image')) {
                        //     // Itt valószínűleg nem tudod azonosítani a szerveren lévő fájlt
                        //     // hacsak nem tárolsz valamilyen metaadatot a data URI-khoz
                        // }
                    });
                }
            });
        }

        // FONTOS: A `cleanupUnusedImages` függvény már a GCS-ből töröl,
        // így ez a hívás mostantól a felhő tárhelyet fogja takarítani.
        await cleanupUnusedImages(projectId, usedImageUrls);

        res.json({ success: true, message: "Jelentés sikeresen mentve az adatbázisba.", reportId });

    } catch (error) {
        console.error("Hiba a jegyzőkönyv mentésekor az adatbázisba:", error);
        res.status(500).json({ success: false, message: "Hiba történt a mentés során.", error: error.message });
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
        const invalidFileChars = /[\/\\?%*:|"<>]/g;
        const safeProjectName = projectName.replace(invalidFileChars, '_');

        const reportDataResult = await pool.query(
            'SELECT rd.data, rd.merge_cells, rd.column_sizes, rd.row_sizes, rd.cell_styles ' +
            'FROM project_reports pr ' +
            'JOIN report_data rd ON pr.latest_report_id = rd.report_id ' +
            'WHERE pr.project_id = $1',
            [projectId]
        );

        if (reportDataResult.rows.length === 0) {
            return res.status(404).send('Nincs elérhető jelentés ehhez a projekthez.');
        }

        const reportData = reportDataResult.rows[0];
        const jsonData = reportData.data;
        const mergedCells = reportData.merge_cells || [];
        const columnSizes = reportData.column_sizes || [];
        const rowSizes = reportData.row_sizes || [];
        const cellStyles = reportData.cell_styles || [];

        // Javított HTML generálás
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
    @page {
        size: A4 portrait;
        margin: 10mm;
        -webkit-column-break-inside: avoid;
        page-break-inside: avoid;
        break-inside: avoid;
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
        outline: 0.5px solid #000 !important;
        box-shadow: inset 0 0 0 1px #000 !important;
    }
    /* Első három sor cellái rácsok nélkül fehér háttérrel */
    tr:nth-child(-n+3) td {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
        color: black !important;
    }
    .black-cell,
    td[style*="background-color: black"],
    td[style*="background-color: #000000"],
    td[data-cell-type="black"],
    td[data-forced-black="true"] {
        background-color: black !important;
        color: yellow !important;
        border: 3px solid yellow !important;
        outline: 2px solid yellow !important;
        box-shadow: 0 0 0 1px yellow, inset 0 0 0 1px yellow !important;
        position: relative !important;
        z-index: 1 !important;
        font-weight: bold !important;
    }
    .black-cell .cell-content,
    td[style*="background-color: black"] .cell-content,
    td[style*="background-color: #000000"] .cell-content,
    td[data-cell-type="black"] .cell-content,
    td[data-forced-black="true"] .cell-content {
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

    /* Beszúrt sorok stílusai */
    tr:nth-child(n+12):not(:nth-last-child(-n+10)):nth-child(even) td {
        background-color: #D7D7D7 !important;
        color: black !important;
    }

    tr:nth-child(n+12):not(:nth-last-child(-n+10)):nth-child(odd) td {
        background-color: white !important;
        color: black !important;
    }

    /* Utolsó 10 sor 4. oszloptól kezdve rácsvonal nélkül */
    tr:nth-last-child(-n+10) td:nth-child(n+4) {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
    }

    @media print {
        /* Fekete cellák megjelenítési kényszerítése */
        .black-cell,
        td[style*="background-color: black"],
        td[style*="background-color: #000000"],
        td[data-cell-type="black"],
        td[data-forced-black="true"] {
            background-color: black !important;
            color: yellow !important;
            font-weight: bold !important;
            border: 2px solid yellow !important;
            outline: 1px solid yellow !important;
            box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Fekete cellák tartalmának explicit beállítása */
        .black-cell .cell-content,
        td[style*="background-color: black"] .cell-content,
        td[style*="background-color: #000000"] .cell-content,
        td[data-cell-type="black"] .cell-content,
        td[data-forced-black="true"] .cell-content {
            color: yellow !important;
            font-weight: bold !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Beszúrt sorok színeinek nyomtatása */
        tr:nth-child(n+12):not(:nth-last-child(-n+10)):nth-child(even) td:not(.black-cell):not([data-cell-type="black"]):not([data-forced-black="true"]):not([style*="background-color: black"]) {
            background-color: #D7D7D7 !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        tr:nth-child(n+12):not(:nth-last-child(-n+10)):nth-child(odd) td:not(.black-cell):not([data-cell-type="black"]):not([data-forced-black="true"]):not([style*="background-color: black"]) {
            background-color: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        /* Oldaltörés elkerülése soronként */
        tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }
    }

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

// PDF generálás Puppeteerrel
const browser = await puppeteer.launch({
     headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({
    width: 4000,
    height: 3000,
    deviceScaleFactor: 3.0
});



// Színes nyomtatás engedélyezése
await page.emulateMediaType('screen');

// Rövid script a kritikus sorok kezeléséhez
await page.setContent(htmlContent, {
    waitUntil: ['load', 'networkidle0'],
    timeout: 60000
});

// Kritikus cellák explicit felülírása
await page.evaluate(() => {
    // Kritikus sorok azonosítása
    const rows = document.querySelectorAll('table tr');
    const totalRows = rows.length;
    const criticalRows = [totalRows - 11, totalRows - 12];

    criticalRows.forEach(rowIdx => {
        if (rowIdx > 0 && rowIdx < totalRows) {
            const row = rows[rowIdx];
            // Csak az első két cella speciális kezelése
            const cells = Array.from(row.querySelectorAll('td')).slice(0, 2);

            cells.forEach(cell => {
                const isBlackCell = cell.classList.contains('black-cell') ||
                                   cell.getAttribute('style')?.includes('background-color: black') ||
                                   cell.getAttribute('data-forced-black') === 'true' ||
                                   cell.getAttribute('data-cell-type') === 'black';

                if (isBlackCell) {
                    cell.setAttribute('style', cell.getAttribute('style') + `
                        background-color: black !important;
                        color: yellow !important;
                        font-weight: bold !important;
                        border: 2px solid yellow !important;
                        -webkit-print-color-adjust: exact !important;
                    `);

                    const content = cell.querySelector('.cell-content');
                    if (content) {
                        content.setAttribute('style', `color: yellow !important; font-weight: bold !important;`);
                    }
                }
            });
        }
    });
});

const tempDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

const tempFilePath = path.join(tempDir, `${safeProjectName}_report.pdf`);
await page.pdf({
    path: tempFilePath,
    format: 'A4',
    landscape: false,
    printBackground: true,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    scale: 0.55,
    preferCSSPageSize: true
});

await browser.close();

const fileName = `IWS_Solutions_Munkavedelmi_ellenorzesi_jegyzokonyv_${safeProjectName}.pdf`;

// Google Drive feltöltés
   try {
            console.log('📂 PDF feltöltés indítása: fájl =', fileName);
            console.log('📁 Cél projekt mappa:', safeProjectName);
            console.log('📁 Szülő mappa ID:', MAIN_DRIVE_FOLDER_ID);

            // Próbáljuk meg listázni a parent mappát
            const testAccess = await driveService.files.get({
                fileId: MAIN_DRIVE_FOLDER_ID,
                fields: 'id, name'
            }).catch(err => {
                console.error("❌ NEM elérhető a MAIN_DRIVE_FOLDER_ID mappa a service account számára!");
                throw new Error("A service account nem fér hozzá a gyökérmappához. Ellenőrizd a megosztást!");
            });
            console.log("✅ Elérhető a fő mappa:", testAccess.data.name);

            // Először ellenőrizzük, hogy a MAIN_DRIVE_FOLDER_ID elérhető-e
            try {
                const rootFolderCheck = await driveService.files.get({
                    fileId: MAIN_DRIVE_FOLDER_ID,
                    fields: 'id, name',
                });
                console.log('✅ MAIN_DRIVE_FOLDER_ID elérhető:', rootFolderCheck.data.name);
            } catch (permErr) {
                console.error('❌ NEM elérhető a MAIN_DRIVE_FOLDER_ID mappa a service account számára!');
                throw new Error('A service account nem fér hozzá a gyökérmappához. Ellenőrizd a megosztást!');
            }

            // Ellenőrizzük, hogy létezik-e a projekt mappa a Google Drive-on
            const projectFolderId = await getOrCreateFolder(safeProjectName, MAIN_DRIVE_FOLDER_ID);
            console.log('📁 Projekt mappa ID:', projectFolderId);

            // Létrehozzuk az aznapi dátumozott mappát (előtte törli ha már létezik)
            const dailyFolderId = await createDailyFolder(projectFolderId);
            console.log('📁 Aznapi mappa ID:', dailyFolderId);

            // PDF feltöltése az aznapi mappába
            const uploadResult = await uploadFileToDrive(tempFilePath, fileName, dailyFolderId, 'application/pdf'); // Itt használjuk a korábbi uploadFileToDrive-ot
            console.log('✅ PDF feltöltés sikeres! Drive URL:', uploadResult.webViewLink);

            // --- Képek összegyűjtése és feltöltése (ÁTÍRT RÉSZ) ---
            const reportDataForImages = await pool.query(
                'SELECT data FROM report_data rd JOIN project_reports pr ON rd.report_id = pr.latest_report_id WHERE pr.project_id = $1',
                [projectId]
            );

            if (reportDataForImages.rows.length > 0 && reportDataForImages.rows[0].data) {
                const jsonDataForImages = reportDataForImages.rows[0].data;
                let imageUrlsToProcess = [];

                function extractImageUrls(data) {
                    if (typeof data === 'object' && data !== null) {
                        for (const key in data) {
                            if (typeof data[key] === 'string' && data[key].startsWith('https://storage.googleapis.com/')) {
                                imageUrlsToProcess.push(data[key]);
                            } else if (typeof data[key] === 'object') {
                                extractImageUrls(data[key]);
                            }
                        }
                    } else if (typeof data === 'string' && data.startsWith('https://storage.googleapis.com/')) {
                        imageUrlsToProcess.push(data);
                    }
                }

                extractImageUrls(jsonDataForImages);
                const uniqueImageUrls = [...new Set(imageUrlsToProcess)]; // Duplikátumok eltávolítása

                if (uniqueImageUrls.length > 0) {
                    console.log(`📸 ${uniqueImageUrls.length} egyedi kép található a táblázatban (GCS-ről), feltöltés indítása a Drive-ra...`);

                    const uploadImagePromises = uniqueImageUrls.map(async (imageUrl) => {
                        const imageFileName = path.basename(new URL(imageUrl).pathname);

                        try {
                            // 1. Kép letöltése a GCS-ről bufferbe
                            const imageBuffer = await downloadImageFromUrl(imageUrl); 

                            // 2. MIME típus meghatározása a fájlnévből
                            const imageMimeType = getMimeType(imageFileName);

                            // 3. Kép feltöltése a Google Drive-ra a bufferből
                            const imageUploadResult = await uploadBufferToDrive(imageBuffer, imageFileName, dailyFolderId, imageMimeType); 
                            console.log(`✅ Kép feltöltve a Drive-ra: ${imageFileName}, Drive URL: ${imageUploadResult.webViewLink}`);
                            return imageUploadResult.webViewLink;
                        } catch (imageProcessErr) {
                            console.error(`❌ Hiba a kép letöltésekor/feltöltésekor a Drive-ra (${imageFileName} from ${imageUrl}): ${imageProcessErr.message}`);
                            return null; 
                        }
                    });

                    const uploadedImageLinks = await Promise.all(uploadImagePromises);
                    const successfulUploadLinks = uploadedImageLinks.filter(link => link !== null);

                    if (successfulUploadLinks.length > 0) {
                        console.log(`🎉 ${successfulUploadLinks.length} kép sikeresen feltöltve a Google Drive-ra.`);
                    } else {
                        console.log('⚠️ Egyetlen kép feltöltése sem sikerült a Google Drive-ra.');
                    }

                } else {
                    console.log('⚠️ Nincsenek GCS képek a táblázatban, feltöltés kihagyva.');
                }
            } else {
                console.log('⚠️ Nincsenek adatok a jelentésben, vagy nem tartalmaz GCS képeket.');
            }
            // --- Képek összegyűjtése és feltöltése VÉGE ---

        } catch (uploadErr) {
            console.error('❌ Hiba a Google Drive feltöltésnél (a PDF generálás során):', uploadErr.message);
            console.error('📄 Részletek:', uploadErr);
            // Itt döntheted el, hogy ha a Drive feltöltés sikertelen, az befolyásolja-e a PDF letöltését.
            // Jelenleg tovább engedi a kódot a PDF letöltésére.
        }

        // PDF válaszként küldése letöltéshez
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        fs.createReadStream(tempFilePath).pipe(res);

    } catch (error) {
        console.error('❌ Hiba a PDF generálás során:', error.message);
        res.status(500).send('Hiba történt: ' + error.message);
    }
});

//Drive feltöltés segéd függvények
async function uploadFileToDrive(filePath, fileName, parentFolderId, mimeType) {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };
    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(filePath), // Fájl tartalmának beolvasása stream-ként
    };
    try {
        const response = await driveService.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink', // Csak az ID-t és a webViewLink-et kérjük vissza
        });
        return response.data;
    } catch (error) {
        console.error(`Hiba a fájl feltöltése során (${fileName}):`, error.message);
        throw error; // Propagáljuk a hibát
    }
}

// Segédfüggvény a MIME típus meghatározásához a fájlnévből
const getMimeType = (fileName) => {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        // ... további képformátumok, ha szükséges
        default:
            return 'application/octet-stream'; // Alapértelmezett, ha nem ismert
    }
};

// Helper function to generate custom styles - optimalizált verzió
function generateCustomStyles(cellStyles) {
    if (!Array.isArray(cellStyles)) return '';

    // Összes sor megszámolása a stílusokból
    const totalRows = cellStyles.reduce((max, style) =>
        style && style.row !== undefined ? Math.max(max, style.row) : max, 0) + 1;

    // Alap táblázat stílusok
    let baseStyles = `
    /* Alap táblázat stílusok */
    table {
        border-collapse: collapse !important;
        width: 100% !important;
        table-layout: fixed !important;
        border: 2px solid #000 !important;
        font-size: 0.85em !important;
        max-width: 100% !important;
    }

    /* Páros/páratlan sorok stílusai */
    tr.even-row td {
        background-color: #D7D7D7 !important;
        color: black !important;
    }
    tr.odd-row td {
        background-color: white !important;
        color: black !important;
    }

    /* Cellák alapstílusa */
    td {
        border: 0.75px solid #000 !important;
        outline: 0.25px solid #000 !important;
        box-shadow: inset 0 0 0 0.5px #000 !important;
        padding: 0 !important;
        position: relative !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        word-wrap: break-word !important;
        margin: 0 !important;
    }

    /* Cella tartalom alapértelmezett stílusai */
    .cell-content {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5px;
        border: none !important;
        overflow: hidden;
        box-sizing: border-box !important;
        background-color: inherit !important;
        color: inherit !important;
    }

    /* Első három sor cellái rácsok nélkül fehér háttérrel */
    tr:nth-child(-n+3) td {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
    }

    /* Fekete cellák formázása */
    td[style*="background-color: black"],
    td[style*="background-color: #000000"],
    td.black-cell {
        background-color: black !important;
        border: 2px solid yellow !important;
        outline: 1px solid yellow !important;
        box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important;
        color: yellow !important;
        font-weight: bold !important;
    }
    td.black-cell .cell-content,
    td[style*="background-color: black"] .cell-content,
    td[style*="background-color: #000000"] .cell-content {
        color: yellow !important;
        font-weight: bold !important;
    }

    /* Első három sor fekete cellái */
    tr:nth-child(-n+3) td.black-cell,
    tr:nth-child(-n+3) td[style*="background-color: black"],
    tr:nth-child(-n+3) td[style*="background-color: #000000"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
        color: black !important;
    }

    /* Függőleges szöveg az első oszlopban bizonyos sorokban */
    tr:nth-child(11):not(:nth-last-child(10)) td:first-child .cell-content,
    tr:nth-last-child(10):not(:nth-child(11)) td:first-child .cell-content,
    .vertical-text, .vertical-text .cell-content {
        writing-mode: vertical-rl !important;
        text-orientation: mixed !important;
        transform: rotate(180deg) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;git
        
    }

    /* Egyesített cellák stílusa */
    .merged-cell {
        border: 0.75px solid #000 !important;
        outline: 0.25px solid #000 !important;
        box-shadow: inset 0 0 0 0.5px #000 !important;
        background-color: inherit;
        padding: 0;
    }

    /* Első három sor egyesített cellái */
    tr:nth-child(-n+3) .merged-cell {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
        background-color: white !important;
    }

    /* 2-7 indexű sorok balra igazítása */
    tr:nth-child(n+2):nth-child(-n+7) td .cell-content {
        justify-content: flex-start !important;
        text-align: left !important;
    }

    /* Képek kezelése */
    .cell-content:has(img) {
        padding: 0;
    }
    .cell-content img {
        max-width: 100%;
        max-height: 100%;
        display: block;
    }

    /* Forgatott képek stílusa */
    .rotated-image-90 img,
    .rotated-image-270 img {
        position: absolute;
        transform-origin: center center;
        width: auto !important;
        height: auto !important;
        max-width: none !important;
        max-height: none !important;
    }

/* Az első sor 4. cellájának aláhúzása */
tr:first-child td:nth-child(4) .cell-content {
    text-align: center !important;
    font-size: 28px !important;
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
        border: 1.5px solid #000 !important;
    }
    tr:last-child td .cell-content {
        font-weight: bold !important;
        text-align: center !important;
    }

    /* Utolsó 10 sor 4. oszloptól kezdve rácsvonal nélkül */
    tr:nth-last-child(-n+10) td:nth-child(n+4),
    tr:nth-last-child(-n+10) td:nth-child(n+4).black-cell,
    tr:nth-last-child(-n+10) td:nth-child(n+4)[style*="background-color: black"],
    tr:nth-last-child(-n+10) td:nth-child(n+4)[style*="background-color: #000000"] {
        border: none !important;
        outline: none !important;
        box-shadow: none !important;
    }

/* 11. sor középre igazítás */
tr:nth-child(11) td .cell-content {
    justify-content: center !important;
    text-align: center !important;
}

    /* 12. sortól lefelé középre igazítás */
    tr:nth-child(n+12) td .cell-content {
        justify-content: center !important;
        text-align: center !important;
    }

    /* Beszúrt sorok stílusai */
    tr:nth-child(n+12):not(:nth-last-child(-n+10)) td {
        color: black !important;
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
            rotation: style.rotation || 0,
            className: style.className || '' // Ensure className is always a string
        };

        const cellSelector = `table tr:nth-child(${style.row + 1}) td:nth-child(${style.col + 1})`;
        let specificStyles = '';

        // Első három sor speciális stílusa
        if (style.row <= 2) {
            specificStyles += `
                background-color: white !important;
                color: ${safeStyle.color} !important;
                font-weight: ${safeStyle.fontWeight} !important;
                font-size: ${safeStyle.fontSize} !important;
                text-align: ${safeStyle.textAlign} !important;
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                vertical-align: middle;
            `;
        }

        // 11. sor vagy utolsó-10. sor első oszlopának kezelése - függőleges szöveg
    if ((style.row === 10 && style.col === 0) || (style.row === totalRows - 9 && style.col === 0)) {
        const isBlackCell = safeStyle.backgroundColor === 'black' || safeStyle.backgroundColor === '#000000';
        const textColor = isBlackCell ? 'yellow' : safeStyle.color;
        specificStyles += `
            background-color: ${safeStyle.backgroundColor} !important;
            color: ${textColor} !important;
            font-weight: ${safeStyle.fontWeight} !important;
            font-size: ${safeStyle.fontSize} !important;
            ${isBlackCell ? `
                border: 2px solid yellow !important;
                outline: 1px solid yellow !important;
                box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important;
            ` : ''}
        `;
        const contentSelector = `${cellSelector} .cell-content`;
        baseStyles += `
    ${contentSelector} {
        writing-mode: vertical-rl !important;
        text-orientation: mixed !important;
        transform: rotate(180deg) !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        /* height: 100% !important; */ 
        color: ${textColor} !important;
    }
`;
    }

        // Fekete cellák kezelése (az első három soron kívül)
        const isBlackCell = safeStyle.backgroundColor === 'black' ||
                            safeStyle.backgroundColor === '#000000' ||
                            safeStyle.backgroundColor === 'rgb(0, 0, 0)' ||
                            safeStyle.className.includes('black-cell');

        if (isBlackCell && style.row > 2) {
            specificStyles += `
                background-color: black !important;
                color: yellow !important;
                font-weight: ${safeStyle.fontWeight || 'bold'} !important;
                font-size: ${safeStyle.fontSize || '16px'} !important;
                text-align: ${safeStyle.textAlign} !important;
                border: 2px solid yellow !important;
                outline: 1px solid yellow !important;
                box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important;
                vertical-align: middle !important;
                position: relative !important;
                z-index: 1 !important;
            `;
        }

        // Fekete cellák az első három sorban
        if (isBlackCell && style.row <= 2) {
            specificStyles += `
                background-color: white !important;
                color: black !important;
                font-weight: ${safeStyle.fontWeight} !important;
                font-size: ${safeStyle.fontSize} !important;
                text-align: ${safeStyle.textAlign} !important;
                border: none !important;
                outline: none !important;
                box-shadow: none !important;
                vertical-align: middle;
            `;
        }

        // Beszúrt sorok (12-től az utolsó-10-ig)
        if (style.row >= 12 && style.row < (totalRows - 10)) {
            let textColor = isBlackCell ? 'yellow' : 'black';
            let bgColor = safeStyle.backgroundColor;
            if (!bgColor || bgColor === 'inherit' || bgColor === '' || bgColor === 'transparent') {
                const isEven = (style.row - 12) % 2 === 0;
                bgColor = isEven ? '#D7D7D7' : 'white';
            }
            specificStyles += `
                background-color: ${bgColor} !important;
                color: ${textColor} !important;
                font-weight: ${safeStyle.fontWeight} !important;
                font-size: ${safeStyle.fontSize} !important;
                text-align: ${safeStyle.textAlign || 'center'} !important;
            `;
        }

        // Alapértelmezett stílusok
        specificStyles += `
            background-color: ${safeStyle.backgroundColor} !important;
            color: ${safeStyle.color} !important;
            font-weight: ${safeStyle.fontWeight} !important;
            font-size: ${safeStyle.fontSize} !important;
            text-align: ${safeStyle.textAlign} !important;
        `;

        const classStyles = safeStyle.className ? safeStyle.className.split(' ').map(cls => `.${cls}`).join('') : '';
        return `
            ${cellSelector}${classStyles} {
                ${specificStyles}
            }
            ${cellSelector}${classStyles} .cell-content {
                color: inherit !important; /* A cella stílusa felülírhatja */
                font-weight: inherit !important;
                font-size: inherit !important;
                text-align: inherit !important;
            }
        `;
    }).join('');
}

// Helper function to get CSS styles from class names
function getClassStyles(className) {
    if (!className) return '';

    let styles = '';

    // Ha van black-cell osztály, akkor speciális kezelés
    if (className.includes('black-cell')) {
        styles += `
            background-color: black !important;
            color: yellow !important;
            font-weight: bold !important;
            font-size: 16px !important;
        `;
    }

    // First row style (első sor)
    if (className.includes('first-row-style')) {
        styles += `
            text-align: center !important;
            font-size: 24px !important;
            background-color: #ffffff !important;
            color: black !important;
            font-weight: bold !important;
            text-decoration: underline !important;
            vertical-align: middle !important;
        `;
    }

    // 11. sor stílusa
    if (className.includes('eleventh-row-style')) {
        styles += `
            text-align: center !important;
            vertical-align: middle !important;
        `;
    }

    // Utolsó sor stílusa
    if (className.includes('last-row-style')) {
        styles += `
            font-weight: bold !important;
            background-color: lightgrey !important;
            font-size: 18px !important;
            text-align: center !important;
        `;
    }

    // Beszúrt sorok stílusa
    if (className.includes('beszurt-sor')) {
        styles += `
            height: 70px !important;
            color: black !important;
        `;
    }

    // Függőleges szöveg
    if (className.includes('vertical-text')) {
        styles += `
            writing-mode: vertical-lr !important;
        `;
    }

    // Középre igazított cella
    if (className.includes('cell-centered')) {
        styles += `
            text-align: center !important;
            vertical-align: middle !important;
        `;
    }

    return styles;
}

// Helper function to generate colgroup
function generateColgroup(columnSizes) {
    if (!Array.isArray(columnSizes)) return '';

    return columnSizes.map(size => `<col style="width: ${size}px;">`).join('');
}

// Enhanced table row generation with styling and page-break prevention
function generateTableRows(jsonData, originalMergeCells, rowSizes, columnSizes, cellStyles) {
    if (!Array.isArray(jsonData)) {
        console.log("Nincsenek táblázat adatok megadva.");
        return '';
    }

    let tableHtml = '';
    const rowCount = jsonData.length;
    const colCount = jsonData[0]?.length || 0;

    // Alakítsd át a mergeCells tömböt a createMergeMatrix által várt formátumra
    const formattedMergeCells = originalMergeCells ? originalMergeCells.map(merge => ({
        s: { r: merge.row, c: merge.col },
        e: { r: merge.row + merge.rowspan - 1, c: merge.col + merge.colspan - 1 }
    })) : [];

    const mergeMatrix = createMergeMatrix(formattedMergeCells, rowCount, colCount);

    const lastRowIndex = rowCount - 1;
    const lastTenRowsStartIndex = Math.max(0, rowCount - 10);

    jsonData.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) return;

        const rowHeight = Array.isArray(rowSizes) ? rowSizes[rowIndex] : 'auto';
        let rowClassNames = '';
        if (rowIndex === 0) rowClassNames = ' first-row';
        else if (rowIndex === lastRowIndex) rowClassNames = ' last-row';
        if (rowIndex >= 11 && rowIndex < lastTenRowsStartIndex) {
            const isEvenFromStart = (rowIndex - 11) % 2 === 0;
            rowClassNames += isEvenFromStart ? ' even-row' : ' odd-row';
        }
        const isCriticalRow = rowIndex >= lastTenRowsStartIndex - 5 && rowIndex < lastTenRowsStartIndex;
        let rowStyle = `height: ${rowHeight}px; page-break-inside: avoid !important;`;
        if (rowIndex === 10 || rowIndex === rowCount - 9) {
        }
        tableHtml += `<tr class="${rowClassNames}" style="${rowStyle}" ${isCriticalRow ? `data-critical-row="true" data-row-position="${rowCount - rowIndex}"` : ''}>`;

        row.forEach((cellValue, colIndex) => {
            const mergeInfo = mergeMatrix[rowIndex]?.[colIndex];
            if (mergeInfo && !mergeInfo.isMain) {
                return;
            }

            const style = Array.isArray(cellStyles) ?
                cellStyles.find(style => style?.row === rowIndex && style?.col === colIndex) :
                null;
            let styleClass = style ? ` cell-style-${cellStyles.indexOf(style)}` : '';
            const isBlackCell = style && (style.backgroundColor === 'black' || style.backgroundColor === '#000000' || style.backgroundColor === 'rgb(0, 0, 0)' || (style.className && style.className.includes('black-cell')));
            if (isBlackCell) styleClass += ' black-cell';
            if (cellValue === undefined || cellValue === null || cellValue === '') styleClass += ' empty-cell';
            if (rowIndex === 0) styleClass += ' first-row-style';
            if (rowIndex === 10) styleClass += ' eleventh-row-style';
            if (rowIndex === lastRowIndex) styleClass += ' last-row-style';
            if (rowIndex >= 11 && rowIndex < lastTenRowsStartIndex) styleClass += ' beszurt-sor';
            if (style?.className?.includes('vertical-text')) styleClass += ' vertical-text';
            if (style?.textAlign === 'center') styleClass += ' cell-centered';
            const rotation = style?.rotation / 2 || 0;
            const rotationClass = (rotation === 90 || rotation === 270) ? ' rotated-image-cell' : '';
            const width = Array.isArray(columnSizes) ? columnSizes[colIndex] : 'auto';
            const cellHeight = rowHeight !== 'auto' ? rowHeight : 'auto';
            const rowspanAttr = mergeInfo?.isMain && mergeInfo.rowspan > 1 ? ` rowspan="${mergeInfo.rowspan}"` : '';
            const colspanAttr = mergeInfo?.isMain && mergeInfo.colspan > 1 ? ` colspan="${mergeInfo.colspan}"` : '';
            const cellContent = processCellContent(cellValue, width, cellHeight, rowIndex, colIndex, cellStyles);
            let cellStyleAttr = `width: ${width}px; height: ${cellHeight}px; color: black !important;`;

            if (rowIndex === 0 || (rowIndex >= lastTenRowsStartIndex && colIndex >= 3)) {
                cellStyleAttr += ` border: none !important; outline: none !important; box-shadow: none !important;`;
            } else if (isBlackCell) {
                cellStyleAttr += ` background-color: black !important; color: yellow !important; border: 2px solid yellow !important; outline: 1px solid yellow !important; box-shadow: 0 0 0 0.5px yellow, inset 0 0 0 0.5px yellow !important; position: relative; z-index: 1;`;
            } else if (rowIndex >= 11 && rowIndex < lastTenRowsStartIndex) {
                const isEvenFromStart = (rowIndex - 11) % 2 === 0;
                const defaultBgColor = isEvenFromStart ? 'white' : '#D7D7D7';
                const bgColor = (style?.backgroundColor && style.backgroundColor !== 'inherit' && style.backgroundColor !== '') ? style.backgroundColor : defaultBgColor;
                cellStyleAttr += ` background-color: ${bgColor} !important; text-align: center !important;`;
            } else if (style?.backgroundColor && style.backgroundColor !== 'inherit' && style.backgroundColor !== '') {
                cellStyleAttr += ` background-color: ${style.backgroundColor} !important;`;
            }

            const cellClassAttr = `class="merged-cell${styleClass}${rotationClass}"`;
            tableHtml += `<td ${cellClassAttr}${rowspanAttr}${colspanAttr} style="${cellStyleAttr}">${cellContent}</td>`;
        });

        tableHtml += '</tr>';
    });

    return tableHtml;
}

// Helper function to process cell content (MÓDOSÍTOTT)
function processCellContent(value, width, height, rowIndex, colIndex, cellStyles) {
    if (value === undefined || value === null || value === '') {
        return `<div class="cell-content empty-content" style="min-height: ${height}px; padding: 5px !important;">&nbsp;</div>`;
    }

    const stringValue = String(value);

    // Két típusú képre figyelünk: Data URI-k VAGY GCS URL-ek
    if (stringValue.startsWith('data:image') || stringValue.startsWith('https://storage.googleapis.com/')) {
        let imgSrc = stringValue;

        // FONTOS VÁLTOZÁS: Ezt a teljes `if (stringValue.startsWith('/uploads/'))` blokkot
        // el lehet TÁVOLÍTANI, mivel már nem a helyi fájlrendszerről olvasunk be képeket.
        // A képek URL-jei közvetlenül a GCS-ből érkeznek, és a Puppeteer be tudja tölteni őket.
        /*
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
        */

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

// Helper function to create merge matrix (EZT NEM KELL MÓDOSÍTANI)
function createMergeMatrix(mergedCells, rowCount, colCount) {
    const matrix = Array.from({ length: rowCount }, () => Array(colCount).fill(null));
    if (!Array.isArray(mergedCells)) {
        console.log("Nincsenek egyesített cellák megadva.");
        return matrix;
    }

    mergedCells.forEach(merge => {
        if (!merge || !merge.s || !merge.e) {
            console.warn("Érvénytelen egyesítési bejegyzés:", merge);
            return;
        }
        const { s: start, e: end } = merge;
        for (let r = start.r; r <= end.r; r++) {
            for (let c = start.c; c <= end.c; c++) {
                if (r >= rowCount || c >= colCount) {
                    console.warn(`Az egyesítési bejegyzés érvénytelen indexeket tartalmaz (sor: ${r}, oszlop: ${c}). Táblázat méretei: sorok=${rowCount}, oszlopok=${colCount}.`);
                    continue;
                }
                matrix[r][c] = {
                    isMain: r === start.r && c === start.c,
                    rowspan: end.r - start.r + 1,
                    colspan: end.c - start.c + 1,
                    start: start
                };
            }
        }
    });
    return matrix;
}

// A router ÉS az inicializálási promise exportálása
// Ez a legfontosabb változtatás, hogy a server.js tudja várni az inicializálást
module.exports = {
    router: router,
    initializationPromise: initializeGoogleServices() // Ez elindítja az inicializálást és visszaadja a Promise-t
};


