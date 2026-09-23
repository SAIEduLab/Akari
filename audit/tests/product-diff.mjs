import fs from 'node:fs';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import {sha} from '../lib/product-test-host.mjs';
const map=JSON.parse(fs.readFileSync('audit/manifests/externalization-map.json'));
const original=cp.execFileSync('git',['show',map.sourceCommit+':Akari.html'],{encoding:'utf8',maxBuffer:8*1024*1024});
const candidate=fs.readFileSync('Akari.html','utf8').replace(/\r\n/g,'\n');
let expected=original;
const start=expected.indexOf('  async function runExtendedTests07()'),end=expected.indexOf('  // ─────',expected.indexOf('  async function runReleaseTests()'));
assert.ok(start>0&&end>start);
for(const entry of map.entries){
 const body=fs.readFileSync(entry.destination,'utf8').replace(/\r\n/g,'\n').trimEnd();
 assert.ok(original.includes(body),'suite differs from baseline '+entry.symbol);
 assert.equal(sha(body),entry.bodySha256);
}
expected=expected.slice(0,start)+expected.slice(end);
for(const e of map.entries)expected=expected.replace('    '+e.symbol+',\n','');
const boot=expected.indexOf("    try {\n      if (new URL(location.href).searchParams.get('selftest')"),bootEnd=expected.indexOf('    } catch (_) {}',boot)+'    } catch (_) {}\n'.length;
assert.ok(boot>0&&bootEnd>boot);expected=expected.slice(0,boot)+expected.slice(bootEnd);
const addition='    // Narrow references for diagnostics; no fixtures, test dispatch or mutable app state.\n    diagnostics: Object.freeze({\n'+map.addedApi.map(n=>'      '+n+',').join('\n')+'\n    }),\n';
expected=expected.replace('  const Akari09 = {\n','  const Akari09 = {\n'+addition);
assert.equal(candidate,expected,'Product changed beyond audit extraction and enumerated API references');
const measure=s=>({utf8Bytes:Buffer.byteLength(s),lines:s.split('\n').length-1,nonEmptyLines:s.split(/\r?\n/).filter(l=>l.trim()).length,sha256:sha(s)});
const h0={git:measure(original),worktree:map.h0},ha={git:measure(candidate),worktree:measure(fs.readFileSync('Akari.html','utf8'))};
assert.ok(ha.git.utf8Bytes<h0.git.utf8Bytes);
fs.writeFileSync('audit-evidence/product-size.json',JSON.stringify({h0,ha,gitBytesRemoved:h0.git.utf8Bytes-ha.git.utf8Bytes,worktreeBytesRemoved:h0.worktree.utf8Bytes-ha.worktree.utf8Bytes,addedApi:map.addedApi},null,2)+'\n');
console.log('Exact product diff and complete suite bodies: PASS',JSON.stringify({H0:h0.git,HA:ha.git}));
