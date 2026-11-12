import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {planLanguageRelease,applyLanguageRelease,prepareLanguageRelease,verifyLanguageRelease,languageLinks} from '../lib/language-release.mjs';
import {languageFileForVersion} from '../lib/product-path.cjs';
import {refusedAs} from '../lib/refusal.cjs';

export function runLanguageReleaseChecks() {
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'akari-language-test-'));let count=0;
  const write=(root,file,value)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
  const read=(root,file)=>fs.readFileSync(path.join(root,file),'utf8');
  const snapshot=root=>{
    const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
    return Object.fromEntries(walk(root).sort().map(p=>[path.relative(root,p),fs.readFileSync(p).toString('base64')]));
  };
  const fixture=()=>{
    const root=fs.mkdtempSync(path.join(scratch,'repo-'));
    const files=['Akari_1_5_1.html','LANGUAGE.md','LICENSE','README.md','EXTENSIONS.md','extensions/limits.md','audit/public-files.json','audit/manifests/features.json','audit/manifests/release-1.5.1.json','audit/manifests/component-controls-traceability.json'];
    files.push('MANUAL.html','Manual/guide.html','index.html');
    const data={schema:'akari-public-files-v1',productVersion:'1.5.1',productFile:'Akari_1_5_1.html',files:files.sort()};
    write(root,'audit/public-files.json',data);
    write(root,'Akari_1_5_1.html',"<script>const PRODUCT_RELEASE = '1.5.1';</script>");
    write(root,'LANGUAGE.md','# あかり 1.5.1 — 使い方\n製品版は1.5.1です。`Akari_1_5_1.html`。\n本文の数は5です。\n');
    write(root,'LICENSE','MIT License\n');write(root,'README.md','[仕様](./LANGUAGE.md#save)\n[`LANGUAGE.md`](./LANGUAGE.md)\nLANGUAGE.md is a stable reference.\n');
    write(root,'EXTENSIONS.md','[仕様](LANGUAGE.md)\n');write(root,'extensions/limits.md','[仕様](../LANGUAGE.md)\n');
    write(root,'audit/manifests/features.json',{EXECUTABLE_CONTRACT:{languageContractId:4,runtimeContractId:4,programFormatVersion:4,projectFormatVersion:5}});
    write(root,'audit/manifests/release-1.5.1.json',{});
    write(root,'audit/manifests/component-controls-traceability.json',{uiContracts:[{specification:{path:'LANGUAGE.md',text:'independent expected wording'}}]});
    write(root,'MANUAL.html','<a href="./LANGUAGE.md">仕様</a>');write(root,'Manual/guide.html',"<a href='../LANGUAGE.md#save'>仕様</a>");write(root,'index.html','<a href="./LANGUAGE.md">仕様</a>');
    return root;
  };
  const check=fn=>{fn();count++;};
  const nextVersion=(root,version)=>{
    const meta=JSON.parse(read(root,'audit/public-files.json')),previous=meta.productFile;
    meta.productVersion=version;meta.productFile='Akari_'+version.replaceAll('.','_')+'.html';
    meta.files=meta.files.map(file=>file===previous?meta.productFile:file);
    fs.renameSync(path.join(root,previous),path.join(root,meta.productFile));
    write(root,meta.productFile,"<script>const PRODUCT_RELEASE = '"+version+"';</script>");
    write(root,'audit/public-files.json',meta);
  };
  try{
    {
      const root=fixture(),source=read(root,'LANGUAGE.md'),product=read(root,'Akari_1_5_1.html');
      check(()=>{prepareLanguageRelease(root);assert.equal(read(root,'LANGUAGE_1_5_1.md'),source);assert.ok(!fs.existsSync(path.join(root,'LANGUAGE.md')));assert.equal(read(root,'Akari_1_5_1.html'),product);});
      check(()=>assert.deepEqual(prepareLanguageRelease(root),[]));
      for(const version of ['1.5.2','1.5.3'])check(()=>{
        nextVersion(root,version);prepareLanguageRelease(root);
        const current=languageFileForVersion(version),meta=JSON.parse(read(root,'audit/public-files.json'));
        assert.deepEqual(fs.readdirSync(root).filter(p=>/^LANGUAGE.*\.md$/.test(p)),[current]);
        assert.ok(read(root,current).includes('製品版は'+version+'です。'));assert.ok(read(root,current).includes('本文の数は5です。'));
        assert.equal(languageLinks('README.md',read(root,'README.md'))[0].resolved,current);
        assert.ok(read(root,'README.md').includes('LANGUAGE.md is a stable reference.'));
        assert.ok(read(root,'README.md').includes('[`'+current+'`](./'+current+')'));
        assert.equal(JSON.parse(read(root,'audit/manifests/component-controls-traceability.json')).uiContracts[0].specification.path,current);
        const record=JSON.parse(read(root,'audit/manifests/release-'+version+'.json'));assert.ok(record.files[current]);
        assert.equal(fs.readdirSync(path.join(root,'audit/manifests')).filter(p=>/^release-/.test(p)).length,1);
        assert.ok(meta.files.includes(current));assert.ok(meta.files.includes('audit/manifests/release-'+version+'.json'));
        for(const file of ['MANUAL.html','Manual/guide.html','index.html'])assert.equal(languageLinks(file,read(root,file))[0].resolved,current);
      });
      const failures=[
        root=>write(root,'LANGUAGE_1_5_1.md','collision'),
        root=>fs.unlinkSync(path.join(root,'LANGUAGE.md')),
        root=>{const m=JSON.parse(read(root,'audit/public-files.json'));m.files.push('../outside.md');write(root,'audit/public-files.json',m);},
        root=>{const m=JSON.parse(read(root,'audit/public-files.json'));m.files.push('LANGUAGE.md');write(root,'audit/public-files.json',m);},
        root=>write(root,'Akari_1_5_1.html',"<script>const PRODUCT_RELEASE = '9.9.9';</script>"),
        root=>write(root,'audit/manifests/release-9.9.9.json',{}),
      ];
      for(const mutate of failures)check(()=>{const r=fixture();mutate(r);const before=snapshot(r);assert.throws(()=>prepareLanguageRelease(r),refusedAs('language-release#1'));assert.deepEqual(snapshot(r),before);});
      check(()=>{const r=fixture(),before=snapshot(r),plan=planLanguageRelease(r);assert.throws(()=>applyLanguageRelease(plan,{beforeWrite(_file,index){if(index===2)throw Error('injected write failure');}}),/injected write failure/);assert.deepEqual(snapshot(r),before);});
      check(()=>{const r=fixture(),plan=planLanguageRelease(r);write(r,'README.md','concurrent edit');const before=snapshot(r);assert.throws(()=>applyLanguageRelease(plan),/release input changed/);assert.deepEqual(snapshot(r),before);});
      check(()=>{const r=fixture(),plan=planLanguageRelease(r),before=snapshot(r);plan.changes.set('src/forbidden.js',{before:null,after:Buffer.from('changed'),mode:0o644});assert.throws(()=>applyLanguageRelease(plan),/protected/);assert.deepEqual(snapshot(r),before);});
    }
    for(const [source,expected]of [
      ['[仕様][language]\n\n[language]: ./LANGUAGE.md','[仕様][language]\n\n[language]: ./LANGUAGE_1_5_1.md'],
      ['[仕様](./LANGUAGE.md \"仕様書\")','[仕様](./LANGUAGE_1_5_1.md \"仕様書\")'],
      ['[仕様](<./LANGUAGE.md> \"仕様書\")','[仕様](<./LANGUAGE_1_5_1.md> \"仕様書\")'],
      ['<a HREF=\"./LANGUAGE.md\">仕様</a>','<a HREF=\"./LANGUAGE_1_5_1.md\">仕様</a>'],
      ['<a href = \"./LANGUAGE.md\">仕様</a>','<a href = \"./LANGUAGE_1_5_1.md\">仕様</a>'],
      ['<a href=LANGUAGE.md>仕様</a>','<a href=LANGUAGE_1_5_1.md>仕様</a>'],
    ])check(()=>{const root=fixture();write(root,'README.md',source);prepareLanguageRelease(root);assert.equal(read(root,'README.md'),expected);assert.equal(languageLinks('README.md',source).length,1);verifyLanguageRelease(root);});
    check(()=>{const root=fixture();prepareLanguageRelease(root);write(root,'README.md','[stale](./LANGUAGE_0_0_1.md)');const before=snapshot(root);assert.throws(()=>verifyLanguageRelease(root),/stale language/);assert.deepEqual(snapshot(root),before);});
    for(const [file,source]of [
      ['README.md','```text\n[例](./LANGUAGE.md)\n<a HREF=\"./LANGUAGE.md\">例</a>\n```\n'],
      ['README.md','`[例](./LANGUAGE.md)` and `<a href=\"./LANGUAGE.md\">例</a>`\n'],
      ['README.md','<!-- [例](./LANGUAGE.md) -->\n'],
      ['MANUAL.html','<!-- <a href=\"./LANGUAGE.md\">例</a> --><script>const x=\'<a href=\"./LANGUAGE.md\">例</a>\';</script><pre>&lt;a href=\"./LANGUAGE.md\"&gt;</pre>'],
    ])check(()=>{const root=fixture();write(root,file,source);prepareLanguageRelease(root);assert.equal(read(root,file),source);assert.deepEqual(languageLinks(file,source),[]);});
    for(const [file,source]of [
      ['README.md','設定値は href=\"./LANGUAGE.md\" と記録する。'],
      ['README.md','<div data-href=\"./LANGUAGE.md\">設定値</div>'],
      ['README.md','    [例](./LANGUAGE.md)\n'],
      ['README.md','\t[例](./LANGUAGE.md)\n'],
      ['MANUAL.html','設定値は href=\"./LANGUAGE.md\" と記録する。'],
      ['MANUAL.html','<div data-href=\"./LANGUAGE.md\" title=\'href=\"./LANGUAGE.md\"\'>設定値</div>'],
      ['MANUAL.html','<textarea><a href=\"./LANGUAGE.md\">例</a></textarea>'],
      ['MANUAL.html','<div href=\"./LANGUAGE.md\">設定値</div>'],
      ['README.md','文章 <script>const x=\"[例](./LANGUAGE.md)\";</script>'],
    ])check(()=>{const root=fixture();write(root,file,source);prepareLanguageRelease(root);assert.equal(read(root,file),source);assert.deepEqual(languageLinks(file,source),[]);});
    for(const [source,expected]of [
      ['- item\n\n    [仕様](./LANGUAGE.md)\n','- item\n\n    [仕様](./LANGUAGE_1_5_1.md)\n'],
      ['[仕様](./LANGUAGE%2Emd)','[仕様](./LANGUAGE_1_5_1.md)'],
      ['<a href=\"./LANGUAGE&#46;md?x=1&amp;y=2\">仕様</a>','<a href=\"./LANGUAGE_1_5_1.md?x=1&amp;y=2\">仕様</a>'],
    ])check(()=>{const root=fixture();write(root,'README.md',source);prepareLanguageRelease(root);assert.equal(read(root,'README.md'),expected);verifyLanguageRelease(root);});
    check(()=>{const root=fixture();write(root,'MANUAL.html','<a href=./LANGUAGE.md>仕様</a>');prepareLanguageRelease(root);assert.equal(read(root,'MANUAL.html'),'<a href=./LANGUAGE_1_5_1.md>仕様</a>');});
    for(const [source,expected]of [
      ['> [仕様](\n> ./LANGUAGE.md\n> )','> [仕様](\n> ./LANGUAGE_1_5_1.md\n> )'],
      ['> [language]:\n> ./LANGUAGE.md\n>\n> [仕様][language]','> [language]:\n> ./LANGUAGE_1_5_1.md\n>\n> [仕様][language]'],
      ['[仕様](./x%3F/../LANGUAGE.md)','[仕様](./LANGUAGE_1_5_1.md)'],
      ['[仕様](./x%23/../LANGUAGE.md)','[仕様](./LANGUAGE_1_5_1.md)'],
    ])check(()=>{const root=fixture();write(root,'README.md',source);prepareLanguageRelease(root);assert.equal(read(root,'README.md'),expected);verifyLanguageRelease(root);});
    check(()=>{const root=fixture(),source=read(root,'LANGUAGE.md')+'[この文書](#section)\n';write(root,'LANGUAGE.md',source);prepareLanguageRelease(root);assert.equal(read(root,'LANGUAGE_1_5_1.md'),source);});
    check(()=>assert.deepEqual(languageLinks('guide.md','[other](https://elsewhere.test/LANGUAGE.md) // LANGUAGE.md'),[]));
    // The published document named by its release name in the text, not only linked, follows the release too; the
    // release-free name LANGUAGE.md stays (the document's identity).
    {
      const root=fixture();prepareLanguageRelease(root);
      write(root,'README.md',read(root,'README.md')+'仕様は LANGUAGE_1_5_1.md の「動きの文」、`LANGUAGE_1_5_1.md` の「保存」。\n');
      write(root,'EXTENSIONS.md',read(root,'EXTENSIONS.md')+'<!-- LANGUAGE_1_5_1.md -->\n');
      check(()=>{
        nextVersion(root,'1.5.2');prepareLanguageRelease(root);const text=read(root,'README.md');
        assert.ok(text.includes('仕様は LANGUAGE_1_5_2.md の「動きの文」、`LANGUAGE_1_5_2.md` の「保存」。'),text);
        assert.ok(!text.includes('LANGUAGE_1_5_1.md')&&!read(root,'EXTENSIONS.md').includes('LANGUAGE_1_5_1.md'));
        assert.ok(text.includes('LANGUAGE.md is a stable reference.'));verifyLanguageRelease(root);
      });
    }
    return count;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log('Language release checks: '+runLanguageReleaseChecks()+' PASS');
