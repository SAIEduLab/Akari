import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

// The committed product must be exactly the build of src/; negatives prove the check can fail.
export const productSourceIds = [
  'PRODUCT-SOURCE-BYTES',
  'PRODUCT-SOURCE-COMPLETE',
  'PRODUCT-SOURCE-PORTABLE-EXTENSIONS',
  'REJECT-CHANGED-SOURCE',
  'REJECT-CHANGED-EXTENSION',
  'REJECT-UNINCLUDED-SOURCE',
  'REJECT-DUPLICATE-INCLUDE',
  'REJECT-MALFORMED-DIRECTIVE',
  'REJECT-ALIAS-DUPLICATE-INCLUDE',
  'REJECT-INCLUDE-OUTSIDE-SOURCE',
  'REJECT-INCLUDE-ALIAS',
  'REJECT-UNLISTED-PORTABLE',
  'REJECT-UNEMBEDDED-PORTABLE',
  'CHILD-GLOSSARY-ONE-WORD',
  'REJECT-BANNED-CHILD-WORD',
];

// F-23 (final calls 19, 20, 23; LANGUAGE.md 子ども向けの言葉): the child screens and the manuals use one word per idea.
// The other words for the same idea are never written there. Each row: the banned variant, the word that is used.
export const childGlossaryBanned = Object.freeze([
  ['できごと', /できごと/, 'きっかけ'], ['なおす動き', /なおす\s*動き/, 'きっかけ'],
  ['作業欄', /作業欄/, '作業台'], ['組み立てる ばしょ', /組み立てる\s*ばしょ/, '作業台'], ['作る ばしょ', /作る\s*ばしょ/, '作業台'],
  ['自動で のこす', /自動で\s*のこす/, 'このパソコンに のこす'], ['自動保存', /自動保存/, 'このパソコンに のこす'],
  ['キャラ', /キャラ(?!クター)/, 'キャラクター'], ['命令一覧', /命令一覧/, 'ブロックの一覧'], ['使うブロック', /使うブロック/, 'ブロックの一覧'],
  ['名人モード', /名人モード/, '名人'],
]);
// What the scan leaves out, each for its own reason:
// - a code name: the extension expressions 拡張「…」 are written in the code as EXTENSIONS.md and LANGUAGE.md define them
//   (拡張「できごとの値」); they are taken out of a string before it is scanned;
// - the portable extension files embedded in the product (extensions/foundation.js, profiles.js): the interface for fork
//   developers, written in EXTENSIONS.md's words (passed as `embedded`);
// - these whole strings, which no child screen shows: the saved file's section heading is the work file format that the
//   reader reads back, and the autosave database errors are internal (every caller catches them and shows
//   「このパソコンに のこせなかったよ…」 instead).
export const childGlossaryNotScreenText = Object.freeze(['## できごとのコード',
  '他の画面が自動保存DBを使用中です', '自動保存DBを開けません', '自動保存DBの応答がありません']);
const codeNames = text => text.replace(/拡張「[^「」\n]*」/g, '');
const markupText = html => html.replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
// Every string the script can show: string literals and template text, read with the pinned parser (not comments),
// with their places in the script.
function scriptStrings(text) {
  const {parse} = createRequire(import.meta.url)('@babel/parser');
  const out = [], stack = [parse(text, {sourceType: 'script', allowReturnOutsideFunction: true})];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) { for (const n of node) stack.push(n); continue; }
    if (!node || typeof node.type !== 'string') continue;
    if (node.type === 'StringLiteral') out.push({at: node.start, text: node.value});
    else if (node.type === 'TemplateElement') out.push({at: node.start, text: node.value.cooked ?? node.value.raw});
    for (const key of Object.keys(node)) if (!['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) {
      const v = node[key]; if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
// files: [{file, kind: 'product' | 'html' | 'script', text, embedded}]. A product is its markup plus its one script;
// `embedded` lists the texts of files built into that script that the scan leaves out.
export function childGlossaryIssues(files) {
  const issues = [];
  const scan = (file, text) => {
    if (childGlossaryNotScreenText.includes(text)) return;
    const t = codeNames(text);
    for (const [word, re] of childGlossaryBanned) { const m = t.match(new RegExp('.{0,30}' + re.source + '.{0,30}', 'u')); if (m) issues.push({file, word, text: m[0]}); }
  };
  const strings = (file, script, embedded = []) => {
    const skip = embedded.map(text => { const at = script.indexOf(text); assert.ok(text && at >= 0, file + ' embeds the file it leaves out'); return [at, at + text.length]; });
    for (const s of scriptStrings(script)) if (!skip.some(([from, to]) => s.at >= from && s.at < to)) scan(file, s.text);
  };
  for (const {file, kind, text, embedded} of files) {
    if (kind === 'product') {
      const open = text.indexOf('<script>'), close = text.lastIndexOf('</script>');
      assert.ok(open >= 0 && close > open, file + ' has its script');
      scan(file, markupText(text.slice(0, open) + text.slice(close + 9)));
      strings(file, text.slice(open + 8, close), embedded);
    } else if (kind === 'script') strings(file, text, embedded);
    else scan(file, markupText(text));
  }
  return issues;
}

export function verifyProductSource(report, inputs) {
  assert.equal(report.schema, 'akari-product-source-v1');
  assert.equal(report.status, 'PASS');
  assert.deepEqual(report.snapshot, inputs);
  assert.deepEqual(report.results.map(r => r.id), productSourceIds);
  for (const r of report.results) assert.equal(r.status, 'PASS', r.id);
  assert.equal(report.productSha256, inputs.productSha256);
  assert.equal(report.buildSha256, inputs.productSha256);
  assert.ok(report.sources.includes('src/akari.html'));
  return true;
}
