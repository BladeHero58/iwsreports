const fs = require('fs');

console.log('🔧 Progress bar függvények helyes hozzáadása minden kategóriához...\n');

const categories = [
    'views/mvm-work-environment.ejs',
    'views/mvm-personal-conditions.ejs',
    'views/mvm-machinery.ejs',
    'views/mvm-personal-protective-equipment.ejs',
    'views/mvm-first-aid.ejs',
    'views/mvm-hazardous-materials.ejs',
    'views/mvm-omissions.ejs',
    'views/mvm-other.ejs'
];

const progressFunctions = `        // ========================================
        // PROGRESS BAR FÜGGVÉNYEK
        // ========================================
        function showUploadProgress() {
            const overlay = document.getElementById('uploadProgressOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
            }
        }

        function hideUploadProgress() {
            const overlay = document.getElementById('uploadProgressOverlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        }

        function updateUploadProgress(percent, status) {
            const bar = document.getElementById('uploadProgressBar');
            const text = document.getElementById('uploadProgressText');
            const statusDiv = document.getElementById('uploadProgressStatus');

            if (bar) bar.style.width = percent + '%';
            if (text) text.textContent = Math.round(percent) + '%';
            if (status && statusDiv) {
                statusDiv.textContent = status;
            }

            console.log(\`📊 Progress: \${Math.round(percent)}% - \${status}\`);
        }

        // ========================================
        // GLOBÁLIS VÁLTOZÓK
        // ========================================
`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Ellenőrizzük hogy már léteznek-e a függvények
        if (content.includes('function showUploadProgress()')) {
            console.log('  ✓ Progress bar függvények már léteznek');
            continue;
        }

        // Keressük meg a <script> taget és a const uploadedImages sort
        const scriptPattern = /<script>\s*(const uploadedImages = \{\};)/;
        const match = content.match(scriptPattern);

        if (match) {
            console.log('  ➕ Progress bar függvények beszúrása...');

            // Cseréljük le
            content = content.replace(
                scriptPattern,
                `<script>\n${progressFunctions}        const uploadedImages = {};`
            );

            // Mentés
            fs.writeFileSync(file, content);
            console.log('  ✅ Sikeres beszúrás');
        } else {
            console.warn('  ⚠️ Nem találom a megfelelő helyet a beszúráshoz');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Progress bar függvények helyesen hozzáadva!');
