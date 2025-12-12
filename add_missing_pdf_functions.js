const fs = require('fs');

console.log('🔧 Hiányzó PDF függvények hozzáadása (logoToBase64, generatePdfFileName)...\n');

const categories = [
    'views/mvm-work-environment.ejs',
    'views/mvm-personal-conditions.ejs',
    'views/mvm-machinery.ejs',
    'views/mvm-electrical-safety.ejs',
    'views/mvm-personal-protective-equipment.ejs',
    'views/mvm-first-aid.ejs',
    'views/mvm-hazardous-materials.ejs',
    'views/mvm-omissions.ejs',
    'views/mvm-other.ejs'
];

// generatePdfFileName függvény
const generatePdfFileNameFunction = `
        // PDF fájlnév generálása
        function generatePdfFileName() {
            const serialNumber = document.getElementById('serialNumber').value;
            const projectName = document.getElementById('projectName').value || '<%= project.name %>';
            const timestamp = new Date().toISOString().split('T')[0];

            if (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A') {
                return \`\${serialNumber}_\${timestamp}.pdf\`;
            } else {
                return \`\${projectName}_\${timestamp}.pdf\`;
            }
        }
`;

// Logo betöltő kód az exportToPDF elejére
const logoLoadingCode = `
            const projectName = document.getElementById('projectName').value || '<%= project.name %>';
            const serialNumber = document.getElementById('serialNumber').value || 'N/A';
            const inspectorPerson = document.getElementById('inspectorPerson').value || '<%= user.name %>';
            const inspectionDateValue = document.getElementById('inspectionDate').value;
            const formattedDate = inspectionDateValue ? new Date(inspectionDateValue).toLocaleDateString('hu-HU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'N/A';

            // Logók betöltése base64-ként
            async function imageToBase64(url) {
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    return new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (error) {
                    console.warn(\`⚠️ Nem sikerült betölteni a logót: \${url}\`, error);
                    return null;
                }
            }

            const mvmLogoBase64 = await imageToBase64('/images/MVM.png');
            const iwsLogoBase64 = await imageToBase64('/images/IWS-Solutions.jpg');
`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // 1. generatePdfFileName függvény hozzáadása (ha nincs meg)
        if (!content.includes('function generatePdfFileName')) {
            console.log('  ➕ generatePdfFileName() hozzáadása...');

            // Keressük meg az exportToPDF függvény előtti részt
            const exportToPdfPos = content.indexOf('async function exportToPDF()');
            if (exportToPdfPos !== -1) {
                content = content.substring(0, exportToPdfPos) +
                         generatePdfFileNameFunction + '\n' +
                         content.substring(exportToPdfPos);
            }
        } else {
            console.log('  ✓ generatePdfFileName() már létezik');
        }

        // 2. Logo betöltő kód hozzáadása az exportToPDF elejére (ha nincs meg)
        if (!content.includes('imageToBase64')) {
            console.log('  ➕ Logo betöltő kód hozzáadása...');

            // Keressük meg az exportToPDF függvény kezdetét
            const exportStart = content.indexOf('async function exportToPDF() {');
            if (exportStart !== -1) {
                const insertPos = exportStart + 'async function exportToPDF() {'.length;
                content = content.substring(0, insertPos) +
                         logoLoadingCode +
                         content.substring(insertPos);
            }
        } else {
            console.log('  ✓ Logo betöltő kód már létezik');
        }

        // 3. Ellenőrizzük hogy a docDefinition images részében szerepelnek-e a logók
        if (!content.includes('images: {') || !content.includes('mvmLogo:')) {
            console.log('  ⚠️ FIGYELEM: A docDefinition-ban hiányoznak a logók!');
            console.log('     Kézileg hozzá kell adni:');
            console.log('     images: {');
            console.log('         mvmLogo: mvmLogoBase64,');
            console.log('         iwsLogo: iwsLogoBase64');
            console.log('     }');
        }

        // Mentés
        fs.writeFileSync(file, content);
        console.log(`  ✅ Mentve`);

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Hiányzó függvények hozzáadva!');
console.log('\n⚠️ FONTOS: Ellenőrizd hogy minden docDefinition tartalmazza:');
console.log('  - images: { mvmLogo: mvmLogoBase64, iwsLogo: iwsLogoBase64 }');
console.log('  - A content részben: { image: \'mvmLogo\', width: 80, ... }');
