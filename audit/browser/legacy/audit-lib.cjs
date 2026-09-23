const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'../../..');
const {currentApi}=require('../../lib/launch-identifiers.cjs');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(file,'utf8');
const script=html=>html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
function loadApi(html){const context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout};vm.runInNewContext(script(html),context,{timeout:30000});const api=context.Akari||context['Akari'+'09']||context.Akari08;if(!api)throw Error('Product API not exposed');return currentApi(api);}
function ledger09(text){const rows=[];for(const [index,line]of text.split(/\r?\n/).entries()){if(!/^\| [a-z]+:/.test(line))continue;const cells=line.split('|').slice(1,-1).map(x=>x.trim());if(cells.length!==10)throw Error(`Invalid ledger row at ${index+1}`);rows.push(Object.fromEntries(['id','capability','ast','cui','gui','semantic','runtime','selftest','browser','guarantee'].map((key,i)=>[key,cells[i]]).concat([['line',index+1]])));}return rows;}
function ledger08(text){const section=text.split('## 0.8 能力・自己検査追跡台帳')[1];return JSON.parse(section.match(/```json\s*(\{[\s\S]*?\})\s*```/)[1]);}
function checks(){const out=[];return{out,add(id,phase,pass,evidence){out.push({id,phase,status:pass?'PASS':'FAIL',evidence});},unverified(id,phase,reason){out.push({id,phase,status:'UNVERIFIED',evidence:reason});}};}
function result(file,data){const text=JSON.stringify(data,null,2);for(let attempt=0;;attempt++){try{fs.writeFileSync(file,text);return;}catch(error){if(attempt>=5||!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100*(attempt+1));}}}
function verifyManifest(dir){
 const manifest=JSON.parse(read(path.join(dir,'manifest.json')));
 for(const f of manifest.files){if(sha(fs.readFileSync(path.join(dir,f.path)))!==f.sha256)throw Error('Snapshot file changed: '+f.path);}
 if(manifest.provenanceVersion===1){
  const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(head!==manifest.head)throw Error('Source checkout no longer matches the audit commit');
  const actual=cp.execFileSync('git',['ls-tree','-r','--name-only',head],{cwd:root,encoding:'utf8'}).trim().split('\n').sort();
  const declared=manifest.files.filter(f=>!f.gitRef).map(f=>f.path).sort();
  if(JSON.stringify(actual)!==JSON.stringify(declared))throw Error('Snapshot omits or adds tracked authority/validator files');
  for(const f of manifest.files.filter(f=>!f.gitRef))if(sha(fs.readFileSync(path.join(root,f.path)))!==(f.worktreeSha256||f.sha256))throw Error('Executed source or validator differs from snapshot: '+f.path);
 }
 for(const f of manifest.runnerFiles||[]){
 if(sha(fs.readFileSync(path.join(root,f.path)))!==f.sha256||sha(fs.readFileSync(path.join(dir,f.snapshotPath)))!==f.sha256)throw Error('Pinned runner changed: '+f.path);
 }
 return manifest;
}
module.exports={fs,path,crypto,cp,root,sha,read,script,loadApi,ledger09,ledger08,checks,result,verifyManifest};
