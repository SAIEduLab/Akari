const assert=require('node:assert/strict');

// Playwright 1.55 enables focus emulation on its own main-frame CDP session, and
// 1.63 still keeps that session. Chromium 140 returns early when a DIFFERENT session, whose
// flag is already false, receives false. Disable it on the owning session, not a
// new CDPSession. The adapter reaches Playwright's internals, so it fails closed
// when they change shape; the headed stage-gesture case then proves real focus.
async function disableFocusEmulation(page) {
  const version=require('playwright/package.json').version;
  assert.match(version,/^\d+\.\d+\.\d+$/,'native focus adapter needs a Playwright release');
  const connection=page._connection;
  assert.equal(typeof connection?.toImpl,'function','local Playwright connection required');
  const impl=connection.toImpl(page);
  const session=impl?.delegate?._mainFrameSession?._client;
  assert.equal(typeof session?.send,'function','owning Chromium CDP session required');
  await session.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  return {playwright:version,session:'playwright-main-frame',enabled:false};
}
module.exports={disableFocusEmulation};
