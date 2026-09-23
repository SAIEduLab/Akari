const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const record = JSON.parse(fs.readFileSync(path.join(__dirname, '../records/launch-identifier-map.json')));
assert.equal(record.sourceCommit, '2f455619440f5abbfbb564927769c85341f25074');
const identifiers = record.identifiers;
assert.equal(new Set(Object.values(identifiers)).size, Object.keys(identifiers).length);
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp('(?<![A-Za-z0-9_$])(' + Object.keys(identifiers).sort((a,b)=>b.length-a.length).map(escape).join('|') + ')(?![A-Za-z0-9_$])', 'g');
function currentNames(source) {
  return source.replace(/\r\n/g, '\n').replace(pattern, name => identifiers[name])
    .replace(/\bb09(?=-|\b)/g, 'blockui').replace(/(?<=data-)b09(?=-|\b)/g, 'blockui')
    .replaceAll("'#color' + id + '09'", "'#color' + id + (id === 'Value' ? 'Core' : '')")
    .replaceAll('Mode${mode}09', 'Mode${mode}');
}
// Adapt only the audit's references after executing the frozen product unchanged.
// No alias or historical metadata is installed in the current product.
function currentApi(api) {
  const out = Object.fromEntries(Object.entries(api).map(([key,value])=>[identifiers[key] || key,value]));
  if (out.diagnostics) out.diagnostics = Object.fromEntries(Object.entries(out.diagnostics).map(([key,value])=>[identifiers[key] || key,value]));
  return out;
}
module.exports = {currentNames, currentApi, identifiers};
