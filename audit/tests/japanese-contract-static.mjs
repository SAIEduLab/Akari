import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {verifyCapabilityContract,corpusPath,corpusMarkdownPath} from '../lib/capability-contract.mjs';

// This audit deliberately imports no candidate parser, renderer or runtime.
// Its oracle is independent of candidate parser/runtime observations.
// A changed oracle needs an explicit, reviewed contract change, never a refresh
// from candidate observations. Static success is not a product execution PASS.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frozenFixtureSha256 = 'c0431d2ae35074a58fd3c95b7862102d644d358881e48a4cb0cd88224025fe44';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label + ': duplicate');
const sameSet = (actual, expected, label) => {
  unique(actual, label);
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
};
const requiredText = (value, label) => assert.ok(typeof value === 'string' && value.trim(), label);
const rows = (ledger, letter) => ledger.appendices[letter];
const unquote = value => value.replace(/^`|`$/g, '');

export function verifyJapaneseContract(repositoryRoot = root) {
  const read = relative => fs.readFileSync(path.join(repositoryRoot, relative));
  const json = relative => JSON.parse(read(relative));
  const bytes = read('audit/fixtures/capability-oracle.json');
  assert.equal(sha(bytes), frozenFixtureSha256, 'independent baseline/child oracle was changed');
  const baseline = JSON.parse(bytes);
  const results = [];
  const check = (id, fn) => { fn(); results.push({ id, status: 'PASS', scope: 'GA-STATIC' }); };

  let coverage;
  check('JAPANESE-CONTRACT/CURRENT-CAPABILITY-COVERAGE',()=>{coverage=verifyCapabilityContract(repositoryRoot);});

  check('JAPANESE-CONTRACT/INDEPENDENT-BASELINE-COMPLETE', () => {
    assert.deepEqual(baseline.counts, {
      commands: 74, schemas: 153, capabilities: 260, limits: 38,
      builtins: 26, fixedSensors: 22, argumentSensors: 5, operators: 16, scopes: 5,
    });
    assert.equal(baseline.commands.length, 74);
    assert.equal(baseline.schemaIds.length, 153);
    assert.equal(baseline.capabilities.length, 260);
    assert.equal(Object.keys(baseline.limits).length, 38);
    unique(baseline.schemaIds, 'baseline schemas');
    unique(baseline.capabilities.map(c => c.id), 'baseline capabilities');
    sameSet(baseline.commands.map(c => 'command:' + c.id),
      baseline.capabilities.filter(c => c.id.startsWith('command:')).map(c => c.id), 'command capabilities');
    sameSet(Object.keys(baseline.limits).map(id => 'limit:' + id),
      baseline.capabilities.filter(c => c.id.startsWith('limit:')).map(c => c.id), 'limit capabilities');
    for (const capability of baseline.capabilities) {
      for (const key of ['capability', 'ast', 'cui', 'gui', 'semantic', 'runtime', 'selftest', 'browser', 'guarantee'])
        requiredText(capability[key], capability.id + '/' + key);
    }
    for (const [category, prefix, count] of [
      ['builtins', 'builtin', 26], ['fixedSensors', 'state', 22],
      ['argumentSensors', 'sensor', 5], ['operators', 'operator', 16], ['scopes', 'scope', 5],
    ]) {
      assert.equal(baseline.categories[category].length, count, category);
      sameSet(baseline.categories[category], baseline.capabilities.filter(c => c.id.startsWith(prefix + ':')).map(c => c.id), category);
    }
    const html = baseline.baselineHtmlCrossCheck;
    assert.equal(html.namedBuiltinDefinitions.length, 21);
    assert.equal(html.structuralBuiltinSchemaIds.length, 5);
    sameSet([...html.namedBuiltinDefinitions.map(b => 'builtin:' + b.name),
      ...html.structuralBuiltinSchemaIds.map(id => 'builtin:' + id.slice('BuiltinCall:'.length))], baseline.categories.builtins, 'HTML builtin crosscheck');
    sameSet(html.fixedSensorNames.map(name => 'state:' + name), baseline.categories.fixedSensors, 'HTML fixed sensors');
    for (const id of baseline.categories.argumentSensors)
      assert.ok(baseline.schemaIds.includes('SensorRead:' + id.slice('sensor:'.length)), id);
  });

  const corpus = json(corpusPath);
  const markdown = read(corpusMarkdownPath).toString();
  const protectedIntent = baseline.protectedChildIntent;
  const intentIds = Array.from({ length: 20 }, (_, i) => 'CI-' + String(i + 1).padStart(2, '0'));
  check('JAPANESE-CONTRACT/CHILD-INTENT-INDEPENDENCE-AND-MAPPING', () => {
    assert.equal(corpus.case_count, 20);
    assert.equal(protectedIntent.caseCount, 20);
    assert.equal(corpus.provenance, protectedIntent.provenance);
    assert.equal(corpus.independence, protectedIntent.independence);
    assert.match(corpus.provenance, /not observed, collected, or validated real-child data/);
    assert.deepEqual(corpus.cases, protectedIntent.cases, 'child input/expected oracle is read-only');
    sameSet(corpus.cases.map(c => c.id), intentIds, 'child case IDs');
  });
  for (const item of corpus.cases) {
    check('JAPANESE-CONTRACT/' + item.id + '/DEFINITION', () => {
      const frozen = protectedIntent.cases.find(c => c.id === item.id);
      assert.deepEqual(item, frozen);
      requiredText(item.title, item.id + '/title');
      unique(item.sections.map(s => s.label), item.id + '/section labels');
      for (const label of ['意図場面', '意味の契約', '判定例'])
        requiredText(item.sections.find(s => s.label === label)?.text, item.id + '/' + label);
      assert.ok(item.sections.some(s => s.label.startsWith('作文候補')), item.id + '/input');
      for (const section of item.sections) {
        requiredText(section.text, item.id + '/' + section.label);
        assert.ok(markdown.includes(section.text), item.id + ': JSON/Markdown section mismatch ' + section.label);
      }
    });
    check('JAPANESE-CONTRACT/' + item.id + '/AMBIGUITY-ORACLE', () => {
      const ambiguity = item.sections.find(s => s.label === '反例と確認');
      const frozen = protectedIntent.cases.find(c => c.id === item.id).sections.find(s => s.label === '反例と確認');
      requiredText(ambiguity?.text, item.id + '/ambiguity');
      assert.equal(ambiguity.text, frozen.text, item.id + ': do not normalize ambiguity into acceptance');
      const mapping = protectedIntent.mappings.find(c => c.id === item.id);
      requiredText(mapping.route, item.id + '/route');
      requiredText(mapping.acceptance, item.id + '/acceptance');
    });
  }

  return {
    schema: 'akari-japanese-contract-static-report-v1', scope: 'GA-STATIC', status: 'PASS',
    fixtureSha256: frozenFixtureSha256,
    coverage, results, total: results.length,
    protectedIntentDefinitions: 20, protectedAmbiguityOracles: 20,
    productDynamic: { status: 'NOT_RUN', reason: 'No candidate product was imported or executed by this static audit; product execution is reported by the independent runtime/browser gates.' },
    semanticReview: { status: 'NOT_RUN', reason: 'Presence and immutable provenance do not prove implementation, UI behavior, bidirectionality or child validation.' },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = verifyJapaneseContract();
  // Optional evidence goes only to a fresh explicitly requested path.
  if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
