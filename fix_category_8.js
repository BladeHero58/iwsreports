const fs = require('fs');

// Category 8 data - Veszélyes anyagok
const category8Items = [
    { id: '8.1', title: 'Veszélyes anyagok tárolása, jelölése, biztonsági adatlapok', description: 'Megfelelő tárolás és dokumentáció' },
    { id: '8.2', title: 'Vegyszeres munka dokumentáltsága, engedélyei', description: 'Munkavégzési engedélyek' },
    { id: '8.3', title: 'Veszélyes hulladékok kezelése, gyűjtése, dokumentálása', description: 'Hulladékkezelés előírásai' },
    { id: '8.4', title: 'Tűzvédelmi előírások betartása veszélyes anyagok esetén', description: 'Tűzvédelmi követelmények' }
];

const category8Sanctions = {
    '1': '100000',
    '17': '10000',
    '29b': '50000',
    '31b': '100000',
    '33': '50000',
    '36': '20000'
};

const sanctionLabels = {
    '1': '1. Felelős személy hiánya',
    '17': '17. Veszélyes anyagok nem megfelelő tárolása',
    '29b': '29b. Hulladékkezelés szabálytalanságai',
    '31b': '31b. Biztonsági adatlap hiánya',
    '33': '33. Vegyszeres munka engedélyének hiánya',
    '36': '36. Tűzvédelmi előírások megsértése'
};

// Read the template (working Category 4)
let content = fs.readFileSync('views/mvm-machinery.ejs', 'utf8');

// Step 1: Replace all category identifiers
console.log('Step 1: Replacing category identifiers...');
content = content.replace(/4\. Kategória: Munkagépek, munkaeszközök/g, '8. Kategória: Veszélyes anyagok');
content = content.replace(/\/machinery/g, '/hazardous-materials');
content = content.replace(/category_id: 4/g, 'category_id: 8');

// Step 2: Replace all item references (4_1 through 4_8 -> 8_1 through 8_4)
console.log('Step 2: Replacing item references...');
for (let i = 1; i <= 8; i++) {
    const newIndex = i <= 4 ? i : 4;

    content = content.replace(new RegExp(`item_4_${i}`, 'g'), `item_8_${newIndex}`);
    content = content.replace(new RegExp(`notes_4_${i}`, 'g'), `notes_8_${newIndex}`);
    content = content.replace(new RegExp(`photos_4_${i}`, 'g'), `photos_8_${newIndex}`);
    content = content.replace(new RegExp(`preview_4_${i}`, 'g'), `preview_8_${newIndex}`);
    content = content.replace(new RegExp(`severity_4_${i}`, 'g'), `severity_8_${newIndex}`);
    content = content.replace(new RegExp(`'4_${i}'`, 'g'), `'8_${newIndex}'`);
    content = content.replace(new RegExp(`"4_${i}"`, 'g'), `"8_${newIndex}"`);
}

// Step 3: Generate HTML for 4 checklist items
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
                        <input type="radio" id="item_8_${numId}_m" name="item_8_${numId}" value="megfelelő" onchange="toggleSeverity('8_${numId}')">
                        <label for="item_8_${numId}_m">Megfelelt</label>
                    </div>
                    <div class="radio-option danger">
                        <input type="radio" id="item_8_${numId}_nm" name="item_8_${numId}" value="nem_megfelelő" onchange="toggleSeverity('8_${numId}')">
                        <label for="item_8_${numId}_nm">Nem megfelelt</label>
                    </div>
                    <div class="radio-option info">
                        <input type="radio" id="item_8_${numId}_ft" name="item_8_${numId}" value="felszólítás_után" onchange="toggleSeverity('8_${numId}')">
                        <label for="item_8_${numId}_ft">Felszólítás után teljesítve</label>
                    </div>
                    <div class="radio-option warning">
                        <input type="radio" id="item_8_${numId}_nv" name="item_8_${numId}" value="nem_vizsgált" onchange="toggleSeverity('8_${numId}')">
                        <label for="item_8_${numId}_nv">Nem vonatkozik / Nem vizsgált</label>
                    </div>
                </div>

                <div id="severity_8_${numId}" class="severity-selector" style="display: none; margin-top: 15px; padding: 15px; background-color: #f7fafc; border-radius: 8px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">Hiba súlyossága:</label>
                    <div class="radio-options">
                        <div class="radio-option" style="border-color: #FFFF00;">
                            <input type="radio" id="item_8_${numId}_sev_low" name="item_8_${numId}_severity" value="alacsony">
                            <label for="item_8_${numId}_sev_low" style="color: #000000;">🟡Alacsony</label>
                        </div>
                        <div class="radio-option" style="border-color: #ED7D31;">
                            <input type="radio" id="item_8_${numId}_sev_medium" name="item_8_${numId}_severity" value="közepes">
                            <label for="item_8_${numId}_sev_medium" style="color: #000000;">🟠Közepes</label>
                        </div>
                        <div class="radio-option" style="border-color: #FF0000;">
                            <input type="radio" id="item_8_${numId}_sev_high" name="item_8_${numId}_severity" value="magas">
                            <label for="item_8_${numId}_sev_high" style="color: #000000;">🔴Magas</label>
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
        id="photos_8_${numId}"
        multiple
        onchange="handleImageUpload(event, '8_${numId}')"
        style="display: none;"
    >

    <!-- Szép gomb -->
    <button type="button" class="upload-btn" onclick="document.getElementById('photos_8_${numId}').click()">
        <i class="fas fa-upload"></i> Fájlok feltöltése
    </button>

    <div id="preview_8_${numId}" class="image-preview-container"></div>
