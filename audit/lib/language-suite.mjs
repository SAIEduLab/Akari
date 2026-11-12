// The language forms suite (audit/suites/language-forms.js) and its inputs, for the language tests and for the coverage
// run (audit/lib/node-coverage.mjs), which runs it in node against the product API.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {root} from './product-test-host.mjs';

const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
// The fixtures are the tree's own: loading this module (the change guard does, with its own code from the base) runs
// none of them. The regression project is read as text (the suite runs it), and the inline cases are loaded only where
// the suite is made (the language tests, and the guard's children that run it).
const regressionProjectText = () => {
  const text = fs.readFileSync(path.join(root, 'audit/fixtures/regression-project.cjs'), 'utf8');
  const start = text.indexOf('function makeAkariRegressionProject('), end = text.indexOf('\nif (typeof module');
  if (start < 0 || end < start) throw Error('audit/fixtures/regression-project.cjs: makeAkariRegressionProject not found');
  return text.slice(start, end).trimEnd();
};
// {suite, args}: the suite's text, and the arguments runLanguageForms takes after the API, by name.
export function languageSuite() {
  const {inlineCases, inlineNegative} = createRequire(import.meta.url)('../fixtures/language/inline.mjs');
  const suite = '// Explicit baseline regression fixture.\n' + regressionProjectText() + '\n' + fs.readFileSync(path.join(root, 'audit/suites/language-forms.js'), 'utf8');
  const {golden, corpus: referenceCorpus, schemaIds} = json('audit/fixtures/language/expected.json');
  return {suite, args: {manifest: json('audit/manifests/language-form-coverage.json'), golden, referenceCorpus, schemaIds, inlineCases, inlineNegative}};
}
export const languageArgs = ({manifest, golden, referenceCorpus, schemaIds, inlineCases, inlineNegative}) => [manifest, golden, referenceCorpus, schemaIds, inlineCases, inlineNegative];
// The suite's report for a product API in this process.
export function runLanguageInNode(api, {suite, args} = languageSuite()) {
  const {runLanguageForms} = vm.runInNewContext(suite + '\n({runLanguageForms})', {structuredClone});
  return runLanguageForms(api, ...languageArgs(args));
}
