const assert = require('node:assert/strict');
// Test-side instrumentation runs before product startup, including reloads.
async function installStorageProbe(page) {
  await page.addInitScript(() => {
    window.__persistenceCalls = [];
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        __persistenceCalls.push({api: this === localStorage ? 'localStorage' : 'sessionStorage', method, key: args[0]});
        return original.apply(this, args);
      };
    }
    for (const method of ['open', 'deleteDatabase', 'databases']) {
      const original = indexedDB[method]?.bind(indexedDB);
      if (original) indexedDB[method] = (...args) => {
        __persistenceCalls.push({api: 'indexedDB', method, key: args[0]});
        return original(...args);
      };
    }
  });
}
async function assertNoPersistence(page) {
  const calls = await page.evaluate(() => __persistenceCalls);
  assert.ok(calls.some(c => c.api === 'localStorage' && c.method === 'getItem' && c.key === 'akari.uiLevel.v1'), 'startup probe observed');
  assert.ok(calls.every(c => c.api === 'localStorage' && ['getItem', 'setItem'].includes(c.method) && c.key === 'akari.uiLevel.v1'), JSON.stringify(calls));
  assert.equal(await page.locator('#autosaveState,#recoveryModal,#recoveryRestore,#recoveryDiscard').count(), 0);
  return calls;
}
async function seedRetiredRecords(page, corrupt) {
  return page.evaluate(async corrupt => {
    const project = Akari.makeDefaultProject();
    project.name = '旧ブラウザー記録を復元してはいけない';
    if (corrupt) project.components[1].id = project.components[0].id;
    const record = {id:'latest', updatedAt:Date.now(), project, assets:[], selectedId:'stage', currentEvent:'start', lastSavedFingerprint:'', callableDraft:null};
    const fallback = JSON.stringify(record);
    localStorage.setItem('akari.autosave.f3', fallback);
    await new Promise((resolve,reject) => {
      const request = indexedDB.open('akari-workspace-f3',1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace',{keyPath:'id'});
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db=request.result, tx=db.transaction('workspace','readwrite');
        tx.objectStore('workspace').put(record);
        tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
    return {record,fallback};
  }, corrupt);
}
async function readRetiredRecords(page) {
  return page.evaluate(async () => {
    const fallback=localStorage.getItem('akari.autosave.f3');
    const record=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('akari-workspace-f3',1);
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readonly'),get=tx.objectStore('workspace').get('latest');get.onsuccess=()=>{const value=get.result;tx.oncomplete=()=>{db.close();resolve(value);};};tx.onerror=()=>{db.close();reject(tx.error);};};
    });
    return {record,fallback};
  });
}
module.exports={installStorageProbe,assertNoPersistence,seedRetiredRecords,readRetiredRecords};
