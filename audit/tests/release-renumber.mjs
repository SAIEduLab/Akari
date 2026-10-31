// Product branches from one base: after one merges, another merges main, renumbers with one command and passes
// the change guard. Synthetic git repositories only; nothing outside the temporary directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {renumberRelease} from '../lib/release-renumber.mjs';
import {prepareLanguageRelease,verifyLanguageRelease} from '../lib/language-release.mjs';
import {changeGuard} from '../lib/change-guard.mjs';
import {buildProduct} from '../../src/build.mjs';

const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const command=path.join(repositoryRoot,'audit/renumber-release.mjs');

export async function runReleaseRenumberChecks(){
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'akari-renumber-test-'));let count=0;
  // The fixtures see no global or system git configuration (hooks, templates, merge defaults); restored afterwards.
  const saved=Object.fromEntries(['GIT_CONFIG_GLOBAL','GIT_CONFIG_NOSYSTEM'].map(key=>[key,process.env[key]]));
  fs.writeFileSync(path.join(scratch,'gitconfig'),'');
  process.env.GIT_CONFIG_GLOBAL=path.join(scratch,'gitconfig');process.env.GIT_CONFIG_NOSYSTEM='1';
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/.test(key)||key in saved));
  const git=(root,...args)=>{const r=cp.spawnSync('git',['-C',root,...args],{env,encoding:'utf8'});assert.ok(!r.error,r.error?.message);return r;};
  const ok=(root,...args)=>{const r=git(root,...args);assert.equal(r.status,0,'git '+args.join(' ')+': '+r.stderr);return r.stdout;};
  const write=(root,file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
  const append=(root,file,value)=>write(root,file,read(root,file)+value);
  const snapshot=root=>{
    const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.name!=='.git').flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    return Object.fromEntries(walk(root).sort().map(p=>[path.relative(root,p),fs.readFileSync(p).toString('base64')]));
  };
  const commitAll=(root,message)=>{ok(root,'add','-A');ok(root,'commit','-q','-m',message);};
  const check=async fn=>{await fn();count++;};
  // A published product at 1.5.1 on main: the product is built from src/ and the record is written by the language release.
  // Fixture scripts take names no real script has: the audit inventory parses every script a literal names, and a
  // real src/js file is a fragment of the product's one script.
  const fixture=()=>{
    const root=fs.mkdtempSync(path.join(scratch,'repo-'));
    write(root,'src/akari.html','<!doctype html>\n<title>あかり</title>\n<style>\n<!-- @include css/screens.css -->\n</style>\n<script>\n<!-- @include js/00-start.js -->\n<!-- @include js/01-first.js -->\n<!-- @include js/02-second.js -->\n</script>\n');
    write(root,'src/css/screens.css','/* ── 1.5.1 editor screens ── */\nbody { margin: 0; }\n.first { color: red; }\n.second { color: blue; }\n');
    write(root,'src/js/00-start.js',"(() => {\n  const PRODUCT_RELEASE = '1.5.1';\n// @portable extensions/profiles.js\n// @portable extensions/foundation.js\n");
    write(root,'src/js/01-first.js',"  const firstFeature = 'first';\n");
    write(root,'src/js/02-second.js',"  const secondFeature = 'second';\n})();\n");
    write(root,'extensions/profiles.js',"const profiles = {};\nif (typeof module !== 'undefined') module.exports = profiles;\n");
    write(root,'extensions/foundation.js',"const foundation = {};\nif (typeof module !== 'undefined') module.exports = foundation;\n");
    write(root,'LANGUAGE_1_5_1.md','# あかり 1.5.1 — 仕様\n製品版は1.5.1です。[本体](./Akari_1_5_1.html)\n');
    write(root,'README.md','あかり 1.5.1 · [仕様](./LANGUAGE_1_5_1.md) · [本体](./Akari_1_5_1.html)\n\n説明\n\n終わり\n');
    write(root,'AUDIT.md','`{x, y}`（1.5.1の座標）\n');
    // A pinned tool whose version equals a release label is not a release.
    write(root,'TOOLS.md','Playwright 1.5.1 で確かめる\n');
    write(root,'MANUAL.html','<title>あかり 1.5.1 マニュアル</title>\n<a href="./Akari_1_5_1.html">使う</a> <a href="./LANGUAGE_1_5_1.md">きまり</a>\n');
    write(root,'EXTENSIONS.md','[仕様](LANGUAGE_1_5_1.md)\n');
    write(root,'LICENSE','MIT License\n');
    write(root,'audit/manifests/features.json',{productVersion:'1.5.1',EXECUTABLE_CONTRACT:{languageContractId:4,runtimeContractId:4,programFormatVersion:4,projectFormatVersion:5}});
    write(root,'audit/manifests/language-form-coverage.json',{schema:'fixture',productVersion:'1.5.1'});
    write(root,'audit/browser/browser-audit-manifest.json',{groups:{},productVersion:'1.5.1'});
    write(root,'audit/manifests/release-1.5.1.json','{}\n');
    write(root,'Akari_1_5_1.html',buildProduct({root}).html);
    const files=['src/akari.html','src/css/screens.css','src/js/00-start.js','src/js/01-first.js','src/js/02-second.js','extensions/profiles.js','extensions/foundation.js',
      'LANGUAGE_1_5_1.md','README.md','AUDIT.md','TOOLS.md','MANUAL.html','EXTENSIONS.md','LICENSE','Akari_1_5_1.html','audit/public-files.json',
      'audit/manifests/features.json','audit/manifests/language-form-coverage.json','audit/browser/browser-audit-manifest.json','audit/manifests/release-1.5.1.json'].sort();
    write(root,'audit/public-files.json',{schema:'akari-public-files-v1',productVersion:'1.5.1',files,productFile:'Akari_1_5_1.html'});
    prepareLanguageRelease(root);verifyLanguageRelease(root);
    ok(root,'init','-q','-b','main');
    for(const [key,value]of [['user.name','fixture'],['user.email','fixture@example.invalid'],['commit.gpgsign','false'],['core.autocrlf','false']])ok(root,'config',key,value);
    commitAll(root,'base');ok(root,'tag','start');
    return root;
  };
  const edit=(root,file,from,to)=>{const source=read(root,file);assert.ok(source.includes(from),file);write(root,file,source.replace(from,to));};
  // Branch `first` and branch `second` both start at 1.5.1 and renumber to 1.5.2; `first` merges into main.
  const twoBranches=(root,{second=()=>{}}={})=>{
    ok(root,'checkout','-q','-b','first','start');edit(root,'src/js/01-first.js',"'first'","'first, changed'");
    assert.equal(renumberRelease(root,{base:'main'}).version,'1.5.2');commitAll(root,'first');
    ok(root,'checkout','-q','-b','second','start');edit(root,'src/js/02-second.js',"'second'","'second, changed'");
    assert.equal(renumberRelease(root,{base:'main'}).version,'1.5.2');
    append(root,'README.md','\n製品版 1.5.2 の新しい機能\n');append(root,'src/css/screens.css','/* ── 1.5.2 second screen ── */\n.third { color: green; }\n');second(root);
    commitAll(root,'second');
    ok(root,'checkout','-q','main');ok(root,'merge','-q','--ff-only','first');ok(root,'checkout','-q','second');
  };
  const takeIn=root=>{git(root,'merge','-q','--no-edit','main');return ok(root,'diff','--name-only','--diff-filter=U').split('\n').filter(Boolean).sort();};
  // Resolves every hand-written conflict to this branch's side, as an author keeping the branch's text would.
  const keepOurs=root=>{
    const stages=new Map();
    for(const line of ok(root,'ls-files','-u','-z').split('\0').filter(Boolean)){const tab=line.indexOf('\t'),file=line.slice(tab+1);stages.set(file,[...(stages.get(file)||[]),line.slice(0,tab).split(' ')[2]]);}
    for(const [file,list]of stages){
      if(/^Akari_\d+_\d+_\d+\.html$|^audit\/manifests\/release-/.test(file))continue;
      if(list.includes('2')){ok(root,'checkout','--ours','--',file);ok(root,'add','--',file);}
      else {ok(root,'rm','-q','--cached','--',file);fs.rmSync(path.join(root,file),{force:true});}
    }
  };
  const noOldRelease=(root,files,version,old)=>{for(const file of files){assert.ok(!old.test(read(root,file)),file+' names an old release');assert.ok(read(root,file).includes(version),file);}};
  try{
    // The second branch renumbers with the command after merging main: 1.5.3, and the change guard passes.
    await check(async()=>{
      const root=fixture();twoBranches(root);
      assert.deepEqual(takeIn(root),['Akari_1_5_2.html','audit/manifests/release-1.5.2.json'],'only generated outputs conflict');
      write(root,'NEW.md','あかり 1.5.2 の新しい文書\n');
      const r=cp.spawnSync(process.execPath,[command,'--base','main'],{cwd:root,env:process.env,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/^Release 1\.5\.2 -> 1\.5\.3 /);
      commitAll(root,'merge main');
      assert.deepEqual(fs.readdirSync(root).filter(name=>/^(?:Akari|LANGUAGE)_/.test(name)).sort(),['Akari_1_5_3.html','LANGUAGE_1_5_3.md']);
      assert.ok(read(root,'Akari_1_5_3.html').includes("'first, changed'")&&read(root,'Akari_1_5_3.html').includes("'second, changed'"));
      assert.equal(read(root,'Akari_1_5_3.html'),buildProduct({root}).html);
      noOldRelease(root,['README.md','AUDIT.md','MANUAL.html','NEW.md','src/css/screens.css','src/js/00-start.js','LANGUAGE_1_5_3.md'],'1.5.3',/1\.5\.[12](?!\d)/);
      assert.equal(read(root,'TOOLS.md'),'Playwright 1.5.1 で確かめる\n','tool versions stay');
      assert.ok(read(root,'README.md').includes('製品版 1.5.3 の新しい機能'));
      for(const file of ['audit/manifests/features.json','audit/manifests/language-form-coverage.json','audit/browser/browser-audit-manifest.json'])assert.equal(JSON.parse(read(root,file)).productVersion,'1.5.3',file);
      const meta=JSON.parse(read(root,'audit/public-files.json'));
      assert.equal(meta.productFile,'Akari_1_5_3.html');assert.ok(meta.files.includes('audit/manifests/release-1.5.3.json')&&meta.files.includes('LANGUAGE_1_5_3.md'));
      assert.deepEqual(fs.readdirSync(path.join(root,'audit/manifests')).filter(name=>name.startsWith('release-')),['release-1.5.3.json']);
      verifyLanguageRelease(root);
      const report=await changeGuard({repo:root,base:'main',head:'second'});
      assert.equal(report.status,'PASS',JSON.stringify(report));assert.deepEqual(report.version,{base:'1.5.2',head:'1.5.3',expected:'1.5.3',productChanged:true});
      // Renumbering again changes nothing.
      assert.deepEqual(renumberRelease(root,{base:'main'}).changed,[]);
    });
    // Main moved two releases ahead and the author kept this branch's side of every hand-written conflict:
    // the branch's own 1.5.2, main's 1.5.3 and the start's 1.5.1 all follow to 1.5.4.
    await check(async()=>{
      const root=fixture();twoBranches(root);
      ok(root,'checkout','-q','-b','third','main');edit(root,'src/js/01-first.js',"'first, changed'","'first, third'");
      assert.equal(renumberRelease(root,{base:'main'}).version,'1.5.3');commitAll(root,'third');
      ok(root,'checkout','-q','main');ok(root,'merge','-q','--ff-only','third');ok(root,'checkout','-q','second');
      assert.ok(takeIn(root).some(file=>file==='audit/public-files.json'),'hand-written files conflict');keepOurs(root);
      // Both language documents stay without a conflict; the author merges main's into the branch's.
      assert.deepEqual(fs.readdirSync(root).filter(name=>name.startsWith('LANGUAGE_')).sort(),['LANGUAGE_1_5_2.md','LANGUAGE_1_5_3.md']);
      assert.throws(()=>renumberRelease(root,{base:'main'}),/merge the language documents into one by hand first: LANGUAGE_1_5_2\.md, LANGUAGE_1_5_3\.md/);
      ok(root,'rm','-q','-f','--','LANGUAGE_1_5_3.md');
      const result=renumberRelease(root,{base:'main'});
      assert.deepEqual([result.previous,result.baseVersion,result.version],['1.5.2','1.5.3','1.5.4']);
      commitAll(root,'merge main');
      assert.deepEqual(fs.readdirSync(root).filter(name=>/^(?:Akari|LANGUAGE)_/.test(name)).sort(),['Akari_1_5_4.html','LANGUAGE_1_5_4.md']);
      assert.ok(read(root,'Akari_1_5_4.html').includes("'first, third'")&&read(root,'Akari_1_5_4.html').includes("'second, changed'"));
      noOldRelease(root,['README.md','AUDIT.md','MANUAL.html','src/css/screens.css','src/js/00-start.js','LANGUAGE_1_5_4.md'],'1.5.4',/1\.5\.[123](?!\d)/);
      for(const file of ['audit/manifests/features.json','audit/manifests/language-form-coverage.json','audit/browser/browser-audit-manifest.json'])assert.equal(JSON.parse(read(root,file)).productVersion,'1.5.4',file);
      verifyLanguageRelease(root);
      const report=await changeGuard({repo:root,base:'main',head:'second'});
      assert.equal(report.status,'PASS',JSON.stringify(report));assert.equal(report.version.expected,'1.5.4');
    });
    // A branch that changes no product follows the base's version and changes nothing more.
    await check(async()=>{
      const root=fixture();twoBranches(root);
      ok(root,'checkout','-q','-b','words','start');append(root,'README.md','\n言葉だけを直す\n');commitAll(root,'words');
      assert.deepEqual(takeIn(root),[]);
      const result=renumberRelease(root,{base:'main'});
      assert.deepEqual([result.version,result.productChanged,result.changed],['1.5.2',false,[]]);
      const report=await changeGuard({repo:root,base:'main',head:'words'});assert.equal(report.status,'PASS',JSON.stringify(report));
    });
    // Refusals change nothing.
    const refused=async(prepare,message,{base='main',at=root=>root}={})=>check(()=>{const root=fixture();prepare(root);const before=snapshot(root);assert.throws(()=>renumberRelease(at(root),{base}),message);assert.deepEqual(snapshot(root),before);});
    await refused(root=>{twoBranches(root);edit(root,'src/js/02-second.js',"'second, changed'","'second, changed again'");commitAll(root,'later');},/does not contain main/);
    await refused(root=>{twoBranches(root);git(root,'rebase','main');},/a rebase is in progress/);
    await refused(root=>{twoBranches(root);takeIn(root);},/run from the repository root/,{at:root=>path.join(root,'audit')});
    await refused(root=>{twoBranches(root,{second:r=>edit(r,'src/js/01-first.js',"'first'","'first, from second'")});takeIn(root);},/resolve these conflicts by hand first: src\/js\/01-first\.js/);
    await refused(root=>{twoBranches(root);takeIn(root);edit(root,'README.md','説明','<<<<<<< ours\n説明\n=======\n解説\n>>>>>>> main');ok(root,'add','README.md');},/resolve these conflicts by hand first: README\.md/);
    // A committed line that diff shows as "+++ …" does not hide the lines after it; an untracked file is read whole.
    await refused(root=>{twoBranches(root,{second:r=>write(r,'audit/notes.txt','++ x\nfixture for 1.5.2\n')});takeIn(root);},/earlier release \(1\.5\.2[^)]*\)[^]*audit\/notes\.txt: fixture for 1\.5\.2/);
    await refused(root=>{twoBranches(root);takeIn(root);write(root,'audit/untracked.txt','fixture for 1.5.2\n');},/earlier release[^]*audit\/untracked\.txt: fixture for 1\.5\.2/);
    await refused(root=>{twoBranches(root);ok(root,'checkout','-q','-b','raise','main');edit(root,'src/js/00-start.js',"'1.5.2'","'1.6.0'");edit(root,'src/js/01-first.js',"'first, changed'","'first, raised'");},/names 1\.6\.0, above 1\.5\.3/);
    await refused(root=>{twoBranches(root);takeIn(root);write(root,'PUBLIC_SYNC.json','{}\n');},/public development repository/);
    await refused(root=>{twoBranches(root);takeIn(root);write(root,'.release-renumber-left/README.md','backup\n');},/left its recovery files/);
    await refused(root=>{twoBranches(root);takeIn(root);write(root,'LANGUAGE_1_5_3.md','collision\n');},/merge the language documents into one by hand first/);
    // A failure after the language release has written (the gate's document check) restores every file.
    await refused(root=>{twoBranches(root);takeIn(root);write(root,'ODD.md','9.9.9 は別の版\n');},/documents still name another product file or release[^]*\nODD\.md:1 9\.9\.9$/);
    await refused(root=>{twoBranches(root);takeIn(root);},/unknown base nowhere/,{base:'nowhere'});
  }finally{
    for(const [key,value]of Object.entries(saved))if(value===undefined)delete process.env[key];else process.env[key]=value;
    fs.rmSync(scratch,{recursive:true,force:true});
  }
  return count;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log('Release renumber: '+await runReleaseRenumberChecks()+' PASS');
