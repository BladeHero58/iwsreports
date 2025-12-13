const fs = require('fs');

console.log('🔧 PDF checklist stílus javítása table formátumra (mint a documentation.ejs)...\n');

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

// Helper függvények hozzáadása (mint a documentation.ejs-ben)
const helperFunctions = `
        // Helper függvények a PDF-hez (documentation.ejs mintájára)
        function getStatusText(status) {
            switch(status) {
                case 'megfelelő': return 'MEGFELELŐ (M)';
                case 'nem_megfelelő': return 'NEM MEGFELELŐ (NM)';
                case 'felszólítás_után': return 'FELSZÓLÍTÁS UTÁN TELJESÍTVE (FT)';
                case 'nem_vizsgált': return 'NEM VIZSGÁLT (NV)';
                default: return 'Nincs értékelve';
            }
        }

        function getStatusStyle(status) {
            switch(status) {
                case 'megfelelő': return 'statusOk';
                case 'nem_megfelelő': return 'statusFail';
                case 'felszólítás_után': return 'statusFT';
                case 'nem_vizsgált': return 'statusNA';
                default: return 'statusNA';
            }
        }

        function getSeverityBadge(itemId, data) {
            const severity = data['item_' + itemId + '_severity'];
            if (!severity) return null;

            const severityConfig = {
                'alacsony': { text: 'Hiba súlyossága: 🟡 ALACSONY', color: '#000000', bg: '#FFFF00' },
                'közepes': { text: 'Hiba súlyossága: 🟠 KÖZEPES', color: '#000000', bg: '#ED7D31' },
                'magas': { text: 'Hiba súlyossága: 🔴 MAGAS', color: '#000000', bg: '#FF0000' }
            };

            const config = severityConfig[severity];
            if (!config) return null;

            return {
                text: config.text,
                bold: true,
                fontSize: 10,
                color: config.color,
                background: config.bg,
                margin: [0, 5, 0, 0]
            };
        }
`;

// Új getChecklistItemsForPDF függvény (table formátummal)
const newGetChecklistItemsFunction = `
        function getChecklistItemsForPDF(data) {
            const result = [
                {
                    text: 'ELLENŐRZÉSI PONTOK',
                    style: 'sectionHeader',
                    margin: [0, 10, 0, 10],
                    pageBreak: 'before'
                }
            ];

            const items = ITEMS_ARRAY_PLACEHOLDER;

            items.forEach(item => {
                const status = data['item_' + item.id];
                const notes = data['notes_' + item.id];

                // Table minden ellenőrzési ponthoz (documentation.ejs mintájára)
                result.push({
                    table: {
                        widths: ['*'],
                        body: [[
                            {
                                stack: [
                                    { text: item.label, style: 'checklistTitle' },
                                    { text: 'Értékelés: ' + getStatusText(status), style: getStatusStyle(status), margin: [0, 5, 0, 0] },
                                    getSeverityBadge(item.id, data) || {},
                                    notes ? { text: 'Megjegyzés: ' + notes, style: 'notes' } : {}
                                ].filter(Boolean),
                                border: [true, true, true, true],
                                fillColor: '#fafafa'
                            }
                        ]]
                    },
                    layout: {
                        hLineColor: '#333',
                        vLineColor: '#333',
                        hLineWidth: function() { return 1; },
                        vLineWidth: function() { return 1; }
                    },
                    margin: [0, 0, 0, 8],
                    unbreakable: true
                });

                // Képek hozzáadása az adott ellenőrzési ponthoz
                result.push(...getImagesForPDF(item.id));
            });

            return result;
        }
`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // 1. Keressük meg a régi getChecklistItemsForPDF függvényt
        const oldFunctionPattern = /function getChecklistItemsForPDF\(data\) \{[\s\S]*?const items = \[([\s\S]*?)\];[\s\S]*?return result;[\s\S]*?\}/;
        const match = content.match(oldFunctionPattern);

        if (!match) {
            console.warn('  ⚠️ Nem találom a getChecklistItemsForPDF függvényt');
            continue;
        }

        // Kinyerjük az items tömböt
        const itemsArray = match[1];
        console.log('  ✓ Items tömb megtalálva');

        // 2. Ellenőrizzük hogy vannak-e már a helper függvények
        const hasHelpers = content.includes('function getStatusText') &&
                          content.includes('function getSeverityBadge');

        if (!hasHelpers) {
            console.log('  ➕ Helper függvények hozzáadása...');
            // Keressük meg az exportToPDF függvény kezdetét és adjuk hozzá előtte
            const exportFuncPos = content.indexOf('async function exportToPDF()');
            if (exportFuncPos !== -1) {
                content = content.substring(0, exportFuncPos) +
                         helperFunctions + '\n' +
                         content.substring(exportFuncPos);
            }
        } else {
            console.log('  ✓ Helper függvények már léteznek');
        }

        // 3. Cseréljük le a getChecklistItemsForPDF függvényt
        const newFunction = newGetChecklistItemsFunction.replace(
            'ITEMS_ARRAY_PLACEHOLDER',
            '[' + itemsArray + ']'
        );

        content = content.replace(oldFunctionPattern, newFunction);
        console.log('  ➕ getChecklistItemsForPDF függvény lecserélve table formátumra');

        // 4. Mentés
        fs.writeFileSync(file, content);
        console.log('  ✅ Mentve');

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ PDF checklist stílus javítva minden kategóriában!');
console.log('   Most már table formátumot használnak, mint a documentation.ejs');
