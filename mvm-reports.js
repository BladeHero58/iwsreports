const express = require('express');
const router = express.Router();
const { knex } = require('./db');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { google } = require('googleapis');
const fs = require('fs');
const sharp = require('sharp');
const ExifParser = require('exif-parser'); // ⭐ ÚJ - npm install exif-parser

// Middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

// Google Cloud Storage és Drive változók
let storage;
let bucket;
let driveService;

// Google Drive fő mappa ID
const MAIN_DRIVE_FOLDER_ID = '18-7OP8B23r-QBVWHbgaLn3Klj3lm62bk';

// ⭐ ÚJ FÜGGVÉNY - EXIF metaadatok kinyerése
async function extractExifMetadata(imageBase64) {
    try {
        // Base64 → Buffer
        const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        
        // EXIF parser
        const parser = ExifParser.create(imageBuffer);
        const result = parser.parse();
        
        const metadata = {
            takenDate: null,
            location: null,
            latitude: null,
            longitude: null,
            camera: null,
            hasGPS: false,
            hasDate: false
        };

        // Dátum kinyerése
        if (result.tags.DateTimeOriginal) {
            metadata.takenDate = new Date(result.tags.DateTimeOriginal * 1000).toISOString();
            metadata.hasDate = true;
            console.log(`📅 EXIF dátum: ${metadata.takenDate}`);
        }

        // GPS koordináták kinyerése
        if (result.tags.GPSLatitude && result.tags.GPSLongitude) {
            metadata.latitude = result.tags.GPSLatitude;
            metadata.longitude = result.tags.GPSLongitude;
            metadata.location = `${metadata.latitude.toFixed(6)}, ${metadata.longitude.toFixed(6)}`;
            metadata.hasGPS = true;
            console.log(`📍 GPS koordináták: ${metadata.location}`);
        }

        // Kamera információk
        if (result.tags.Make || result.tags.Model) {
            metadata.camera = `${result.tags.Make || ''} ${result.tags.Model || ''}`.trim();
            console.log(`📷 Kamera: ${metadata.camera}`);
        }

        return metadata;
    } catch (error) {
        console.warn('⚠️ EXIF kinyerési hiba:', error.message);
        // Ha nincs EXIF, akkor üres metaadatokat adunk vissza
        return {
            takenDate: new Date().toISOString(),
            location: 'Nincs GPS adat',
            latitude: null,
            longitude: null,
            camera: null,
            hasGPS: false,
            hasDate: false
        };
    }
}

