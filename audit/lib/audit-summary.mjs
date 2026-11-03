import fs from 'node:fs';import cp from 'node:child_process';import {currentProductFile,currentProductVersion} from './product-path.cjs';
export function writeSummary(report,rows=report.steps||report.results||[]){
 const sha=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),repo=process.env.GITHUB_REPOSITORY||cp.execFileSync('git',['remote','get-url','origin'],{encoding:'utf8'}).trim().replace(/^.*github.com[:/]/,'').replace(/\.git$/,'');
 const statuses=rows.map(r=>r.status),passed=statuses.filter(s=>s==='PASS').length,failed=statuses.filter(s=>s==='FAIL').length,unrun=rows.length-passed-failed;
 const base=process.env.GITHUB_SERVER_URL||'https://github.com',run=process.env.GITHUB_RUN_ID,url=run?base+'/'+repo+'/actions/runs/'+run:null;
 let text='### '+report.status+' — '+repo+'\n\nHEAD: \u0060'+sha+'\u0060 · Product: '+currentProductVersion()+' (\u0060'+currentProductFile()+'\u0060)\n\nSuites: '+rows.length+' · PASS '+passed+' · FAIL '+failed+' · NOT_RUN '+unrun+'\n';
 for(const r of rows.filter(r=>r.status!=='PASS'))text+='\n- '+(r.id||r.kind||r.file)+': '+r.status+' — '+(r.reason||r.log||r.error||'required result unavailable').slice(0,1500);
 if(url)text+='\n\n[Run, job logs and artifacts]('+url+') · attempt '+process.env.GITHUB_RUN_ATTEMPT+'\n';
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,text);console.log(text);return text;
}
