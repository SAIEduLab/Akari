const assert=require('node:assert/strict');

// Playwright 1.55 enables focus emulation on its own main-frame CDP session.
// Chromium 140 returns early when a DIFFERENT session, whose flag is already
// false, receives false. Disable it on the owning session, not a new CDPSession.
// This adapter is deliberately version-locked and fails closed on API changes.
async function disableFocusEmulation(page) {
  const version=require('playwright/package.json').version;
  assert.equal(version,'1.55.0','native focus adapter requires reviewed Playwright');
  const connection=page._connection;
  assert.equal(typeof connection?.toImpl,'function','local Playwright connection required');
  const impl=connection.toImpl(page);
  const session=impl?.delegate?._mainFrameSession?._client;
  assert.equal(typeof session?.send,'function','owning Chromium CDP session required');
  await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  return {playwright:version,session:'playwright-main-frame',enabled:false};
}
module.exports={disableFocusEmulation};