// ⭐ MÓDOSÍTOTT - Kép tömörítése METAADATOK MEGŐRZÉSÉVEL
// ⭐ MEGJEGYZÉS: Ez a függvény NINCS használva a Google Drive feltöltésnél
// Azért mert az EREDETI (tömörítetlen) képeket töltjük fel, hogy a metaadatok megmaradjanak
// PDF-nél továbbra is tömörítést használunk (frontend oldal)
async function compressImage(imageBase64) {
    try {
        // Base64 → Buffer
        const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        
        // EXIF metaadatok kinyerése TÖMÖRÍTÉS ELŐTT
        const exifMetadata = await extractExifMetadata(imageBase64);
        
        // ⭐ OPTIMALIZÁLT tömörítés Sharp-pal METAADATOK MEGTARTÁSÁVAL
        const compressedBuffer = await sharp(imageBuffer)
            .resize({
                width: 1200, // ⭐ Nagyobb méret jobb minőséghez
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({
                quality: 80, // ⭐ Jobb minőség
                mozjpeg: true,
                progressive: true, // ⭐ Progresszív JPEG gyorsabb betöltéshez
                // ⭐ KRITIKUS - EXIF megőrzése
                withMetadata: true,
                keepExif: true,
                keepIcc: true
            })
            .toBuffer();
        
        const originalSizeKB = (imageBuffer.length / 1024).toFixed(2);
        const compressedSizeKB = (compressedBuffer.length / 1024).toFixed(2);
        console.log(`📊 Kép tömörítve: ${originalSizeKB} KB → ${compressedSizeKB} KB (EXIF megőrizve)`);
        
        return {
            buffer: compressedBuffer,
            metadata: exifMetadata
        };
    } catch (error) {
        console.error('Hiba a kép tömörítésekor:', error);
        throw error;
    }
}

// Biztonságos mappa/fájlnév generálása
function sanitizeFolderName(name) {
    return name
        .replace(/[\\:*?"<>|]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .trim();
}

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
        
        console.log('✅ Google Drive inicializálva');
    } catch (error) {
        console.error('❌ Hiba a Google Drive inicializálásakor:', error);
        throw error;
    }
}

// Napi PDF mappa létrehozása
async function getOrCreateDailyPdfFolder(folderName, parentFolderId) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const dailyFolderName = `${today}_${folderName}`;

        const existingFolders = await driveService.files.list({
            q: `name='${dailyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Napi PDF mappa már létezik: ${dailyFolderName}`);
            return existingFolders.data.files[0].id;
        }

        const folderMetadata = {
            name: dailyFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új napi PDF mappa létrehozva: ${dailyFolderName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a napi PDF mappa létrehozásakor:`, error.message);
        throw error;
    }
}

// Projekt specifikus mappa létrehozása a főmappában
async function createProjectFolder(projectName, parentFolderId = '1gjd1pzRCnD5ajAK9qXDP0Lw8xBCY3XOK') {
    try {
        // Ellenőrizzük, hogy létezik-e már a mappa
        const existingFolders = await driveService.files.list({
            q: `name='${projectName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Projekt mappa már létezik: ${projectName}`);
            return existingFolders.data.files[0].id;
        }

        // Mappa létrehozása
        const folderMetadata = {
            name: projectName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId],
        };

        const folder = await driveService.files.create({
            resource: folderMetadata,
            fields: 'id',
        });

        console.log(`📁 Új projekt mappa létrehozva: ${projectName}`);
        return folder.data.id;
    } catch (error) {
        console.error(`Hiba a projekt mappa létrehozásakor:`, error.message);
        throw error;
    }
}

async function getOrCreateFolder(folderName, parentFolderId) {
    try {
        const existingFolders = await driveService.files.list({
            q: `name='${folderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files.length > 0) {
            console.log(`📁 Mappa már létezik: ${folderName}`);
            return existingFolders.data.files[0].id;
        }

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
        console.error(`Hiba a mappa létrehozásakor:`, error.message);
        throw error;
    }
}

// PDF feltöltése verziókezeléssel
async function uploadPdfWithVersionControl(pdfBuffer, fileName, folderId) {
    try {
        const existingPdfs = await driveService.files.list({
            q: `parents in '${folderId}' and mimeType='application/pdf' and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime asc',
        });

        const pdfFiles = existingPdfs.data.files || [];
        console.log(`📄 Jelenlegi PDF-ek száma: ${pdfFiles.length}`);

        // Duplikáció kezelés: ha már létezik ugyanazzal a névvel
        const baseFileName = fileName.replace(/\.pdf$/i, '');
        const existingWithSameName = pdfFiles.filter(file => {
            const name = file.name.replace(/\.pdf$/i, '');
            // Ellenőrizzük: ugyanaz a név VAGY ugyanaz a név (szám) formában
            return name === baseFileName || name.match(new RegExp(`^${baseFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(\\d+\\)$`));
        });

        let finalFileName = fileName;
        if (existingWithSameName.length > 0) {
            // Van már ilyen nevű fájl, keressük meg a következő szabad számot
            let counter = 2;
            let foundUnique = false;

            while (!foundUnique) {
                const testName = `${baseFileName} (${counter}).pdf`;
                const exists = pdfFiles.some(file => file.name === testName);

                if (!exists) {
                    finalFileName = testName;
                    foundUnique = true;
                } else {
                    counter++;
                }
            }
            console.log(`📝 Duplikáció észlelve, új fájlnév: ${finalFileName}`);
        }

        // 12 PDF limit kezelés (legrégebbi törlése)
        if (pdfFiles.length >= 12) {
            const oldestPdf = pdfFiles[0];
            console.log(`🗑️ 12 PDF elérve, legrégebbi törlése: ${oldestPdf.name}`);
            await driveService.files.delete({
                fileId: oldestPdf.id,
            });
        }

        const uploadResult = await uploadBufferToDrive(pdfBuffer, finalFileName, folderId, 'application/pdf');
        console.log(`✅ PDF feltöltve: ${finalFileName}`);

        return uploadResult;
    } catch (error) {
        console.error('Hiba a PDF verziókezelésnél:', error);
        throw error;
    }
}

