const fs = require('fs');

console.log('🔧 Status színes stílusok hozzáadása a PDF-hez...\n');

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

// Az új status stílusok (documentation.ejs-ből)
const statusStyles = `statusOk: {
        fontSize: 11,
        color: '#000000',
        bold: true,
        background: '#66FF66',
        margin: [5, 0, 5, 5]
    },
    statusFail: {
        fontSize: 11,
        color: '#000000',
        bold: true,
        background: '#FF0000',
        margin: [5, 0, 5, 5]
    },
    statusFT: {
        fontSize: 11,
        color: '#000000',
        bold: true,
        background: '#3b82f6',
        margin: [5, 0, 5, 5]
    },
    statusNA: {
        fontSize: 11,
        color: '#92400e',
        bold: true,
        background: '#fef3c7',
        margin: [5, 0, 5, 5]
    },
    checklistTitle: {
        fontSize: 12,
        bold: true,
        margin: [5, 5, 5, 2]
    },
    notes: {
        fontSize: 9,
        italics: true,
        color: '#666',
        margin: [5, 3, 5, 5]
    },`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Ellenőrizzük hogy már van-e statusOk stílus
        if (content.includes('statusOk:')) {
            console.log('  ✓ Status stílusok már léteznek');
            continue;
        }

        // Keressük meg a styles objektumot és adjuk hozzá a status stílusokat
        // A pattern: styles: { ... sanctionsSubtitle: ... }

        // Keressük meg a sanctionsSubtitle sort, mert utána akarjuk beszúrni
        const insertPattern = /(sanctionsSubtitle: \{ fontSize: 12, italics: true, color: '#666' \})/;

        if (content.match(insertPattern)) {
            console.log('  ✓ sanctionsSubtitle megtalálva');

            // Beszúrjuk a status stílusokat a sanctionsSubtitle után
            content = content.replace(
                insertPattern,
                `$1,\n    ${statusStyles}`
            );

            console.log('  ✅ Status stílusok hozzáadva');
            fs.writeFileSync(file, content);
            console.log('  ✅ Fájl mentve');
        } else {
            console.warn('  ⚠️ Nem találom a sanctionsSubtitle stílust, próbálom másképp...');

            // Alternatív módszer: keressük meg a styles objektum végét
            const altPattern = /(sanctions: \{ fontSize: 11, margin: \[0, 3, 0, 3\] \})\s*\}/;
            if (content.match(altPattern)) {
                content = content.replace(
                    altPattern,
                    `$1,\n    ${statusStyles.replace(/,$/, '')}\n}`
                );
                console.log('  ✅ Status stílusok hozzáadva (alternatív módszer)');
                fs.writeFileSync(file, content);
                console.log('  ✅ Fájl mentve');
            } else {
                console.error('  ❌ Nem sikerült megtalálni a beszúrási pontot');
            }
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Status színes stílusok hozzáadva minden kategóriához!');
console.log('   Most már a státuszok színezve jelennek meg a PDF-ben.');
