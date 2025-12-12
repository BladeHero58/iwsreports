const fs = require('fs');

// Category 7 data - Elsősegélynyújtás
const category7Items = [
    { id: '7.1', title: 'Els\u0151seg\u00e9ly felszerel\u00e9sek, dobozok felt\u00f6lt\u00f6tts\u00e9ge, el\u00e9rhet\u0151s\u00e9ge', description: 'Els\u0151seg\u00e9ly dobozok \u00e1llapota \u00e9s tartalom' },
    { id: '7.2', title: 'Els\u0151seg\u00e9lynyújtók kijel\u00f6l\u00e9se, k\u00e9pzetts\u00e9ge, tan\u00fas\u00edtv\u00e1nyok', description: 'K\u00e9pzett els\u0151seg\u00e9lynyújtók jelenl\u00e9te' },
    { id: '7.3', title: 'Els\u0151seg\u00e9ly nyújt\u00e1si pontok jel\u00f6l\u00e9se, t\u00e1bl\u00e1k', description: 'Jelz\u00e9sek \u00e9s inform\u00e1ci\u00f3k' },
    { id: '7.4', title: 'Szemöblít\u0151, vegyszeres sérül\u00e9s elleni felszerel\u00e9sek', description: 'Speci\u00e1lis els\u0151seg\u00e9ly eszközök' },
    { id: '7.5', title: 'Els\u0151seg\u00e9lynyújt\u00e1ssal kapcsolatos dokument\u00e1ci\u00f3k, utas\u00edt\u00e1sok', description: 'Protokollok \u00e9s elj\u00e1r\u00e1srendek' }
];

const category7Sanctions = {
    '1': '100000',
    '3': '50000'
};

const sanctionLabels = {
    '1': '1. Felelős személy hiánya',
    '3': '3. Elsősegélynyújtási felszerelések, eszközök hiánya vagy nem megfelelősége'
};

// Read the template (working Category 4)
let content = fs.readFileSync('views/mvm-machinery.ejs', 'utf8');

// Step 1: Replace all category identifiers
console.log('Step 1: Replacing category identifiers...');
content = content.replace(/4\. Kategória: Munkagépek, munkaeszközök/g, '7. Kategória: Elsősegélynyújtás');
content = content.replace(/\/machinery/g, '/first-aid');
content = content.replace(/category_id: 4/g, 'category_id: 7');

