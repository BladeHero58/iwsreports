const fs = require('fs');

console.log('🔧 CalculateTotal függvény javítása - prices object eltávolítása...\n');

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

// A helyes calculateTotal függvény (mint a documentation.ejs-ben)
const correctCalculateTotal = `        function calculateTotal() {
            let total = 0;
            const checkboxes = document.querySelectorAll('.price-item input[type="checkbox"]');

            checkboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    const basePrice = parseInt(checkbox.value);
                    const sanctionName = checkbox.name;
                    const countInput = document.querySelector(\`input[name="\${sanctionName}_count"]\`);
                    const count = countInput ? parseInt(countInput.value) || 1 : 1;
                    total += basePrice * count;
                }
            });

            document.getElementById('totalPrice').textContent = total.toLocaleString('hu-HU') + ' Ft';
            return total;
        }`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Keressük meg a hibás calculateTotal függvényt
        // A függvény tartalmaz egy prices objektumot és prices[sanctionKey] keresést
        const badPattern = /function calculateTotal\(\) \{[\s\S]*?const prices = \{[\s\S]*?\};[\s\S]*?const basePrice = prices\[sanctionKey\][\s\S]*?\}/;

        const match = content.match(badPattern);

        if (match) {
            console.log('  ✓ Hibás calculateTotal függvény megtalálva');
            console.log('  ➕ Csere a helyes verzióra...');

            // Cseréljük le a hibás függvényt a helyes verzióra
            content = content.replace(badPattern, correctCalculateTotal);

            fs.writeFileSync(file, content);
            console.log('  ✅ Javítva és mentve');
        } else {
            // Próbáljuk meg egy egyszerűbb pattern-nel is
            const simpleBadPattern = /function calculateTotal\(\) \{[^}]*const prices = \{/;
            if (content.match(simpleBadPattern)) {
                console.log('  ⚠️ Megtaláltam a prices objektumot, de nem tudtam automatikusan cserélni');
                console.log('     Kézi javítás szükséges');
            } else {
                console.log('  ℹ️ Nincs javítanivaló vagy már javítva van');
            }
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ CalculateTotal függvény javítások kész!');
console.log('\n📝 A javítás lényege:');
console.log('   - Eltávolítottuk a hardcoded prices objektumot');
console.log('   - Az árakat közvetlenül a checkbox.value-ból vesszük');
console.log('   - Ez megegyezik a működő documentation.ejs verzióval');
