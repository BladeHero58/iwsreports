require("dotenv").config();

const express = require('express');
const multer = require('multer');
const fs = require('fs');
// const { Pool } = require('pg'); // Ezt a sort már korábban törölni/kommentelni kellett!
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');
const PdfPrinter = require('pdfmake');
const pdfFonts = require('pdfmake/build/vfs_fonts.js');
const sharp = require('sharp');
const path = require('path');
const stream = require('stream');
const { createCanvas, loadImage } = require('canvas');
const mime = require('mime-types');
//const { getOrCreateFolder, uploadPdfToDrive, driveService, uploadImagesToDrive, createDailyFolder } = require('./googleDrive');
const axios = require('axios');
const { google } = require('googleapis')
const MAIN_DRIVE_FOLDER_ID = '1yc0G2dryo4XZeHmZ3FzV4yG4Gxjj2w7j'; // Állítsd be a saját főmappa ID-t!

const { Storage } = require('@google-cloud/storage');

// PostgreSQL konfiguráció
// A db.js fájlból importáljuk a pool objektumot.
// Ezt a sort kell használni, és ez váltja ki a korábbi, hibás deklarációkat.
const { pool } = require('./db'); // <-- EZ A HELYES ÉS EGYETLEN IMPORTÁLÁS A POOL OBJEKTUMHOZ! ÉLES

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

