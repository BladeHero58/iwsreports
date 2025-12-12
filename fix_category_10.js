const fs = require('fs');

// Category 10 data - Egyéb
const category10Items = [
    { id: '10.1', title: 'Munkaterület általános rendezettsége', description: 'Rend és tisztaság a munkaterületen' },
    { id: '10.2', title: 'Közlekedési utak, menekülési útvonalak szabadonsága', description: 'Átjárhatóság és biztonság' },
    { id: '10.3', title: 'Tárolás szabályszerűsége, anyagkezelés', description: 'Megfelelő tárolási gyakorlat' },
    { id: '10.4', title: 'Tűzvédelmi eszközök elérhetősége, állapota', description: 'Tűzoltó készülékek és berendezések' },
    { id: '10.5', title: 'Kommunikációs eszközök, riasztási rendszerek működése', description: 'Értesítési és riasztási lehetőségek' },
    { id: '10.6', title: 'Biztonsági jelzések, táblák láthatósága', description: 'Jelölések és figyelmeztető táblák' },
    { id: '10.7', title: 'Adminisztratív dokumentációk megléte, naprakészsége', description: 'Kötelező nyilvántartások és engedélyek' },
    { id: '10.8', title: 'Egyéb munkavédelmi, környezetvédelmi és minőségügyi előírások', description: 'További szabványok és követelmények' }
];

const category10Sanctions = {
    '34': '50000',
    '35': '30000',
    '37': '100000',
    '38': 'Kitiltás',
    '40': '200000',
    '41': '150000',
    '42': '100000',
    '43': '75000',
    '44': '50000',
    '45': '30000',
    '46': '20000',
    '47': 'Kitiltás',
    '48': '500000'
};

const sanctionLabels = {
    '34': '34. Közlekedési utak lezárása',
    '35': '35. Nem megfelelő tárolás',
    '37': '37. Tűzvédelmi eszközök hiánya',
    '38': '38. Súlyos szabálytalanság (kitiltás)',
    '40': '40. Életvédelmi rendszer kiiktatása',
    '41': '41. Veszélyhelyzet kezelésének elmulasztása',
    '42': '42. Engedély nélküli tevékenység',
    '43': '43. Dokumentáció súlyos hiányossága',
    '44': '44. Munkaterület súlyos rendezetlensége',
    '45': '45. Jelölések hiánya',
    '46': '46. Kommunikációs eszközök hiánya',
    '47': '47. Ismételt súlyos veszélyeztetés (kitiltás)',
    '48': '48. Rendkívül súlyos szabálytalanság'
};

// Read the template (working Category 4)
let content = fs.readFileSync('views/mvm-machinery.ejs', 'utf8');

// Step 1: Replace all category identifiers
console.log('Step 1: Replacing category identifiers...');
content = content.replace(/4\. Kategória: Munkagépek, munkaeszközök/g, '10. Kategória: Egyéb');
content = content.replace(/\/machinery/g, '/other');
content = content.replace(/category_id: 4/g, 'category_id: 10');

// Step 2: Replace all item references (4_1 through 4_8 -> 10_1 through 10_8)
console.log('Step 2: Replacing item references...');
for (let i = 1; i <= 8; i++) {
    content = content.replace(new RegExp(`item_4_${i}`, 'g'), `item_10_${i}`);
    content = content.replace(new RegExp(`notes_4_${i}`, 'g'), `notes_10_${i}`);
    content = content.replace(new RegExp(`photos_4_${i}`, 'g'), `photos_10_${i}`);
    content = content.replace(new RegExp(`preview_4_${i}`, 'g'), `preview_10_${i}`);
    content = content.replace(new RegExp(`severity_4_${i}`, 'g'), `severity_10_${i}`);
    content = content.replace(new RegExp(`'4_${i}'`, 'g'), `'10_${i}'`);
    content = content.replace(new RegExp(`"4_${i}"`, 'g'), `"10_${i}"`);
}

