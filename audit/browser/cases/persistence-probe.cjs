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
module.exports={installStorageProbe};
