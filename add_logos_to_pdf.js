const fs = require('fs');

console.log('🔧 Logók hozzáadása a PDF docDefinition-hoz...\n');

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

        // 1. Ellenőrizzük hogy van-e már images: { ... } a docDefinition-ban
        if (content.includes('images: {') && content.includes('mvmLogo:')) {
            console.log('  ✓ Logók már léteznek a docDefinition-ban');
            continue;
        }

        // 2. Keressük meg a docDefinition végét (a closing }; előtti részt)
        const docDefPattern = /const docDefinition = \{[\s\S]*?\};/;
        const match = content.match(docDefPattern);

        if (!match) {
            console.warn('  ⚠️ Nem találom a docDefinition-t');
            continue;
        }

        const docDef = match[0];

        // 3. Adjuk hozzá az images részt a docDefinition végére (defaultStyle után vagy végén)
        let newDocDef = docDef;

        if (docDef.includes('defaultStyle:')) {
            // Ha van defaultStyle, utána tegyük
            newDocDef = docDef.replace(
                /(defaultStyle:\s*\{[^}]+\})/,
                `$1,

    images: {
        mvmLogo: mvmLogoBase64,
        iwsLogo: iwsLogoBase64
    }`
            );
        } else {
            // Ha nincs defaultStyle, a végére (a closing }; elé)
            newDocDef = docDef.replace(
                /\};$/,
                `,

    images: {
        mvmLogo: mvmLogoBase64,
        iwsLogo: iwsLogoBase64
    }
};`
            );
        }

        // 4. Cseréljük le a docDefinition-t
        content = content.replace(docDefPattern, newDocDef);

        // 5. Mentés
        fs.writeFileSync(file, content);
        console.log('  ✅ Logók hozzáadva a docDefinition-hoz');

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Logók hozzáadva minden PDF docDefinition-hoz!');
