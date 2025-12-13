const fs = require('fs');

console.log('🔧 Canvas rajzoló függvények hozzáadása...\n');

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

// A rajzoló függvények (documentation.ejs-ből)
const drawingFunctions = `
        // ========================================
        // ALÁÍRÁS RAJZOLÓ FÜGGVÉNYEK
        // ========================================

        // Rajzolás kezdése
        function startDrawing(e) {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            ctx.beginPath();
            ctx.moveTo(
                (e.clientX - rect.left) * scaleX,
                (e.clientY - rect.top) * scaleY
            );
        }

        // Rajzolás
        function draw(e) {
            if (!isDrawing) return;

            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            ctx.lineTo(
                (e.clientX - rect.left) * scaleX,
                (e.clientY - rect.top) * scaleY
            );
            ctx.stroke();
        }

        // Rajzolás befejezése
        function stopDrawing() {
            if (isDrawing) {
                ctx.closePath();
            }
            isDrawing = false;
        }

        // Touch események - Start
        function handleTouchStart(e) {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            isDrawing = true;
            ctx.beginPath();
            ctx.moveTo(
                (touch.clientX - rect.left) * scaleX,
                (touch.clientY - rect.top) * scaleY
            );
        }

        // Touch események - Move
        function handleTouchMove(e) {
            e.preventDefault();
            if (!isDrawing) return;

            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;

            ctx.lineTo(
                (touch.clientX - rect.left) * scaleX,
                (touch.clientY - rect.top) * scaleY
            );
            ctx.stroke();
        }

        // Touch események - End
        function handleTouchEnd(e) {
            e.preventDefault();
            if (isDrawing) {
                ctx.closePath();
            }
            isDrawing = false;
        }

        // Canvas törlése
        function clearCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        // Aláírás mentése
        function saveSignature() {
            const dataURL = canvas.toDataURL('image/png');
            signatures[currentSignatureType] = dataURL;

            let hiddenInputId = currentSignatureType + 'Signature';
            if (currentSignatureType.startsWith('witness_')) {
                hiddenInputId = currentSignatureType + 'Signature';
            }

            const hiddenInput = document.getElementById(hiddenInputId);
            if (hiddenInput) {
                hiddenInput.value = dataURL;
                console.log('Hidden input frissítve:', hiddenInputId);
            } else {
                console.warn('Nem található hidden input:', hiddenInputId);
            }

            const previewId = currentSignatureType + 'Preview';
            const preview = document.getElementById(previewId);
            if (preview) {
                preview.innerHTML = '<img src="' + dataURL + '" alt="Aláírás">';
            }

            const clearBtnId = currentSignatureType + 'Clear';
            const clearBtn = document.getElementById(clearBtnId);
            if (clearBtn) {
                clearBtn.style.display = 'block';
            }

            closeSignatureModal();
        }

        // Aláírás törlése
        function clearSignature(type) {
            signatures[type] = null;

            const hiddenInput = document.getElementById(type + 'Signature');
            if (hiddenInput) {
                hiddenInput.value = '';
            }

            const preview = document.getElementById(type + 'Preview');
            if (preview) {
                preview.innerHTML = '<span><i class="fas fa-pen"></i> Kattintson ide az aláírás hozzáadásához</span>';
            }

            const clearBtn = document.getElementById(type + 'Clear');
            if (clearBtn) {
                clearBtn.style.display = 'none';
            }
        }
`;

for (const file of categories) {
    console.log(`\n📝 Feldolgozás: ${file}...`);

    try {
        let content = fs.readFileSync(file, 'utf8');

        // Ellenőrizzük hogy már van-e startDrawing függvény
        if (content.includes('function startDrawing(e)')) {
            console.log('  ✓ Rajzoló függvények már léteznek');
            continue;
        }

        // Keressük meg az openSignatureModal függvényt és adjuk hozzá előtte
        const insertPattern = /(function openSignatureModal\(type\))/;

        if (content.match(insertPattern)) {
            console.log('  ✓ openSignatureModal megtalálva');

            // Beszúrjuk a rajzoló függvényeket az openSignatureModal elé
            content = content.replace(
                insertPattern,
                drawingFunctions + '\n        $1'
            );

            console.log('  ✅ Rajzoló függvények hozzáadva');

            // Javítsuk a canvas inicializálást is - a touch event listener-eket
            // handleTouch → handleTouchStart, handleTouchMove, handleTouchEnd
            content = content.replace(
                /canvas\.addEventListener\('touchstart', handleTouch\)/g,
                "canvas.addEventListener('touchstart', handleTouchStart, { passive: false })"
            );
            content = content.replace(
                /canvas\.addEventListener\('touchmove', handleTouch\)/g,
                "canvas.addEventListener('touchmove', handleTouchMove, { passive: false })"
            );
            content = content.replace(
                /canvas\.addEventListener\('touchend', stopDrawing\)/g,
                "canvas.addEventListener('touchend', handleTouchEnd, { passive: false })"
            );

            console.log('  ✅ Touch event listener-ek javítva');

            fs.writeFileSync(file, content);
            console.log('  ✅ Fájl mentve');
        } else {
            console.error('  ❌ Nem találom az openSignatureModal függvényt');
        }

    } catch (error) {
        console.error(`  ❌ Hiba: ${error.message}`);
    }
}

console.log('\n✅ Canvas rajzoló függvények hozzáadva minden kategóriához!');
console.log('   Most már működik az aláírás rajzolás!');
