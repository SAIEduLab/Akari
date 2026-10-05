const {makeRegressionProject}=require('../fixtures/regression-project.cjs');
const { currentProductFile } = require("./../lib/product-path.cjs");
// Simulate synchronous removal events using the actual product view. Real browser tests remain mandatory.
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
function check(html){
 const errors=[],vc=new VirtualConsole();vc.on("jsdomError",e=>errors.push(e.message));
 const dom=new JSDOM('<div id="root"></div>',{pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 let script=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
 script=script.replace("  const Akari = {","  globalThis.__view = createBlockEditorView;\n  const Akari = {");
 const ctx={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:require('crypto').webcrypto,setTimeout,clearTimeout,AbortController:w.AbortController};
 vm.runInNewContext(script,ctx);ctx.document=w.document;const api=ctx.Akari,p=makeRegressionProject(api),source='3 が 8 より小さい間、次のことを繰り返す ※ 頭  \n  3 を 点数 に 加える ※ 本文  \n「😀」 という\n';
 p.scripts=[{targetId:'stage',event:'start',source}];let s=api.createEditorSession('script:stage:start',source,{targetId:'stage',event:'start'},p,4);s.mode='blocks';let calls=0;
 const root=w.document.querySelector('#root');const view=ctx.__view({root,getSession:()=>s,getProject:()=>p,onPending:value=>s.pendingEdit=value,onOperation:op=>{calls++;const result=api.prepareBlockEdit(s,op,{pendingEditId:s.pendingEdit?.id});Object.assign(s,result);s.pendingEdit=null;return {ok:true,changed:result.changed};}});
 const world=root.querySelector('.blockui-world');assert(world);
 const original=world.replaceChildren.bind(world);let removing=false,blurChanges=0;
 world.replaceChildren=(...args)=>{if(removing)throw Error('reentrant replaceChildren');removing=true;try{const active=w.document.activeElement;if(world.contains(active)&&active.tagName==='INPUT'){blurChanges++;active.dispatchEvent(new w.Event('change',{bubbles:true}));active.blur();}return original(...args);}finally{removing=false;}};
 const input=root.querySelector('[data-schema-id="NumberLiteral"] [data-blockui-field="value"]');input.focus();input.value='4';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const result=view.flush();const current=root.querySelector('[data-schema-id="NumberLiteral"] [data-blockui-field="value"]');
 const observed={errors,ok:result.ok,calls,blurChanges,focused:w.document.activeElement===current,pending:!!s.pendingEdit,source:s.sourceText};
 view.destroy();dom.window.close();return observed;
}
const html=fs.readFileSync(currentProductFile(),'utf8'),good=check(html);
function verifyNormalObservation(observed){
 assert.deepEqual(observed.errors,[]);assert.equal(observed.calls,1);assert.equal(observed.blurChanges,1);
 assert.equal(observed.focused,true);assert.equal(observed.pending,false);assert.equal(observed.ok,true);
 assert.equal(observed.source,'4 が 8 より小さい間、次のことを繰り返す ※ 頭  \n  3 を 点数 に 加える ※ 本文  \n「😀」 という\n');
}
verifyNormalObservation(good);
const guard='        if (rendering || committing || !input.isConnected) return;';
assert.equal(html.split(guard).length,3);
const withoutRenderGuards=html.replaceAll(guard,'').replace('destroyed || committing || rendering','destroyed || committing');
// Live model reads are an independent defense against the stale removal event.
// Preserve the old guard-only mutation and assert every normal observation.
const treeProtected=check(withoutRenderGuards);
assert.deepEqual(treeProtected,good);verifyNormalObservation(treeProtected);
const liveRead='const current = index.get(node.id)?.node || node;';
assert.equal(html.split(liveRead).length,2);
// Remove both defenses to retain the original double-commit/reentrant fault.
const bad=check(withoutRenderGuards.replace(liveRead,'const current = node;'));
assert.equal(bad.calls,2);assert.ok(bad.errors.some(e=>e.includes('reentrant replaceChildren')));
assert.throws(()=>verifyNormalObservation(bad),{name:'AssertionError'},'unprotected reentrant evidence must fail the normal observation validator');
console.log('DOM render regression: one commit, focus/source preserved; latest-tree defense preserved and reentrant blur/change mutant rejected (simulated DOM, not real browser)');
