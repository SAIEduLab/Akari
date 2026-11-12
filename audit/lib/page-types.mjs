// The elements of the editor's page (src/types/page.d.ts), made from the page (src/akari.html) and the selectors the
// application writes for its page finder `$` (src/ts/11-*.ts, `$('…')` and `appCalls.$('…')`; the exported player has
// a page and a finder of its own): each id of the page, and
// each other selector written that finds one element of the page, with the class of that element. A selector written
// that finds nothing in the page names an element the application makes itself, and must be in MADE_BY_SCRIPT; `$`
// reads it, and any selector put together, as HTMLElement | null.
//   node audit/lib/page-types.mjs          fail unless src/types/page.d.ts is what the page and the sources make
//   node audit/lib/page-types.mjs --write  write it
// product-source checks it at each run (PAGE-TYPES).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
export const pageTypesFile = 'src/types/page.d.ts';
export const pageFile = 'src/akari.html';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// The elements the application makes and finds by a written selector (not in the page as it is loaded).
export const MADE_BY_SCRIPT = Object.freeze([
  '#blockEditor .blockui-current', '#blockEditor .blockui-selected', '#blockEditor .blockui-workspace', '#blockEditor .blockui-world',
  '#blockEditor [data-blockui-action="workspace-expand"]', '#componentActions', '#componentControls', '#componentPickerCore',
  '#hintsDisclosure', '#listRepairPanel', '.objects-window', '.objects-window > .win-title', '.project-tools', '.prop-actions',
  '.properties-window',
]);

// The selectors written as text for `$` in the sources ({file: text}): a written text, or either text of a choice
// between two; each with where it is written.
export function writtenSelectors(sources) {
  const ts = require('typescript'), found = new Map();
  for (const [file, text] of Object.entries(sources)) {
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const collect = (node, at) => {
      if (ts.isStringLiteralLike(node)) { if (!found.has(node.text)) found.set(node.text, []); found.get(node.text).push(at); }
      else if (ts.isConditionalExpression(node)) { collect(node.whenTrue, at); collect(node.whenFalse, at); }
      else if (ts.isParenthesizedExpression(node)) collect(node.expression, at);
    };
    const visit = node => {
      if (ts.isCallExpression(node) && node.arguments.length && (ts.isIdentifier(node.expression) && node.expression.text === '$' ||
        ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === '$'))
        collect(node.arguments[0], file + ':' + (sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1));
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return found;
}

// The text of src/types/page.d.ts for the page (its HTML) and the sources; a page or a selector the map cannot be
// made from is refused with its reason.
export function pageTypes(html, sources, made = MADE_BY_SCRIPT) {
  const {JSDOM} = require('jsdom'), doc = new JSDOM(html).window.document, entries = new Map(), problems = [];
  const kind = element => {
    const name = element.constructor.name;
    if (!/^HTML\w*Element$/.test(name) || name === 'HTMLUnknownElement') problems.push('<' + element.tagName.toLowerCase() + '> is no element of HTML');
    return name;
  };
  for (const element of doc.querySelectorAll('[id]')) {
    const key = '#' + element.id;
    if (!/^#[A-Za-z][\w-]*$/.test(key)) problems.push('the id ' + JSON.stringify(element.id) + ' is not written as a selector');
    else if (entries.has(key)) problems.push('two elements have the id ' + element.id);
    else entries.set(key, kind(element));
  }
  const written = writtenSelectors(sources);
  for (const [selector, at] of written) {
    if (entries.has(selector)) continue;
    let matches;
    try { matches = doc.querySelectorAll(selector); } catch (_) { problems.push(at[0] + ': the selector ' + JSON.stringify(selector) + ' is not one'); continue; }
    if (matches.length > 1) problems.push(at[0] + ': ' + JSON.stringify(selector) + ' finds ' + matches.length + ' elements of the page');
    else if (matches.length === 1) entries.set(selector, kind(matches[0]));
    else if (!made.includes(selector)) problems.push(at[0] + ': ' + JSON.stringify(selector) + ' finds nothing in the page and is not in MADE_BY_SCRIPT');
  }
  for (const selector of made)
    if (!written.has(selector)) problems.push('MADE_BY_SCRIPT names ' + JSON.stringify(selector) + ', which no source writes');
    else if (entries.has(selector)) problems.push('MADE_BY_SCRIPT names ' + JSON.stringify(selector) + ', which the page has');
  if (problems.length) throw Error('src/types/page.d.ts cannot be made:\n  ' + problems.join('\n  '));
  return [
    '// The elements of the editor\'s page (src/akari.html) the application finds with `$`, by the selector it writes: each',
    '// id of the page, and each other selector written that finds one element. Made by audit/lib/page-types.mjs from the',
    '// page and the sources; do not edit: `node audit/lib/page-types.mjs --write`. Types only; the product holds none of this.',
    'export interface PageElements {',
    ...[...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([selector, type]) => '  ' + JSON.stringify(selector) + ': ' + type + ';'),
    '}',
    '// The element a selector finds: the page\'s, or for a selector not here (an element the application makes, a',
    '// selector put together) an element of HTML or none.',
    'export type PageElement<S extends string> = S extends keyof PageElements ? PageElements[S] : HTMLElement | null;',
    'export type PageFinder = <S extends string>(selector: S) => PageElement<S>;',
    '',
  ].join('\n');
}

// The page and the application's sources in the repository.
export function repositoryPage() {
  const dir = path.join(root, 'src/ts'), sources = {};
  for (const name of fs.readdirSync(dir).filter(name => /^11-.*\.ts$/.test(name)).sort()) sources['src/ts/' + name] = fs.readFileSync(path.join(dir, name), 'utf8');
  return {html: fs.readFileSync(path.join(root, pageFile), 'utf8'), sources};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {html, sources} = repositoryPage(), text = pageTypes(html, sources), file = path.join(root, pageTypesFile);
  if (process.argv.includes('--write')) { fs.writeFileSync(file, text); console.log('Wrote ' + pageTypesFile); }
  else if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) { console.error(pageTypesFile + ' is not what the page and the sources make: run node audit/lib/page-types.mjs --write'); process.exitCode = 1; }
  else console.log(pageTypesFile + ': as the page and the sources make it');
}
