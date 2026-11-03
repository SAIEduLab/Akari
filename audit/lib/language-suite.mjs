// The language forms suite (audit/suites/language-forms.js) and its inputs, for the language tests and for the change
// guard's coverage and mutants, which run it in node against the product API.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import regressionFixture from '../fixtures/regression-project.cjs';
import {inlineCases, inlineNegative} from '../fixtures/language/inline.mjs';
import {root} from './product-test-host.mjs';

const json = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
// {suite, args}: the suite's text, and the arguments runLanguageForms takes after the API, by name.
export function languageSuite() {
  const suite = '// Explicit baseline regression fixture.\n' + regressionFixture.makeRegressionProject.toString() + '\n' + fs.readFileSync(path.join(root, 'audit/suites/language-forms.js'), 'utf8');
  const {golden, corpus: referenceCorpus, schemaIds} = json('audit/fixtures/language/expected.json');
  return {suite, args: {manifest: json('audit/manifests/language-form-coverage.json'), golden, referenceCorpus, schemaIds, inlineCases, inlineNegative}};
}
export const languageArgs = ({manifest, golden, referenceCorpus, schemaIds, inlineCases, inlineNegative}) => [manifest, golden, referenceCorpus, schemaIds, inlineCases, inlineNegative];
// The suite's report for a product API in this process.
export function runLanguageInNode(api, {suite, args} = languageSuite()) {
  const {runLanguageForms} = vm.runInNewContext(suite + '\n({runLanguageForms})', {structuredClone});
  return runLanguageForms(api, ...languageArgs(args));
}
