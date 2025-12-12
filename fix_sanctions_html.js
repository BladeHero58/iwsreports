const fs = require('fs');

// Category sanctions data with full descriptions
const categorySanctions = {
    5: {
        title: 'Villamos biztonság',
        sanctions: [
            { id: '1', price: '100000', desc: 'MVM XPert munka-, tűz-, vagy környezetvédelmi szabályainak (szerződésben rögzített, illetve a BET-ben szereplő, és itt nem részletezett) megsértése' },
            { id: '4', price: '100000', desc: 'A vállalkozó nem biztosítja az egészséget nem veszélyeztető biztonságos munkavégzéshez szükséges feltétleket, munkaeszközöket, kollektív védőeszközöket (pl. állványok, személyemelés feltételei, stb.)' },
            { id: '6', price: '50000', desc: 'Munkabiztonságot jelentősen befolyásoló eszközök, jelzések, biztonsági berendezések mellőzése, kiiktatása, vállalkozónak felróható nem megfelelősége' },
            { id: '9', price: '50000', desc: 'Veszélyes munkaeszköz üzembehelyezésének és időszakos biztonsági felülvizsgálat elvégzésének, igazolásának hiánya, kezelési utasítás nem elérhető' },
            { id: '10', price: '30000', desc: 'A munkavégzéshez használt időszakos felülvizsgálatra kötelezett gépek, berendezések, munkaeszközök nem azonosíthatók, felülvizsgálatai a helyszínen nem igazolhatók (matrica és/vagy jegyzőkönyv hiánya)' },
            { id: '11', price: '30000', desc: 'A munkaeszközök nem rendeltetésszerű használata, nem szabályszerű telepítés, állapot, környezeti hatásoknak nem megfelelő ellenállóság (IP védettség, földelés, mechanikai védelem, védőburkolat hiánya, stb.)' },
            { id: '16', price: '100000', desc: 'Időszakos biztonsági és egyéb jogszabályban, szabványokban meghatározott felülvizsgálatok hiánya' },
            { id: '26', price: '100000', desc: 'Írásos engedélyhez kötött tevékenység végzése engedély nélkül, illetve az engedélyben szereplő feltételek be nem tartása (tűzveszélyes, beszállásos, stb.)' }
        ]
    },
    6: {
        title: 'Egyéni védőeszközök',
        sanctions: [
            { id: '1', price: '100000', desc: 'MVM XPert munka-, tűz-, vagy környezetvédelmi szabályainak (szerződésben rögzített, illetve a BET-ben szereplő, és itt nem részletezett) megsértése' },
            { id: '2', price: '50000', desc: 'Egyéni védőeszköz (kötelező védőfelszerelés) nem vagy nem megfelelő használata' },
            { id: '6', price: '50000', desc: 'Munkabiztonságot jelentősen befolyásoló eszközök, jelzések, biztonsági berendezések mellőzése, kiiktatása, vállalkozónak felróható nem megfelelősége' },
            { id: '7', price: '50000', desc: 'Munkavállalók személyi védőeszközökkel történő ellátása (ruházat, lábbeli, védősisak) nem vagy nem megfelelő' },
            { id: '23', price: '50000', desc: 'Láthatósági/jelző mellény használatának elmulasztása' }
        ]
    },
    7: {
        title: 'Elsősegélynyújtás',
        sanctions: [
            { id: '1', price: '100000', desc: 'MVM XPert munka-, tűz-, vagy környezetvédelmi szabályainak (szerződésben rögzített, illetve a BET-ben szereplő, és itt nem részletezett) megsértése' },
            { id: '3', price: '50000', desc: 'Elsősegélynyújtó felszerelés hiánya, elérhetetlensége, nem megfelelősége' }
        ]
    },
    8: {
        title: 'Veszélyes anyagok',
        sanctions: [
            { id: '1', price: '100000', desc: 'MVM XPert munka-, tűz-, vagy környezetvédelmi szabályainak (szerződésben rögzített, illetve a BET-ben szereplő, és itt nem részletezett) megsértése' },
            { id: '17', price: '10000', desc: 'Veszélyesnek minősülő vegyi anyagok biztonsági adatlapja nem hozzáférhető a helyszínen (anyagonként), nem megfelelő edényzetben való tárolás' },
            { id: '29b', price: '50000', desc: 'Veszélyes hulladékok nem megfelelő módon/helyen történő tárolása (hulladékfajta és mennyiség függvényében)' },
            { id: '31b', price: '100000', desc: 'Veszélyes anyagok használatához szükséges dokumentumok, engedélyek hiánya' },
            { id: '33', price: '50000', desc: 'Vegyszeres munkavégzési engedély hiánya' },
            { id: '36', price: '20000', desc: 'Veszélyes anyagok, illetve veszélyes hulladékok tárolása esetén a kármentő tálca hiánya' }
        ]
    },
    9: {
        title: 'Elmaradt cselekedetek',
        sanctions: [
            { id: '8', price: '100000', desc: 'Hatósági előírások be nem tartása' },
            { id: '12', price: '50000', desc: 'Munkaterület rendezetlensége, tisztasági hiányosságok' },
            { id: '14', price: '100000', desc: 'Korábban feltárt hiányosság ismételt előfordulása' },
            { id: '15', price: '100000', desc: 'Munkavédelmi előírások súlyos megsértése' },
            { id: '18', price: '50000', desc: 'Eszközök rendeltetésellenes használata' },
            { id: '19', price: '20000', desc: 'Környezetvédelmi előírások megsértése' },
            { id: '20', price: '100000', desc: 'Életvédelmi rendszerek kikapcsolása, megkerülése' },
            { id: '22', price: '100000', desc: 'Kötelező oktatások, vizsgák elmulasztása' },
            { id: '24', price: '100000', desc: 'Kötelező dokumentációk hiánya' },
            { id: '25', price: '50000', desc: 'Munkavégzési engedélyek hiánya' },
            { id: '28', price: '25000', desc: 'Felszólítás utáni teljesítés elmulasztása' },
            { id: '30', price: '50000', desc: 'Kockázatértékelés hiánya vagy hiányossága' },
            { id: '31a', price: '50000', desc: 'Munkabiztonsági dokumentáció hiányossága' },
            { id: '31b', price: '100000', desc: 'Biztonsági adatlap hiánya' },
            { id: '32', price: '50000', desc: 'Jegyzőkönyvek, nyilvántartások hiánya' },
            { id: '39', price: '100000', desc: 'Ismételt súlyos szabálytalanság' }
        ]
    },
    10: {
        title: 'Egyéb',
        sanctions: [
            { id: '34', price: '50000', desc: 'Közlekedési utak lezárása, akadályozása' },
            { id: '35', price: '30000', desc: 'Anyagok nem megfelelő tárolása' },
            { id: '37', price: '100000', desc: 'Tűzvédelmi eszközök hiánya vagy elérhetetlen volta' },
            { id: '38', price: 'Kitiltás', desc: 'Súlyos szabálytalanság - kitiltás' },
            { id: '40', price: '200000', desc: 'Életvédelmi rendszer kiiktatása' },
            { id: '41', price: '150000', desc: 'Veszélyhelyzet kezelésének elmulasztása' },
            { id: '42', price: '100000', desc: 'Engedély nélküli tevékenység végzése' },
            { id: '43', price: '75000', desc: 'Dokumentáció súlyos hiányossága' },
            { id: '44', price: '50000', desc: 'Munkaterület súlyos rendezetlensége' },
            { id: '45', price: '30000', desc: 'Kötelező jelölések hiánya' },
            { id: '46', price: '20000', desc: 'Kommunikációs eszközök hiánya' },
            { id: '47', price: 'Kitiltás', desc: 'Ismételt súlyos veszélyeztetés - kitiltás' },
            { id: '48', price: '500000', desc: 'Rendkívül súlyos szabálytalanság' }
        ]
    }
};

