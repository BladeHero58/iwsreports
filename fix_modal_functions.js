const fs = require('fs');

console.log('🔧 Modal függvények javítása (tab hivatkozások eltávolítása)...\n');

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

// Helyes függvények (documentation.ejs-ből)
const correctOpenModal = `function openSignatureModal(type) {
            currentSignatureType = type;
            document.getElementById('signatureModal').style.display = 'block';
            clearCanvas();
        }`;

const correctCloseModal = `function closeSignatureModal() {
            document.getElementById('signatureModal').style.display = 'none';
            currentSignatureType = '';
        }`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');
        let changeCount = 0;

        // 1. openSignatureModal javítása
        const oldOpenPattern = /function openSignatureModal\(type\) \{[\s\S]*?\n        \}/;
        if (content.match(oldOpenPattern)) {
            content = content.replace(oldOpenPattern, correctOpenModal);
            changeCount++;
            console.log('  ✅ openSignatureModal javítva');
        }

        // 2. closeSignatureModal javítása
        const oldClosePattern = /function closeSignatureModal\(\) \{[\s\S]*?\n        \}/;
        if (content.match(oldClosePattern)) {
            content = content.replace(oldClosePattern, correctCloseModal);
            changeCount++;
            console.log('  ✅ closeSignatureModal javítva');
        }

        if (changeCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${changeCount} függvény javítva`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Modal függvények javítva minden kategóriában!');
console.log('   Tab hivatkozások eltávolítva.');
