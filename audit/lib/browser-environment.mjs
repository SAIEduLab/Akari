import assert from 'node:assert/strict';
// The audit pins no browser. CI installs the newest Stable Chrome for Testing (audit/install-codec-browser.py) and
// the newest Playwright (.github/workflows), as a run's plan read them once for all its jobs (audit/lib/ci-lanes.mjs
// newestReleases), and each report records the versions it ran on. A check accepts any
// release number at or above the oldest pair the audit was last run with, so an older browser or Playwright, or a
// value that names none, is refused; and one report names one browser and one Playwright throughout.
export const browserEnvironment={revision:'chrome-for-testing',launchTimeout:15000};
// The oldest versions a report may name: the pair this audit was last run with in full. Raise them, never lower (the
// change guard counts a lower one as an audit change that checks less).
export const oldestBrowser='153.0.8010.12',oldestPlaywright='1.63.0';
// The pair the test fixtures name: the oldest pair, so every check accepts it. A fixture names it as a value of the
// right form, not as the record of a run.
export const fixtureEnvironment=Object.freeze({browser:oldestBrowser,playwright:oldestPlaywright});
const parts=(value,count,label)=>{
  assert.equal(typeof value,'string',label+' is a release number');
  assert.match(value,new RegExp('^\\d+(?:\\.\\d+){'+(count-1)+'}$'),label+' is a release number');
  return value.split('.').map(Number);
};
const atLeast=(value,oldest,count,label)=>{
  const a=parts(value,count,label),b=parts(oldest,count,label),i=a.findIndex((n,k)=>n!==b[k]);
  assert.ok(i<0||a[i]>b[i],label+' '+value+' is older than '+oldest);
  return value;
};
export const checkBrowserVersion=(value,label='Chrome')=>atLeast(value,oldestBrowser,4,label);
export const checkPlaywrightVersion=(value,label='Playwright')=>atLeast(value,oldestPlaywright,3,label);
// A report's environment that holds exactly the browser and the Playwright it ran on, and the other named fields.
// Returns the environment it accepted.
export function checkReportEnvironment(environment,others=[]){
  assert.ok(environment&&typeof environment==='object','environment recorded');
  assert.deepEqual(Object.keys(environment).sort(),['browser','playwright',...others].sort());
  checkBrowserVersion(environment.browser);checkPlaywrightVersion(environment.playwright);
  return environment;
}
export function verifyBrowserEnvironment(report,inputs){
  assert.equal(report.status,'PASS');assert.deepEqual(report.snapshot,inputs);
  checkPlaywrightVersion(report.playwright);
  assert.equal(report.revision,browserEnvironment.revision);
  checkBrowserVersion(report.browser);
  assert.equal(report.launchTimeout,browserEnvironment.launchTimeout);
  assert.match(report.executableSha256,/^[a-f0-9]{64}$/);
  assert.ok(report.executablePath);assert.equal(report.launches.length,3);
  for(const [i,launch] of report.launches.entries()){
    assert.equal(launch.id,i+1);assert.equal(launch.browser,report.browser,'one browser for every launch');
    assert.equal(launch.scriptResult,42);assert.equal(launch.mp3,true);
    assert.ok(Number.isFinite(launch.ms)&&launch.ms>=0&&launch.ms<=browserEnvironment.launchTimeout);
  }
}
