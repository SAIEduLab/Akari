const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inputInventory(){const meta=JSON.parse(fs.readFileSync(path.join(root,'audit/public-files.json')));return Object.fromEntries(meta.files.map(file=>[file,sha(fs.readFileSync(path.join(root,file)))]));}
function snapshot(product){return {productSha256:sha(fs.readFileSync(path.resolve(root,product))),inputSha256:sha(JSON.stringify(inputInventory()))};}
function executionProvenance(){
 const testedCommit=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const repository=process.env.GITHUB_REPOSITORY||cp.execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}).trim().replace(/^.*github.com[:/]/,'').replace(/\.git$/,'');
 return {repository,testedCommit,candidateCommit:process.env.AKARI_REQUESTED_SHA||testedCommit,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1',platform:process.platform};
}
module.exports={snapshot,inputInventory,executionProvenance};
