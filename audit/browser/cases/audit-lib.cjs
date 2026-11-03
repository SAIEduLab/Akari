const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm'),cp=require('child_process');
const root=path.resolve(__dirname,'../../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const read=file=>fs.readFileSync(file,'utf8');
const script=html=>html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
function loadApi(html){const context={console,TextEncoder,TextDecoder,Uint8Array,Uint32Array,ArrayBuffer,Blob,URL,structuredClone,crypto:crypto.webcrypto,setTimeout,clearTimeout};vm.runInNewContext(script(html),context,{timeout:30000});const api=context.Akari;if(!api)throw Error('Product API not exposed');return api;}
function checks(){const out=[];return{out,add(id,phase,pass,evidence){out.push({id,phase,status:pass?'PASS':'FAIL',evidence});},unverified(id,phase,reason){out.push({id,phase,status:'UNVERIFIED',evidence:reason});}};}
function result(file,data){const text=JSON.stringify(data,null,2);for(let attempt=0;;attempt++){try{fs.writeFileSync(file,text);return;}catch(error){if(attempt>=5||!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100*(attempt+1));}}}
function verifyManifest(dir){
 const manifest=JSON.parse(read(path.join(dir,'manifest.json')));
 for(const f of manifest.files){if(sha(fs.readFileSync(path.join(dir,f.path)))!==f.sha256)throw Error('Snapshot file changed: '+f.path);}
 if(manifest.provenanceVersion!==2)throw Error('Unsupported snapshot');
 for(const f of manifest.files)if(sha(fs.readFileSync(path.join(root,f.path)))!==f.sha256)throw Error('Source input changed: '+f.path);
 for(const f of manifest.runnerFiles||[]){
 if(sha(fs.readFileSync(path.join(root,f.path)))!==f.sha256||sha(fs.readFileSync(path.join(dir,f.snapshotPath)))!==f.sha256)throw Error('Pinned runner changed: '+f.path);
 }
 return manifest;
}
module.exports={fs,path,crypto,cp,root,sha,read,script,loadApi,checks,result,verifyManifest};
