const fs = require('fs');

console.log('🔧 Javítás: item.title → item.label a getChecklistItemsForPDF függvényben...\n');

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

        // Keressük meg és javítsuk a hibát a getChecklistItemsForPDF függvényben
        // A bug: text: item.title helyett text: item.label kell

        let fixCount = 0;

        // Pattern 1: text: item.title,
        if (content.includes('text: item.title,')) {
            content = content.replace(/text: item\.title,/g, 'text: item.label,');
            fixCount++;
            console.log('  ✓ Javítva: text: item.title, → text: item.label,');
        }

        // Pattern 2: text: item.title (without comma)
        if (content.includes('text: item.title\n') || content.includes('text: item.title }')) {
            content = content.replace(/text: item\.title(\s*[}\n])/g, 'text: item.label$1');
            fixCount++;
            console.log('  ✓ Javítva: text: item.title → text: item.label');
        }

        if (fixCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${fixCount} hely javítva és mentve`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló (vagy már javítva van)');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Checklist items bug javítva minden kategóriában!');
