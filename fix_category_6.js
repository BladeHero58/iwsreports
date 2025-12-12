const fs = require('fs');

// Category 6 data - Egyéni védőeszközök
const category6Items = [
    { id: '6.1', title: 'Munkavállalók felszerelése, egyéni védőeszközök, védőruházat, védőlábbeli megfelelősége', description: 'Megfelelő védőfelszerelések biztosítása' },
    { id: '6.2', title: 'Munkaterület szerinti kötelező védőeszközök, tájékoztató táblák', description: 'Tájékoztatás és jelölések' },
    { id: '6.3', title: 'Védőeszközök használatának ellenőrzése és dokumentáltsága', description: 'Használat ellenőrzése és nyilvántartás' },
    { id: '6.4', title: 'Védősisakok, védőszemüvegek, hallás- és légzésvédők állapota', description: 'Védőfelszerelések műszaki állapota' },
    { id: '6.5', title: 'Munkaterület-specifikus védőeszközök (pl. magasban végzett munkához)', description: 'Speciális munkavédelmi eszközök' }
];

const category6Sanctions = {
    '1': '100000',
    '2': '50000',
    '6': '50000',
    '7': '50000',
    '23': '50000'
};

const sanctionLabels = {
    '1': '1. Felelős személy hiánya',
    '2': '2. Egyéni védőeszköz használatának elmulasztása',
    '6': '6. Megfelelő tájékoztatás, oktatás és dokumentáció hiánya',
    '7': '7. Védőeszköz, védőruházat hiánya',
    '23': '23. Kötelező jelzések, táblák hiánya'
};

// Read the template (working Category 4)
let content = fs.readFileSync('views/mvm-machinery.ejs', 'utf8');

// Step 1: Replace all category identifiers
console.log('Step 1: Replacing category identifiers...');
content = content.replace(/4\. Kategória: Munkagépek, munkaeszközök/g, '6. Kategória: Egyéni védőeszközök');
content = content.replace(/\/machinery/g, '/personal-protective-equipment');
content = content.replace(/category_id: 4/g, 'category_id: 6');

// Step 2: Replace all item references (4_1 through 4_8 -> 6_1 through 6_5)
console.log('Step 2: Replacing item references...');
for (let i = 1; i <= 8; i++) {
    const newIndex = i <= 5 ? i : 5;

    content = content.replace(new RegExp(`item_4_${i}`, 'g'), `item_6_${newIndex}`);
    content = content.replace(new RegExp(`notes_4_${i}`, 'g'), `notes_6_${newIndex}`);
    content = content.replace(new RegExp(`photos_4_${i}`, 'g'), `photos_6_${newIndex}`);
    content = content.replace(new RegExp(`preview_4_${i}`, 'g'), `preview_6_${newIndex}`);
    content = content.replace(new RegExp(`severity_4_${i}`, 'g'), `severity_6_${newIndex}`);
    content = content.replace(new RegExp(`'4_${i}'`, 'g'), `'6_${newIndex}'`);
    content = content.replace(new RegExp(`"4_${i}"`, 'g'), `"6_${newIndex}"`);
}

// Step 3: Generate HTML for 5 checklist items
console.log('Step 3: Generating HTML for checklist items...');
const generateChecklistItem = (item) => {
    const numId = item.id.split('.')[1];
    return `
            <!-- ${item.id} -->
            <div class="checklist-item">
                <div class="checklist-header">${item.id} ${item.title}</div>
                <div class="checklist-description">${item.description}</div>

                <div class="radio-options">
                    <div class="radio-option success">
                        <input type="radio" id="item_6_${numId}_m" name="item_6_${numId}" value="megfelelő" onchange="toggleSeverity('6_${numId}')">
                        <label for="item_6_${numId}_m">Megfelelt</label>
                    </div>
                    <div class="radio-option danger">
                        <input type="radio" id="item_6_${numId}_nm" name="item_6_${numId}" value="nem_megfelelő" onchange="toggleSeverity('6_${numId}')">
                        <label for="item_6_${numId}_nm">Nem megfelelt</label>
                    </div>
                    <div class="radio-option info">
                        <input type="radio" id="item_6_${numId}_ft" name="item_6_${numId}" value="felszólítás_után" onchange="toggleSeverity('6_${numId}')">
                        <label for="item_6_${numId}_ft">Felszólítás után teljesítve</label>
                    </div>
                    <div class="radio-option warning">
                        <input type="radio" id="item_6_${numId}_nv" name="item_6_${numId}" value="nem_vizsgált" onchange="toggleSeverity('6_${numId}')">
                        <label for="item_6_${numId}_nv">Nem vonatkozik / Nem vizsgált</label>
                    </div>
                </div>

                <div id="severity_6_${numId}" class="severity-selector" style="display: none; margin-top: 15px; padding: 15px; background-color: #f7fafc; border-radius: 8px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">Hiba súlyossága:</label>
                    <div class="radio-options">
                        <div class="radio-option" style="border-color: #FFFF00;">
                            <input type="radio" id="item_6_${numId}_sev_low" name="item_6_${numId}_severity" value="alacsony">
                            <label for="item_6_${numId}_sev_low" style="color: #000000;">🟡Alacsony</label>
                        </div>
                        <div class="radio-option" style="border-color: #ED7D31;">
                            <input type="radio" id="item_6_${numId}_sev_medium" name="item_6_${numId}_severity" value="közepes">
                            <label for="item_6_${numId}_sev_medium" style="color: #000000;">🟠Közepes</label>
                        </div>
                        <div class="radio-option" style="border-color: #FF0000;">
                            <input type="radio" id="item_6_${numId}_sev_high" name="item_6_${numId}_severity" value="magas">
                            <label for="item_6_${numId}_sev_high" style="color: #000000;">🔴Magas</label>
                        </div>
                    </div>
                </div>

              <div class="form-group" style="margin-top: 15px;">
    <label><i class="fas fa-camera"></i> Fényképek / dokumentáció</label>
    <p style="font-size: 11px; color: #4CAF50; margin: 5px 0;">
        <i class="fas fa-check-circle"></i> Minden képformátum támogatott (HEIC is) • Automatikus tömörítés
    </p>

    <!-- Rejtett file input -->
    <input
        type="file"
        id="photos_6_${numId}"
        multiple
        onchange="handleImageUpload(event, '6_${numId}')"
        style="display: none;"
    >

    <!-- Szép gomb -->
    <button type="button" class="upload-btn" onclick="document.getElementById('photos_6_${numId}').click()">
        <i class="fas fa-upload"></i> Fájlok feltöltése
    </button>

    <div id="preview_6_${numId}" class="image-preview-container"></div>
</div>

                <textarea class="notes-textarea" name="notes_6_${numId}" placeholder="Megjegyzés..."></textarea>
            </div>
`;
};

