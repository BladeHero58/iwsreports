const fs = require('fs');

console.log('🔧 Minden template literal javítása a <script> tag-en belül...\n');

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

        // 1. Progress bar console.log
        // console.log(`📊 Progress: ${Math.round(percent)}% - ${status}`);
        const old1 = /console\.log\(`📊 Progress: \$\{Math\.round\(percent\)\}% - \$\{status\}`\);/g;
        const new1 = `console.log('📊 Progress: ' + Math.round(percent) + '% - ' + status);`;
        if (content.match(old1)) {
            content = content.replace(old1, new1);
            changeCount++;
        }

        // 2. Serial number generation
        // const generatedSerial = `${serialPrefix}/${year}${month}${day}`;
        const old2 = /const generatedSerial = `\$\{serialPrefix\}\/\$\{year\}\$\{month\}\$\{day\}`;/g;
        const new2 = `const generatedSerial = serialPrefix + '/' + year + month + day;`;
        if (content.match(old2)) {
            content = content.replace(old2, new2);
            changeCount++;
        }

        // 3. Witness div id
        // witnessDiv.id = `witness_${witnessIndex}`;
        const old3 = /witnessDiv\.id = `witness_\$\{witnessIndex\}`;/g;
        const new3 = `witnessDiv.id = 'witness_' + witnessIndex;`;
        if (content.match(old3)) {
            content = content.replace(old3, new3);
            changeCount++;
        }

        // 4. Witness innerHTML - ez bonyolultabb, multiline string
        // Ezt külön kezeljük regex-szel
        const witnessInnerHTMLPattern = /witnessDiv\.innerHTML = `[\s\S]*?`;[\s]*witnessesContainer/;
        if (content.match(witnessInnerHTMLPattern)) {
            // Keressük meg a teljes innerHTML blokkot
            const match = content.match(/witnessDiv\.innerHTML = `([\s\S]*?)`;/);
            if (match) {
                const innerHTMLContent = match[1];
                // Cseréljük le az összes ${...} kifejezést string concatenation-ra
                let fixedInnerHTML = innerHTMLContent
                    .replace(/\$\{witnessIndex \+ 1\}/g, `' + (witnessIndex + 1) + '`)
                    .replace(/\$\{witnessIndex\}/g, `' + witnessIndex + '`);

                // Most cseréljük le a backtick-eket single quote-ra és adjunk hozzá concatenation-t
                const newInnerHTMLStatement = `witnessDiv.innerHTML = '${fixedInnerHTML}';`;
                content = content.replace(/witnessDiv\.innerHTML = `[\s\S]*?`;/, newInnerHTMLStatement);
                changeCount++;
            }
        }

        // 5. Subcontractor counter
        // ${subcontractorCounter + 1}
        const old5 = /\$\{subcontractorCounter \+ 1\}/g;
        const new5 = `' + (subcontractorCounter + 1) + '`;
        if (content.match(old5)) {
            content = content.replace(old5, new5);
            changeCount++;
        }

        // 6. Subcontractor name
        // name="subcontractor_${subcontractorCounter}"
        const old6 = /name="subcontractor_\$\{subcontractorCounter\}"/g;
        const new6 = `name="subcontractor_' + subcontractorCounter + '"`;
        if (content.match(old6)) {
            content = content.replace(old6, new6);
            changeCount++;
        }

        // 7. Index + 2 in span
        // span.textContent = `${index + 2}.`;
        const old7 = /span\.textContent = `\$\{index \+ 2\}\.`;/g;
        const new7 = `span.textContent = (index + 2) + '.';`;
        if (content.match(old7)) {
            content = content.replace(old7, new7);
            changeCount++;
        }

        // 8. querySelector with item_${itemId}
        // document.querySelector(`input[name="item_${itemId}"]:checked`)
        const old8 = /document\.querySelector\(`input\[name="item_\$\{itemId\}"\]:checked`\)/g;
        const new8 = `document.querySelector('input[name="item_' + itemId + '"]:checked')`;
        if (content.match(old8)) {
            content = content.replace(old8, new8);
            changeCount++;
        }

        // 9. getElementById severity_${itemId}
        // document.getElementById(`severity_${itemId}`)
        const old9 = /document\.getElementById\(`severity_\$\{itemId\}`\)/g;
        const new9 = `document.getElementById('severity_' + itemId)`;
        if (content.match(old9)) {
            content = content.replace(old9, new9);
            changeCount++;
        }

        // 10. querySelectorAll input[name="item_${itemId}_severity"]
        // document.querySelectorAll(`input[name="item_${itemId}_severity"]`)
        const old10 = /document\.querySelectorAll\(`input\[name="item_\$\{itemId\}_severity"\]`\)/g;
        const new10 = `document.querySelectorAll('input[name="item_' + itemId + '_severity"]')`;
        if (content.match(old10)) {
            content = content.replace(old10, new10);
            changeCount++;
        }

        if (changeCount > 0) {
            fs.writeFileSync(file, content);
            console.log(`  ✅ ${changeCount} template literal csoportjavítva és mentve`);
        } else {
            console.log('  ℹ️ Nincs javítanivaló template literal');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Minden <script> tag-en belüli template literal javítva!');
console.log('   VSCode piros jelzései el kellene hogy tűnjenek.');