// ⭐ MÓDOSÍTOTT - Buffer feltöltése METAADATOKKAL
async function uploadBufferToDrive(buffer, fileName, parentFolderId, mimeType, metadata = null) {
    const fileMetadata = {
        name: fileName,
        parents: [parentFolderId],
    };

    // ⭐ Ha van metaadat, akkor hozzáadjuk a fájl leírásához és tulajdonságaihoz
    if (metadata) {
        fileMetadata.description = JSON.stringify(metadata);
        fileMetadata.properties = {
            takenDate: metadata.takenDate || '',
            location: metadata.location || 'Nincs GPS adat',
            latitude: metadata.latitude?.toString() || '',
            longitude: metadata.longitude?.toString() || '',
            camera: metadata.camera || '',
            hasGPS: metadata.hasGPS ? 'true' : 'false',
            hasDate: metadata.hasDate ? 'true' : 'false'
        };
        console.log('📋 Metaadatok hozzáadva a Drive fájlhoz:', fileMetadata.properties);
    }

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
            fields: 'id, webViewLink, description, properties',
        });
        console.log(`✅ Fájl feltöltve Drive-ra: ${fileName}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Hiba a buffer feltöltése során (${fileName}):`, error.message);
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

        const existingReport = await knex('mvm_reports')
            .where({ project_id: projectId, category_id: 1 })
            .first();

        let reportId;
        
        if (existingReport) {
            await knex('mvm_reports')
                .where({ project_id: projectId, category_id: 1 })
                .update({
                    report_data: JSON.stringify(reportData),
                    updated_at: knex.fn.now(),
                    user_id: userId
                });
            
            reportId = existingReport.id;
        } else {
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
                data: null
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

// MVM Dokumentáció Ellenőrzés Törlése
router.delete('/projects/:projectId/reports/documentation', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;

    try {
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

        const deleted = await knex('mvm_reports')
            .where({ project_id: projectId, category_id: 1 })
            .del();

        if (deleted > 0) {
            console.log(`🗑️ Dokumentáció ellenőrzés törölve - Projekt: ${projectId}`);
            res.json({ 
                success: true, 
                message: 'Mentett ellenőrzés törölve.' 
            });
        } else {
            res.json({ 
                success: true, 
                message: 'Nincs mentett ellenőrzés.' 
            });
        }

    } catch (error) {
        console.error('Hiba az ellenőrzés törlésekor:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Hiba történt a törlés során.' 
        });
    }
});