// Step 3: Generate HTML for 8 checklist items
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
                        <input type="radio" id="item_10_${numId}_m" name="item_10_${numId}" value="megfelelő" onchange="toggleSeverity('10_${numId}')">
                        <label for="item_10_${numId}_m">Megfelelt</label>
                    </div>
                    <div class="radio-option danger">
                        <input type="radio" id="item_10_${numId}_nm" name="item_10_${numId}" value="nem_megfelelő" onchange="toggleSeverity('10_${numId}')">
                        <label for="item_10_${numId}_nm">Nem megfelelt</label>
                    </div>
                    <div class="radio-option info">
                        <input type="radio" id="item_10_${numId}_ft" name="item_10_${numId}" value="felszólítás_után" onchange="toggleSeverity('10_${numId}')">
                        <label for="item_10_${numId}_ft">Felszólítás után teljesítve</label>
                    </div>
                    <div class="radio-option warning">
                        <input type="radio" id="item_10_${numId}_nv" name="item_10_${numId}" value="nem_vizsgált" onchange="toggleSeverity('10_${numId}')">
                        <label for="item_10_${numId}_nv">Nem vonatkozik / Nem vizsgált</label>
                    </div>
                </div>

                <div id="severity_10_${numId}" class="severity-selector" style="display: none; margin-top: 15px; padding: 15px; background-color: #f7fafc; border-radius: 8px;">
                    <label style="font-weight: 600; display: block; margin-bottom: 10px;">Hiba súlyossága:</label>
                    <div class="radio-options">
                        <div class="radio-option" style="border-color: #FFFF00;">
                            <input type="radio" id="item_10_${numId}_sev_low" name="item_10_${numId}_severity" value="alacsony">
                            <label for="item_10_${numId}_sev_low" style="color: #000000;">🟡Alacsony</label>
                        </div>
                        <div class="radio-option" style="border-color: #ED7D31;">
                            <input type="radio" id="item_10_${numId}_sev_medium" name="item_10_${numId}_severity" value="közepes">
                            <label for="item_10_${numId}_sev_medium" style="color: #000000;">🟠Közepes</label>
                        </div>
                        <div class="radio-option" style="border-color: #FF0000;">
                            <input type="radio" id="item_10_${numId}_sev_high" name="item_10_${numId}_severity" value="magas">
                            <label for="item_10_${numId}_sev_high" style="color: #000000;">🔴Magas</label>
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
        id="photos_10_${numId}"
        multiple
        onchange="handleImageUpload(event, '10_${numId}')"
        style="display: none;"
    >

    <!-- Szép gomb -->
    <button type="button" class="upload-btn" onclick="document.getElementById('photos_10_${numId}').click()">
        <i class="fas fa-upload"></i> Fájlok feltöltése
    </button>

    <div id="preview_10_${numId}" class="image-preview-container"></div>
</div>

                <textarea class="notes-textarea" name="notes_10_${numId}" placeholder="Megjegyzés..."></textarea>
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

// Generate all 8 checklist items HTML
const newChecklistItems = category10Items.map(generateChecklistItem).join('\n');

// Replace the section
content = content.substring(0, checklistStart) +
          newChecklistItems + '\n' +
          content.substring(checklistEnd);

// Update title and header
content = content.replace(/<title>4\. Munkagépek, munkaeszközök/g, '<title>10. Egyéb');
content = content.replace(/Munkagépek, munkaeszközök kategória vonatkozó pontjai/g, 'Egyéb kategória vonatkozó pontjai');

// Step 4: Update JavaScript prices objects
console.log('Step 4: Updating JavaScript prices objects...');

// For "Kitiltás" sanctions, we'll use 0 as the price value
const getSanctionValue = (key) => {
    const val = category10Sanctions[key];
    return val === 'Kitiltás' ? 0 : val;
};

// Update calculateTotal() prices object (first occurrence)
const pricesPattern1 = /const prices = \{\s*'1': \d+,\s*'4': \d+,\s*'5': \d+,\s*'6': \d+,\s*'9': \d+,\s*'10': \d+,\s*'11': \d+,\s*'13': \d+,\s*'16': \d+,\s*'17': \d+,\s*'21': \d+,\s*'26': \d+,\s*'27': \d+,\s*'29a': \d+,\s*'29b': \d+,\s*'36': \d+\s*\}/;
const newPricesObject1 = `const prices = {
                    '34': ${getSanctionValue('34')},
                    '35': ${getSanctionValue('35')},
                    '37': ${getSanctionValue('37')},
                    '38': ${getSanctionValue('38')},
                    '40': ${getSanctionValue('40')},
                    '41': ${getSanctionValue('41')},
                    '42': ${getSanctionValue('42')},
                    '43': ${getSanctionValue('43')},
                    '44': ${getSanctionValue('44')},
                    '45': ${getSanctionValue('45')},
                    '46': ${getSanctionValue('46')},
                    '47': ${getSanctionValue('47')},
                    '48': ${getSanctionValue('48')}
                }`;
