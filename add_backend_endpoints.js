const fs = require('fs');

console.log('🔧 Backend export-pdf endpoints hozzáadása minden kategóriához...\n');

// Kategóriák endpoint információi
const categories = [
    { num: 2, path: 'work-environment', name: 'Munkakörnyezet' },
    { num: 3, path: 'personal-conditions', name: 'Személyi feltételek' },
    { num: 4, path: 'machinery', name: 'Munkagépek, munkaeszközök' },
    { num: 5, path: 'electrical-safety', name: 'Villamos biztonság' },
    { num: 6, path: 'personal-protective-equipment', name: 'Egyéni védőeszközök' },
    { num: 7, path: 'first-aid', name: 'Elsősegélynyújtás' },
    { num: 8, path: 'hazardous-materials', name: 'Veszélyes anyagok' },
    { num: 9, path: 'omissions', name: 'Elmaradt cselekedetek' },
    { num: 10, path: 'other', name: 'Egyéb' }
];

// Olvassuk be a jelenlegi mvm-reports.js fájlt
let content = fs.readFileSync('mvm-reports.js', 'utf8');

// Keressük meg az eredeti documentation export-pdf endpoint-ot
const docEndpointStart = content.indexOf("router.post('/projects/:projectId/reports/documentation/export-pdf'");
const docEndpointEnd = content.indexOf('\n});', docEndpointStart) + 4;

if (docEndpointStart === -1 || docEndpointEnd === -1) {
    console.error('❌ Nem találom a documentation export-pdf endpoint-ot!');
    process.exit(1);
}

const originalEndpoint = content.substring(docEndpointStart, docEndpointEnd);
console.log('✅ Eredeti endpoint megtalálva\n');

// Hozzunk létre új endpoint-okat minden kategóriához
let newEndpoints = '';

for (const cat of categories) {
    console.log(`📝 Endpoint létrehozása: ${cat.name} (${cat.path})...`);

    // Másoljuk le az eredeti endpoint-ot és cseréljük ki a path-ot és a kommenteket
    let newEndpoint = originalEndpoint
        .replace(/documentation/g, cat.path)
        .replace(/Dokumentáció/g, cat.name)
        .replace(/1\. DOKUMENTÁCIÓ/g, `${cat.num}. ${cat.name.toUpperCase()}`);

    newEndpoints += '\n' + newEndpoint + '\n';
}

// Keressük meg, hova illesszük be az új endpoint-okat
// Közvetlenül a documentation endpoint után
const insertPosition = docEndpointEnd;

// Illesszük be az új endpoint-okat
content = content.substring(0, insertPosition) + newEndpoints + content.substring(insertPosition);

// Írjuk vissza a fájlt
fs.writeFileSync('mvm-reports.js', content);

console.log('\n✅ Minden backend endpoint hozzáadva!');
console.log('📋 Létrehozott endpoint-ok:');
categories.forEach(cat => {
    console.log(`   - POST /projects/:projectId/reports/${cat.path}/export-pdf`);
});
