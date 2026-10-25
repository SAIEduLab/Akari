import assert from 'node:assert/strict';
import cp from 'node:child_process';

export const workOwner=Object.freeze({login:'SAIEduLab',id:304662372});
export const workActions=Object.freeze(['implement','test','independent-audit','push','draft-pr','monitor-actions']);
const exactSha=value=>typeof value==='string'&&/^[0-9a-f]{40}$/.test(value);
const safePath=value=>typeof value==='string'&&value.length&&!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').some(part=>part==='..'||part==='.'||part==='')&&!/[?\[\]{}]/.test(value);
export function workPathMatches(pattern,file){
  assert.ok(safePath(pattern)&&safePath(file),'invalid authorization path');
  if(pattern.endsWith('/**')){assert.ok(!pattern.slice(0,-3).includes('*'),'invalid directory scope');return file.startsWith(pattern.slice(0,-2));}
  assert.ok(!pattern.includes('*'),'only an exact path or a directory/** scope is allowed');
  return pattern===file;
}
export function parseWorkGrant(body){
  const matches=[...String(body??'').matchAll(/^```akari-work-authorization\r?\n([\s\S]*?)\r?\n```/gm)];
  assert.equal(matches.length,1,'one explicit owner work grant required');
  return JSON.parse(matches[0][1]);
}
// The caller must obtain comments from this PR's authenticated GitHub API, never
// from a file supplied by the candidate. PR bodies, labels and git authors are not grants.
export function verifyWorkAuthorization({repository,branch,base,head,changedFiles,comments}){
  assert.ok(['SAIEduLab/Akari','SAIEduLab/Akari-dev'].includes(repository),'unexpected work repository');
  assert.ok(exactSha(base)&&exactSha(head),'exact base and head commits required');
  assert.ok(typeof branch==='string'&&branch.length&&Array.isArray(changedFiles)&&changedFiles.length,'work branch and changes required');
  const errors=[];
  for(const comment of comments??[]){
    if(comment.user?.login!==workOwner.login||comment.user?.id!==workOwner.id)continue;
    if(!comment.created_at||comment.created_at!==comment.updated_at)continue;
    try{
      const grant=parseWorkGrant(comment.body);
      assert.equal(grant.schema,'akari-owner-work-v1','owner work grant schema');
      assert.deepEqual(Object.keys(grant).sort(),['actions','base','branch','frozenPaths','head','paths','repository','schema'],'owner work grant fields');
      assert.equal(grant.repository,repository,'grant repository');assert.equal(grant.branch,branch,'grant branch');
      assert.equal(grant.base,base,'grant base');assert.equal(grant.head,head,'grant head');
      assert.ok(Array.isArray(grant.actions)&&grant.actions.includes('implement')&&grant.actions.every(a=>workActions.includes(a)),'explicit supported work actions required');
      assert.ok(Array.isArray(grant.paths)&&grant.paths.length&&new Set(grant.paths).size===grant.paths.length,'explicit unique work paths required');
      assert.ok(Array.isArray(grant.frozenPaths),'explicit frozen path list required');
      for(const pattern of [...grant.paths,...grant.frozenPaths])workPathMatches(pattern,'__validate_pattern__');
      for(const file of changedFiles){
        assert.ok(grant.paths.some(pattern=>workPathMatches(pattern,file)),'outside owner work scope: '+file);
        assert.ok(!grant.frozenPaths.some(pattern=>workPathMatches(pattern,file)),'frozen work path: '+file);
      }
      return {status:'PASS',repository,branch,base,head,grantCommentId:comment.id,actions:grant.actions,changedFiles};
    }catch(error){errors.push(String(error.message));}
  }
  throw Error('No matching unedited owner authorization: '+(errors.join('; ')||'owner grant missing'));
}
export function changedWorkFiles(repo,base,head){
  assert.ok(exactSha(base)&&exactSha(head),'exact work commits required');
  return cp.execFileSync('git',['-C',repo,'diff','--no-renames','--name-only','-z',base+'...'+head],{encoding:'utf8'}).split('\0').filter(Boolean);
}
