require("dotenv").config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { Pool } = require('pg');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const PdfPrinter = require('pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts.js');
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




//PDFmaker pdf generálás
// Fontok betöltése a Pdfmake számára
const fonts = {
    Roboto: {
        normal: path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'),
        bold: path.join(__dirname, 'fonts', 'Roboto-Medium.ttf'),
        italics: path.join(__dirname, 'fonts', 'Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, 'fonts', 'Roboto-MediumItalic.ttf')
    }
    // Ha más fontokat is használsz, itt add hozzá őket.
    // Fontos, hogy ezek a .ttf fájlok létezzenek a megadott 'fonts' mappában.
    // Alapértelmezetten a Pdfmake a Roboto-t használja. Ha nincs, akkor az alapértelmezett beállítások nem fognak működni.
    // Javaslom, hogy töltsd le a Roboto fontokat (Regular, Medium, Italic, MediumItalic) és tedd egy 'fonts' mappába az app gyökerébe.
};

const printer = new PdfPrinter(fonts);

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// createMergeMatrix segédfüggvény
function createMergeMatrix(mergedCells, rowCount, colCount) {
    // A mátrixot a teljes colCount-ra (12) inicializáljuk
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
                // Csak a sorindexet kell ellenőrizni a rowCount-hoz képest.
                // Az oszlopindexet nem kell ellenőrizni a colCount-hoz képest ITT,
                // mert a colCount már a táblázat max szélességét jelenti,
                // és a merge definíciónak bele kell férnie ebbe a szélességbe.
                // Ha mégis túlnyúlik, az adat forrása a hibás, nem a mátrix építése.
                if (r >= rowCount) { // Ha az egyesítés túlnyúlik a rowCount-on, az hiba
                    console.warn(`Az egyesítési bejegyzés túlnyúlik a sorokon (sor: ${r}). Táblázat méretei: sorok=${rowCount}, oszlopok=${colCount}.`);
                    continue; // Kihagyjuk ezt a cellát az egyesítésben, ha soron kívül esik
                }

                // Biztosítjuk, hogy a c index ne lépje túl a colCount-ot, mielőtt hozzáférünk a matrix[r][c]-hez
                // Ez egy biztonsági ellenőrzés, ha a mergeCells hibásan definiált c-t.
                // DE: A mátrix már colCount széles, tehát nem szabadna "kihagyni",
                // csak ha maga a merge bejegyzés hibás.
                if (c >= colCount) {
                    console.warn(`Az egyesítési bejegyzés túlnyúlik az oszlopokon (oszlop: ${c}). Táblázat méretei: sorok=${rowCount}, oszlopok=${colCount}. Ez a cella nem lesz feldolgozva a merge matrixban.`);
                    // Itt nem continue-t írunk, mert ha maga a merge bejegyzés rossz,
                    // akkor azt jelezzük, de nem rontjuk el a merge matrixot.
                    // A Pdfmake majd hibát dob, ha rosszul van definiálva a colSpan/rowSpan.
                    break; // Kilépünk a belső oszlopciklusból, ha túlnyúlik, mert a többi "c" érték is az lenne
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

async function generatePdfmakeReport(jsonData, originalMergeCells, columnSizes, rowSizes, cellStyles, downloadedImages = {}) {
    // columnSizes konvertálása Pdfmake szélességekké (px -> pt)
    const widths = columnSizes.map(size => {
        if (typeof size === 'string' && size.endsWith('px')) {
            return parseFloat(size) * 0.75; // 1px = 0.75pt
        } else if (size === 'auto' || size === '*') {
            return '*';
        }
        return size; // Feltételezzük, hogy már pt-ben van, ha nem string
    });

    const tableBody = [];
    const heights = []; // Itt gyűjtjük a sorok magasságát
    const rowCount = jsonData.length;
    const colCount = widths.length; // Ez már helyesen a widths.length

    // Merge matrix létrehozása
    const formattedMergeCells = originalMergeCells ? originalMergeCells.map(merge => ({
        s: { r: merge.row, c: merge.col },
        e: { r: merge.row + merge.rowspan - 1, c: merge.col + merge.colspan - 1 }
    })) : [];
    // A createMergeMatrix függvénynek továbbra is a legutóbbi javasolt verzióját használjuk.
    const mergeMatrix = createMergeMatrix(formattedMergeCells, rowCount, colCount);

    const lastRowIndex = rowCount - 1;
    const lastTenRowsStartIndex = Math.max(0, rowCount - 10); // Utolsó 10 sor kezdete

    for (let r = 0; r < rowCount; r++) {
        const rowContent = [];
        const rowHeight = Array.isArray(rowSizes) && rowSizes[r] !== undefined ? parseFloat(rowSizes[r]) * 0.75 : 'auto'; // Konvertálás pt-re
        heights.push(rowHeight); // Hozzáadjuk a magasságot a heights tömbhöz

        console.log(`--- Processing Row ${r} ---`);
        for (let c = 0; c < colCount; c++) {
            const mergeInfo = mergeMatrix[r]?.[c];

            // >>>>>> LÉNYEGES VÁLTOZTATÁS ITT: <<<<<<
            // Ha ez a cella egy egyesített cella része, és NEM a "fő" cella,
            // akkor egy _span: true objektumot adunk hozzá.
            if (mergeInfo && !mergeInfo.isMain) {
                console.log(`Adding _span: true for cell [${r},${c}] because it's part of a merge but not main.`);
                rowContent.push({ _span: true }); // Hozzáadjuk a _span objektumot
                continue; // Folytatjuk a ciklust a következő oszlopra
            }

            let cellValue = (jsonData[r] && jsonData[r][c] !== undefined) ? jsonData[r][c] : '';
            let cellContent = {
                text: '',
                alignment: 'center',
                verticalAlignment: 'middle',
                margin: [5, 5, 5, 5], // Alapértelmezett padding a .cell-content-hez (5px -> 3.75pt)
                fillColor: 'white',
                color: 'black',
                bold: false,
                fontSize: 10.2 // 0.85em = ~10.2pt
            };

            // Hozzáadjuk a rowSpan és colSpan tulajdonságokat, ha az aktuális cella egy egyesített cella "fő" cellája
            if (mergeInfo && mergeInfo.isMain) {
                if (mergeInfo.rowspan > 1) cellContent.rowSpan = mergeInfo.rowspan;
                if (mergeInfo.colspan > 1) cellContent.colSpan = mergeInfo.colspan;
                console.log(`Cell [${r},${c}] is main merge cell. rowSpan: ${cellContent.rowSpan}, colSpan: ${cellContent.colSpan}`);
            } else {
                console.log(`Cell [${r},${c}] is a regular cell.`);
            }

            // Cella specifikus stílusok keresése (cellStyles tömbből)
            const specificCellStyle = cellStyles.find(style => style?.row === r && style?.col === c);
            const className = specificCellStyle?.className || ''; // getClassStyles logikához

            // Kezdeti cella tartalom beállítása (szöveg vagy kép)
            if (typeof cellValue === 'object' && cellValue.image) {
                const imgSource = downloadedImages[cellValue.image]; // Feltételezzük, hogy már Base64
                if (imgSource) {
                    cellContent.image = imgSource;
                    const rotation = cellValue.rotation || 0; // Képrotáció
                    cellContent.rotation = rotation;
                    cellContent.alignment = 'center';
                    cellContent.margin = [0, 0, 0, 0]; // Kép esetén nincs padding

                    if (rotation === 90 || rotation === 270) {
                        cellContent.fit = [parseFloat(rowSizes[r]) * 0.75, parseFloat(columnSizes[c]) * 0.75];
                    } else {
                        cellContent.fit = [parseFloat(columnSizes[c]) * 0.75, parseFloat(rowSizes[r]) * 0.75];
                    }
                    delete cellContent.text; // Kép esetén nincs szöveg
                } else {
                    cellContent.text = { text: 'Kép nem található', color: 'red' };
                }
            } else {
                cellContent.text = escapeHtml(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
            }

            // Különleges stílusok alkalmazása az egyes osztályok/feltételek alapján
            let currentFillColor = cellContent.fillColor;
            let currentTextColor = cellContent.color;

            const isBlackCell = (specificCellStyle && (specificCellStyle.backgroundColor === 'black' || specificCellStyle.backgroundColor === '#000000' || specificCellStyle.backgroundColor === 'rgb(0, 0, 0)')) || className.includes('black-cell');

            if (isBlackCell) {
                currentFillColor = 'black';
                currentTextColor = 'yellow';
                cellContent.bold = true;
                cellContent.border = [true, true, true, true];
                cellContent.borderColor = ['yellow', 'yellow', 'yellow', 'yellow'];
            }

            if (r <= 2) {
                cellContent.border = [false, false, false, false];
                currentFillColor = 'white';
                currentTextColor = 'black';
                cellContent.margin = [0, 0, 0, 0];
            }

            if (isBlackCell && r <= 2) {
                currentFillColor = 'white';
                currentTextColor = 'black';
                cellContent.border = [false, false, false, false];
                cellContent.bold = false;
            }

            if (r >= 11 && r < lastTenRowsStartIndex) {
                if (!isBlackCell || (isBlackCell && r <= 2)) {
                    const isEven = (r - 11) % 2 === 0;
                    currentFillColor = isEven ? '#D7D7D7' : 'white';
                    currentTextColor = 'black';
                }
                currentTextColor = 'black';
            }

            if (r >= lastTenRowsStartIndex && c >= 3) {
                cellContent.border = [false, false, false, false];
                cellContent.fillColor = 'white';
                cellContent.color = 'black';
            }

            if (r === 0) {
                cellContent.alignment = 'center';
                currentFillColor = 'white';
                currentTextColor = 'black';
                cellContent.bold = true;
                if (c === 3) {
                    if (typeof cellContent.text === 'object' && cellContent.text.text) {
                        cellContent.text.decoration = 'underline';
                        cellContent.text.fontSize = 28;
                    } else {
                        cellContent.text = {
                            text: cellContent.text,
                            decoration: 'underline',
                            fontSize: 28,
                            alignment: 'center',
                        };
                    }
                }
            }

            if (r === 10) {
                cellContent.alignment = 'center';
                cellContent.verticalAlignment = 'middle';
            }

            if (r === lastRowIndex) {
                cellContent.bold = true;
                currentFillColor = 'lightgrey';
                cellContent.fontSize = 18 * 0.75;
                cellContent.alignment = 'center';
                cellContent.border = [true, true, true, true];
                cellContent.borderColor = ['#000', '#000', '#000', '#000'];
            }

            if (c === 0 && (r === 10 || r === (rowCount - 10))) {
                if (typeof cellContent.text === 'object' && cellContent.text.text) {
                    cellContent.text.rotation = 270;
                    cellContent.text.alignment = 'center';
                } else {
                    cellContent.text = {
                        text: cellContent.text,
                        rotation: 270,
                        alignment: 'center',
                    };
                }
                if (isBlackCell && r > 2) {
                    currentTextColor = 'yellow';
                }
                cellContent.margin = [0, 0, 0, 0];
            }

            if (specificCellStyle?.textAlign === 'center') {
                cellContent.alignment = 'center';
                cellContent.verticalAlignment = 'middle';
            }

            if (r >= 1 && r <= 6) {
                cellContent.alignment = 'left';
            }

            if (specificCellStyle) {
                if (specificCellStyle.backgroundColor && specificCellStyle.backgroundColor !== 'inherit' && specificCellStyle.backgroundColor !== '') {
                    currentFillColor = specificCellStyle.backgroundColor;
                }
                if (specificCellStyle.color && specificCellStyle.color !== 'inherit') {
                    currentTextColor = specificCellStyle.color;
                }
                if (specificCellStyle.fontWeight === 'bold') cellContent.bold = true;
                if (specificCellStyle.fontSize) cellContent.fontSize = parseFloat(specificCellStyle.fontSize) * 0.75;
                if (specificCellStyle.textAlign) cellContent.alignment = specificCellStyle.textAlign;
            }

            cellContent.fillColor = currentFillColor;
            cellContent.color = currentTextColor;

            if ((cellValue === undefined || cellValue === null || cellValue === '') && !cellContent.image) {
                cellContent.margin = [5, 5, 5, 5];
            }

            rowContent.push(cellContent);
            console.log(`Pushed cell [${r},${c}] to rowContent. Current rowContent length: ${rowContent.length}`);
        }
        console.log(`--- Finished Row ${r}. Final rowContent length: ${rowContent.length}, expected total columns: ${widths.length} ---`);
        tableBody.push(rowContent);
    }

    const docDefinition = {
        pageMargins: [40, 40, 40, 40],
        content: [
            {
                table: {
                    widths: widths,
                    body: tableBody,
                    heights: heights
                },
                layout: {
                    hLineWidth: function (i, node) {
                        if (i === 0 || i === node.table.body.length) {
                            return 2;
                        }
                        return 0.75;
                    },
                    vLineWidth: function (i, node) {
                        if (i === 0 || i === node.table.widths.length) {
                            return 2;
                        }
                        return 0.75;
                    },
                    hLineColor: function (i, node) {
                        return 'black';
                    },
                    vLineColor: function (i, node) {
                        return 'black';
                    },
                    paddingLeft: function (i, node) { return 0; },
                    paddingRight: function (i, node) { return 0; },
                    paddingTop: function (i, node) { return 0; },
                    paddingBottom: function (i, node) { return 0; },
                }
            }
        ],
        defaultStyle: {
            font: 'Roboto',
            fontSize: 10.2,
            alignment: 'center',
            verticalAlignment: 'middle'
        },
        styles: {
        }
    };

    return docDefinition;
}

// --- PDFmaker pdf generálás GET végpont ---
router.get('/:projectId/download-pdf', async (req, res) => {
    const { projectId } = req.params;

    let tempFilePath;
    let fileName; // Deklarációk a try blokkon kívülre, hogy a finally blokkban elérhetőek legyenek

    try {
        const projectResult = await pool.query(
            'SELECT name FROM projects WHERE id = $1',
            [projectId]
        );

        if (projectResult.rows.length === 0) {
            return res.status(404).send('A projekt nem található.');
        }

        const projectName = projectResult.rows[0].name;
        const invalidFileChars = /[\/\\?%*:|"<>]/g;
        const safeProjectName = projectName.replace(invalidFileChars, '_');

        fileName = `IWS_Solutions_Munkavedelmi_ellenorzesi_jegyzokonyv_${safeProjectName}.pdf`;
        const tempDir = path.join(__dirname, 'temp'); // A temp mappa elérési útja
        tempFilePath = path.join(tempDir, fileName); // A teljes fájl elérési útja

        // *** A HIÁNYZÓ MAPPA LÉTREHOZÁSÁNAK KEZELÉSE ***
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true }); // Létrehozza a temp mappát és az összes hiányzó szülőt
            console.log(`📂 Létrehozva a temp mappa: ${tempDir}`);
        }

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

        // Képek letöltése és Base64-be konvertálása (Pdfmake számára)
        const downloadedImages = {};
        let imageUrlsToDownload = [];

        function findImageUrls(data) {
            if (Array.isArray(data)) {
                data.forEach(item => findImageUrls(item));
            } else if (typeof data === 'object' && data !== null) {
                if (data.image && typeof data.image === 'string' && data.image.startsWith('https://storage.googleapis.com/')) {
                    imageUrlsToDownload.push(data.image);
                }
                for (const key in data) {
                    if (Object.prototype.hasOwnProperty.call(data, key)) {
                        findImageUrls(data[key]);
                    }
                }
            }
        }
        findImageUrls(jsonData);
        const uniqueImageUrls = [...new Set(imageUrlsToDownload)]; // Egyedi URL-ek

        if (uniqueImageUrls.length > 0) {
            console.log(`📸 ${uniqueImageUrls.length} egyedi kép található a táblázatban (GCS-ről), letöltés indítása a PDF-hez...`);
            const downloadPromises = uniqueImageUrls.map(async (imageUrl) => {
                try {
                    // Itt hívjuk a downloadImageFromUrl függvényt
                    const imageBuffer = await downloadImageFromUrl(imageUrl);
                    const base64Image = `data:${getMimeType(path.basename(imageUrl))};base64,${imageBuffer.toString('base64')}`;
                    downloadedImages[imageUrl] = base64Image;
                    console.log(`✅ Kép letöltve és Base64-re konvertálva a PDF-hez: ${imageUrl}`);
                } catch (imgDownloadErr) {
                    console.error(`❌ Hiba a kép letöltésekor a PDF-hez (${imageUrl}): ${imgDownloadErr.message}`);
                    downloadedImages[imageUrl] = null; // Jelöljük hibásként
                }
            });
            await Promise.all(downloadPromises);
            console.log('🎉 Összes kép letöltve és előkészítve a PDF-hez.');
        } else {
            console.log('⚠️ Nincsenek GCS képek a táblázatban a PDF-hez, letöltés kihagyva.');
        }

        // --- PDF generálás Pdfmake-kel ---
        const docDefinition = await generatePdfmakeReport(
            jsonData,
            mergedCells,
            columnSizes,
            rowSizes,
            cellStyles,
            downloadedImages // Átadjuk a letöltött Base64 képeket a Pdfmake-nek
        );

        console.log('DEBUG: printer object:', printer);
        console.log('DEBUG: printer.createPdfKitDocument type:', typeof printer.createPdfKitDocument);

        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        // PDF fájl írása az ideiglenes helyre
        const writeStream = fs.createWriteStream(tempFilePath);
        pdfDoc.pipe(writeStream);

        // Várjuk meg, amíg a PDF teljesen kiíródik, mielőtt feltöltjük vagy elküldjük
        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log('✅ PDF sikeresen generálva ideiglenes fájlba:', tempFilePath);
                // **IDE** illesztettük be a késleltetést a resolve() előtt
                setTimeout(() => resolve(), 200); // Várjunk 200 ms-ot, hátha a fájlrendszernek kell egy kis idő
            });
            writeStream.on('error', (err) => {
                console.error('❌ Hiba az ideiglenes PDF fájl írásakor:', err);
                reject(err);
            });
            pdfDoc.end(); // Fontos: le kell zárni a pdfDoc stream-et!
        });

        // **IDE** illesztettük be a fájl létezésének ellenőrzését közvetlenül az olvasás előtt
        if (!fs.existsSync(tempFilePath)) {
            console.error('🔴 HIBA: A PDF fájl nem található, holott a generálás sikeresnek tűnt!');
            // Ez egy kritikus hiba, ezért 500-as státuszt küldünk
            return res.status(500).send('Hiba történt: a generált PDF fájl nem található, letöltés sikertelen.');
        }

        // --- Google Drive feltöltés ---
        // Csak akkor próbáljuk meg feltölteni a Google Drive-ra, ha a driveService inicializálva van.
        // Ez megakadályozza, hogy a kód leálljon, ha a Drive integráció nincs beállítva.
        if (typeof driveService !== 'undefined' && typeof MAIN_DRIVE_FOLDER_ID !== 'undefined') {
            try {
                console.log('📂 PDF feltöltés indítása a Google Drive-ra: fájl =', fileName);
                console.log('📁 Cél projekt mappa:', safeProjectName);
                console.log('📁 Szülő mappa ID:', MAIN_DRIVE_FOLDER_ID);

                // Próbáljuk meg listázni a parent mappát, hogy ellenőrizzük az elérhetőséget
                const testAccess = await driveService.files.get({
                    fileId: MAIN_DRIVE_FOLDER_ID,
                    fields: 'id, name'
                }).catch(err => {
                    console.error("❌ NEM elérhető a MAIN_DRIVE_FOLDER_ID mappa a service account számára!");
                    throw new Error("A service account nem fér hozzá a gyökérmappához. Ellenőrizd a megosztást!");
                });
                console.log("✅ Elérhető a fő mappa:", testAccess.data.name);

                // Ellenőrizzük, hogy létezik-e a projekt mappa a Google Drive-on (VAGY LÉTREHOZZUK)
                // Figyelem: Ha a getOrCreateFolder hibája okozza a problémát, itt fogja elkapni a "ReferenceError" hiba.
                const projectFolderId = await getOrCreateFolder(safeProjectName, MAIN_DRIVE_FOLDER_ID);
                console.log('📁 Projekt mappa ID:', projectFolderId);

                // Létrehozzuk az aznapi dátumozott mappát (adott esetben törli, ha már létezik)
                const dailyFolderId = await createDailyFolder(projectFolderId);
                console.log('📁 Aznapi mappa ID:', dailyFolderId);

                // PDF feltöltése az aznapi mappába
                const uploadResult = await uploadFileToDrive(tempFilePath, fileName, dailyFolderId, 'application/pdf');
                console.log('✅ PDF feltöltés sikeres a Drive-ra! Drive URL:', uploadResult.webViewLink);

                // --- Képek összegyűjtése és feltöltése a Drive-ra (ha szükséges) ---
                if (uniqueImageUrls.length > 0) {
                    console.log(`📸 ${uniqueImageUrls.length} egyedi kép feltöltése a Drive-ra...`);
                    const uploadImagePromises = uniqueImageUrls.map(async (imageUrl) => {
                        const imageFileName = path.basename(new URL(imageUrl).pathname);
                        try {
                            const imageBuffer = await downloadImageFromUrl(imageUrl);
                            const imageMimeType = getMimeType(imageFileName);
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
                }
            } catch (uploadErr) {
                console.error('❌ Hiba a Google Drive feltöltésnél:', uploadErr.message);
                console.error('📄 Részletek:', uploadErr);
                // Itt logoljuk a Drive feltöltési hibát, de nem állítjuk le a PDF letöltését
            }
        } else {
            console.warn('⚠️ Google Drive API vagy MAIN_DRIVE_FOLDER_ID nincs inicializálva. PDF/Kép feltöltés a Drive-ra kihagyva.');
        }

        // PDF válaszként küldése letöltéshez (most már az ideiglenesen mentett fájlból streameljük)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        fs.createReadStream(tempFilePath).pipe(res);

    } catch (error) {
        console.error('❌ Hiba a PDF generálás során:', error.message);
        res.status(500).send('Hiba történt a PDF generálása során: ' + error.message);
    } finally {
        // Fontos: Töröld az ideiglenes fájlt, miután elküldted a választ!
        // Aszinkron törlés, hogy ne blokkolja a fő szálat.
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, (err) => {
                if (err) console.error('❌ Hiba az ideiglenes fájl törlésekor:', err);
                else console.log('🗑️ Ideiglenes fájl törölve:', tempFilePath);
            });
        }
    }
});

// A router ÉS az inicializálási promise exportálása
// Ez a legfontosabb változtatás, hogy a server.js tudja várni az inicializálást
module.exports = {
    router: router,
    initializationPromise: initializeGoogleServices() // Ez elindítja az inicializálást és visszaadja a Promise-t
};