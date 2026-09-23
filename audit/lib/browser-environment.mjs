import assert from 'node:assert/strict';
export const browserEnvironment={playwright:'1.55.0',revision:'1187',version:'140.0.7339.16',launchTimeout:15000};
export function verifyBrowserEnvironment(report,inputs){
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
  assert.equal(report.playwright,browserEnvironment.playwright);
  assert.equal(report.revision,browserEnvironment.revision);
  assert.equal(report.browser,browserEnvironment.version);
  assert.equal(report.launchTimeout,browserEnvironment.launchTimeout);
  assert.match(report.executableSha256,/^[a-f0-9]{64}$/);
  assert.ok(report.executablePath);assert.equal(report.launches.length,3);
  for(const [i,launch] of report.launches.entries()){
    assert.equal(launch.id,i+1);assert.equal(launch.browser,browserEnvironment.version);
    assert.equal(launch.scriptResult,42);assert.equal(launch.mp3,true);
    assert.ok(Number.isFinite(launch.ms)&&launch.ms>=0&&launch.ms<=browserEnvironment.launchTimeout);
  }
}
