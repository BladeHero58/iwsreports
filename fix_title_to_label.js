const fs = require('fs');

console.log('🔧 Items tömb property egységesítése: title → label...\n');

const categories = [
    'views/mvm-work-environment.ejs',
    'views/mvm-personal-conditions.ejs',
    'views/mvm-machinery.ejs'
];

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Csere: { id: 'X_Y', title: '...' } → { id: 'X_Y', label: '...' }
        // Regex pattern ami megtalálja az összes ilyen sort
        const pattern = /(\{ id: '[^']+', )title(: '[^']+' \})/g;

        const matches = content.match(pattern);
        if (matches) {
            console.log(`  ✓ ${matches.length} darab 'title' property megtalálva`);

            content = content.replace(pattern, '$1label$2');

            fs.writeFileSync(file, content);
            console.log(`  ✅ Minden 'title' → 'label' cserélve és mentve`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló (már label van vagy nincs items tömb)');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Items tömb properties egységesítve!');
console.log('   Most már minden kategória "label"-t használ.');
