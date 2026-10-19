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
const frozenFixtureSha256 = '66a472d2726c94c028d50c40be00f6315b98bd786967ae12f8cfa20165767218';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label + ': duplicate');
const sameSet = (actual, expected, label) => {
  unique(actual, label);
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
};
const requiredText = (value, label) => assert.ok(typeof value === 'string' && value.trim(), label);

// The oracle lists exactly the current schemas. Builtins and fixed sensors are
// cross-checked against those schemas and the lists LANGUAGE.md publishes.
export function verifyOracleCurrentLists(oracle, features, language) {
  unique(oracle.schemaIds, 'oracle schemas');
  assert.deepEqual(oracle.schemaIds, features.schemaIds, 'the oracle requires exactly the current schemas');
  const section = heading => {
    const start = language.indexOf('\n' + heading + '\n');
    assert.ok(start >= 0, 'LANGUAGE.md section ' + heading);
    const end = language.indexOf('\n## ', start + heading.length + 2);
    return language.slice(start + heading.length + 2, end < 0 ? undefined : end);
  };
  const quoted = text => [...text.matchAll(/`([^`]+)`/g)].map(m => m[1]);
  // The published list is the first bullet list of the section; later bullets explain individual builtins.
  const builtinLines = section('## 組み込み求値の一覧').split('\n'), listStart = builtinLines.findIndex(line => line.startsWith('- `'));
  assert.ok(listStart >= 0, 'LANGUAGE.md builtin list');
  const listEnd = builtinLines.findIndex((line, i) => i > listStart && !line.startsWith('- '));
  const documentedBuiltins = builtinLines.slice(listStart, listEnd < 0 ? undefined : listEnd).flatMap(quoted);
  const documentedSensors = quoted(section('## 読み取れる状態の一覧').split('\n').find(line => line.startsWith('`')) || '');
  const schemaNames = prefix => oracle.schemaIds.filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length));
  sameSet(schemaNames('BuiltinCall:').map(name => 'builtin:' + name), oracle.categories.builtins, 'builtin capabilities and current builtin schemas');
  sameSet(documentedBuiltins.map(name => 'builtin:' + name),
    oracle.categories.builtins.filter(id => !/^builtin:[A-Z_]+$/.test(id)), 'LANGUAGE.md builtin list');
  // Every registered state name that the language reads is documented; 「＝」 joins it with the written form.
  // クローンである is a registered name the language no longer reads, so it must not be documented.
  const documentedStates = new Set(documentedSensors.map(name => 'state:' + name)), unreadStates = ['state:クローンである'];
  for (const id of oracle.categories.fixedSensors) assert.equal(documentedStates.has(id), !unreadStates.includes(id), 'LANGUAGE.md fixed sensor list: ' + id);
  sameSet(schemaNames('SensorRead:').filter(name => !/^[A-Z_]+$/.test(name)).map(name => 'state:' + name), oracle.categories.fixedSensors, 'fixed sensor schemas');
}

export function verifyJapaneseContract(repositoryRoot = root) {
  const read = relative => fs.readFileSync(path.join(repositoryRoot, relative));
  const json = relative => JSON.parse(read(relative));
  const bytes = read('audit/fixtures/capability-oracle.json');
  assert.equal(sha(bytes), frozenFixtureSha256, 'independent capability/child oracle was changed');
  const oracle = JSON.parse(bytes);
  const results = [];
  const check = (id, fn) => { fn(); results.push({ id, status: 'PASS', scope: 'GA-STATIC' }); };

  let coverage;
  check('JAPANESE-CONTRACT/CURRENT-CAPABILITY-COVERAGE',()=>{coverage=verifyCapabilityContract(repositoryRoot);});

  // The fixture bytes are pinned above; completeness is the set relations below, not ledger counts.
  check('JAPANESE-CONTRACT/INDEPENDENT-ORACLE-COMPLETE', () => {
    const features = json('audit/manifests/features.json');
    const language = read('LANGUAGE.md').toString();
    unique(oracle.commands.map(c => c.id), 'oracle commands');
    unique(oracle.schemaIds, 'oracle schemas');
    unique(oracle.capabilities.map(c => c.id), 'oracle capabilities');
    sameSet(oracle.commands.map(c => 'command:' + c.id),
      oracle.capabilities.filter(c => c.id.startsWith('command:')).map(c => c.id), 'command capabilities');
    sameSet(Object.keys(oracle.limits).map(id => 'limit:' + id),
      oracle.capabilities.filter(c => c.id.startsWith('limit:')).map(c => c.id), 'limit capabilities');
    for (const capability of oracle.capabilities) {
      for (const key of ['capability', 'ast', 'cui', 'gui', 'semantic', 'runtime', 'selftest', 'browser', 'guarantee'])
        requiredText(capability[key], capability.id + '/' + key);
    }
    for (const [category, prefix] of [
      ['builtins', 'builtin'], ['fixedSensors', 'state'],
      ['argumentSensors', 'sensor'], ['operators', 'operator'], ['scopes', 'scope'],
    ]) {
      sameSet(oracle.categories[category], oracle.capabilities.filter(c => c.id.startsWith(prefix + ':')).map(c => c.id), category);
    }
    verifyOracleCurrentLists(oracle, features, language);
    for (const id of oracle.categories.argumentSensors)
      assert.ok(oracle.schemaIds.includes('SensorRead:' + id.slice('sensor:'.length)), id);
  });

  const corpus = json(corpusPath);
  const markdown = read(corpusMarkdownPath).toString();
  const protectedIntent = oracle.protectedChildIntent;
  const intentIds = Array.from({ length: 20 }, (_, i) => 'CI-' + String(i + 1).padStart(2, '0'));
  check('JAPANESE-CONTRACT/CHILD-INTENT-INDEPENDENCE-AND-MAPPING', () => {
    assert.equal(corpus.case_count, corpus.cases.length);
    assert.equal(protectedIntent.caseCount, protectedIntent.cases.length);
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
    protectedIntentDefinitions: corpus.cases.length, protectedAmbiguityOracles: corpus.cases.length,
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