// Find and replace the checklist items section
const checklistStartMarker = '<!-- 4.1 -->';
const checklistEndMarker = '<!-- Szankciós lista -->';

const checklistStart = content.indexOf(checklistStartMarker);
if (checklistStart === -1) {
    console.error('Could not find checklist start marker');
    process.exit(1);
}

const checklistEnd = content.indexOf(checklistEndMarker);
if (checklistEnd === -1) {
    console.error('Could not find checklist end marker');
    process.exit(1);
}

// Generate all 5 checklist items HTML
const newChecklistItems = category6Items.map(generateChecklistItem).join('\n');

// Replace the section
content = content.substring(0, checklistStart) +
          newChecklistItems + '\n' +
          content.substring(checklistEnd);

// Update title and header
content = content.replace(/<title>4\. Munkagépek, munkaeszközök/g, '<title>6. Egyéni védőeszközök');
content = content.replace(/Munkagépek, munkaeszközök kategória vonatkozó pontjai/g, 'Egyéni védőeszközök kategória vonatkozó pontjai');

// Step 4: Update JavaScript prices objects
console.log('Step 4: Updating JavaScript prices objects...');

// Update calculateTotal() prices object (first occurrence)
const pricesPattern1 = /const prices = \{\s*'1': \d+,\s*'4': \d+,\s*'5': \d+,\s*'6': \d+,\s*'9': \d+,\s*'10': \d+,\s*'11': \d+,\s*'13': \d+,\s*'16': \d+,\s*'17': \d+,\s*'21': \d+,\s*'26': \d+,\s*'27': \d+,\s*'29a': \d+,\s*'29b': \d+,\s*'36': \d+\s*\}/;
const newPricesObject1 = `const prices = {
                    '1': ${category6Sanctions['1']},
                    '2': ${category6Sanctions['2']},
                    '6': ${category6Sanctions['6']},
                    '7': ${category6Sanctions['7']},
                    '23': ${category6Sanctions['23']}
                }`;
content = content.replace(pricesPattern1, newPricesObject1);

// Update calculateTotalFine() prices object
const pricesPattern2 = /function calculateTotalFine\(\) \{\s*const prices = \{[^}]+\};/s;
const newPricesObject2 = `function calculateTotalFine() {
            const prices = {
                sanction_1: ${category6Sanctions['1']},
                sanction_2: ${category6Sanctions['2']},
                sanction_6: ${category6Sanctions['6']},
                sanction_7: ${category6Sanctions['7']},
                sanction_23: ${category6Sanctions['23']}
            };`;
content = content.replace(pricesPattern2, newPricesObject2);

// Step 5: Update PDF items array
console.log('Step 5: Updating PDF items array...');
const pdfItemsPattern = /const items = \[[^\]]+\]/s;
const newPdfItems = `const items = [
                    { id: '6_1', label: '${category6Items[0].title}' },
                    { id: '6_2', label: '${category6Items[1].title}' },
                    { id: '6_3', label: '${category6Items[2].title}' },
                    { id: '6_4', label: '${category6Items[3].title}' },
                    { id: '6_5', label: '${category6Items[4].title}' }
                ]`;
content = content.replace(pdfItemsPattern, newPdfItems);

// Step 6: Update sanctionLabels and sanctionPricesRaw objects
console.log('Step 6: Updating sanctionLabels and sanctionPricesRaw objects...');
const sanctionLabelsPattern = /const sanctionLabels = \{[^}]+\}/s;
const newSanctionLabels = `const sanctionLabels = {
                    '1': '${sanctionLabels['1']}',
                    '2': '${sanctionLabels['2']}',
                    '6': '${sanctionLabels['6']}',
                    '7': '${sanctionLabels['7']}',
                    '23': '${sanctionLabels['23']}'
                }`;
content = content.replace(sanctionLabelsPattern, newSanctionLabels);

const sanctionPricesPattern = /const sanctionPricesRaw = \{[^}]+\}/s;
const newSanctionPrices = `const sanctionPricesRaw = {
                    '1': ${category6Sanctions['1']},
                    '2': ${category6Sanctions['2']},
                    '6': ${category6Sanctions['6']},
                    '7': ${category6Sanctions['7']},
                    '23': ${category6Sanctions['23']}
                }`;
content = content.replace(sanctionPricesPattern, newSanctionPrices);

// Write the fixed file
console.log('Writing fixed file...');
fs.writeFileSync('views/mvm-personal-protective-equipment.ejs', content);

console.log('✅ Category 6 (mvm-personal-protective-equipment.ejs) has been completely fixed!');
