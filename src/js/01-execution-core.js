  // ────────────────────────────────────────────────────────────────────────
  // 01 — Portable execution core (also embedded in exported players)
  // ────────────────────────────────────────────────────────────────────────
// AKARI-EXTENSION-PROFILES.JS-BEGIN
// @portable extensions/profiles.js
// AKARI-EXTENSION-PROFILES.JS-END

// AKARI-EXTENSION-FOUNDATION.JS-BEGIN
// @portable extensions/foundation.js
// AKARI-EXTENSION-FOUNDATION.JS-END

  function createAkariRuntime(options) {
    'use strict';
    if (options === undefined) options = {};
    const BUILTIN_DEFINITIONS = Object.freeze([
      Object.freeze({ name: '乱数', minArgs: 2, maxArgs: 2 }),
      Object.freeze({ name: '余り', minArgs: 2, maxArgs: 2 }),
      ...[
        '四捨五入',
        '切り上げ',
        '切り捨て',
        '絶対値',
        '平方根',
        '正弦',
        '余弦',
        '正接',
        '逆正弦',
        '逆余弦',
        '逆正接',
        '自然対数',
        '常用対数',
        '指数',
        '数',
        '文字',
      ].map((name) => Object.freeze({ name, minArgs: 1, maxArgs: 1 })),
      Object.freeze({ name: '最小', minArgs: 1, maxArgs: Infinity }),
      Object.freeze({ name: '最大', minArgs: 1, maxArgs: Infinity }),
      Object.freeze({ name: 'つなぐ', minArgs: 2, maxArgs: Infinity }),
    ]);
    const STANDARD_LIMITS = {
      fileBytes: 24 * 1024 * 1024,
      importFileBytes: 12 * 1024 * 1024,
      assetRawTotal: 16 * 1024 * 1024,
      assets: 128,
      imageAssets: 64,
      audioAssets: 64,
      imageBytes: 4 * 1024 * 1024,
      audioBytes: 6 * 1024 * 1024,
      imageWidth: 4096,
      imageHeight: 4096,
      imagePixels: 4194304,
      imagePixelsTotal: 16777216,
      audioDuration: 60,
      audioDurationTotal: 120,
      audioChannels: 2,
      audioSampleRateMin: 8000,
      audioSampleRateMax: 48000,
      activeAudioVoices: 32,
      backdrops: 256,
      costumesPerSprite: 256,
      sounds: 256,
      components: 500,
      clones: 500,
      scripts: 1000,
      sourceEach: 100000,
      sourceTotal: 1000000,
      projectVars: 1000,
      projectLists: 500,
      listItems: 100000,
      stringChars: 100000,
      callables: 500,
      args: 32,
      callDepth: 64,
      functionOps: 100000,
      blockDepth: 128,
      expressionDepth: 128,
      repeatCount: 1000000,
      activeTasks: 2000,
    };
    const profileRegistry = createAkariProfiles(STANDARD_LIMITS, {
      executableBytes: 64 * 1024 * 1024, logChars: 100000,
      historyEntries: 60, diagnosticsBytes: 8388608,
    });
    for (const definition of options.profiles || []) profileRegistry.register(definition);
    if (options.profile) profileRegistry.select(options.profile.id, options.profile.version);
    const LIMITS = {};
    for (const key of Object.keys(profileRegistry.standard)) Object.defineProperty(LIMITS, key, {
      enumerable: Object.hasOwn(STANDARD_LIMITS, key), get: () => profileRegistry.effective[key],
    });
    Object.freeze(LIMITS);
    const profiles = Object.freeze({ ...profileRegistry,
      register() { throw new Error('プロファイルは起動設定で登録してください'); },
      select() { throw new Error('プロファイルは起動前にホスト側で選択してください'); },
    });
    const extensions = createAkariExtensionHost({
      standard: { languageContractId: 2, runtimeContractId: 2 },
      reservedNames: BUILTIN_DEFINITIONS.map(x => x.name),
      allowedCapabilities: options.allowedCapabilities || [],
      validateValue: validateExtensionValue,
      validateProfileRequirement: value => profiles.validateRequirement(value),
    });
    for (const definition of options.extensions || []) extensions.register(definition.manifest, definition.factory);
    extensions.seal();
    function validateExtensionValue(value, shape) {
      assertRuntimeValueLimit(value);
      const valid = shape.type === 'number' ? isNumberValue(value) && unitOf(value) === shape.unit :
        shape.type === 'string' ? typeof value === 'string' :
        shape.type === 'boolean' ? typeof value === 'boolean' :
        shape.type === 'list' ? listValue(value) : scalar(value) || listValue(value);
      if (!valid) throw new AkariError('E705', '拡張の値の型・単位が一致しません');
      return deepCopy(value);
    }
    function validateExtensionEnvelope(value) {
      extensions.validateRequirements(value);
      profiles.validateRequirement(value.profile ?? null);
      if (!Array.isArray(value.state)) throw new AkariError('E701', '拡張状態の一覧が必要です');
      return value;
    }
    function extensionError(error) {
      return !(error instanceof AkariError) && /^E70[1-8]$/.test(error?.code)
        ? new AkariError(error.code, error.message) : error;
    }
    function invokeExtension(kind, name, args, context) {
      try { return kind === 'calculation' ? extensions.invokeCalculation(name, args, context) : extensions.invokeCommand(name, args, context); }
      catch (error) { throw extensionError(error); }
    }
    const COLOR_NAMES = {
      白: '#ffffff',
      黒: '#000000',
      赤: '#ff3b30',
      青: '#147efb',
      緑: '#34c759',
      黄: '#ffd60a',
      橙: '#ff9500',
      紫: '#af52de',
      桃: '#ff6b9d',
      灰: '#8e8e93',
      水色: '#7dd3fc',
      空色: '#b3e5fc',
      紺: '#1e3a8a',
      茶: '#8b5a2b',
      透明: null,
    };
    // Event names on screen; the entry buttons use the same words.
    const EVENT_LABELS = {
      start: '「動かす」を おしたとき',
      click: 'おされたとき',
      keyDown: 'キーを おしたとき',
      message: '合図を 受けたとき',
      backdropChanged: 'はいけいが かわったとき',
      valueChanged: '中身が かわったとき',
      cloneStart: 'コピーが できたとき',
    };
    const BUILTIN_META = new Map(BUILTIN_DEFINITIONS.map((x) => [x.name, x]));
    class AkariError extends Error {
      constructor(code, message, line = 0, column = 0, detail = '') {
        super(message);
        this.name = 'AkariError';
        this.code = code;
        this.line = line;
        this.column = column;
        this.detail = detail;
      }
    }
    class ScriptSignal extends Error {
      constructor(kind) {
        super(kind);
        this.kind = kind;
      }
    }
    const cpLen = (s) => Array.from(String(s ?? '')).length;
    // Unitless numbers retain their primitive representation at host/UI boundaries.
    const UNIT_TAGS = Object.freeze(['歩', '秒', '度', '回', '番目', '点', '個', '％', 'Hz']);
    const isQuantity = (v) => exactKeys(v, ['magnitude', 'unit']) &&
      finite(v.magnitude) && (v.unit === null || UNIT_TAGS.includes(v.unit));
    const isNumberValue = (v) => finite(v) || isQuantity(v);
    const unitOf = (v) => isQuantity(v) ? v.unit : null;
    function quantity(magnitude, unit = null) {
      if (unit !== null && !UNIT_TAGS.includes(unit))
        throw new AkariError('R417', '登録されていない単位です');
      ensureFinite(magnitude);
      return unit === null ? magnitude : Object.freeze({ magnitude, unit });
    }
    const deepCopy = (v) => Array.isArray(v) ? v.map(deepCopy) :
      isQuantity(v) ? quantity(v.magnitude, v.unit) : v;
    const finite = (n) => typeof n === 'number' && Number.isFinite(n);
    const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
    const exactKeys = (o, keys) => {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
      const a = Object.keys(o).sort(),
        b = [...keys].sort();
      return a.length === b.length && a.every((x, i) => x === b[i]);
    };
    const safeId = (id) => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id);
    const scalar = (v) => isNumberValue(v) || typeof v === 'string' || typeof v === 'boolean';
    const listValue = (v) => Array.isArray(v) && v.every(scalar);
    function assertRuntimeValueLimit(v) {
      if (typeof v === 'number') ensureFinite(v);
      if (!scalar(v) && !Array.isArray(v)) throw new AkariError('R411', '値の型が不正です');
      if (typeof v === 'string' && cpLen(v) > LIMITS.stringChars)
        throw new AkariError('R413', '文字が長すぎます');
      if (Array.isArray(v)) {
        if (v.length > LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
        for (const x of v) {
          if (!scalar(x)) throw new AkariError('R411', 'リストの要素は数・文字・条件の答えだけです');
          if (typeof x === 'string' && cpLen(x) > LIMITS.stringChars)
            throw new AkariError('R413', 'リスト内の文字が長すぎます');
        }
      }
      return v;
    }
    const valueText = (v) => {
      if (typeof v === 'boolean') return v ? 'あてはまる' : 'あてはまらない';
      if (isQuantity(v)) return valueText(v.magnitude) + (v.unit || '');
      if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
      if (typeof v === 'string') return v;
      throw new AkariError('R411', 'この値は文字として表示できません');
    };
    const ensureFinite = (n) => {
      if (!Number.isFinite(n)) throw new AkariError('R403', '計算結果が有限な数ではありません');
      return Object.is(n, -0) ? 0 : n;
    };
    // Presentation only. Expressions, text conversion and files retain the value.
    const displayValue = (v) => {
      if (typeof v === 'number') ensureFinite(v);
      const rawText = valueText(v);
      if (!isNumberValue(v)) return { text: rawText, rawText, rounded: false };
      const n = ensureFinite(isQuantity(v) ? v.magnitude : v);
      const precise = n.toPrecision(12), parsed = Number(precise);
      const shown = Number.isSafeInteger(n) ? String(n) : Number.isFinite(parsed) ? String(parsed) : precise;
      const text = shown + (isQuantity(v) ? v.unit || '' : '');
      return { text, rawText, rounded: text !== rawText };
    };
    const typeName = (v) =>
      Array.isArray(v)
        ? 'リスト'
        : isNumberValue(v)
          ? '数'
          : typeof v === 'string'
            ? '文字'
            : typeof v === 'boolean'
              ? '条件の答え'
              : v == null
                ? 'なし'
                : '不明';
    const sameValue = (a, b) => {
      if (Array.isArray(a) || Array.isArray(b)) {
        return (
          Array.isArray(a) &&
          Array.isArray(b) &&
          a.length === b.length &&
          a.every((v, i) => sameValue(v, b[i]))
        );
      }
      if (isNumberValue(a) && isNumberValue(b))
        return unitOf(a) === unitOf(b) && numberValue(a) === numberValue(b);
      return (typeof a === typeof b && Object.is(a, b)) || (typeof a === typeof b && a === b);
    };
    function validateColorHex(v, allowNull = false) {
      if (allowNull && v === null) return true;
      return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
    }
    function resolveColor(v, { allowTransparent = true } = {}) {
      if (typeof v !== 'string') throw new AkariError('R411', '色は文字で指定します');
      if (Object.prototype.hasOwnProperty.call(COLOR_NAMES, v)) {
        if (v === '透明' && !allowTransparent)
          throw new AkariError('R412', 'ここでは透明を指定できません');
        return COLOR_NAMES[v];
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toLowerCase();
      throw new AkariError('R412', `色「${v}」は使える色ではありません`);
    }
    class PRNG {
      constructor(seed) {
        this.state = seed >>> 0;
      }
      nextUint32() {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
        t = (t ^ ((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0)) >>> 0;
        t = (t ^ (t >>> 14)) >>> 0;
        return t;
      }
      nextFloat() {
        return this.nextUint32() / 4294967296;
      }
    }
    function nowMs() {
      return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    }
    function cloneDesignProject(p) {
      return typeof structuredClone === 'function'
        ? structuredClone(p)
        : JSON.parse(JSON.stringify(p));
    }
    function bytesEqual(a, b) {
      if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length)
        return false;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
      return true;
    }
    const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function encodeBase64(bytes) {
      if (typeof btoa === 'function') {
        let bin = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk)
          bin += String.fromCharCode.apply(
            null,
            bytes.subarray(i, Math.min(bytes.length, i + chunk)),
          );
        return btoa(bin);
      }
      let out = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i],
          hasB = i + 1 < bytes.length,
          hasC = i + 2 < bytes.length,
          b = hasB ? bytes[i + 1] : 0,
          c = hasC ? bytes[i + 2] : 0,
          n = (a << 16) | (b << 8) | c;
        out +=
          BASE64_ALPHABET[(n >>> 18) & 63] +
          BASE64_ALPHABET[(n >>> 12) & 63] +
          (hasB ? BASE64_ALPHABET[(n >>> 6) & 63] : '=') +
          (hasC ? BASE64_ALPHABET[n & 63] : '=');
      }
      return out;
    }
    function decodedBase64Length(text) {
      if (typeof text !== 'string' || text.length % 4 !== 0)
        throw new AkariError('F508', 'Base64\u5f62\u5f0f\u304c\u4e0d\u6b63\u3067\u3059');
      const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0,
        end = text.length - pad;
      for (let i = 0; i < end; i++) {
        const c = text.charCodeAt(i);
        if (
          !(
            (c >= 65 && c <= 90) ||
            (c >= 97 && c <= 122) ||
            (c >= 48 && c <= 57) ||
            c === 43 ||
            c === 47
          )
        )
          throw new AkariError('F508', 'Base64\u5f62\u5f0f\u304c\u4e0d\u6b63\u3067\u3059');
      }
      if (pad && end < 2)
        throw new AkariError('F508', 'Base64\u5f62\u5f0f\u304c\u4e0d\u6b63\u3067\u3059');
      return (text.length / 4) * 3 - pad;
    }
    function decodeBase64(text) {
      const expected = decodedBase64Length(text);
      if (expected > LIMITS.assetRawTotal) throw new AkariError('F504', '素材データが大きすぎます');
      let out;
      if (typeof atob === 'function') {
        let bin;
        try {
          bin = atob(text);
        } catch (_) {
          throw new AkariError('F508', 'Base64を読み取れません');
        }
        out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      } else {
        out = new Uint8Array(expected);
        let at = 0;
        for (let i = 0; i < text.length; i += 4) {
          const a = BASE64_ALPHABET.indexOf(text[i]),
            b = BASE64_ALPHABET.indexOf(text[i + 1]),
            c = text[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(text[i + 2]),
            d = text[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(text[i + 3]),
            n = (a << 18) | (b << 12) | (c << 6) | d;
          if (at < expected) out[at++] = (n >>> 16) & 255;
          if (at < expected) out[at++] = (n >>> 8) & 255;
          if (at < expected) out[at++] = n & 255;
        }
      }
      if (encodeBase64(out) !== text) throw new AkariError('F508', 'Base64が標準形ではありません');
      return out;
    }
    function rotr(x, n) {
      return (x >>> n) | (x << (32 - n));
    }
    function sha256Fallback(bytes) {
      const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
        0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
        0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
        0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
        0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
        0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
        0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
        0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
        0xc67178f2,
      ]);
      const H = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
        0x5be0cd19,
      ]);
      const bitLen = bytes.length * 8;
      const total = ((bytes.length + 9 + 63) >> 6) << 6;
      const msg = new Uint8Array(total);
      msg.set(bytes);
      msg[bytes.length] = 0x80;
      const dv = new DataView(msg.buffer);
      const hi = Math.floor(bitLen / 0x100000000),
        lo = bitLen >>> 0;
      dv.setUint32(total - 8, hi, false);
      dv.setUint32(total - 4, lo, false);
      const w = new Uint32Array(64);
      for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++) {
          const a = w[i - 15],
            b = w[i - 2],
            s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3),
            s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
          w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = H;
        for (let i = 0; i < 64; i++) {
          const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25),
            ch = (e & f) ^ (~e & g),
            t1 = (h + S1 + ch + K[i] + w[i]) >>> 0,
            S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22),
            maj = (a & b) ^ (a & c) ^ (b & c),
            t2 = (S0 + maj) >>> 0;
          h = g;
          g = f;
          f = e;
          e = (d + t1) >>> 0;
          d = c;
          c = b;
          b = a;
          a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0;
        H[1] = (H[1] + b) >>> 0;
        H[2] = (H[2] + c) >>> 0;
        H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0;
        H[5] = (H[5] + f) >>> 0;
        H[6] = (H[6] + g) >>> 0;
        H[7] = (H[7] + h) >>> 0;
      }
      return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
    }
    async function sha256(bytes) {
      try {
        if (globalThis.crypto?.subtle) {
          const b = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            d = await crypto.subtle.digest('SHA-256', b);
          return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
        }
      } catch (_) {}
      return sha256Fallback(bytes);
    }
    const IMMUTABLE_ASSET_RECORDS = new WeakSet();
    function makeImmutableAssetRecord(asset) {
      if (IMMUTABLE_ASSET_RECORDS.has(asset)) return asset;
      const raw =
          asset.bytes instanceof Uint8Array
            ? new Uint8Array(asset.bytes)
            : new Uint8Array(asset.bytes),
        meta = Object.freeze({ ...asset.meta });
      const rec = {
        id: asset.id,
        kind: asset.kind,
        mime: asset.mime,
        byteLength: raw.length,
        sha256: asset.sha256,
        get bytes() {
          return new Uint8Array(raw);
        },
        meta,
      };
      Object.freeze(rec);
      IMMUTABLE_ASSET_RECORDS.add(rec);
      return rec;
    }
    class AssetStore {
      #map;
      constructor(entries = []) {
        this.#map = new Map();
        const pairs =
          entries instanceof Map ? entries.entries() : Array.from(entries, (a) => [a.id, a]);
        for (const [id, a] of pairs) this.#map.set(id, makeImmutableAssetRecord(a));
      }
      get(id) {
        return this.#map.get(id) || null;
      }
      has(id) {
        return this.#map.has(id);
      }
      ids() {
        return this.#map.keys();
      }
      snapshotRefs(onlyIds = null) {
        const out = new Map();
        if (onlyIds) {
          for (const id of onlyIds) {
            const a = this.#map.get(id);
            if (a) out.set(id, a);
          }
        } else for (const [id, a] of this.#map) out.set(id, a);
        return out;
      }
      replaceRefs(m) {
        this.#map = new Map();
        for (const [id, a] of m) this.#map.set(id, makeImmutableAssetRecord(a));
      }
      addImmutable(asset) {
        if (this.#map.has(asset.id))
          throw new AkariError('F505', `asset ID「${asset.id}」が重複しています`);
        const frozen = makeImmutableAssetRecord(asset);
        this.#map.set(frozen.id, frozen);
        return frozen;
      }
      findByDigest(kind, digest, byteLength, bytes = null) {
        for (const a of this.#map.values())
          if (a.kind === kind && a.sha256 === digest) {
            if (a.byteLength !== byteLength)
              throw new AkariError('F508', '同じSHA-256でbyteLengthが異なります');
            if (bytes && !bytesEqual(a.bytes, bytes))
              throw new AkariError('F508', '同じSHA-256/長さでバイト列が異なります');
            return a;
          }
        return null;
      }
      deleteIfUnreferenced(id, referencedIds) {
        if (!(referencedIds instanceof Set) || referencedIds.has(id)) return false;
        return this.#map.delete(id);
      }
      retainOnly(ids) {
        return new AssetStore(this.snapshotRefs(ids));
      }
    }
    function collectRuntimeAssetRequirements(compiled, project) {
      const imageIds = new Set(),
        audioIds = new Set();
      for (const b of project.stage.backdrops) if (b.kind === 'image') imageIds.add(b.assetId);
      for (const c of project.components)
        if (c.type === 'sprite')
          for (const co of c.costumes) if (co.kind === 'image') imageIds.add(co.assetId);
      let sampleUsed = false,
        needsAudio = false;
      const walk = (v) => {
        if (!v || typeof v !== 'object') return;
        if (v.kind === 'SoundCommand') {
          if (['TONE', 'TONE_WAIT', 'SAMPLE', 'SAMPLE_WAIT'].includes(v.op)) needsAudio = true;
          if (v.op === 'SAMPLE' || v.op === 'SAMPLE_WAIT') sampleUsed = true;
        }
        for (const x of Object.values(v)) {
          if (Array.isArray(x)) for (const y of x) walk(y);
          else if (x && typeof x === 'object') walk(x);
        }
      };
      for (const item of compiled.items) walk(item.ast);
      if (sampleUsed) for (const snd of project.sounds) audioIds.add(snd.assetId);
      return { imageIds, audioIds, needsAudio, sampleUsed };
    }
    class AssetRuntimeCache {
      constructor(assetStore, services = {}) {
        this.assetStore = assetStore;
        this.imageByAssetId = new Map();
        this.audioBufferByAssetId = new Map();
        this.objectUrls = new Map();
        this.activeAudioHandles = new Map();
        this.pendingOperations = new Set();
        this.createImage = services.createImage || (() => new Image());
        this.handleSeq = 0;
        this.audioContext = null;
        this.audioResumePromise = null;
        this.generationToken = 0;
      }

      awaitOperation(promise, label) {
        const token = this.generationToken;
        return new Promise((resolve, reject) => {
          let settled = false;
          const finish = (err, value) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              this.pendingOperations.delete(cancel);
              err ? reject(err) : resolve(value);
            },
            cancel = () =>
              finish(
                new AkariError(
                  'R415',
                  '\u7d20\u6750\u51e6\u7406\u304c\u4e2d\u6b62\u3055\u308c\u307e\u3057\u305f',
                ),
              ),
            timer = setTimeout(
              () =>
                finish(
                  new AkariError(
                    'R415',
                    label +
                      '\u304c10\u79d2\u4ee5\u5185\u306b\u5b8c\u4e86\u3057\u307e\u305b\u3093\u3067\u3057\u305f',
                  ),
                ),
              10000,
            );
          this.pendingOperations.add(cancel);
          Promise.resolve(promise).then(
            (value) => (token === this.generationToken ? finish(null, value) : cancel()),
            (err) => finish(err),
          );
        });
      }

      ensureAudioContext() {
        if (this.audioContext) return this.audioContext;
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) throw new AkariError('R415', 'このブラウザでは音声機能を利用できません');
        try {
          this.audioContext = new AC();
          const p = this.audioContext.resume?.();
          this.audioResumePromise =
            p && typeof p.then === 'function' ? Promise.resolve(p) : Promise.resolve();
          this.audioResumePromise.catch(() => {});
          return this.audioContext;
        } catch (e) {
          this.audioContext = null;
          this.audioResumePromise = null;
          throw new AkariError('R415', 'AudioContextを開始できません', 0, 0, e?.message || '');
        }
      }
      async ensureAudioReady() {
        const ac = this.ensureAudioContext();
        try {
          await this.awaitOperation(this.audioResumePromise || Promise.resolve(), 'AudioContext');
        } catch (e) {
          throw new AkariError('R415', 'AudioContextを開始できません', 0, 0, e?.message || '');
        }
        if (ac.state && ac.state !== 'running')
          throw new AkariError('R415', 'AudioContextを開始できません');
        return ac;
      }
      setPaused(paused) {
        const ac = this.audioContext;
        if (!ac) return;
        this.audioStateQueue = (this.audioStateQueue || Promise.resolve())
          .then(async () => {
            if (this.audioContext !== ac || ac.state === 'closed') return;
            await this.awaitOperation(paused ? ac.suspend() : ac.resume(), 'AudioContext');
          })
          .catch((err) => {
            if (this.audioContext === ac) {
              this.audioStateError = err;
              this.onAudioStateError?.(err);
            }
          });
      }
      async prepare(project, requirements, generationToken, { deferAudioStart = false } = {}) {
        for (const cancel of [...this.pendingOperations]) cancel();
        this.generationToken = generationToken;
        for (const id of requirements.imageIds) {
          if (generationToken !== this.generationToken)
            throw new AkariError(
              'R415',
              '\u7d20\u6750\u6e96\u5099\u304c\u4e2d\u6b62\u3055\u308c\u307e\u3057\u305f',
            );
          const a = this.assetStore.get(id);
          if (!a || a.kind !== 'image')
            throw new AkariError(
              'R415',
              `\u753b\u50cfasset\u300c${id}\u300d\u3092\u6e96\u5099\u3067\u304d\u307e\u305b\u3093`,
            );
          if (this.objectUrls.has(id)) URL.revokeObjectURL(this.objectUrls.get(id));
          const blob = new Blob([a.bytes], { type: a.mime }),
            url = URL.createObjectURL(blob);
          this.objectUrls.set(id, url);
          let img;
          try {
            img = this.createImage();
            img.src = url;
            await this.awaitOperation(img.decode(), '\u753b\u50cf\u306e\u6e96\u5099');
            if (generationToken !== this.generationToken)
              throw new AkariError(
                'R415',
                '\u7d20\u6750\u6e96\u5099\u304c\u4e2d\u6b62\u3055\u308c\u307e\u3057\u305f',
              );
            const meta = a.meta || {};
            if (
              (meta.width && img.naturalWidth !== meta.width) ||
              (meta.height && img.naturalHeight !== meta.height)
            )
              throw new AkariError(
                'R415',
                '\u6e96\u5099\u753b\u50cf\u306e\u5bf8\u6cd5\u304c\u691c\u8a3c\u5024\u3068\u4e00\u81f4\u3057\u307e\u305b\u3093',
              );
            this.imageByAssetId.set(id, img);
          } catch (error) {
            URL.revokeObjectURL(url);
            if (this.objectUrls.get(id) === url) this.objectUrls.delete(id);
            img?.removeAttribute?.('src');
            throw error instanceof AkariError
              ? error
              : new AkariError(
                  'R415',
                  `\u753b\u50cfasset\u300c${id}\u300d\u3092\u6e96\u5099\u3067\u304d\u307e\u305b\u3093`,
                );
          }
        }
        if (requirements.needsAudio) {
          const ac = deferAudioStart ? this.ensureAudioContext() : await this.ensureAudioReady();
          for (const id of requirements.audioIds) {
            if (generationToken !== this.generationToken)
              throw new AkariError(
                'R415',
                '\u7d20\u6750\u6e96\u5099\u304c\u4e2d\u6b62\u3055\u308c\u307e\u3057\u305f',
              );
            const a = this.assetStore.get(id);
            if (!a || a.kind !== 'audio')
              throw new AkariError(
                'R415',
                `\u97f3asset\u300c${id}\u300d\u3092\u6e96\u5099\u3067\u304d\u307e\u305b\u3093`,
              );
            try {
              const bytes = a.bytes,
                copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
                buf = await this.awaitOperation(
                  ac.decodeAudioData(copy),
                  '\u97f3\u306e\u6e96\u5099',
                );
              if (generationToken !== this.generationToken)
                throw new AkariError(
                  'R415',
                  '\u7d20\u6750\u6e96\u5099\u304c\u4e2d\u6b62\u3055\u308c\u307e\u3057\u305f',
                );
              this.audioBufferByAssetId.set(id, buf);
            } catch (error) {
              throw error instanceof AkariError
                ? error
                : new AkariError(
                    'R415',
                    `\u97f3asset\u300c${id}\u300d\u3092\u6e96\u5099\u3067\u304d\u307e\u305b\u3093`,
                  );
            }
          }
        }
      }
      getImage(id) {
        return this.imageByAssetId.get(id) || null;
      }
      getAudioBuffer(id) {
        return this.audioBufferByAssetId.get(id) || null;
      }
      createHandle(source, gain, onEnded = null) {
        if (this.activeAudioHandles.size >= LIMITS.activeAudioVoices) {
          try {
            source.stop();
          } catch (_) {}
          try {
            source.disconnect();
          } catch (_) {}
          try {
            gain?.disconnect();
          } catch (_) {}
          throw new AkariError('R416', `同時に鳴らせる音は${LIMITS.activeAudioVoices}個までです`);
        }
        const id = `audio-${++this.handleSeq}`,
          h = { id, source, gain, onEnded, finished: false };
        const finish = () => {
          if (h.finished) return;
          h.finished = true;
          this.activeAudioHandles.delete(id);
          try {
            source.disconnect();
          } catch (_) {}
          try {
            gain?.disconnect();
          } catch (_) {}
          h.onEnded?.(id);
        };
        h.finish = finish;
        source.onended = finish;
        this.activeAudioHandles.set(id, h);
        return h;
      }
      startTone(freq, duration, volume, pitch, onEnded = null) {
        const ac = this.ensureAudioContext(),
          rate = Math.pow(2, pitch / 12),
          actual = freq * rate;
        if (
          !Number.isFinite(actual) ||
          actual <= 0 ||
          actual > (ac.sampleRate || 48000) / 2 ||
          !Number.isFinite(duration) ||
          duration <= 0
        )
          throw new AkariError(
            'R412',
            '\u97f3\u7a0b\u307e\u305f\u306f\u9577\u3055\u304c\u518d\u751f\u53ef\u80fd\u306a\u7bc4\u56f2\u5916\u3067\u3059',
          );
        let o, g, h;
        try {
          o = ac.createOscillator();
          g = ac.createGain();
          o.frequency.value = actual;
          g.gain.value = (0.07 * volume) / 100;
          o.connect(g);
          g.connect(ac.destination);
          h = this.createHandle(o, g, onEnded);
          o.start();
          o.stop(ac.currentTime + duration);
          return h.id;
        } catch (err) {
          if (h) this.stopHandle(h.id, { notify: false });
          else {
            try {
              o?.disconnect();
            } catch (_) {}
            try {
              g?.disconnect();
            } catch (_) {}
          }
          throw err instanceof AkariError
            ? err
            : new AkariError(
                'R415',
                '\u97f3\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093',
                0,
                0,
                err.message,
              );
        }
      }
      startSample(buffer, volume, pitch, onEnded = null) {
        const rate = Math.pow(2, pitch / 12);
        if (rate < 0.25 || rate > 4 || !Number.isFinite(rate))
          throw new AkariError(
            'R412',
            '\u5916\u90e8\u97f3\u306e\u518d\u751f\u901f\u5ea6\u306f0.25\u301c4\u306e\u7bc4\u56f2\u306b\u3057\u307e\u3059',
          );
        const ac = this.ensureAudioContext();
        let src, g, h;
        try {
          src = ac.createBufferSource();
          g = ac.createGain();
          src.buffer = buffer;
          src.playbackRate.value = rate;
          g.gain.value = volume / 100;
          src.connect(g);
          g.connect(ac.destination);
          h = this.createHandle(src, g, onEnded);
          src.start();
          return h.id;
        } catch (err) {
          if (h) this.stopHandle(h.id, { notify: false });
          else {
            try {
              src?.disconnect();
            } catch (_) {}
            try {
              g?.disconnect();
            } catch (_) {}
          }
          throw err instanceof AkariError
            ? err
            : new AkariError(
                'R415',
                '\u97f3\u7d20\u6750\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093',
                0,
                0,
                err.message,
              );
        }
      }
      stopHandle(id, { notify = true } = {}) {
        const h = this.activeAudioHandles.get(id);
        if (!h) return;
        try {
          h.source.onended = null;
          h.source.stop();
        } catch (_) {}
        const cb = h.onEnded;
        h.onEnded = notify ? cb : null;
        h.finish();
      }
      stopAllHandles({ notify = true } = {}) {
        for (const id of [...this.activeAudioHandles.keys()]) this.stopHandle(id, { notify });
      }
      async dispose() {
        this.generationToken++;
        for (const cancel of [...this.pendingOperations]) cancel();
        this.pendingOperations.clear();
        this.stopAllHandles({ notify: false });
        for (const u of this.objectUrls.values()) URL.revokeObjectURL(u);
        this.objectUrls.clear();
        this.imageByAssetId.clear();
        this.audioBufferByAssetId.clear();
        const ac = this.audioContext;
        this.audioContext = null;
        this.audioResumePromise = null;
        if (ac)
          try {
            await ac.close();
          } catch (_) {}
      }
    }
    class RuntimeModel {
      constructor(project, ui = {}, assetCache = null) {
        this.project = project;
        this.ui = ui;
        this.assetCache = assetCache;
        this.creationSequence = 0;
        this.reset(1);
      }
      validate() {
        return validateRuntimeData(this.project);
      }
      reset(seed) {
        this.validate();
        this.stopAllAudio();
        this.projectVars = new Map(
          this.project.projectData.variables.map((d) => [d.name, deepCopy(d.initialValue)]),
        );
        this.projectLists = new Map(
          this.project.projectData.lists.map((d) => [d.name, deepCopy(d.initialValue)]),
        );
        this.actors = new Map();
        this.creationSequence = 0;
        for (let i = 0; i < this.project.components.length; i++) {
          const c = this.project.components[i];
          this.actors.set(c.id, this.makeActor(c, c.id, false, i));
        }
        this.stage = { backdropId: this.project.stage.backdropId, volume: 100, pitch: 0 };
        this.clockOffset = 0;
        this.pausedAt = null;
        this.startTime = this.now();
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;
        this.pressedKeys = new Set();
        this.prng = new PRNG(seed >>> 0);
        this.runSeed = seed >>> 0;
        this.ui.render?.();
      }
      now() {
        return (this.pausedAt === null ? nowMs() : this.pausedAt) - this.clockOffset;
      }
      pauseClock() {
        if (this.pausedAt === null) {
          this.pausedAt = nowMs();
          this.assetCache?.setPaused(true);
        }
      }
      resumeClock() {
        if (this.pausedAt !== null) {
          this.clockOffset += nowMs() - this.pausedAt;
          this.pausedAt = null;
          this.assetCache?.setPaused(false);
        }
      }
      makeActor(c, runtimeId, isClone, z) {
        return {
          runtimeId,
          baseId: c.id,
          isClone,
          creationSequence: ++this.creationSequence,
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
          direction: c.direction,
          scalePercent: c.scalePercent,
          visible: c.visible,
          color: null,
          costumeId: c.type === 'sprite' ? c.costumeId : null,
          z,
          text: c.text,
          inputValue: c.type === 'input' ? c.text : '',
          volume: 100,
          pitch: 0,
          penDown: false,
          penColor: c.fg,
          penSize: 2,
          vars: new Map(c.localData.variables.map((d) => [d.name, deepCopy(d.initialValue)])),
          lists: new Map(c.localData.lists.map((d) => [d.name, deepCopy(d.initialValue)])),
        };
      }
      component(runtimeId) {
        const a = this.actors.get(runtimeId);
        return a ? this.project.components.find((c) => c.id === a.baseId) : null;
      }
      actor(runtimeId) {
        return this.actors.get(runtimeId) || null;
      }
      resolveActorRef(ref, relativeRuntimeId) {
        let id = relativeRuntimeId;
        if (ref && ref.kind !== 'self') {
          id = ref.targetId || (ref.name === '画面' || ref.name === this.project.stage.name ? 'stage' :
            this.project.components.find((c) => c.name === ref.name)?.id);
        }
        if (id !== 'stage' && !this.actor(id))
          throw new AkariError('R405', '動作の対象がありません');
        return id;
      }
      requireActor(ctx) {
        const a = this.actor(ctx.runtimeId);
        if (!a)
          throw new AkariError('R407', 'この命令にはキャラクターや部品の実行中の部品が必要です');
        return a;
      }
      currentCallFrame(ctx) {
        if (ctx.functionFrame) return ctx.functionFrame;
        if (ctx.task?.callFrames?.length)
          return ctx.task.callFrames[ctx.task.callFrames.length - 1];
        return null;
      }
      binderValue(ctx, name) {
        if (ctx.functionFrame || !ctx.task?.execStack) return null;
        for (let i = ctx.task.execStack.length - 1; i >= 0; i--) {
          if (ctx.task.execStack[i].type === 'callBoundary') break;
          const b = ctx.task.execStack[i].binder;
          if (b && b.name === name) return { found: true, value: b.value };
        }
        return { found: false };
      }
      resolveBinding(name, qualifier, ctx) {
        if (qualifier === 'exact') qualifier = null;
        const frame = this.currentCallFrame(ctx);
        if (!qualifier) {
          const b = this.binderValue(ctx, name);
          if (b?.found) return { scope: 'binder', kind: 'scalar', get: () => b.value, set: null };
          if (frame) {
            if (frame.locals?.has(name))
              return {
                scope: 'local',
                kind: 'scalar',
                get: () => frame.locals.get(name),
                set: (v) => frame.locals.set(name, v),
              };
            if (frame.localLists?.has(name))
              return {
                scope: 'local',
                kind: 'list',
                get: () => frame.localLists.get(name),
                set: (v) => frame.localLists.set(name, v),
              };
            if (frame.args?.has(name))
              return {
                scope: 'arg',
                kind: Array.isArray(frame.args.get(name)) ? 'list' : 'scalar',
                get: () => frame.args.get(name),
                set: (v) => frame.args.set(name, v),
              };
          }
        }
        if (qualifier !== 'project' && ctx.runtimeId && ctx.runtimeId !== 'stage') {
          const a = this.actor(ctx.runtimeId);
          if (a) {
            if (a.vars.has(name))
              return {
                scope: 'self',
                kind: 'scalar',
                expectedUnit: this.component(ctx.runtimeId)?.localData.variables.find(d => d.name === name)?.expectedUnit,
                get: () => a.vars.get(name),
                set: ctx.functionFrame ? null : (v) => a.vars.set(name, v),
              };
            if (a.lists.has(name))
              return {
                scope: 'self',
                kind: 'list',
                get: () => a.lists.get(name),
                set: ctx.functionFrame ? null : (v) => a.lists.set(name, v),
              };
          }
        }
        if (qualifier !== 'self') {
          if (this.projectVars.has(name))
            return {
              scope: 'project',
              kind: 'scalar',
              expectedUnit: this.project.projectData.variables.find(d => d.name === name)?.expectedUnit,
              get: () => this.projectVars.get(name),
              set: ctx.functionFrame ? null : (v) => this.projectVars.set(name, v),
            };
          if (this.projectLists.has(name))
            return {
              scope: 'project',
              kind: 'list',
              get: () => this.projectLists.get(name),
              set: ctx.functionFrame ? null : (v) => this.projectLists.set(name, v),
            };
        }
        return null;
      }
      readName(n, ctx) {
        const b = this.resolveBinding(n.name, n.qualifier === 'exact' ? null : n.qualifier, ctx);
        if (!b) throw new AkariError('S301', `未定義の名前「${n.name}」です`);
        return deepCopy(b.get());
      }
      writeTarget(t, value, ctx, { requireKind = null, resolvedBinding = null } = {}) {
        assertRuntimeValueLimit(value);
        const b = resolvedBinding || this.resolveBinding(t.name, t.qualifier === 'exact' ? null : t.qualifier, ctx);
        if (!b) throw new AkariError('S301', `代入先「${t.name}」がありません`);
        if (!b.set) throw new AkariError('S312', `「${t.name}」は読み取り専用です`);
        if (requireKind && b.kind !== requireKind && b.scope !== 'arg')
          throw new AkariError(
            'R411',
            `「${t.name}」は${requireKind === 'list' ? 'リスト' : '変数'}ではありません`,
          );
        if (b.kind === 'list' && !Array.isArray(value))
          throw new AkariError('R411', 'リストにはリストの値だけを入れられます');
        if (b.kind === 'scalar' && !scalar(value))
          throw new AkariError('R411', '変数には数・文字・条件の答えだけを入れられます');
        if (Array.isArray(value) && value.length > LIMITS.listItems)
          throw new AkariError('R413', 'リストが長すぎます');
        validateExpectedUnit(value, b.expectedUnit);
        b.set(deepCopy(value));
        this.ui.renderMonitor?.();
        return b;
      }
      instancesByName(name) {
        const base = this.project.components.find((c) => c.name === name);
        if (!base) return [];
        return [...this.actors.values()]
          .filter((a) => a.baseId === base.id)
          .sort((a, b) => a.creationSequence - b.creationSequence);
      }
      aabb(a) {
        const sc = a.scalePercent / 100,
          hw = (a.w * sc) / 2,
          hh = (a.h * sc) / 2,
          rad = a.direction * (Math.PI / 180),
          cs = Math.cos(rad),
          sn = Math.sin(rad);
        const ex = Math.abs(hw * cs) + Math.abs(hh * sn),
          ey = Math.abs(hw * sn) + Math.abs(hh * cs),
          cx = a.x + a.w / 2,
          cy = a.y + a.h / 2;
        return { left: cx - ex, right: cx + ex, top: cy - ey, bottom: cy + ey, cx, cy };
      }
      touching(runtimeId, target) {
        const a = this.requireActor({ runtimeId });
        if (!a.visible) return false;
        const aa = this.aabb(a);
        if (target === '端')
          return (
            aa.left <= 0 ||
            aa.top <= 0 ||
            aa.right >= this.project.stage.width ||
            aa.bottom >= this.project.stage.height
          );
        if (target === 'マウス')
          return (
            this.mouseX >= aa.left &&
            this.mouseX <= aa.right &&
            this.mouseY >= aa.top &&
            this.mouseY <= aa.bottom
          );
        const targets = this.instancesByName(target).filter(
          (x) => x.runtimeId !== runtimeId && x.visible,
        );
        if (!targets.length) {
          if (!this.project.components.some((c) => c.name === target))
            throw new AkariError('R405', `部品「${target}」がありません`);
          return false;
        }
        return targets.some((b) => {
          const bb = this.aabb(b);
          return (
            aa.left <= bb.right && aa.right >= bb.left && aa.top <= bb.bottom && aa.bottom >= bb.top
          );
        });
      }
      distance(runtimeId, target) {
        const a = this.requireActor({ runtimeId }),
          aa = this.aabb(a);
        if (target === 'マウス')
          return ensureFinite(Math.hypot(this.mouseX - aa.cx, this.mouseY - aa.cy));
        const ts = this.instancesByName(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${target}」がありません`);
        let best = Infinity;
        for (const b of ts) {
          const bb = this.aabb(b);
          best = Math.min(best, ensureFinite(Math.hypot(bb.cx - aa.cx, bb.cy - aa.cy)));
        }
        return best;
      }
      nearestTarget(runtimeId, target) {
        const a = this.requireActor({ runtimeId }),
          aa = this.aabb(a);
        if (target === 'マウス') return { x: this.mouseX, y: this.mouseY };
        const ts = this.instancesByName(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${target}」がありません`);
        let best = null,
          bd = Infinity;
        for (const b of ts) {
          const bb = this.aabb(b),
            d = ensureFinite(Math.hypot(bb.cx - aa.cx, bb.cy - aa.cy));
          if (
            d < bd - 1e-12 ||
            (Math.abs(d - bd) < 1e-12 && b.creationSequence < (best?.creationSequence ?? Infinity))
          ) {
            best = b;
            bd = d;
          }
        }
        const bb = this.aabb(best);
        return { x: bb.cx, y: bb.cy, creationSequence: best.creationSequence };
      }
      touchingColor(runtimeId, color) {
        const a = this.requireActor({ runtimeId });
        if (!a.visible) return false;
        const css = resolveColor(color, { allowTransparent: false }),
          aa = this.aabb(a),
          back = this.project.stage.backdrops.find((b) => b.id === this.stage.backdropId);
        if (
          back?.kind === 'color' &&
          back.value.toLowerCase() === css.toLowerCase() &&
          aa.right >= 0 &&
          aa.bottom >= 0 &&
          aa.left <= this.project.stage.width &&
          aa.top <= this.project.stage.height
        )
          return true;
        for (const b of this.actors.values()) {
          if (b.runtimeId === runtimeId || !b.visible) continue;
          const bb = this.aabb(b);
          if (
            aa.left <= bb.right &&
            aa.right >= bb.left &&
            aa.top <= bb.bottom &&
            aa.bottom >= bb.top
          ) {
            const c = this.component(b.runtimeId);
            let vals = [];
            if (c?.type === 'sprite') {
              const co = c.costumes?.find((x) => x.id === b.costumeId);
              vals = co?.kind === 'image' ? [c.bg] : [b.color || c.fg, c.bg];
            } else vals = [b.color || c?.fg, c?.bg];
            vals = vals.filter(Boolean).map((x) => x.toLowerCase());
            if (vals.includes(css.toLowerCase())) return true;
          }
        }
        return false;
      }
      createClone(sourceRuntimeId) {
        if ([...this.actors.values()].filter((a) => a.isClone).length >= LIMITS.clones)
          throw new AkariError('R410', 'クローン数の上限です');
        const src = this.requireActor({ runtimeId: sourceRuntimeId }),
          c = this.component(sourceRuntimeId);
        if (c?.type !== 'sprite')
          throw new AkariError('R406', 'クローンを作れるのはキャラクターだけです');
        let id;
        do {
          id = `${c.id}-clone-${++this.creationSequence}`;
        } while (this.actors.has(id));
        const a = {
          ...src,
          runtimeId: id,
          isClone: true,
          creationSequence: this.creationSequence,
          vars: new Map([...src.vars].map(([k, v]) => [k, deepCopy(v)])),
          lists: new Map([...src.lists].map(([k, v]) => [k, deepCopy(v)])),
          z: Math.max(0, ...[...this.actors.values()].map((x) => x.z)) + 1,
        };
        this.actors.set(id, a);
        this.ui.render?.();
        return id;
      }
      reorderActor(runtimeId, mode, amount = 0) {
        const actor = this.requireActor({ runtimeId });
        const ordered = [...this.actors.values()].sort(
            (a, b) => a.z - b.z || a.creationSequence - b.creationSequence,
          ),
          old = ordered.indexOf(actor);
        ordered.splice(old, 1);
        const dest =
          mode === 'FRONT'
            ? ordered.length
            : mode === 'BACK'
              ? 0
              : clamp(old + (mode === 'FORWARD_LAYERS' ? amount : -amount), 0, ordered.length);
        ordered.splice(dest, 0, actor);
        ordered.forEach((a, i) => (a.z = i));
      }
      deleteClone(runtimeId) {
        const a = this.requireActor({ runtimeId });
        if (!a.isClone)
          throw new AkariError('R406', '「このクローンを削除する」はクローンでだけ使えます');
        this.actors.delete(runtimeId);
        this.ui.render?.();
      }
      setBackdropByName(name) {
        const b = this.project.stage.backdrops.find((x) => x.name === name);
        if (!b) throw new AkariError('R405', `背景「${name}」がありません`);
        const old = this.project.stage.backdrops.find((x) => x.id === this.stage.backdropId);
        if (b.id === this.stage.backdropId) return null;
        this.stage.backdropId = b.id;
        this.ui.render?.();
        return { oldName: old?.name || '', newName: b.name };
      }
      stepBackdrop(delta) {
        const arr = this.project.stage.backdrops,
          i = Math.max(
            0,
            arr.findIndex((x) => x.id === this.stage.backdropId),
          ),
          n = (i + delta + arr.length) % arr.length;
        return this.setBackdropByName(arr[n].name);
      }
      startTone(freq, duration, ctx, onEnded = null) {
        if (!this.assetCache) throw new AkariError('R415', '音声キャッシュが準備されていません');
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.assetCache.startTone(freq, duration, volume, pitch, onEnded);
      }
      startSample(name, ctx, onEnded = null) {
        const snd = this.project.sounds.find((x) => x.name === name);
        if (!snd) throw new AkariError('R414', `音「${name}」がありません`);
        const buf = this.assetCache?.getAudioBuffer(snd.assetId);
        if (!buf) throw new AkariError('R415', `音「${name}」を準備できていません`);
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.assetCache.startSample(buf, volume, pitch, onEnded);
      }
      stopAllAudio(notify = false) {
        this.assetCache?.stopAllHandles({ notify });
      }
    }
    function localScalar(v) {
      assertRuntimeValueLimit(v);
      if (!scalar(v))
        throw new AkariError('R411', 'この中だけの変数には数・文字・条件の答えだけを入れられます');
      return v;
    }
    function numberValue(v, msg = '数が必要です') {
      if (!isNumberValue(v)) throw new AkariError('R411', msg);
      return isQuantity(v) ? v.magnitude : v;
    }
    function numberInUnit(v, expectedUnit, msg = '数が必要です') {
      const magnitude = numberValue(v, msg), unit = unitOf(v);
      if (expectedUnit !== null && !UNIT_TAGS.includes(expectedUnit))
        throw new AkariError('R417', '登録されていない単位です');
      if (unit !== null && unit !== expectedUnit)
        throw new AkariError('R417', expectedUnit === null
          ? 'この計算には単位のない数を使います。「の数だけ」で単位を外せます'
          : `ここでは${expectedUnit}の数を使います。${unit}の値は使えません`);
      return magnitude;
    }
    function numeric(v, msg = '数が必要です') {
      return numberInUnit(v, null, msg);
    }
    function commonUnit(values) {
      let unit = null;
      for (const value of values) {
        numberValue(value);
        const next = unitOf(value);
        if (unit !== null && next !== null && unit !== next)
          throw new AkariError('R417', `${unit}と${next}は同じ単位ではありません`);
        if (next !== null) unit = next;
      }
      return unit;
    }
    function arithmetic(op, left, right) {
      const a = numberValue(left), b = numberValue(right),
        au = unitOf(left), bu = unitOf(right);
      let unit = null, result;
      if (op === 'ADD' || op === 'SUB') {
        unit = commonUnit([left, right]);
        result = op === 'ADD' ? a + b : a - b;
      } else if (op === 'MUL') {
        if (au !== null && bu !== null)
          throw new AkariError('R417', '単位どうしは掛けられません。「の数だけ」で単位を外せます');
        unit = au || bu;
        result = a * b;
      } else if (op === 'DIV') {
        if (bu !== null && au !== bu)
          throw new AkariError('R417', 'この単位どうしは割れません。「の数だけ」で単位を外せます');
        if (b === 0) throw new AkariError('R401', '0では割れません');
        unit = bu === null ? au : null;
        result = a / b;
      } else {
        numeric(left); numeric(right);
        if (a === 0 && b === 0) throw new AkariError('R402', '0の0乗は定義しません');
        result = Math.pow(a, b);
        if (!Number.isFinite(result))
          throw new AkariError('R402', 'このべき乗は実数として計算できません');
      }
      return quantity(ensureFinite(result), unit);
    }
    function addNumericUpdate(current, increment, op = 'ADD') {
      const a = numberValue(current), b = numberInUnit(increment, unitOf(current));
      return quantity(ensureFinite(op === 'ADD' ? a + b : a - b), unitOf(current));
    }
    function validateExpectedUnit(value, expectedUnit) {
      if (expectedUnit == null) return;
      numberInUnit(value, expectedUnit, '単位を定めた変数には数を入れます');
    }
    function validateRuntimeData(project, fail = null) {
      const reject = fail || ((message) => { throw new AkariError('R411', message); });
      for (const data of [project.projectData, ...project.components.map(c => c?.localData)]) {
        if (!data || !Array.isArray(data.variables) || !Array.isArray(data.lists)) reject('データが不正です');
        for (const d of data.variables) {
          if (!scalar(d?.initialValue)) reject('変数の初期値が不正です');
          if (d.expectedUnit != null && !UNIT_TAGS.includes(d.expectedUnit)) reject('変数の単位が不正です');
          try { assertRuntimeValueLimit(d.initialValue); validateExpectedUnit(d.initialValue, d.expectedUnit); }
          catch (e) { if (fail) fail(e.message); else throw e; }
        }
        for (const d of data.lists) {
          if (!listValue(d?.initialValue)) reject('リストの初期値が不正です');
          try { assertRuntimeValueLimit(d.initialValue); } catch (e) { if (fail) fail(e.message); else throw e; }
        }
      }
      return true;
    }
    function bool(v, msg = '条件の答えが必要です') {
      if (typeof v !== 'boolean') throw new AkariError('R411', msg);
      return v;
    }
    function stringv(v, msg = '文字が必要です') {
      if (typeof v !== 'string') throw new AkariError('R411', msg);
      return v;
    }
    function integerIndex(v) {
      const n = numberInUnit(v, '番目', '番号には数が必要です');
      if (!Number.isInteger(n) || n < 1)
        throw new AkariError('R404', '番号は1以上の整数で指定します');
      return n;
    }
    function unicodeIndexOf(text, search) {
      const source = Array.from(text),
        needle = Array.from(search);
      if (!needle.length) return 1;
      const prefix = new Uint32Array(needle.length);
      for (let i = 1, j = 0; i < needle.length; i++) {
        while (j && needle[i] !== needle[j]) j = prefix[j - 1];
        if (needle[i] === needle[j]) j++;
        prefix[i] = j;
      }
      for (let i = 0, j = 0; i < source.length; i++) {
        while (j && source[i] !== needle[j]) j = prefix[j - 1];
        if (source[i] === needle[j]) j++;
        if (j === needle.length) return i - needle.length + 2;
      }
      return 0;
    }
    function evalExpression(ast, ctx, budget = null) {
      try {
      if (budget && ast.kind !== 'QuantityLiteral') {
        if (++budget.count > LIMITS.functionOps)
          throw new AkariError('R409', '計算の量が上限を超えました');
      }
      switch (ast.kind) {
        case 'QuantityLiteral':
          return quantity(numberInUnit(evalExpression(ast.value, ctx, budget), ast.unit), ast.unit);
        case 'UnitlessRead':
          return numberValue(evalExpression(ast.value, ctx, budget));
        case 'ActorQualifiedRead': {
          const runtimeId = ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          return evalExpression(ast.value, { ...ctx, runtimeId }, budget);
        }
        case 'NumberLiteral':
          return numeric(ast.value);
        case 'StringLiteral':
        case 'BooleanLiteral':
          return ast.value;
        case 'ListLiteral': {
          const arr = ast.items.map((x) => evalExpression(x, ctx, budget));
          if (!arr.every(scalar))
            throw new AkariError('R411', 'リストの要素は数・文字・条件の答えだけです');
          if (arr.length > LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
          return arr;
        }
        case 'VariableRead':
          return ctx.runtime.readName(ast, ctx);
        case 'UnaryExpression': {
          const v = evalExpression(ast.value, ctx, budget);
          if (ast.op === 'NOT') return !bool(v);
          const n = numberValue(v);
          return quantity(ast.op === 'NEG' ? ensureFinite(-n) : n, unitOf(v));
        }
        case 'BinaryExpression': {
          const left = evalExpression(ast.left, ctx, budget),
            right = evalExpression(ast.right, ctx, budget);
          return arithmetic(ast.op, left, right);
        }
        case 'CompareExpression': {
          const left = evalExpression(ast.left, ctx, budget),
            right = evalExpression(ast.right, ctx, budget);
          if (ast.op === 'EQ' || ast.op === 'NEQ') {
            let equal;
            if (isNumberValue(left) && isNumberValue(right)) {
              commonUnit([left, right]);
              equal = numberValue(left) === numberValue(right);
            } else equal = sameValue(left, right);
            return ast.op === 'EQ' ? equal : !equal;
          }
          const a = numberValue(left, '比較する左側は数にします'),
            b = numberValue(right, '比較する右側は数にします');
          commonUnit([left, right]);
          return ast.op === 'GTE' ? a >= b : ast.op === 'LTE' ? a <= b : ast.op === 'GT' ? a > b : a < b;
        }
        case 'LogicalExpression': {
          const a = bool(evalExpression(ast.left, ctx, budget));
          if (ast.op === 'AND') return a ? bool(evalExpression(ast.right, ctx, budget)) : false;
          return a ? true : bool(evalExpression(ast.right, ctx, budget));
        }
        case 'ListRead': {
          const arr = evalExpression(ast.list, ctx, budget);
          if (!Array.isArray(arr)) {
            const error = new AkariError('R411', '「N番目」はリストに使います');
            if (ast.list.kind === 'StringLiteral' && ast.list.sourceSpan && ctx.runtime?.actor)
              error.quotedList = { name: ast.list.value, span: { ...ast.list.sourceSpan },
                targetId: ctx.runtime.actor(ctx.runtimeId)?.baseId || 'stage' };
            throw error;
          }
          const i = integerIndex(evalExpression(ast.index, ctx, budget));
          if (i > arr.length) throw new AkariError('R404', 'リストの範囲外です');
          return deepCopy(arr[i - 1]);
        }
        case 'ExtensionCalculation':
          return assertRuntimeValueLimit(invokeExtension('calculation', ast.name, ast.args.map(x => evalExpression(x, ctx, budget)), ctx));
        case 'BuiltinCall':
          return assertRuntimeValueLimit(evalBuiltin(ast, ctx, budget));
        case 'UserFunctionCall':
          return runUserFunction(
            ast.name,
            ast.args.map((x) => evalExpression(x, ctx, budget)),
            ctx,
            budget,
            (ctx.callDepth || 0) + 1,
            ast.argumentNames || [],
          );
        case 'SensorRead':
          return evalSensor(ast, ctx, budget);
        default:
          throw new AkariError('R411', `評価できない式 ${ast.kind}`);
      }
      } catch (error) {
        if (error instanceof AkariError && !error.line && ast.sourceSpan) {
          error.line = ast.sourceSpan.startLine;
          error.column = ast.sourceSpan.startColumn;
        }
        throw error;
      }
    }
    function evalBuiltin(ast, ctx, budget) {
      const name = ast.name,
        args = ast.args.map((x) => evalExpression(x, ctx, budget)),
        meta = BUILTIN_META.get(name);
      if (meta && (args.length < meta.minArgs || args.length > meta.maxArgs))
        throw new AkariError('R411', `組み込み計算「${name}」で受け取る値の数が違います`);
      if (name === 'CONTAINS') {
        const [a, b] = args;
        if (Array.isArray(a)) {
          if (Array.isArray(b))
            throw new AkariError('R411', 'リストの中から探す値は1つの値にします');
          return a.some((x) => sameValue(x, b));
        }
        if (typeof a === 'string' && typeof b === 'string') return a.includes(b);
        throw new AkariError('R411', '「含まれている」はリストまたは文字に使います');
      }
      if (name === 'INDEX_OF') {
        const [a, b] = args;
        if (Array.isArray(a)) {
          const i = a.findIndex((x) => sameValue(x, b));
          return i < 0 ? 0 : i + 1;
        }
        if (typeof a === 'string' && typeof b === 'string') {
          return unicodeIndexOf(a, b);
        }
        throw new AkariError('R411', '「最初にある番号」はリストまたは文字に使います');
      }
      if (name === 'LENGTH') {
        const a = args[0];
        if (Array.isArray(a)) return a.length;
        if (typeof a === 'string') return Array.from(a).length;
        throw new AkariError('R411', '「長さ」はリストまたは文字に使います');
      }
      if (name === 'STRING_LENGTH') {
        return Array.from(stringv(args[0])).length;
      }
      if (name === 'STRING_CHAR') {
        const arr = Array.from(stringv(args[0])),
          i = integerIndex(args[1]);
        if (i > arr.length) throw new AkariError('R404', '文字の範囲外です');
        return arr[i - 1];
      }
      const nums = () => args.map((x) => numberValue(x));
      switch (name) {
        case '乱数': {
          if (args.length !== 2) throw new AkariError('R411', '乱数は2つの数を使います');
          const unit = commonUnit(args);
          let [a, b] = nums();
          if (a === b) return quantity(a, unit);
          const lo = Math.min(a, b),
            hi = Math.max(a, b),
            f = ctx.runtime.prng.nextFloat();
          const span = hi - lo,
            integers = Number.isInteger(a) && Number.isInteger(b);
          let value;
          if (integers && Number.isSafeInteger(span + 1)) value = Math.floor(f * (span + 1)) + lo;
          else {
            value = Number.isFinite(span) ? lo + f * span : lo * (1 - f) + hi * f;
            if (integers) value = Math.floor(value);
          }
          return quantity(clamp(ensureFinite(value), lo, hi), unit);
        }
        case '余り': {
          if (args.length !== 2) throw new AkariError('R411', '余りは2つの数を使います');
          const unit = commonUnit(args);
          const [a, b] = nums();
          if (b === 0) throw new AkariError('R401', '0で余りは求められません');
          return quantity(ensureFinite(a % b), unit);
        }
        case '四捨五入': {
          const n = numberValue(args[0]);
          return quantity(n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5), unitOf(args[0]));
        }
        case '切り上げ':
          return quantity(Math.ceil(numberValue(args[0])), unitOf(args[0]));
        case '切り捨て':
          return quantity(Math.floor(numberValue(args[0])), unitOf(args[0]));
        case '絶対値':
          return quantity(Math.abs(numberValue(args[0])), unitOf(args[0]));
        case '平方根': {
          const n = numeric(args[0]);
          if (n < 0) throw new AkariError('R402', '負の数の平方根は扱いません');
          return Math.sqrt(n);
        }
        case '正弦':
          return Math.sin(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '余弦':
          return Math.cos(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '正接':
          return Math.tan(numberInUnit(args[0], '度') * (Math.PI / 180));
        case '逆正弦': {
          const n = numeric(args[0]);
          if (n < -1 || n > 1) throw new AkariError('R402', '逆正弦は-1〜1で指定します');
          return quantity((Math.asin(n) * 180) / Math.PI, '度');
        }
        case '逆余弦': {
          const n = numeric(args[0]);
          if (n < -1 || n > 1) throw new AkariError('R402', '逆余弦は-1〜1で指定します');
          return quantity((Math.acos(n) * 180) / Math.PI, '度');
        }
        case '逆正接':
          return quantity((Math.atan(numeric(args[0])) * 180) / Math.PI, '度');
        case '自然対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '自然対数は0より大きい数で指定します');
          return Math.log(n);
        }
        case '常用対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '常用対数は0より大きい数で指定します');
          return Math.log10(n);
        }
        case '指数':
          return ensureFinite(Math.exp(numeric(args[0])));
        case '最小':
          if (!args.length) throw new AkariError('R411', '最小には1つ以上の数が必要です');
          return quantity(Math.min(...nums()), commonUnit(args));
        case '最大':
          if (!args.length) throw new AkariError('R411', '最大には1つ以上の数が必要です');
          return quantity(Math.max(...nums()), commonUnit(args));
        case '数': {
          if (args.length !== 1 || typeof args[0] !== 'string')
            throw new AkariError('R411', '数（...）には文字を1つ渡します');
          const s = args[0];
          if (!/^[＋+－-]?[0-9]+(?:\.[0-9]+)?$/.test(s))
            throw new AkariError('R411', 'この文字は数に変換できません');
          return ensureFinite(Number(s.replace('＋', '+').replace('－', '-')));
        }
        case '文字':
          if (args.length !== 1 || Array.isArray(args[0]) || args[0] == null)
            throw new AkariError('R411', 'この値は文字に変換できません');
          return valueText(args[0]);
        case 'つなぐ':
          if (args.length < 2) throw new AkariError('R411', 'つなぐには2つ以上の値が必要です');
          {
            const s = args
              .map((x) => {
                if (Array.isArray(x))
                  throw new AkariError('R411', 'リストはそのまま文字へつなげません');
                return valueText(x);
              })
              .join('');
            if (cpLen(s) > LIMITS.stringChars) throw new AkariError('R413', '文字が長すぎます');
            return s;
          }
        default:
          throw new AkariError('R411', `組み込み計算「${name}」を実行できません`);
      }
    }
    function evalSensor(ast, ctx, budget) {
      const r = ctx.runtime,
        a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? r.actor(ctx.runtimeId) : null,
        s = ast.sensor;
      switch (s) {
        case '横位置':
          if (!a) throw new AkariError('R407', '横位置には部品文脈が必要です');
          return quantity(a.x, '歩');
        case '縦位置':
          if (!a) throw new AkariError('R407', '縦位置には部品文脈が必要です');
          return quantity(a.y, '歩');
        case '方向':
          if (!a) throw new AkariError('R407', '方向には部品文脈が必要です');
          return quantity(a.direction, '度');
        case '大きさ':
          if (!a) throw new AkariError('R407', '大きさには部品文脈が必要です');
          return quantity(a.scalePercent, '％');
        case '衣装番号': {
          if (!a) throw new AkariError('R407', '衣装番号には部品文脈が必要です');
          const c = r.component(ctx.runtimeId);
          if (c?.type !== 'sprite') throw new AkariError('R406', '衣装はキャラクターだけです');
          return c.costumes.findIndex((x) => x.id === a.costumeId) + 1;
        }
        case '衣装名': {
          if (!a) throw new AkariError('R407', '衣装名には部品文脈が必要です');
          const c = r.component(ctx.runtimeId);
          return c?.costumes?.find((x) => x.id === a.costumeId)?.name || '';
        }
        case '背景番号':
          return r.project.stage.backdrops.findIndex((x) => x.id === r.stage.backdropId) + 1;
        case '背景名':
          return r.project.stage.backdrops.find((x) => x.id === r.stage.backdropId)?.name || '';
        case 'マウスの横位置':
          return quantity(r.mouseX, '歩');
        case 'マウスの縦位置':
          return quantity(r.mouseY, '歩');
        case 'マウスが押されている':
          return r.mouseDown;
        case 'タイマー':
          return quantity((r.now() - r.startTime) / 1000, '秒');
        case '拡張の値':
          if (!Object.hasOwn(ctx.eventContext || {}, 'payload')) throw new AkariError('E705', '拡張のできごとの中で使ってください');
          return assertRuntimeValueLimit(ctx.eventContext.payload);
        case '答え':
          return ctx.task?.lastAnswer ?? '';
        case '音量':
          return quantity(a?.volume ?? r.stage.volume, '％');
        case '音程':
          return a?.pitch ?? r.stage.pitch;
        case 'クローンである':
          if (!a) throw new AkariError('R407', 'クローン判定には部品文脈が必要です');
          return !!a.isClone;
        case '押されたキー':
          return ctx.eventContext?.key ?? '';
        case '受け取った知らせ':
          return ctx.eventContext?.message ?? '';
        case '以前の値':
          return ctx.eventContext?.oldValue ?? '';
        case '新しい値':
          return ctx.eventContext?.newValue ?? '';
        case '以前の背景名':
          return ctx.eventContext?.oldName ?? '';
        case '新しい背景名':
          return ctx.eventContext?.newName ?? '';
        case 'INPUT_VALUE': {
          const name = stringv(evalExpression(ast.arg, ctx, budget));
          const c = r.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」がありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は入力欄ではありません`);
          const inst = r.actor(c.id);
          return inst?.inputValue ?? c.text;
        }
        case 'DISTANCE_TO':
          return quantity(r.distance(ctx.runtimeId, stringv(evalExpression(ast.arg, ctx, budget))), '歩');
        case 'KEY_DOWN':
          return r.pressedKeys.has(stringv(evalExpression(ast.arg, ctx, budget)));
        case 'TOUCHING':
          return r.touching(ctx.runtimeId, stringv(evalExpression(ast.arg, ctx, budget)));
        case 'TOUCHING_COLOR':
          return r.touchingColor(ctx.runtimeId, stringv(evalExpression(ast.arg, ctx, budget)));
        default:
          throw new AkariError('R411', `センサー「${s}」を読み取れません`);
      }
    }

    function snapshotEntries(map) {
      return [...(map || [])].map(([k, v]) => [k, deepCopy(v)]);
    }
    function snapshotFrame(frame, kind) {
      return {
        kind,
        id: frame.id || '',
        name: frame.name,
        line: frame.currentLine || 0,
        args: snapshotEntries(frame.args),
        locals: snapshotEntries(frame.locals),
        localLists: snapshotEntries(frame.localLists),
      };
    }
    function freezeRecord(value) {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const x of Object.values(value)) freezeRecord(x);
        Object.freeze(value);
      }
      return value;
    }

    function namedArgumentDetails(expected, supplied) {
      if (!supplied?.length) return '';
      const parts=[],quoted=names=>names.map(name=>`「${name}」`).join('、');
      const missing=expected.filter(name=>!supplied.includes(name)),unknown=[...new Set(supplied.filter(name=>!expected.includes(name)))],duplicates=[...new Set(supplied.filter((name,i)=>supplied.indexOf(name)!==i))];
      if(missing.length)parts.push('足りない名前: '+quoted(missing));
      if(unknown.length)parts.push('定義にない名前: '+quoted(unknown));
      if(duplicates.length)parts.push('重複した名前: '+quoted(duplicates));
      return parts.length?'（'+parts.join('。')+'）':'';
    }
    function runUserFunction(name, args, ctx, budget = null, depth = 1, argumentNames = []) {
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '計算の呼び出しが深すぎます');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `計算「${name}」がありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `計算「${name}」が受け取る値は${def.args.length}個です`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `計算「${name}」の受け取る値の名前が一致しません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `計算「${name}」を準備できません`);
      const frame = {
        args: new Map(def.args.map((n, i) => [n, deepCopy(args[i])])),
        locals: new Map(),
        localLists: new Map(),
        name,
        id: def.id,
        selfRuntimeId: ctx.runtimeId,
      };
      const fctx = { ...ctx, functionFrame: frame, callDepth: depth, budget };
      try {
        execFunctionNodes(ast.body, fctx, budget, 0);
      } catch (sig) {
        if (sig instanceof ScriptSignal && sig.kind === 'return') return deepCopy(sig.value);
        if (sig instanceof AkariError) {
          sig.akariCallStack = [`計算 ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `計算「${name}」が値を返しませんでした`);
    }
    function execFunctionNodes(nodes, inheritedContext, budget, loopDepth) {
      for (const n of nodes) {
        if (n.kind === 'CommentLine') continue;
        // A nested suite changes the effective subject, never the function's self.
        const ctx = { ...inheritedContext, runtimeId: inheritedContext.runtime.resolveActorRef(
          n.actorRef, inheritedContext.functionFrame.selfRuntimeId) };
        ctx.functionFrame.currentLine = n.sourceSpan?.startLine || 1;
        if (++budget.count > LIMITS.functionOps)
          throw new AkariError('R409', '計算の量が上限を超えました');
        try {
          switch (n.kind) {
            case 'NoOperation':
              break;
            case 'LocalVariableDeclaration':
              ctx.functionFrame.locals.set(
                n.name,
                localScalar(evalExpression(n.initial, ctx, budget)),
              );
              break;
            case 'LocalListDeclaration':
              ctx.functionFrame.localLists.set(n.name, []);
              break;
            case 'Assignment':
              ctx.runtime.writeTarget(n.target, evalExpression(n.value, ctx, budget), ctx);
              break;
            case 'NumericUpdate': {
              const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
              if (!b?.set) throw new AkariError('S301', '代入先がありません');
              const value = addNumericUpdate(b.get(), evalExpression(n.value, ctx, budget), n.op);
              ctx.runtime.writeTarget(n.target, value, ctx, {resolvedBinding: b});
              break;
            }
            case 'ListAppend':
            case 'ListInsert':
            case 'ListReplace':
            case 'ListDelete':
            case 'ListClear':
              execListMutation(n, ctx, budget);
              break;
            case 'IfStatement':
              execFunctionNodes(
                bool(evalExpression(n.condition, ctx, budget)) ? n.thenBody : n.elseBody,
                ctx,
                budget,
                loopDepth,
              );
              break;
            case 'RepeatCount': {
              const count = numberInUnit(evalExpression(n.count, ctx, budget), '回');
              if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
                throw new AkariError('R413', 'くり返し回数は0以上の整数で上限以内にします');
              for (let i = 0; i < count; i++) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の量が上限を超えました');
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            }
            case 'RepeatWhile':
              while (bool(evalExpression(n.condition, ctx, budget))) {
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'RepeatUntil':
              while (!bool(evalExpression(n.condition, ctx, budget))) {
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'Forever':
              for (;;) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の量が上限を超えました');
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'ForEach': {
              const arr = evalExpression(n.list, ctx, budget);
              if (!Array.isArray(arr))
                throw new AkariError('R411', '「それぞれ」はリストに使います');
              for (const v of deepCopy(arr)) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の量が上限を超えました');
                const old = ctx.functionFrame.locals.has(n.binder)
                    ? ctx.functionFrame.locals.get(n.binder)
                    : undefined,
                  had = ctx.functionFrame.locals.has(n.binder);
                ctx.functionFrame.locals.set(n.binder, deepCopy(v));
                try {
                  execFunctionNodes(n.body, ctx, budget, loopDepth + 1);
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') {
                    if (had) ctx.functionFrame.locals.set(n.binder, old);
                    else ctx.functionFrame.locals.delete(n.binder);
                    break;
                  }
                  if (!(s instanceof ScriptSignal && s.kind === 'continue')) throw s;
                }
                if (had) ctx.functionFrame.locals.set(n.binder, old);
                else ctx.functionFrame.locals.delete(n.binder);
              }
              break;
            }
            case 'Break':
              throw new ScriptSignal('break');
            case 'Continue':
              throw new ScriptSignal('continue');
            case 'ReturnStatement': {
              const s = new ScriptSignal('return');
              s.value = evalExpression(n.value, ctx, budget);
              throw s;
            }
            default:
              throw new AkariError('S305', '計算ではこの命令を使えません');
          }
        } catch (err) {
          if (err instanceof AkariError && !err.akariSource) {
            if (!err.line) {
              err.line = n.sourceSpan?.startLine || 1;
              err.column = n.sourceSpan?.startColumn || 1;
            }
            err.akariSource = { key: `function:${ctx.functionFrame.id}` };
          }
          throw err;
        }
      }
    }
    function execListMutation(n, ctx, budget = null) {
      const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
      if (!b || !b.set) throw new AkariError('S301', 'リストがありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'この操作はリストに使います');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex(evalExpression(n.index, ctx, budget)) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', '挿入位置がリストの範囲外です');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', '置換位置がリストの範囲外です');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', '削除位置がリストの範囲外です');
        arr.splice(idx - 1, 1);
      }
      b.set(arr);
    }
    // Derived operation policies use resumable evaluation on the main event loop.
    // The standard policy retains the existing synchronous evaluator and accounting.
    function hasUserFunction(value) {
      if (!value || typeof value !== 'object') return false;
      if (value.kind === 'UserFunctionCall') return true;
      return Object.entries(value).some(([key, child]) => !['body','thenBody','elseBody','sourceSpan','actorRef'].includes(key) &&
        (Array.isArray(child) ? child.some(hasUserFunction) : hasUserFunction(child)));
    }
    function valueExpression(value) {
      if (isQuantity(value)) return {kind:'QuantityLiteral',unit:value.unit,value:{kind:'NumberLiteral',value:value.magnitude}};
      if (Array.isArray(value)) return {kind:'ListLiteral',items:value.map(valueExpression)};
      return {kind:typeof value==='number'?'NumberLiteral':typeof value==='boolean'?'BooleanLiteral':'StringLiteral',value};
    }
    function* calculationCheckpoint(budget) {
      if (++budget.count > LIMITS.functionOps) throw new AkariError('R409','計算の量が上限を超えました');
      if ((budget.count & 127) === 0) yield;
    }
    function* evalExpressionSteps(ast, ctx, budget) {
      if (ast.kind !== 'QuantityLiteral') yield* calculationCheckpoint(budget);
      if (ast.kind === 'UserFunctionCall') {
        const args=[]; for (const argument of ast.args) args.push(yield* evalExpressionSteps(argument,ctx,budget));
        return yield* runUserFunctionSteps(ast.name,args,ctx,budget,(ctx.callDepth||0)+1,ast.argumentNames||[]);
      }
      if (ast.kind === 'ActorQualifiedRead') return yield* evalExpressionSteps(ast.value,
        {...ctx,runtimeId:ctx.runtime.resolveActorRef(ast.actorRef,ctx.runtimeId)},budget);
      if (ast.kind === 'LogicalExpression') {
        const left=bool(yield* evalExpressionSteps(ast.left,ctx,budget));
        if (ast.op==='AND') return left ? bool(yield* evalExpressionSteps(ast.right,ctx,budget)) : false;
        return left ? true : bool(yield* evalExpressionSteps(ast.right,ctx,budget));
      }
      const prepared={...ast};
      for (const key of ['value','left','right','list','index','arg']) if (ast[key] && typeof ast[key]==='object' && ast[key].kind)
        prepared[key]=valueExpression(yield* evalExpressionSteps(ast[key],ctx,budget));
      for (const key of ['args','items']) if (Array.isArray(ast[key])) {
        prepared[key]=[];
        for (const child of ast[key]) prepared[key].push(valueExpression(yield* evalExpressionSteps(child,ctx,budget)));
      }
      return evalExpression(prepared,ctx);
    }
    function advanceEvaluation(evaluator) {
      const started=nowMs(); let outcome;
      do { outcome=evaluator.next(); } while (!outcome.done && nowMs()-started<8);
      return outcome;
    }
    function* runUserFunctionSteps(name, args, ctx, budget = null, depth = 1, argumentNames = []) {
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '計算の呼び出しが深すぎます');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `計算「${name}」がありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `計算「${name}」が受け取る値は${def.args.length}個です`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `計算「${name}」の受け取る値の名前が一致しません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `計算「${name}」を準備できません`);
      const frame = {
        args: new Map(def.args.map((n, i) => [n, deepCopy(args[i])])),
        locals: new Map(),
        localLists: new Map(),
        name,
        id: def.id,
        selfRuntimeId: ctx.runtimeId,
      };
      const fctx = { ...ctx, functionFrame: frame, callDepth: depth, budget };
      try {
        (yield* execFunctionNodesSteps(ast.body, fctx, budget, 0));
      } catch (sig) {
        if (sig instanceof ScriptSignal && sig.kind === 'return') return deepCopy(sig.value);
        if (sig instanceof AkariError) {
          sig.akariCallStack = [`計算 ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `計算「${name}」が値を返しませんでした`);
    }
    function* execFunctionNodesSteps(nodes, inheritedContext, budget, loopDepth) {
      for (const n of nodes) {
        if (n.kind === 'CommentLine') continue;
        // A nested suite changes the effective subject, never the function's self.
        const ctx = { ...inheritedContext, runtimeId: inheritedContext.runtime.resolveActorRef(
          n.actorRef, inheritedContext.functionFrame.selfRuntimeId) };
        ctx.functionFrame.currentLine = n.sourceSpan?.startLine || 1;
        yield* calculationCheckpoint(budget);
        try {
          switch (n.kind) {
            case 'NoOperation':
              break;
            case 'LocalVariableDeclaration':
              ctx.functionFrame.locals.set(
                n.name,
                localScalar((yield* evalExpressionSteps(n.initial, ctx, budget))),
              );
              break;
            case 'LocalListDeclaration':
              ctx.functionFrame.localLists.set(n.name, []);
              break;
            case 'Assignment':
              ctx.runtime.writeTarget(n.target, (yield* evalExpressionSteps(n.value, ctx, budget)), ctx);
              break;
            case 'NumericUpdate': {
              const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
              if (!b?.set) throw new AkariError('S301', '代入先がありません');
              const value = addNumericUpdate(b.get(), (yield* evalExpressionSteps(n.value, ctx, budget)), n.op);
              ctx.runtime.writeTarget(n.target, value, ctx, {resolvedBinding: b});
              break;
            }
            case 'ListAppend':
            case 'ListInsert':
            case 'ListReplace':
            case 'ListDelete':
            case 'ListClear':
              (yield* execListMutationSteps(n, ctx, budget));
              break;
            case 'IfStatement':
              (yield* execFunctionNodesSteps(
                bool((yield* evalExpressionSteps(n.condition, ctx, budget))) ? n.thenBody : n.elseBody,
                ctx,
                budget,
                loopDepth,
              ));
              break;
            case 'RepeatCount': {
              const count = numberInUnit((yield* evalExpressionSteps(n.count, ctx, budget)), '回');
              if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
                throw new AkariError('R413', 'くり返し回数は0以上の整数で上限以内にします');
              for (let i = 0; i < count; i++) {
                yield* calculationCheckpoint(budget);
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            }
            case 'RepeatWhile':
              while (bool((yield* evalExpressionSteps(n.condition, ctx, budget)))) {
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'RepeatUntil':
              while (!bool((yield* evalExpressionSteps(n.condition, ctx, budget)))) {
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'Forever':
              for (;;) {
                yield* calculationCheckpoint(budget);
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') break;
                  if (s instanceof ScriptSignal && s.kind === 'continue') continue;
                  throw s;
                }
              }
              break;
            case 'ForEach': {
              const arr = (yield* evalExpressionSteps(n.list, ctx, budget));
              if (!Array.isArray(arr))
                throw new AkariError('R411', '「それぞれ」はリストに使います');
              for (const v of deepCopy(arr)) {
                yield* calculationCheckpoint(budget);
                const old = ctx.functionFrame.locals.has(n.binder)
                    ? ctx.functionFrame.locals.get(n.binder)
                    : undefined,
                  had = ctx.functionFrame.locals.has(n.binder);
                ctx.functionFrame.locals.set(n.binder, deepCopy(v));
                try {
                  (yield* execFunctionNodesSteps(n.body, ctx, budget, loopDepth + 1));
                } catch (s) {
                  if (s instanceof ScriptSignal && s.kind === 'break') {
                    if (had) ctx.functionFrame.locals.set(n.binder, old);
                    else ctx.functionFrame.locals.delete(n.binder);
                    break;
                  }
                  if (!(s instanceof ScriptSignal && s.kind === 'continue')) throw s;
                }
                if (had) ctx.functionFrame.locals.set(n.binder, old);
                else ctx.functionFrame.locals.delete(n.binder);
              }
              break;
            }
            case 'Break':
              throw new ScriptSignal('break');
            case 'Continue':
              throw new ScriptSignal('continue');
            case 'ReturnStatement': {
              const s = new ScriptSignal('return');
              s.value = (yield* evalExpressionSteps(n.value, ctx, budget));
              throw s;
            }
            default:
              throw new AkariError('S305', '計算ではこの命令を使えません');
          }
        } catch (err) {
          if (err instanceof AkariError && !err.akariSource) {
            if (!err.line) {
              err.line = n.sourceSpan?.startLine || 1;
              err.column = n.sourceSpan?.startColumn || 1;
            }
            err.akariSource = { key: `function:${ctx.functionFrame.id}` };
          }
          throw err;
        }
      }
    }
    function* execListMutationSteps(n, ctx, budget = null) {
      const b = ctx.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
      if (!b || !b.set) throw new AkariError('S301', 'リストがありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'この操作はリストに使います');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex((yield* evalExpressionSteps(n.index, ctx, budget))) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', '挿入位置がリストの範囲外です');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', '置換位置がリストの範囲外です');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ入れられるのは数・文字・条件の答えです');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', '削除位置がリストの範囲外です');
        arr.splice(idx - 1, 1);
      }
      b.set(arr);
    }

    class EventScheduler {
      constructor(project, compiled, runtime, ui = {}) {
        this.project = project;
        this.compiled = compiled;
        this.runtime = runtime;
        this.ui = ui;
        this.ready = [];
        this.tasks = new Map();
        this.blocked = new Set();
        this.waitGroups = new Map();
        this.pendingExternalUnblocks = new Set();
        this.seq = 0;
        this.waitSeq = 0;
        this.speechTokens = new Map();
        this.running = false;
        this.paused = false;
        this.loopScheduled = false;
        this.loopTimer = null;
        this.loopDue = 0;
        this.inLoop = false;
        this.questionQueue = [];
        this.activeQuestion = null;
        this.errorRecords = [];
        this.errorSequence = 0;
        this.errorRecordChars = 0;
        this.questionTimer = null;
        this.continuous = new Map();
        this.continuousOrigin = null;
        this.continuousTime = null;
        this.continuousTick = 1;
        this.continuousTrace = [];
      }
      initializeContinuous() {
        this.continuous.clear();
        this.continuousTrace = [];
        this.continuousOrigin = this.continuousTime = this.runtime.now();
        this.continuousTick = 1;
        for (const rule of this.compiled.rules || this.project.rules || []) {
          const runtimeId = this.runtime.resolveActorRef(rule.actorRef, rule.targetId || 'stage');
          const key = `${rule.id}:${runtimeId}`;
          if (this.continuous.has(key)) continue;
          const sourceKey = rule.id.replace(/:rule:\d+$/, '');
          const task = { taskId: `rule:${key}`, runtimeId, targetId: runtimeId, eventType: 'continuous',
            sourceKey: /^(script|action|function):/.test(sourceKey) ? sourceKey : null,
            eventContext: {}, subject: { runtimeId }, callFrames: [], execStack: [],
            broadcastGroups: new Map(), state: 'RUNNING', currentNode: rule };
          this.continuous.set(key, { rule, runtimeId, task, state: 'INACTIVE', speed: 0 });
        }
        this.refreshContinuous();
      }
      refreshContinuous() {
        if (!this.running || this.paused) return;
        for (const [key, control] of this.continuous) {
          if (!this.runtime.actor(control.runtimeId)) { this.continuous.delete(key); continue; }
          try {
            if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(control.rule)) {
              if (!control.evaluator) control.evaluator = this.evaluateContinuous(control);
              const outcome = advanceEvaluation(control.evaluator);
              if (outcome.done) {
                control.evaluator = null;
                if (outcome.value === null) control.state = 'INACTIVE';
                else if (control.state === 'INACTIVE') { control.speed = outcome.value; control.state = 'ACTIVE'; }
              }
              continue;
            }
            const ctx = this.context(control.task), enabled = bool(evalExpression(control.rule.condition, ctx));
            if (!enabled) { control.state = 'INACTIVE'; continue; }
            if (control.state !== 'INACTIVE') continue;
            const seconds = numberInUnit(evalExpression(control.rule.seconds, ctx), '秒'),
              distance = numberInUnit(evalExpression(control.rule.distance, ctx), '歩');
            if (seconds <= 0) throw new AkariError('R412', '速さの時間は0より大きくします');
            control.speed = ensureFinite(distance / seconds);
            control.state = 'ACTIVE';
          } catch (err) {
            this.continuous.delete(key);
            this.taskError(control.task, err);
            return;
          }
        }
      }
      directionVector(direction, actor) {
        switch (direction) {
          case 'right': return { x: 1, y: 0 };
          case 'left': return { x: -1, y: 0 };
          case 'up': return { x: 0, y: -1 };
          case 'down': return { x: 0, y: 1 };
          case 'forward':
          case 'backward': {
            const sign = direction === 'backward' ? -1 : 1, radians = actor.direction * Math.PI / 180;
            return { x: sign * Math.cos(radians), y: sign * Math.sin(radians) };
          }
          default: throw new AkariError('R411', '移動方向が正しくありません');
        }
      }
      advanceContinuous(at = this.runtime.now(), refresh = true) {
        if (!this.running || this.paused || this.continuousTime === null) return;
        if (!Number.isFinite(at) || at < this.continuousTime)
          throw new AkariError('R412', '論理時計を過去へ戻せません');
        while (this.continuousTime < at) {
          const grid = this.continuousOrigin + this.continuousTick * (1000 / 60),
            end = Math.min(at, grid), seconds = (end - this.continuousTime) / 1000,
            sums = new Map();
          const entries = [], moves = [];
          let failedControl = null;
          try {
            for (const [key, control] of this.continuous) {
              const actor = this.runtime.actor(control.runtimeId);
              if (!actor) { this.continuous.delete(key); continue; }
              if (control.state !== 'ACTIVE') continue;
              failedControl = control;
              const v = this.directionVector(control.rule.direction, actor),
                dx = v.x * control.speed * seconds, dy = v.y * control.speed * seconds,
                delta = sums.get(control.runtimeId) || { x: 0, y: 0 };
              delta.x = ensureFinite(delta.x + dx);
              delta.y = ensureFinite(delta.y + dy);
              if (dx) delta.xControl = control;
              if (dy) delta.yControl = control;
              sums.set(control.runtimeId, delta);
              entries.push({ ruleId: control.rule.id, runtimeId: control.runtimeId,
                from: this.continuousTime, to: end, dx, dy });
            }
            // Validate the whole interval before changing any actor or drawing.
            for (const [runtimeId, delta] of sums) {
              const actor = this.runtime.actor(runtimeId), x = actor.x, y = actor.y;
              failedControl = delta.xControl || delta.yControl;
              const nextX = ensureFinite(x + delta.x);
              failedControl = delta.yControl || delta.xControl;
              const nextY = ensureFinite(y + delta.y);
              moves.push({ actor, x, y, nextX, nextY, delta });
            }
          } catch (err) {
            for (const [key, control] of this.continuous)
              if (control === failedControl) this.continuous.delete(key);
            // Do not retry the failing interval from taskError's pause boundary.
            this.paused = true;
            this.taskError(failedControl.task, err);
            return;
          }
          for (const entry of entries) {
            this.continuousTrace.push(entry);
            if (this.continuousTrace.length > 1000) this.continuousTrace.shift();
            this.ui.continuousStep?.(entry);
          }
          for (const { actor, x, y, nextX, nextY, delta } of moves) {
            actor.x = nextX; actor.y = nextY;
            if (actor.penDown && (delta.x || delta.y))
              this.ui.penLine?.(x + actor.w / 2, y + actor.h / 2,
                actor.x + actor.w / 2, actor.y + actor.h / 2, actor.penColor, actor.penSize);
          }
          this.continuousTime = end;
          // Keep position predicates on the same logical lattice as overlapping glides.
          if (this.continuous.size) {
            for (const task of this.blocked) if (task.blockReason?.kind === 'glide') {
              try { this.advanceGlide(task, task.blockReason, end); }
              catch (err) { this.taskError(task, err); break; }
            }
          }
          if (end === grid) { this.continuousTick++; if (refresh) this.refreshContinuous(); }
          if (this.paused || !this.running) break;
        }
        if (this.continuous.size) this.ui.render?.();
      }
      inputBoundary(change) {
        this.advanceContinuous();
        change();
        this.refreshContinuous();
        this.schedule();
      }
      setKeyState(key, down) {
        const changed = this.runtime.pressedKeys.has(key) !== down;
        if (changed) this.inputBoundary(() => {
          if (down) this.runtime.pressedKeys.add(key);
          else this.runtime.pressedKeys.delete(key);
        });
        return changed;
      }
      releaseInput(pause = false) {
        this.inputBoundary(() => {
          this.runtime.pressedKeys.clear();
          this.runtime.mouseDown = false;
        });
        if (pause) this.pause();
      }
      scriptAst(targetId, event, scriptId = null) {
        return (scriptId ? this.compiled.astByKey.get(`script:${scriptId}`) : null) ||
          this.compiled.astByKey.get(`script:${targetId}:${event}`) || null;
      }
      matchingScripts(targetId, event, eventContext) {
        const scripts = this.compiled.items?.some(item => item.key.startsWith('script:')) ? this.compiled.items
          .filter(item => item.key.startsWith('script:')).map(item => ({
            id: item.scriptId || item.id || (item.key.split(':').length === 2 ? item.key.split(':')[1] : undefined),
            targetId: item.targetId || item.ownerId, event: item.event || item.key.split(':')[2], filter: item.filter,
          })) : this.project.scripts || (this.compiled.items ||
          [...this.compiled.astByKey.keys()].map((key) => ({ key })))
          .filter((item) => item.key.startsWith('script:')).map((item) => {
            const parts = item.key.split(':');
            return { id: item.scriptId || item.id || (parts.length === 2 ? parts[1] : undefined),
              targetId: item.targetId || item.ownerId || parts[1],
              event: item.event || parts[2], filter: item.filter };
          });
        return scripts.filter((s) => s.targetId === targetId && s.event === event &&
          (s.filter == null || (typeof s.filter === 'object' ?
            (event === 'keyDown' ? s.filter.key : s.filter.message) : s.filter) ===
            (event === 'keyDown' ? eventContext.key : eventContext.message)));
      }
      spawnMatching(targetId, runtimeId, eventType, eventContext, waitGroupId) {
        const out = [];
        for (const script of this.matchingScripts(targetId, eventType, eventContext)) {
          const t = this.createTask(targetId, runtimeId, eventType, eventContext, waitGroupId, script.id);
          if (t) { this.enqueue(t); out.push(t); }
        }
        return out;
      }
      hasExecutable(ast) {
        return !!ast && ast.body.some((n) => n.kind !== 'CommentLine');
      }
      createTask(targetId, runtimeId, eventType, eventContext = {}, waitGroupId = null, scriptId = null) {
        const ast = this.scriptAst(targetId, eventType, scriptId);
        if (!this.hasExecutable(ast)) return null;
        if (this.tasks.size >= LIMITS.activeTasks)
          throw new AkariError('R413', '同時実行コード数が上限を超えました');
        const task = {
          taskId: `task-${++this.seq}`,
          scriptId,
          subject: { runtimeId },
          broadcastGroups: new Map(),
          targetId,
          runtimeId,
          eventType,
          eventContext: { ...eventContext },
          lastAnswer: '',
          callFrames: [],
          execStack: [{ type: 'seq', nodes: ast.body, index: 0 }],
          state: 'READY',
          waitGroupId,
          createdSequence: this.seq,
          error: null,
        };
        this.tasks.set(task.taskId, task);
        if (waitGroupId) this.waitGroups.get(waitGroupId)?.pending.add(task.taskId);
        return task;
      }
      enqueue(task) {
        if (!task || ['DONE', 'CANCELLED', 'ERROR'].includes(task.state)) return;
        task.state = 'READY';
        if (!this.ready.includes(task)) this.ready.push(task);
        this.schedule();
      }
      spawnForRuntime(runtimeId, eventType, eventContext = {}, waitGroupId = null) {
        let targetId;
        if (runtimeId === 'stage') targetId = 'stage';
        else {
          const a = this.runtime.actor(runtimeId);
          if (!a) return null;
          targetId = a.baseId;
        }
        return this.spawnMatching(targetId, runtimeId, eventType, eventContext, waitGroupId)[0] || null;
      }
      orderedRuntimeIds() {
        const out = ['stage'];
        for (const c of this.project.components) {
          if (this.runtime.actors.has(c.id)) out.push(c.id);
          const clones = [...this.runtime.actors.values()]
            .filter((a) => a.baseId === c.id && a.isClone)
            .sort((a, b) => a.creationSequence - b.creationSequence);
          for (const a of clones) out.push(a.runtimeId);
        }
        return out;
      }
      spawnDistributed(eventType, eventContext = {}, waitGroupId = null) {
        const out = [];
        for (const rid of this.orderedRuntimeIds()) {
          if (eventType === 'start' && rid !== 'stage' && this.runtime.actor(rid)?.isClone)
            continue;
          out.push(...this.spawnMatching(
            rid === 'stage' ? 'stage' : this.runtime.actor(rid)?.baseId,
            rid, eventType, eventContext, waitGroupId));
        }
        return out;
      }
      start() {
        extensions.endSession();
        this.extensionEpoch = (this.extensionEpoch || 0) + 1;
        this.extensionCompletions = [];
        this.extensionEvents = [];
        if (Object.hasOwn(this.project, 'extensions')) validateExtensionEnvelope(this.project.extensions);
        const epoch = this.extensionEpoch;
        if (extensions.requirements().required.length) extensions.beginSession({ state: this.project.extensions?.state || extensions.initialState(),
          onEvent: event => {
            if (epoch !== this.extensionEpoch) return;
            if (this.extensionEvents.length >= LIMITS.activeTasks) {
              const task = [...this.tasks.values()][0];
              if (task) this.taskError(task, new AkariError('E708', '拡張の通知が滞留上限を超えました'));
              else this.stop();
              return;
            }
            this.extensionEvents.push(event); this.schedule();
          },
        });
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.runtime.resumeClock();
        this.running = true;
        this.paused = false;
        this.ready = [];
        this.tasks.clear();
        this.blocked.clear();
        this.waitGroups.clear();
        this.pendingExternalUnblocks.clear();
        this.errorRecords = [];
        this.errorRecordChars = 0;
        this.errorSequence = 0;
        this.questionQueue = [];
        this.activeQuestion = null;
        this.initializeContinuous();
        this.spawnDistributed('start', {});
        this.ui.state?.();
        this.schedule();
      }
      stop() {
        this.advanceContinuous(this.runtime.now(), LIMITS.functionOps === STANDARD_LIMITS.functionOps);
        if (extensions.active && extensions.requirements().required.length) this.project.extensions = {
          ...extensions.requirements(), profile: profiles.requirement(), state: extensions.snapshotState(),
        };
        this.extensionEpoch = (this.extensionEpoch || 0) + 1;
        extensions.endSession();
        this.extensionCompletions = []; this.extensionEvents = [];
        for (const task of this.tasks.values()) task.extensionAbort?.abort();
        clearTimeout(this.loopTimer);
        clearTimeout(this.questionTimer);
        this.loopTimer = null;
        this.questionTimer = null;
        this.loopScheduled = false;
        this.continuous.clear();
        this.runtime.pauseClock();
        this.running = false;
        this.paused = false;
        for (const t of this.tasks.values()) {
          t.state = 'CANCELLED';
          t.blockReason = null;
          t.execStack = [];
          t.callFrames = [];
        }
        this.tasks.clear();
        this.ready = [];
        this.blocked.clear();
        this.waitGroups.clear();
        this.pendingExternalUnblocks.clear();
        this.questionQueue = [];
        this.activeQuestion = null;
        this.errorRecords = [];
        this.errorRecordChars = 0;
        this.runtime.pressedKeys.clear();
        this.runtime.mouseDown = false;
        this.runtime.stopAllAudio(false);
        this.ui.closeQuestion?.();
        this.ui.state?.();
      }
      pause() {
        if (!this.running) return;
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.advanceContinuous();
        this.runtime.pauseClock();
        this.paused = true;
        this.ui.state?.();
      }
      resume() {
        if (!this.running) return;
        this.runtime.resumeClock();
        this.paused = false;
        this.refreshContinuous();
        this.ui.state?.();
        this.schedule();
      }
      stepOne() {
        if (!this.running) return;
        this.pause();
        this.runTurn(true);
      }
      schedule(delay = 0) {
        if (!this.running || this.paused || this.inLoop) return;
        const due = nowMs() + delay;
        if (this.loopScheduled) {
          if (due >= this.loopDue) return;
          clearTimeout(this.loopTimer);
        }
        this.loopScheduled = true;
        this.loopDue = due;
        this.loopTimer = setTimeout(() => {
          this.loopTimer = null;
          this.loopScheduled = false;
          this.loop();
        }, delay);
      }
      loop() {
        if (!this.running || this.paused) return;
        this.inLoop = true;
        const started = nowMs();
        let count = 0;
        try {
          while (
            this.running &&
            !this.paused &&
            this.ready.length &&
            count < 200 &&
            nowMs() - started < 8
          ) {
            this.runTurn(false);
            count++;
          }
          this.recheckBlocked();
        } finally {
          this.inLoop = false;
        }
        if (this.running && !this.paused) {
          if (this.ready.length) this.schedule();
          else if (
            this.continuous.size || [...this.blocked].some((t) =>
              ['time', 'condition', 'glide', 'calculation'].includes(t.blockReason?.kind),
            )
          )
            this.schedule(16);
        }
      }
      context(task, extra = {}) {
        return {
          runtime: this.runtime,
          compiled: this.compiled,
          task,
          runtimeId: task.subject?.runtimeId || task.callFrames.at(-1)?.runtimeId || task.runtimeId,
          eventContext: task.eventContext,
          ...extra,
        };
      }
      selectSubject(task, node) {
        const relative = task.callFrames.at(-1)?.runtimeId || task.runtimeId;
        task.subject = { runtimeId: this.runtime.resolveActorRef(node.actorRef, relative) };
      }
      normalizeStack(task) {
        let guard = 0;
        while (task.execStack.length && guard++ < 1000) {
          const top = task.execStack[task.execStack.length - 1];
          if (top.type === 'seq') {
            if (top.index < top.nodes.length) return top;
            task.execStack.pop();
            continue;
          }
          if (top.type === 'callBoundary') {
            task.execStack.pop();
            const finishedFrame = task.callFrames.pop();
            for (const id of finishedFrame.broadcastGroups?.values() || []) this.waitGroups.delete(id);
            continue;
          }
          if (top.type === 'repeatCount') {
            if (top.remaining > 0) {
              top.remaining--;
              task.execStack.push({ type: 'seq', nodes: top.node.body, index: 0 });
              if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
                return { type: 'idle', node: top.node };
              continue;
            }
            task.execStack.pop();
            continue;
          }
          if (top.type === 'forever') {
            task.execStack.push({ type: 'seq', nodes: top.node.body, index: 0 });
            if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
              return { type: 'idle', node: top.node };
            continue;
          }
          if (top.type === 'foreach') {
            if (top.index < top.values.length) {
              const value = deepCopy(top.values[top.index++]);
              task.execStack.push({
                type: 'seq',
                nodes: top.node.body,
                index: 0,
                binder: { name: top.node.binder, value },
              });
              if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
                return { type: 'idle', node: top.node };
              continue;
            }
            task.execStack.pop();
            continue;
          }
          if (top.type === 'while' || top.type === 'until') return top;
          break;
        }
        if (guard >= 1000) throw new AkariError('R413', '内部くり返しの進行量が上限を超えました');
        return task.execStack[task.execStack.length - 1] || null;
      }
      nextStep(task) {
        const top = this.normalizeStack(task);
        if (!top) return null;
        if (top.type === 'idle') return { kind: 'idle', node: top.node };
        if (top.type === 'seq') {
          while (top.index < top.nodes.length) {
            const n = top.nodes[top.index++];
            if (n.kind === 'CommentLine') continue;
            return { kind: 'node', node: n };
          }
          return this.nextStep(task);
        }
        if (top.type === 'while' || top.type === 'until')
          return { kind: 'loopHeader', frame: top, node: top.node };
        return null;
      }
      runTurn(force = false) {
        if (!this.running || (!force && this.paused)) return false;
        const beforeErrors = this.errorSequence;
        this.recheckBlocked(force);
        if (!this.running || this.errorSequence !== beforeErrors || (!force && this.paused))
          return false;
        const task = this.ready.shift();
        if (!task) return false;
        if (task.state !== 'READY') return false;
        task.state = 'RUNNING';
        let step;
        try {
          step = this.nextStep(task);
          if (!step) {
            this.finishTask(task, 'DONE');
            return true;
          }
          task.currentNode = step.node;
          this.selectSubject(task, step.node);
          const frame = task.callFrames.at(-1);
          if (frame) frame.currentLine = step.node.sourceSpan?.startLine || 1;
          if (step.kind !== 'idle') this.ui.beforeStatement?.(task, step.node);
          if (step.kind === 'node') this.executeNode(task, step.node);
          else if (step.kind === 'loopHeader') this.executeLoopHeader(task, step.frame);
          if (task.state === 'RUNNING' && !this.blocked.has(task)) {
            const next = this.normalizeStack(task);
            if (!next) this.finishTask(task, 'DONE');
            else this.enqueue(task);
          }
          this.refreshContinuous();
          this.ui.afterStatement?.(task, step.node);
          this.recheckBlocked(force);
          return true;
        } catch (err) {
          this.taskError(task, err);
          return true;
        }
      }
      prepareCooperativeNode(task, node, loopFrame = null) {
        if (!hasUserFunction(node)) return false;
        this.selectSubject(task,node);
        const ctx=this.context(task), result={...node}, scheduler=this;
        function* prepare() {
          const budget={count:0};
          for (const key of ['value','condition','count','seconds','question','message','initial','list','index'])
            if (node[key]?.kind && hasUserFunction(node[key])) result[key]=valueExpression(yield* evalExpressionSteps(node[key],ctx,budget));
          if (node.args?.some(hasUserFunction)) {
            result.args=[];
            for (const argument of node.args) result.args.push(valueExpression(yield* evalExpressionSteps(argument,ctx,budget)));
          }
          return result;
        }
        this.block(task,{kind:'calculation',evaluator:prepare(),epoch:this.extensionEpoch,loopFrame,originalNode:node});
        this.schedule(0); return true;
      }
      advanceCalculation(task) {
        const reason=task.blockReason;
        if (!reason || reason.kind!=='calculation' || !this.running || reason.epoch!==this.extensionEpoch) return;
        const outcome=advanceEvaluation(reason.evaluator);
        if (!outcome.done) return;
        this.blocked.delete(task); task.blockReason=null; task.state='RUNNING';
        if (reason.loopFrame) {
          const keep=bool(evalExpression(outcome.value.condition,this.context(task)));
          if (reason.loopFrame.type==='while'?keep:!keep) this.enterBody(task,reason.loopFrame.node.body);
          else task.execStack.pop();
        } else this.executePreparedNode(task,outcome.value,reason.originalNode);
        if (task.state==='RUNNING') {
          if (this.normalizeStack(task)) this.enqueue(task); else this.finishTask(task,'DONE');
        }
        this.ui.afterStatement?.(task,outcome.value);
      }
      *evaluateContinuous(control) {
        const ctx=this.context(control.task), budget={count:0};
        if (!bool(yield* evalExpressionSteps(control.rule.condition,ctx,budget))) return null;
        if (control.state !== 'INACTIVE') return control.speed;
        const seconds=numberInUnit(yield* evalExpressionSteps(control.rule.seconds,ctx,budget),'秒'),
          distance=numberInUnit(yield* evalExpressionSteps(control.rule.distance,ctx,budget),'歩');
        if (seconds<=0) throw new AkariError('R412','速さの時間は0より大きくします');
        return ensureFinite(distance/seconds);
      }

      executeLoopHeader(task, frame) {
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && this.prepareCooperativeNode(task, frame.node, frame)) return;
        const v = bool(evalExpression(frame.node.condition, this.context(task)));
        const keep = frame.type === 'while' ? v : !v;
        if (keep) {
          task.execStack.push({ type: 'seq', nodes: frame.node.body, index: 0 });
        } else task.execStack.pop();
        return { requeue: true };
      }
      enterBody(task, nodes, binder = null) {
        task.execStack.push({ type: 'seq', nodes, index: 0, ...(binder ? { binder } : {}) });
      }
      executeNode(task, n) {
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && this.prepareCooperativeNode(task, n)) return;
        return this.executePreparedNode(task, n);
      }
      executePreparedNode(task, n, originalNode = n) {
        this.selectSubject(task, n);
        const ctx = this.context(task);
        switch (n.kind) {
          case 'ExtensionCommand': {
            const controller = new AbortController(), epoch = this.extensionEpoch;
            task.extensionAbort = controller;
            const result = invokeExtension('command', n.name, n.args.map(x => evalExpression(x, ctx)), { ...ctx, signal: controller.signal });
            if (result && typeof result.then === 'function') {
              this.block(task, { kind: 'extension' });
              const complete = (error, value) => {
                if (!this.running || this.extensionEpoch !== epoch || !this.tasks.has(task.taskId) || controller.signal.aborted) return;
                this.extensionCompletions.push(() => {
                  if (!this.tasks.has(task.taskId) || controller.signal.aborted) return;
                  if (error) this.taskError(task, extensionError(error));
                  else { if (value !== null) task.lastAnswer = value; this.unblock(task); }
                }); this.schedule();
              };
              result.then(value => complete(null, value), error => complete(error));
              return { requeue: false };
            }
            if (result !== null) task.lastAnswer = result;
            return;
          }
          case 'NoOperation':
            return;
          case 'Assignment':
            this.runtime.writeTarget(n.target, evalExpression(n.value, ctx), ctx);
            this.ui.render?.();
            return;
          case 'NumericUpdate': {
            const b = this.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
            if (!b?.set) throw new AkariError('S301', `代入先「${n.target.name}」がありません`);
            const cur = b.get(),
              v = evalExpression(n.value, ctx);
            if (Array.isArray(cur)) throw new AkariError('R411', '数の変数に使う命令です');
            this.runtime.writeTarget(n.target, addNumericUpdate(cur, v, n.op), ctx, {resolvedBinding: b});
            this.ui.renderMonitor?.();
            return;
          }
          case 'ListAppend':
          case 'ListInsert':
          case 'ListReplace':
          case 'ListDelete':
          case 'ListClear':
            execListMutation(n, ctx);
            this.ui.renderMonitor?.();
            return;
          case 'IfStatement':
            this.enterBody(task, bool(evalExpression(n.condition, ctx)) ? n.thenBody : n.elseBody);
            return;
          case 'RepeatCount': {
            const count = numberInUnit(evalExpression(n.count, ctx), '回');
            if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
              throw new AkariError('R413', 'くり返し回数は0以上の整数で上限以内にします');
            if (count > 0) {
              task.execStack.push({ type: 'repeatCount', node: n, remaining: count - 1 });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'RepeatWhile': {
            const v = bool(evalExpression(n.condition, ctx));
            if (v) {
              task.execStack.push({ type: 'while', node: originalNode });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'RepeatUntil': {
            const v = bool(evalExpression(n.condition, ctx));
            if (!v) {
              task.execStack.push({ type: 'until', node: originalNode });
              this.enterBody(task, n.body);
            }
            return;
          }
          case 'Forever':
            task.execStack.push({ type: 'forever', node: n });
            this.enterBody(task, n.body);
            return;
          case 'ForEach': {
            const arr = evalExpression(n.list, ctx);
            if (!Array.isArray(arr)) throw new AkariError('R411', '「それぞれ」はリストに使います');
            const vals = deepCopy(arr);
            if (vals.length) {
              task.execStack.push({ type: 'foreach', node: n, values: vals, index: 1 });
              this.enterBody(task, n.body, { name: n.binder, value: vals[0] });
            }
            return;
          }
          case 'Break':
            this.breakLoop(task, false);
            return;
          case 'Continue':
            this.breakLoop(task, true);
            return;
          case 'WaitTime': {
            const sec = numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec < 0) throw new AkariError('R412', '待つ時間は0以上にします');
            if (sec === 0) return;
            this.block(task, {
              kind: 'time',
              deadline: ensureFinite(this.runtime.now() + sec * 1000),
            });
            return { requeue: false };
          }
          case 'WaitUntil': {
            if (bool(evalExpression(n.condition, ctx))) return;
            this.block(task, { kind: 'condition', condition: originalNode.condition });
            return { requeue: false };
          }
          case 'Say': {
            const v = evalExpression(n.value, ctx);
            if (Array.isArray(v)) throw new AkariError('R411', 'リストはそのまま言えません');
            const sec = n.seconds === undefined ? null : numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec !== null && sec < 0) throw new AkariError('R412', '話す時間は0以上にします');
            const deadline = sec === null ? null : ensureFinite(this.runtime.now() + sec * 1000);
            const token = {};
            this.speechTokens.set(ctx.runtimeId, token);
            this.ui.prepareSpeech?.(v);
            if (sec === null) this.ui.say?.(ctx.runtimeId, valueText(v));
            else this.ui.say?.(ctx.runtimeId, valueText(v), true);
            if (sec !== null) {
              if (sec === 0) { this.ui.clearSpeech?.(ctx.runtimeId); return; }
              this.block(task, {kind:'time', deadline, speechToken:token});
              return {requeue:false};
            }
            return;
          }
          case 'Ask': {
            const q = stringv(evalExpression(n.question, ctx));
            this.block(task, { kind: 'question' });
            this.questionQueue.push({ task, runtimeId: ctx.runtimeId, question: q });
            this.showNextQuestion();
            return { requeue: false };
          }
          case 'Broadcast': {
            const msg = stringv(evalExpression(n.message, ctx));
            const ref = n.broadcastRef || n.groupId;
            const references = task.callFrames.at(-1)?.broadcastGroups || task.broadcastGroups;
            if (ref) {
              const old = references.get(ref);
              if (old) this.waitGroups.delete(old);
              const wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set(), ref, references };
              references.set(ref, wg.id);
              this.waitGroups.set(wg.id, wg);
              this.spawnDistributed('message', { message: msg }, wg.id);
              if (!wg.pending.size) { references.delete(ref); this.waitGroups.delete(wg.id); }
            } else this.spawnDistributed('message', { message: msg });
            return;
          }
          case 'WaitBroadcastGroup': {
            const references = task.callFrames.at(-1)?.broadcastGroups || task.broadcastGroups;
            const id = references.get(n.broadcastRef), wg = this.waitGroups.get(id);
            references.delete(n.broadcastRef);
            if (!wg || !wg.pending.size) { this.waitGroups.delete(id); return; }
            wg.consumed = true;
            this.block(task, { kind: 'waitGroup', waitGroupId: id });
            return { requeue: false };
          }
          case 'BroadcastAndWait': {
            const msg = stringv(evalExpression(n.message, ctx)),
              wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set() };
            this.waitGroups.set(wg.id, wg);
            const ts = this.spawnDistributed('message', { message: msg }, wg.id);
            if (ts.length) {
              this.block(task, { kind: 'waitGroup', waitGroupId: wg.id });
              return { requeue: false };
            }
            this.waitGroups.delete(wg.id);
            return;
          }
          case 'UserActionCall':
            this.callAction(task, n, ctx);
            return;
          case 'LocalVariableDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけの変数は動作の中でだけ作れます');
            f.locals.set(n.name, localScalar(evalExpression(n.initial, ctx)));
            return;
          }
          case 'LocalListDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけのリストは動作の中でだけ作れます');
            f.localLists.set(n.name, []);
            return;
          }
          case 'ReturnStatement':
            throw new AkariError('S307', '実行コードや動作から値は返せません');
          case 'StopCommand':
            return this.execStop(task, n);
          case 'MotionCommand':
            return this.execMotion(task, n, ctx);
          case 'LooksCommand':
            return this.execLooks(task, n, ctx);
          case 'PenCommand':
            return this.execPen(task, n, ctx);
          case 'SoundCommand':
            return this.execSound(task, n, ctx);
          case 'CloneCommand':
            return this.execClone(task, n, ctx);
          default:
            throw new AkariError('P201', `未実装の文 ${n.kind}`);
        }
      }
      breakLoop(task, isContinue) {
        let idx = -1;
        for (let i = task.execStack.length - 1; i >= 0; i--) {
          if (task.execStack[i].type === 'callBoundary') break;
          if (
            ['repeatCount', 'while', 'until', 'forever', 'foreach'].includes(task.execStack[i].type)
          ) {
            idx = i;
            break;
          }
        }
        if (idx < 0) throw new AkariError('S309', 'くり返しの外では使えません');
        task.execStack.splice(isContinue ? idx + 1 : idx);
      }
      callAction(task, n, ctx) {
        const def = this.compiled.symbols.actions.get(n.name);
        if (!def) throw new AkariError('S301', `動作「${n.name}」がありません`);
        if (task.callFrames.length + 1 > LIMITS.callDepth)
          throw new AkariError('R408', '動作の呼び出しが深すぎます');
        if (def.args.length !== n.args.length)
          throw new AkariError('S308', `動作「${n.name}」の受け取る値は${def.args.length}個です`+namedArgumentDetails(def.args,n.argumentNames));
        const sourceValues = n.args.map((x) => deepCopy(evalExpression(x, ctx)));
        const names = n.argumentNames || [];
        if (names.length && (names.length !== def.args.length || new Set(names).size !== names.length ||
            names.some((name) => !def.args.includes(name))))
          throw new AkariError('S308', '受け取る値の名前が一致しません');
        const vals = names.length ? def.args.map((name) => sourceValues[names.indexOf(name)]) : sourceValues;
        const frame = {
          id: def.id,
          runtimeId: ctx.runtimeId,
          broadcastGroups: new Map(),
          name: def.name,
          args: new Map(def.args.map((a, i) => [a, vals[i]])),
          locals: new Map(),
          localLists: new Map(),
        };
        task.callFrames.push(frame);
        task.execStack.push({ type: 'callBoundary', frame });
        task.execStack.push({
          type: 'seq',
          nodes: this.compiled.astByKey.get(`action:${def.id}`)?.body || [],
          index: 0,
        });
      }
      block(task, reason) {
        task.state = 'BLOCKED';
        task.blockReason = { runtimeId: task.subject?.runtimeId || task.runtimeId, ...reason };
        this.blocked.add(task);
      }
      unblock(task) {
        if (!this.blocked.has(task) || ['CANCELLED', 'DONE', 'ERROR'].includes(task.state)) return;
        this.blocked.delete(task);
        task.blockReason = null;
        this.enqueue(task);
      }
      queueExternalUnblock(handleId) {
        if (!this.running) return;
        this.pendingExternalUnblocks.add(handleId);
        this.schedule();
      }
      drainExternalUnblocks() {
        if (!this.running || !this.pendingExternalUnblocks.size) return;
        const ids = new Set(this.pendingExternalUnblocks);
        this.pendingExternalUnblocks.clear();
        for (const t of [...this.blocked].sort((a, b) => a.createdSequence - b.createdSequence)) {
          if (t.blockReason?.kind === 'audio' && ids.has(t.blockReason.handleId)) this.unblock(t);
        }
      }
      advanceGlide(t, br, now) {
              const p = clamp((now - br.startTime) / br.duration, 0, 1),
                a = this.runtime.actor(br.runtimeId);
              if (!a) throw new AkariError('R405', '動作の対象がありません');
              if (a) {
                const nx = ensureFinite(br.startX * (1 - p) + br.targetX * p),
                  ny = ensureFinite(br.startY * (1 - p) + br.targetY * p);
                const actualX = ensureFinite(a.x + nx - br.lastX),
                  actualY = ensureFinite(a.y + ny - br.lastY);
                if (a.penDown && (br.lastX !== nx || br.lastY !== ny))
                  this.ui.penLine?.(
                    a.x + a.w / 2,
                    a.y + a.h / 2,
                    actualX + a.w / 2,
                    actualY + a.h / 2,
                    a.penColor,
                    a.penSize,
                  );
                a.x = actualX;
                a.y = actualY;
                br.lastX = nx;
                br.lastY = ny;
                this.ui.render?.();
              }
      }
      recheckBlocked(force = false) {
        if (this.running && (!this.paused || force)) {
          for (const complete of (this.extensionCompletions || []).splice(0)) complete();
          for (const event of (this.extensionEvents || []).splice(0))
            this.spawnDistributed('message', { message: '拡張:' + event.name, payload: event.payload });
        }
        if (!this.running || (this.paused && !force)) return;
        this.advanceContinuous();
        this.drainExternalUnblocks();
        const now = this.runtime.now(),
          arr = [...this.blocked].sort((a, b) => a.createdSequence - b.createdSequence);
        const timed = [];
        for (const t of arr) {
          const br = t.blockReason;
          if (!br) continue;
          try {
            if (br.kind === 'calculation') { this.advanceCalculation(t); continue; }
            if (br.kind === 'condition' && LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(br.condition)) {
              if (!br.evaluator) br.evaluator = evalExpressionSteps(br.condition, this.context(t, { runtimeId: br.runtimeId }), {count:0});
              const outcome = advanceEvaluation(br.evaluator);
              if (outcome.done) { br.evaluator = null; if (bool(outcome.value)) this.unblock(t); }
              continue;
            }
            if (br.kind === 'condition' && bool(evalExpression(br.condition, this.context(t, { runtimeId: br.runtimeId }))))
              this.unblock(t);
            else if (br.kind === 'time' && now >= br.deadline) timed.push(t);
            else if (br.kind === 'glide') {
              this.advanceGlide(t, br, now);
              const p = clamp((now - br.startTime) / br.duration, 0, 1);
              if (p >= 1) timed.push(t);
            }
          } catch (err) {
            this.taskError(t, err);
            return;
          }
        }
        timed.sort(
          (a, b) =>
            (a.blockReason?.deadline ?? a.blockReason?.startTime ?? 0) -
              (b.blockReason?.deadline ?? b.blockReason?.startTime ?? 0) ||
            a.createdSequence - b.createdSequence,
        );
        for (const t of timed) {
          const reason = t.blockReason;
          if (reason.speechToken && this.speechTokens.get(reason.runtimeId) === reason.speechToken) {
            this.ui.clearSpeech?.(reason.runtimeId);
            this.speechTokens.delete(reason.runtimeId);
          }
          this.unblock(t);
        }
      }
      showNextQuestion() {
        if (!this.running || this.activeQuestion) return;
        while (this.questionQueue.length) {
          const q = this.questionQueue.shift();
          if (q.task.state !== 'BLOCKED') continue;
          this.activeQuestion = q;
          this.ui.ask?.(q.question, (answer) => {
            if (this.running && this.activeQuestion === q) this.answerQuestion(answer);
          });
          return;
        }
      }
      answerQuestion(answer) {
        const q = this.activeQuestion;
        if (!q || !this.running) return;
        this.activeQuestion = null;
        const v = String(answer ?? '');
        if (cpLen(v) > LIMITS.stringChars) {
          this.ui.closeQuestion?.();
          this.taskError(q.task, new AkariError('R413', '答えの文字が長すぎます'));
          this.showNextQuestion();
          return;
        }
        q.task.lastAnswer = v;
        this.unblock(q.task);
        this.ui.closeQuestion?.();
        this.showNextQuestion();
      }
      finishTask(task, state = 'DONE') {
        task.extensionAbort?.abort();
        if (['DONE', 'CANCELLED', 'ERROR'].includes(task.state) && task.state !== state) return;
        task.state = state;
        this.blocked.delete(task);
        this.ready = this.ready.filter((x) => x !== task);
        this.questionQueue = this.questionQueue.filter((q) => q.task !== task);
        if (this.activeQuestion?.task === task) {
          this.activeQuestion = null;
          this.ui.closeQuestion?.();
          clearTimeout(this.questionTimer);
          this.questionTimer = setTimeout(() => {
            this.questionTimer = null;
            this.showNextQuestion();
          }, 0);
        }
        if (task.waitGroupId) {
          const wg = this.waitGroups.get(task.waitGroupId);
          if (wg) {
            wg.pending.delete(task.taskId);
            if (wg.pending.size === 0) {
              if (wg.ref) wg.references.delete(wg.ref);
              this.waitGroups.delete(wg.id);
              if (wg.sender.state === 'BLOCKED' && wg.sender.blockReason?.kind === 'waitGroup' && wg.sender.blockReason.waitGroupId === wg.id)
                this.unblock(wg.sender);
            }
          }
        }
        if (['DONE', 'CANCELLED', 'ERROR'].includes(state)) this.tasks.delete(task.taskId);
        for (const [id, wg] of this.waitGroups) if (wg.sender === task) this.waitGroups.delete(id);
        task.broadcastGroups?.clear();
        for (const frame of task.callFrames) frame.broadcastGroups?.clear();
        this.ui.renderMonitor?.();
      }
      taskError(task, err) {
        task.error =
          err instanceof AkariError ? err : new AkariError('R411', err?.message || String(err));
        const e = task.error;
        task.errorCallStack = [
          `きっかけ ${task.targetId} / ${EVENT_LABELS[task.eventType] || task.eventType}`,
          ...task.callFrames.map((f) => `\u52d5\u4f5c ${f.name}`),
          ...(e.akariCallStack || []),
        ];
        const frame = task.callFrames.at(-1),
          key =
            e.akariSource?.key || task.sourceKey ||
            (frame ? `action:${frame.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
          line = e.line || task.currentNode?.sourceSpan?.startLine || 1;
        const definition = key.startsWith('function:')
          ? this.project.functions.find((x) => x.id === key.slice(9))
          : key.startsWith('action:')
            ? this.project.actions.find((x) => x.id === key.slice(7))
            : null;
        const sourceKey = this.compiled.items?.find(item => item.key === key)?.documentKey || key;
        const source =
            definition?.source ??
            this.project.scripts?.find(script =>
              (script.id ? `script:${script.id}` : `script:${script.targetId}:${script.event}`) === sourceKey,
            )?.source ??
            '',
          actor = this.runtime.actor(task.subject?.runtimeId || task.runtimeId);
        if (!e.line) e.column = task.currentNode?.sourceSpan?.startColumn || 1;
        e.line = line;
        e.akariSource = { key };
        const record = {
          id: ++this.errorSequence,
          taskId: task.taskId,
          targetId: task.targetId,
          runtimeId: task.runtimeId,
          eventType: task.eventType,
          eventContext: { ...task.eventContext },
          code: e.code,
          message: e.message,
          key,
          line,
          column: e.column || 1,
          statement: source.split(/\r\n?|\n/)[line - 1] || task.currentNode?.kind || '',
          source,
          ...(e.quotedList ? { quotedList: { ...deepCopy(e.quotedList), ownerKey: sourceKey } } : {}),
          callStack: [...task.errorCallStack],
          frames: [
            ...task.callFrames.map((f) => snapshotFrame(f, 'action')),
            ...(e.akariFrames || []),
          ],
          binders: task.execStack
            .filter((x) => x.binder)
            .map((x) => [x.binder.name, deepCopy(x.binder.value)]),
          projectVariables: snapshotEntries(this.runtime.projectVars),
          projectLists: snapshotEntries(this.runtime.projectLists),
          actor: actor
            ? {
                runtimeId: actor.runtimeId,
                baseId: actor.baseId,
                x: actor.x,
                y: actor.y,
                direction: actor.direction,
                scalePercent: actor.scalePercent,
                visible: actor.visible,
                variables: snapshotEntries(actor.vars),
                lists: snapshotEntries(actor.lists),
              }
            : null,
        };
        record.chars = JSON.stringify(record).length;
        freezeRecord(record);
        this.errorRecords.push(record);
        this.errorRecordChars += record.chars;
        while (
          this.errorRecords.length > 20 ||
          (this.errorRecords.length > 1 && this.errorRecordChars > LIMITS.diagnosticsBytes)
        )
          this.errorRecordChars -= this.errorRecords.shift().chars;
        task.failureRecordId = record.id;
        this.finishTask(task, 'ERROR');
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
        this.loopScheduled = false;
        this.advanceContinuous();
        this.runtime.pauseClock();
        this.paused = true;
        this.ui.runtimeError?.(task, e);
        this.ui.state?.();
      }
      cancelTask(task) {
        if (['DONE', 'ERROR', 'CANCELLED'].includes(task.state)) return;
        this.finishTask(task, 'CANCELLED');
      }
      execStop(task, n) {
        if (n.op === 'THIS') {
          this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        if (n.op === 'OTHERS') {
          for (const control of this.continuous.values())
            if (control.state === 'ACTIVE') control.state = 'CANCELLED_UNTIL_FALSE';
          for (const t of this.tasks.values()) if (t !== task) this.cancelTask(t);
          return;
        }
        if (n.op === 'ALL') {
          this.stop();
          this.ui.allStopped?.();
          return { requeue: false };
        }
      }

      execMotion(task, n, ctx) {
        const actor = this.runtime.requireActor(ctx),
          a = { ...actor },
          num = (i) => numberInUnit(evalExpression(n.args[i], ctx),
            ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(n.op) ? '度' :
            ['GLIDE', 'GLIDE_DIRECTION'].includes(n.op) && i === 0 ? '秒' : '歩');
        const before = { x: a.x, y: a.y };
        switch (n.op) {
          case 'MOVE_DIRECTION': {
            const d = num(0), v = this.directionVector(n.direction, a);
            a.x += v.x * d; a.y += v.y * d;
            break;
          }
          case 'GLIDE_DIRECTION': {
            const seconds = num(0), distance = num(1), v = this.directionVector(n.direction, a);
            return this.execMotion(task, { ...n, op: 'GLIDE', args: [
              { kind: 'NumberLiteral', value: seconds },
              { kind: 'NumberLiteral', value: a.x + v.x * distance },
              { kind: 'NumberLiteral', value: a.y + v.y * distance },
            ] }, ctx);
          }
          case 'MOVE': {
            const d = num(0),
              rad = a.direction * (Math.PI / 180);
            a.x += Math.cos(rad) * d;
            a.y += Math.sin(rad) * d;
            break;
          }
          case 'GOTO':
            a.x = num(0);
            a.y = num(1);
            break;
          case 'GLIDE': {
            const sec = num(0),
              tx = num(1),
              ty = num(2);
            if (sec < 0) throw new AkariError('R412', '滑る時間は0以上にします');
            if (sec === 0) {
              a.x = tx;
              a.y = ty;
              break;
            }
            this.block(task, {
              kind: 'glide',
              startTime: this.runtime.now(),
              deadline: ensureFinite(this.runtime.now() + sec * 1000),
              duration: ensureFinite(sec * 1000),
              startX: a.x,
              startY: a.y,
              targetX: tx,
              targetY: ty,
              lastX: a.x,
              lastY: a.y,
            });
            return { requeue: false };
          }
          case 'POINT_TO': {
            const target = stringv(evalExpression(n.args[0], ctx)),
              p = this.runtime.nearestTarget(ctx.runtimeId, target),
              aa = this.runtime.aabb(a);
            a.direction = (Math.atan2(p.y - aa.cy, p.x - aa.cx) * 180) / Math.PI;
            break;
          }
          case 'SET_DIRECTION':
            a.direction = num(0);
            break;
          case 'TURN_RIGHT':
            a.direction += num(0);
            break;
          case 'TURN_LEFT':
            a.direction -= num(0);
            break;
          case 'SET_X':
            a.x = num(0);
            break;
          case 'SET_Y':
            a.y = num(0);
            break;
          case 'BOUNCE':
            this.bounce(a);
            break;
        }
        ensureFinite(a.x);
        ensureFinite(a.y);
        ensureFinite(a.direction);
        Object.assign(actor, { x: a.x, y: a.y, direction: a.direction });
        if (a.penDown && (before.x !== a.x || before.y !== a.y))
          this.ui.penLine?.(
            before.x + a.w / 2,
            before.y + a.h / 2,
            a.x + a.w / 2,
            a.y + a.h / 2,
            a.penColor,
            a.penSize,
          );
        this.ui.render?.();
      }
      bounce(a) {
        const box = this.runtime.aabb(a),
          w = this.project.stage.width,
          h = this.project.stage.height;
        let hitX = box.left <= 0 || box.right >= w,
          hitY = box.top <= 0 || box.bottom >= h;
        if (hitX) a.direction = 180 - a.direction;
        if (hitY) a.direction = -a.direction;
        if (hitX || hitY) {
          const b = this.runtime.aabb(a);
          if (b.right - b.left > w) a.x = w / 2 - a.w / 2;
          else {
            if (b.left < 0) a.x += -b.left;
            if (b.right > w) a.x -= b.right - w;
          }
          const c = this.runtime.aabb(a);
          if (c.bottom - c.top > h) a.y = h / 2 - a.h / 2;
          else {
            if (c.top < 0) a.y += -c.top;
            if (c.bottom > h) a.y -= c.bottom - h;
          }
        }
      }
      execLooks(task, n, ctx) {
        const arg = (i) => evalExpression(n.args[i], ctx),
          actorOps = new Set([
            'FRONT',
            'BACK',
            'HIDE',
            'SHOW',
            'NEXT_COSTUME',
            'PREV_COSTUME',
            'SET_SCALE',
            'FORWARD_LAYERS',
            'BACKWARD_LAYERS',
            'SET_COLOR',
            'SET_COSTUME',
          ]);
        if (actorOps.has(n.op)) {
          const a = this.runtime.requireActor(ctx),
            c = this.runtime.component(ctx.runtimeId);
          if (n.op === 'FRONT' || n.op === 'BACK') this.runtime.reorderActor(ctx.runtimeId, n.op);
          else if (n.op === 'FORWARD_LAYERS' || n.op === 'BACKWARD_LAYERS') {
            const v = numeric(arg(0));
            if (!Number.isInteger(v) || v < 0)
              throw new AkariError('R412', '層数は0以上の整数にします');
            this.runtime.reorderActor(ctx.runtimeId, n.op, v);
          } else if (n.op === 'HIDE') a.visible = false;
          else if (n.op === 'SHOW') a.visible = true;
          else if (n.op === 'SET_SCALE') {
            const v = numberInUnit(arg(0), '％');
            if (v < 1 || v > 1000) throw new AkariError('R412', '大きさは1〜1000％です');
            a.scalePercent = v;
          } else if (n.op === 'SET_COLOR')
            a.color = resolveColor(stringv(arg(0)), { allowTransparent: false });
          else if (['SET_COSTUME', 'NEXT_COSTUME', 'PREV_COSTUME'].includes(n.op)) {
            if (c?.type !== 'sprite') throw new AkariError('R406', '衣装はキャラクターだけです');
            const arr = c.costumes;
            if (n.op === 'SET_COSTUME') {
              const name = stringv(arg(0)),
                co = arr.find((x) => x.name === name);
              if (!co) throw new AkariError('R405', `衣装「${name}」がありません`);
              a.costumeId = co.id;
            } else {
              let i = arr.findIndex((x) => x.id === a.costumeId);
              i = (i + (n.op === 'NEXT_COSTUME' ? 1 : -1) + arr.length) % arr.length;
              a.costumeId = arr[i].id;
            }
          }
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_BACKDROP' || n.op === 'NEXT_BACKDROP' || n.op === 'PREV_BACKDROP') {
          const ch =
            n.op === 'SET_BACKDROP'
              ? this.runtime.setBackdropByName(stringv(arg(0)))
              : this.runtime.stepBackdrop(n.op === 'NEXT_BACKDROP' ? 1 : -1);
          if (ch) this.spawnDistributed('backdropChanged', ch);
          return;
        }
        if (n.op === 'SET_SELF_TEXT') {
          const a = this.runtime.requireActor(ctx),
            c = this.runtime.component(ctx.runtimeId);
          if (!['label', 'button', 'box'].includes(c?.type))
            throw new AkariError('R406', '「文字を〜にする」は文字・ボタン・四角で使います');
          a.text = valueText(arg(0));
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_TARGET_TEXT') {
          const name = stringv(arg(0)),
            v = valueText(arg(1)),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」がありません`);
          if (!['label', 'button', 'box'].includes(c.type))
            throw new AkariError('R406', `「${name}」は文字を書き換えられる部品ではありません`);
          this.runtime.actor(c.id).text = v;
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_INPUT') {
          const name = stringv(arg(0)),
            v = assertRuntimeValueLimit(stringv(arg(1))),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」がありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は入力欄ではありません`);
          const a = this.runtime.actor(c.id),
            old = a.inputValue;
          if (old !== v) {
            a.inputValue = v;
            this.spawnForRuntime(c.id, 'valueChanged', { oldValue: old, newValue: v });
          }
          this.ui.render?.();
          return;
        }
      }
      execPen(task, n, ctx) {
        const a = this.runtime.requireActor(ctx);
        if (n.op === 'DOWN') a.penDown = true;
        else if (n.op === 'UP') a.penDown = false;
        else if (n.op === 'CLEAR') this.ui.penClear?.();
        else if (n.op === 'SET_COLOR')
          a.penColor = resolveColor(stringv(evalExpression(n.args[0], ctx)), {
            allowTransparent: false,
          });
        else if (n.op === 'SET_SIZE') {
          const v = numeric(evalExpression(n.args[0], ctx));
          if (v <= 0 || v > 200)
            throw new AkariError('R412', 'ペンの太さは0より大きく200以下にします');
          a.penSize = v;
        } else if (n.op === 'STAMP') this.ui.stamp?.(ctx.runtimeId);
      }
      execSound(task, n, ctx) {
        const state =
            ctx.runtimeId === 'stage' ? this.runtime.stage : this.runtime.requireActor(ctx),
          num = (i) => numberInUnit(evalExpression(n.args[i], ctx),
            n.op === 'SET_VOLUME' ? '％' : ['PITCH_UP', 'PITCH_DOWN'].includes(n.op) ? null : i === 0 ? 'Hz' : '秒'),
          ended = (id) => this.queueExternalUnblock(id);
        if (n.op === 'STOP_ALL') {
          this.runtime.stopAllAudio(true);
          return;
        }
        if (n.op === 'SET_VOLUME') {
          const v = num(0);
          if (v < 0 || v > 100) throw new AkariError('R412', '音量は0〜100％です');
          state.volume = v;
          return;
        }
        if (n.op === 'PITCH_UP' || n.op === 'PITCH_DOWN') {
          const v = num(0);
          state.pitch = ensureFinite(state.pitch + (n.op === 'PITCH_UP' ? v : -v));
          return;
        }
        if (n.op === 'SAMPLE' || n.op === 'SAMPLE_WAIT') {
          const name = stringv(evalExpression(n.args[0], ctx)),
            hid = this.runtime.startSample(name, ctx, n.op === 'SAMPLE_WAIT' ? ended : null);
          if (n.op === 'SAMPLE_WAIT') {
            this.block(task, { kind: 'audio', handleId: hid });
            return { requeue: false };
          }
          return;
        }
        const freq = num(0),
          sec = num(1);
        if (freq < 30 || freq > 5000 || sec < 0.01 || sec > 60)
          throw new AkariError('R412', '音は30〜5000Hz、0.01〜60秒です');
        const hid = this.runtime.startTone(freq, sec, ctx, n.op === 'TONE_WAIT' ? ended : null);
        if (n.op === 'TONE_WAIT') {
          this.block(task, { kind: 'audio', handleId: hid });
          return { requeue: false };
        }
      }
      execClone(task, n, ctx) {
        let src;
        if (n.op === 'CREATE_SELF') src = ctx.runtimeId;
        else if (n.op === 'CREATE_TARGET') {
          const name = stringv(evalExpression(n.args[0], ctx)),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」がありません`);
          if (c.type !== 'sprite')
            throw new AkariError('R406', 'クローンを作れるのはキャラクターだけです');
          const candidates = this.runtime.instancesByName(name);
          src = candidates[0]?.runtimeId || c.id;
        } else {
          this.runtime.deleteClone(ctx.runtimeId);
          this.cancelRuntimeTasks(ctx.runtimeId, task);
          this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        const count=n.count===undefined?1:numberValue(evalExpression(n.count,ctx));
        if(!Number.isSafeInteger(count)||count<0)throw new AkariError('R410','分身の数は0以上の整数にしてください');
        if([...this.runtime.actors.values()].filter(actor=>actor.isClone).length+count>LIMITS.clones)
          throw new AkariError('R410','クローン数の上限です');
        this.runtime.requireActor({runtimeId:src});
        const component=this.runtime.component(src);
        if(component?.type!=='sprite')throw new AkariError('R406','クローンを作れるのはキャラクターだけです');
        const receivers=this.matchingScripts(component.id,'cloneStart',{sourceRuntimeId:src}).filter(script=>this.hasExecutable(this.scriptAst(component.id,'cloneStart',script.id))).length;
        if(this.tasks.size+count*receivers>LIMITS.activeTasks)throw new AkariError('R413','同時実行コード数が上限を超えました');
        for(let i=0;i<count;i++){
          const rid = this.runtime.createClone(src);
          this.spawnForRuntime(rid, 'cloneStart', { sourceRuntimeId: src });
        }
      }
      cancelRuntimeTasks(runtimeId, except = null) {
        for (const t of this.tasks.values())
          if ((t.runtimeId === runtimeId || t.blockReason?.runtimeId === runtimeId ||
            t.callFrames.some((f) => f.runtimeId === runtimeId)) && t !== except) this.cancelTask(t);
      }
    }
    const EXECUTABLE_CONTRACT = Object.freeze({
      languageContractId: 2,
      runtimeContractId: 2,
      programFormatVersion: 2,
      projectFormatVersion: 3,
    });
    function validProducerLabel(value) {
      return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value);
    }
    function restoreExecutable(data) {
      const fail = (message) => {
        throw new AkariError('X602', message);
      };
      if (
        !exactKeys(data, ['schema', 'appVersion', 'languageContractId', 'runtimeContractId',
          'programFormatVersion', 'projectFormatVersion', 'project', 'program', 'assets', ...(Object.hasOwn(data || {}, 'extensions') ? ['extensions'] : [])]) ||
        data.schema !== 'akari-executable' ||
        !validProducerLabel(data.appVersion) ||
        Object.entries(EXECUTABLE_CONTRACT).some(([k, v]) => data[k] !== v)
      )
        fail(
          '\u3053\u306e\u4f5c\u54c1\u306e\u5b9f\u884c\u5f62\u5f0f\u306b\u306f\u5bfe\u5fdc\u3057\u3066\u3044\u307e\u305b\u3093',
        );
      if (Object.hasOwn(data, 'extensions')) validateExtensionEnvelope(data.extensions);
      const p = Object.hasOwn(data, 'extensions') && data.project && typeof data.project === 'object' ? { ...data.project, extensions: data.extensions } : data.project;
      if (
        !p ||
        typeof p.name !== 'string' ||
        !p.stage ||
        !Array.isArray(p.components) ||
        p.components.length > LIMITS.components ||
        !Array.isArray(p.actions) ||
        !Array.isArray(p.functions) ||
        !Array.isArray(data.program) ||
        data.program.length > LIMITS.scripts + LIMITS.callables ||
        !Array.isArray(data.assets) ||
        data.assets.length > LIMITS.assets
      )
        fail('\u4f5c\u54c1\u30c7\u30fc\u30bf\u304c\u58ca\u308c\u3066\u3044\u307e\u3059');
      if (
        !Number.isInteger(p.stage.width) ||
        p.stage.width < 200 ||
        p.stage.width > 1200 ||
        !Number.isInteger(p.stage.height) ||
        p.stage.height < 150 ||
        p.stage.height > 800
      )
        fail('\u753b\u9762\u306e\u5927\u304d\u3055\u304c\u4e0d\u6b63\u3067\u3059');
      if(Object.hasOwn(p.stage,'showSpeechNames')&&typeof p.stage.showSpeechNames!=='boolean')
        fail('吹き出しの名前表示設定が不正です');
      validateRuntimeData(p, fail);
      const ownerIds = new Set(['stage', ...p.components.map(c => c.id)]);
      const callPhrases=new Set();
      for(const definition of p.actions){
        if(definition.callPhrase===undefined||definition.callPhrase==='')continue;
        if(typeof definition.callPhrase!=='string'||cpLen(definition.callPhrase)>80||/[\p{Cc}\p{Zl}\p{Zp}。．.、,※]/u.test(definition.callPhrase))fail('短い呼出し文が不正です');
        const phrase=definition.callPhrase.replace(/[\s\u3000]/gu,'');
        if(!phrase||callPhrases.has(phrase))fail('短い呼出し文が空か重複しています');
        callPhrases.add(phrase);
      }
      const definitionKeys = new Map([
        ...p.actions.map(d => [`action:${d.id}`, d]),
        ...p.functions.map(d => [`function:${d.id}`, d]),
      ]);
      if ([...definitionKeys.values()].some(d => d.ownerId !== 'stage'))
        fail('手順・答えを求める定義の所属先が不正です');
      const items = [],
        astByKey = new Map();
      const validActorRef = ref => !ref ||
        (exactKeys(ref, ['kind']) && ref.kind === 'self') ||
        ((exactKeys(ref, ['kind', 'name']) || exactKeys(ref, ['kind', 'name', 'targetId'])) &&
          ref.kind === 'named' && typeof ref.name === 'string' &&
          (ref.name === '画面' || ref.name === p.stage.name || p.components.some(c => c.name === ref.name)) &&
          (ref.targetId === undefined || ownerIds.has(ref.targetId)));
      const directions = ['right', 'left', 'up', 'down', 'forward', 'backward'];
      for (const item of data.program) {
        const parts = typeof item.key === 'string' ? item.key.split(':') : [];
        const type = item.ownerId === 'stage' ? 'stage' : p.components.find(c => c.id === item.ownerId)?.type;
        const events = ['start', 'click', 'keyDown', 'message', 'backdropChanged',
          ...(type === 'input' ? ['valueChanged'] : []), ...(type === 'sprite' ? ['cloneStart'] : [])];
        if (
          typeof item.key !== 'string' ||
          !ownerIds.has(item.ownerId) ||
          (item.key.startsWith('script:')
            ? !((parts.length === 2 && safeId(parts[1]) && item.id === parts[1] &&
                item.targetId === item.ownerId && events.includes(item.event)) ||
              (parts.length === 3 && parts[1] === item.ownerId && events.includes(parts[2])))
            : definitionKeys.get(item.key)?.ownerId !== item.ownerId) ||
          astByKey.has(item.key) ||
          item.ast?.kind !== 'Script' ||
          !Array.isArray(item.ast.body)
        )
          fail('\u5b9f\u884c\u30b3\u30fc\u30c9\u304c\u58ca\u308c\u3066\u3044\u307e\u3059');
        if (item.filter != null) {
          const event = item.event || parts[2], field = event === 'keyDown' ? 'key' : event === 'message' ? 'message' : null;
          if (!field || !exactKeys(item.filter, [field]) || typeof item.filter[field] !== 'string' ||
            cpLen(item.filter[field]) > LIMITS.stringChars) fail('きっかけの条件が正しくありません');
        }
        if (item.ast.rules !== undefined && (!Array.isArray(item.ast.rules) || item.ast.rules.length > LIMITS.scripts))
          fail('動き続ける約束が正しくありません');
        for (const rule of item.ast.rules || []) {
          if (rule?.kind !== 'ContinuousRule' || !validActorRef(rule.actorRef) ||
            !directions.includes(rule.direction) ||
            ['condition', 'seconds', 'distance'].some(key => !rule[key] || typeof rule[key].kind !== 'string'))
            fail('動き続ける約束の対象・方向・条件・速さが正しくありません');
        }
        // Validate units in every saved expression, including currently unreachable branches.
        const pending = [item.ast];
        while (pending.length) {
          const node = pending.pop();
          if (!node || typeof node !== 'object') continue;
          if (['ExtensionCommand', 'ExtensionCalculation'].includes(node.kind)) {
            const operation = extensions.describe(node.name, node.kind === 'ExtensionCommand' ? 'commands' : 'calculations');
            if (!operation || !Array.isArray(node.args) || node.args.length !== operation.args.length) fail('拡張機能・引数の契約が一致しません');
          }
          if (node.kind === 'Hole') fail('書きかけの役割を完成させてください');
          if (Object.hasOwn(node, 'actorRef') && !validActorRef(node.actorRef)) fail('実行する対象が正しくありません');
          if (node.kind === 'MotionCommand' && ['MOVE_DIRECTION', 'GLIDE_DIRECTION'].includes(node.op) &&
            !directions.includes(node.direction)) fail('移動の方向が正しくありません');
          if (node.argumentNames !== undefined && (!Array.isArray(node.argumentNames) ||
            node.argumentNames.some(name => typeof name !== 'string' || !name || cpLen(name) > 32) ||
            new Set(node.argumentNames).size !== node.argumentNames.length ||
            (node.argumentNames.length && node.argumentNames.length !== node.args?.length)))
            fail('受け取る値の名前が正しくありません');
          if (node.kind === 'QuantityLiteral' &&
              (!UNIT_TAGS.includes(node.unit) || !node.value || typeof node.value !== 'object'))
            fail('数量の単位または数値式が不正です');
          if (node.kind === 'UnitlessRead' && (!node.value || typeof node.value !== 'object'))
            fail('数だけを取り出す式が不正です');
          if (node.kind === 'NumberLiteral' && !finite(node.value)) fail('数値式が不正です');
          for (const value of Object.values(node)) {
            if (Array.isArray(value)) for (const entry of value) pending.push(entry);
            else if (value && typeof value === 'object') pending.push(value);
          }
        }
        items.push(item);
        astByKey.set(item.key, item.ast);
      }
      if ([...definitionKeys.keys()].some(key => !astByKey.has(key)))
        fail('手順・答えを求める定義の本文がありません');
      const compiled = {
        items,
        rules: items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
          ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
        }))),
        astByKey,
        errors: [],
        symbols: {
          actions: new Map(p.actions.map((x) => [x.name, x])),
          functions: new Map(p.functions.map((x) => [x.name, x])),
        },
      };
      const store = new AssetStore();
      let total = 0;
      for (const a of data.assets) {
        if (
          !a ||
          !safeId(a.id) ||
          !['image', 'audio'].includes(a.kind) ||
          !Number.isInteger(a.byteLength) ||
          a.byteLength < 1 ||
          a.byteLength > (a.kind === 'image' ? LIMITS.imageBytes : LIMITS.audioBytes)
        )
          fail('\u7d20\u6750\u30c7\u30fc\u30bf\u304c\u4e0d\u6b63\u3067\u3059');
        if (
          !(
            a.kind === 'image'
              ? ['image/png', 'image/jpeg', 'image/webp']
              : ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg']
          ).includes(a.mime)
        )
          fail('\u7d20\u6750\u306e\u7a2e\u985e\u304c\u4e0d\u6b63\u3067\u3059');
        total += a.byteLength;
        if (total > LIMITS.assetRawTotal || decodedBase64Length(a.dataBase64) !== a.byteLength)
          fail('\u7d20\u6750\u306e\u5927\u304d\u3055\u304c\u4e0d\u6b63\u3067\u3059');
        const bytes = decodeBase64(a.dataBase64);
        if (sha256Fallback(bytes) !== a.sha256)
          fail('\u7d20\u6750\u30c7\u30fc\u30bf\u304c\u58ca\u308c\u3066\u3044\u307e\u3059');
        store.addImmutable({
          id: a.id,
          kind: a.kind,
          mime: a.mime,
          sha256: a.sha256,
          bytes,
          meta: a.meta || {},
        });
      }
      const requirements = collectRuntimeAssetRequirements(compiled, p);
      for (const [ids, kind] of [
        [requirements.imageIds, 'image'],
        [requirements.audioIds, 'audio'],
      ])
        for (const id of ids)
          if (store.get(id)?.kind !== kind)
            fail('\u5fc5\u8981\u306a\u7d20\u6750\u304c\u3042\u308a\u307e\u305b\u3093');
      return { project: p, compiled, assetStore: store, requirements };
    }

    return {
      extensions, profiles, validateExtensionEnvelope,
      UNIT_TAGS,
      isQuantity,
      isNumberValue,
      unitOf,
      quantity,
      numberValue,
      numberInUnit,
      commonUnit,
      arithmetic,
      addNumericUpdate,
      validateExpectedUnit,
      validateRuntimeData,
      freezeRecord,
      snapshotEntries,
      LIMITS,
      COLOR_NAMES,
      EVENT_LABELS,
      BUILTIN_META,
      AkariError,
      ScriptSignal,
      cpLen,
      deepCopy,
      finite,
      clamp,
      exactKeys,
      safeId,
      scalar,
      listValue,
      assertRuntimeValueLimit,
      valueText,
      displayValue,
      ensureFinite,
      typeName,
      sameValue,
      validateColorHex,
      resolveColor,
      PRNG,
      nowMs,
      cloneDesignProject,
      bytesEqual,
      encodeBase64,
      decodedBase64Length,
      decodeBase64,
      rotr,
      sha256Fallback,
      sha256,
      IMMUTABLE_ASSET_RECORDS,
      makeImmutableAssetRecord,
      AssetStore,
      collectRuntimeAssetRequirements,
      AssetRuntimeCache,
      RuntimeModel,
      localScalar,
      numeric,
      bool,
      stringv,
      integerIndex,
      unicodeIndexOf,
      evalExpression,
      evalBuiltin,
      evalSensor,
      namedArgumentDetails,
      runUserFunction,
      execFunctionNodes,
      execListMutation,
      EventScheduler,
      BUILTIN_DEFINITIONS,
      EXECUTABLE_CONTRACT,
      validProducerLabel,
      restoreExecutable,
    };
  }

