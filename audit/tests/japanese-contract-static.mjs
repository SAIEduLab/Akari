import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// This audit deliberately imports no candidate parser, renderer or runtime.
// Its oracle was acquired from d961dd3 and the six documents at 84bbb8c.
// A changed oracle needs an explicit, reviewed contract change, never a refresh
// from candidate observations. Static success is not a product execution PASS.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baselineCommit = 'd961dd346e5b104e09e7f0dd342beb5c16174a36';
const documentCommit = '84bbb8cab6d747f796885a9f4b1d745ce87051b3';
const frozenFixtureSha256 = '35c7dabee4066a17fdd43fefe3c8f34ac30e4059087b0a46579574f2cda536f5';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const unique = (values, label) => assert.equal(new Set(values).size, values.length, label + ': duplicate');
const sameSet = (actual, expected, label) => {
  unique(actual, label);
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
};
const requiredText = (value, label) => assert.ok(typeof value === 'string' && value.trim(), label);
const rows = (text, letter) => {
  const section = text.split(new RegExp('^## 付録' + letter + ' ', 'm'))[1];
  assert.ok(section, 'missing appendix ' + letter);
  return section.split(/^## /m)[0].split(/\r?\n/)
    .filter(line => /^\| (?:`|CI-\d\d \|)/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
};
const unquote = value => value.replace(/^`|`$/g, '');

export function verifyJapaneseContract(repositoryRoot = root) {
  const read = relative => fs.readFileSync(path.join(repositoryRoot, relative));
  const json = relative => JSON.parse(read(relative));
  const bytes = read('audit/fixtures/1.0.2-baseline-capabilities.json');
  assert.equal(sha(bytes), frozenFixtureSha256, 'independent baseline/child oracle was changed');
  const baseline = JSON.parse(bytes);
  const results = [];
  const check = (id, fn) => { fn(); results.push({ id, status: 'PASS', scope: 'GA-STATIC' }); };

  check('JAPANESE-CONTRACT/SIX-DOCUMENT-HASHES', () => {
    assert.equal(baseline.baselineCommit, baselineCommit);
    assert.equal(baseline.documentCommit, documentCommit);
    sameSet(baseline.documentHashManifest.map(f => f.path), [
      '企画書.md', '仕様書.md', '設計書.md', 'traceability.json',
      'child-intent-corpus.json', 'child-intent-corpus.md',
    ].map(f => 'docs/1.0.2/' + f), 'six document paths');
    for (const source of baseline.documentHashManifest) {
      assert.equal(source.sourceCommit, documentCommit);
      assert.match(source.gitBlob, /^[a-f0-9]{40}$/);
      const document = read(source.path);
      assert.equal(document.length, source.bytes, source.path + ': bytes');
      assert.equal(sha(document), source.sha256, source.path + ': protected SHA256');
    }
  });

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
      assert.ok(Number.isInteger(capability.sourceLine));
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

  const trace = json('docs/1.0.2/traceability.json');
  const specification = read('docs/1.0.2/仕様書.md').toString();
  check('JAPANESE-CONTRACT/TRACEABILITY-APPENDICES-A-D', () => {
    assert.equal(trace.baseline_commit, baselineCommit);
    assert.equal(trace.status, 'DESIGN_CANDIDATE_NOT_IMPLEMENTED');
    assert.deepEqual(trace.counts, { commands: 74, baseline_schemas: 153, capabilities: 260, limits: 38 });
    sameSet(trace.baseline_commands.map(c => c.id), baseline.commands.map(c => c.id), 'mapped commands');
    sameSet(trace.baseline_schema_mapping.map(c => c.baseline_schema), baseline.schemaIds, 'mapped schemas');
    sameSet(trace.required_capabilities.map(c => c.baseline_capability), baseline.capabilities.map(c => c.id), 'mapped capabilities');
    const a = rows(specification, 'A'), b = rows(specification, 'B'), c = rows(specification, 'C'), d = rows(specification, 'D');
    sameSet(a.map(r => unquote(r[0])), baseline.commands.map(c => c.id), 'appendix A');
    sameSet(b.map(r => unquote(r[0])), baseline.schemaIds, 'appendix B');
    sameSet(c.map(r => unquote(r[0])), baseline.capabilities.map(c => c.id), 'appendix C');
    sameSet(d.map(r => unquote(r[0])), Object.keys(baseline.limits), 'appendix D');
    for (const [id, value] of d) assert.equal(Number(value), baseline.limits[unquote(id)], 'limit value ' + id);
    for (const item of trace.baseline_commands) {
      const row = a.find(r => unquote(r[0]) === item.id);
      assert.equal(row[1], item.before, item.id + ': old source');
      assert.equal(row[2], item.new, item.id + ': mapped source');
      assert.equal(item.test_id, 'MAP-CMD-' + item.id);
      assert.equal(row[3], '`' + item.test_id + '` 未実施');
    }
    for (const item of trace.baseline_schema_mapping) {
      const row = b.find(r => unquote(r[0]) === item.baseline_schema);
      assert.equal(row[2], item.new_surface_contract);
      assert.equal(item.test_id, 'MAP-SCHEMA-' + item.baseline_schema);
      assert.equal(row[3], '`' + item.test_id + '` 未実施');
    }
    for (const item of trace.required_capabilities) {
      const row = c.find(r => unquote(r[0]) === item.baseline_capability);
      const frozen = baseline.capabilities.find(c => c.id === item.baseline_capability);
      assert.equal(item.capability, frozen.capability, item.baseline_capability + ': old meaning');
      assert.equal(row[1], item.capability);
      assert.equal(row[2], item.contract);
      assert.equal(item.test_id, 'CAP-' + item.baseline_capability);
      assert.equal(row[3], '`' + item.test_id + '` 未実施');
    }
    const mappings = [...trace.baseline_commands, ...trace.baseline_schema_mapping, ...trace.required_capabilities];
    unique(mappings.map(c => c.test_id), 'all mapping test IDs');
    for (const item of mappings) assert.equal(item.status, 'NOT_RUN', item.test_id);
    assert.equal(trace.new_contracts.length, 11);
    for (const contract of trace.new_contracts) {
      requiredText(contract.contract, 'new contract');
      assert.equal(contract.status, 'NOT_RUN');
    }
  });

  const corpus = json('docs/1.0.2/child-intent-corpus.json');
  const markdown = read('docs/1.0.2/child-intent-corpus.md').toString();
  const protectedIntent = baseline.protectedChildIntent;
  const intentIds = Array.from({ length: 20 }, (_, i) => 'CI-' + String(i + 1).padStart(2, '0'));
  check('JAPANESE-CONTRACT/CHILD-INTENT-INDEPENDENCE-AND-MAPPING', () => {
    assert.equal(protectedIntent.sourceCommit, documentCommit);
    assert.equal(corpus.case_count, 20);
    assert.equal(protectedIntent.caseCount, 20);
    assert.equal(corpus.provenance, protectedIntent.provenance);
    assert.equal(corpus.independence, protectedIntent.independence);
    assert.match(corpus.provenance, /not observed, collected, or validated real-child data/);
    assert.deepEqual(corpus.cases, protectedIntent.cases, 'child input/expected oracle is read-only');
    sameSet(corpus.cases.map(c => c.id), intentIds, 'child case IDs');
    sameSet(trace.intent_corpus.ids, intentIds, 'trace child IDs');
    assert.equal(trace.intent_corpus.status, 'NOT_RUN');
    assert.equal(trace.intent_corpus.mapping, '仕様書.md 付録E');
    const e = rows(specification, 'E').map(([id, intent, route, acceptance]) => ({ id, intent, route, acceptance }));
    assert.deepEqual(e, protectedIntent.mappings, 'appendix E must preserve independent intended meaning');
    sameSet(e.map(c => c.id), intentIds, 'appendix E IDs');
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

  const migration = json('audit/fixtures/language-v2-test-migration.json');
  check('JAPANESE-CONTRACT/LEGACY-TEST-MIGRATION-NON-WEAKENING', () => {
    assert.equal(migration.baselineCommit, baselineCommit);
    assert.equal(migration.candidateDesignCommit, documentCommit);
    assert.equal(migration.status, 'pending');
    assert.deepEqual(migration.counts, baseline.migrationAuthority.counts);
    assert.equal(migration.entries.length, 2277);
    assert.equal(sha(JSON.stringify(migration.entries.map(e => [e.family, e.kind || 'test', e.existingCaseId, e.newTestId]))),
      baseline.migrationAuthority.stableIdentitySha256, 'existing stable IDs were deleted or repurposed');
    assert.equal(sha(JSON.stringify(migration.sourcePins)), baseline.migrationAuthority.sourcePinsSha256, 'legacy oracle pins changed');
    const counts = {
      formDefinitions: migration.entries.filter(e => e.family === 'forms' && e.kind === 'form-definition').length,
      finiteInputs: migration.entries.filter(e => e.family === 'forms' && e.kind === 'finite-input').length,
      languageTests: migration.entries.filter(e => e.family === 'language').length,
      productTests: migration.entries.filter(e => e.family === 'product').length,
      editorTests: migration.entries.filter(e => e.family === 'editor').length,
      guiTests: migration.entries.filter(e => e.family === 'gui').length,
      browserTasks: migration.entries.filter(e => e.family === 'browser' && e.kind === 'task').length,
      browserCases: migration.entries.filter(e => e.family === 'browser' && e.kind === 'case').length,
    };
    assert.deepEqual(counts, migration.counts);
    unique(migration.entries.map(e => e.family + '/' + e.existingCaseId), 'legacy identity');
    unique(migration.entries.map(e => e.newTestId), 'new test identity');
    const pins = new Map(migration.sourcePins.map(p => [p.path, p]));
    for (const pin of pins.values()) {
      assert.equal(pin.sourceCommit, baselineCommit);
      const currentHash = sha(read(pin.path));
      if (currentHash !== pin.sha256) {
        const revision = (migration.revisions || []).find(r => r.path === pin.path);
        assert.ok(revision, 'changed legacy input requires an explicit migration: ' + pin.path);
        assert.equal(revision.originalSha256, pin.sha256);
        assert.equal(sha(read(revision.preservedSourcePath)), pin.sha256, 'old oracle was not preserved');
        assert.equal(revision.candidateSha256, currentHash, 'migration does not describe current test source');
        assert.equal(revision.kind, 'syntax-and-approved-contract-migration');
        const ledger = json(revision.ledgerPath);
        assert.ok(Array.isArray(ledger.changes) && ledger.changes.length > 0, 'missing per-input migration');
        for (const change of ledger.changes) {
          requiredText(change.testId, 'migration test ID');
          requiredText(change.preservedMeaning, 'migration preserved meaning');
          assert.equal(typeof change.oldText, 'string');
          assert.equal(typeof change.newText, 'string');
        }
      }
    }
    for (const entry of migration.entries) {
      assert.equal(entry.status, 'pending', entry.existingCaseId + ': no PASS promise');
      assert.equal(entry.executionEvidenceStatus, 'NOT_RUN');
      assert.deepEqual(entry.existingCaseIDs, [entry.existingCaseId]);
      requiredText(entry.oldExpectedMeaningRoute, entry.existingCaseId + '/meaning route');
      assert.ok(entry.sourceEvidencePaths.length > 0);
      for (const p of entry.sourceEvidencePaths) assert.ok(pins.has(p), 'unpinned old oracle: ' + p);
      assert.ok(entry.executionEvidencePaths.length > 0);
      for (const p of entry.executionEvidencePaths) assert.ok(p.startsWith('audit-evidence/'), 'missing evidence path');
    }
  });

  return {
    schema: 'akari-japanese-contract-static-report-v1', scope: 'GA-STATIC', status: 'PASS',
    baselineCommit, documentCommit, fixtureSha256: frozenFixtureSha256,
    documentHashes: baseline.documentHashManifest, results, total: results.length,
    protectedIntentDefinitions: 20, protectedAmbiguityOracles: 20,
    migrationEntries: migration.entries.length, legacyCoverage: migration.counts,
    productDynamic: { status: 'NOT_RUN', reason: 'The new product parser is not implemented; no candidate product was imported or executed by this static audit.' },
    semanticReview: { status: 'NOT_RUN', reason: 'Presence and immutable provenance do not prove implementation, UI behavior, bidirectionality or child validation.' },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = verifyJapaneseContract();
  // Optional evidence goes only to a fresh explicitly requested path.
  if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}
