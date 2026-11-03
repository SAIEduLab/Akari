// Moves between src/js files (AUDIT.md「移動だけの変更」). A statement of the product closure (a function, or a
// declaration with its names) that leaves one file for another in a change keeps its text, apart from spacing and
// comments: a move and an edit of the same statement are two changes, so that a move cannot carry an edit no one reviews.
import {createRequire} from 'node:module';
import {productScript} from './source-boundaries.mjs';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

const tokenText = (text, tokens, start, end) => tokens.filter(t => t.start >= start && t.end <= end).map(t => text.slice(t.start, t.end)).join(' ');
function declaredNames(statement) {
  if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') return statement.id ? [statement.id.name] : [];
  if (statement.type === 'VariableDeclaration') return statement.declarations.flatMap(d => d.id.type === 'Identifier' ? [d.id.name] : []);
  return [];
}

// name -> {file, shape} for every statement of the closure that declares exactly one name. The script is the product
// script as the build joins it (productScript), read once; each statement belongs to the src file its start lies in.
export function unitsByName(read) {
  const {text, pieces} = productScript(read);
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true, tokens: true});
  const top = ast.program.body.find(s => s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' &&
    ['ArrowFunctionExpression', 'FunctionExpression'].includes(s.expression.callee.type));
  if (!top) return new Map(); // a script with no closure (a synthetic test product) has no statements to compare
  const tokens = ast.tokens, out = new Map(), seen = new Set();
  for (const statement of top.expression.callee.body.body) {
    const names = declaredNames(statement);
    if (names.length !== 1) continue;
    const [name] = names, piece = pieces.find(p => p.start <= statement.start && statement.start < p.end);
    if (seen.has(name)) { out.delete(name); continue; }
    seen.add(name); out.set(name, {file: piece?.label ?? '?', shape: tokenText(text, tokens, statement.start, statement.end)});
  }
  return out;
}

// Statements that moved to another file, and those of them whose text changed too.
export function sourceMoves(before, after) {
  const moved = [], movedAndChanged = [];
  for (const [name, a] of after) {
    const b = before.get(name);
    if (!b || b.file === a.file) continue;
    moved.push(name + ': ' + b.file + ' -> ' + a.file);
    if (b.shape !== a.shape) movedAndChanged.push(name + ': ' + b.file + ' -> ' + a.file);
  }
  return {moved: moved.sort(), movedAndChanged: movedAndChanged.sort()};
}
