import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {verifyWorkAuthorization,workOwner,changedWorkFiles} from '../lib/work-authorization.mjs';

export function runWorkAuthorizationChecks(){
  const base='a'.repeat(40),head='b'.repeat(40),repository='SAIEduLab/Akari',branch='work/task';
  const grant={schema:'akari-owner-work-v1',repository,branch,base,head,actions:['implement','test'],paths:['audit/**','LANGUAGE.md','LANGUAGE_1_5_1.md'],frozenPaths:['src/**','Akari_1_5_1.html']};
  const comment={id:1,user:workOwner,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',body:'```akari-work-authorization\n'+JSON.stringify(grant)+'\n```'};
  const args={repository,branch,base,head,changedFiles:['audit/test.js','LANGUAGE.md','LANGUAGE_1_5_1.md'],comments:[comment]};let count=0;
  assert.equal(verifyWorkAuthorization(args).status,'PASS');count++;
  for(const mutate of [a=>a.comments=[],a=>a.comments[0].user={login:workOwner.login,id:1},a=>a.comments[0].user={login:'someone',id:workOwner.id},a=>a.comments[0].updated_at='later',a=>a.head='c'.repeat(40),a=>a.base='d'.repeat(40),a=>a.repository='SAIEduLab/Akari-dev',a=>a.branch='other',a=>a.changedFiles=['audit-other/test.js'],a=>a.changedFiles=['src/test.js'],a=>a.changedFiles=['../outside'],a=>a.comments[0].body='plan approved',a=>a.changedFiles=[]]){
    const bad=structuredClone(args);mutate(bad);assert.throws(()=>verifyWorkAuthorization(bad));count++;
  }
  for(const mutate of [g=>g.actions=['merge'],g=>g.paths=['**'],g=>g.paths=['../**'],g=>g.paths=['audit/*'],g=>g.extra=true,g=>g.paths=['audit/**','src/**'],g=>g.frozenPaths=null]){
    const bad=structuredClone(args),g=structuredClone(grant);mutate(g);if(g.paths.includes('src/**'))bad.changedFiles=['src/test.js'];bad.comments[0].body='```akari-work-authorization\n'+JSON.stringify(g)+'\n```';assert.throws(()=>verifyWorkAuthorization(bad));count++;
  }
  return count;
}

async function githubCheck(output){
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),pr=event.pull_request;
  assert.ok(pr&&pr.head.repo.full_name===process.env.GITHUB_REPOSITORY,'only a same-repository PR may be authorized');
  const repository=process.env.GITHUB_REPOSITORY,base=pr.base.sha,head=pr.head.sha;
  // This entry is executed from the trusted base checkout by pull_request_target.
  assert.equal(cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base,'authorization check must execute the base commit');
  assert.match(head,/^[0-9a-f]{40}$/);
  cp.execFileSync('git',['fetch','--no-tags','origin',head],{stdio:'pipe'});
  const comments=[];
  for(let page=1;;page++){
    const response=await fetch('https://api.github.com/repos/'+repository+'/issues/'+pr.number+'/comments?per_page=100&page='+page,{headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,Accept:'application/vnd.github+json'}});
    assert.ok(response.ok,'owner authorization comments unavailable: '+response.status);
    const batch=await response.json();assert.ok(Array.isArray(batch),'comments response');comments.push(...batch);if(batch.length<100)break;
  }
  const report=verifyWorkAuthorization({repository,branch:pr.head.ref,base,head,changedFiles:changedWorkFiles(process.cwd(),base,head),comments});
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Owner work authorization: PASS, grant '+report.grantCommentId);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv[2]==='--github')await githubCheck(process.argv[3]||'audit-evidence/work-authorization.json');
  else console.log('Work authorization checks: '+runWorkAuthorizationChecks()+' PASS');
}
