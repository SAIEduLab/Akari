import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {snapshot,withBrowser,sha} from '../lib/product-test-host.mjs';

// Additional documentation checks; does not replace any product acceptance test.
const [browserPath,output]=process.argv.slice(2);
assert.ok(output && !fs.existsSync(output),'new documentation evidence directory required');
fs.mkdirSync(output,{recursive:true});
const pages=['index.html','MANUAL.html','Manual/block-mode.html','Manual/code-mode-beginner.html','Manual/code-mode-intermediate.html','Manual/code-mode-advanced.html'];
const before=snapshot('Akari.html');
const html=fs.readFileSync('Akari.html','utf8');
const context=vm.createContext({console,TextEncoder,TextDecoder,Blob,URL,structuredClone,setTimeout,clearTimeout});
vm.runInContext(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')),context,{timeout:30000});
const api=vm.runInContext('Akari',context);
const decode=s=>s.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const sources=Object.fromEntries(pages.map(p=>[p,fs.readFileSync(p,'utf8')]));
const snippets=[];const links=[];
for(const [file,source] of Object.entries(sources)){
  const ids=[...source.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,file+': duplicate IDs');
  assert.equal((source.match(/<h1[ >]/g)||[]).length,1,file+': one main heading');
  assert.ok(source.includes('lang="ja"')&&source.includes('name="viewport"'));
  for(const [index,m] of [...source.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)].entries()){
    const code=decode(m[1].replace(/<[^>]+>/g,''));
    const parsed=api.parseSyntax(code);
    assert.ok(parsed.ast,file+': example '+(index+1)+' '+JSON.stringify(parsed.syntaxDiagnostics));
    snippets.push({file,index:index+1,sha256:sha(code),status:'SYNTAX_PASS'});
  }
  for(const m of source.matchAll(/\bhref="([^"]+)"/g)){
    const href=decode(m[1]);if(/^(https?:|mailto:)/.test(href))continue;
    const [relative,anchor]=href.split('#');
    const target=path.normalize(path.join(path.dirname(file),decodeURIComponent(relative||path.basename(file))));
    assert.ok(fs.existsSync(target),file+': missing '+href);
    if(anchor && target.endsWith('.html'))assert.ok(fs.readFileSync(target,'utf8').includes('id="'+decodeURIComponent(anchor)+'"'),file+': missing anchor '+href);
    links.push({file,href});
  }
}
// Include the inline alternate command examples as well as complete preformatted examples.
for(const file of pages){
  for(const m of sources[file].matchAll(/<code\b[^>]*>([^<]+)<\/code>/g)){
    const code=decode(m[1]);if(!code.endsWith('。'))continue;
    assert.ok(api.parseSyntax(code).ast,file+': inline command '+code);
  }
}
for(const m of fs.readFileSync('README.md','utf8').matchAll(/\]\((\.\/[^)]+)\)/g)){
  const [p,anchor]=m[1].split('#');assert.ok(fs.existsSync(p),'README: '+m[1]);
  if(anchor && p.endsWith('.html'))assert.ok(fs.readFileSync(p,'utf8').includes('id="'+anchor+'"'));
}
const report={status:'STATIC_PASS',snapshot:before,snippets,internalLinks:links.length,pages,views:[],limits:['No physical mobile, native Japanese IME input, user study or learning-effect measurement.','Syntax acceptance is not execution success for examples requiring declared data, assets or callable context.']};
if(browserPath!=='--static'){
  await withBrowser(browserPath,async browser=>{
    report.browser=browser.version();
    const ctx=await browser.newContext({offline:true});const errors=[],network=[];
    await ctx.route(/^https?:/,r=>{network.push(r.request().url());return r.abort();});
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
    try{
      for(const width of [1366,768,390])for(const file of pages){
        await page.setViewportSize({width,height:900});
        await page.goto(pathToFileURL(path.resolve(file)).href);
        await page.emulateMedia({reducedMotion:'reduce'});
        const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,heading:document.querySelector('h1').textContent}));
        assert.ok(metrics.scroll<=metrics.width+1,file+': page overflow '+JSON.stringify(metrics));
        await page.keyboard.press('Tab');assert.equal(await page.locator('.skip-link').evaluate(e=>e===document.activeElement),true);
        await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>location.hash),'#main-content');
        for(const detail of await page.locator('details').all()){
          const summary=detail.locator('summary');await summary.focus();const was=await detail.evaluate(e=>e.open);
          await page.keyboard.press('Enter');assert.equal(await detail.evaluate(e=>e.open),!was);
          await detail.evaluate(e=>{e.open=true;});
        }
        await page.evaluate(()=>window.scrollTo(0,0));
        const name=file.replaceAll('/','-').replace('.html','')+'-'+width;
        await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
        report.views.push({file,width,...metrics,screenshot:name+'.png'});
      }
      await page.setViewportSize({width:1366,height:900});
      await page.goto(pathToFileURL(path.resolve('MANUAL.html')).href);
      const first=await page.locator('[data-example="first-move"]').textContent();
      await page.goto(pathToFileURL(path.resolve('Akari.html')).href);
      await page.waitForFunction(()=>!!globalThis.Akari?.app);
      page.on('dialog',d=>d.accept());
      async function reveal(l){
        if(!await l.isVisible())for(const p of await l.locator('xpath=ancestor::*[contains(concat(" ",normalize-space(@class)," ")," blockui-side-folded ")]').all())await p.locator('.blockui-side-toggle').click();
        for(const d of await l.locator('xpath=ancestor::details[not(@open)]').all())await d.locator(':scope > summary').click();
        return l;
      }
      // Create an actual standard character through the toolbox; no product mutation via API.
      const tool=page.locator('.tool[data-type="sprite"]').first();
      await (await reveal(tool)).click();
      const target=await page.locator('#objectSelect').inputValue();assert.notEqual(target,'stage');
      await (await reveal(page.locator('#eventSelect'))).selectOption('click');
      await (await reveal(page.locator('#codeEditor'))).fill(first);
      await page.waitForFunction(s=>Akari.app.editorState.main.sourceText===s,first);
      const node=page.locator('.component[data-id="'+target+'"]');
      const start=await node.evaluate(e=>parseFloat(e.style.left));
      await (await reveal(page.locator('#runBtn'))).click();
      await page.waitForFunction(()=>Akari.app.editorState.state==='RUNNING');
      await node.click();
      await page.waitForFunction(({target,start})=>Math.abs(parseFloat(document.querySelector('.component[data-id="'+target+'"]').style.left)-start-10)<0.1,{target,start});
      await (await reveal(page.locator('#stopBtn'))).click();
      assert.deepEqual(await page.evaluate(()=>Akari.app.compile().errors),[]);
      await page.screenshot({path:path.join(output,'first-work-editor.png'),fullPage:true});
      report.firstWork={status:'PASS',target,expectedMovement:10};
    }finally{await ctx.close();}
    assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
  });
  report.status='PASS';
}
assert.deepEqual(snapshot('Akari.html'),before);
fs.writeFileSync(path.join(output,'manual-docs.json'),JSON.stringify(report,null,2)+'\n');
console.log('Documentation: '+report.status+'; '+snippets.length+' syntax examples; '+links.length+' local links; '+report.views.length+' browser views');