// ⭐ MÓDOSÍTOTT - MVM Dokumentáció PDF Exportálás EXIF metaadatokkal
router.post('/projects/:projectId/reports/documentation/export-pdf', isAuthenticated, async (req, res) => {
    const projectId = req.params.projectId;
    const userId = req.user.id;
    const { pdfData, serialNumber, projectName, fileName, images } = req.body;

    console.log('📥 PDF export request érkezett:', {
        projectId,
        userId,
        serialNumber,
        projectName,
        fileName,
        hasImages: !!images,
        imageCount: images ? Object.keys(images).reduce((sum, key) => sum + (images[key]?.length || 0), 0) : 0
    });

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

        const safeProjectName = sanitizeFolderName(projectName);
        const safeFolderName = (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A')
            ? sanitizeFolderName(serialNumber)
            : safeProjectName;

        // Használjuk a kliens által generált fájlnevet, ha van
        const pdfFileName = fileName || (
            (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A')
                ? `${sanitizeFolderName(serialNumber)}.pdf`
                : `${safeProjectName}.pdf`
        );

        console.log(`📄 PDF export kezdés: ${pdfFileName}`);

        // PDF buffer konvertálása
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

        const isProduction = !!process.env.DATABASE_URL;

        if (isProduction) {
            console.log('🏭 Éles környezet - Google Drive feltöltés');

            try {
                if (!driveService) {
                    console.log('⚠️ Drive service inicializálása...');
                    await initializeGoogleDrive();
                }

                const projectFolderId = await getOrCreateFolder(safeProjectName, MAIN_DRIVE_FOLDER_ID);
                const pdfFolderId = await getOrCreateDailyPdfFolder(safeFolderName, projectFolderId);

                // PDF feltöltése
                const uploadResult = await uploadPdfWithVersionControl(pdfBuffer, pdfFileName, pdfFolderId);
                console.log(`✅ PDF feltöltve: ${uploadResult.webViewLink}`);

                // ⭐ MÓDOSÍTOTT - Képek feltöltése EXIF metaadatokkal
                if (images && Object.keys(images).length > 0) {
                    const allImages = [];
                    
                    // Képek összegyűjtése az összes kategóriából
                    Object.keys(images).forEach(itemId => {
                        if (Array.isArray(images[itemId])) {
                            images[itemId].forEach(imgObj => {
                                // ⭐ FONTOS - A frontend objektumot küld: { data, originalData, metadata }
                                if (imgObj && imgObj.originalData) {
                                    // ⭐ ÚJ: originalData = tömörítetlen verzió Google Drive-hoz!
                                    allImages.push({
                                        data: imgObj.originalData,  // ⭐ TÖMÖRÍTETLEN!
                                        compressedData: imgObj.data,  // Tömörített (backup)
                                        metadata: imgObj.metadata || {},
                                        itemId: itemId
                                    });
                                } else if (imgObj && imgObj.data) {
                                    // Fallback: ha nincs originalData, használjuk a data-t
                                    allImages.push({
                                        data: imgObj.data,
                                        metadata: imgObj.metadata || {},
                                        itemId: itemId
                                    });
                                } else if (typeof imgObj === 'string') {
                                    // Régi formátum támogatása (csak base64 string)
                                    allImages.push({
                                        data: imgObj,
                                        metadata: {},
                                        itemId: itemId
                                    });
                                }
                            });
                        }
                    });

                    console.log(`📸 ${allImages.length} kép feltöltése metaadatokkal...`);
                    const startTime = Date.now();

                    const uploadImagePromises = allImages.map(async (imgObj, index) => {
                        const imgStartTime = Date.now();
                        try {
                            console.log(`📤 [${index + 1}/${allImages.length}] Kép feltöltés kezdés (EXIF metaadatokkal)...`);

                            // ⭐ base64 → buffer
                            const base64Data = imgObj.data.replace(/^data:image\/\w+;base64,/, '');
                            const imageBuffer = Buffer.from(base64Data, 'base64');

                            console.log(`📦 Eredeti képméret: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

                            // ⭐ KRITIKUS FIX: SZERVEROLDALI EXIF BEOLVASÁS!
                            console.log(`🔍 Szerveroldali EXIF beolvasás (base64 képből)...`);
                            const serverExifMetadata = await extractExifMetadata(imgObj.data);

                            console.log(`📋 Szerver által kinyert EXIF:`, {
                                hasDate: serverExifMetadata.hasDate,
                                hasGPS: serverExifMetadata.hasGPS,
                                location: serverExifMetadata.location,
                                latitude: serverExifMetadata.latitude,
                                longitude: serverExifMetadata.longitude,
                                takenDate: serverExifMetadata.takenDate
                            });

                            // ⭐ SZERVER EXIF elsőbbsége, frontend metadata fallback
                            const finalMetadata = {
                                // Ha a szerver talált GPS-t, használjuk azt
                                takenDate: serverExifMetadata.hasDate ? serverExifMetadata.takenDate : (imgObj.metadata?.takenDate || new Date().toISOString()),
                                location: serverExifMetadata.hasGPS ? serverExifMetadata.location : (imgObj.metadata?.location || 'Nincs GPS adat'),
                                latitude: serverExifMetadata.hasGPS ? serverExifMetadata.latitude : (imgObj.metadata?.latitude || null),
                                longitude: serverExifMetadata.hasGPS ? serverExifMetadata.longitude : (imgObj.metadata?.longitude || null),
                                camera: serverExifMetadata.camera || imgObj.metadata?.camera || null,
                                hasGPS: serverExifMetadata.hasGPS || (imgObj.metadata?.hasGPS || false),
                                hasDate: serverExifMetadata.hasDate || (imgObj.metadata?.hasDate || false),
                                // Kiegészítő metaadatok
                                itemId: imgObj.itemId,
                                serialNumber: serialNumber || 'N/A',
                                projectName: projectName,
                                uploadDate: new Date().toISOString()
                            };

                            console.log(`✅ Végső metaadatok (szerver prioritással):`, {
                                hasDate: finalMetadata.hasDate,
                                hasGPS: finalMetadata.hasGPS,
                                location: finalMetadata.location,
                                latitude: finalMetadata.latitude,
                                longitude: finalMetadata.longitude
                            });

                            // ⭐ KRITIKUS: EXIF GPS metaadatok visszarakása Sharp-pal
                            let finalImageBuffer = imageBuffer;

                            if (finalMetadata.latitude && finalMetadata.longitude &&
                                !isNaN(finalMetadata.latitude) && !isNaN(finalMetadata.longitude)) {

                                console.log(`🌍 GPS koordináták hozzáadása EXIF-hez: ${finalMetadata.latitude}, ${finalMetadata.longitude}`);

                                try {
                                    // ⭐ GPS koordináták decimális → DMS konverzió
                                    function toDegreesMinutesSeconds(decimal) {
                                        const absolute = Math.abs(decimal);
                                        const degrees = Math.floor(absolute);
                                        const minutesNotTruncated = (absolute - degrees) * 60;
                                        const minutes = Math.floor(minutesNotTruncated);
                                        const seconds = (minutesNotTruncated - minutes) * 60;
                                        return [degrees, minutes, seconds];
                                    }

                                    const latDMS = toDegreesMinutesSeconds(finalMetadata.latitude);
                                    const lonDMS = toDegreesMinutesSeconds(finalMetadata.longitude);

                                    // ⭐ Sharp EXIF GPS formátum
                                    const exifData = {
                                        IFD0: {
                                            Make: finalMetadata.camera || 'Unknown',
                                            Model: finalMetadata.camera || 'Unknown'
                                        },
                                        GPSInfo: {
                                            GPSLatitudeRef: finalMetadata.latitude >= 0 ? 'N' : 'S',
                                            GPSLatitude: latDMS,
                                            GPSLongitudeRef: finalMetadata.longitude >= 0 ? 'E' : 'W',
                                            GPSLongitude: lonDMS,
                                            GPSVersionID: [2, 3, 0, 0]
                                        }
                                    };

                                    console.log(`📍 GPS EXIF DMS:`, {
                                        lat: latDMS,
                                        latRef: exifData.GPSInfo.GPSLatitudeRef,
                                        lon: lonDMS,
                                        lonRef: exifData.GPSInfo.GPSLongitudeRef
                                    });

                                    // ⭐ Kép újraírása EXIF GPS metaadatokkal
                                    finalImageBuffer = await sharp(imageBuffer)
                                        .withExif(exifData)
                                        .jpeg({ quality: 100 }) // 100% minőség
                                        .toBuffer();

                                    console.log(`✅ EXIF GPS metaadatok beágyazva képbe`);
                                } catch (exifError) {
                                    console.warn(`⚠️ EXIF GPS hozzáadása sikertelen:`, exifError.message);
                                    finalImageBuffer = imageBuffer;
                                }
                            } else {
                                console.log(`ℹ️ Nincs GPS adat - kép feltöltése GPS nélkül`);
                            }

                            // Fájlnév generálása a PDF neve alapján
                            const pdfBaseName = pdfFileName.replace(/\.pdf$/i, ''); // PDF név .pdf kiterjesztés nélkül
                            const imageFileName = allImages.length > 1
                                ? `${pdfBaseName} (${index + 1}).jpg`
                                : `${pdfBaseName}.jpg`;

                            // ⭐ Feltöltés GPS EXIF metaadatokkal
                            const imageUploadResult = await uploadBufferToDrive(
                                finalImageBuffer,  // ⭐ GPS EXIF-el ellátott kép
                                imageFileName,
                                pdfFolderId,
                                'image/jpeg',
                                finalMetadata
                            );

                            const imgElapsed = ((Date.now() - imgStartTime) / 1000).toFixed(2);
                            console.log(`✅ Eredeti kép feltöltve metaadatokkal: ${imageFileName} (${(imageBuffer.length / 1024).toFixed(2)} KB, ${imgElapsed}s)`);

                            return {
                                url: imageUploadResult.webViewLink,
                                id: imageUploadResult.id,
                                metadata: finalMetadata
                            };

                        } catch (imgErr) {
                            console.error(`❌ Hiba a kép feltöltésekor (${index + 1}):`, imgErr.message);
                            return null;
                        }
                    });

                    const uploadedImages = await Promise.all(uploadImagePromises);
                    const successfulUploads = uploadedImages.filter(img => img !== null);

                    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                    console.log(`🎉 ${successfulUploads.length}/${allImages.length} kép sikeresen feltöltve metaadatokkal (${totalElapsed}s összesen)`);

                    res.json({
                        success: true,
                        message: 'PDF és képek sikeresen feltöltve a Google Drive-ra',
                        driveUrl: uploadResult.webViewLink,
                        images: successfulUploads
                    });
                } else {
                    res.json({
                        success: true,
                        message: 'PDF sikeresen feltöltve',
                        driveUrl: uploadResult.webViewLink
                    });
                }

            } catch (driveErr) {
                console.error('❌ Hiba a Google Drive feltöltésnél:', driveErr.message);
                res.json({
                    success: true,
                    message: 'PDF letöltésre kész (Drive feltöltés sikertelen)',
                    pdfData: pdfBuffer.toString('base64')
                });
            }
        } else {
            console.log('🏠 Fejlesztői környezet - PDF csak letöltésre');
            res.json({
                success: true,
                message: 'PDF letöltésre kész (fejlesztői környezet)',
                pdfData: pdfBuffer.toString('base64')
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

// ⭐ ÚJ ROUTE - Képek metaadatainak lekérése Drive-ról
router.get('/projects/:projectId/images-metadata', isAuthenticated, async (req, res) => {
    const { serialNumber } = req.query;
    
    try {
        if (!driveService) {
            await initializeGoogleDrive();
        }

        // Képek keresése serialNumber alapján
        const response = await driveService.files.list({
            q: `properties has { key='serialNumber' and value='${serialNumber}' } and mimeType='image/jpeg' and trashed=false`,
            fields: 'files(id, name, webViewLink, description, properties, createdTime)',
            orderBy: 'createdTime'
        });

        const imagesWithMetadata = response.data.files.map(file => {
            let metadata = {};
            try {
                if (file.description) {
                    metadata = JSON.parse(file.description);
                }
            } catch (e) {
                console.warn('Nem sikerült a metadata parse-olása');
            }

            return {
                id: file.id,
                name: file.name,
                url: file.webViewLink,
                createdTime: file.createdTime,
                takenDate: file.properties?.takenDate || metadata.takenDate || 'Nincs adat',
                location: file.properties?.location || metadata.location || 'Nincs GPS adat',
                latitude: file.properties?.latitude || metadata.latitude,
                longitude: file.properties?.longitude || metadata.longitude,
                camera: file.properties?.camera || metadata.camera,
                hasGPS: file.properties?.hasGPS === 'true',
                hasDate: file.properties?.hasDate === 'true'
            };
        });

        res.json({
            success: true,
            images: imagesWithMetadata
        });

    } catch (error) {
        console.error('❌ Hiba a metaadatok lekérésekor:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
module.exports.createProjectFolder = createProjectFolder;
module.exports.initializeDrive = initializeGoogleDrive;