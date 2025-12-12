const fs = require('fs');

console.log('🔧 PDF .download() lecserélése .getBase64() + upload logikára...\n');

const categories = [
    { file: 'views/mvm-work-environment.ejs', path: 'work-environment', num: 2 },
    { file: 'views/mvm-personal-conditions.ejs', path: 'personal-conditions', num: 3 },
    { file: 'views/mvm-machinery.ejs', path: 'machinery', num: 4 },
    { file: 'views/mvm-electrical-safety.ejs', path: 'electrical-safety', num: 5 },
    { file: 'views/mvm-personal-protective-equipment.ejs', path: 'personal-protective-equipment', num: 6 },
    { file: 'views/mvm-first-aid.ejs', path: 'first-aid', num: 7 },
    { file: 'views/mvm-hazardous-materials.ejs', path: 'hazardous-materials', num: 8 },
    { file: 'views/mvm-omissions.ejs', path: 'omissions', num: 9 },
    { file: 'views/mvm-other.ejs', path: 'other', num: 10 }
];

// Az új upload logika template
const uploadLogicTemplate = (categoryPath, projectId = '<%= project.id %>') => `
            // ⭐ PDF generálás és Google Drive feltöltés
            pdfMake.createPdf(docDefinition).getBase64(async function(pdfBase64) {
                console.log('📤 PDF base64 generálva, méret:', pdfBase64.length, 'karakter');
                const imageCount = Object.keys(uploadedImages).reduce((sum, key) => sum + (uploadedImages[key]?.length || 0), 0);
                console.log('📤 Képek száma feltöltésre:', imageCount);

                // ⭐ Progress bar megjelenítése
                showUploadProgress();
                updateUploadProgress(10, 'PDF előkészítése...');

                try {
                    // Küldés a backend-nek
                    updateUploadProgress(20, \`PDF és \${imageCount} kép feltöltése a szerverre...\`);
                    console.log('🌐 Fetch kezdés - PDF és képek feltöltése...');

                    const pdfFileName = generatePdfFileName();

                    const response = await fetch('/projects/${projectId}/reports/${categoryPath}/export-pdf', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            pdfData: \`data:application/pdf;base64,\${pdfBase64}\`,
                            serialNumber: data.serialNumber || 'N/A',
                            projectName: data.projectName || '<%= project.name %>',
                            fileName: pdfFileName,
                            images: uploadedImages
                        })
                    });

                    updateUploadProgress(40, 'Válasz fogadása...');
                    console.log('📡 Válasz érkezett:', response.status, response.statusText);

                    if (!response.ok) {
                        hideUploadProgress();
                        throw new Error(\`HTTP hiba! Státusz: \${response.status}\`);
                    }

                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        hideUploadProgress();
                        const responseText = await response.text();
                        console.error('❌ Nem JSON válasz érkezett:', responseText.substring(0, 500));
                        throw new Error('A szerver nem JSON választ küldött. Lehet, hogy ki vagy jelentkezve vagy szerver hiba történt.');
                    }

                    updateUploadProgress(60, 'Adatok feldolgozása...');
                    const result = await response.json();
                    console.log('✅ Backend válasz:', result);

                    if (result.success) {
                        updateUploadProgress(80, 'Drive feltöltés...');

                        if (result.driveUrl) {
                            updateUploadProgress(100, \`✅ \${imageCount} kép sikeresen feltöltve!\`);

                            setTimeout(() => {
                                hideUploadProgress();
                                alert('✅ PDF sikeresen exportálva és feltöltve a Google Drive-ra!');
                                console.log('📂 Drive URL:', result.driveUrl);
                                if (result.images && result.images.length > 0) {
                                    console.log(\`📸 \${result.images.length} kép sikeresen feltöltve metaadatokkal\`);
                                }
                            }, 500);
                        } else {
                            hideUploadProgress();
                            alert('✅ PDF letöltésre kész!');
                        }
                    } else {
                        hideUploadProgress();
                        console.warn('⚠️ Backend hiba:', result.message);
                        alert('⚠️ Hiba: ' + (result.message || 'Ismeretlen hiba'));
                    }

                    // ⭐ PDF letöltés (minden eszközön)
                    const fileName = pdfFileName;
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

                    console.log(\`📱 Eszköz típus: \${isMobile ? 'Mobil' : 'Asztal'}, iOS: \${isIOS}\`);

                    pdfMake.createPdf(docDefinition).getBlob(function(blob) {
                        try {
                            const blobUrl = URL.createObjectURL(blob);

                            if (isIOS) {
                                console.log('🍎 iOS eszköz - Új ablak megnyitása');
                                const reader = new FileReader();
                                reader.onloadend = function() {
                                    const newWindow = window.open('', '_blank');
                                    if (newWindow) {
                                        newWindow.document.write(\`
                                            <html>
                                            <head><title>\${fileName}</title></head>
                                            <body style="margin:0;">
                                                <embed src="\${reader.result}" type="application/pdf" width="100%" height="100%" />
                                            </body>
                                            </html>
                                        \`);
                                    } else {
                                        alert('⚠️ Kérlek engedélyezd az új ablak megnyitását a böngészőben!');
                                    }
                                };
                                reader.readAsDataURL(blob);
                            } else if (isMobile) {
                                console.log('📱 Mobil böngésző - Letöltés indítása');
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = fileName;
                                link.style.display = 'none';
                                document.body.appendChild(link);
                                if (link.click) {
                                    link.click();
                                } else {
                                    const clickEvent = new MouseEvent('click', {
                                        view: window,
                                        bubbles: true,
                                        cancelable: true
                                    });
                                    link.dispatchEvent(clickEvent);
                                }
                                setTimeout(() => {
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(blobUrl);
                                }, 100);
                                console.log('✅ PDF letöltés elindítva (mobil)');
                            } else {
                                console.log('💻 Asztali böngésző - Standard letöltés');
                                const link = document.createElement('a');
                                link.href = blobUrl;
                                link.download = fileName;
                                link.style.display = 'none';
                                document.body.appendChild(link);
                                link.click();
                                setTimeout(() => {
                                    document.body.removeChild(link);
                                    URL.revokeObjectURL(blobUrl);
                                }, 100);
                            }
                        } catch (error) {
                            console.error('❌ PDF letöltési hiba:', error);
                            alert('⚠️ Hiba történt a PDF letöltésekor. Próbáld újra!');
                        }
                    });

                } catch (error) {
                    hideUploadProgress();
                    console.error('❌ Kritikus hiba a PDF exportálás során:', error);

                    let errorMessage = '⚠️ Hiba történt a PDF exportálása közben.\\n\\n';

                    if (error.name === 'TypeError' && error.message.includes('fetch')) {
                        errorMessage += 'Hálózati kapcsolat hiba. Ellenőrizd az internet kapcsolatot és próbáld újra!';
                    } else if (error.message.includes('HTTP hiba')) {
                        errorMessage += 'Szerver hiba: ' + error.message;
                    } else {
                        errorMessage += error.message || 'Ismeretlen hiba történt.';
                    }

                    alert(errorMessage);

                    // Próbáljunk helyi letöltést biztonsági mentésként
                    console.log('🔄 Próbálkozás helyi PDF letöltéssel...');
                    try {
                        const fileName = generatePdfFileName();
                        pdfMake.createPdf(docDefinition).download(fileName);
                        console.log('✅ Helyi letöltés sikerült');
                    } catch (downloadError) {
                        console.error('❌ Helyi letöltés is sikertelen:', downloadError);
                    }
                }
            });

            console.log('✓ PDF export folyamat elindítva');
`;

for (const cat of categories) {
    console.log(`\n📝 Feldolgozás: ${cat.file}...`);

    try {
        let content = fs.readFileSync(cat.file, 'utf8');

        // Keressük meg a pdfMake.createPdf(docDefinition).download(...) sort
        const downloadPattern = /pdfMake\.createPdf\(docDefinition\)\.download\([^)]+\);/;
        const match = content.match(downloadPattern);

        if (match) {
            console.log(`  ✓ Megtaláltam a .download() hívást`);

            // Cseréljük le az új upload logikára
            const newLogic = uploadLogicTemplate(cat.path);
            content = content.replace(downloadPattern, newLogic);

            // Mentés
            fs.writeFileSync(cat.file, content);
            console.log(`  ✅ Lecserélve és mentve`);
        } else {
            console.warn(`  ⚠️ Nem találom a .download() hívást ebben a fájlban`);
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ PDF upload logika hozzáadva minden kategóriához!');
