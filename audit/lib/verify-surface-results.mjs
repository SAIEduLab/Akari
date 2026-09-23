import assert from 'node:assert/strict';

// Acceptance IDs are independent of the executing suites and their reported totals.
export const editorIds = ['value-first','assign','target-first','increase','decrease','subtract','append',
  'insert-index','insert-value','delete-index','input','turn','goto-x','goto-y','glide-x','glide-y','glide-time',
  'tone-frequency','tone-time','wait','compare-left','compare-right','nested-expression','inline-body',
  'inline-condition','target-role','crlf-unicode','all-forms-noop','inline-expand','insert-remove-move',
  'atomic-stale-ime-limit','inline-comments-and-position','batch-role-offsets','predicate-in-expression-slot',
  'condition-connective-operands','condition-wait-and-inline-ranges','inline-finite-statement-composition','condition-replacement-keeps-body']
  .map(id=>'A10-EDIT/'+id);
export const guiIds = ['source-selection-history-focus','inline-ime','inline-structure-single-history',
  'inline-step-and-error-role','save-reload-generated-offline','unregistered-draft-autosave-registration',
  'corrupt-autosave-preserves-current','condition-connective-local-edit','else-surface-branch-position'].map(id=>'A10-GUI/'+id);
export function verifySurfaceResults(report,kind,currentSnapshot,environment) {
  const ids=kind==='editor'?editorIds:kind==='gui'?guiIds:null;
  assert.ok(ids,'unknown surface suite');
  assert.equal(report.status,'PASS');
  assert.equal(report.environment,environment);
  assert.ok(['node','chromium'].includes(environment));
  if(environment==='chromium')assert.ok(typeof report.browser==='string'&&report.browser.length>0,'missing browser identity');
  assert.deepEqual(report.snapshot,currentSnapshot,'unbound surface results');
  assert.equal(report.total,ids.length);
  assert.deepEqual([...report.results].map(r=>r.id).sort(),[...ids].sort(),'surface ID coverage');
  for(const r of report.results){assert.equal(r.status,'PASS',r.id);if('pass' in r)assert.equal(r.pass,true,r.id);}
  if('failed' in report)assert.equal(report.failed,0);
  return true;
}
