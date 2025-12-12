const fs = require('fs');

// Category 9 data - Elmaradt cselekedetek
const category9Items = [
    { id: '9.1', title: 'Előző ellenőrzéseken feltárt hiányosságok pótlása', description: 'Korábbi észrevételek kezelése' },
    { id: '9.2', title: 'Előírt intézkedések, korrekciós lépések végrehajtása', description: 'Intézkedési tervek teljesítése' }
];

const category9Sanctions = {
    '8': '100000',
    '12': '50000',
    '14': '100000',
    '15': '100000',
    '18': '50000',
    '19': '20000',
    '20': '100000',
    '22': '100000',
    '24': '100000',
    '25': '50000',
    '28': '25000',
    '30': '50000',
    '31a': '50000',
    '31b': '100000',
    '32': '50000',
    '39': '100000'
};

const sanctionLabels = {
    '8': '8. Hatósági-, felügyeleti-, tulajdonosi előírások be nem tartása',
    '12': '12. Munkaterület rendezetlensége',
    '14': '14. Súlyos szabálytalanság ismételt előfordulása',
    '15': '15. Munkavédelmi előírások súlyos megsértése',
    '18': '18. Rendeltetésellenes használat',
    '19': '19. Környezetvédelmi előírások megsértése',
    '20': '20. Életvédelmi rendszerek megkerülése',
    '22': '22. Kötelező oktatások, vizsgák elmulasztása',
    '24': '24. Dokumentációk hiánya vagy nem megfelelősége',
    '25': '25. Munkavégzési engedélyek hiánya',
    '28': '28. Felszólítás után sem teljesített hiányosságok',
    '30': '30. Kockázatértékelés hiánya vagy nem megfelelősége',
    '31a': '31a. Munkabiztonsági dokumentációk hiányossága',
    '31b': '31b. Biztonsági adatlap hiánya',
    '32': '32. Jegyzőkönyvek, nyilvántartások hiánya',
    '39': '39. Ismételt súlyos megszegés'
};

// Read the template (working Category 4)
let content = fs.readFileSync('views/mvm-machinery.ejs', 'utf8');

// Step 1: Replace all category identifiers
console.log('Step 1: Replacing category identifiers...');
content = content.replace(/4\. Kategória: Munkagépek, munkaeszközök/g, '9. Kategória: Elmaradt cselekedetek');
content = content.replace(/\/machinery/g, '/omissions');
content = content.replace(/category_id: 4/g, 'category_id: 9');

// Step 2: Replace all item references (4_1 through 4_8 -> 9_1 through 9_2)
console.log('Step 2: Replacing item references...');
for (let i = 1; i <= 8; i++) {
    const newIndex = i <= 2 ? i : 2;

    content = content.replace(new RegExp(`item_4_${i}`, 'g'), `item_9_${newIndex}`);
    content = content.replace(new RegExp(`notes_4_${i}`, 'g'), `notes_9_${newIndex}`);
    content = content.replace(new RegExp(`photos_4_${i}`, 'g'), `photos_9_${newIndex}`);
    content = content.replace(new RegExp(`preview_4_${i}`, 'g'), `preview_9_${newIndex}`);
    content = content.replace(new RegExp(`severity_4_${i}`, 'g'), `severity_9_${newIndex}`);
    content = content.replace(new RegExp(`'4_${i}'`, 'g'), `'9_${newIndex}'`);
    content = content.replace(new RegExp(`"4_${i}"`, 'g'), `"9_${newIndex}"`);
}

