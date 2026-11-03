// Full GUI schema rows for every current schema, split over two browser processes.
// The row list is the current schema list (audit/manifests/features.json), which the
// product, the hand-written schema contract and the browser results manifest must all equal.
const L=require('./audit-lib.cjs'),assert=require('assert/strict'),C=require('../../lib/block-schema-contract.cjs');
const {splits,currentPart,partItems}=require('../../lib/shard-plan.cjs');
const shardCount=2;
assert.equal(splits['schema-shards'].parts.length,shardCount,'one CI part per browser process');
(async()=>{const dir=L.path.resolve(process.argv[2]),m=L.verifyManifest(dir),api=L.loadApi(L.read(L.path.join(dir,m.candidate))),inputs=C.currentInputs(dir);
const contract={...C.verifySchemaContract({...inputs,productSchemas:api.BLOCK_SCHEMAS}),negatives:C.checkSchemaContractNegatives(inputs)};C.verifySchemaContractNegatives(contract.negatives);
const ids=inputs.schemaIds,groups=Array.from({length:shardCount},(_,shard)=>ids.filter((_,i)=>i%shardCount===shard));
// A CI part (AKARI_PART) runs one of the processes; the aggregate merges the parts into the full report.
const part=currentPart('schema-shards'),run=part?[Number(part.split('/')[0])-1]:groups.map((_,i)=>i);
if(part)assert.deepEqual(partItems('schema-shards',ids,part),groups[run[0]],'part rows are the process rows');
// Keep two independent browser processes and every original row. Run them in
// sequence so their startup and GUI work do not compete on one Windows runner.
// Individual action limits and the enclosing 30-minute limit remain unchanged.
const reports=[];
for(const i of run){const list=groups[i];
 const dest=L.path.join(dir,'schema-shard-'+i);L.fs.mkdirSync(dest,{recursive:true});const log=L.fs.openSync(L.path.join(dest,'schema.log'),'w');
 const exit=await new Promise(resolve=>{const c=L.cp.spawn(process.execPath,[L.path.join(__dirname,'browser-schemas.cjs'),dir,list.join(','),dest],{stdio:['ignore',log,log]});c.on('exit',resolve);c.on('error',()=>resolve(-1));});
 L.fs.closeSync(log);let report;try{report=JSON.parse(L.read(L.path.join(dest,'browser-schemas-selected.json')));}catch(e){report={results:[],pageErrors:[String(e)],networkRequests:[]};}
 reports.push({exit,list,report});
}
const wanted=run.flatMap(i=>groups[i]),results=reports.flatMap(r=>r.report.results),complete=results.length===wanted.length&&new Set(results.map(r=>r.id)).size===wanted.length&&wanted.every(id=>results.some(r=>r.id===id));L.result(L.path.join(dir,'browser-schemas.json'),{manifest:m,expected:ids.length,complete,schemaContract:contract,results,shards:reports.map(r=>({exit:r.exit,expected:r.list.length,actual:r.report.results.length,pageErrors:r.report.pageErrors,networkRequests:r.report.networkRequests})),...(part?{part:{name:'schema-shards',part,items:wanted}}:{})});console.log(JSON.stringify({expected:wanted.length,actual:results.length,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).map(r=>r.id),complete}));assert(complete);assert(reports.every(r=>r.exit===0&&!r.report.pageErrors.length&&!r.report.networkRequests.length));assert(results.every(r=>r.pass));})().catch(e=>{console.error(e);process.exitCode=1;});