// Step 2: Replace all item references (4_1 through 4_8 -> 7_1 through 7_5)
console.log('Step 2: Replacing item references...');
for (let i = 1; i <= 8; i++) {
    const newIndex = i <= 5 ? i : 5;

    content = content.replace(new RegExp(`item_4_${i}`, 'g'), `item_7_${newIndex}`);
    content = content.replace(new RegExp(`notes_4_${i}`, 'g'), `notes_7_${newIndex}`);
    content = content.replace(new RegExp(`photos_4_${i}`, 'g'), `photos_7_${newIndex}`);
    content = content.replace(new RegExp(`preview_4_${i}`, 'g'), `preview_7_${newIndex}`);
    content = content.replace(new RegExp(`severity_4_${i}`, 'g'), `severity_7_${newIndex}`);
    content = content.replace(new RegExp(`'4_${i}'`, 'g'), `'7_${newIndex}'`);
    content = content.replace(new RegExp(`"4_${i}"`, 'g'), `"7_${newIndex}"`);
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
                        <input type="radio" id="item_7_${numId}_m" name="item_7_${numId}" value="megfelelő" onchange="toggleSeverity('7_${numId}')">
                        <label for="item_7_${numId}_m">Megfelelt</label>
                    </div>
                    <div class="radio-option danger">
                        <input type="radio" id="item_7_${numId}_nm" name="item_7_${numId}" value="nem_megfelelő" onchange="toggleSeverity('7_${numId}')">
                        <label for="item_7_${numId}_nm">Nem megfelelt</label>
                    </div>
                    <div class="radio-option info">
                        <input type="radio" id="item_7_${numId}_ft" name="item_7_${numId}" value="felszólítás_után" onchange="toggleSeverity('7_${numId}')">
                        <label for="item_7_${numId}_ft">Felszólítás után teljesítve</label>
                    </div>
                    <div class="radio-option warning">
                        <input type="radio" id="item_7_${numId}_nv" name="item_7_${numId}" value="nem_vizsgált" onchange="toggleSeverity('7_${numId}')">
                        <label for="item_7_${numId}_nv">Nem vonatkozik / Nem vizsgált</label>
                    </div>
                </div>

                <div id="severity_7_${numId}" class="severity-selector" style="display: none; margin-top: 15px; padding: 15px; background-color: #f7fafc; border-radius: 8px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">Hiba súlyossága:</label>
                    <div class="radio-options">
                        <div class="radio-option" style="border-color: #FFFF00;">
                            <input type="radio" id="item_7_${numId}_sev_low" name="item_7_${numId}_severity" value="alacsony">
                            <label for="item_7_${numId}_sev_low" style="color: #000000;">🟡Alacsony</label>
                        </div>
                        <div class="radio-option" style="border-color: #ED7D31;">
                            <input type="radio" id="item_7_${numId}_sev_medium" name="item_7_${numId}_severity" value="közepes">
                            <label for="item_7_${numId}_sev_medium" style="color: #000000;">🟠Közepes</label>
                        </div>
                        <div class="radio-option" style="border-color: #FF0000;">
                            <input type="radio" id="item_7_${numId}_sev_high" name="item_7_${numId}_severity" value="magas">
                            <label for="item_7_${numId}_sev_high" style="color: #000000;">🔴Magas</label>
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
        id="photos_7_${numId}"
        multiple
        onchange="handleImageUpload(event, '7_${numId}')"
        style="display: none;"
    >

    <!-- Szép gomb -->
    <button type="button" class="upload-btn" onclick="document.getElementById('photos_7_${numId}').click()">
        <i class="fas fa-upload"></i> Fájlok feltöltése
    </button>

    <div id="preview_7_${numId}" class="image-preview-container"></div>
</div>

                <textarea class="notes-textarea" name="notes_7_${numId}" placeholder="Megjegyzés..."></textarea>
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
const newChecklistItems = category7Items.map(generateChecklistItem).join('\n');

// Replace the section
content = content.substring(0, checklistStart) +
          newChecklistItems + '\n' +
          content.substring(checklistEnd);

// Update title and header
content = content.replace(/<title>4\. Munkagépek, munkaeszközök/g, '<title>7. Elsősegélynyújtás');
content = content.replace(/Munkagépek, munkaeszközök kategória vonatkozó pontjai/g, 'Elsősegélynyújtás kategória vonatkozó pontjai');

// Step 4: Update JavaScript prices objects
console.log('Step 4: Updating JavaScript prices objects...');

// Update calculateTotal() prices object (first occurrence)
const pricesPattern1 = /const prices = \{\s*'1': \d+,\s*'4': \d+,\s*'5': \d+,\s*'6': \d+,\s*'9': \d+,\s*'10': \d+,\s*'11': \d+,\s*'13': \d+,\s*'16': \d+,\s*'17': \d+,\s*'21': \d+,\s*'26': \d+,\s*'27': \d+,\s*'29a': \d+,\s*'29b': \d+,\s*'36': \d+\s*\}/;
const newPricesObject1 = `const prices = {
                    '1': ${category7Sanctions['1']},
                    '3': ${category7Sanctions['3']}
                }`;
content = content.replace(pricesPattern1, newPricesObject1);

// Update calculateTotalFine() prices object
const pricesPattern2 = /function calculateTotalFine\(\) \{\s*const prices = \{[^}]+\};/s;
const newPricesObject2 = `function calculateTotalFine() {
            const prices = {
                sanction_1: ${category7Sanctions['1']},
                sanction_3: ${category7Sanctions['3']}
            };`;
content = content.replace(pricesPattern2, newPricesObject2);

// Step 5: Update PDF items array
console.log('Step 5: Updating PDF items array...');
const pdfItemsPattern = /const items = \[[^\]]+\]/s;
const newPdfItems = `const items = [
                    { id: '7_1', label: '${category7Items[0].title}' },
                    { id: '7_2', label: '${category7Items[1].title}' },
                    { id: '7_3', label: '${category7Items[2].title}' },
                    { id: '7_4', label: '${category7Items[3].title}' },
                    { id: '7_5', label: '${category7Items[4].title}' }
                ]`;
content = content.replace(pdfItemsPattern, newPdfItems);

// Step 6: Update sanctionLabels and sanctionPricesRaw objects
console.log('Step 6: Updating sanctionLabels and sanctionPricesRaw objects...');
const sanctionLabelsPattern = /const sanctionLabels = \{[^}]+\}/s;
const newSanctionLabels = `const sanctionLabels = {
                    '1': '${sanctionLabels['1']}',
                    '3': '${sanctionLabels['3']}'
                }`;
content = content.replace(sanctionLabelsPattern, newSanctionLabels);

const sanctionPricesPattern = /const sanctionPricesRaw = \{[^}]+\}/s;
const newSanctionPrices = `const sanctionPricesRaw = {
                    '1': ${category7Sanctions['1']},
                    '3': ${category7Sanctions['3']}
                }`;
content = content.replace(sanctionPricesPattern, newSanctionPrices);

// Write the fixed file
console.log('Writing fixed file...');
fs.writeFileSync('views/mvm-first-aid.ejs', content);

console.log('✅ Category 7 (mvm-first-aid.ejs) has been completely fixed!');
