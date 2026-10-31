// Split one src/js file by the rule (AUDIT.md「ソースの境界」): node audit/split-source.mjs <src/js file>. The first half of
// the file in dependency order moves to a new file placed just before it; the template, initApp's factory calls and every
// boundary record follow; the product is built again. Nothing is staged or committed, and the release is left to the
// change guard (node audit/renumber-release.mjs after merging the base, as for any product change).
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {splitSource,sourceSizes,SOURCE_SPLIT_LINES} from './lib/source-split.mjs';
import {productScript} from './lib/source-boundaries.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
assert.ok(args.length===1&&/^src\/js\/[a-z0-9._-]+\.js$/.test(args[0]),'usage: node audit/split-source.mjs <src/js file>');
assert.ok(!fs.existsSync(path.join(root,'PUBLIC_SYNC.json')),'split sources in the public development repository');
const read=file=>fs.readFileSync(path.join(root,file),'utf8'),file=args[0];
const size=sourceSizes(read,[...new Set(productScript(read).pieces.map(p=>p.label))]).find(s=>s.file===file);
assert.ok(size,file+' is not a product source');
if(size.largest!==null&&size.largest>SOURCE_SPLIT_LINES)console.log(file+' has a unit of '+size.largest+' lines; splitting the file cannot bring that unit under '+SOURCE_SPLIT_LINES+' lines.');
const split=splitSource(read,file,f=>fs.existsSync(path.join(root,f)));
for(const [p,text]of Object.entries(split.changes)){fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),text);}
cp.execFileSync(process.execPath,['src/build.mjs'],{cwd:root,stdio:'inherit'});
const lines=p=>read(p).replace(/\n$/,'').split('\n').length;
console.log('Split '+file+' ('+size.lines+' lines): '+split.created+' '+lines(split.created)+' lines ('+split.moved.length+' units), '+file+' '+lines(file)+' lines ('+split.kept.length+' units).');
for(const p of [split.created,file])if(lines(p)>SOURCE_SPLIT_LINES)console.log(p+' is still over '+SOURCE_SPLIT_LINES+' lines; run the command on it again.');
