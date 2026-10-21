import regressionFixture from '../fixtures/regression-project.cjs';
export const makeRegressionProject=regressionFixture.makeRegressionProject;
// Import the baseline project through the real file UI; do not replace Akari APIs.
export async function installRegressionProject(page) {
  await page.evaluate('// Baseline fixture factory\n'+makeRegressionProject.toString());
  const fixture=await page.evaluate(()=>{const p=makeAkariRegressionProject(Akari);p.name='監査の基準作品';return {name:p.name,text:Akari.serializeProject(p,Akari.makeDefaultAssetStore())};});
  await page.locator('#fileInput').setInputFiles({name:'baseline-ui.akari.md',mimeType:'text/plain',buffer:Buffer.from(fixture.text)});
  await page.waitForFunction(name=>!document.querySelector('#fileInput').value&&Akari.app.project.name===name&&Akari.app.editorState.state==='DESIGN',fixture.name,{polling:100});
  await showAdvancedCode(page);
}
export async function showAdvancedCode(page) {
  await page.locator('#uiLevel').selectOption('advanced');
  if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();
  await page.locator('#editorModecode').click();
}

// keepRunning: the greeting body then waits 10 seconds, so the run has not ended (an ended run shows ■ 止める only).
export async function installGreetingFixture(page,{keepRunning=false}={}) {
  // The fixed greeting fixture uses the normal event selector.
  if(await page.locator('#uiLevel').inputValue()==='entry')await page.locator('#uiLevel').selectOption('basic');
  const text=await page.evaluate(keepRunning=>{const p=Akari.makeDefaultProject();if(keepRunning)p.scripts[0].source+='\n  10秒待つ。';return Akari.serializeProject(p,Akari.makeDefaultAssetStore());},keepRunning);
  await page.locator('#fileInput').setInputFiles({name:'greeting-fixture.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN'&&Akari.app.project.name==='はじめてのあかり');
  await page.locator('#objectSelect').selectOption('sprite-1');
  await page.locator('#eventSelect').selectOption('start');
}

// Keep the actor named in the fixed regression sources explicit in native UI fixtures.
export async function nameLegacyFixtureActor(page) {
  await page.locator('#formSurface .component[data-id="sprite-1"]').click();
  const name=page.locator('#properties input[aria-label="名前"]');
  const folded=!(await name.isVisible());
  if(folded)await page.locator('.properties-window .blockui-side-toggle').click();
  await name.fill('あかり');await name.press('Tab');
  await page.waitForFunction(()=>Akari.app.project.components[0].name==='あかり');
  if(folded)await page.locator('.properties-window .blockui-side-toggle').click();
}
