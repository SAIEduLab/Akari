// Re-run the six real compact UI route regressions against explicit product bytes.
// Usage: node audit-evidence/browser/ui-compact-routes.cjs [html] [output-prefix]
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const html=path.resolve(process.argv[2]||'Akari.html'),prefix=path.resolve(process.argv[3]||'audit-evidence/browser/ui-compact-routes');
const ids=['UI09-statement-duplicate-order-delete','UI09-else-annotation-and-comment-lines','UI09-variadic-order-size-and-nested-replace','UI09-expression-move-atomic-replacement','UI09-deep-expression-move-prompt-reachable','UI09-keyboard-only-create-move-delete-history'];
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(html)).digest('hex'),sha256=hash(),started=new Date().toISOString();
const detailPrefix=prefix+'-details-'+Date.now(); // A failed run cannot read a prior report.
fs.mkdirSync(path.dirname(prefix),{recursive:true});
const child=cp.spawnSync(process.execPath,[path.join(__dirname,'ui-interactions.cjs'),html,detailPrefix,ids.join(',')],{stdio:'inherit',timeout:300000});
let detail=null,readError=null;try{detail=JSON.parse(fs.readFileSync(detailPrefix+'.json','utf8'));}catch(error){readError=error.message;}
const results=ids.map(id=>{const matches=detail?.results.filter(result=>result.id===id)||[];return matches.length===1?matches[0]:{id,pass:false,error:'Expected exactly one completed real UI case; found '+matches.length};});
const sourceUnchanged=hash()===sha256&&detail?.sha256===sha256&&detail?.sourceUnchanged===true;
const environmentPass=child.status===0&&!child.error&&sourceUnchanged&&detail?.pageErrors?.length===0&&detail?.networkRequests?.length===0;
const report={html,sha256,sourceUnchanged,browser:detail?.browser||null,timestamp:started,finished:new Date().toISOString(),total:results.length,failed:results.filter(r=>r.pass!==true).length,results,pageErrors:detail?.pageErrors||[],networkRequests:detail?.networkRequests||[],environmentPass,detailArtifact:detailPrefix+'.json',screenshot:detailPrefix+'.png',runnerExit:child.status,runnerError:child.error?.message||readError};
fs.writeFileSync(prefix+'.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({sha256,total:report.total,failed:report.failed,environmentPass,report:prefix+'.json'}));
if(report.failed||!environmentPass)process.exitCode=1;