content = content.replace(pricesPattern1, newPricesObject1);

// Update calculateTotalFine() prices object
const pricesPattern2 = /function calculateTotalFine\(\) \{\s*const prices = \{[^}]+\};/s;
const newPricesObject2 = `function calculateTotalFine() {
            const prices = {
                sanction_34: ${getSanctionValue('34')},
                sanction_35: ${getSanctionValue('35')},
                sanction_37: ${getSanctionValue('37')},
                sanction_38: ${getSanctionValue('38')},
                sanction_40: ${getSanctionValue('40')},
                sanction_41: ${getSanctionValue('41')},
                sanction_42: ${getSanctionValue('42')},
                sanction_43: ${getSanctionValue('43')},
                sanction_44: ${getSanctionValue('44')},
                sanction_45: ${getSanctionValue('45')},
                sanction_46: ${getSanctionValue('46')},
                sanction_47: ${getSanctionValue('47')},
                sanction_48: ${getSanctionValue('48')}
            };`;
content = content.replace(pricesPattern2, newPricesObject2);

// Step 5: Update PDF items array
console.log('Step 5: Updating PDF items array...');
const pdfItemsPattern = /const items = \[[^\]]+\]/s;
const newPdfItems = `const items = [
                    { id: '10_1', label: '${category10Items[0].title}' },
                    { id: '10_2', label: '${category10Items[1].title}' },
                    { id: '10_3', label: '${category10Items[2].title}' },
                    { id: '10_4', label: '${category10Items[3].title}' },
                    { id: '10_5', label: '${category10Items[4].title}' },
                    { id: '10_6', label: '${category10Items[5].title}' },
                    { id: '10_7', label: '${category10Items[6].title}' },
                    { id: '10_8', label: '${category10Items[7].title}' }
                ]`;
content = content.replace(pdfItemsPattern, newPdfItems);

// Step 6: Update sanctionLabels and sanctionPricesRaw objects
console.log('Step 6: Updating sanctionLabels and sanctionPricesRaw objects...');
const sanctionLabelsPattern = /const sanctionLabels = \{[^}]+\}/s;
const newSanctionLabels = `const sanctionLabels = {
                    '34': '${sanctionLabels['34']}',
                    '35': '${sanctionLabels['35']}',
                    '37': '${sanctionLabels['37']}',
                    '38': '${sanctionLabels['38']}',
                    '40': '${sanctionLabels['40']}',
                    '41': '${sanctionLabels['41']}',
                    '42': '${sanctionLabels['42']}',
                    '43': '${sanctionLabels['43']}',
                    '44': '${sanctionLabels['44']}',
                    '45': '${sanctionLabels['45']}',
                    '46': '${sanctionLabels['46']}',
                    '47': '${sanctionLabels['47']}',
                    '48': '${sanctionLabels['48']}'
                }`;
content = content.replace(sanctionLabelsPattern, newSanctionLabels);

const sanctionPricesPattern = /const sanctionPricesRaw = \{[^}]+\}/s;
const newSanctionPrices = `const sanctionPricesRaw = {
                    '34': ${getSanctionValue('34')},
                    '35': ${getSanctionValue('35')},
                    '37': ${getSanctionValue('37')},
                    '38': '${category10Sanctions['38']}',
                    '40': ${getSanctionValue('40')},
                    '41': ${getSanctionValue('41')},
                    '42': ${getSanctionValue('42')},
                    '43': ${getSanctionValue('43')},
                    '44': ${getSanctionValue('44')},
                    '45': ${getSanctionValue('45')},
                    '46': ${getSanctionValue('46')},
                    '47': '${category10Sanctions['47']}',
                    '48': ${getSanctionValue('48')}
                }`;
content = content.replace(sanctionPricesPattern, newSanctionPrices);

// Write the fixed file
console.log('Writing fixed file...');
fs.writeFileSync('views/mvm-other.ejs', content);

console.log('✅ Category 10 (mvm-other.ejs) has been completely fixed!');
