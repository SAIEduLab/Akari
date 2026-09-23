import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import {root,sha} from './product-test-host.mjs';

export const historicalArchive='audit/fixtures/provenance/public-sources.json';
export const historicalArchiveSha256='cedf2050812e4df7cf1386241dc0adee08dff70a4e34fe47e275dba651afd36b';
const commits=[
  '2f455619440f5abbfbb564927769c85341f25074',
  '77c479425253aad5385095f7a4dd24a96414612c',
  'c2c320e7f6d733e7c64aed2eac8d5f497606baea',
  '41d787b664ed00467bf55881c419ba4f3727add9',
  '05789beae52221fb8aa259f1de0f778c236afbf9',
].sort();
const keys=o=>Object.keys(o).sort();
export const gitObjectHash=(type,bytes)=>crypto.createHash('sha1').update(type+' '+bytes.length+'\0').update(bytes).digest('hex');
const base64=value=>{
  assert.equal(typeof value,'string');const bytes=Buffer.from(value,'base64');
  assert.equal(bytes.toString('base64'),value,'invalid base64 proof');return bytes;
};
const safePath=value=>{
  assert.equal(typeof value,'string');assert.ok(value.length>0&&!value.includes('\\')&&!value.includes('\0'));
  assert.ok(value.split('/').every(p=>p&&p!=='.'&&p!=='..'),'invalid source path');return value.split('/');
};
const fixtureBytes=file=>Buffer.from(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'));

// Commit headers and only the required tree paths are proof data. No old refs,
// parent commits, Git object database, network or Git process are needed.
export function verifyHistoricalArchive(archive,readFixture=fixtureBytes){
  assert.equal(archive.schema,'akari-offline-git-provenance-v1');
  assert.deepEqual(keys(archive.commits),commits,'fixed source commits changed');
  assert.deepEqual(keys(archive.sources),commits,'source commit set changed');
  const trees=new Map(),roots=new Map(),blobs=new Map(),files=new Map(),usedTrees=new Set(),usedBlobs=new Set();
  for(const [id,encoded] of Object.entries(archive.trees)){
    const raw=base64(encoded);assert.equal(gitObjectHash('tree',raw),id,'tree proof hash');
    const entries=new Map();
    for(let offset=0;offset<raw.length;){
      const space=raw.indexOf(32,offset),zero=raw.indexOf(0,space+1);
      assert.ok(space>offset&&zero>space&&zero+21<=raw.length,'truncated Git tree');
      const mode=raw.subarray(offset,space).toString(),name=raw.subarray(space+1,zero).toString('utf8');
      assert.match(mode,/^(40000|100644|100755|120000|160000)$/);
      assert.ok(!name.includes('/')&&safePath(name).length===1&&!entries.has(name),'invalid Git tree name');
      entries.set(name,{mode,id:raw.subarray(zero+1,zero+21).toString('hex')});offset=zero+21;
    }
    trees.set(id,entries);
  }
  for(const [id,encoded] of Object.entries(archive.commits)){
    const raw=base64(encoded);assert.equal(gitObjectHash('commit',raw),id,'commit proof hash');
    const match=raw.toString('utf8').match(/^tree ([a-f0-9]{40})\n/);assert.ok(match,'commit root tree');roots.set(id,match[1]);
  }
  const tree=id=>{const entries=trees.get(id);assert.ok(entries,'missing tree proof '+id);usedTrees.add(id);return entries;};
  const resolve=(commit,source)=>{
    assert.ok(roots.has(commit),'unknown historical commit');let entry={mode:'40000',id:roots.get(commit)};
    for(const part of safePath(source)){
      assert.equal(entry.mode,'40000','non-directory in source path');entry=tree(entry.id).get(part);assert.ok(entry,'path absent from fixed commit: '+source);
    }
    return entry;
  };
  for(const [id,record] of Object.entries(archive.blobs)){
    assert.ok(Number.isInteger(record.bytes)&&record.bytes>0&&record.bytes<=8e6,'invalid blob size');
    assert.notEqual('fixture' in record,'deflateBase64' in record,'exactly one blob storage form required');
    let bytes;
    if('fixture' in record){
      safePath(record.fixture);assert.match(record.fixture,/^audit\/fixtures\/(?:1\.0\.0\/source\/|0\.8\/)/,'unapproved fixture location');
      bytes=readFixture(record.fixture);
    }else bytes=zlib.inflateSync(base64(record.deflateBase64),{maxOutputLength:record.bytes+1});
    assert.equal(bytes.length,record.bytes,'historical source size');assert.equal(sha(bytes),record.sha256,'historical source SHA-256');
    assert.equal(gitObjectHash('blob',bytes),id,'historical Git blob hash');blobs.set(id,bytes);
  }
  for(const [commit,sources] of Object.entries(archive.sources)){
    assert.ok(keys(sources).length,'empty source set');
    for(const [source,id] of Object.entries(sources)){
      const entry=resolve(commit,source);assert.ok(['100644','100755'].includes(entry.mode),'source is not a regular file');
      assert.equal(entry.id,id,'source path/Git blob binding');assert.ok(blobs.has(id),'missing historical blob');
      usedBlobs.add(id);files.set(commit+':'+source,blobs.get(id));
    }
  }
  assert.deepEqual([...usedBlobs].sort(),keys(archive.blobs),'unreferenced historical blobs');
  assert.deepEqual([...usedTrees].sort(),keys(archive.trees),'unreferenced tree proofs');
  return Object.freeze({
    read(commit,source){safePath(source);const bytes=files.get(commit+':'+source);assert.ok(bytes,'historical source not archived: '+commit+':'+source);return Buffer.from(bytes);},
    paths(commit,directory){
      const entry=resolve(commit,directory);assert.equal(entry.mode,'40000','historical directory required');
      const visit=(id,prefix)=>[...tree(id)].flatMap(([name,item])=>{
        const p=prefix+'/'+name;if(item.mode==='40000')return visit(item.id,p);
        assert.equal(archive.sources[commit][p],item.id,'historical directory must be completely archived');return [p];
      });return visit(entry.id,directory).sort();
    },
    summary:Object.freeze({commits:commits.length,trees:trees.size,blobs:blobs.size,sourceFiles:files.size}),
  });
}
export function verifyHistoricalArchiveBytes(bytes){
  const canonical=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  assert.equal(sha(canonical),historicalArchiveSha256,'offline provenance archive changed');
  return verifyHistoricalArchive(JSON.parse(canonical));
}
let verified;
const fixed=()=>verified??=verifyHistoricalArchiveBytes(fs.readFileSync(path.join(root,historicalArchive)));
export const readHistoricalSource=(commit,source)=>fixed().read(commit,source);
export const historicalPaths=(commit,directory)=>fixed().paths(commit,directory);
export const verifyHistoricalSources=()=>({archive:historicalArchive,archiveSha256:historicalArchiveSha256,...fixed().summary});
