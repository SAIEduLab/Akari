const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inputInventory(){const meta=JSON.parse(fs.readFileSync(path.join(root,'audit/public-files.json')));return Object.fromEntries(meta.files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));}
function snapshot(product){return {productSha256:sha(fs.readFileSync(path.resolve(root,product))),inputSha256:sha(JSON.stringify(inputInventory()))};}
module.exports={snapshot,inputInventory};
