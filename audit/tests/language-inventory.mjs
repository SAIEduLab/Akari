import fs from 'node:fs';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {loadApi, sha} from '../browser/legacy/audit-lib.cjs';
import {finiteCases} from '../fixtures/language/forms.mjs';
const baseline = '05789beae52221fb8aa259f1de0f778c236afbf9';
const html = cp.execFileSync('git', ['show', baseline + ':Akari.html'], {maxBuffer: 4e6}).toString('utf8');
const api = loadApi(html);
const semantic = value => JSON.parse(JSON.stringify(value, (k,v) => ['source','sourceSpan','endLine','raw'].includes(k) ? undefined : v));
const rows = finiteCases.map(c => {
  const actual = api.parseSyntax(c.source), standard = api.parseSyntax(c.canonical);
  assert.ok(standard.ast, JSON.stringify({c, diagnostics:standard.syntaxDiagnostics}));
  const documented = ['JPF-001','JPF-002'].includes(c.id) || c.source.replace(/。/g,'').replace(/繰り返す/g,'くり返す') === c.canonical;
  return {...c, designStatus:'adopted', documentedStatus: documented ? 'documented-standard-or-spelling' : 'design-proposal',
    decision:c.phase===3 ? 'phase3-scheduled' : c.transition ? 'approved-specification-replacement' : actual.ast ? 'existing-variant' : 'add-now',
    evidenceStatus:'measured-baseline', inScopePhase2:c.phase===2,
    currentParserStatus: actual.ast ? 'accepted' : 'rejected',
    existingSemanticMatch: actual.ast ? api.astEquivalent(actual.ast, standard.ast) : null,
    diagnostics:actual.syntaxDiagnostics, canonicalAst:semantic(standard.ast),
    canonicalFormatted:api.formatScript(standard.ast)};
});
assert.equal(new Set(rows.map(r => r.id)).size, 42);
assert.equal(new Set(rows.map(r => r.id + '/' + r.key)).size, rows.length);
const result = {baseline, productSha256:sha(html), status:'INVENTORIED', cases:rows};
fs.writeFileSync('audit/manifests/language-form-coverage.json', JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:rows.length, accepted:rows.filter(r=>r.currentParserStatus==='accepted').length, rejected:rows.filter(r=>r.currentParserStatus==='rejected').length, phase3:rows.filter(r=>r.phase===3).length}));
for (let n=1;n<=42;n++) {
 const id='JPF-'+String(n).padStart(3,'0'), group=rows.filter(r=>r.id===id);
 console.log(id, group.filter(r=>r.currentParserStatus==='accepted').length+'/'+group.length, group.find(r=>r.currentParserStatus==='accepted')?.source || '');
}
