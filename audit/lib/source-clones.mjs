// Repeated code in the product script (AUDIT.md「ソースの一致」). The script is read as tokens; a run of CLONE_TOKENS
// tokens that appears at two places or more, outside the portable extensions, is a clone. Overlapping runs of one
// repetition are one clone, named by the hash of its first run. CLONE_BASELINE holds the clones there were when this
// check began, each with what it repeats; it can only shrink. A new clone, or a listed one that is gone, is refused.
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {lineMap} from './node-coverage.mjs';
const require = createRequire(import.meta.url);
const {parse} = require('@babel/parser');

// 100 tokens is about ten lines. Measured on the product: 120 repetitions at 50 tokens, 21 at 80, 6 at 100, 3 at 150;
// below 100 they are mostly sample data and argument shapes written alike, from 100 on code copied over several lines.
export const CLONE_TOKENS = 100;
export const CLONE_BASELINE = Object.freeze([
  {id: '470ed2ca3bd472ac', what: 'the plain and the step-by-step evaluator of one statement kind (01-runtime-model), kept as a pair'},
  {id: '6aae4312a9ba0f5c', what: 'the plain and the step-by-step evaluator of one statement kind (01-runtime-model), kept as a pair'},
  {id: 'ea7a3140784851c7', what: 'the plain and the step-by-step evaluator of one statement kind (01-runtime-model), kept as a pair'},
  {id: 'ddd12a913e873f9d', what: 'the names of the work gathered twice in 04-syntax-sentences, once with the parts and once without'},
  {id: 'cc82e9de00c3f52f', what: 'the pointer set-up of the move and the resize drags in 11-app-commands'},
  {id: 'dacc0493b974109a', what: 'the ending of the move and the resize drags in 11-app-commands'},
]);

export function sourceClones(text, pieces, size = CLONE_TOKENS) {
  const ast = parse(text, {sourceType: 'script', allowReturnOutsideFunction: true, tokens: true});
  const own = pieces.filter(p => !p.host);
  const where = lineMap(text, pieces), fileOf = offset => own.find(p => p.start <= offset && offset < p.end)?.label ?? null;
  const tokens = ast.tokens.filter(t => t.type.label !== 'eof' && fileOf(t.start));
  const words = tokens.map(t => text.slice(t.start, t.end));
  const at = new Map();
  for (let i = 0; i + size <= words.length; i++) {
    const key = crypto.createHash('sha256').update(words.slice(i, i + size).join('\u0001')).digest('hex').slice(0, 16);
    if (!at.has(key)) at.set(key, []);
    at.get(key).push(i);
  }
  // A window repeated at places that do not overlap each other; consecutive windows of one repetition merge.
  const repeated = [...at].filter(([, starts]) => starts.length > 1 && starts.some((s, i) => i && s - starts[i - 1] >= size));
  const byFirst = new Map(repeated.map(([key, starts]) => [starts[0], {key, starts}]));
  const clones = [];
  for (const [first, entry] of [...byFirst].sort((a, b) => a[0] - b[0])) {
    const previous = byFirst.get(first - 1);
    if (previous && previous.starts.length === entry.starts.length && previous.starts.every((s, i) => s + 1 === entry.starts[i])) { entry.clone = previous.clone; entry.clone.length++; continue; }
    entry.clone = {id: entry.key, places: entry.starts.map(s => where(tokens[s].start).join(':')), length: size};
    clones.push(entry.clone);
  }
  return clones;
}

export function cloneIssues(clones, baseline = CLONE_BASELINE) {
  const listed = new Set(baseline.map(b => b.id)), found = new Set(clones.map(c => c.id)), issues = [];
  for (const c of clones) if (!listed.has(c.id)) issues.push('clone ' + c.id + ' of ' + (c.length + CLONE_TOKENS - 1) + ' tokens at ' + c.places.join(', '));
  for (const b of baseline) if (!found.has(b.id)) issues.push('baseline clone ' + b.id + ' (' + b.what + ') is gone; remove it');
  return issues;
}
