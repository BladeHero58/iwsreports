const fs = require('fs');

console.log('🔧 Tab-okhoz kapcsolódó felesleges függvények törlése...\n');

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

        // 1. switchTab függvény törlése
        const switchTabPattern = /function switchTab\(tab\) \{[\s\S]*?\n        \}\n\n/;
        if (content.match(switchTabPattern)) {
            content = content.replace(switchTabPattern, '');
            changeCount++;
            console.log('  ✅ switchTab függvény törölve');
        }

        // 2. handleSignatureUpload függvény törlése
        const handleUploadPattern = /function handleSignatureUpload\(event\) \{[\s\S]*?\n        \}\n\n/;
        if (content.match(handleUploadPattern)) {
            content = content.replace(handleUploadPattern, '');
            changeCount++;
            console.log('  ✅ handleSignatureUpload függvény törölve');
        }

        // 3. clearUploadedSignature függvény törlése
        const clearUploadedPattern = /function clearUploadedSignature\(\) \{[\s\S]*?\n        \}\n\n/;
        if (content.match(clearUploadedPattern)) {
            content = content.replace(clearUploadedPattern, '');
            changeCount++;
            console.log('  ✅ clearUploadedSignature függvény törölve');
        }

        // 4. saveUploadedSignature függvény törlése
        const saveUploadedPattern = /function saveUploadedSignature\(\) \{[\s\S]*?\n        \}\n\n/;
        if (content.match(saveUploadedPattern)) {
            content = content.replace(saveUploadedPattern, '');
            changeCount++;
            console.log('  ✅ saveUploadedSignature függvény törölve');
        }

        if (changeCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${changeCount} függvény törölve és mentve`);
        } else {
            console.log('  ℹ️ Nincs törlendő tab függvény');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Tab függvények törölve minden kategóriából!');
console.log('   Most már csak az egyszerű rajzoló canvas függvények maradtak.');