function generateSanctionHTML(sanction, index) {
    const priceDisplay = sanction.price === 'Kitiltás'
        ? 'Kitiltás'
        : `${parseInt(sanction.price).toLocaleString('hu-HU')} Ft`;

    const priceValue = sanction.price === 'Kitiltás' ? '0' : sanction.price;

    return `
                <div class="price-item">
                    <input type="checkbox" id="price_${index + 1}" name="sanction_${sanction.id}" value="${priceValue}" onchange="calculateTotal()">
                    <label for="price_${index + 1}">${sanction.id}. ${sanction.desc}</label>
                    <input type="number" name="sanction_${sanction.id}_count" min="1" value="1" style="width: 60px; margin: 0 10px;" onchange="calculateTotal()" placeholder="db">
                    <span style="margin-right: 10px; font-weight: 600;">×</span>
                    <span class="price">${priceDisplay}</span>
                </div>
`;
}

function fixCategorySanctions(categoryNum, filename) {
    console.log(`\nProcessing Category ${categoryNum}: ${categorySanctions[categoryNum].title}...`);

    let content = fs.readFileSync(filename, 'utf8');

    // Find sanctions section
    const sanctionsStartMarker = '<!-- Szankciós lista -->';
    const sanctionsEndMarker = '<div class="total-section">';

    const sanctionsStart = content.indexOf(sanctionsStartMarker);
    if (sanctionsStart === -1) {
        console.error(`Could not find sanctions start marker in ${filename}`);
        return;
    }

    const sanctionsEnd = content.indexOf(sanctionsEndMarker, sanctionsStart);
    if (sanctionsEnd === -1) {
        console.error(`Could not find sanctions end marker in ${filename}`);
        return;
    }

    // Generate new sanctions HTML
    const sanctionsHTML = categorySanctions[categoryNum].sanctions.map((s, i) => generateSanctionHTML(s, i)).join('\n');

    const newSanctionsSection = `<!-- Szankciós lista -->
            <div class="price-section">
                <h3>Szankciós lista - ${categorySanctions[categoryNum].title} kategória vonatkozó pontjai</h3>
${sanctionsHTML}
                `;

    // Replace sanctions section
    content = content.substring(0, sanctionsStart) + newSanctionsSection + content.substring(sanctionsEnd);

    // Write back
    fs.writeFileSync(filename, content);
    console.log(`✅ Fixed ${filename} with ${categorySanctions[categoryNum].sanctions.length} sanctions`);
}

// Fix all categories
console.log('Fixing HTML sanctions lists for categories 5-10...');

fixCategorySanctions(5, 'views/mvm-electrical-safety.ejs');
fixCategorySanctions(6, 'views/mvm-personal-protective-equipment.ejs');
fixCategorySanctions(7, 'views/mvm-first-aid.ejs');
fixCategorySanctions(8, 'views/mvm-hazardous-materials.ejs');
fixCategorySanctions(9, 'views/mvm-omissions.ejs');
fixCategorySanctions(10, 'views/mvm-other.ejs');

console.log('\n✅ All category sanctions HTML lists have been fixed!');
