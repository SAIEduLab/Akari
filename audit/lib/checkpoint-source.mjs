import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha} from './product-test-host.mjs';
import {verifyGitSourceArchive} from './historical-source.mjs';
export const checkpointCommit='1207f8a44b783afbb2274e794759de4c58edb450';
export const checkpointArchive='audit/fixtures/1.0.2/git-provenance.json';
export const checkpointArchiveSha256='4a51b63e3e34f421775fb002f1dac9a539ecbeaf7d606d61a350842402c69971';
export function verifyCheckpointArchive(archive,readFixture){
  return verifyGitSourceArchive(archive,{commits:[checkpointCommit],fixturePattern:/^audit\/fixtures\/1\.0\.2\/source\//},readFixture || (p=>/\.(?:mp3|wav|m4a|flac|ogg|opus|aac)$/.test(p)?fs.readFileSync(path.join(root,p)):Buffer.from(fs.readFileSync(path.join(root,p),'utf8').replace(/\r\n/g,'\n'))));
}
export function verifyCheckpointArchiveBytes(bytes){
  const canonical=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  assert.equal(sha(canonical),checkpointArchiveSha256,'1.0.2 checkpoint provenance changed');
  return verifyCheckpointArchive(JSON.parse(canonical));
}
let verified;
const fixed=()=>verified??=verifyCheckpointArchiveBytes(fs.readFileSync(path.join(root,checkpointArchive)));
export const readCheckpointSource=(commit,source)=>fixed().read(commit,source);
export const verifyCheckpointSources=()=>({archive:checkpointArchive,archiveSha256:checkpointArchiveSha256,...fixed().summary});
