import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {root,sha} from './lib/product-test-host.mjs';
const output=path.resolve(process.argv[2]||'.publication/1.0.0');
assert.ok(output.startsWith(root+path.sep),'Publication must be inside this checkout');
assert.ok(!fs.existsSync(output),'Choose an empty publication directory');
const {files}=JSON.parse(fs.readFileSync('audit/public-files.json'));
assert.equal(new Set(files).size,files.length);
for(const file of files){
  assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));
  const destination=path.join(output,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.copyFileSync(path.join(root,file),destination);
  assert.equal(sha(fs.readFileSync(destination)),sha(fs.readFileSync(path.join(root,file))));
}
console.log(JSON.stringify({output,files:files.length,productVersion:'1.0.0',gitHistoryIncluded:false}));
