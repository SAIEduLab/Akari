const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');

function validateProductMetadata(record) {
  assert.match(record.productVersion, /^\d+\.\d+\.\d+$/, 'product release label');
  const expected = 'Akari_' + record.productVersion.replaceAll('.', '_') + '.html';
  assert.equal(record.productFile, expected, 'product filename must match release label');
  assert.ok(Array.isArray(record.files), 'publication file inventory');
  assert.equal(record.files.filter(file => file === expected).length, 1, 'one published product');
  assert.deepEqual(record.files.filter(file => file === 'Akari.html' || /^Akari_?\d+_\d+_\d+\.html$/.test(file)), [expected], 'no retired product in publication');
  return record;
}
const metadata = () => validateProductMetadata(JSON.parse(fs.readFileSync(path.join(root, 'audit/public-files.json'), 'utf8')));
const currentProductFile = () => metadata().productFile;
const currentProductVersion = () => metadata().productVersion;
const languageFileForVersion = version => {
  assert.match(version, /^\d+\.\d+\.\d+$/, 'language document release label');
  return 'LANGUAGE_' + version.replaceAll('.', '_') + '.md';
};
const currentLanguageFile = () => languageFileForVersion(currentProductVersion());
// Fixture references are stable document identities, not paths to historical files.
const resolveSpecificationFile = reference => {
  assert.ok(['LANGUAGE.md', 'EXTENSIONS.md'].includes(reference), 'unknown specification reference');
  return reference === 'LANGUAGE.md' ? currentLanguageFile() : reference;
};
const currentReleaseFile = () => 'audit/manifests/release-' + currentProductVersion() + '.json';
function assertLanguageInventory(record = metadata(), names = fs.readdirSync(root)) {
  const expected = languageFileForVersion(record.productVersion);
  const isLanguage = file => /^LANGUAGE(?:_\d+_\d+_\d+)?\.md$/.test(file);
  assert.deepEqual(record.files.filter(isLanguage), [expected], 'one published current language document');
  assert.deepEqual(names.filter(isLanguage), [expected], 'checkout must contain only the current language document');
  return expected;
}
function assertProductInventory() {
  const record = metadata();
  const products = fs.readdirSync(root).filter(file => file === 'Akari.html' || /^Akari_?\d+_\d+_\d+\.html$/.test(file));
  assert.deepEqual(products, [record.productFile], 'checkout must contain exactly the current product');
  return record;
}
module.exports = {currentProductFile, currentProductVersion, currentReleaseFile, currentLanguageFile, languageFileForVersion, resolveSpecificationFile, assertLanguageInventory, validateProductMetadata, assertProductInventory};