// ÚJ ENDPOINT: PDF generálása a mentett adatokból
router.get("/generate-pdf/:reportId", async (req, res) => {
    const { reportId } = req.params;

    try {
        // 1. Lekérjük az adatokat az adatbázisból
        const result = await pool.query('SELECT data, merge_cells, column_sizes, row_sizes, cell_styles FROM report_data WHERE report_id = $1', [reportId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Jelentés nem található." });
        }

        const reportData = result.rows[0];
        const jsonData = reportData.data; // Ez a `data` mező, ami már eleve JSON string, tehát parse-olni kell
        const mergeCells = reportData.merge_cells;
        const columnSizes = reportData.column_sizes;
        const rowSizes = reportData.row_sizes;
        const cellStyles = reportData.cell_styles;

        // 2. Képek keresése és letöltése Base64 formában
        const downloadedImages = {};
        const imagePromises = [];

        if (Array.isArray(jsonData)) { // Fontos: jsonData már parse-olt kell legyen
            for (const row of jsonData) {
                if (Array.isArray(row)) {
                    for (const cell of row) {
                        let imageUrl = null;
                        if (typeof cell === 'object' && cell !== null && cell.image && typeof cell.image === 'string' && cell.image.startsWith('https://storage.googleapis.com/')) {
                            imageUrl = cell.image;
                        } else if (typeof cell === 'string' && cell.startsWith('https://storage.googleapis.com/')) {
                            imageUrl = cell;
                        }

                        if (imageUrl && !downloadedImages[imageUrl]) {
                            imagePromises.push(
                                axios.get(imageUrl, { responseType: 'arraybuffer' })
                                    .then(response => {
                                        const contentType = response.headers['content-type'];
                                        const base64Image = `data:${contentType};base64,` + Buffer.from(response.data).toString('base64');
                                        downloadedImages[imageUrl] = base64Image;
                                        console.log(`Successfully downloaded and converted image: ${imageUrl}`);
                                    })
                                    .catch(error => {
                                        console.error(`Error downloading image ${imageUrl}:`, error.message);
                                        downloadedImages[imageUrl] = null; // Jelöljük, hogy sikertelen volt a letöltés
                                    })
                            );
                        }
                    }
                }
            }
        }

        await Promise.all(imagePromises); // Várjuk meg az összes kép letöltését

        // 3. Pdfmake riport generálása
        // Fontos: a jsonData, mergeCells, columnSizes, rowSizes, cellStyles paramétereknek
        // parse-olt JSON objektumoknak kell lenniük, ha az adatbázis stringként tárolja őket.
        const docDefinition = await generatePdfmakeReport(
            jsonData, 
            mergeCells, // Ezeknek már objektumnak kell lenniük, ha az adatbázis JSON stringből parse-olta őket
            columnSizes, 
            rowSizes, 
            cellStyles, 
            downloadedImages
        );

        // 4. PDF létrehozása és küldése
        const pdfDoc = printer.createPdfKitDocument(docDefinition);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}.pdf"`);

        // PDF stream-elése közvetlenül a válaszba
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (error) {
        console.error("Hiba a PDF generálása során:", error);
        res.status(500).json({ success: false, message: "Hiba történt a PDF generálása során.", error: error.message });
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

// A createMergeMatrix segédfüggvényre szükség van
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
                if (r >= rowCount) {
                    console.warn(`Az egyesítési bejegyzés túlnyúlik a sorokon (sor: ${r}). Táblázat méretei: sorok=${rowCount}, oszlopok=${colCount}.`);
                    continue;
                }
                if (c >= colCount) {
                    console.warn(`Az egyesítési bejegyzés túlnyúlik az oszlopokon (oszlop: ${c}). Táblázat méretei: sorok=${rowCount}, oszlopok=${colCount}. Ez a cella nem lesz feldolgozva a merge matrixban.`);
                    break;
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

// A escapeHtml függvényre is szükség van
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Elforgatja a szöveget canvas segítségével és képpé alakítja
 * @param {string} text - A szöveg amit el szeretnénk forgatni
 * @param {number} rotation - Forgatási szög fokokban (0, 90, 180, 270)
 * @param {object} options - Szöveg stílus opciók (fontSize, color, bold, etc.)
 * @returns {Promise<string>} - Elforgatott szöveg Base64 kép formátumban
 */
async function rotateTextWithCanvas(text, rotation = 90, options = {}) {
    if (!text || !rotation || rotation === 0 || rotation === 360) {
        return null; // Nincs szöveg vagy forgatás, marad szövegként
    }

    try {
        const {
            fontSize = 5,
            color = 'black',
            bold = false,
            fontFamily = 'Arial',
            backgroundColor = 'transparent',
            padding = 1
        } = options;

        // Ideiglenes canvas a szöveg méretének meghatározásához
        const tempCanvas = createCanvas(1, 1);
        const tempCtx = tempCanvas.getContext('2d');
        
        // Font beállítása
        const fontWeight = bold ? 'bold' : 'normal';
        tempCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        
        // Szöveg méretének mérése
        const metrics = tempCtx.measureText(text);
        const textWidth = metrics.width;
        const textHeight = fontSize; // Közelítő magasság
        
        // Canvas mérete a forgatás figyelembevételével
        let canvasWidth, canvasHeight;
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        
        if (normalizedRotation === 90 || normalizedRotation === 270) {
            canvasWidth = textHeight + (padding * 2);
            canvasHeight = textWidth + (padding * 2);
        } else {
            canvasWidth = textWidth + (padding * 2);
            canvasHeight = textHeight + (padding * 2);
        }
        
        // Tényleges canvas létrehozása
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        // Háttér beállítása
        if (backgroundColor !== 'transparent') {
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        }
        
        // Szöveg stílus beállítása
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Canvas középpontjának beállítása és forgatás
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.rotate((normalizedRotation * Math.PI) / 180);
        
        // Szöveg rajzolása
        ctx.fillText(text, 0, 0);
        
        // Visszaalakítás Base64-re
        const rotatedTextImage = canvas.toDataURL('image/png');
        return rotatedTextImage;
        
    } catch (error) {
        console.error('Hiba a szöveg forgatása során:', error);
        return null; // Hiba esetén marad szövegként
    }
}

/**
 * Elforgatja a képet a megadott szöggel canvas segítségével (Node.js verzió)
 * @param {string} base64Image - Base64 kódolt kép (data:image/...)
 * @param {number} rotation - Forgatási szög fokokban (0, 90, 180, 270)
 * @returns {Promise<string>} - Elforgatott kép Base64 formátumban
 */
async function rotateImageWithCanvas(base64Image, rotation) {
    // Ha nincs forgatás, visszaadjuk az eredeti képet
    if (!rotation || rotation === 0 || rotation === 360) {
        return base64Image;
    }

    try {
        // Base64-ből Buffer-re konvertálás
        const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        // Kép betöltése
        const img = await loadImage(imageBuffer);
        
        // Normalizáljuk a forgatást
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        const radians = (normalizedRotation * Math.PI) / 180;
        
        // Canvas létrehozása
        let canvas;
        if (normalizedRotation === 90 || normalizedRotation === 270) {
            canvas = createCanvas(img.height, img.width);
        } else {
            canvas = createCanvas(img.width, img.height);
        }
        
        const ctx = canvas.getContext('2d');
        
        // Canvas középpontjának beállítása és forgatás
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(radians);
        
        // Kép rajzolása (középpontból)
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        // Visszaalakítás Base64-re
        const rotatedBase64 = canvas.toDataURL('image/png');
        return rotatedBase64;
        
    } catch (error) {
        console.error('Hiba a kép forgatása során:', error);
        return base64Image; // Hiba esetén visszaadjuk az eredeti képet
    }
}

async function generatePdfmakeReport(jsonData, originalMergeCells, columnSizes, rowSizes, cellStyles, downloadedImages = {}) {
    // PDF lapméretek A4-hez (pontban)
    const A4_WIDTH_PT = 595.28;
    const PAGE_MARGIN_HORIZONTAL = 40; // 40pt bal + 40pt jobb margó
    const AVAILABLE_CONTENT_WIDTH = A4_WIDTH_PT - (2 * PAGE_MARGIN_HORIZONTAL); // 595.28 - 80 = 515.28 pt

    // columnSizes konvertálása Pdfmake szélességekké (px -> pt)
    const widths = columnSizes.map(size => {
        if (typeof size === 'string' && size.endsWith('px')) {
            return parseFloat(size) * 0.75; // Alap konverzió
        } else if (size === 'auto' || size === '*') {
            return '*';
        }
        return size;
    });

    // Ellenőrizzük a táblázat teljes szélességét a fix oszlopok alapján
    let fixedWidthSum = 0;
    let autoOrStarCount = 0;
    widths.forEach(width => {
        if (typeof width === 'number') {
            fixedWidthSum += width;
        } else {
            autoOrStarCount++;
        }
    });

    // Skálázási tényező kiszámítása
    let scaleFactor = 1;
    if (fixedWidthSum > AVAILABLE_CONTENT_WIDTH && autoOrStarCount === 0) {
        scaleFactor = AVAILABLE_CONTENT_WIDTH / fixedWidthSum;
        for (let i = 0; i < widths.length; i++) {
            if (typeof widths[i] === 'number') {
                widths[i] *= scaleFactor;
            }
        }
        console.log(`Figyelem: A fix oszlopok eredeti szélessége (${fixedWidthSum.toFixed(2)}pt) meghaladta a rendelkezésre álló helyet (${AVAILABLE_CONTENT_WIDTH.toFixed(2)}pt). Arányos skálázás történt (${(scaleFactor * 100).toFixed(2)}%).`);
    } else if (fixedWidthSum > AVAILABLE_CONTENT_WIDTH && autoOrStarCount > 0) {
        console.warn(`Figyelem: A fix oszlopok szélessége (${fixedWidthSum.toFixed(2)}pt) meghaladja a rendelkezésre álló helyet, miközben vannak 'auto'/'*' oszlopok. Az 'auto'/'*' oszlopok mérete negatívvá válhat! Fontolja meg a fix oszlopok szélességének csökkentését.`);
    }

    const tableBody = [];
    const heights = [];
    const rowCount = jsonData.length;
    const colCount = widths.length;

    const formattedMergeCells = originalMergeCells ? originalMergeCells.map(merge => ({
        s: { r: merge.row, c: merge.col },
        e: { r: merge.row + merge.rowspan - 1, c: merge.col + merge.colspan - 1 }
    })) : [];
    const mergeMatrix = createMergeMatrix(formattedMergeCells, rowCount, colCount);

    const lastRowIndex = rowCount - 1;
    const firstOfLastTenRowsIndex = Math.max(0, rowCount - 10);

    // Define the start and end rows for padding exclusion
    const firstTenRowsEndIndex = 9; // Rows 0-9 (10 rows)
    const lastNineRowsStartIndex = Math.max(0, rowCount - 9); // Last 9 rows

    const DEFAULT_BORDER_WIDTH = 0.25;

    // Segédtömb a képet tartalmazó cellák azonosítására
    // Ezt kell azelőtt feltölteni, hogy a layout függvények futnának
    const cellsWithImages = Array(rowCount).fill(null).map(() => Array(colCount).fill(false));

    for (let r = 0; r < rowCount; r++) {
        const rowContent = [];

        let rowHeight;
        if (Array.isArray(rowSizes) && rowSizes[r] !== undefined && !isNaN(parseFloat(rowSizes[r]))) {
            rowHeight = parseFloat(rowSizes[r]) * 0.75 * scaleFactor;
        } else {
            rowHeight = 12;
        }
        heights.push(rowHeight);

        console.log(`--- Processing Row ${r}. Original rowHeight: ${rowSizes[r]}, Scaled rowHeight: ${rowHeight} (scale factor: ${scaleFactor.toFixed(3)}) ---`);

        for (let c = 0; c < colCount; c++) {
            const mergeInfo = mergeMatrix[r]?.[c];

            if (mergeInfo && !mergeInfo.isMain) {
                rowContent.push({ _span: true });
                continue;
            }

            let cellValue = (jsonData[r] && jsonData[r][c] !== undefined) ? jsonData[r][c] : '';
            let cellContent = {
                text: '',
                alignment: 'center',
                verticalAlignment: 'middle',
                margin: [0.5, 0.5, 0.5, 0.5],
                fillColor: 'white',
                color: 'black',
                bold: false,
                fontSize: 5
            };

            if (mergeInfo && mergeInfo.isMain) {
                if (mergeInfo.rowspan > 1) cellContent.rowSpan = mergeInfo.rowspan;
                if (mergeInfo.colspan > 1) cellContent.colSpan = mergeInfo.colspan;
            }

            const specificCellStyle = cellStyles.find(style => style?.row === r && style?.col === c);
            const className = specificCellStyle?.className || '';

            // **JAVÍTÁS: Alapértelmezett értékek inicializálása a változók használata előtt**
            let currentFillColor = cellContent.fillColor;
            let currentTextColor = cellContent.color;
            let currentBold = cellContent.bold;
            let currentBorder = cellContent.border;
            let currentBorderColor = cellContent.borderColor;
            let currentFontSize = cellContent.fontSize;
            let currentAlignment = cellContent.alignment;
            let currentVerticalAlignment = cellContent.verticalAlignment;

            let imageUrlFromCell = null;
            if (typeof cellValue === 'string' && cellValue.startsWith('https://storage.googleapis.com/')) {
                imageUrlFromCell = cellValue;
            } else if (typeof cellValue === 'object' && cellValue !== null && typeof cellValue.image === 'string' && cellValue.image.startsWith('https://storage.googleapis.com/')) {
                imageUrlFromCell = cellValue.image;
            }

            if (imageUrlFromCell) {
                const imgSource = downloadedImages[imageUrlFromCell];
                if (imgSource) {
                    cellsWithImages[r][c] = true; // Jelöljük, hogy ez a cella képet tartalmaz

                    let rotation = 0;
                    if (specificCellStyle && typeof specificCellStyle.rotation === 'number') {
                        rotation = specificCellStyle.rotation;
                    } else if (typeof cellValue === 'object' && cellValue !== null && typeof cellValue.rotation === 'number') {
                        rotation = cellValue.rotation;
                    }
                    rotation = ((rotation % 360) + 360) % 360;
                    
                    let finalImageSource = imgSource;
                    if (rotation !== 0) {
                        try {
                            console.log(`Képforgatás: [${r}, ${c}] - ${rotation} fokkal`);
                            finalImageSource = await rotateImageWithCanvas(imgSource, rotation);
                        } catch (error) {
                            console.error(`Hiba a kép forgatása során [${r}, ${c}]:`, error);
                            finalImageSource = imgSource;
                        }
                    }

                    cellContent.image = finalImageSource;
                    cellContent.alignment = 'center';
                    cellContent.margin = [0, 0, 0, 0]; // A képes celláknál itt állítjuk be a margin-t 0-ra
                    
                    let cellWidth = (typeof widths[c] === 'number' ? widths[c] : 100);
                    let cellHeight = (typeof rowHeight === 'number' ? rowHeight : 100);

                    const actualCellBorderWidth = (specificCellStyle && (specificCellStyle.border === false || (Array.isArray(specificCellStyle.border) && specificCellStyle.border.every(b => b === false)))) ? 0 : DEFAULT_BORDER_WIDTH;

                    let availableWidthForImage = cellWidth - (actualCellBorderWidth * 2);
                    let availableHeightForImage = cellHeight - (actualCellBorderWidth * 2);

                    cellContent.width = availableWidthForImage;
                    cellContent.height = availableHeightForImage;
                    
                    delete cellContent.text;
                } else {
                    cellContent.text = { text: 'Kép nem található vagy letöltési hiba', color: 'red' };
                    cellContent.image = undefined;
                    cellContent.margin = [0.5, 0.5, 0.5, 0.5];
                    cellContent.verticalAlignment = 'middle';
                }
            } else {
                let cellText = escapeHtml(cellValue !== null && cellValue !== undefined ? String(cellValue) : '');
                
                const targetRows = [10, Math.max(0, rowCount - 10)];
                const targetCol = 0;
                
                if (targetRows.includes(r) && c === targetCol && cellText.trim() !== '') {
                    try {
                        console.log(`Szövegforgatás: [${r}, ${c}] - "${cellText}" 90 fokkal`);
                        
                        const textOptions = {
                            fontSize: currentFontSize || 12,
                            color: currentTextColor || 'black',
                            bold: currentBold || false,
                            fontFamily: 'Arial',
                            backgroundColor: 'transparent',
                            padding: 2
                        };
                        
                        const rotatedTextImage = await rotateTextWithCanvas(cellText, 90, textOptions);
                        
                        if (rotatedTextImage) {
                            cellsWithImages[r][c] = true; // Jelöljük, hogy ez a cella képet tartalmaz (forgatott szövegkép)
                            cellContent.image = rotatedTextImage;
                            cellContent.alignment = 'center';
                            cellContent.margin = [0, 0, 0, 0]; // A képes celláknál itt állítjuk be a margin-t 0-ra

                            let cellWidth = (typeof widths[c] === 'number' ? widths[c] : 100);
                            let cellHeight = (typeof rowHeight === 'number' ? rowHeight : 100);
                            
                            const actualCellBorderWidth = (specificCellStyle && (specificCellStyle.border === false || (Array.isArray(specificCellStyle.border) && specificCellStyle.border.every(b => b === false)))) ? 0 : DEFAULT_BORDER_WIDTH;
                            
                            let availableWidthForImage = cellWidth - (actualCellBorderWidth * 2);
                            let availableHeightForImage = cellHeight - (actualCellBorderWidth * 2);
                            
                            cellContent.width = availableWidthForImage;
                            cellContent.height = availableHeightForImage;
                            
                            delete cellContent.text;
                            
                            console.log(`Szövegforgatás sikeres: [${r}, ${c}] - "${cellText}"`);
                        } else {
                            cellContent.text = cellText;
                            cellContent.margin = [0.5, 0.5, 0.5, 0.5];
                            cellContent.verticalAlignment = 'middle';
                        }
                    } catch (error) {
                        console.error(`Hiba a szövegforgatás során [${r}, ${c}]:`, error);
                        cellContent.text = cellText;
                        cellContent.margin = [0.5, 0.5, 0.5, 0.5];
                        cellContent.verticalAlignment = 'middle';
                    }
                } else {
                    cellContent.text = cellText;
                    cellContent.margin = [0.5, 0.5, 0.5, 0.5];
                    cellContent.verticalAlignment = 'middle';
                }
            }

            const isBlackCell = (specificCellStyle && (specificCellStyle.backgroundColor === 'black' || specificCellStyle.backgroundColor === '#000000' || specificCellStyle.backgroundColor === 'rgb(0, 0, 0)')) || className.includes('black-cell');

            if (isBlackCell) {
                currentFillColor = 'black';
                currentTextColor = 'yellow';
                currentBold = true;
                currentBorder = [true, true, true, true];
                currentBorderColor = ['yellow', 'yellow', 'yellow', 'yellow'];
                currentFontSize = 5;

                if (r >= 0 && r <= 6) {
                    currentAlignment = 'left';
                    cellContent.margin = [2, 0.5, 0.5, 0.5];
                    if (!cellContent.image) {
                        currentVerticalAlignment = 'middle';
                    }
                } else {
                    currentAlignment = 'center';
                    cellContent.margin = [0.5, 0, 0.5, 0];
                     if (!cellContent.image) {
                        currentVerticalAlignment = 'middle';
                    }
                }
            }

            if (r <= 2) {
                if (isBlackCell) {
                    currentFillColor = 'white';
                    currentTextColor = 'black';
                    currentBorder = [false, false, false, false];
                    currentBold = false;
                } else {
                    currentBorder = [false, false, false, false];
                    currentFillColor = 'white';
                    currentTextColor = 'black';
                    cellContent.margin = [0, 0, 0, 0];
                    currentBold = false;
                    currentAlignment = 'center';
                }
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
            }

            if (r >= 11 && r < firstOfLastTenRowsIndex) {
                const hasExplicitBgColor = specificCellStyle?.backgroundColor && specificCellStyle.backgroundColor !== 'inherit' && specificCellStyle.backgroundColor !== '';
                if (!isBlackCell && !hasExplicitBgColor) {
                    currentFillColor = (r - 11) % 2 === 0 ? '#D7D7D7' : 'white';
                }
                if (!isBlackCell) {
                    currentTextColor = 'black';
                }
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
            }

            if (r >= firstOfLastTenRowsIndex) {
                if (!isBlackCell) {
                    currentFillColor = 'white';
                    currentTextColor = 'black';
                }
                if (c >= 3) {
                    currentBorder = [false, false, false, false];
                    if (!isBlackCell) {
                        currentFillColor = 'white';
                    }
                }
                if (!isBlackCell) {
                    currentTextColor = 'black';
                }
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
            }

            if (r === 0) {
                if (!isBlackCell) {
                    currentAlignment = 'center';
                }
                currentFillColor = 'white';
                currentTextColor = 'black';
                currentBold = true;
                if (c === 3) {
                    if (typeof cellContent.text === 'object' && cellContent.text !== null && cellContent.text.text !== undefined) {
                        cellContent.text.decoration = 'underline';
                        cellContent.text.fontSize = 7;
                    } else if (typeof cellContent.text === 'string') {
                        cellContent.text = { text: cellContent.text, decoration: 'underline', fontSize: 7 };
                    } else {
                        cellContent.text = { text: escapeHtml(cellValue !== null && cellValue !== undefined ? String(cellValue) : ''), decoration: 'underline', fontSize: 10 };
                    }
                }
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
            }

            if (r === 10) {
                currentAlignment = 'center';
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
                if (!isBlackCell) {
                    currentTextColor = 'black';
                }
                const hasExplicitBgColor = specificCellStyle?.backgroundColor && specificCellStyle.backgroundColor !== 'inherit' && specificCellStyle.backgroundColor !== '';
                if (!isBlackCell && !hasExplicitBgColor) {
                    currentFillColor = 'white';
                }
            }

            if (r === lastRowIndex) {
                currentBold = true;
                currentFillColor = 'lightgrey';
                currentTextColor = 'black';
                currentFontSize = 10 * 0.75;
                currentAlignment = 'center';
                if (!cellContent.image) {
                    currentVerticalAlignment = 'middle';
                }
                currentBorder = [true, true, true, true];
                currentBorderColor = ['#000', '#000', '#000', '#000'];
            }

            // specificCellStyle felülírása
            if (specificCellStyle) {
                // A margin beállítás itt továbbra is van, de a layout padding funkció felülírja, ha nem képes celláról van szó.
                // A képes celláknál a cellContent.margin már 0-ra van állítva fentebb.
                if (specificCellStyle.margin && !cellsWithImages[r][c]) { // Csak akkor alkalmazza, ha nem képes cella
                    cellContent.margin = specificCellStyle.margin.map(m => parseFloat(m) * 0.75 * scaleFactor);
                }
                if (specificCellStyle.backgroundColor && specificCellStyle.backgroundColor !== 'inherit' && specificCellStyle.backgroundColor !== '') {
                    currentFillColor = specificCellStyle.backgroundColor;
                }

                console.log(`Row ${r}, Col ${c}: specificCellStyle.color = "${specificCellStyle.color}", isBlackCell = ${isBlackCell}, currentTextColor before = "${currentTextColor}"`);

                const hasExplicitColor = specificCellStyle.color &&
                                         specificCellStyle.color !== 'inherit' &&
                                         specificCellStyle.color !== '' &&
                                         specificCellStyle.color !== 'rgba(0, 0, 0, 0)' &&
                                         specificCellStyle.color !== 'transparent' &&
                                         specificCellStyle.color !== 'undefined';

                if (r >= 11 && r < firstOfLastTenRowsIndex) {
                    if (!isBlackCell) {
                        currentTextColor = 'black';
                        console.log(`Row ${r}, Col ${c}: FORCED BLACK in dynamic rows`);
                    } else {
                        currentTextColor = 'yellow';
                    }
                } else {
                    if (hasExplicitColor) {
                        if (isBlackCell && r > 2) {
                            currentTextColor = specificCellStyle.color;
                        } else if (!isBlackCell) {
                            currentTextColor = specificCellStyle.color;
                        }
                    }
                }

                console.log(`Row ${r}, Col ${c}: hasExplicitColor = ${hasExplicitColor}, currentTextColor after = "${currentTextColor}"`);

                if (specificCellStyle.fontWeight === 'bold') currentBold = true;
                if (specificCellStyle.fontSize) {
                    currentFontSize = parseFloat(specificCellStyle.fontSize) * 0.75 * scaleFactor;
                }
                if (specificCellStyle.textAlign) {
                    currentAlignment = specificCellStyle.textAlign;
                }
                if (specificCellStyle.verticalAlign) {
                    currentVerticalAlignment = specificCellStyle.verticalAlign;
                }
                if (specificCellStyle.border !== undefined) {
                    currentBorder = specificCellStyle.border;
                }
                if (specificCellStyle.borderColor !== undefined) {
                    currentBorderColor = specificCellStyle.borderColor;
                }
            }

            // *** ÚJ PADDING LOGIKA - Az első 10 és utolsó 9 soron kívül minden sorban padding alkalmazása ***
            // Csak akkor alkalmazzuk a paddinget, ha:
            // 1. A sor nem az első 10 sorban van (r > 9)
            // 2. A sor nem az utolsó 9 sorban van (r < lastNineRowsStartIndex)
            // 3. A cella nem tartalmaz képet (cellsWithImages[r][c] === false)
            if (r > 9 && r < lastNineRowsStartIndex && !cellsWithImages[r][c]) {
                // Felső és alsó padding hozzáadása (2pt mindkét oldalon)
                const paddingAmount = 2;
                cellContent.margin = [
                    cellContent.margin[0], // bal margin megmarad
                    cellContent.margin[1] + paddingAmount, // felső margin + padding
                    cellContent.margin[2], // jobb margin megmarad
                    cellContent.margin[3] + paddingAmount  // alsó margin + padding
                ];
            }

            // Cellastílusok alkalmazása az eredmény objektumra
            cellContent.fillColor = currentFillColor;
            cellContent.color = currentTextColor;
            cellContent.bold = currentBold;
            cellContent.border = currentBorder;
            cellContent.borderColor = currentBorderColor;
            cellContent.fontSize = currentFontSize;
            cellContent.alignment = currentAlignment;
            cellContent.verticalAlignment = currentVerticalAlignment;

            rowContent.push(cellContent);
        }

        tableBody.push(rowContent);
    }

    const docDefinition = {
        pageMargins: [PAGE_MARGIN_HORIZONTAL, 40, PAGE_MARGIN_HORIZONTAL, 40],
        content: [
            {
                table: {
                    widths: widths,
                    body: tableBody,
                    heights: heights,
                    dontBreakRows: true
                },
                layout: {
                    hLineWidth: function (i, node) {
                        if (i >= 0 && i <= 3) {
                            return 0;
                        }
                        if (i === node.table.body.length) {
                            return 0.5;
                        }
                        return 0.25;
                    },
                    vLineWidth: function (i, node) {
                        if (i === 0 || i === node.table.widths.length) {
                            return 0.5;
                        }
                        return 0.25;
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
            fontSize: 5,
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

    let fileName; // Deklaráció a try blokkon kívülre

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
            } else if (typeof data === 'string' && data.startsWith('https://storage.googleapis.com/')) {
                // Ha a cella értéke maga a kép URL-je (string)
                imageUrlsToDownload.push(data);
            } else if (typeof data === 'object' && data !== null) {
                // Ha a cella értéke egy objektum, ami tartalmazza az URL-t
                if (data.image && typeof data.image === 'string' && data.image.startsWith('https://storage.googleapis.com/')) {
                    imageUrlsToDownload.push(data.image);
                }
                // Rekurzívan vizsgáljuk az objektum további tulajdonságait is, ha vannak
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
                    const imageBuffer = await downloadImageFromUrl(imageUrl);
                    const base64Image = `data:${getMimeType(path.basename(imageUrl))};base64,${imageBuffer.toString('base64')}`;
                    downloadedImages[imageUrl] = base64Image;
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
        let pdfBuffer;

        // Várjuk meg, amíg a PDF teljesen létrejön memóriában (bufferként)
        await new Promise((resolve, reject) => {
            const chunks = [];
            pdfDoc.on('data', chunk => chunks.push(chunk));
            pdfDoc.on('end', () => {
                pdfBuffer = Buffer.concat(chunks);
                console.log('✅ PDF sikeresen generálva memóriába (buffer).');
                resolve();
            });
            pdfDoc.on('error', (err) => {
                console.error('❌ Hiba a PDF generálás során a memóriába:', err);
                reject(err);
            });
            pdfDoc.end(); // Fontos: le kell zárni a pdfDoc stream-et!
        });

        // --- KÖRNYEZET ALAPÚ GOOGLE DRIVE FELTÖLTÉS ---
        // Csak éles környezetben (DATABASE_URL létezik) töltjük fel a Drive-ra
        const isProduction = !!process.env.DATABASE_URL;
        
        if (isProduction) {
            console.log('🏭 Éles környezet - Google Drive feltöltés engedélyezve');
            
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

                // PDF feltöltése az aznapi mappába - most bufferből
                const uploadResult = await uploadBufferToDrive(pdfBuffer, fileName, dailyFolderId, 'application/pdf');
                console.log('✅ PDF feltöltés sikeres! Drive URL:', uploadResult.webViewLink);

                // --- Képek feltöltése Google Drive-ra ---
                if (uniqueImageUrls.length > 0) {
                    console.log(`📸 ${uniqueImageUrls.length} egyedi kép feltöltése indítása a Drive-ra...`);

                    const uploadImagePromises = uniqueImageUrls.map(async (imageUrl) => {
                        const imageFileName = path.basename(new URL(imageUrl).pathname);

                        try {
                            // 1. Kép letöltése a GCS-ről bufferbe (már megtörtént fentebb)
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

            } catch (uploadErr) {
                console.error('❌ Hiba a Google Drive feltöltésnél (a PDF generálás során):', uploadErr.message);
                console.error('📄 Részletek:', uploadErr);
                // Itt döntheted el, hogy ha a Drive feltöltés sikertelen, az befolyásolja-e a PDF letöltését.
                // Jelenleg tovább engedi a kódot a PDF letöltésére.
            }
        } else {
            console.log('🏠 Fejlesztői környezet (localhost) - Google Drive feltöltés kihagyva');
            console.log('💡 A PDF csak letöltésre kerül, Drive feltöltés nem történik meg.');
        }

        // PDF válaszként küldése letöltéshez (most már a memóriában lévő bufferből)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(pdfBuffer); // Közvetlenül a buffert küldjük el

    } catch (error) {
        console.error('❌ Hiba a PDF generálás során:', error.message);
        res.status(500).send('Hiba történt a PDF generálása során: ' + error.message);
    } finally {
        // Nincs szükség fájl törlésére, mivel nem hoztunk létre ideiglenes fájlt.
        console.log('🗑️ Nincs ideiglenes fájl törölni.');
    }

});

// Helper függvény a MIME típus meghatározásához a fájlnév kiterjesztése alapján
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
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
        // Ha támogatni szeretnél más típusokat, add hozzá ide
        default:
            console.warn(`Ismeretlen fájlkiterjesztés a MIME típushoz: ${ext}. Alapértelmezett: application/octet-stream`);
            return 'application/octet-stream'; // Vagy lehet, hogy egy error-t dobsz, ha nem várt típus
    }
}

// --- GOOGLE DRIVE SEGÉDFÜGGVÉNYEK ---

// Mappa létrehozása vagy meglévő visszaadása
async function getOrCreateFolder(folderName, parentFolderId) {
    try {
        // Először ellenőrizzük, hogy létezik-e már a mappa
        const existingFolders = await driveService.files.list({
            q: `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Projekt mappa már létezik: ${folderName}`);
            return existingFolders.data.files[0].id;
        }

        // Ha nem létezik, létrehozzuk
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új projekt mappa létrehozva: ${folderName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a mappa létrehozásakor (${folderName}):`, error.message);
        throw error;
    }
}

// Mappa létrehozása vagy meglévő visszaadása
async function getOrCreateFolder(folderName, parentFolderId) {
    try {
        // Először ellenőrizzük, hogy létezik-e már a mappa
        const existingFolders = await driveService.files.list({
            q: `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Projekt mappa már létezik: ${folderName}`);
            return existingFolders.data.files[0].id;
        }

        // Ha nem létezik, létrehozzuk
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új projekt mappa létrehozva: ${folderName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a mappa létrehozásakor (${folderName}):`, error.message);
        throw error;
    }
}

// Aznapi dátumozott mappa létrehozása (törli ha már létezik)
async function createDailyFolder(parentFolderId) {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD formátum
    const dailyFolderName = `Jelentés_${dateString}`;

    try {
        // Ellenőrizzük, hogy létezik-e már az aznapi mappa
        const existingDailyFolders = await driveService.files.list({
            q: `name='${dailyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        // Ha létezik, töröljük
        if (existingDailyFolders.data.files.length > 0) {
            console.log(`🗑️ Meglévő aznapi mappa törlése: ${dailyFolderName}`);
            for (const folder of existingDailyFolders.data.files) {
                await driveService.files.delete({
                    fileId: folder.id,
                });
            }
        }

        // Létrehozzuk az új aznapi mappát
        const dailyFolderMetadata = {
            name: dailyFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const dailyFolder = await driveService.files.create({
            resource: dailyFolderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új aznapi mappa létrehozva: ${dailyFolderName}`);
        return dailyFolder.data.id;
    } catch (error) {
        console.error(`Hiba az aznapi mappa létrehozásakor (${dailyFolderName}):`, error.message);
        throw error;
    }
}

// Buffer feltöltése Google Drive-ra
async function uploadBufferToDrive(buffer, fileName, parentFolderId, mimeType) {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };
   
    // Buffer stream létrehozása
    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null); // Jelzi a stream végét
   
    const media = {
        mimeType: mimeType,
        body: bufferStream,
    };
   
    try {
        const response = await driveService.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
        });
        return response.data;
    } catch (error) {
        console.error(`Hiba a buffer feltöltése során (${fileName}):`, error.message);
        throw error;
    }
}

// Fájl feltöltése Google Drive-ra (eredeti függvény, ha még szükséges)
async function uploadFileToDrive(filePath, fileName, parentFolderId, mimeType) {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };
    const media = {
        mimeType: mimeType,
        body: fs.createReadStream(filePath),
    };
    try {
        const response = await driveService.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
        });
        return response.data;
    } catch (error) {
        console.error(`Hiba a fájl feltöltése során (${fileName}):`, error.message);
        throw error;
    }
}

// A router exportálása
module.exports = {
    router: router,
    // Az 'initializationPromise' továbbra is releváns, ha az initializeGoogleServices()
    // függvény más Google-szolgáltatásokat (pl. GCS bucket a képekhez) inicializál.
    initializationPromise: typeof initializeGoogleServices !== 'undefined' ? initializeGoogleServices() : Promise.resolve()
};