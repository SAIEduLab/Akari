import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {languageFileForVersion} from './product-path.cjs';
import {languageLinks} from './language-release.mjs';

// The publication inventory is exactly the tracked tree; tracked documents name only the current release.
export const publicationIds = {
  inventory: [
    'INVENTORY-EQUALS-TRACKED',
    'REJECT-LISTED-UNTRACKED',
    'REJECT-TRACKED-UNLISTED',
    'REJECT-DUPLICATE-LISTED',
    'REJECT-NO-REPOSITORY',
    'REJECT-REPOSITORY-SUBDIRECTORY',
    'REJECT-BROKEN-REPOSITORY',
    'REJECT-INCOMPLETE-REPORT',
  ],
  documents: [
    'DOCUMENTS-NAME-CURRENT-RELEASE',
    'ACCEPT-CURRENT-RELEASE-AND-TOOL-VERSIONS',
    'REJECT-RETIRED-PRODUCT-FILE',
    'REJECT-OTHER-RELEASE-LABEL',
    'REJECT-INCOMPLETE-REPORT',
  ],
};
const schemas = {inventory: 'akari-publication-inventory-v1', documents: 'akari-document-releases-v1'};

// Files tracked by the checkout at root. A root without its own .git fails; it never falls back to a parent or skips.
export function trackedFiles(root) {
  assert.ok(fs.existsSync(path.join(root, '.git')), 'publication inventory needs a git checkout; no .git at ' + root);
  // Repository variables from the caller's environment would point git at another tree.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE|COMMON_DIR)$/.test(key)));
  const git = (...args) => {
    const r = cp.spawnSync('git', ['-C', root, ...args], {encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024});
    assert.equal(r.status, 0, 'git ' + args.join(' ') + ' failed: ' + (r.error ? r.error.message : r.stderr.trim()));
    return r.stdout;
  };
  assert.equal(fs.realpathSync.native(git('rev-parse', '--show-toplevel').trim()), fs.realpathSync.native(root), 'checkout root');
  return git('ls-files', '-z').split('\0').filter(Boolean);
}

// Both directions: every listed file is tracked, every tracked file is listed, and no entry repeats.
export function assertInventoryMatches(listed, tracked) {
  const repeated = listed.filter((file, i) => listed.indexOf(file) !== i);
  const untracked = listed.filter(file => !tracked.includes(file));
  const unlisted = tracked.filter(file => !listed.includes(file));
  if (repeated.length || untracked.length || unlisted.length)
    throw Error('audit/public-files.json must list exactly the tracked files: ' + JSON.stringify({repeated, untracked, unlisted}));
}

// A versioned product file name, and a three-part version that is not part of a longer dotted number.
const productName = /Akari_?\d+_\d+_\d+\.html/g;
const versionNumber = /(?<![\d.])\d+\.\d+\.\d+(?!\d|\.\d)/g;
// Pinned external tools are written as package@x.y.z or after the tool's name; those are not Akari releases.
const toolPrefix = /(?:@|\b(?:Playwright|jsdom|Chrome for Testing|Chrome|Chromium|Node\.js|Python)\s+)$/i;

export function releaseNameViolations(file, text, {productFile, productVersion}) {
  const violations = [];
  const lineOf = index => text.slice(0, index).split('\n').length;
  const languageFile=languageFileForVersion(productVersion);
  if(/^LANGUAGE(?:_\d+_\d+_\d+)?\.md$/.test(file)&&file!==languageFile)
    violations.push({file,line:1,found:file,expected:languageFile});
  for(const row of languageLinks(file,text))if(row.resolved!==languageFile)
    violations.push({file,line:lineOf(row.at),found:row.target,expected:languageFile});
  for (const m of text.matchAll(productName))
    if (m[0] !== productFile) violations.push({file, line: lineOf(m.index), found: m[0], expected: productFile});
  for (const m of text.matchAll(versionNumber))
    if (m[0] !== productVersion && !toolPrefix.test(text.slice(Math.max(0, m.index - 40), m.index)))
      violations.push({file, line: lineOf(m.index), found: m[0], expected: productVersion});
  return violations;
}

export const isDocument = file => /\.(md|html)$/.test(file);

export function verifyPublicationReport(report, mode, inputs) {
  assert.ok(mode in publicationIds, 'publication check mode');
  assert.equal(report.schema, schemas[mode]);
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.results.map(r => r.id), publicationIds[mode]);
  for (const r of report.results) { assert.equal(r.status, 'PASS', r.id); assert.ok(!r.error, r.id); }
  if (mode === 'documents') { assert.ok(report.documents.length > 0); assert.deepEqual(report.violations, []); }
  else assert.ok(report.tracked > 0);
  return true;
}

// The validator itself must refuse an incomplete or failed report.
export function checkPublicationValidatorNegatives(mode) {
  const inputs = {productSha256: 'fixture', inputSha256: 'fixture'};
  const valid = {schema: schemas[mode], status: 'PASS', snapshot: inputs, results: publicationIds[mode].map(id => ({id, status: 'PASS'})), ...(mode === 'documents' ? {documents: ['README.md'], violations: []} : {tracked: 1})};
  verifyPublicationReport(valid, mode, inputs);
  const mutations = [
    r => { r.status = 'FAIL'; }, r => { r.schema = 'other'; }, r => { r.snapshot.productSha256 = 'wrong'; },
    r => { r.results.pop(); }, r => { r.results.push({...r.results[0]}); }, r => { r.results.reverse(); },
    r => { r.results[0].status = 'FAIL'; }, r => { r.results[0].error = 'exception'; },
    ...(mode === 'documents' ? [r => { r.violations.push({file: 'README.md'}); }, r => { r.documents = []; }] : [r => { r.tracked = 0; }]),
  ];
  for (const mutate of mutations) { const report = structuredClone(valid); mutate(report); assert.throws(() => verifyPublicationReport(report, mode, inputs)); }
  assert.throws(() => verifyPublicationReport(valid, mode === 'documents' ? 'inventory' : 'documents', inputs));
}
