import regressionFixture from '../fixtures/regression-project.cjs';
export const makeRegressionProject=regressionFixture.makeRegressionProject;
// Import the baseline project through the real file UI; do not replace Akari APIs.
export async function installRegressionProject(page) {
  await page.evaluate('// Baseline fixture factory\n'+makeRegressionProject.toString());
  const fixture=await page.evaluate(()=>{const p=makeAkariRegressionProject(Akari);p.name='監査の基準作品';return {name:p.name,text:Akari.serializeProject(p,Akari.makeDefaultAssetStore())};});
  await page.locator('#fileInput').setInputFiles({name:'baseline-ui.akari.md',mimeType:'text/plain',buffer:Buffer.from(fixture.text)});
  await page.waitForFunction(name=>Akari.app.project.name===name,fixture.name);
  await showAdvancedCode(page);
}
export async function showAdvancedCode(page) {
  await page.locator('#uiLevel').selectOption('advanced');
  if(await page.locator('#sourceOverview').isVisible())await page.locator('#sourceEditBtn').click();
  await page.locator('#editorModecode').click();
}

export async function installGreetingFixture(page) {
  const text=await page.evaluate(()=>Akari.serializeProject(Akari.makeDefaultProject(),Akari.makeDefaultAssetStore()));
  await page.locator('#fileInput').setInputFiles({name:'greeting-fixture.akari.md',mimeType:'text/plain',buffer:Buffer.from(text)});
  await page.waitForFunction(()=>Akari.app.editorState.state==='DESIGN'&&Akari.app.project.name==='はじめてのあかり');
  await page.locator('#objectSelect').selectOption('sprite-1');
  await page.locator('#eventSelect').selectOption('start');
}