// Step 3: Generate HTML for 2 checklist items
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
                        <input type="radio" id="item_9_${numId}_m" name="item_9_${numId}" value="megfelelő" onchange="toggleSeverity('9_${numId}')">
                        <label for="item_9_${numId}_m">Megfelelt</label>
                    </div>
                    <div class="radio-option danger">
                        <input type="radio" id="item_9_${numId}_nm" name="item_9_${numId}" value="nem_megfelelő" onchange="toggleSeverity('9_${numId}')">
                        <label for="item_9_${numId}_nm">Nem megfelelt</label>
                    </div>
                    <div class="radio-option info">
                        <input type="radio" id="item_9_${numId}_ft" name="item_9_${numId}" value="felszólítás_után" onchange="toggleSeverity('9_${numId}')">
                        <label for="item_9_${numId}_ft">Felszólítás után teljesítve</label>
                    </div>
                    <div class="radio-option warning">
                        <input type="radio" id="item_9_${numId}_nv" name="item_9_${numId}" value="nem_vizsgált" onchange="toggleSeverity('9_${numId}')">
                        <label for="item_9_${numId}_nv">Nem vonatkozik / Nem vizsgált</label>
                    </div>
                </div>

                <div id="severity_9_${numId}" class="severity-selector" style="display: none; margin-top: 15px; padding: 15px; background-color: #f7fafc; border-radius: 8px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">Hiba súlyossága:</label>
                    <div class="radio-options">
                        <div class="radio-option" style="border-color: #FFFF00;">
                            <input type="radio" id="item_9_${numId}_sev_low" name="item_9_${numId}_severity" value="alacsony">
                            <label for="item_9_${numId}_sev_low" style="color: #000000;">🟡Alacsony</label>
                        </div>
                        <div class="radio-option" style="border-color: #ED7D31;">
                            <input type="radio" id="item_9_${numId}_sev_medium" name="item_9_${numId}_severity" value="közepes">
                            <label for="item_9_${numId}_sev_medium" style="color: #000000;">🟠Közepes</label>
                        </div>
                        <div class="radio-option" style="border-color: #FF0000;">
                            <input type="radio" id="item_9_${numId}_sev_high" name="item_9_${numId}_severity" value="magas">
                            <label for="item_9_${numId}_sev_high" style="color: #000000;">🔴Magas</label>
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
        id="photos_9_${numId}"
        multiple
        onchange="handleImageUpload(event, '9_${numId}')"
        style="display: none;"
    >

    <!-- Szép gomb -->
    <button type="button" class="upload-btn" onclick="document.getElementById('photos_9_${numId}').click()">
        <i class="fas fa-upload"></i> Fájlok feltöltése
    </button>

    <div id="preview_9_${numId}" class="image-preview-container"></div>
</div>

                <textarea class="notes-textarea" name="notes_9_${numId}" placeholder="Megjegyzés..."></textarea>
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

// Generate all 2 checklist items HTML
const newChecklistItems = category9Items.map(generateChecklistItem).join('\n');

// Replace the section
content = content.substring(0, checklistStart) +
          newChecklistItems + '\n' +
          content.substring(checklistEnd);

// Update title and header
content = content.replace(/<title>4\. Munkagépek, munkaeszközök/g, '<title>9. Elmaradt cselekedetek');
content = content.replace(/Munkagépek, munkaeszközök kategória vonatkozó pontjai/g, 'Elmaradt cselekedetek kategória vonatkozó pontjai');

// Step 4: Update JavaScript prices objects
console.log('Step 4: Updating JavaScript prices objects...');

// Update calculateTotal() prices object (first occurrence)
const pricesPattern1 = /const prices = \{\s*'1': \d+,\s*'4': \d+,\s*'5': \d+,\s*'6': \d+,\s*'9': \d+,\s*'10': \d+,\s*'11': \d+,\s*'13': \d+,\s*'16': \d+,\s*'17': \d+,\s*'21': \d+,\s*'26': \d+,\s*'27': \d+,\s*'29a': \d+,\s*'29b': \d+,\s*'36': \d+\s*\}/;
const newPricesObject1 = `const prices = {
                    '8': ${category9Sanctions['8']},
                    '12': ${category9Sanctions['12']},
                    '14': ${category9Sanctions['14']},
                    '15': ${category9Sanctions['15']},
                    '18': ${category9Sanctions['18']},
                    '19': ${category9Sanctions['19']},
                    '20': ${category9Sanctions['20']},
                    '22': ${category9Sanctions['22']},
                    '24': ${category9Sanctions['24']},
                    '25': ${category9Sanctions['25']},
                    '28': ${category9Sanctions['28']},
                    '30': ${category9Sanctions['30']},
                    '31a': ${category9Sanctions['31a']},
                    '31b': ${category9Sanctions['31b']},
                    '32': ${category9Sanctions['32']},
                    '39': ${category9Sanctions['39']}
                }`;
