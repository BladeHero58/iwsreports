const express = require('express');
const router = express.Router();
const { knex } = require('./db');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { google } = require('googleapis');
const fs = require('fs');
const sharp = require('sharp');

// Google Cloud Storage és Drive változók (ezek a reports.js-ből jönnek)
let storage;
let bucket;
let driveService;

// Google Drive fő mappa ID (ahol a projektek vannak)
const MAIN_DRIVE_FOLDER_ID = '18-7OP8B23r-QBVWHbgaLn3Klj3lm62bk';

// Middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Kép tömörítése Sharp-pal
async function compressImage(imageBase64) {
    try {
        // Base64 → Buffer
        const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        
        // Tömörítés Sharp-pal
        const compressedBuffer = await sharp(imageBuffer)
            .resize({
                width: 800, // Max szélesség (PDF-hez elegendő)
                fit: 'inside',
                withoutEnlargement: true
            })
            .toFormat('jpeg', {
                quality: 75, // Jó kompromisszum
                mozjpeg: true // Extra tömörítés
            })
            .toBuffer();
        
        console.log(`📊 Kép méret csökkentve: ${(imageBuffer.length / 1024).toFixed(2)} KB → ${(compressedBuffer.length / 1024).toFixed(2)} KB`);
        
        return compressedBuffer;
    } catch (error) {
        console.error('Hiba a kép tömörítésekor:', error);
        throw error;
    }
}

// MVM Dokumentáció Ellenőrzés Mentése
router.post('/projects/:projectId/reports/documentation', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;
    const reportData = req.body;

    try {
        // Jogosultság ellenőrzése
        if (!req.user.isAdmin) {
            const assignment = await knex('user_projects')
                .where({ user_id: userId, project_id: projectId })
                .first();

            if (!assignment) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Nincs jogosultsága ehhez a projekthez.' 
                });
            }
        }

        // Ellenőrizzük hogy létezik-e már mentés ehhez a projekthez és kategóriához
        const existingReport = await knex('mvm_reports')
            .where({ project_id: projectId, category_id: 1 })
            .first();

        let reportId;
        
        if (existingReport) {
            // UPDATE - Ha már létezik
            await knex('mvm_reports')
                .where({ project_id: projectId, category_id: 1 })
                .update({
                    report_data: JSON.stringify(reportData),
                    updated_at: knex.fn.now(),
                    user_id: userId
                });
            
            reportId = existingReport.id;
        } else {
            // INSERT - Ha még nem létezik
            const [result] = await knex('mvm_reports')
                .insert({
                    project_id: projectId,
                    user_id: userId,
                    category_id: 1,
                    category_name: 'Dokumentáció',
                    report_data: JSON.stringify(reportData),
                    created_at: knex.fn.now(),
                    updated_at: knex.fn.now()
                })
                .returning('id');
            
            reportId = result.id;
        }

        res.json({ 
            success: true, 
            message: 'Dokumentáció ellenőrzés sikeresen mentve.',
            reportId: reportId
        });

    } catch (error) {
        console.error('Hiba a dokumentáció ellenőrzés mentésekor:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Hiba történt a mentés során.',
            error: error.message 
        });
    }
});

// MVM Dokumentáció Ellenőrzés Betöltése
router.get('/projects/:projectId/reports/documentation', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;

    try {
        // Jogosultság ellenőrzése
        if (!req.user.isAdmin) {
            const assignment = await knex('user_projects')
                .where({ user_id: userId, project_id: projectId })
                .first();

            if (!assignment) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Nincs jogosultsága ehhez a projekthez.' 
                });
            }
        }

        // Lekérjük az elmentett jelentést
        const report = await knex('mvm_reports')
            .select('report_data')
            .where({ project_id: projectId, category_id: 1 })
            .first();

        if (report) {
            res.json({ 
                success: true, 
                data: report.report_data 
            });
        } else {
            res.json({ 
                success: true, 
                data: null // Nincs még mentett adat
            });
        }

    } catch (error) {
        console.error('Hiba a dokumentáció betöltésekor:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Hiba történt a betöltés során.' 
        });
    }
});

