const fs = require('fs');

console.log('🔧 Duplikált sorok törlése a calculateTotal függvényből...\n');

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

        // Keressük meg a duplikált sorokat a calculateTotal után
        // A pattern: function calculateTotal() { ... } majd duplikált });  és document.getElementById...

        const badPattern = /function calculateTotal\(\) \{[\s\S]*?return total;\s*\}\s*\}\);[\s\S]*?document\.getElementById\('totalPrice'\)\.textContent = total\.toLocaleString\('hu-HU'\) \+ ' Ft';\s*\}/;

        const match = content.match(badPattern);

        if (match) {
            console.log('  ✓ Duplikált sorok megtalálva');

            // Cseréljük le a helyes verzióra (csak egy return total; } kell)
            const fixed = match[0].replace(
                /return total;\s*\}\s*\}\);[\s\S]*?document\.getElementById\('totalPrice'\)\.textContent = total\.toLocaleString\('hu-HU'\) \+ ' Ft';\s*\}/,
                `return total;
        }`
            );

            content = content.replace(badPattern, fixed);
            fs.writeFileSync(file, content);
            console.log('  ✅ Duplikált sorok törölve és mentve');
        } else {
            console.log('  ℹ️ Nincs duplikáció');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Duplikációk törölve!');
