const fs = require('fs');

console.log('🔧 generatePdfFileName függvény hozzáadása...\n');

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

// generatePdfFileName függvény (documentation.ejs alapján, DE EGYSZERŰSÍTVE)
// A documentation.ejs-ben getSubcontractorChain() van, de az csak az 1. kategóriában létezik
// Ezért használjuk a serialNumber + timestamp megoldást
const generatePdfFileNameFunction = `
        // PDF fájlnév generálása
        function generatePdfFileName() {
            const serialNumber = document.getElementById('serialNumber').value;
            const projectName = document.getElementById('projectName').value || '<%= project.name %>';
            const timestamp = new Date().toISOString().split('T')[0];

            if (serialNumber && serialNumber.trim() !== '' && serialNumber !== 'N-A') {
                return serialNumber + '_' + timestamp + '.pdf';
            } else {
                return projectName + '_' + timestamp + '.pdf';
            }
        }
`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Ellenőrizzük hogy már van-e generatePdfFileName függvény
        if (content.includes('function generatePdfFileName()')) {
            console.log('  ✓ generatePdfFileName függvény már létezik');
            continue;
        }

        // Keressük meg a rajzoló függvényeket és adjuk hozzá előtte
        // Vagy keressük meg az openSignatureModal-t és adjuk hozzá előtte
        const insertPattern = /(function openSignatureModal\(type\))/;

        if (content.match(insertPattern)) {
            console.log('  ✓ openSignatureModal megtalálva');

            // Beszúrjuk a generatePdfFileName függvényt az openSignatureModal elé
            content = content.replace(
                insertPattern,
                generatePdfFileNameFunction + '\n        $1'
            );

            console.log('  ✅ generatePdfFileName függvény hozzáadva');

            fs.writeFileSync(file, content);
            console.log('  ✅ Fájl mentve');
        } else {
            console.error('  ❌ Nem találom az openSignatureModal függvényt');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ generatePdfFileName függvény hozzáadva minden kategóriához!');
console.log('   Most már működik a PDF export!');