// MVM Dokumentáció PDF Exportálás és Feltöltés
router.post('/projects/:projectId/reports/documentation/export-pdf', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;
    const { pdfData, serialNumber, projectName, images } = req.body;

    try {
        // Jogosultság ellenőrzése
        if (!req.user.isAdmin) {
            const assignment = await knex('user_projects')
                .where({ user_id: userId, project_id: projectId })
                .first();

            if (!assignment) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Nincs jogosultsága ehhez a projekthez.' 
                });
            }
        }

// Biztonságos mappa/fájlnév generálása ÉKEZETEK MEGTARTÁSÁVAL
function sanitizeFolderName(name) {
    return name
        .replace(/[\/\\:*?"<>|]/g, '_') // Csak a veszélyes karaktereket cseréljük
        .replace(/_+/g, '_') // Dupla underscore-ok törlése
        .replace(/^_|_$/g, '') // Kezdő/záró underscore törlése
        .trim();
}

        // PDF név meghatározása: sorszám vagy projekt név
        const safeProjectName = sanitizeFolderName(projectName);
const safeFolderName = (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A') 
    ? sanitizeFolderName(serialNumber)
    : safeProjectName;

const pdfFileName = (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A') 
    ? `${sanitizeFolderName(serialNumber)}.pdf`
    : `${safeProjectName}.pdf`;

        console.log(`📄 PDF export kezdés: ${pdfFileName}`);
        console.log(`📁 Projekt: ${safeProjectName}, Mappa: ${safeFolderName}`);

        // PDF buffer konvertálása (ha base64-ben jön)
        let pdfBuffer;
        if (pdfData.startsWith('data:application/pdf;base64,')) {
            const base64Data = pdfData.replace('data:application/pdf;base64,', '');
            pdfBuffer = Buffer.from(base64Data, 'base64');
        } else if (Buffer.isBuffer(pdfData)) {
            pdfBuffer = pdfData;
        } else {
            pdfBuffer = Buffer.from(pdfData, 'base64');
        }

        console.log(`📊 PDF mérete: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

        // Csak éles környezetben (DATABASE_URL létezik) töltjük fel a Drive-ra
        const isProduction = !!process.env.DATABASE_URL;

        if (isProduction) {
            console.log('🏭 Éles környezet - Google Drive feltöltés engedélyezve');

            try {
                // Ellenőrizzük a Drive service elérhetőségét
                if (!driveService) {
                    console.log('⚠️ Drive service nincs inicializálva, inicializálás...');
                    await initializeGoogleDrive();
                }

                // Projekt mappa elérése/létrehozása
                const projectFolderId = await getOrCreateFolder(safeProjectName, MAIN_DRIVE_FOLDER_ID);
                console.log(`📁 Projekt mappa ID: ${projectFolderId}`);

                // Sorszám/PDF specifikus mappa létrehozása (ha már létezik, töröljük)
                const pdfFolderId = await createOrReplacePdfFolder(safeFolderName, projectFolderId);
                console.log(`📁 PDF mappa ID: ${pdfFolderId}`);

                // PDF feltöltése
                const uploadResult = await uploadBufferToDrive(pdfBuffer, pdfFileName, pdfFolderId, 'application/pdf');
                console.log(`✅ PDF feltöltve a Drive-ra: ${uploadResult.webViewLink}`);

                // Képek feltöltése (aláírások kiszűrése)
                if (images && Object.keys(images).length > 0) {
                    const allImages = [];
                    
                    // Összegyűjtjük az összes képet a kategóriákból
                    Object.keys(images).forEach(itemId => {
                        if (Array.isArray(images[itemId])) {
                            allImages.push(...images[itemId]);
                        }
                    });

                    console.log(`📸 ${allImages.length} kép feltöltése kezdődik...`);

                    const uploadImagePromises = allImages.map(async (imageBase64, index) => {
    try {
        // Kép tömörítése Sharp-pal
        const compressedBuffer = await compressImage(imageBase64);
        
        // Kép neve (JPEG, mert Sharp-pal tömörítettük)
        const imageFileName = `image_${index + 1}.jpg`;
        const imageMimeType = 'image/jpeg';

                            // Feltöltés Drive-ra
                            const imageUploadResult = await uploadBufferToDrive(imageBuffer, imageFileName, pdfFolderId, imageMimeType);
                            console.log(`✅ Kép feltöltve: ${imageFileName}, URL: ${imageUploadResult.webViewLink}`);
                            return imageUploadResult.webViewLink;
                        } catch (imgErr) {
                            console.error(`❌ Hiba a kép feltöltésekor (${index}):`, imgErr.message);
                            return null;
                        }
                    });

                    const uploadedImageLinks = await Promise.all(uploadImagePromises);
                    const successfulUploads = uploadedImageLinks.filter(link => link !== null);

                    console.log(`🎉 ${successfulUploads.length}/${allImages.length} kép sikeresen feltöltve a Drive-ra`);
                }

                res.json({
                    success: true,
                    message: 'PDF sikeresen exportálva és feltöltve a Google Drive-ra',
                    driveUrl: uploadResult.webViewLink
                });

            } catch (driveErr) {
                console.error('❌ Hiba a Google Drive feltöltésnél:', driveErr.message);
                // Ha Drive feltöltés sikertelen, akkor is küldjük le a PDF-et
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`);
                res.send(pdfBuffer);
            }
        } else {
    console.log('🏠 Fejlesztői környezet - PDF csak letöltésre');
    
    // JAVÍTVA: JSON válasz küldése fejlesztői környezetben is
    res.json({
        success: true,
        message: 'PDF letöltésre kész (fejlesztői környezet)',
        pdfData: pdfBuffer.toString('base64') // Base64-ben küldjük vissza
    });
}

    } catch (error) {
        console.error('❌ Hiba a PDF exportálás során:', error);
        res.status(500).json({
            success: false,
            message: 'Hiba történt a PDF exportálása során.',
            error: error.message
        });
    }
});

