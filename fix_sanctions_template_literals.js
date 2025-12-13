const fs = require('fs');

console.log('🔧 Template literal-ok javítása a szankciós függvényekben...\n');

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

        // 1. querySelector template literal a getAppliedSanctionsForPDF-ben
        // document.querySelector(`input[name="${sanctionKey}_count"]`)
        const pattern1 = /document\.querySelector\(`input\[name="\$\{sanctionKey\}_count"\]`\)/g;
        if (content.match(pattern1)) {
            content = content.replace(pattern1, `document.querySelector('input[name="' + sanctionKey + '_count"]')`);
            changeCount++;
            console.log('  ✅ querySelector template literal javítva');
        }

        // 2. countText template literal
        // const countText = count > 1 ? ` (${count}x)` : '';
        const pattern2 = /const countText = count > 1 \? ` \(\$\{count\}x\)` : '';/g;
        if (content.match(pattern2)) {
            content = content.replace(pattern2, `const countText = count > 1 ? ' (' + count + 'x)' : '';`);
            changeCount++;
            console.log('  ✅ countText template literal javítva');
        }

        // 3. result.push text template literal
        // text: `• ${sanctionLabels[sanctionKey]}${countText} - ${formattedPrice}`
        const pattern3 = /text: `• \$\{sanctionLabels\[sanctionKey\]\}\$\{countText\} - \$\{formattedPrice\}`/g;
        if (content.match(pattern3)) {
            content = content.replace(pattern3, `text: '• ' + sanctionLabels[sanctionKey] + countText + ' - ' + formattedPrice`);
            changeCount++;
            console.log('  ✅ result.push text template literal javítva');
        }

        if (changeCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${changeCount} template literal javítva`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló template literal');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Szankciós függvények template literal-jai javítva!');