content = content.replace(pricesPattern1, newPricesObject1);

// Update calculateTotalFine() prices object
const pricesPattern2 = /function calculateTotalFine\(\) \{\s*const prices = \{[^}]+\};/s;
const newPricesObject2 = `function calculateTotalFine() {
            const prices = {
                sanction_8: ${category9Sanctions['8']},
                sanction_12: ${category9Sanctions['12']},
                sanction_14: ${category9Sanctions['14']},
                sanction_15: ${category9Sanctions['15']},
                sanction_18: ${category9Sanctions['18']},
                sanction_19: ${category9Sanctions['19']},
                sanction_20: ${category9Sanctions['20']},
                sanction_22: ${category9Sanctions['22']},
                sanction_24: ${category9Sanctions['24']},
                sanction_25: ${category9Sanctions['25']},
                sanction_28: ${category9Sanctions['28']},
                sanction_30: ${category9Sanctions['30']},
                sanction_31a: ${category9Sanctions['31a']},
                sanction_31b: ${category9Sanctions['31b']},
                sanction_32: ${category9Sanctions['32']},
                sanction_39: ${category9Sanctions['39']}
            };`;
content = content.replace(pricesPattern2, newPricesObject2);

// Step 5: Update PDF items array
console.log('Step 5: Updating PDF items array...');
const pdfItemsPattern = /const items = \[[^\]]+\]/s;
const newPdfItems = `const items = [
                    { id: '9_1', label: '${category9Items[0].title}' },
                    { id: '9_2', label: '${category9Items[1].title}' }
                ]`;
content = content.replace(pdfItemsPattern, newPdfItems);

// Step 6: Update sanctionLabels and sanctionPricesRaw objects
console.log('Step 6: Updating sanctionLabels and sanctionPricesRaw objects...');
const sanctionLabelsPattern = /const sanctionLabels = \{[^}]+\}/s;
const newSanctionLabels = `const sanctionLabels = {
                    '8': '${sanctionLabels['8']}',
                    '12': '${sanctionLabels['12']}',
                    '14': '${sanctionLabels['14']}',
                    '15': '${sanctionLabels['15']}',
                    '18': '${sanctionLabels['18']}',
                    '19': '${sanctionLabels['19']}',
                    '20': '${sanctionLabels['20']}',
                    '22': '${sanctionLabels['22']}',
                    '24': '${sanctionLabels['24']}',
                    '25': '${sanctionLabels['25']}',
                    '28': '${sanctionLabels['28']}',
                    '30': '${sanctionLabels['30']}',
                    '31a': '${sanctionLabels['31a']}',
                    '31b': '${sanctionLabels['31b']}',
                    '32': '${sanctionLabels['32']}',
                    '39': '${sanctionLabels['39']}'
                }`;
content = content.replace(sanctionLabelsPattern, newSanctionLabels);

const sanctionPricesPattern = /const sanctionPricesRaw = \{[^}]+\}/s;
const newSanctionPrices = `const sanctionPricesRaw = {
                    '8': ${category9Sanctions['8']},
                    '12': ${category9Sanctions['12']},
                    '14': ${category9Sanctions['14']},
                    '15': ${category9Sanctions['15']},
                    '18': ${category9Sanctions['18']},
                    '19': ${category9Sanctions['19']},
                    '20': ${category9Sanctions['20']},
                    '22': ${category9Sanctions['22']},
                    '24': ${category9Sanctions['24']},
                    '25': ${category9Sanctions['25']},
                    '28': ${category9Sanctions['28']},
                    '30': ${category9Sanctions['30']},
                    '31a': ${category9Sanctions['31a']},
                    '31b': ${category9Sanctions['31b']},
                    '32': ${category9Sanctions['32']},
                    '39': ${category9Sanctions['39']}
                }`;
content = content.replace(sanctionPricesPattern, newSanctionPrices);

// Write the fixed file
console.log('Writing fixed file...');
fs.writeFileSync('views/mvm-omissions.ejs', content);

console.log('✅ Category 9 (mvm-omissions.ejs) has been completely fixed!');