// --- GOOGLE DRIVE SEGÉDFÜGGVÉNYEK ---

async function initializeGoogleDrive() {
    try {
        let credentials;

        if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            const keyFilePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            const fullKeyPath = path.join(process.cwd(), keyFilePath);
            credentials = JSON.parse(fs.readFileSync(fullKeyPath, 'utf8'));
        } else {
            throw new Error('Google credentials nem találhatók');
        }

        const authClient = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });

        const auth = await authClient.getClient();
        driveService = google.drive({ version: 'v3', auth });
        
        console.log('✅ Google Drive inicializálva az MVM reports-ban');
    } catch (error) {
        console.error('❌ Hiba a Google Drive inicializálásakor:', error);
        throw error;
    }
}

async function getOrCreateFolder(folderName, parentFolderId) {
    try {
        // Ellenőrizzük hogy létezik-e
        const existingFolders = await driveService.files.list({
            q: `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Mappa már létezik: ${folderName}`);
            return existingFolders.data.files[0].id;
        }

        // Létrehozzuk
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új mappa létrehozva: ${folderName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a mappa létrehozásakor (${folderName}):`, error.message);
        throw error;
    }
}

async function createOrReplacePdfFolder(folderName, parentFolderId) {
    try {
        // Ellenőrizzük hogy létezik-e
        const existingFolders = await driveService.files.list({
            q: `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        // Ha létezik, töröljük
        if (existingFolders.data.files.length > 0) {
            console.log(`🗑️ Meglévő PDF mappa törlése: ${folderName}`);
            for (const folder of existingFolders.data.files) {
                await driveService.files.delete({
                    fileId: folder.id,
                });
            }
        }

        // Létrehozzuk az új mappát
        const folderMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új PDF mappa létrehozva: ${folderName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a PDF mappa létrehozásakor (${folderName}):`, error.message);
        throw error;
    }
}

async function uploadBufferToDrive(buffer, fileName, parentFolderId, mimeType) {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };

    const { Readable } = require('stream');
    const bufferStream = new Readable();
    bufferStream.push(buffer);
    bufferStream.push(null);

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

module.exports = router;