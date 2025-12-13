const fs = require('fs');

console.log('🔧 Template literal-ok cseréje string concatenation-ra az EJS kompatibilitásért...\n');

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

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');
        let changeCount = 0;

        // Javítás 1: calculateTotal-ban
        // RÉGI: const countInput = document.querySelector(`input[name="${sanctionName}_count"]`);
        // ÚJ: const countInput = document.querySelector('input[name="' + sanctionName + '_count"]');

        const oldPattern1 = /const countInput = document\.querySelector\(`input\[name="\$\{sanctionName\}_count"\]`\);/g;
        const newPattern1 = `const countInput = document.querySelector('input[name="' + sanctionName + '_count"]');`;

        if (content.match(oldPattern1)) {
            content = content.replace(oldPattern1, newPattern1);
            changeCount++;
            console.log('  ✓ calculateTotal template literal javítva');
        }

        if (changeCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${changeCount} template literal javítva és mentve`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló template literal');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Template literal-ok javítva minden kategóriában!');
console.log('   Az EJS most már helyesen fogja értelmezni a fájlokat.');
