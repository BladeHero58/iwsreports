const path = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
const config = {
  cacheDirectory: path.join(__dirname, '.cache', 'puppeteer'),
};

module.exports = config;