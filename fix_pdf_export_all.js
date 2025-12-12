const fs = require('fs');

console.log('🔧 PDF Export teljes javítása minden kategóriában (2-10)...\n');

// Kategóriák listája
const categories = [
    { num: 2, file: 'views/mvm-work-environment.ejs', title: '2. MUNKAKÖRNYEZET' },
    { num: 3, file: 'views/mvm-personal-conditions.ejs', title: '3. SZEMÉLYI FELTÉTELEK' },
    { num: 4, file: 'views/mvm-machinery.ejs', title: '4. MUNKAGÉPEK, MUNKAESZKÖZÖK' },
    { num: 5, file: 'views/mvm-electrical-safety.ejs', title: '5. VILLAMOS BIZTONSÁG' },
    { num: 6, file: 'views/mvm-personal-protective-equipment.ejs', title: '6. EGYÉNI VÉDŐESZKÖZÖK' },
    { num: 7, file: 'views/mvm-first-aid.ejs', title: '7. ELSŐSEGÉLYNYÚJTÁS' },
    { num: 8, file: 'views/mvm-hazardous-materials.ejs', title: '8. VESZÉLYES ANYAGOK' },
    { num: 9, file: 'views/mvm-omissions.ejs', title: '9. ELMARADT CSELEKEDETEK' },
    { num: 10, file: 'views/mvm-other.ejs', title: '10. EGYÉB' }
];

// Progress bar HTML
const progressBarHTML = `
    <!-- ⭐ Progress bar overlay -->
    <div id="uploadProgressOverlay" class="upload-progress-overlay">
        <div class="upload-progress-container">
            <div class="upload-progress-title">📤 Feltöltés folyamatban...</div>
            <div class="upload-progress-bar-container">
                <div id="uploadProgressBar" class="upload-progress-bar"></div>
                <div id="uploadProgressText" class="upload-progress-text">0%</div>
            </div>
            <div id="uploadProgressStatus" class="upload-progress-status">Inicializálás...</div>
        </div>
    </div>
`;

// Progress bar függvények
const progressBarFunctions = `
        function showUploadProgress() {
            const overlay = document.getElementById('uploadProgressOverlay');
            overlay.style.display = 'flex';
        }

        function hideUploadProgress() {
            const overlay = document.getElementById('uploadProgressOverlay');
            overlay.style.display = 'none';
        }

        function updateUploadProgress(percent, status) {
            const bar = document.getElementById('uploadProgressBar');
            const text = document.getElementById('uploadProgressText');
            const statusDiv = document.getElementById('uploadProgressStatus');

            bar.style.width = percent + '%';
            text.textContent = Math.round(percent) + '%';
            if (status) {
                statusDiv.textContent = status;
            }

            console.log(\`📊 Progress: \${Math.round(percent)}% - \${status}\`);
        }
`;

for (const cat of categories) {
    console.log(`\n📝 Feldolgozás: ${cat.title} (${cat.file})...`);

    try {
        let content = fs.readFileSync(cat.file, 'utf8');

        // 1. Progress bar HTML hozzáadása (ha még nincs meg)
        if (!content.includes('uploadProgressOverlay')) {
            console.log('  ➕ Progress bar HTML hozzáadása...');
            // Keresem meg a </div> before </body> -t
            const bodyEndIndex = content.lastIndexOf('</body>');
            if (bodyEndIndex !== -1) {
                content = content.substring(0, bodyEndIndex) + progressBarHTML + '\n' + content.substring(bodyEndIndex);
            } else {
                console.warn('  ⚠️ Nem találom a </body> taget');
            }
        } else {
            console.log('  ✓ Progress bar HTML már létezik');
        }

        // 2. Progress bar függvények hozzáadása (ha még nincsenek meg)
        if (!content.includes('function showUploadProgress')) {
            console.log('  ➕ Progress bar függvények hozzáadása...');
            // Keresem a <script> tag után lévő részt
            const scriptMatch = content.match(/<script>[\s\S]*?\/\/ JavaScript/);
            if (scriptMatch) {
                const insertPos = scriptMatch.index + scriptMatch[0].length;
                content = content.substring(0, insertPos) + '\n' + progressBarFunctions + '\n' + content.substring(insertPos);
            } else {
                console.warn('  ⚠️ Nem találom a megfelelő <script> részt');
            }
        } else {
            console.log('  ✓ Progress bar függvények már léteznek');
        }

        // Fájl mentése
        fs.writeFileSync(cat.file, content);
        console.log(`  ✅ Mentve: ${cat.file}`);

    } catch (error) {
        console.error(`  ❌ Hiba ${cat.file} feldolgozása során:`, error.message);
    }
}

console.log('\n✅ Progress bar HTML és függvények hozzáadva minden kategóriához!');
console.log('\n⚠️ FIGYELEM: Az exportToPDF függvényt még manuálisan kell javítani!');
console.log('A exportToPDF függvénynek használnia kell:');
console.log('- showUploadProgress()');
console.log('- updateUploadProgress(percent, message)');
console.log('- hideUploadProgress()');
console.log('- pdfMake.createPdf(docDefinition).getBase64(async function(pdfBase64) {...})');
console.log('- fetch() hívás a backend felé PDF és képek feltöltésére');
