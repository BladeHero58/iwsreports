const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// A kulcsfájl elérési útja a root/secrets mappába mutat
const KEYFILEPATH = path.join(__dirname, 'secrets', 'service-account.json');

const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: ['https://www.googleapis.com/auth/drive']
});

const driveService = google.drive({ version: 'v3', auth });

// Ellenőrzi, hogy létezik-e a megadott mappa és visszaadja az ID-t
// Ha nem létezik, létrehozza a mappát
async function getOrCreateFolder(folderName, parentFolderId) {
    const res = await driveService.files.list({
        q: `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    const folder = res.data.files[0];
    if (folder) return folder.id;

    const newFolder = await driveService.files.create({
        resource: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentFolderId]
        },
        fields: 'id'
    });

    return newFolder.data.id;
}

// Megkeresi és törli a megadott nevű mappát adott szülő mappában
async function deleteFolderIfExists(folderName, parentFolderId) {
    try {
        const res = await driveService.files.list({
            q: `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        const folders = res.data.files;
        if (folders && folders.length > 0) {
            console.log(`🗑️ Régi mappa törlése: ${folderName} (ID: ${folders[0].id})`);
            
            // A Google Drive API-val törli a mappát (kukába helyezi)
            await driveService.files.delete({
                fileId: folders[0].id
            });
            
            return true; // Sikeres törlés
        }
        return false; // Nem volt mit törölni
    } catch (error) {
        console.error(`❌ Hiba a mappa törlése során (${folderName}):`, error.message);
        throw error;
    }
}

// Létrehoz egy aznapi dátummal ellátott mappát, előtte törli ha létezik
async function createDailyFolder(projectFolderId) {
    // Mai dátum alapján mappa név létrehozása
    const today = new Date();
    const dateString = today.toLocaleDateString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).replace(/\./g, '').replace(/\//g, ''); // Formátum: 2025.04.28 -> 20250428
    
    const dailyFolderName = `${dateString}`;
    
    // Töröljük a meglévő mappát ha létezik
    await deleteFolderIfExists(dailyFolderName, projectFolderId);
    
    // Létrehozzuk az új mappát
    const dailyFolderId = await driveService.files.create({
        resource: {
            name: dailyFolderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [projectFolderId]
        },
        fields: 'id'
    });
    
    console.log(`📁 Aznapi mappa létrehozva: ${dailyFolderName} (ID: ${dailyFolderId.data.id})`);
    return dailyFolderId.data.id;
}

// PDF feltöltése a Google Drive-ra
async function uploadPdfToDrive(filePath, fileName, folderId) {
    const fileMetadata = {
        name: fileName,
        parents: [folderId]
    };

    const media = {
        mimeType: 'application/pdf',
        body: fs.createReadStream(filePath)
    };

    const file = await driveService.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, webContentLink'
    });

    return file.data;
}

// Képek feltöltése a Google Drive-ra
async function uploadImagesToDrive(imageUrls, dailyFolderId) {
    try {
        // Képek feltöltése
        const uploadResults = [];
        
        for (const imageUrl of imageUrls) {
            try {
                // A helyi fájlrendszerbeli útvonal kinyerése a képhez
                const imagePath = path.join(process.cwd(), imageUrl.replace(/^\//, ''));
                
                // A fájlnév kinyerése az útvonalból
                const fileName = path.basename(imagePath);
                
                // MIME típus meghatározása
                const mimeType = imageUrl.toLowerCase().endsWith('.png') ? 'image/png' : 
                                imageUrl.toLowerCase().endsWith('.jpg') || imageUrl.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' :
                                'application/octet-stream';
                
                // Kép feltöltése
                const fileMetadata = {
                    name: fileName,
                    parents: [dailyFolderId]
                };
                
                const media = {
                    mimeType: mimeType,
                    body: fs.createReadStream(imagePath)
                };
                
                const uploadedFile = await driveService.files.create({
                    resource: fileMetadata,
                    media: media,
                    fields: 'id, webViewLink'
                });
                
                uploadResults.push({
                    originalUrl: imageUrl,
                    driveFileId: uploadedFile.data.id,
                    driveUrl: uploadedFile.data.webViewLink,
                    fileName: fileName
                });
                
                console.log(`✅ Kép feltöltve: ${fileName} (ID: ${uploadedFile.data.id})`);
            } catch (err) {
                console.error(`❌ Hiba a kép feltöltése során: ${imageUrl}`, err.message);
                // Folytatjuk a többi kép feltöltésével akkor is, ha egy sikertelen
            }
        }
        
        return {
            uploadedImages: uploadResults
        };
    } catch (error) {
        console.error('❌ Hiba a képek feltöltése során:', error.message);
        throw error;
    }
}

module.exports = {
    getOrCreateFolder,
    createDailyFolder,
    uploadPdfToDrive,
    uploadImagesToDrive,
    driveService
};