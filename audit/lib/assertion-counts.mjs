// How much each audit file checks (AUDIT.md「監査の変更ガード」). The calls that make a test fail are counted in every
// audit script: assert and its methods, the suites' ok, eq and reject, and Playwright's expect. A change that lowers the
// count of a file removes checks from it, and the change guard asks the owner's label for it, as for a removed test ID.
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

const checkers = new Set(['assert', 'ok', 'eq', 'reject', 'expect', 'rejects', 'failed', 'refused']);
const skip = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
export function assertionCount(text) {
  let ast;
  try { ast = parse(text, {sourceType: 'unambiguous', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, errorRecovery: true}); }
  catch { return null; }
  let count = 0;
  const visit = n => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression') {
      const c = n.callee;
      if (c.type === 'Identifier' && checkers.has(c.name)) count++;
      else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier' && c.object.name === 'assert') count++;
    }
    for (const key of Object.keys(n)) { if (skip.has(key)) continue; const v = n[key]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); }
  };
  visit(ast.program);
  return count;
}
// file -> count for the audit scripts of a tree, read through read(file).
export function assertionCounts(files, read) {
  return Object.fromEntries(files.filter(f => /^audit\/.*\.(?:m|c)?js$/.test(f)).sort().map(f => [f, assertionCount(read(f))]).filter(([, n]) => n !== null));
}
// Files whose count went down, or that are gone with checks in them.
export function weakenedFiles(before, after) {
  return Object.entries(before).filter(([file, n]) => n > 0 && (after[file] ?? 0) < n).map(([file, n]) => file + ': ' + n + ' -> ' + (after[file] ?? 0)).sort();
}
