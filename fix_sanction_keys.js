const fs = require('fs');

console.log('🔧 Szankció objektum kulcsok javítása: "1" → "sanction_1"...\n');

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

        // Keressük meg a sanctionLabels objektumot
        const sanctionLabelsPattern = /const sanctionLabels = \{[\s\S]*?\};/;
        const sanctionLabelsMatch = content.match(sanctionLabelsPattern);

        if (!sanctionLabelsMatch) {
            console.log('  ℹ️ Nem találom a sanctionLabels objektumot');
            continue;
        }

        let sanctionLabelsBlock = sanctionLabelsMatch[0];
        console.log('  ✓ sanctionLabels objektum megtalálva');

        // Ellenőrizzük hogy már jó formátumban van-e (sanction_X)
        if (sanctionLabelsBlock.includes("sanction_1:")) {
            console.log('  ✓ sanctionLabels már helyes formátumban van (sanction_X)');
        } else {
            // Cseréljük le a kulcsokat: '1': → sanction_1:, '4': → sanction_4:, stb.
            // Pattern: 'szám': → sanction_szám:
            const newSanctionLabels = sanctionLabelsBlock.replace(/'(\d+)':/g, 'sanction_$1:');
            content = content.replace(sanctionLabelsPattern, newSanctionLabels);
            console.log('  ✅ sanctionLabels kulcsok javítva');
        }

        // Keressük meg a sanctionPricesRaw objektumot
        const sanctionPricesPattern = /const sanctionPricesRaw = \{[\s\S]*?\};/;
        const sanctionPricesMatch = content.match(sanctionPricesPattern);

        if (sanctionPricesMatch) {
            let sanctionPricesBlock = sanctionPricesMatch[0];
            console.log('  ✓ sanctionPricesRaw objektum megtalálva');

            // Ellenőrizzük hogy már jó formátumban van-e
            if (sanctionPricesBlock.includes("sanction_1:")) {
                console.log('  ✓ sanctionPricesRaw már helyes formátumban van (sanction_X)');
            } else {
                // Cseréljük le a kulcsokat
                const newSanctionPrices = sanctionPricesBlock.replace(/'(\d+)':/g, 'sanction_$1:');
                content = content.replace(sanctionPricesPattern, newSanctionPrices);
                console.log('  ✅ sanctionPricesRaw kulcsok javítva');
            }
        }

        // Mentés
        fs.writeFileSync(file, content);
        console.log('  ✅ Fájl mentve');

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Szankció objektum kulcsok javítva minden kategóriában!');
console.log('   Most már a checkbox.name értékekkel (sanction_X) egyeznek.');
