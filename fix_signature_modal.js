const fs = require('fs');

console.log('🔧 Aláírás modal egységesítése (documentation.ejs mintájára)...\n');

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

// Az új modal HTML (documentation.ejs-ből)
const newModalHTML = `    <div id="signatureModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2><i class="fas fa-signature"></i> Aláírás hozzáadása</h2>
                <button class="close-modal" onclick="closeSignatureModal()">&times;</button>
            </div>
            <canvas id="signatureCanvas" width="540" height="300"></canvas>
            <div class="canvas-controls">
                <button class="btn-clear" onclick="clearCanvas()">
                    <i class="fas fa-trash"></i> Törlés
                </button>
                <button class="btn-save" onclick="saveSignature()">
                    <i class="fas fa-save"></i> Mentés
                </button>
            </div>
        </div>
    </div>`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Keressük meg a régi signatureModal-t
        // Pattern: <div id="signatureModal" class="modal"> ... </div> (a modal vége)

        // Először találjuk meg a modal kezdetét
        const modalStartPattern = /<div id="signatureModal" class="modal">/;
        const modalStartMatch = content.match(modalStartPattern);

        if (!modalStartMatch) {
            console.warn('  ⚠️ Nem találom a signatureModal-t');
            continue;
        }

        console.log('  ✓ signatureModal megtalálva');

        // Keressük meg a teljes modal blokkot
        // Stratégia: keressük meg a signatureModal kezdetét, majd az első </div> ami utána következik
        // és ami a <script> tag előtt van

        const modalStartIndex = content.indexOf('<div id="signatureModal" class="modal">');
        const scriptStartIndex = content.indexOf('<script>', modalStartIndex);

        if (modalStartIndex === -1 || scriptStartIndex === -1) {
            console.warn('  ⚠️ Nem találom a modal határait');
            continue;
        }

        // Keressük meg az utolsó </div> a modal és a script között
        let modalEndIndex = -1;
        let tempIndex = scriptStartIndex;

        // Visszafelé keresünk </div>-et
        while (tempIndex > modalStartIndex) {
            const lastDivClose = content.lastIndexOf('</div>', tempIndex);
            if (lastDivClose > modalStartIndex) {
                modalEndIndex = lastDivClose + 6; // 6 = '</div>'.length
                break;
            }
            tempIndex = lastDivClose - 1;
        }

        if (modalEndIndex === -1) {
            console.warn('  ⚠️ Nem találom a modal végét');
            continue;
        }

        const oldModal = content.substring(modalStartIndex, modalEndIndex);

        console.log(`  ✓ Modal hossza: ${oldModal.length} karakter`);

        // Cseréljük le a régi modal-t az újra
        content = content.substring(0, modalStartIndex) +
                 newModalHTML + '\n\n' +
                 content.substring(modalEndIndex);

        console.log('  ✅ Modal lecserélve');

        // Mentés
        fs.writeFileSync(file, content);
        console.log('  ✅ Fájl mentve');

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Aláírás modal egységesítve minden kategóriában!');
console.log('   Most már ugyanolyan egyszerű modal van mindenhol, mint a documentation.ejs-ben.');
console.log('\n⚠️ FONTOS: Ellenőrizd hogy a tab-os funkciókat használó kódok (switchTab, handleSignatureUpload) törölve lettek-e!');
console.log('   Ha még vannak ilyen függvények, azokat manuálisan kell eltávolítani.');
