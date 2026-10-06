/* SPDX-License-Identifier: Apache-2.0 */
// Portable source: embed this factory in a derived editor and its exported player.
function createAkariProfiles(standardLimits, additionalDefaults) {
  'use strict';
  if (additionalDefaults === undefined) additionalDefaults = {};
  const locked = Object.freeze(['audioChannels', 'audioSampleRateMin', 'audioSampleRateMax', 'blockDepth', 'expressionDepth', 'callDepth']);
  const fractional = new Set(['audioDuration', 'audioDurationTotal']);
  const record = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
    (Object.getPrototypeOf(x) === null || (Object.prototype.toString.call(x) === '[object Object]' && Object.getPrototypeOf(x)?.constructor?.name === 'Object'));
  const keys = (x, expected) => record(x) && Reflect.ownKeys(x).length === expected.length && expected.every(k => Object.hasOwn(x, k));
  const fail = message => { const e = new Error(message); e.code = 'E_PROFILE'; throw e; };
  const validId = id => typeof id === 'string' && /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(id) && id.length <= 128;
  const validVersion = version => typeof version === 'string' && /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(version) && version.length <= 64;
  if (!record(standardLimits) || !record(additionalDefaults)) fail('上限の標準定義が不正です');
  for (const k of Object.keys(additionalDefaults)) if (Object.hasOwn(standardLimits, k)) fail('上限の標準定義が重複しています');
  const defaults = { ...standardLimits, ...additionalDefaults };
  for (const [k, v] of Object.entries(defaults)) if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || (!fractional.has(k) && !Number.isSafeInteger(v))) fail('上限の標準値が不正です: ' + k);
  const standard = Object.freeze(defaults);
  const registry = new Map();
  let selected = null;
  function hash(text) {
    const bytes = new TextEncoder().encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(size); padded.set(bytes); padded[bytes.length] = 128;
    const view = new DataView(padded.buffer); view.setUint32(size - 8, Math.floor(bytes.length / 536870912)); view.setUint32(size - 4, (bytes.length * 8) >>> 0);
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Uint32Array(64), rotate = (x,n) => (x >>> n) | (x << (32-n));
    for (let offset = 0; offset < size; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i*4);
      for (let i = 16; i < 64; i++) { const a = w[i-15], b = w[i-2]; w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10))) >>> 0; }
      let [a,b,c,d,e,f,g,h] = state;
      for (let i = 0; i < 64; i++) { const t1 = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^((~e)&g)) + constants[i] + w[i]) >>> 0, t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0; h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
      [a,b,c,d,e,f,g,h].forEach((x,i) => { state[i] = (state[i]+x)>>>0; });
    }
    return state.map(x => x.toString(16).padStart(8,'0')).join('');
  }
  const effective = {};
  for (const key of Object.keys(standard)) Object.defineProperty(effective, key, { enumerable: true, get() { const value = selected && Object.hasOwn(selected.limits, key) ? selected.limits[key] : standard[key]; return value === null ? Infinity : value; } });
  Object.freeze(effective);
  function register(definition) {
    if (!keys(definition, ['id', 'version', 'limits']) || !validId(definition.id) || !validVersion(definition.version) || definition.id === 'akari.standard' || !record(definition.limits)) fail('派生プロファイルの登録情報が不正です');
    const limits = {};
    if (Reflect.ownKeys(definition.limits).some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(definition.limits,key))) fail('上限の項目が不正です');
    for (const key of Object.keys(definition.limits).sort()) {
      const value = definition.limits[key];
      if (!Object.hasOwn(standard, key) || locked.includes(key)) fail('変更できない上限です: ' + key);
      if (value === undefined) continue;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (!fractional.has(key) && !Number.isSafeInteger(value)))) fail('上限値が不正です: ' + key);
      limits[key] = value;
    }
    const canonical = { id: definition.id, version: definition.version, limits };
    const profile = Object.freeze({ ...canonical, limits: Object.freeze(limits), contentHash: hash(JSON.stringify(canonical)) });
    const key = profile.id + '@' + profile.version;
    if (registry.has(key)) fail('プロファイルのID・版が重複しています: ' + key);
    registry.set(key, profile); return profile;
  }
  function select(id, version) {
    if (id === 'akari.standard' && version === '1') { selected = null; return null; }
    if (!validId(id) || !validVersion(version)) fail('プロファイルのID・版が不正です');
    const profile = registry.get(id + '@' + version);
    if (!profile) fail('必要な派生プロファイルが登録されていません: ' + id + '@' + version);
    selected = profile; return requirement();
  }
  function requirement() { return selected ? Object.freeze({ id: selected.id, version: selected.version, contentHash: selected.contentHash }) : null; }
  function validateRequirement(value) {
    if (value === null) return true;
    if (!keys(value, ['id', 'version', 'contentHash']) || !validId(value.id) || !validVersion(value.version) || typeof value.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.contentHash)) fail('保存されたプロファイル情報が不正です');
    const profile = registry.get(value.id + '@' + value.version);
    if (!profile) fail('必要な派生プロファイルが登録されていません');
    if (profile.contentHash !== value.contentHash) fail('派生プロファイルの内容が一致しません');
    if (selected !== profile) fail('派生プロファイルをホスト側で選択してください');
    return true;
  }
  function describe() { return Object.freeze({ standard, locked, selected: requirement(), profiles: Object.freeze([...registry.values()]) }); }
  return Object.freeze({ register, select, effective, standard, describe, requirement, validateRequirement });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { createAkariProfiles };
