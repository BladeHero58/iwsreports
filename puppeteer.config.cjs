// puppeteer.config.cjs
const path = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
const config = {
  cacheDirectory: path.join(__dirname, '.cache', 'puppeteer'),
  // A Puppeteernek be kell, hogy legyen állítva, hogy ne keressen máshol
  // VAGY ne is legyen ez a config file, ha a környezeti változók teljesen eltávolításra kerültek
  // Ezt most kikommentelem, mert a cacheDirectory a fontosabb.
  // executablePath: undefined, 
  // skipDownload: false,
};

module.exports = config;