</div>

                <textarea class="notes-textarea" name="notes_8_${numId}" placeholder="Megjegyzés..."></textarea>
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

// Generate all 4 checklist items HTML
const newChecklistItems = category8Items.map(generateChecklistItem).join('\n');

// Replace the section
content = content.substring(0, checklistStart) +
          newChecklistItems + '\n' +
          content.substring(checklistEnd);

// Update title and header
content = content.replace(/<title>4\. Munkagépek, munkaeszközök/g, '<title>8. Veszélyes anyagok');
content = content.replace(/Munkagépek, munkaeszközök kategória vonatkozó pontjai/g, 'Veszélyes anyagok kategória vonatkozó pontjai');

// Step 4: Update JavaScript prices objects
console.log('Step 4: Updating JavaScript prices objects...');

// Update calculateTotal() prices object (first occurrence)
const pricesPattern1 = /const prices = \{\s*'1': \d+,\s*'4': \d+,\s*'5': \d+,\s*'6': \d+,\s*'9': \d+,\s*'10': \d+,\s*'11': \d+,\s*'13': \d+,\s*'16': \d+,\s*'17': \d+,\s*'21': \d+,\s*'26': \d+,\s*'27': \d+,\s*'29a': \d+,\s*'29b': \d+,\s*'36': \d+\s*\}/;
const newPricesObject1 = `const prices = {
                    '1': ${category8Sanctions['1']},
                    '17': ${category8Sanctions['17']},
                    '29b': ${category8Sanctions['29b']},
                    '31b': ${category8Sanctions['31b']},
                    '33': ${category8Sanctions['33']},
                    '36': ${category8Sanctions['36']}
                }`;
content = content.replace(pricesPattern1, newPricesObject1);

// Update calculateTotalFine() prices object
const pricesPattern2 = /function calculateTotalFine\(\) \{\s*const prices = \{[^}]+\};/s;
const newPricesObject2 = `function calculateTotalFine() {
            const prices = {
                sanction_1: ${category8Sanctions['1']},
                sanction_17: ${category8Sanctions['17']},
                sanction_29b: ${category8Sanctions['29b']},
                sanction_31b: ${category8Sanctions['31b']},
                sanction_33: ${category8Sanctions['33']},
                sanction_36: ${category8Sanctions['36']}
            };`;
content = content.replace(pricesPattern2, newPricesObject2);

// Step 5: Update PDF items array
console.log('Step 5: Updating PDF items array...');
const pdfItemsPattern = /const items = \[[^\]]+\]/s;
const newPdfItems = `const items = [
                    { id: '8_1', label: '${category8Items[0].title}' },
                    { id: '8_2', label: '${category8Items[1].title}' },
                    { id: '8_3', label: '${category8Items[2].title}' },
                    { id: '8_4', label: '${category8Items[3].title}' }
                ]`;
content = content.replace(pdfItemsPattern, newPdfItems);

// Step 6: Update sanctionLabels and sanctionPricesRaw objects
console.log('Step 6: Updating sanctionLabels and sanctionPricesRaw objects...');
const sanctionLabelsPattern = /const sanctionLabels = \{[^}]+\}/s;
const newSanctionLabels = `const sanctionLabels = {
                    '1': '${sanctionLabels['1']}',
                    '17': '${sanctionLabels['17']}',
                    '29b': '${sanctionLabels['29b']}',
                    '31b': '${sanctionLabels['31b']}',
                    '33': '${sanctionLabels['33']}',
                    '36': '${sanctionLabels['36']}'
                }`;
content = content.replace(sanctionLabelsPattern, newSanctionLabels);

const sanctionPricesPattern = /const sanctionPricesRaw = \{[^}]+\}/s;
const newSanctionPrices = `const sanctionPricesRaw = {
                    '1': ${category8Sanctions['1']},
                    '17': ${category8Sanctions['17']},
                    '29b': ${category8Sanctions['29b']},
                    '31b': ${category8Sanctions['31b']},
                    '33': ${category8Sanctions['33']},
                    '36': ${category8Sanctions['36']}
                }`;
content = content.replace(sanctionPricesPattern, newSanctionPrices);

// Write the fixed file
console.log('Writing fixed file...');
fs.writeFileSync('views/mvm-hazardous-materials.ejs', content);

console.log('✅ Category 8 (mvm-hazardous-materials.ejs) has been completely fixed!');
