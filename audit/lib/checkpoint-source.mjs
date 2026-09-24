import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha} from './product-test-host.mjs';
import {verifyGitSourceArchive} from './historical-source.mjs';
export const checkpointCommit='62359484a646651dd81806ef97a6cfef87f85d4b';
export const checkpointArchive='audit/fixtures/1.0.1/git-provenance.json';
export const checkpointArchiveSha256='2f47734530e2e0032b5d5a105cfb4c9026909269b568b2fae2eaa29be32caa38';
export function verifyCheckpointArchive(archive,readFixture){
  return verifyGitSourceArchive(archive,{commits:[checkpointCommit],fixturePattern:/^audit\/fixtures\/1\.0\.1\/source\//},readFixture);
}
export function verifyCheckpointArchiveBytes(bytes){
  const canonical=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
  assert.equal(sha(canonical),checkpointArchiveSha256,'1.0.1 checkpoint provenance changed');
  return verifyCheckpointArchive(JSON.parse(canonical));
}
let verified;
const fixed=()=>verified??=verifyCheckpointArchiveBytes(fs.readFileSync(path.join(root,checkpointArchive)));
export const readCheckpointSource=(commit,source)=>fixed().read(commit,source);
export const verifyCheckpointSources=()=>({archive:checkpointArchive,archiveSha256:checkpointArchiveSha256,...fixed().summary});
