const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

function validateProductMetadata(record) {
  assert.match(record.productVersion, /^\d+\.\d+\.\d+$/, 'product release label');
  const expected = 'Akari' + record.productVersion.replaceAll('.', '_') + '.html';
  assert.equal(record.productFile, expected, 'product filename must match release label');
  assert.ok(Array.isArray(record.files), 'publication file inventory');
  assert.equal(record.files.filter(file => file === expected).length, 1, 'one published product');
  assert.deepEqual(record.files.filter(file => file === 'Akari.html' || /^Akari\d+_\d+_\d+\.html$/.test(file)), [expected], 'no retired product in publication');
  return record;
}
const metadata = () => validateProductMetadata(JSON.parse(fs.readFileSync(path.join(root, 'audit/public-files.json'), 'utf8')));
const currentProductFile = () => metadata().productFile;
const currentProductVersion = () => metadata().productVersion;
const currentReleaseFile = () => 'audit/manifests/release-' + currentProductVersion() + '.json';
function assertProductInventory() {
  const record = metadata();
  const products = fs.readdirSync(root).filter(file => file === 'Akari.html' || /^Akari\d+_\d+_\d+\.html$/.test(file));
  assert.deepEqual(products, [record.productFile], 'checkout must contain exactly the current product');
  return record;
}
module.exports = {currentProductFile, currentProductVersion, currentReleaseFile, validateProductMetadata, assertProductInventory};
