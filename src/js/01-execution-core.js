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
    // The one place that writes the contract numbers; the extension Standard and the saved data read them.
    const EXECUTABLE_CONTRACT = Object.freeze({
      languageContractId: 4,
      runtimeContractId: 4,
      programFormatVersion: 4,
      projectFormatVersion: 5,
    });
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
      standard: { languageContractId: EXECUTABLE_CONTRACT.languageContractId, runtimeContractId: EXECUTABLE_CONTRACT.runtimeContractId },
      reservedNames: BUILTIN_DEFINITIONS.map(x => x.name),
      allowedCapabilities: options.allowedCapabilities || [],
      validateValue: validateExtensionValue,
      validateProfileRequirement: value => profiles.validateRequirement(value),
    });
    for (const definition of options.extensions || []) extensions.register(definition.manifest, definition.factory);
    extensions.seal();
    function validateExtensionValue(value, shape) {
      assertRuntimeValueLimit(value);
      if (isPart(value) || (Array.isArray(value) && value.some(isPart)))
        throw new AkariError('E705', 'かくちょうには キャラクターや 部品を わたせません');
      const valid = shape.type === 'number' ? isNumberValue(value) && unitOf(value) === shape.unit :
        shape.type === 'string' ? typeof value === 'string' :
        shape.type === 'boolean' ? typeof value === 'boolean' :
        shape.type === 'list' ? listValue(value) : scalar(value) || listValue(value);
      if (!valid) throw new AkariError('E705', 'かくちょうの 中身の しゅるいか たんいが 合いません');
      return deepCopy(value);
    }
    function validateExtensionEnvelope(value) {
      extensions.validateRequirements(value);
      profiles.validateRequirement(value.profile ?? null);
      if (!Array.isArray(value.state)) throw new AkariError('E701', 'かくちょうの きろくの リストが ありません');
      return value;
    }
    function extensionError(error) {
      return !(error instanceof AkariError) && /^E70[1-8]$/.test(error?.code)
        ? new AkariError(error.code, error.message) : error;
    }
    // What a handler is given (EXTENSIONS.md, API contract 1): the run's signal, the calling sentence's owner
    // (runtimeId: a part, or "stage") and runtime.actor(runtimeId), a read-only view of a part. Each call makes a new
    // frozen view of where the part is now, in the 座標と向き frame, so a long command reads the part again; the
    // runtime itself is never handed out, so an extension cannot change a part except through the work's sentences.
    function extensionPartView(runtime, runtimeId) {
      const a = runtimeId === 'stage' ? null : runtime?.actor(runtimeId);
      return a ? Object.freeze({ runtimeId: a.runtimeId, baseId: a.baseId, isClone: a.isClone, x: a.x, y: a.y, direction: a.direction }) : null;
    }
    function extensionContext(context) {
      const runtime = context?.runtime, view = Object.freeze({ actor: runtimeId => extensionPartView(runtime, runtimeId) });
      return context?.signal ? { signal: context.signal, runtimeId: context.runtimeId, runtime: view } : { runtimeId: context?.runtimeId, runtime: view };
    }
    function invokeExtension(kind, name, args, context) {
      context = extensionContext(context);
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
    // The color picker shows these words for colors whose code word uses a hard kanji; code reads both.
    const COLOR_LABELS = { 橙: 'だいだい', 紫: 'むらさき', 桃: 'もも色', 灰: 'ねずみ色' };
    // Event names on screen; the entry buttons use the same words.
    const EVENT_LABELS = {
      start: '「動かす」を おしたとき',
      click: 'おされたとき',
      keyDown: 'キーを おしたとき',
      message: '合図を 受けたとき',
      backdropChanged: 'はいけいが かわったとき',
      valueChanged: '中身が かわったとき',
      cloneStart: 'コピーが できたとき',
      touchStart: 'ふれたとき',
      conditionTrue: 'そう なったとき',
      interval: '〜秒ごとに',
    };
    // The touch targets that are no part: the whole stage edge (端) and its four sides, by the words code writes.
    const EDGE_TARGETS = Object.freeze({ 端: '画面のはし', '端:上': '画面の上のはし', '端:下': '画面の下のはし', '端:右': '画面の右のはし', '端:左': '画面の左のはし' });
    const isEdgeTarget = (target) => typeof target === 'string' && Object.hasOwn(EDGE_TARGETS, target);
    const EDGE_SIDES = Object.freeze(['端:上', '端:下', '端:右', '端:左']);
    // A body is named by its event; a touch body also by what it touches (「星」に ふれたとき, 画面のはしに ふれたとき).
    const eventText = (event, filter) => event === 'touchStart' && typeof filter?.target === 'string' && filter.target
      ? (isEdgeTarget(filter.target) ? EDGE_TARGETS[filter.target] : '「' + filter.target + '」') + 'に ふれたとき' : EVENT_LABELS[event];
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
    // A mistake in one value of a sentence (a time below 0, a tone out of range) is placed at that value (F-06), so the
    // block view marks its field and the code its place. A quantity (2秒) has the span of its number.
    function valueError(code, message, value) {
      const span = value?.sourceSpan || value?.value?.sourceSpan;
      return new AkariError(code, message, span?.startLine || 0, span?.startColumn || 0);
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
        throw new AkariError('R417', '使えない たんいです');
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
    // 名人: a part as a value. The name is kept for display; identity is the runtime id.
    const isPart = (v) => exactKeys(v, ['part', 'name']) && typeof v.part === 'string' && typeof v.name === 'string';
    const partValue = (runtimeId, name) => Object.freeze({ part: runtimeId, name });
    const scalar = (v) => isNumberValue(v) || typeof v === 'string' || typeof v === 'boolean' || isPart(v);
    const partList = (v) => {
      if (!Array.isArray(v)) throw new AkariError('R411', '「みんな」「それぞれ」「順番に」は、部品の あつまりに 使います');
      const other = v.find(x => !isPart(x));
      if (other !== undefined) throw new AkariError('R411', `「みんな」「それぞれ」「順番に」の リストに、部品では ない「${valueText(other)}」が 入っています。部品だけを 入れた リストに 使います`);
      return v;
    };
    // A target is a part's name (every instance of it) or a part value (that one instance). What else is written there
    // stops with the words need() makes (partNeeded), only then.
    const targetValue = (v, need) => isPart(v) || typeof v === 'string' ? v : stringv(v, need?.());
    const targetName = (v, need) => isPart(v) ? v.name : typeof v === 'string' ? v : stringv(v, need?.());
    // The words when a part's name is needed: the kind of part the sentence takes, and an example from the child's own
    // work, a part of that kind (for ふれる, きょり and 向く another part, or the mouse), never a name the work does not have.
    const PART_KINDS = Object.freeze({ text: ['文字・ボタン・四角の 部品', ['label', 'button', 'box']], input: ['入力らん', ['input']], copy: ['キャラクター', ['sprite']] });
    function partNeeded(ctx, kind = null) {
      const [words, types] = PART_KINDS[kind] || ['キャラクターや 部品', null], own = ctx?.runtime?.actor?.(ctx.runtimeId)?.baseId,
        part = ctx?.runtime?.project?.components?.find(c => (kind || c.id !== own) && (!types || types.includes(c.type))),
        example = part ? '「' + part.name + '」' : kind ? null : '「マウス」';
      return `ここには ${words}の 名前が いります` + (example ? '。れい：' + example : '');
    }
    const listValue = (v) => Array.isArray(v) && v.every(scalar);
    function assertRuntimeValueLimit(v) {
      if (typeof v === 'number') ensureFinite(v);
      if (!scalar(v) && !Array.isArray(v)) throw new AkariError('R411', '中身の しゅるいが 正しくありません');
      if (typeof v === 'string' && cpLen(v) > LIMITS.stringChars)
        throw new AkariError('R413', '文字が 長すぎます');
      if (Array.isArray(v)) {
        if (v.length > LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        for (const x of v) {
          if (!scalar(x)) throw new AkariError('R411', 'リストに 入れられるのは 数・文字・あてはまる／あてはまらない だけです');
          if (typeof x === 'string' && cpLen(x) > LIMITS.stringChars)
            throw new AkariError('R413', 'リストの 中の 文字が 長すぎます');
        }
      }
      return v;
    }
    // valueText writes every digit (the 「もとの 数」 and messages). A number made into text by the program (部品の文字,
    // つなぐ, 文字（ ）) passes asText and keeps at most 12 significant digits, as the bubbles show it (F-32, LANGUAGE.md
    // 数値の通常表示と実値): a safe integer as it is, any other number rounded at the 12th digit without its trailing
    // zeros (11.1÷10 is 1.11, 0.1＋0.2 is 0.3). The value itself is never rounded.
    const numberText = (n, asText = false) => {
      if (Object.is(n, -0)) return '0';
      if (!asText || Number.isSafeInteger(n) || !Number.isFinite(n)) return String(n);
      const precise = n.toPrecision(12), parsed = Number(precise);
      return Number.isFinite(parsed) ? String(parsed) : precise;
    };
    const valueText = (v, asText = false) => {
      if (isPart(v)) return v.name;
      if (typeof v === 'boolean') return v ? 'あてはまる' : 'あてはまらない';
      if (isQuantity(v)) return valueText(v.magnitude, asText) + (v.unit || '');
      if (typeof v === 'number') return numberText(v, asText);
      if (typeof v === 'string') return v;
      throw new AkariError('R411', 'これは 文字として 見せられません');
    };
    const ensureFinite = (n) => {
      if (!Number.isFinite(n)) throw new AkariError('R403', '計算の 答えが、あかりで 使える 数に なりませんでした。使う 数や 計算の しかたを たしかめてください');
      return Object.is(n, -0) ? 0 : n;
    };
    // Presentation only. Expressions, text conversion and files retain the value.
    const displayValue = (v) => {
      if (typeof v === 'number') ensureFinite(v);
      const rawText = valueText(v);
      if (!isNumberValue(v)) return { text: rawText, rawText, rounded: false };
      const n = ensureFinite(isQuantity(v) ? v.magnitude : v);
      const text = numberText(n, true) + (isQuantity(v) ? v.unit || '' : '');
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
      if (isPart(a) || isPart(b)) return isPart(a) && isPart(b) && a.part === b.part;
      return (typeof a === typeof b && Object.is(a, b)) || (typeof a === typeof b && a === b);
    };
    function validateColorHex(v, allowNull = false) {
      if (allowNull && v === null) return true;
      return typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v);
    }
    function resolveColor(v, { allowTransparent = true } = {}) {
      if (typeof v !== 'string') throw new AkariError('R411', '色は 文字で きめます。れい：「赤」');
      v = Object.keys(COLOR_LABELS).find((word) => COLOR_LABELS[word] === v) || v;
      if (Object.prototype.hasOwnProperty.call(COLOR_NAMES, v)) {
        if (v === '透明' && !allowTransparent)
          throw new AkariError('R412', 'ここでは「透明」は 使えません。れい：「赤」');
        return COLOR_NAMES[v];
      }
      if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v.toLowerCase();
      throw new AkariError('R412', `色「${v}」は 使える 色では ありません。使える 色は 黒・白・ねずみ色・赤・だいだい・黄・緑・水色・青・むらさき・もも色・茶 です`);
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
    // A wake of the scheduler with no delay. In a page it is a message on a channel: the browser holds a setTimeout(0)
    // that follows others back for 4 ms, which left the runtime idle for a third of the time while turns were due. A
    // page still draws and takes input between two wakes. Elsewhere (node) it is a setTimeout.
    const wakeSoon = (() => {
      if (typeof MessageChannel !== 'function' || typeof document === 'undefined') return null;
      let channel = null;
      const queue = [];
      return (fn) => {
        if (!channel) {
          channel = new MessageChannel();
          channel.port1.onmessage = () => queue.shift()?.();
        }
        queue.push(fn);
        channel.port2.postMessage(0);
      };
    })();
    // A wait with a subject (だんごは0.2秒待つ) holds only that part: the flow goes on, and the next statement of
    // that part waits until the hold ends. A wait without one (みんな, {kind:'all'}) stops the whole flow.
    function everyoneWaitKind(kind) {
      return ['WaitTime', 'WaitUntil', 'BroadcastAndWait', 'WaitBroadcastGroup'].includes(kind);
    }
    function hasEventCount(node) {
      if (!node || typeof node !== 'object') return false;
      if (node.kind === 'EventCount') return true;
      return Object.values(node).some(v => v && typeof v === 'object' && hasEventCount(v));
    }
    function everyoneStatement(node) {
      return node?.actorRef ? node.actorRef.kind === 'all' : everyoneWaitKind(node?.kind);
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
        throw new AkariError('F508', '絵や音の中身を表す文字の書き方が、正しくありません');
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
          throw new AkariError('F508', '絵や音の中身を表す文字の書き方が、正しくありません');
      }
      if (pad && end < 2)
        throw new AkariError('F508', '絵や音の中身を表す文字の書き方が、正しくありません');
      return (text.length / 4) * 3 - pad;
    }
    function decodeBase64(text) {
      const expected = decodedBase64Length(text);
      if (expected > LIMITS.assetRawTotal) throw new AkariError('F504', '絵や音の 中身が 大きすぎます');
      let out;
      if (typeof atob === 'function') {
        let bin;
        try {
          bin = atob(text);
        } catch (_) {
          throw new AkariError('F508', '絵や音の中身を表す文字を、読みとれません');
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
      if (encodeBase64(out) !== text) throw new AkariError('F508', '絵や音の中身を表す文字が、決まった形になっていません');
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
          throw new AkariError('F505', `絵や音の番号「${asset.id}」が 2つ あります`);
        const frozen = makeImmutableAssetRecord(asset);
        this.#map.set(frozen.id, frozen);
        return frozen;
      }
      findByDigest(kind, digest, byteLength, bytes = null) {
        for (const a of this.#map.values())
          if (a.kind === kind && a.sha256 === digest) {
            if (a.byteLength !== byteLength)
              throw new AkariError('F508', '同じしるしの絵や音なのに、大きさがちがいます');
            if (bytes && !bytesEqual(a.bytes, bytes))
              throw new AkariError('F508', '同じしるしと大きさの絵や音なのに、中身がちがいます');
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
    // The grids of what is seen of pictures (AssetRuntimeCache.makeMask) outlive a run: the editor and the player make a
    // new asset cache at every ▶, and a grid depends only on the picture's bytes. The last 256 pictures are kept.
    const MASKS_BY_BYTES = new Map();
    class AssetRuntimeCache {
      constructor(assetStore, services = {}) {
        this.assetStore = assetStore;
        this.imageByAssetId = new Map();
        this.maskByAssetId = new Map();
        // A part's picture whose grid is not made yet (getMask makes it).
        this.pendingMasks = new Map();
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
                  '絵や音の じゅんびを とちゅうで やめました',
                ),
              ),
            timer = setTimeout(
              () =>
                finish(
                  new AkariError(
                    'R415',
                    label +
                      'が10秒たっても おわりませんでした',
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
        if (!AC) throw new AkariError('R415', 'このブラウザでは 音を 鳴らせません');
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
          throw new AkariError('R415', '音を はじめられませんでした', 0, 0, e?.message || '');
        }
      }
      async ensureAudioReady() {
        const ac = this.ensureAudioContext();
        try {
          await this.awaitOperation(this.audioResumePromise || Promise.resolve(), 'AudioContext');
        } catch (e) {
          throw new AkariError('R415', '音を はじめられませんでした', 0, 0, e?.message || '');
        }
        if (ac.state && ac.state !== 'running')
          throw new AkariError('R415', '音を はじめられませんでした');
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
        // Only a part's picture is touched by its outline; a picture used only as a backdrop needs no grid.
        const costumeIds = new Set();
        for (const c of project.components)
          if (c.type === 'sprite') for (const co of c.costumes || []) if (co.kind === 'image') costumeIds.add(co.assetId);
        for (const id of requirements.imageIds) {
          if (generationToken !== this.generationToken)
            throw new AkariError(
              'R415',
              '絵や音の じゅんびを とちゅうで やめました',
            );
          const a = this.assetStore.get(id);
          if (!a || a.kind !== 'image')
            throw new AkariError(
              'R415',
              `\u753b\u50cfasset\u300c${id}」の じゅんびが できませんでした`,
            );
          if (this.objectUrls.has(id)) URL.revokeObjectURL(this.objectUrls.get(id));
          const blob = new Blob([a.bytes], { type: a.mime }),
            url = URL.createObjectURL(blob);
          this.objectUrls.set(id, url);
          let img;
          try {
            img = this.createImage();
            img.src = url;
            await this.awaitOperation(img.decode(), '絵の じゅんび');
            if (generationToken !== this.generationToken)
              throw new AkariError(
                'R415',
                '絵や音の じゅんびを とちゅうで やめました',
              );
            const meta = a.meta || {};
            if (
              (meta.width && img.naturalWidth !== meta.width) ||
              (meta.height && img.naturalHeight !== meta.height)
            )
              throw new AkariError(
                'R415',
                '絵の 大きさが、きろくされた 大きさと 合いません',
              );
            this.imageByAssetId.set(id, img);
            if (costumeIds.has(id)) this.pendingMasks.set(id, a);
          } catch (error) {
            URL.revokeObjectURL(url);
            if (this.objectUrls.get(id) === url) this.objectUrls.delete(id);
            img?.removeAttribute?.('src');
            throw error instanceof AkariError
              ? error
              : new AkariError(
                  'R415',
                  `\u753b\u50cfasset\u300c${id}」の じゅんびが できませんでした`,
                );
          }
        }
        if (requirements.needsAudio) {
          const ac = deferAudioStart ? this.ensureAudioContext() : await this.ensureAudioReady();
          for (const id of requirements.audioIds) {
            if (generationToken !== this.generationToken)
              throw new AkariError(
                'R415',
                '絵や音の じゅんびを とちゅうで やめました',
              );
            const a = this.assetStore.get(id);
            if (!a || a.kind !== 'audio')
              throw new AkariError(
                'R415',
                `\u97f3asset\u300c${id}」の じゅんびが できませんでした`,
              );
            try {
              const bytes = a.bytes,
                copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
                buf = await this.awaitOperation(
                  ac.decodeAudioData(copy),
                  '音の じゅんび',
                );
              if (generationToken !== this.generationToken)
                throw new AkariError(
                  'R415',
                  '絵や音の じゅんびを とちゅうで やめました',
                );
              this.audioBufferByAssetId.set(id, buf);
            } catch (error) {
              throw error instanceof AkariError
                ? error
                : new AkariError(
                    'R415',
                    `\u97f3asset\u300c${id}」の じゅんびが できませんでした`,
                  );
            }
          }
        }
      }
      getImage(id) {
        return this.imageByAssetId.get(id) || null;
      }
      // 絵の見えているところ (final call 17): a part's loaded picture is read, the first time a touch looks at it
      // (getMask), into a grid of at most 64×64 cells; a cell is seen when a pixel of the picture in it is not fully transparent. The grid is made from the
      // picture's own pixels (the browser does not scale them), so it is the same on every machine. It is made once for
      // the same bytes (checked against their sha256 when the work was read) and kept across runs (MASKS_BY_BYTES).
      // Without a canvas, or for a picture that cannot be read, there is none: the part then touches with its box.
      makeMask(asset, img) {
        const key = asset.sha256 ? `${asset.sha256}:${asset.byteLength}:${img.naturalWidth}x${img.naturalHeight}` : null;
        if (key && MASKS_BY_BYTES.has(key)) return MASKS_BY_BYTES.get(key);
        let mask = null;
        try {
          const iw = img.naturalWidth, ih = img.naturalHeight,
            canvas = iw > 0 && ih > 0 ? (typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(iw, ih) : globalThis.document?.createElement('canvas')) : null;
          if (canvas) {
            canvas.width = iw;
            canvas.height = ih;
            const g = canvas.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0);
            const data = g.getImageData(0, 0, iw, ih).data, w = Math.min(64, iw), h = Math.min(64, ih), cells = new Uint8Array(w * h),
              column = new Uint16Array(iw);
            for (let x = 0; x < iw; x++) column[x] = Math.floor((x * w) / iw);
            for (let y = 0, at = 3; y < ih; y++) {
              const row = Math.floor((y * h) / ih) * w;
              for (let x = 0; x < iw; x++, at += 4) if (data[at]) cells[row + column[x]] = 1;
            }
            let left = w, right = -1, top = h, bottom = -1;
            for (let r = 0; r < h; r++)
              for (let c = 0; c < w; c++)
                if (cells[r * w + c]) { left = Math.min(left, c); right = Math.max(right, c); top = Math.min(top, r); bottom = Math.max(bottom, r); }
            // counts[(r + 1) * (w + 1) + c + 1]: the seen cells in rows 0..r and columns 0..c.
            const counts = new Uint32Array((w + 1) * (h + 1));
            for (let r = 0; r < h; r++)
              for (let c = 0; c < w; c++)
                counts[(r + 1) * (w + 1) + c + 1] = cells[r * w + c] + counts[r * (w + 1) + c + 1] + counts[(r + 1) * (w + 1) + c] - counts[r * (w + 1) + c];
            mask = Object.freeze({ w, h, cells, counts, seen: right >= 0 ? Object.freeze({ left, right: right + 1, top, bottom: bottom + 1 }) : null });
          }
        } catch (_) {
          mask = null;
        }
        // A picture that could not be read this time is read again at the next ▶.
        if (key && mask) {
          if (MASKS_BY_BYTES.size >= 256) MASKS_BY_BYTES.delete(MASKS_BY_BYTES.keys().next().value);
          MASKS_BY_BYTES.set(key, mask);
        }
        return mask;
      }
      // A grid is made the first time a touch looks at the picture, not at ▶: a work with many large pictures starts as
      // soon as they are decoded, and one that never asks about touch reads no pixels at all.
      getMask(id) {
        const asset = this.pendingMasks.get(id);
        if (asset) {
          this.pendingMasks.delete(id);
          const img = this.imageByAssetId.get(id);
          if (img) this.maskByAssetId.set(id, this.makeMask(asset, img));
        }
        return this.maskByAssetId.get(id) || null;
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
          throw new AkariError('R416', `同時に 鳴らせる 音は ${LIMITS.activeAudioVoices}こまでです。鳴っている 音が おわってから 次の 音を 鳴らします`);
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
            '音が 高すぎるか、長さが 正しくないので 鳴らせません',
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
            '音の 高さを かえすぎたので、この音を 鳴らせません。高さの かえかたを 小さく してください',
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
                '音を 鳴らせませんでした',
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
        this.pendingMasks.clear();
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
    // Positions are the part's centre measured from the bottom-left corner of the work screen (right and up are
    // positive); directions grow counterclockwise from 0 = right. Only the screen view converts (08).
    // 向き is always kept in 0 ≤ 向き < 360.
    function normalizeDirection(d) {
      const r = ((d % 360) + 360) % 360;
      return r === 360 || Object.is(r, -0) ? 0 : r;
    }
    // A motion result within 10⁻⁹ of a whole number is that number (a closed square ends where it began).
    function snapStep(v) {
      const k = Math.round(v);
      return Math.abs(v - k) < 1e-9 ? k : v;
    }
    // cos/sin of a direction in degrees, exact at the right angles (facing up and walking keeps よこ).
    function cosDegrees(d) {
      const r = ((d % 360) + 360) % 360;
      return r === 0 ? 1 : r === 90 || r === 270 ? 0 : r === 180 ? -1 : Math.cos((d * Math.PI) / 180);
    }
    function sinDegrees(d) {
      const r = ((d % 360) + 360) % 360;
      return r === 0 || r === 180 ? 0 : r === 90 ? 1 : r === 270 ? -1 : Math.sin((d * Math.PI) / 180);
    }
    // What a kept touch answer of two parts depends on (RuntimeModel.partsTouch).
    const pose = (a) => ({ x: a.x, y: a.y, direction: a.direction, scalePercent: a.scalePercent, costumeId: a.costumeId, w: a.w, h: a.h });
    const samePose = (kept, a) => kept.x === a.x && kept.y === a.y && kept.direction === a.direction && kept.scalePercent === a.scalePercent &&
      kept.costumeId === a.costumeId && kept.w === a.w && kept.h === a.h;
    const watchPose = (a) => ({ ...pose(a), runtimeId: a.runtimeId, visible: a.visible });
    // Whether a parallelogram (a corner p and its two sides a and b) and an upright rectangle overlap by more than eps
    // on every line that could separate them: the rectangle's two sides and the parallelogram's two (RuntimeModel.partsTouch).
    function overlap(px, py, ax, ay, bx, by, left, right, bottom, top, eps) {
      if (Math.min(right, px + Math.max(0, ax) + Math.max(0, bx)) - Math.max(left, px + Math.min(0, ax) + Math.min(0, bx)) <= eps ||
        Math.min(top, py + Math.max(0, ay) + Math.max(0, by)) - Math.max(bottom, py + Math.min(0, ay) + Math.min(0, by)) <= eps) return false;
      const cx = (left + right) / 2, cy = (bottom + top) / 2, hx = (right - left) / 2, hy = (top - bottom) / 2;
      // Across a side: the parallelogram spans p and p plus the other side, the rectangle its centre and half its size.
      const apart = (nx, ny, ox, oy) => {
        const len = Math.hypot(nx, ny);
        if (!len) return false;
        const p = px * nx + py * ny, d = ox * nx + oy * ny, c = cx * nx + cy * ny, h = hx * Math.abs(nx) + hy * Math.abs(ny);
        return Math.min(p + Math.max(0, d), c + h) - Math.max(p + Math.min(0, d), c - h) <= eps * len;
      };
      return !apart(-ay, ax, bx, by) && !apart(-by, bx, ax, ay);
    }
    const sameWatchPose = (kept, a) => kept.runtimeId === a.runtimeId && kept.visible === a.visible && samePose(kept, a);
    const samePoses = (kept, now) => !!kept && kept.length === now.length && now.every((x, i) => Object.keys(x).every(k => kept[i][k] === x[k]));
    // A subject or heading written 画面 is the work screen, unless a part is named 画面: then it is that part (as for
    // 今 and はし), and the screen is still named by its own name (画面1).
    function namesStage(project, name) {
      return name === project.stage.name || (name === '画面' && !project.components.some((c) => c.name === '画面'));
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
        this.touchCache = new Map();
        this.creationSequence = 0;
        for (let i = 0; i < this.project.components.length; i++) {
          const c = this.project.components[i];
          this.actors.set(c.id, this.makeActor(c, c.id, false, i));
        }
        this.stage = { backdropId: this.project.stage.backdropId, volume: 100, pitch: 0 };
        this.clockOffset = 0;
        this.pausedAt = null;
        this.startTime = this.now();
        // タイマーを0にする restarts the timer as an offset from the run's start, which is kept.
        this.timerOffset = 0;
        // How many times each part finished a procedure or was clicked (〜が10回【ジャンプ】するまで).
        this.eventCounts = new Map();
        // Until the pointer enters the screen it reads よこ0・たて0 and touches no part.
        this.mouseAt = { x: 0, y: 0, entered: false };
        this.mouseDown = false;
        this.pressedKeys = new Set();
        this.prng = new PRNG(seed >>> 0);
        this.runSeed = seed >>> 0;
        this.ui.render?.();
      }
      // The pointer's place in the child frame; setting it means the pointer has entered the screen.
      get mouseX() {
        return this.mouseAt.x;
      }
      set mouseX(x) {
        this.mouseAt.x = x;
        this.mouseAt.entered = true;
      }
      get mouseY() {
        return this.mouseAt.y;
      }
      set mouseY(y) {
        this.mouseAt.y = y;
        this.mouseAt.entered = true;
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
          direction: normalizeDirection(c.direction),
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
        // みんな ({kind:'all'}, a wait of the whole flow) reads its time or condition as 自分.
        if (ref && ref.kind === 'named') {
          id = ref.targetId || (namesStage(this.project, ref.name) ? 'stage' :
            this.project.components.find((c) => c.name === ref.name)?.id);
        }
        if (id !== 'stage' && !this.actor(id))
          throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return id;
      }
      countEvent(key) {
        this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);
      }
      // A まで on counts compares with the counts when the wait or the repeat began.
      bindEventCounts(condition, ctx) {
        if (!condition || typeof condition !== 'object') return condition;
        if (Array.isArray(condition)) return condition.map(x => this.bindEventCounts(x, ctx));
        if (condition.kind === 'EventCount') {
          const runtimeId = this.resolveActorRef(condition.actorRef, ctx.runtimeId);
          const key = runtimeId + (condition.event === 'action' ? '|action|' + condition.name : '|click');
          const target = numberInUnit(evalExpression(condition.count, ctx), '回');
          if (!Number.isSafeInteger(target) || target < 0)
            throw new AkariError('R413', '回数は 0、1、2 のような 数に します。マイナスや 小数は 使えません');
          return { kind: 'EventCountBound', key, baseline: this.eventCounts.get(key) || 0, target };
        }
        const out = {};
        for (const [k, v] of Object.entries(condition)) out[k] = v && typeof v === 'object' ? this.bindEventCounts(v, ctx) : v;
        return out;
      }
      // A part value used as a subject must still exist (a deleted copy does not).
      partRuntimeId(v) {
        if (!isPart(v)) throw new AkariError('R411', `主語の へんすうに 入っているのは「${valueText(v)}」で、部品では ありません。先に「主役をねこにする」のように 部品を 入れます`);
        // A copy that is gone (このコピーだけを消す, 全部消す) is not there any more; a part is always there.
        if (v.part !== 'stage' && !this.actor(v.part))
          throw new AkariError('R405', `主語の へんすうに 入っている「${v.name}」の コピーは、もう 消えています`);
        return v.part;
      }
      requireActor(ctx) {
        const a = this.actor(ctx.runtimeId);
        if (!a)
          throw new AkariError('R407', 'この ブロックは、キャラクターや 部品の 動きの 中で 使います');
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
        if (!ctx.task.execStack.some(f => f.type === 'callBoundary'))
          for (const b of ctx.task.inheritedBinders || []) if (b.name === name) return { found: true, value: b.value };
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
        if (!b) throw new AkariError('S301', `まだ 作っていない 名前「${n.name}」です`);
        return deepCopy(b.get());
      }
      writeTarget(t, value, ctx, { requireKind = null, resolvedBinding = null } = {}) {
        assertRuntimeValueLimit(value);
        const b = resolvedBinding || this.resolveBinding(t.name, t.qualifier === 'exact' ? null : t.qualifier, ctx);
        if (!b) throw new AkariError('S301', `入れる先「${t.name}」が ありません`);
        if (!b.set) throw new AkariError('S312', `「${t.name}」は 見るだけで、かえられません`);
        if (requireKind && b.kind !== requireKind && b.scope !== 'arg')
          throw new AkariError(
            'R411',
            `「${t.name}」は${requireKind === 'list' ? 'リスト' : 'へんすう'}ではありません`,
          );
        if (b.kind === 'list' && !Array.isArray(value))
          throw new AkariError('R411', 'リストには リストだけを 入れられます');
        if (b.kind === 'scalar' && !scalar(value))
          throw new AkariError('R411', 'へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます');
        if (Array.isArray(value) && value.length > LIMITS.listItems)
          throw new AkariError('R413', 'リストが 長すぎます');
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
      targetsOf(target) {
        if (!isPart(target)) return this.instancesByName(target);
        const a = this.actor(target.part);
        if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return [a];
      }
      partActor(part) {
        const a = this.actor(part.part);
        if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
        return a;
      }
      // 〜のうち、右にいるほう / 体力が大きいほう: one part only when the comparison decides it.
      // ねこにいちばん近いもの is one of the others: ねこ itself is not among them.
      pickPart(parts, by, ctx) {
        const base = by.kind === 'near' ? this.actor(this.resolveActorRef({ kind: 'named', name: by.to }, ctx.runtimeId)) : null;
        if (base) parts = parts.filter(part => this.actor(part.part) !== base);
        const score = part => {
          const a = this.partActor(part), box = this.aabb(a);
          if (by.kind === 'position') return { 右: box.cx, 左: -box.cx, 上: box.cy, 下: -box.cy }[by.side];
          if (by.kind === 'near') { const to = this.aabb(base); return -Math.hypot(box.cx - to.cx, box.cy - to.cy); }
          const value = numberValue(this.readName({ name: by.name, qualifier: 'self' }, { ...ctx, runtimeId: part.part }), `「${by.name}」には 数が いります`);
          return by.order === 'max' ? value : -value;
        };
        const scored = parts.map(part => ({ part, score: score(part) })), best = Math.max(...scored.map(x => x.score));
        const top = scored.filter(x => x.score === best);
        return top.length === 1 ? [top[0].part] : [];
      }
      // いちばん近い星: of the parts other than the one who acts. Undecided (a tie, or none) gives null when strict:
      // the one who acts toward it then does nothing (名人 M-06). Otherwise the earlier made wins a tie.
      nearestPart(parts, runtimeId, strict = false) {
        const from = this.aabb(this.requireActor({ runtimeId }));
        let best = null, distance = Infinity, tie = false;
        for (const part of parts) {
          if (part.part === runtimeId) continue;
          const a = this.partActor(part), box = this.aabb(a), d = Math.hypot(box.cx - from.cx, box.cy - from.cy);
          if (d < distance - 1e-12) { best = { part, actor: a }; distance = d; tie = false; }
          else if (Math.abs(d - distance) < 1e-12) { tie = true; if (a.creationSequence < best.actor.creationSequence) best = { part, actor: a }; }
        }
        if (strict && (!best || tie)) return null;
        if (!best) throw new AkariError('R405', 'いちばん 近い 部品が いません（自分の ほかに 一つも ありません）。いるかを「もし〜なら、」で しらべてから 使います');
        return best.part;
      }
      // ねこにふれているもの / ゴールにふれている星: every visible part touching it now (of that part only, with of).
      partsTouching(target, ofName) {
        if (!isPart(target)) throw new AkariError('R411', 'ふれる 相手には 部品を 書きます');
        const a = this.partActor(target), base = ofName ? this.project.components.find(c => c.name === ofName)?.id : null;
        const out = [];
        for (const b of [...this.actors.values()].sort((x, y) => x.creationSequence - y.creationSequence)) {
          if (b.runtimeId === a.runtimeId || !b.visible || !a.visible || (base && b.baseId !== base)) continue;
          if (this.partsTouch(a, b)) out.push(partValue(b.runtimeId, this.component(b.runtimeId)?.name ?? ''));
        }
        return out;
      }
      // The parts whose sounds are playing now.
      soundingParts() {
        const playing = this.assetCache?.activeAudioHandles, out = new Set();
        for (const [id, runtimeId] of this.audioOwners || []) {
          if (playing?.has(id)) out.add(runtimeId); else this.audioOwners.delete(id);
        }
        return out;
      }
      stopPartSounds(runtimeId) {
        for (const [id, owner] of [...(this.audioOwners || [])]) if (owner === runtimeId) this.assetCache?.stopHandle(id, { notify: true });
      }
      // The box around the turned and scaled part, in the child frame: bottom is the smaller たてのばしょ.
      aabb(a) {
        const sc = a.scalePercent / 100,
          hw = (a.w * sc) / 2,
          hh = (a.h * sc) / 2,
          cs = cosDegrees(a.direction),
          sn = sinDegrees(a.direction);
        const ex = Math.abs(hw * cs) + Math.abs(hh * sn),
          ey = Math.abs(hw * sn) + Math.abs(hh * cs),
          cx = a.x,
          cy = a.y;
        return { left: cx - ex, right: cx + ex, bottom: cy - ey, top: cy + ey, cx, cy };
      }
      touching(runtimeId, target) {
        const a = this.requireActor({ runtimeId });
        if (!a.visible) return false;
        // One side of the screen (画面の下のはし: たて0 and below); 画面のはし is any of the four. A part outside the screen
        // touches the side it went out of. A picture part touches it with what is seen of it (visibleBox).
        const W = this.project.stage.width, H = this.project.stage.height;
        if (isEdgeTarget(target)) {
          const vb = this.visibleBox(a);
          if (!vb) return false;
          if (target === '端:下') return vb.bottom <= 0;
          if (target === '端:上') return vb.top >= H;
          if (target === '端:左') return vb.left <= 0;
          if (target === '端:右') return vb.right >= W;
          return vb.left <= 0 || vb.bottom <= 0 || vb.right >= W || vb.top >= H;
        }
        const aa = this.aabb(a);
        // The mouse touches a picture part only where the picture is seen.
        if (target === 'マウス') {
          const mask = this.pictureMask(a);
          return (
            this.mouseAt.entered &&
            this.mouseX >= aa.left &&
            this.mouseX <= aa.right &&
            this.mouseY >= aa.bottom &&
            this.mouseY <= aa.top &&
            (!mask || this.pictureSeenAt(a, mask, this.mouseX, this.mouseY))
          );
        }
        const targets = this.targetsOf(target).filter(
          (x) => x.runtimeId !== runtimeId && x.visible,
        );
        if (!targets.length) {
          if (!isPart(target) && !this.project.components.some((c) => c.name === target)) {
            const other = this.project.components.find(c => c.id !== a.baseId);
            throw new AkariError('R405', `部品「${target}」が ありません。ふれる 相手には、作品に ある キャラクターや 部品の 名前を 書きます。れい：「${other?.name ?? 'マウス'}」`);
          }
          return false;
        }
        return targets.some((b) => this.partsTouch(a, b));
      }
      // The cells of a part whose look is a picture (an imported picture or お絵かき); null for a look of text and for
      // every other kind of part (label, button, box, input), which touch with their box (final call 17).
      pictureMask(a) {
        if (!a.costumeId || !this.assetCache?.getMask) return null;
        const c = this.component(a.runtimeId);
        if (c?.type !== 'sprite') return null;
        const co = c.costumes?.find((x) => x.id === a.costumeId);
        return co?.kind === 'image' ? this.assetCache.getMask(co.assetId) : null;
      }
      // Whether a picture is seen at (x, y) on the screen: the point is turned back by the part's direction and scaled
      // into the picture, which fills the part's box (as it is drawn).
      pictureSeenAt(a, mask, x, y) {
        return this.pictureSampler(a, mask).seen(x, y);
      }
      // Where a point of the screen falls in a part's picture, as (column, row) of its cells, and whether that cell is seen.
      pictureSampler(a, mask) {
        const sc = a.scalePercent / 100, cs = cosDegrees(a.direction), sn = sinDegrees(a.direction), W = a.w * sc, H = a.h * sc,
          ax = a.x, ay = a.y, mw = mask.w, mh = mask.h, cells = mask.cells;
        const cell = (x, y) => {
          const dx = x - ax, dy = y - ay;
          return [((dx * cs + dy * sn) / W + 0.5) * mw, (0.5 - (dy * cs - dx * sn) / H) * mh];
        };
        return {
          cell,
          seen(x, y) {
            const dx = x - ax, dy = y - ay, u = (dx * cs + dy * sn) / W + 0.5, v = 0.5 - (dy * cs - dx * sn) / H;
            if (!(u >= -1e-9 && u <= 1 + 1e-9 && v >= -1e-9 && v <= 1 + 1e-9)) return false;
            const col = Math.min(mw - 1, Math.max(0, Math.floor(u * mw))), row = Math.min(mh - 1, Math.max(0, Math.floor(v * mh)));
            return cells[row * mw + col] === 1;
          },
          // Whether a cell is seen in the part of the picture that a rectangle of the screen covers (turned, the cells
          // around it).
          anySeenIn(left, right, bottom, top) {
            // The rectangle's corners in cells, as cell() gives them: each is a sum of one term of a side and one of the
            // bottom or top, so the smallest and largest are sums of the terms' (the same numbers, with no list made).
            const l = left - ax, rr = right - ax, b = bottom - ay, t = top - ay,
              c0 = ((Math.min(l * cs, rr * cs) + Math.min(b * sn, t * sn)) / W + 0.5) * mw,
              c1 = ((Math.max(l * cs, rr * cs) + Math.max(b * sn, t * sn)) / W + 0.5) * mw,
              r0 = (0.5 - (Math.max(b * cs, t * cs) - Math.min(l * sn, rr * sn)) / H) * mh,
              r1 = (0.5 - (Math.min(b * cs, t * cs) - Math.max(l * sn, rr * sn)) / H) * mh;
            const cl = Math.max(0, Math.floor(c0 - 1e-9)), cr = Math.min(mw - 1, Math.ceil(c1 + 1e-9) - 1),
              rt = Math.max(0, Math.floor(r0 - 1e-9)), rb = Math.min(mh - 1, Math.ceil(r1 + 1e-9) - 1);
            if (cl > cr || rt > rb) return false;
            const n = mask.counts, w1 = mw + 1;
            return n[(rb + 1) * w1 + cr + 1] - n[rt * w1 + cr + 1] - n[(rb + 1) * w1 + cl] + n[rt * w1 + cl] > 0;
          },
        };
      }
      // The box around what is seen of a part: for a picture, around its seen cells (turned and scaled); for any other
      // part, its box. A picture of which nothing is seen has none.
      visibleBox(a) {
        const mask = this.pictureMask(a);
        if (!mask) return this.aabb(a);
        if (!mask.seen) return null;
        const sc = a.scalePercent / 100, cs = cosDegrees(a.direction), sn = sinDegrees(a.direction), W = a.w * sc, H = a.h * sc,
          xs = [(mask.seen.left / mask.w - 0.5) * W, (mask.seen.right / mask.w - 0.5) * W],
          ys = [(0.5 - mask.seen.bottom / mask.h) * H, (0.5 - mask.seen.top / mask.h) * H];
        let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
        for (const lx of xs)
          for (const ly of ys) {
            const px = a.x + lx * cs - ly * sn, py = a.y + lx * sn + ly * cs;
            left = Math.min(left, px); right = Math.max(right, px); bottom = Math.min(bottom, py); top = Math.max(top, py);
          }
        return { left, right, bottom, top, cx: a.x, cy: a.y };
      }
      // Whether two parts touch: their boxes overlap, as for every part, and where they overlap a point is seen of both
      // — of a picture where its cells are seen, of any other part anywhere in its box (final call 17). The overlap is
      // looked at in points no further apart than the finest picture cell (at most 32×32 of them; a wider overlap cell by
      // cell). A pair's answer is kept until either part moves, turns, or changes its size or look.
      partsTouch(a, b) {
        const aa = this.aabb(a), bb = this.aabb(b);
        if (!(aa.left <= bb.right && aa.right >= bb.left && aa.bottom <= bb.top && aa.top >= bb.bottom)) return false;
        const ma = this.pictureMask(a), mb = this.pictureMask(b);
        if (!ma && !mb) return true;
        if ((ma && !ma.seen) || (mb && !mb.seen)) return false;
        const [p, q] = a.runtimeId < b.runtimeId ? [a, b] : [b, a], key = p.runtimeId + '|' + q.runtimeId,
          kept = this.touchCache.get(key);
        if (kept && samePose(kept.p, p) && samePose(kept.q, q)) return kept.result;
        const keep = (result) => {
          if (this.touchCache.size >= 20000) this.touchCache.clear();
          this.touchCache.set(key, { p: pose(p), q: pose(q), result });
          return result;
        };
        // Only where both are seen can they touch: the boxes' overlap within the boxes of what is seen of each.
        const va = this.visibleBox(a), vb = this.visibleBox(b),
          left = Math.max(aa.left, bb.left, va.left, vb.left), right = Math.min(aa.right, bb.right, va.right, vb.right),
          bottom = Math.max(aa.bottom, bb.bottom, va.bottom, vb.bottom), top = Math.min(aa.top, bb.top, va.top, vb.top), rw = right - left, rh = top - bottom;
        if (rw < 0 || rh < 0) return keep(false);
        const sa = ma && this.pictureSampler(a, ma), sb = mb && this.pictureSampler(b, mb);
        if ((sa && !sa.anySeenIn(left, right, bottom, top)) || (sb && !sb.anySeenIn(left, right, bottom, top))) return keep(false);
        const cell = (x, m) => (m ? Math.min((x.w * x.scalePercent) / 100 / m.w, (x.h * x.scalePercent) / 100 / m.h) : Infinity);
        const step = Math.max(0.5, Math.min(cell(a, ma), cell(b, mb)));
        // A wider overlap (more than 32×32 points) is looked at cell by cell instead, which costs less and does not step
        // over a thin seen strip as a coarser point grid could: each seen cell of the finer picture there is a small turned
        // square on the screen, and the other part touches it where one of its own seen cells (or its box) overlaps that
        // square (cells that only meet at a side do not overlap). Only the cells around the overlap are looked at: the
        // overlap turned back into the picture, widened by what a turned cell's box can reach beyond the cell. A cell's box
        // on the screen (inOverlap) and where its corners fall in the other picture (reaches) only rule cells out, since
        // both are wider than the cell; the cell itself decides (cellTouches).
        if ((rw / step) * (rh / step) > 1024) {
          const [x, m, sx, other, om] = !mb || (ma && cell(a, ma) <= cell(b, mb)) ? [a, ma, sa, sb, mb] : [b, mb, sb, sa, ma];
          const sc = x.scalePercent / 100, W = x.w * sc, H = x.h * sc, cs = cosDegrees(x.direction), sn = sinDegrees(x.direction);
          let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
          for (const px of [left, right])
            for (const py of [bottom, top]) { const [c, r] = sx.cell(px, py); c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
          const cw = W / m.w, ch = H / m.h, mc = Math.ceil((cw + ch) / cw) + 1, mr = Math.ceil((cw + ch) / ch) + 1;
          const cFrom = Math.max(0, Math.floor(c0) - mc), cTo = Math.min(m.w - 1, Math.ceil(c1) + mc),
            rFrom = Math.max(0, Math.floor(r0) - mr), rTo = Math.min(m.h - 1, Math.ceil(r1) + mr);
          // Where the box on the screen of the cells in columns c..c2 and rows r..r2 lies: 0 outside the overlap, 2 all
          // inside it (then so is the box of each of these cells), 1 partly. Each coordinate of the box is a sum of one term
          // of a column and one of a row, so its smallest and largest values are those of the terms (the same numbers as
          // from the four corners). A block's box holds the boxes of its cells.
          const n = m.counts, w1 = m.w + 1;
          const inOverlap = (c, c2, r, r2) => {
            const lx0 = (c / m.w - 0.5) * W, lx1 = ((c2 + 1) / m.w - 0.5) * W, ly0 = (0.5 - r / m.h) * H, ly1 = (0.5 - (r2 + 1) / m.h) * H,
              l = x.x + Math.min(lx0 * cs, lx1 * cs) - Math.max(ly0 * sn, ly1 * sn), rr = x.x + Math.max(lx0 * cs, lx1 * cs) - Math.min(ly0 * sn, ly1 * sn),
              bo = x.y + Math.min(lx0 * sn, lx1 * sn) + Math.min(ly0 * cs, ly1 * cs), to = x.y + Math.max(lx0 * sn, lx1 * sn) + Math.max(ly0 * cs, ly1 * cs);
            if (!(Math.max(l, left) + 1e-6 < Math.min(rr, right) - 1e-6 && Math.max(bo, bottom) + 1e-6 < Math.min(to, top) - 1e-6)) return 0;
            return l >= left && rr <= right && bo >= bottom && to <= top ? 2 : 1;
          };
          // Where the other part has a picture: a corner (c, r) of this picture's cells falls in the other's cells at
          // (u00 + c·uc + r·ur, v00 + c·vc + r·vr), with the same turn and scale for every cell. So each cell there is the
          // parallelogram with the sides (uc, vc) (one cell across) and (ur, vr) (one cell down), in the other's cells,
          // which are squares of side 1; nothing is turned again for each cell.
          const on = om?.counts, ow1 = om ? om.w + 1 : 0;
          const at = (c, r) => {
            const lx = (c / m.w - 0.5) * W, ly = (0.5 - r / m.h) * H;
            return other.cell(x.x + lx * cs - ly * sn, x.y + lx * sn + ly * cs);
          };
          const [u00, v00] = other ? at(0, 0) : [0, 0], [u10, v10] = other ? at(1, 0) : [0, 0], [u01, v01] = other ? at(0, 1) : [0, 0],
            uc = u10 - u00, vc = v10 - v00, ur = u01 - u00, vr = v01 - v00,
            uLo = Math.min(0, uc) + Math.min(0, ur), uHi = Math.max(0, uc) + Math.max(0, ur), vLo = Math.min(0, vc) + Math.min(0, vr), vHi = Math.max(0, vc) + Math.max(0, vr);
          // Whether a seen cell of the other part lies where the cells in columns c..c2 and rows r..r2 fall in its cells
          // (their four corners, a little widened): when none does, none of these cells can touch it.
          const reaches = (c, c2, r, r2) => {
            const u = u00 + Math.min(c * uc, (c2 + 1) * uc) + Math.min(r * ur, (r2 + 1) * ur), u2 = u00 + Math.max(c * uc, (c2 + 1) * uc) + Math.max(r * ur, (r2 + 1) * ur),
              v = v00 + Math.min(c * vc, (c2 + 1) * vc) + Math.min(r * vr, (r2 + 1) * vr), v2 = v00 + Math.max(c * vc, (c2 + 1) * vc) + Math.max(r * vr, (r2 + 1) * vr);
            const c0 = Math.max(0, Math.floor(u - 1e-9)), c1 = Math.min(om.w - 1, Math.ceil(u2 + 1e-9) - 1),
              r0 = Math.max(0, Math.floor(v - 1e-9)), r1 = Math.min(om.h - 1, Math.ceil(v2 + 1e-9) - 1);
            return c0 <= c1 && r0 <= r1 && on[(r1 + 1) * ow1 + c1 + 1] - on[r0 * ow1 + c1 + 1] - on[(r1 + 1) * ow1 + c0] + on[r0 * ow1 + c0] > 0;
          };
          // The cell in column c and row r as it lies on the screen (a corner and its two sides), against what is seen of
          // the other part: each of the other's seen cells that the cell reaches in the other picture, or the overlap of the
          // boxes for a part with no picture. Two such shapes overlap when no line along a side of either separates them
          // (overlap).
          const ew = W / m.w, eh = H / m.h, e1x = ew * cs, e1y = ew * sn, e2x = eh * sn, e2y = -eh * cs;
          const cellTouches = (c, r) => {
            if (!other) {
              const lx = (c / m.w - 0.5) * W, ly = (0.5 - r / m.h) * H;
              return overlap(x.x + lx * cs - ly * sn, x.y + lx * sn + ly * cs, e1x, e1y, e2x, e2y, left, right, bottom, top, 1e-6);
            }
            const u0 = u00 + c * uc + r * ur, v0 = v00 + c * vc + r * vr;
            const c0 = Math.max(0, Math.floor(u0 + uLo)), c1 = Math.min(om.w - 1, Math.ceil(u0 + uHi) - 1),
              r0 = Math.max(0, Math.floor(v0 + vLo)), r1 = Math.min(om.h - 1, Math.ceil(v0 + vHi) - 1);
            if (c0 > c1 || r0 > r1 || on[(r1 + 1) * ow1 + c1 + 1] - on[r0 * ow1 + c1 + 1] - on[(r1 + 1) * ow1 + c0] + on[r0 * ow1 + c0] === 0) return false;
            for (let rr = r0; rr <= r1; rr++)
              for (let cc = c0; cc <= c1; cc++) if (om.cells[rr * om.w + cc] && overlap(u0, v0, uc, vc, ur, vr, cc, cc + 1, rr, rr + 1, 1e-9)) return true;
            return false;
          };
          // Blocks of 4×4 cells first: a block with no seen cell, outside the overlap, or where no seen cell of the other
          // picture lies, holds no cell that touches it, so the answer is that of looking at every cell.
          for (let br = rFrom; br <= rTo; br += 4)
            for (let bc = cFrom; bc <= cTo; bc += 4) {
              const br2 = Math.min(rTo, br + 3), bc2 = Math.min(cTo, bc + 3);
              if (n[(br2 + 1) * w1 + bc2 + 1] - n[br * w1 + bc2 + 1] - n[(br2 + 1) * w1 + bc] + n[br * w1 + bc] === 0 ||
                (other && !reaches(bc, bc2, br, br2))) continue;
              const where = inOverlap(bc, bc2, br, br2);
              if (!where) continue;
              for (let r = br; r <= br2; r++)
                for (let c = bc; c <= bc2; c++) if (m.cells[r * m.w + c] && (where === 2 || inOverlap(c, c, r, r)) && cellTouches(c, r)) return keep(true);
            }
          return keep(false);
        }
        const nx = Math.max(1, Math.ceil(rw / step)), ny = Math.max(1, Math.ceil(rh / step));
        for (let j = 0; j < ny; j++) {
          const y = bottom + ((j + 0.5) * rh) / ny;
          for (let i = 0; i < nx; i++) {
            const x = left + ((i + 0.5) * rw) / nx;
            if ((!sa || sa.seen(x, y)) && (!sb || sb.seen(x, y))) return keep(true);
          }
        }
        return keep(false);
      }
      distance(runtimeId, target) {
        const a = this.requireActor({ runtimeId }),
          aa = this.aabb(a);
        if (target === 'マウス')
          return ensureFinite(Math.hypot(this.mouseX - aa.cx, this.mouseY - aa.cy));
        const ts = this.targetsOf(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${isPart(target) ? target.name : target}」が ありません`);
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
        const ts = this.targetsOf(target).filter((x) => x.runtimeId !== runtimeId);
        if (!ts.length) throw new AkariError('R405', `部品「${isPart(target) ? target.name : target}」が ありません`);
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
          aa.top >= 0 &&
          aa.left <= this.project.stage.width &&
          aa.bottom <= this.project.stage.height
        )
          return true;
        for (const b of this.actors.values()) {
          if (b.runtimeId === runtimeId || !b.visible) continue;
          const bb = this.aabb(b);
          if (
            aa.left <= bb.right &&
            aa.right >= bb.left &&
            aa.bottom <= bb.top &&
            aa.top >= bb.bottom
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
          throw new AkariError('R410', 'コピーは もう 作れません。いらない コピーを けしてください');
        const src = this.requireActor({ runtimeId: sourceRuntimeId }),
          c = this.component(sourceRuntimeId);
        if (c?.type !== 'sprite')
          throw new AkariError('R406', 'コピーを 作れるのは キャラクターだけです');
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
          throw new AkariError('R406', `「${this.component(runtimeId)?.name ?? ''}」は コピーでは ないので、消えません。「このコピーだけを消す」「消える」で 消えるのは コピーだけです`);
        this.actors.delete(runtimeId);
        this.ui.render?.();
      }
      setBackdropByName(name) {
        const b = this.project.stage.backdrops.find((x) => x.name === name);
        if (!b) throw new AkariError('R405', `はいけい「${name}」が ありません。画面に ある はいけいの 名前を 書きます。れい：${this.project.stage.backdrops.slice(0, 3).map(x => '「' + x.name + '」').join('、')}`);
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
        if (!this.assetCache) throw new AkariError('R415', '音の じゅんびが できていません');
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.ownSound(this.assetCache.startTone(freq, duration, volume, pitch, onEnded), ctx.runtimeId);
      }
      // Who plays a sound: 名人 waits for one part's sounds (鳴り終わる) and stops them (〜の音を止める).
      ownSound(handleId, runtimeId) {
        (this.audioOwners ||= new Map()).set(handleId, runtimeId || 'stage');
        return handleId;
      }
      startSample(name, ctx, onEnded = null) {
        const snd = this.project.sounds.find((x) => x.name === name);
        if (!snd) throw new AkariError('R414', `音「${name}」が ありません。作品に 入れた 音の 名前を 書きます`);
        const buf = this.assetCache?.getAudioBuffer(snd.assetId);
        if (!buf) throw new AkariError('R415', `音「${name}」の じゅんびが できていません`);
        const a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? this.actor(ctx.runtimeId) : null,
          volume = a?.volume ?? this.stage.volume,
          pitch = a?.pitch ?? this.stage.pitch;
        return this.ownSound(this.assetCache.startSample(buf, volume, pitch, onEnded), ctx.runtimeId);
      }
      stopAllAudio(notify = false) {
        this.assetCache?.stopAllHandles({ notify });
      }
    }
    function localScalar(v) {
      assertRuntimeValueLimit(v);
      if (!scalar(v))
        throw new AkariError('R411', 'この中だけの へんすうには 数・文字・あてはまる／あてはまらない だけを 入れられます');
      return v;
    }
    function numberValue(v, msg = 'ここには 数が いります。れい：10') {
      if (!isNumberValue(v)) throw new AkariError('R411', msg);
      return isQuantity(v) ? v.magnitude : v;
    }
    function numberInUnit(v, expectedUnit, msg = 'ここには 数が いります。れい：10') {
      const magnitude = numberValue(v, msg), unit = unitOf(v);
      if (expectedUnit !== null && !UNIT_TAGS.includes(expectedUnit))
        throw new AkariError('R417', '使えない たんいです');
      if (unit !== null && unit !== expectedUnit)
        throw new AkariError('R417', expectedUnit === null
          ? 'この 計算には たんいの ない 数を 使います。「の数だけ」で たんいを 外せます'
          : `ここでは${expectedUnit}の数を使います。${unit}の数は使えません`);
      return magnitude;
    }
    function numeric(v, msg = 'ここには 数が いります。れい：10') {
      return numberInUnit(v, null, msg);
    }
    function commonUnit(values) {
      let unit = null;
      for (const value of values) {
        numberValue(value);
        const next = unitOf(value);
        if (unit !== null && next !== null && unit !== next)
          throw new AkariError('R417', `${unit}と${next}は同じ たんいでは ありません。たんいを そろえてください`);
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
          throw new AkariError('R417', 'たんいの ある 数どうしは かけられません。「の数だけ」で たんいを 外せます');
        unit = au || bu;
        result = a * b;
      } else if (op === 'DIV') {
        if (bu !== null && au !== bu)
          throw new AkariError('R417', 'この たんいどうしは われません。「の数だけ」で たんいを 外せます');
        if (b === 0) throw new AkariError('R401', '0では われません。わる数を 0では ない 数に してください');
        unit = bu === null ? au : null;
        result = a / b;
      } else {
        numeric(left); numeric(right);
        if (a === 0 && b === 0) throw new AkariError('R402', '0＾0は 計算できません');
        result = Math.pow(a, b);
        if (!Number.isFinite(result))
          throw new AkariError('R402', 'この＾の 計算は 答えが 出せません。使う 数を たしかめてください');
      }
      return quantity(ensureFinite(result), unit);
    }
    function addNumericUpdate(current, increment, op = 'ADD') {
      const a = numberValue(current), b = numberInUnit(increment, unitOf(current));
      return quantity(ensureFinite(op === 'ADD' ? a + b : a - b), unitOf(current));
    }
    function validateExpectedUnit(value, expectedUnit) {
      if (expectedUnit == null) return;
      numberInUnit(value, expectedUnit, 'たんいを 決めた へんすうには 数を 入れます');
    }
    function validateRuntimeData(project, fail = null) {
      const reject = fail || ((message) => { throw new AkariError('R411', message); });
      for (const data of [project.projectData, ...project.components.map(c => c?.localData)]) {
        if (!data || !Array.isArray(data.variables) || !Array.isArray(data.lists)) reject('へんすう・リストが 正しくありません');
        for (const d of data.variables) {
          if (!scalar(d?.initialValue) || isPart(d.initialValue)) reject('へんすうの はじめの 中身が 正しくありません');
          if (d.expectedUnit != null && !UNIT_TAGS.includes(d.expectedUnit)) reject('へんすうの たんいが 正しくありません');
          try { assertRuntimeValueLimit(d.initialValue); validateExpectedUnit(d.initialValue, d.expectedUnit); }
          catch (e) { if (fail) fail(e.message); else throw e; }
        }
        for (const d of data.lists) {
          if (!listValue(d?.initialValue) || d.initialValue.some(isPart)) reject('リストの はじめの 中身が 正しくありません');
          try { assertRuntimeValueLimit(d.initialValue); } catch (e) { if (fail) fail(e.message); else throw e; }
        }
      }
      return true;
    }
    function bool(v, msg = 'ここには あてはまるか どうかを 入れます。れい：点数が10より大きい') {
      if (typeof v !== 'boolean') throw new AkariError('R411', msg);
      return v;
    }
    function stringv(v, msg = 'ここには 文字が いります。れい：「こんにちは」') {
      if (typeof v !== 'string') throw new AkariError('R411', msg);
      return v;
    }
    function integerIndex(v) {
      const n = numberInUnit(v, '番目', '番号には 数が いります。れい：2');
      if (!Number.isInteger(n) || n < 1)
        throw new AkariError('R404', '番号は 1、2、3 のような 数に します。0や マイナス、小数は 使えません');
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
          throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
      }
      switch (ast.kind) {
        case 'QuantityLiteral':
          return quantity(numberInUnit(evalExpression(ast.value, ctx, budget), ast.unit), ast.unit);
        case 'UnitlessRead':
          return numberValue(evalExpression(ast.value, ctx, budget));
        case 'EventCountBound':
          return (ctx.runtime.eventCounts.get(ast.key) || 0) - ast.baseline >= ast.target;
        case 'EventCount':
          throw new AkariError('R411', '回数の 条件は「〜まで待つ」と「〜まで、くり返す」で 使います');
        case 'PartRef': {
          const runtimeId = ctx.runtime.resolveActorRef({ kind: 'named', name: ast.name }, ctx.runtimeId);
          return partValue(runtimeId, ast.name);
        }
        // 名人 part sets: each is a list of parts, in the order of the work's parts and their copies.
        case 'PartFamily':
          return ctx.runtime.instancesByName(ast.name).map(a => partValue(a.runtimeId, ast.name));
        case 'PartExcept': {
          const except = evalExpression(ast.except, ctx, budget);
          return partList(evalExpression(ast.list, ctx, budget)).filter(p => !isPart(except) || p.part !== except.part);
        }
        case 'PartRandom': {
          const parts = partList(evalExpression(ast.list, ctx, budget));
          return parts.length ? [parts[Math.floor(ctx.runtime.prng.nextFloat() * parts.length)]] : [];
        }
        case 'PartPick':
          return ctx.runtime.pickPart(partList(evalExpression(ast.list, ctx, budget)), ast.by, ctx);
        case 'PartNearest':
          return ctx.runtime.nearestPart(partList(evalExpression(ast.of, ctx, budget)), ctx.runtimeId);
        case 'PartsTouching':
          return ctx.runtime.partsTouching(evalExpression(ast.target, ctx, budget), ast.of ? ast.of.name : null);
        case 'CreatedCopies':
          return (ctx.task?.createdCopies || []).filter(p => ctx.runtime.actor(p.part));
        case 'PartName': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          return runtimeId === 'stage' ? ctx.runtime.project.stage.name : ctx.runtime.component(runtimeId)?.name ?? '';
        }
        case 'PartState': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
          if (ast.state === 'speechDone') return !ctx.scheduler?.speaking(runtimeId);
          if (ast.state === 'soundDone') return !ctx.runtime.soundingParts().has(runtimeId);
          if (ast.state === 'copyCount') {
            const base = ctx.runtime.actor(runtimeId)?.baseId;
            return [...ctx.runtime.actors.values()].filter(a => a.isClone && a.baseId === base).length;
          }
          throw new AkariError('R411', '部品の ようすを 読み取れません');
        }
        case 'DeadlineBound':
          return ctx.runtime.now() < ast.deadline;
        case 'PartValue':
          return ast.value;
        case 'ActorQualifiedRead': {
          const runtimeId = ast.actorRef?.kind === 'value'
            ? ctx.runtime.partRuntimeId(evalExpression(ast.actorRef.value, ctx, budget))
            : ctx.runtime.resolveActorRef(ast.actorRef, ctx.runtimeId);
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
            throw new AkariError('R411', 'リストに 入れられるのは 数・文字・あてはまる／あてはまらない だけです');
          if (arr.length > LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
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
          const a = numberValue(left, 'くらべる 左がわは 数に します'),
            b = numberValue(right, 'くらべる 右がわは 数に します');
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
            const error = new AkariError('R411', ast.list.kind === 'VariableRead'
              ? `「${ast.list.name}」は リストでは ないので、何番目かを えらべません。何番目かを えらべるのは リストです`
              : '「N番目」はリストに使います');
            if (ast.list.kind === 'StringLiteral' && ast.list.sourceSpan && ctx.runtime?.actor)
              error.quotedList = { name: ast.list.value, span: { ...ast.list.sourceSpan },
                targetId: ctx.runtime.actor(ctx.runtimeId)?.baseId || 'stage' };
            throw error;
          }
          const i = integerIndex(evalExpression(ast.index, ctx, budget));
          if (i > arr.length) throw new AkariError('R404', 'その 番号の ものは リストに ありません。番号を たしかめてください');
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
          throw new AkariError('R411', `計算できない ところ ${ast.kind}`);
      }
      } catch (error) {
        if (error instanceof AkariError && !error.line && ast.sourceSpan) {
          error.line = ast.sourceSpan.startLine;
          error.column = ast.sourceSpan.startColumn;
        }
        throw error;
      }
    }
    // An example names a list of the child's own work (the work's first list, then the part's own), never one the work
    // does not have; with none, the example has no name.
    function exampleListName(ctx) {
      const r = ctx?.runtime;
      for (const lists of [r?.projectLists, r?.actor?.(ctx.runtimeId)?.lists]) if (lists?.size) return lists.keys().next().value;
      return null;
    }
    function evalBuiltin(ast, ctx, budget) {
      const name = ast.name,
        args = ast.args.map((x) => evalExpression(x, ctx, budget)),
        meta = BUILTIN_META.get(name);
      if (meta && (args.length < meta.minArgs || args.length > meta.maxArgs))
        throw new AkariError('R411', `はじめから ある 計算「${({余り:'あまり',乱数:'AからBのどれか'})[name] || name}」に 入れるものの 数が ちがいます`);
      if (name === 'CONTAINS') {
        const [a, b] = args;
        if (Array.isArray(a)) {
          if (Array.isArray(b))
            throw new AkariError('R411', 'リストの 中から さがす ものは 1つに します');
          return a.some((x) => sameValue(x, b));
        }
        if (typeof a === 'string' && typeof b === 'string') return a.includes(b);
        throw new AkariError('R411', '「入っている」は リストか 文字に 使います。れい：［1、2］に2が入っている');
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
        throw new AkariError('R411', '「最初にある番号」は リストか 文字に 使います');
      }
      if (name === 'LENGTH') {
        const a = args[0];
        if (Array.isArray(a)) return a.length;
        if (typeof a === 'string') return Array.from(a).length;
        const list = exampleListName(ctx);
        throw new AkariError('R411', '数えられるのは、リストに 入っている ものの 数か、文字の 数です。れい：' + (list ? list + 'の数' : '「あいう」の長さ'));
      }
      if (name === 'STRING_LENGTH') {
        return Array.from(stringv(args[0])).length;
      }
      if (name === 'STRING_CHAR') {
        const arr = Array.from(stringv(args[0])),
          i = integerIndex(args[1]);
        if (i > arr.length) throw new AkariError('R404', 'その 番号の 文字は ありません。番号を たしかめてください');
        return arr[i - 1];
      }
      const nums = () => args.map((x) => numberValue(x));
      switch (name) {
        case '乱数': {
          if (args.length !== 2) throw new AkariError('R411', '「どれか」の 計算には 数を 2つ 入れます。れい：1から10のどれか');
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
          if (args.length !== 2) throw new AkariError('R411', '「あまり」には 数を 2つ 入れます。れい：あまり（10、3）');
          const unit = commonUnit(args);
          const [a, b] = nums();
          if (b === 0) throw new AkariError('R401', '0で わった あまりは 出せません。わる数を 0では ない 数に してください');
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
          if (n < 0) throw new AkariError('R402', 'マイナスの 数の「平方根」は 出せません。0か、0より 大きい 数を 入れてください');
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
          if (n < -1 || n > 1) throw new AkariError('R402', '「逆正弦」には -1〜1の 数を 入れます');
          return quantity((Math.asin(n) * 180) / Math.PI, '度');
        }
        case '逆余弦': {
          const n = numeric(args[0]);
          if (n < -1 || n > 1) throw new AkariError('R402', '「逆余弦」には -1〜1の 数を 入れます');
          return quantity((Math.acos(n) * 180) / Math.PI, '度');
        }
        case '逆正接':
          return quantity((Math.atan(numeric(args[0])) * 180) / Math.PI, '度');
        case '自然対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '「自然対数」には 0より 大きい 数を 入れます');
          return Math.log(n);
        }
        case '常用対数': {
          const n = numeric(args[0]);
          if (n <= 0) throw new AkariError('R402', '「常用対数」には 0より 大きい 数を 入れます');
          return Math.log10(n);
        }
        case '指数':
          return ensureFinite(Math.exp(numeric(args[0])));
        case '最小':
          if (!args.length) throw new AkariError('R411', '「最小」には 数を 少なくとも 1つ 入れます');
          return quantity(Math.min(...nums()), commonUnit(args));
        case '最大':
          if (!args.length) throw new AkariError('R411', '「最大」には 数を 少なくとも 1つ 入れます');
          return quantity(Math.max(...nums()), commonUnit(args));
        case '数': {
          if (args.length !== 1 || typeof args[0] !== 'string')
            throw new AkariError('R411', '数（...）には 文字を 1つ 入れます。れい：数（「12」）');
          const s = args[0];
          if (!/^[＋+－-]?[0-9]+(?:\.[0-9]+)?$/.test(s))
            throw new AkariError('R411', 'この 文字は 数に かえられません。数字だけの 文字に します。れい：「12」');
          return ensureFinite(Number(s.replace('＋', '+').replace('－', '-')));
        }
        case '文字':
          if (args.length !== 1 || Array.isArray(args[0]) || args[0] == null)
            throw new AkariError('R411', 'これは 文字に かえられません');
          return valueText(args[0], true);
        case 'つなぐ':
          if (args.length < 2) throw new AkariError('R411', '「つなぐ」には つなぐ ものを 少なくとも 2つ 入れます。れい：つなぐ（「あ」、「い」）');
          {
            const s = args
              .map((x, i) => {
                if (Array.isArray(x)) {
                  const list = ast.args[i]?.kind === 'VariableRead' ? ast.args[i].name : exampleListName(ctx);
                  throw new AkariError('R411', 'リストは そのまま 文字に つなげません。' + (list ? `「${list}の1番目」のように、` : '') + '中身を 1つずつ つなぎます');
                }
                return valueText(x, true);
              })
              .join('');
            if (cpLen(s) > LIMITS.stringChars) throw new AkariError('R413', '文字が 長すぎます');
            return s;
          }
        default:
          throw new AkariError('R411', `計算「${name}」を 使えません`);
      }
    }
    function evalSensor(ast, ctx, budget) {
      const r = ctx.runtime,
        a = ctx.runtimeId && ctx.runtimeId !== 'stage' ? r.actor(ctx.runtimeId) : null,
        s = ast.sensor;
      switch (s) {
        case '横位置':
          if (!a) throw new AkariError('R407', '「よこのばしょ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.x, '歩');
        case '縦位置':
          if (!a) throw new AkariError('R407', '「たてのばしょ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.y, '歩');
        case '方向':
          if (!a) throw new AkariError('R407', '「方向」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.direction, '度');
        case '大きさ':
          if (!a) throw new AkariError('R407', '「大きさ」は キャラクターや 部品の 動きの 中で 使います');
          return quantity(a.scalePercent, '％');
        case '衣装番号': {
          if (!a) throw new AkariError('R407', '「すがたの番号」は キャラクターの 動きの 中で 使います');
          const c = r.component(ctx.runtimeId);
          if (c?.type !== 'sprite') throw new AkariError('R406', 'すがたを えらべるのは キャラクターだけです');
          return c.costumes.findIndex((x) => x.id === a.costumeId) + 1;
        }
        case '衣装名': {
          if (!a) throw new AkariError('R407', '「すがたの名前」は キャラクターの 動きの 中で 使います');
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
        // In whole milliseconds: the browser's clock has digits below them that are only noise, and a race time a
        // child says would show them (0.773800000012秒).
        case 'タイマー':
          return quantity(Math.round(r.now() - r.startTime - r.timerOffset) / 1000, '秒');
        case '拡張の値':
          if (!Object.hasOwn(ctx.eventContext || {}, 'payload')) throw new AkariError('E705', '拡張「できごとの値」は、かくちょうの きっかけの 本文で 使ってください');
          return assertRuntimeValueLimit(ctx.eventContext.payload);
        case '答え':
          return ctx.task?.lastAnswer ?? '';
        case '音量':
          return quantity(a?.volume ?? r.stage.volume, '％');
        case '音程':
          return a?.pitch ?? r.stage.pitch;
        case 'クローンである':
          if (!a) throw new AkariError('R407', '「コピーである」は キャラクターの 動きの 中で 使います');
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
          const name = targetName(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx, 'input'));
          const c = r.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は 入力らんでは ありません`);
          const inst = r.actor(c.id);
          return inst?.inputValue ?? c.text;
        }
        case 'DISTANCE_TO':
          return quantity(r.distance(ctx.runtimeId, targetValue(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx))), '歩');
        case 'KEY_DOWN':
          return r.pressedKeys.has(stringv(evalExpression(ast.arg, ctx, budget)));
        case 'TOUCHING':
          return r.touching(ctx.runtimeId, targetValue(evalExpression(ast.arg, ctx, budget), () => partNeeded(ctx)));
        case 'TOUCHING_COLOR':
          return r.touchingColor(ctx.runtimeId, stringv(evalExpression(ast.arg, ctx, budget)));
        default:
          throw new AkariError('R411', `「${s}」を読み取れません`);
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
      if(unknown.length)parts.push('入れるものに ない 名前: '+quoted(unknown));
      if(duplicates.length)parts.push('2回 書いた 名前: '+quoted(duplicates));
      return parts.length?'（'+parts.join('。')+'）':'';
    }
    function runUserFunction(name, args, ctx, budget = null, depth = 1, argumentNames = []) {
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '自分で作ったブロックの 中で ブロックを 使うのが かさなりすぎました');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `答えを もとめる「${name}」が ありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `答えを もとめる「${name}」に 入れるものは${def.args.length}こです`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `答えを もとめる「${name}」に 入れるものの 名前が 合いません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `自分で作ったブロック「${name}」の じゅんびが できませんでした`);
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
          sig.akariCallStack = [`自分で作ったブロック ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `答えを もとめる「${name}」が 答えを 返しませんでした。答えの れい：1＋2を答えとして返す。`);
    }
    function execFunctionNodes(nodes, inheritedContext, budget, loopDepth) {
      for (const n of nodes) {
        if (n.kind === 'CommentLine') continue;
        // A nested suite changes the effective subject, never the function's self.
        const ctx = { ...inheritedContext, runtimeId: inheritedContext.runtime.resolveActorRef(
          n.actorRef, inheritedContext.functionFrame.selfRuntimeId) };
        ctx.functionFrame.currentLine = n.sourceSpan?.startLine || 1;
        if (++budget.count > LIMITS.functionOps)
          throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
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
              if (!b?.set) throw new AkariError('S301', '入れる先が ありません');
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
                throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
              for (let i = 0; i < count; i++) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
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
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
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
                throw new AkariError('R411', '「それぞれ」は リストに 使います');
              for (const v of deepCopy(arr)) {
                if (++budget.count > LIMITS.functionOps)
                  throw new AkariError('R409', '計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
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
              throw new AkariError('S305', '「答えを もとめる」の 中では、この ブロックは 使えません');
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
      if (!b || !b.set) throw new AkariError('S301', 'リストが ありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'これは リストに 使う ブロックです');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex(evalExpression(n.index, ctx, budget)) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', 'リストに 入れる 番号が 大きすぎます。番号を たしかめてください');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', '入れかえる 番号の ものが リストに ありません');
        const v = assertRuntimeValueLimit(evalExpression(n.value, ctx, budget));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', 'けす 番号の ものが リストに ありません');
        arr.splice(idx - 1, 1);
      } else if (n.kind === 'ListRemoveValue') {
        // 名人: 持ち物から「本」を全部消す — every item that is the same; none is no change.
        const v = evalExpression(n.value, ctx, budget);
        b.set(arr.filter(item => !sameValue(item, v)));
        return;
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
      if (isPart(value)) return {kind:'PartValue',value};
      return {kind:typeof value==='number'?'NumberLiteral':typeof value==='boolean'?'BooleanLiteral':'StringLiteral',value};
    }
    function* calculationCheckpoint(budget) {
      if (++budget.count > LIMITS.functionOps) throw new AkariError('R409','計算の 回数が 多すぎます。くり返しの 回数を へらしてください');
      if ((budget.count & 127) === 0) yield;
    }
    function* evalExpressionSteps(ast, ctx, budget) {
      if (ast.kind !== 'QuantityLiteral') yield* calculationCheckpoint(budget);
      if (ast.kind === 'UserFunctionCall') {
        const args=[]; for (const argument of ast.args) args.push(yield* evalExpressionSteps(argument,ctx,budget));
        return yield* runUserFunctionSteps(ast.name,args,ctx,budget,(ctx.callDepth||0)+1,ast.argumentNames||[]);
      }
      if (ast.kind === 'ActorQualifiedRead') return yield* evalExpressionSteps(ast.value,
        {...ctx,runtimeId:ast.actorRef?.kind==='value'?ctx.runtime.partRuntimeId(yield* evalExpressionSteps(ast.actorRef.value,ctx,budget)):ctx.runtime.resolveActorRef(ast.actorRef,ctx.runtimeId)},budget);
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
      if (depth > LIMITS.callDepth) throw new AkariError('R408', '自分で作ったブロックの よびだしが かさなりすぎました');
      const def = ctx.compiled.symbols.functions.get(name);
      if (!def) throw new AkariError('S301', `自分で作ったブロック「${name}」が ありません`);
      if (def.args.length !== args.length)
        throw new AkariError('S308', `計算「${name}」に 入れるものは${def.args.length}こです`+namedArgumentDetails(def.args,argumentNames));
      if (argumentNames.length) {
        if (argumentNames.length !== args.length || new Set(argumentNames).size !== argumentNames.length ||
          argumentNames.some(n => !def.args.includes(n)) || def.args.some(n => !argumentNames.includes(n)))
          throw new AkariError('S308', `計算「${name}」に 入れるものの 名前が 合いません`+namedArgumentDetails(def.args,argumentNames));
        const named = new Map(argumentNames.map((n, i) => [n, args[i]]));
        args = def.args.map(n => named.get(n));
      }
      budget = budget || { count: 0 };
      const ast = ctx.compiled.astByKey.get(`function:${def.id}`);
      if (!ast) throw new AkariError('S301', `計算「${name}」の じゅんびが できませんでした`);
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
          sig.akariCallStack = [`自分で作ったブロック ${name}`, ...(sig.akariCallStack || [])];
          sig.akariFrames = [snapshotFrame(frame, 'function'), ...(sig.akariFrames || [])];
        }
        throw sig;
      }
      throw new AkariError('S306', `計算「${name}」が 答えを 返しませんでした。答えの れい：1＋2を返す。`);
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
              if (!b?.set) throw new AkariError('S301', '入れる先が ありません');
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
                throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
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
                throw new AkariError('R411', '「それぞれ」は リストに 使います');
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
      if (!b || !b.set) throw new AkariError('S301', 'リストが ありません');
      const arr = b.get();
      if (!Array.isArray(arr)) throw new AkariError('R411', 'これは リストに 使う ブロックです');
      if (n.kind === 'ListClear') {
        b.set([]);
        return;
      }
      const idx = n.index ? integerIndex((yield* evalExpressionSteps(n.index, ctx, budget))) : null;
      if (n.kind === 'ListAppend') {
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.push(deepCopy(v));
      } else if (n.kind === 'ListInsert') {
        if (idx > arr.length + 1) throw new AkariError('R404', 'リストに 入れる 番号が 大きすぎます。番号を たしかめてください');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        if (arr.length >= LIMITS.listItems) throw new AkariError('R413', 'リストが 長すぎます');
        arr.splice(idx - 1, 0, deepCopy(v));
      } else if (n.kind === 'ListReplace') {
        if (idx > arr.length) throw new AkariError('R404', 'おきかえる 番号の ものが リストに ありません');
        const v = assertRuntimeValueLimit((yield* evalExpressionSteps(n.value, ctx, budget)));
        if (!scalar(v)) throw new AkariError('R411', 'リストへ 入れられるのは 数・文字・あてはまる／あてはまらない です');
        arr[idx - 1] = deepCopy(v);
      } else if (n.kind === 'ListDelete') {
        if (idx > arr.length) throw new AkariError('R404', 'けす 番号の ものが リストに ありません');
        arr.splice(idx - 1, 1);
      }
      b.set(arr);
    }

    // Loop pacing (EventScheduler.paceTurn): the loop frames whose turns are paced, and the statements that change the
    // screen (moving and turning, looks, text and backdrop, the pen and stamps, speech).
    const PACED_LOOP_FRAMES = new Set(['repeatCount', 'forever', 'foreach', 'while', 'until']);
    // Events that can start a body after every flow has ended: input from outside the work, and 名人's conditions and
    // intervals. The other events (start, signals, a backdrop change, a copy, a touch) start only from a running flow.
    const RESTARTING_EVENTS = new Set(['click', 'keyDown', 'valueChanged', 'conditionTrue', 'interval']);
    const PACED_SCREEN_KINDS = new Set(['MotionCommand', 'LooksCommand', 'PenCommand', 'Say']);
    // How many こま a paced flow may be behind and still catch up (EventScheduler.nextFrameTime): 100 ms.
    const PACE_CATCH_UP = 6;
    // The sentences that never move, turn or show a part or change its look or size (EventScheduler.pollWatches): after
    // them, what touches what cannot have changed.
    const STILL_KINDS = new Set(['Assignment', 'NumericUpdate', 'ListAppend', 'ListInsert', 'ListReplace', 'ListDelete', 'ListClear',
      'LocalVariableDeclaration', 'LocalListDeclaration', 'Say', 'Ask', 'WaitTime', 'WaitUntil', 'Broadcast', 'BroadcastAndWait',
      'WaitBroadcastGroup', 'SoundCommand', 'PenCommand', 'TimerReset', 'CommentLine', 'ReturnStatement', 'IfStatement', 'RepeatCount',
      'Forever', 'ForEach', 'RepeatWhile', 'RepeatUntil']);
    // The sentences that move or change only the part that does them (its subject), but for the ops that change another.
    const OWN_PART_KINDS = new Set(['MotionCommand', 'LooksCommand']);
    const OTHER_PART_OPS = new Set(['SET_TARGET_TEXT', 'SET_INPUT']);
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
        // 作品を全部止める: no later click, key, signal or change starts a body until the next start() (F-30).
        this.stoppedAll = false;
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
        // What may have moved since the ふれたとき watches last looked (pollWatches): the parts a sentence, a glide or a
        // rule moved (movedParts), or anything (geometryStamp counted up: a copy made or removed, an input, a sentence that
        // can act on other parts, and every こま).
        this.geometryStamp = 0;
        this.movedParts = new Set();
        this.pollTick = null;
        this.dueAt = -Infinity;
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
          // A 名人 move (〜まで動き続ける) keeps its speed until its statement ends it.
          if (control.temporary) continue;
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
            if (seconds <= 0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
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
          case 'up': return { x: 0, y: 1 };
          case 'down': return { x: 0, y: -1 };
          case 'forward':
          case 'backward': {
            const sign = direction === 'backward' ? -1 : 1;
            return { x: sign * cosDegrees(actor.direction), y: sign * sinDegrees(actor.direction) };
          }
          default: throw new AkariError('R411', '動く 向きが 正しくありません');
        }
      }
      // 名人: the earliest end time of a move (〜秒のあいだ…動き続ける) inside the step, or the step's own end.
      moveDeadlineWithin(from, to) {
        let end = to;
        for (const [key, control] of this.continuous) {
          const br = control.temporary ? control.task.blockReason : null;
          if (br?.kind === 'moveUntil' && br.key === key && br.deadline !== null && br.deadline > from && br.deadline < end) end = br.deadline;
        }
        return end;
      }
      // 名人: the distance of a move in this step: speed × time since it began, less what it has already moved.
      moveDistance(control, end) {
        const total = Math.round(control.speed * (end - control.startTime) / 1000 * 1e9) / 1e9, step = total - control.moved;
        control.moved = total;
        return step;
      }
      // 名人: a move ends when its time is reached, or at a clock step where its condition holds (the part stops there).
      settleMoves(at, onStep) {
        for (const [key, control] of [...this.continuous]) {
          if (!control.temporary) continue;
          const task = control.task, br = task.blockReason;
          if (br?.kind !== 'moveUntil' || br.key !== key) { this.continuous.delete(key); continue; }
          try {
            if ((br.deadline !== null && at >= br.deadline) || (onStep && br.condition && bool(evalExpression(br.condition, this.context(task, { runtimeId: br.runtimeId }))))) {
              this.continuous.delete(key);
              this.unblock(task);
            }
          } catch (err) { this.continuous.delete(key); this.taskError(task, err); }
        }
      }
      advanceContinuous(at = this.runtime.now(), refresh = true) {
        if (!this.running || this.paused || this.continuousTime === null) return;
        if (!Number.isFinite(at) || at < this.continuousTime)
          throw new AkariError('R412', '時計を 前へ もどせません');
        while (this.continuousTime < at) {
          const grid = this.continuousOrigin + this.continuousTick * (1000 / 60),
            end = this.moveDeadlineWithin(this.continuousTime, Math.min(at, grid)), seconds = (end - this.continuousTime) / 1000,
            sums = new Map();
          const entries = [], moves = [];
          let failedControl = null;
          try {
            for (const [key, control] of this.continuous) {
              const actor = this.runtime.actor(control.runtimeId);
              if (!actor) { this.continuous.delete(key); continue; }
              if (control.state !== 'ACTIVE') continue;
              failedControl = control;
              const v = this.directionVector(control.rule.direction, actor), distance = control.temporary ? this.moveDistance(control, end) : control.speed * seconds,
                dx = v.x * distance, dy = v.y * distance,
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
          for (const { actor } of moves) this.movedParts.add(actor.runtimeId);
          for (const { actor, x, y, nextX, nextY, delta } of moves) {
            actor.x = snapStep(nextX); actor.y = snapStep(nextY);
            if (actor.penDown && (delta.x || delta.y))
              this.ui.penLine?.(x, y, actor.x, actor.y, actor.penColor, actor.penSize);
          }
          this.continuousTime = end;
          // Keep position predicates on the same logical lattice as overlapping glides.
          if (this.continuous.size) {
            for (const task of this.blocked) if (task.blockReason?.kind === 'glide') {
              try { this.advanceGlide(task, task.blockReason, end); }
              catch (err) { this.taskError(task, err); break; }
            }
          }
          this.settleMoves(end, end === grid);
          if (end === grid) { this.continuousTick++; if (refresh) this.refreshContinuous(); if (this.continuous.size) this.pollWatches(end); }
          if (this.paused || !this.running) break;
        }
        if (this.continuous.size) this.ui.render?.();
      }
      inputBoundary(change) {
        this.advanceContinuous();
        this.geometryStamp++;
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
        // A key or a signal is matched here; what a touch body touches is watched (pollWatches), not matched.
        return scripts.filter((s) => s.targetId === targetId && s.event === event &&
          (s.filter == null || !['keyDown', 'message'].includes(event) || (typeof s.filter === 'object' ?
            (event === 'keyDown' ? s.filter.key : s.filter.message) : s.filter) ===
            (event === 'keyDown' ? eventContext.key : eventContext.message)));
      }
      spawnMatching(targetId, runtimeId, eventType, eventContext, waitGroupId) {
        const out = [];
        if (this.stoppedAll) return out;
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
          throw new AkariError('R413', '同時に 動いている 動きが 多すぎます。コピーや 合図を へらしてください');
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
        if (eventType === 'click') this.runtime.countEvent(runtimeId + '|click');
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
      // ふれたとき (every part's bodies and 名人), 〜になったとき and 〜秒ごとに (名人) are watched on the scheduler's clock:
      // after every sentence of every flow and at every こま. A body started by a change (ふれたとき, 〜になったとき)
      // starts at most once in a こま for the same part (for 画面のはし: for each side); started keeps the こま of the last
      // start, so a change back and forth inside that こま (かくして また見せる, a turn that flips the box) is only recorded.
      initializeWatches() {
        this.watches = [];
        for (const item of this.compiled.items || []) {
          if (!item.key.startsWith('script:') || !['touchStart', 'conditionTrue', 'interval'].includes(item.event)) continue;
          const targetId = item.targetId || item.ownerId, scriptId = item.key.slice('script:'.length);
          const task = { taskId: `watch:${item.key}`, scriptId, runtimeId: targetId, targetId, eventType: item.event, eventContext: {},
            subject: { runtimeId: targetId }, callFrames: [], execStack: [], broadcastGroups: new Map(), state: 'RUNNING', currentNode: item.ast.body?.[0] };
          const watch = { item, targetId, scriptId, event: item.event, task, last: new Map(), started: new Map() };
          if (item.event === 'interval') {
            try {
              watch.period = numberInUnit(evalExpression(item.ast.heading.seconds, this.context(task)), '秒');
              if (!(watch.period > 0)) throw new AkariError('R412', '「〜秒ごとに」の 時間は 0より 大きく します');
            } catch (err) { this.taskError(task, err); return; }
            watch.nextAt = ensureFinite(this.runtime.now() + watch.period * 1000);
          }
          this.watches.push(watch);
        }
      }
      pollWatches(now = this.runtime.now()) {
        if (!this.running || this.paused || !this.watches?.length) return;
        // At every こま the touch watches look at every part again, whatever moved it.
        const tick = Math.floor((now - (this.continuousOrigin ?? 0)) / (1000 / 60) + 1e-9);
        if (tick !== this.pollTick) { this.pollTick = tick; this.geometryStamp++; }
        const all = this.geometryStamp !== this.touchStamp, moved = all ? null : this.movedParts.size ? [...this.movedParts] : [];
        this.touchStamp = this.geometryStamp;
        this.movedNow = this.movedParts;
        this.movedParts = new Set();
        for (const w of this.watches) {
          try {
            if (w.event === 'interval') {
              // A new run each time, even while the last one still runs.
              for (let guard = 0; now >= w.nextAt && guard < 100; guard++) { this.spawnWatch(w, w.targetId); w.nextAt += w.period * 1000; }
            } else if (w.event === 'conditionTrue') {
              const value = bool(evalExpression(w.item.ast.heading.condition, this.context(w.task)));
              if (value && !w.last.get(w.targetId) && w.started.get(w.targetId) !== tick) {
                w.started.set(w.targetId, tick);
                this.spawnWatch(w, w.targetId);
              }
              w.last.set(w.targetId, value);
            } else {
              // ふれたとき starts when not touching becomes touching. The first look at a part (the run's start, a new
              // copy) only records it: a part that already touches starts after it has left and touched again. Every copy
              // is looked at on its own; a hidden part touches nothing, so showing it where it touches is a change.
              // A part is looked at again only when it or what it touches has moved, turned, or changed its look, size or
              // whether it is seen since its last look (the answer cannot have changed otherwise).
              if (moved && !moved.length) continue;
              const target = w.item.filter.target, partners = this.touchPartners(target), partnersMoved = !samePoses(w.partners, partners);
              w.partners = partners;
              w.poses ||= new Map();
              // Only the parts that moved need a look (in the order of all parts), unless what they touch moved too.
              const parts = moved && !partnersMoved
                ? moved.length === 1 ? [this.runtime.actor(moved[0])].filter(a => a?.baseId === w.targetId)
                  : [...this.runtime.actors.values()].filter(a => a.baseId === w.targetId && this.movedNow.has(a.runtimeId))
                : [...this.runtime.actors.values()].filter(a => a.baseId === w.targetId);
              for (const a of parts) {
                const kept = w.poses.get(a.runtimeId);
                if (!partnersMoved && kept && sameWatchPose(kept, a)) continue;
                w.poses.set(a.runtimeId, watchPose(a));
                // 画面のはし watches the four sides one by one: a side that goes from not touched to touched starts it
                // (also while another side stays touched, as for a ball that bounced off the right side and goes on into
                // the top one near a corner), and two sides touched at once start it once.
                if (target === '端') {
                  const sides = EDGE_SIDES.filter(side => this.runtime.touching(a.runtimeId, side)), before = w.last.get(a.runtimeId),
                    fresh = before ? sides.filter(side => !before.includes(side) && w.started.get(a.runtimeId + '|' + side) !== tick) : [];
                  for (const side of fresh) w.started.set(a.runtimeId + '|' + side, tick);
                  if (fresh.length) this.spawnWatch(w, a.runtimeId);
                  w.last.set(a.runtimeId, sides);
                  continue;
                }
                const touching = this.runtime.touching(a.runtimeId, target);
                if (touching && w.last.has(a.runtimeId) && !w.last.get(a.runtimeId) && w.started.get(a.runtimeId) !== tick) {
                  w.started.set(a.runtimeId, tick);
                  this.spawnWatch(w, a.runtimeId);
                }
                w.last.set(a.runtimeId, touching);
              }
            }
          } catch (err) {
            this.watches = this.watches.filter(x => x !== w);
            this.taskError(w.task, err);
            return;
          }
        }
      }
      // What a ふれたとき watch's answers depend on besides the part itself: the mouse, the parts of that name (and their
      // copies), or nothing (the screen's sides do not move).
      touchPartners(target) {
        if (isEdgeTarget(target)) return [];
        if (target === 'マウス') return [{ x: this.runtime.mouseX, y: this.runtime.mouseY, entered: this.runtime.mouseAt.entered }];
        return this.runtime.targetsOf(target).map(watchPose);
      }
      spawnWatch(watch, runtimeId) {
        const task = this.createTask(watch.targetId, runtimeId, watch.event, {}, null, watch.scriptId);
        if (task) this.enqueue(task);
      }
      spawnDistributed(eventType, eventContext = {}, waitGroupId = null, only = null) {
        const out = [];
        for (const rid of this.orderedRuntimeIds()) {
          if (only && !only.has(rid)) continue;
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
              if (task) this.taskError(task, new AkariError('E708', 'かくちょうからの 合図が 多すぎて、うけとりきれません'));
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
        this.stoppedAll = false;
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
        this.initializeWatches();
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
        this.watches = [];
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
      // Nothing goes on now: no flow runs, waits or is queued, no continuous rule is kept, no question is open, and no
      // extension event or answer waits to be taken in. A body may still start again (ended).
      idle() {
        return !(!this.running || this.tasks.size || this.ready.length || this.continuous.size || this.questionQueue.length ||
          this.activeQuestion || this.extensionEvents?.length || this.extensionCompletions?.length);
      }
      // The run has ended by itself: it is idle, and no body can start again (none waits for input, a 名人 condition or
      // interval, or a registered extension event while the extensions run). An extension that is only registered, and
      // an unregistered 「拡張:…」 name (an ordinary signal of the work), keep nothing going.
      ended() {
        return this.idle() && !(this.compiled.items || []).some(item => RESTARTING_EVENTS.has(item.event) || this.waitsForExtension(item));
      }
      // A body for an event that a running extension registered: the event comes from outside the work, as a key does
      // (the editor's status names its 合図).
      waitsForExtension(item) {
        const name = String((item.filter && typeof item.filter === 'object' ? item.filter.message : item.filter) ?? '');
        return extensions.active && item.event === 'message' && name.startsWith('拡張:') && !!extensions.describe(name.slice(3), 'events');
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
        const wake = () => {
          this.loopTimer = null;
          this.loopScheduled = false;
          this.loop();
        };
        // A wake on the channel cannot be taken back: one that pause, stop or an earlier wake has let go of
        // (loopTimer is no longer its own) does nothing.
        if (delay <= 0 && wakeSoon) {
          const token = (this.loopTimer = { soon: true });
          wakeSoon(() => { if (this.loopTimer === token) wake(); });
        } else this.loopTimer = setTimeout(wake, delay);
      }
      loop() {
        if (!this.running || this.paused) return;
        this.inLoop = true;
        const started = nowMs();
        let count = 0;
        try {
          // A slice runs for at most 8 ms. The count only bounds a slice when the clock does not move (a test's clock);
          // it is large enough for 300 paced copies to take their turn at every こま (final call 17). The flows that
          // waited for this time (a paced loop's こま, a wait that ends) become ready when the waits are looked at
          // (recheckBlocked): their turns run once more in this same wake, not one wake later.
          for (let pass = 0; pass < 2; pass++) {
            while (
              this.running &&
              !this.paused &&
              this.ready.length &&
              count < 2000 &&
              nowMs() - started < 8
            ) {
              this.runTurn(false);
              count++;
            }
            this.recheckBlocked();
            if (!this.ready.length || count >= 2000 || nowMs() - started >= 8) break;
          }
        } finally {
          this.inLoop = false;
        }
        if (this.running && !this.paused) {
          if (this.ready.length) this.schedule();
          else if (
            this.continuous.size || this.watches?.length || [...this.blocked].some((t) =>
              ['time', 'condition', 'glide', 'calculation'].includes(t.blockReason?.kind),
            )
          )
            this.schedule(this.wakeDelay());
        }
      }
      // A part speaks until its timed speech ends (名人: ねこが話し終わるまで待つ).
      speaking(runtimeId) {
        for (const t of this.blocked) if (t.blockReason?.speechToken && t.blockReason.runtimeId === runtimeId) return true;
        return false;
      }
      // 名人: 犬と鳥に「出発」と知らせる — the runtime ids of the parts (a list of parts counts each).
      targetRuntimeIds(targets, ctx) {
        const ids = new Set();
        for (const target of targets) {
          const value = evalExpression(target, ctx);
          for (const part of Array.isArray(value) ? partList(value) : [value]) {
            if (!isPart(part)) throw new AkariError('R411', '知らせる 相手には 部品を 書きます');
            ids.add(part.part);
          }
        }
        return ids;
      }
      context(task, extra = {}) {
        return {
          runtime: this.runtime,
          scheduler: this,
          compiled: this.compiled,
          task,
          runtimeId: task.subject?.runtimeId || task.callFrames.at(-1)?.runtimeId || task.runtimeId,
          eventContext: task.eventContext,
          ...extra,
        };
      }
      selectSubject(task, node) {
        const relative = task.callFrames.at(-1)?.runtimeId || task.runtimeId;
        if (node?.actorRef?.kind === 'value') {
          task.subject = { runtimeId: this.runtime.partRuntimeId(evalExpression(node.actorRef.value, this.context(task))) };
          return;
        }
        task.subject = { runtimeId: this.runtime.resolveActorRef(node.actorRef, relative) };
      }
      // A turn of a loop that changed the screen (a part moved, turned or changed its looks, text, pen or speech) and
      // waited nowhere: the flow waits for the next こま of the logical clock (1/60 s, the grid of the continuous rules)
      // before it goes on, whatever comes next (the next turn, or the sentence after the loop), so the motion shows
      // without a wait sentence. A turn that only calculates goes on at once. Each loop frame keeps its own turn's
      // marks; a lane marks the loops of the flow it belongs to. Not while stepping.
      paceTurn(task, top) {
        if (top.visual && !top.waited && !top.yielded && !this.paused) {
          top.yielded = true;
          task.execStack.push({ type: 'frameYield', node: top.node });
          return true;
        }
        top.visual = top.waited = top.yielded = false;
        return false;
      }
      // A 〜まで／〜あいだ loop reads its condition when the loop is reached and once before each next turn, after the
      // こま's wait of a paced turn (normalizeStack), at the flow's own turn.
      enterLoopTurn(task, frame) {
        frame.visual = frame.waited = frame.yielded = false;
        this.enterBody(task, frame.node.body);
      }
      markTurn(task, mark) {
        for (let t = task; t; t = t.laneParent)
          for (const frame of t.execStack) if (PACED_LOOP_FRAMES.has(frame.type)) frame[mark] = true;
      }
      // The こま a paced turn waits for. A flow that waited for こま k waits next for こま k+1, also when the page woke
      // after it: a late wake runs the turns that are due at once, so the speed stays that of the logical clock (1秒に
      // 300歩 for 5歩 a turn). A flow further behind (a page that stopped for a while) starts again from the next こま,
      // so it does not run a long burst of turns. Any other wait ends the chain (block).
      nextFrameTime(task) {
        const grid = 1000 / 60, origin = this.continuousOrigin ?? 0,
          tick = Math.floor((this.runtime.now() - origin) / grid + 1e-9) + 1,
          next = task.paceTick != null && task.paceTick + 1 > tick - PACE_CATCH_UP ? task.paceTick + 1 : tick;
        task.paceTick = next;
        return origin + next * grid;
      }
      // When the loop sleeps: at the end of the next wait that ends within a こま (the next こま of a paced loop), so
      // the wake is not just before it; otherwise in 16 ms, to look at the conditions, glides and rules again.
      wakeDelay() {
        let due = Infinity;
        for (const t of this.blocked) if (t.blockReason?.kind === 'time') due = Math.min(due, t.blockReason.deadline);
        const delay = Math.ceil(due - this.runtime.now());
        return delay <= 17 ? Math.max(0, delay) : 16;
      }
      normalizeStack(task) {
        let guard = 0;
        while (task.execStack.length && guard++ < 1000) {
          const top = task.execStack[task.execStack.length - 1];
          if (top.type === 'frameYield') return top;
          if (top.type === 'seq') {
            if (top.index < top.nodes.length) return top;
            task.execStack.pop();
            continue;
          }
          if (top.type === 'callBoundary') {
            task.execStack.pop();
            const finishedFrame = task.callFrames.pop();
            this.runtime.countEvent(finishedFrame.runtimeId + '|action|' + finishedFrame.name);
            for (const id of finishedFrame.broadcastGroups?.values() || []) this.waitGroups.delete(id);
            continue;
          }
          if (top.type === 'repeatCount') {
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
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
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            task.execStack.push({ type: 'seq', nodes: top.node.body, index: 0 });
            if (!top.node.body.some((n) => n.kind !== 'CommentLine'))
              return { type: 'idle', node: top.node };
            continue;
          }
          if (top.type === 'foreach') {
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
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
          if (top.type === 'while' || top.type === 'until') {
            // A paced turn waits for the next こま first; then the condition is read once, at this flow's own turn
            // (くり返しと画面の動き), after the flows earlier in the order have taken that こま's steps. A body with no
            // sentence, and a condition calculated a little at a time, keep the check as a step of its own.
            if (this.paceTurn(task, top)) return task.execStack.at(-1);
            const condition = top.condition || top.node.condition;
            if (!top.node.body.some((n) => n.kind !== 'CommentLine') ||
              (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(condition))) return top;
            this.selectSubject(task, top.node);
            const v = bool(evalExpression(condition, this.context(task)));
            if (top.type === 'while' ? v : !v) this.enterLoopTurn(task, top);
            else task.execStack.pop();
            continue;
          }
          break;
        }
        if (guard >= 1000) throw new AkariError('R413', 'くり返しが 多すぎて 先に すすめません');
        return task.execStack[task.execStack.length - 1] || null;
      }
      nextStep(task) {
        const top = this.normalizeStack(task);
        if (!top) return null;
        if (top.type === 'idle') return { kind: 'idle', node: top.node };
        if (top.type === 'frameYield') { task.execStack.pop(); return { kind: 'frameYield', node: top.node }; }
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
          // The pacing of a loop (paceTurn): the next turn waits for the next こま.
          if (step.kind === 'frameYield') {
            this.block(task, { kind: 'time', deadline: this.nextFrameTime(task), frame: true });
            this.recheckBlocked(force);
            return true;
          }
          this.selectSubject(task, step.node);
          if (this.awaitHold(task, step)) {
            this.recheckBlocked(force);
            return true;
          }
          task.currentNode = step.node;
          const frame = task.callFrames.at(-1);
          if (frame) frame.currentLine = step.node.sourceSpan?.startLine || 1;
          if (step.kind !== 'idle') this.ui.beforeStatement?.(task, step.node);
          if (step.kind === 'node') this.executeNode(task, step.node);
          else if (step.kind === 'loopHeader') this.executeLoopHeader(task, step.frame);
          if (step.kind === 'node') this.markMoved(task, step.node);
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
      // After a sentence, what it may have moved, for the ふれたとき watches (pollWatches): a sentence that acts only on
      // its own part marks that part; any other sentence that is not still, everything.
      markMoved(task, node) {
        if (STILL_KINDS.has(node.kind)) return;
        const own = OWN_PART_KINDS.has(node.kind) && !node.laneRef && node.actorRef?.kind !== 'all' && !OTHER_PART_OPS.has(node.op) && this.runtime.actor(task.subject?.runtimeId);
        if (own) this.movedParts.add(own.runtimeId); else this.geometryStamp++;
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
          if (reason.loopFrame.type==='while'?keep:!keep) this.enterLoopTurn(task,reason.loopFrame);
          else task.execStack.pop();
        } else { this.executePreparedNode(task,outcome.value,reason.originalNode); this.markMoved(task,reason.originalNode); }
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
        if (seconds<=0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
        return ensureFinite(distance/seconds);
      }

      executeLoopHeader(task, frame) {
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && this.prepareCooperativeNode(task, frame.node, frame)) return;
        const v = bool(evalExpression(frame.condition || frame.node.condition, this.context(task)));
        const keep = frame.type === 'while' ? v : !v;
        if (keep) this.enterLoopTurn(task, frame);
        else task.execStack.pop();
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
        if (PACED_SCREEN_KINDS.has(n.kind)) this.markTurn(task, 'visual');
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
          case 'TimerReset':
            this.runtime.timerOffset = this.runtime.now() - this.runtime.startTime;
            return;
          case 'NoOperation':
            return;
          case 'Assignment':
            this.runtime.writeTarget(n.target, evalExpression(n.value, ctx), ctx);
            this.ui.render?.();
            return;
          case 'NumericUpdate': {
            const b = this.runtime.resolveBinding(n.target.name, n.target.qualifier, ctx);
            if (!b?.set) throw new AkariError('S301', `入れる先「${n.target.name}」が ありません`);
            const cur = b.get(),
              v = evalExpression(n.value, ctx);
            if (Array.isArray(cur)) throw new AkariError('R411', 'これは 数の へんすうに 使う ブロックです');
            this.runtime.writeTarget(n.target, addNumericUpdate(cur, v, n.op), ctx, {resolvedBinding: b});
            this.ui.renderMonitor?.();
            return;
          }
          case 'ListAppend':
          case 'ListInsert':
          case 'ListReplace':
          case 'ListDelete':
          case 'ListClear':
          case 'ListRemoveValue':
            execListMutation(n, ctx);
            this.ui.renderMonitor?.();
            return;
          case 'IfStatement':
            this.enterBody(task, bool(evalExpression(n.condition, ctx)) ? n.thenBody : n.elseBody);
            return;
          case 'RepeatCount': {
            const count = numberInUnit(evalExpression(n.count, ctx), '回');
            if (!Number.isSafeInteger(count) || count < 0 || count > LIMITS.repeatCount)
              throw new AkariError('R413', 'くり返す 回数は 0、1、2 のような 数に します。マイナスや 小数、大きすぎる 数は 使えません');
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
            // Counts (〜が3回おされるまで) are compared with those when the repeat began.
            const condition = hasEventCount(originalNode.condition) ? this.runtime.bindEventCounts(originalNode.condition, ctx) : null;
            const v = bool(evalExpression(condition || n.condition, ctx));
            if (!v) {
              task.execStack.push({ type: 'until', node: originalNode, ...(condition ? { condition } : {}) });
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
            if (!Array.isArray(arr)) throw new AkariError('R411', '「それぞれ」は リストに 使います');
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
            if (sec < 0) throw valueError('R412', '待つ 時間は 0より 小さく できません', n.seconds);
            if (sec === 0) return;
            const deadline = ensureFinite(this.runtime.now() + sec * 1000);
            if (!everyoneStatement(n)) { this.hold(task, { kind: 'time', deadline }); return; }
            this.block(task, { kind: 'time', deadline });
            return { requeue: false };
          }
          case 'WaitUntil': {
            // Counts (〜が10回【ジャンプ】するまで) are compared with those when the wait began.
            const condition = hasEventCount(originalNode.condition) ? this.runtime.bindEventCounts(originalNode.condition, ctx) : originalNode.condition;
            if (bool(evalExpression(condition === originalNode.condition ? n.condition : condition, ctx))) return;
            if (!everyoneStatement(n)) { this.hold(task, { kind: 'condition', condition }); return; }
            this.block(task, { kind: 'condition', condition });
            return { requeue: false };
          }
          case 'Say': {
            const v = evalExpression(n.value, ctx);
            if (Array.isArray(v)) {
              const list = n.value?.kind === 'VariableRead' ? n.value.name : exampleListName(ctx);
              throw new AkariError('R411', list ? `リストは そのまま 言えません。中身を 言うときは「${list}の1番目を言う」のように 書きます` : 'リストは そのまま 言えません。中身を 1つずつ 言います');
            }
            const sec = n.seconds === undefined ? null : numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec !== null && sec < 0) throw valueError('R412', '話す 時間は 0より 小さく できません', n.seconds);
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
            const msg = stringv(evalExpression(n.message, ctx)), only = n.targets ? this.targetRuntimeIds(n.targets, ctx) : null;
            const ref = n.broadcastRef || n.groupId;
            const references = task.callFrames.at(-1)?.broadcastGroups || task.broadcastGroups;
            if (ref) {
              const old = references.get(ref);
              if (old) this.waitGroups.delete(old);
              const wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set(), ref, references };
              references.set(ref, wg.id);
              this.waitGroups.set(wg.id, wg);
              this.spawnDistributed('message', { message: msg }, wg.id, only);
              if (!wg.pending.size) { references.delete(ref); this.waitGroups.delete(wg.id); }
            } else this.spawnDistributed('message', { message: msg }, null, only);
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
            const msg = stringv(evalExpression(n.message, ctx)), only = n.targets ? this.targetRuntimeIds(n.targets, ctx) : null,
              wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set() };
            this.waitGroups.set(wg.id, wg);
            const ts = this.spawnDistributed('message', { message: msg }, wg.id, only);
            if (ts.length) {
              if (!everyoneStatement(n)) { this.hold(task, { kind: 'waitGroup', waitGroupId: wg.id }); return; }
              this.block(task, { kind: 'waitGroup', waitGroupId: wg.id });
              return { requeue: false };
            }
            this.waitGroups.delete(wg.id);
            return;
          }
          case 'Parallel':
            return this.startLanes(task, n.lanes.map(nodes => ({ nodes, binder: null })));
          case 'ParallelEach': {
            // The limit is checked before any lane starts (startLanes); then every member must be a part.
            const values = evalExpression(n.list, ctx);
            if (!Array.isArray(values)) throw new AkariError('R411', '「みんな」は 部品の あつまりに 使います');
            if (this.tasks.size + values.length <= LIMITS.activeTasks) partList(values);
            return this.startLanes(task, values.map(value => ({ nodes: n.body, binder: { name: n.binder, value } })));
          }
          // 名人: 【…】という手順を、次のように作る only registers the procedure.
          case 'ActionDefinition':
            return;
          // 10秒のあいだ、くり返す: each round begins only while the time from the start has not passed.
          case 'TimedRepeat': {
            const sec = numberInUnit(evalExpression(n.seconds, ctx), '秒');
            if (sec < 0) throw new AkariError('R412', 'くり返す 時間は 0より 小さく できません');
            if (sec > 0) {
              task.execStack.push({ type: 'while', node: originalNode, condition: { kind: 'DeadlineBound', deadline: ensureFinite(this.runtime.now() + sec * 1000) } });
              this.enterBody(task, n.body);
            }
            return;
          }
          // ねこは、1秒に20歩の速さで、ゴールにふれるまで前へ動き続ける (or for a time): on the clock of the continuous rules.
          case 'MoveUntil': {
            const actor = this.runtime.requireActor(ctx),
              seconds = numberInUnit(evalExpression(n.seconds, ctx), '秒'),
              distance = numberInUnit(evalExpression(n.distance, ctx), '歩');
            if (seconds <= 0) throw new AkariError('R412', '速さの 時間は 0より 大きく します');
            const condition = n.condition ? (hasEventCount(n.condition) ? this.runtime.bindEventCounts(n.condition, ctx) : n.condition) : null;
            const deadline = n.duration ? ensureFinite(this.runtime.now() + numberInUnit(evalExpression(n.duration, ctx), '秒') * 1000) : null;
            if ((condition && bool(evalExpression(condition, ctx))) || (deadline !== null && deadline <= this.runtime.now())) return;
            this.directionVector(n.direction, actor);
            this.advanceContinuous();
            const key = `move:${task.taskId}:${++this.waitSeq}`;
            this.continuous.set(key, { rule: { id: key, direction: n.direction }, runtimeId: ctx.runtimeId, task, state: 'ACTIVE', speed: ensureFinite(distance / seconds), temporary: true, startTime: this.continuousTime, moved: 0 });
            this.block(task, { kind: 'moveUntil', key, condition, deadline });
            return { requeue: false };
          }
          case 'UserActionCall':
            this.callAction(task, n, ctx);
            return;
          case 'LocalVariableDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけの へんすうは 自分で作ったブロックの 中でだけ 作れます');
            f.locals.set(n.name, localScalar(evalExpression(n.initial, ctx)));
            return;
          }
          case 'LocalListDeclaration': {
            const f = task.callFrames[task.callFrames.length - 1];
            if (!f) throw new AkariError('S313', 'この中だけの リストは 自分で作ったブロックの 中でだけ 作れます');
            f.localLists.set(n.name, []);
            return;
          }
          case 'ReturnStatement':
            throw new AkariError('S307', '「〜を返す」は「答えを もとめる」の 中でだけ 使えます');
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
            throw new AkariError('P201', `まだ 動かせない 文 ${n.kind}`);
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
        if (!def) throw new AkariError('S301', `てじゅん「${n.name}」が ありません`);
        if (task.callFrames.length + 1 > LIMITS.callDepth)
          throw new AkariError('R408', '自分で作ったブロックの よびだしが かさなりすぎました');
        if (def.args.length !== n.args.length)
          throw new AkariError('S308', `てじゅん「${n.name}」に 入れるものは${def.args.length}こです`+namedArgumentDetails(def.args,n.argumentNames));
        const sourceValues = n.args.map((x) => deepCopy(evalExpression(x, ctx)));
        const names = n.argumentNames || [];
        if (names.length && (names.length !== def.args.length || new Set(names).size !== names.length ||
            names.some((name) => !def.args.includes(name))))
          throw new AkariError('S308', '入れるものの 名前が 合いません');
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
      startLanes(task, lanes) {
        if (this.tasks.size + lanes.length > LIMITS.activeTasks)
          throw new AkariError('R413', '同時に 動いている 動きが 多すぎます。コピーや 合図を へらしてください');
        const wg = { id: `wait-${++this.waitSeq}`, sender: task, pending: new Set() };
        this.waitGroups.set(wg.id, wg);
        const binders = [...(task.inheritedBinders || [])];
        for (let i = task.execStack.length - 1; i >= 0 && task.execStack[i].type !== 'callBoundary'; i--)
          if (task.execStack[i].binder) binders.unshift(task.execStack[i].binder);
        for (const lane of lanes) {
          if (!lane.nodes.some(x => x.kind !== 'CommentLine')) continue;
          const child = {
            taskId: `task-${++this.seq}`, scriptId: task.scriptId, subject: { ...task.subject },
            broadcastGroups: new Map(), targetId: task.targetId, runtimeId: task.runtimeId,
            eventType: task.eventType, eventContext: { ...task.eventContext }, lastAnswer: task.lastAnswer,
            // Frames are shared, so a lane reads and writes the same この中だけ variables as its flow.
            callFrames: [...task.callFrames],
            inheritedBinders: lane.binder ? [...binders, lane.binder] : binders,
            execStack: [{ type: 'seq', nodes: lane.nodes, index: 0 }],
            state: 'READY', waitGroupId: wg.id, createdSequence: this.seq, error: null,
            laneParent: task, laneRoot: task.laneRoot || task,
          };
          this.tasks.set(child.taskId, child);
          wg.pending.add(child.taskId);
          this.enqueue(child);
        }
        if (!wg.pending.size) { this.waitGroups.delete(wg.id); return; }
        this.block(task, { kind: 'waitGroup', waitGroupId: wg.id, lanes: true });
        return { requeue: false };
      }
      block(task, reason) {
        // A wait of the flow (a time, a condition, a glide, an answer, a sound, a signal's work) is a wait of every loop
        // turn it is in. A frame of the pacing, a calculation step and the wait for the flow's own lanes are not.
        if (!reason.frame && reason.kind !== 'calculation' && !reason.lanes) this.markTurn(task, 'waited');
        if (!reason.frame && reason.kind !== 'calculation') task.paceTick = null;
        // A こま's wait shows every change made so far: a loop around it waits again only for changes made after it.
        if (reason.frame)
          for (let t = task; t; t = t.laneParent) for (const frame of t.execStack) if (PACED_LOOP_FRAMES.has(frame.type)) frame.visual = false;
        if (reason.kind !== 'time' || !(reason.deadline >= this.dueAt)) this.dueAt = -Infinity;
        task.state = 'BLOCKED';
        task.blockReason = { runtimeId: task.subject?.runtimeId || task.runtimeId, ...reason };
        this.blocked.add(task);
      }
      // A part's wait: the flow goes on; the part's next statement in this flow waits (awaitHold).
      hold(task, reason) {
        const runtimeId = task.subject?.runtimeId || task.runtimeId;
        (task.holds ||= new Map()).set(runtimeId, { runtimeId, ...reason });
        if (reason.kind === 'condition') this.conditionHolds = true;
      }
      holdOver(task, hold) {
        if (hold.kind === 'time') return this.runtime.now() >= hold.deadline;
        if (hold.kind === 'waitGroup') return !this.waitGroups.get(hold.waitGroupId)?.pending.size;
        // A condition with the user's own calculations is stepped while blocked, like any wait.
        if (LIMITS.functionOps !== STANDARD_LIMITS.functionOps && hasUserFunction(hold.condition)) return false;
        return bool(evalExpression(hold.condition, this.context(task, { runtimeId: hold.runtimeId })));
      }
      // Before a statement of a held part runs, the flow waits for the rest of that part's wait.
      // 名人: a sentence of the part carried on (laneRef) that acts on another part waits for the carried part's wait.
      awaitHold(task, step) {
        const lane = step.node?.laneRef && (step.node.laneRef.kind === 'value' ? this.runtime.partRuntimeId(evalExpression(step.node.laneRef.value, this.context(task))) : this.runtime.resolveActorRef(step.node.laneRef, task.callFrames.at(-1)?.runtimeId || task.runtimeId));
        const runtimeId = lane && task.holds?.get(lane) ? lane : task.subject?.runtimeId, hold = runtimeId && task.holds?.get(runtimeId);
        if (!hold || step.kind === 'idle' || everyoneStatement(step.node)) return false;
        task.holds.delete(runtimeId);
        if (this.holdOver(task, hold)) return false;
        if (step.kind === 'node') task.execStack[task.execStack.length - 1].index--;
        task.currentNode = step.node;
        const reason = { ...hold };
        delete reason.runtimeId;
        this.block(task, reason);
        return true;
      }
      // A condition that comes true ends its hold then, even if it is false again when the part's statement comes.
      // A part's wait for a condition ends when it holds; with no such wait (conditionHolds), nothing is looked at.
      pollHolds() {
        if (!this.conditionHolds) return;
        let left = false;
        for (const task of this.tasks.values()) {
          if (!task.holds?.size || ['CANCELLED', 'DONE', 'ERROR'].includes(task.state)) continue;
          for (const [runtimeId, hold] of task.holds) {
            if (hold.kind !== 'condition') continue;
            try { if (this.holdOver(task, hold)) task.holds.delete(runtimeId); else left = true; }
            catch (err) { this.taskError(task, err); left = true; break; }
          }
        }
        this.conditionHolds = left;
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
              this.movedParts.add(br.runtimeId);
              const p = clamp((now - br.startTime) / br.duration, 0, 1),
                a = this.runtime.actor(br.runtimeId);
              if (!a) throw new AkariError('R405', '動かす キャラクターや 部品が 見つかりません');
              // 〇秒かけて、右に90度回る: the direction goes from where it started by the part of the turn; what else
              // turned the part meanwhile is kept, as for a move.
              if (br.turn !== undefined) {
                const next = br.startDirection + br.turn * p, written = normalizeDirection(br.lastDirection),
                  turned = ((a.direction - written) % 360 + 540) % 360 - 180, other = Math.abs(turned) <= 1e-9 ? 0 : turned;
                a.direction = normalizeDirection(snapStep(normalizeDirection(ensureFinite(next + other))));
                br.lastDirection = next;
                this.ui.render?.();
                return;
              }
              if (a) {
                const nx = ensureFinite(br.startX * (1 - p) + br.targetX * p),
                  ny = ensureFinite(br.startY * (1 - p) + br.targetY * p);
                // What else moved the part during the glide is kept; the rounding left by adding the steps is not
                // (the move ends on its end point: よこ7歩 is 7, not 6.999999999999591).
                const moved = (at, last, next) => { const d = at - last; return Math.abs(d) <= 1e-9 * Math.max(1, Math.abs(next)) ? 0 : d; };
                const actualX = snapStep(ensureFinite(nx + moved(a.x, br.lastX, nx))),
                  actualY = snapStep(ensureFinite(ny + moved(a.y, br.lastY, ny)));
                if (a.penDown && (br.lastX !== nx || br.lastY !== ny))
                  this.ui.penLine?.(a.x, a.y, actualX, actualY, a.penColor, a.penSize);
                a.x = actualX;
                a.y = actualY;
                br.lastX = nx;
                br.lastY = ny;
                this.ui.render?.();
              }
      }
      recheckBlocked(force = false) {
        if (this.running && (!this.paused || force)) {
          for (const complete of (this.extensionCompletions || []).splice(0)) { this.geometryStamp++; complete(); }
          for (const event of (this.extensionEvents || []).splice(0))
            this.spawnDistributed('message', { message: '拡張:' + event.name, payload: event.payload });
        }
        if (!this.running || (this.paused && !force)) return;
        this.advanceContinuous();
        this.drainExternalUnblocks();
        this.pollWatches();
        this.pollHolds();
        const now = this.runtime.now();
        // While every blocked flow waits for a time not yet reached (paced loops between こま), nothing is due; the
        // earliest such time is kept (dueAt) until a flow blocks again (block).
        if (now < this.dueAt) return;
        let due = false, next = Infinity;
        for (const t of this.blocked) {
          const br = t.blockReason;
          if (!br) continue;
          if (br.kind !== 'time' || now >= br.deadline) { due = true; break; }
          next = Math.min(next, br.deadline);
        }
        if (!due) { this.dueAt = next; return; }
        this.dueAt = -Infinity;
        const arr = [...this.blocked].sort((a, b) => a.createdSequence - b.createdSequence);
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
            else if (br.kind === 'moveUntil') {
              // Settled on the clock (settleMoves); a move whose control is gone has ended.
              if (!this.continuous.has(br.key)) this.unblock(t);
            }
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
          this.taskError(q.task, new AkariError('R413', '答えの 文字が 長すぎます'));
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
        // 名人: copies made in a lane are the copies the flow made (できたコピー after the lanes).
        if (state === 'DONE' && task.laneParent && task.createdCopies?.length) task.laneParent.createdCopies = [...(task.laneParent.createdCopies || []), ...task.createdCopies];
        // 名人: ねこと犬は1秒待つ — each lane's part waits; that wait goes on in the flow that started the lanes, so the
        // part's next sentence there waits for it (as after ねこは1秒待つ in one flow).
        if (state === 'DONE' && task.laneParent && task.holds?.size)
          for (const [runtimeId, hold] of task.holds) {
            const parent = (task.laneParent.holds ||= new Map()), held = parent.get(runtimeId);
            if (!(held?.kind === 'time' && hold.kind === 'time' && held.deadline >= hold.deadline)) parent.set(runtimeId, hold);
          }
        task.state = state;
        this.blocked.delete(task);
        for (const [key, control] of this.continuous) if (control.temporary && control.task === task) this.continuous.delete(key);
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
        if (['DONE', 'CANCELLED', 'ERROR'].includes(state))
          for (const t of [...this.tasks.values()]) if (t.laneParent === task) this.cancelTask(t);
        task.broadcastGroups?.clear();
        for (const frame of task.callFrames) frame.broadcastGroups?.clear();
        this.ui.renderMonitor?.();
      }
      // Whose body a flow is and its きっかけ, by the words the child sees: the part (the part a copy was made from), the
      // screen, or the 名人の本文, and the heading as the body selector names it (「星」に ふれたとき); never an internal id.
      ownerName(task, item = null) {
        const id = task.targetId;
        if (item?.meijin || id === 'meijin') return '名人の本文';
        if (id === 'stage') return this.project.stage?.name || '画面';
        const c = this.project.components.find(x => x.id === id) || this.project.components.find(x => x.id === this.runtime.actor(id)?.baseId);
        return c?.name ?? '動き';
      }
      flowName(task) {
        const item = task.scriptId ? this.compiled.items?.find(x => x.scriptId === task.scriptId || x.key === 'script:' + task.scriptId) : null;
        return `${this.ownerName(task, item)} / ${task.eventType === 'continuous' ? 'つづけて動くルール' : eventText(task.eventType, item?.filter) || task.eventType}`;
      }
      taskError(task, err) {
        task.error =
          err instanceof AkariError ? err : new AkariError('R411', err?.message || String(err));
        const e = task.error;
        task.errorCallStack = [
          this.flowName(task),
          ...task.callFrames.map((f) => `自分で作ったブロック ${f.name}`),
          ...(e.akariCallStack || []),
        ];
        const frame = task.callFrames.at(-1);
        let key =
            e.akariSource?.key || task.sourceKey ||
            (frame ? `action:${frame.id}` : task.scriptId ? `script:${task.scriptId}` : `script:${task.targetId}:${task.eventType}`),
          line = e.line || task.currentNode?.sourceSpan?.startLine || 1;
        // 名人: an error in a procedure made in a 名人 script's text is shown at its line in that script.
        const textAction = key.startsWith('action:meijin-') ? this.compiled.items?.find(item => item.key === key)?.definition : null;
        if (textAction?.scriptId && !e.akariSource) { key = `script:${textAction.scriptId}`; line += textAction.line - 1; }
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
          this.finishTask(task.laneRoot || task, 'DONE');
          if (task.laneRoot) this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        if (n.op === 'OTHERS') {
          for (const control of this.continuous.values())
            if (control.state === 'ACTIVE') control.state = 'CANCELLED_UNTIL_FALSE';
          for (const t of this.tasks.values()) if (t !== task) this.cancelTask(t);
          return;
        }
        // 自分のほかの動きを止める: the part's other bodies and continuous rules stop, and what other flows move it
        // ends where it is; this body (with its lanes) goes on, and the other parts go on.
        if (n.op === 'OWN_OTHERS') {
          const root = task.laneRoot || task;
          this.stopPartMotion(task.subject?.runtimeId || task.runtimeId, task, t => (t.laneRoot || t) === root);
          return;
        }
        if (n.op === 'ALL') {
          this.stop();
          this.stoppedAll = true;
          this.ui.allStopped?.();
          return { requeue: false };
        }
        // 名人: ねこの動きを止める (not its copies) / 星のコピーの動きを止める (every copy of it).
        if (n.op === 'PART') this.stopPartMotion(task.subject?.runtimeId, task);
        if (n.op === 'COPIES') {
          const base = this.runtime.actor(task.subject?.runtimeId)?.baseId;
          for (const copy of [...this.runtime.actors.values()].filter(a => a.isClone && a.baseId === base)) this.stopPartMotion(copy.runtimeId, task);
        }
      }
      // The part's own bodies and continuous rules stop. Where another flow moves the part (〜秒かけて動く, 〜まで動き続ける)
      // or the part carries out a procedure for it, that motion or procedure ends where the part is, and the flow goes on
      // with its next sentence. Speech and waits are not motions and go on.
      stopPartMotion(runtimeId, task, keep = null) {
        for (const [key, control] of this.continuous) {
          if (control.runtimeId !== runtimeId || (control.temporary && keep?.(control.task))) continue;
          if (control.temporary) this.continuous.delete(key);
          else if (control.state === 'ACTIVE') control.state = 'CANCELLED_UNTIL_FALSE';
        }
        for (const t of [...this.tasks.values()]) {
          if (t === task || keep?.(t)) continue;
          if (t.runtimeId === runtimeId) { this.cancelTask(t); continue; }
          const at = t.callFrames.findIndex(frame => frame.runtimeId === runtimeId), br = t.blockReason;
          if (at >= 0) {
            if (br?.speechToken && this.speechTokens.get(br.runtimeId) === br.speechToken) { this.ui.clearSpeech?.(br.runtimeId); this.speechTokens.delete(br.runtimeId); }
            const boundary = t.execStack.findIndex(entry => entry.type === 'callBoundary' && entry.frame === t.callFrames[at]);
            if (boundary >= 0) { t.execStack.length = boundary; t.callFrames.length = at; }
            if (this.blocked.has(t)) this.unblock(t);
          } else if (br?.runtimeId === runtimeId && ['glide', 'moveUntil'].includes(br.kind) && this.blocked.has(t)) this.unblock(t);
        }
      }

      execMotion(task, n, ctx) {
        const actor = this.runtime.requireActor(ctx),
          a = { ...actor },
          num = (i) => numberInUnit(evalExpression(n.args[i], ctx), ['SET_DIRECTION', 'TURN_RIGHT', 'TURN_LEFT'].includes(n.op) ? '度' : '歩');
        const before = { x: a.x, y: a.y };
        // 〇秒かけて (a move or a turn): read first, as it is written first. Where it goes and how far it turns are
        // fixed when it starts (LANGUAGE.md 動きの文); a time of 0 moves at once.
        const seconds = n.seconds ? numberInUnit(evalExpression(n.seconds, ctx), '秒') : null;
        if (seconds !== null && seconds < 0)
          throw valueError('R412', ['TURN_RIGHT', 'TURN_LEFT'].includes(n.op) ? '回る 時間（〜秒かけて）は 0より 小さく できません' : '動く 時間（〜秒かけて）は 0より 小さく できません', n.seconds);
        const timed = seconds !== null && seconds > 0;
        const leg = (key, dirKey, back) => n[key] ? numberInUnit(evalExpression(n[key], ctx), '歩') * (n[dirKey] === back ? -1 : 1) : 0;
        let target = null;
        switch (n.op) {
          // 決めたばしょへ行く / いまのばしょから動く: よこ first, then たて, whatever order they were written in.
          case 'GOTO':
          case 'MOVE_BY': {
            const dx = leg('x', 'xDir', 'left'), dy = leg('y', 'yDir', 'down');
            target = n.op === 'GOTO' ? { x: dx, y: dy } : { x: a.x + dx, y: a.y + dy };
            break;
          }
          // 〜のところへ行く: the centre comes to the other's centre, where it is when the sentence runs. A part with
          // copies is the part itself (its copies are not looked at); before the pointer enters, the mouse is at 0・0.
          case 'GOTO_PART': {
            const value = evalExpression(n.args[0], ctx), from = this.runtime.aabb(a);
            if (!isPart(value) && typeof value !== 'string') throw new AkariError('R411', `行き先の へんすうに 入っているのは「${valueText(value)}」で、部品では ありません`);
            let to;
            if (isPart(value)) to = this.runtime.aabb(this.runtime.partActor(value));
            else if (value === 'マウス') to = { cx: this.runtime.mouseX, cy: this.runtime.mouseY };
            else {
              const base = this.project.components.find((c) => c.name === value), other = base && this.runtime.actor(base.id);
              if (!other) throw new AkariError('R405', `部品「${value}」が ありません`);
              to = this.runtime.aabb(other);
            }
            target = { x: a.x + to.cx - from.cx, y: a.y + to.cy - from.cy };
            break;
          }
          // 前へ10歩進む / 後ろへ10歩動く: along the direction the part faces.
          case 'MOVE': {
            const d = num(0) * (n.direction === 'backward' ? -1 : 1);
            target = { x: a.x + cosDegrees(a.direction) * d, y: a.y + sinDegrees(a.direction) * d };
            break;
          }
          case 'POINT_TO': {
            // 名人: いちばん近い… that is not one part turns no one.
            if (n.args[0]?.kind === 'PartNearest') {
              const nearest = this.runtime.nearestPart(partList(evalExpression(n.args[0].of, ctx)), ctx.runtimeId, true);
              if (!nearest) break;
              const p = this.runtime.nearestTarget(ctx.runtimeId, nearest), aa = this.runtime.aabb(a);
              if (p.x !== aa.cx || p.y !== aa.cy) a.direction = (Math.atan2(p.y - aa.cy, p.x - aa.cx) * 180) / Math.PI;
              break;
            }
            // A target whose centre is at the part's own centre keeps the direction.
            const target = targetValue(evalExpression(n.args[0], ctx), () => partNeeded(ctx)),
              p = this.runtime.nearestTarget(ctx.runtimeId, target),
              aa = this.runtime.aabb(a);
            if (p.x !== aa.cx || p.y !== aa.cy) a.direction = (Math.atan2(p.y - aa.cy, p.x - aa.cx) * 180) / Math.PI;
            break;
          }
          case 'SET_DIRECTION':
            a.direction = num(0);
            break;
          // 右に回る is clockwise (the direction gets smaller); with a time it turns a little each frame.
          case 'TURN_RIGHT':
          case 'TURN_LEFT': {
            const turn = num(0) * (n.op === 'TURN_RIGHT' ? -1 : 1);
            if (timed) {
              ensureFinite(turn);
              this.block(task, { kind: 'glide', startTime: this.runtime.now(), deadline: ensureFinite(this.runtime.now() + seconds * 1000),
                duration: ensureFinite(seconds * 1000), startDirection: a.direction, turn, lastDirection: a.direction });
              return { requeue: false };
            }
            a.direction += turn;
            break;
          }
          case 'BOUNCE':
            this.bounce(a);
            break;
        }
        if (target) {
          ensureFinite(target.x);
          ensureFinite(target.y);
          if (timed) {
            this.block(task, { kind: 'glide', startTime: this.runtime.now(), deadline: ensureFinite(this.runtime.now() + seconds * 1000),
              duration: ensureFinite(seconds * 1000), startX: a.x, startY: a.y, targetX: target.x, targetY: target.y, lastX: a.x, lastY: a.y });
            return { requeue: false };
          }
          a.x = target.x;
          a.y = target.y;
        }
        ensureFinite(a.x);
        ensureFinite(a.y);
        ensureFinite(a.direction);
        a.x = snapStep(a.x);
        a.y = snapStep(a.y);
        a.direction = normalizeDirection(snapStep(normalizeDirection(a.direction)));
        Object.assign(actor, { x: a.x, y: a.y, direction: a.direction });
        if (a.penDown && (before.x !== a.x || before.y !== a.y))
          this.ui.penLine?.(before.x, before.y, a.x, a.y, a.penColor, a.penSize);
        this.ui.render?.();
      }
      // A picture part bounces with what is seen of it (final call 17); a picture of which nothing is seen does not.
      // A touched side turns only the part of the direction that goes into it, as Scratch does: the right side a
      // direction below 90 or above 270 (to 180 − direction), the left side one between 90 and 270, the top one between
      // 0 and 180 (to − direction), the bottom one above 180. Going away from a side or along it, or touching both
      // sides of one axis, keeps that part, so two bounces in one こま do not send the part back into the side.
      bounce(a) {
        const box = this.runtime.visibleBox(a),
          w = this.project.stage.width,
          h = this.project.stage.height;
        if (!box) return;
        const hitX = box.left <= 0 || box.right >= w,
          hitY = box.bottom <= 0 || box.top >= h,
          d = normalizeDirection(a.direction),
          lr = (box.left <= 0) !== (box.right >= w),
          bt = (box.bottom <= 0) !== (box.top >= h);
        if (lr && (box.right >= w ? d < 90 || d > 270 : d > 90 && d < 270)) a.direction = 180 - a.direction;
        if (bt && (box.top >= h ? d > 0 && d < 180 : d > 180)) a.direction = -a.direction;
        if (hitX || hitY) {
          a.direction = normalizeDirection(a.direction);
          const b = this.runtime.visibleBox(a);
          if (b.right - b.left > w) a.x = w / 2;
          else {
            if (b.left < 0) a.x += -b.left;
            if (b.right > w) a.x -= b.right - w;
          }
          const c = this.runtime.visibleBox(a);
          if (c.top - c.bottom > h) a.y = h / 2;
          else {
            if (c.bottom < 0) a.y += -c.bottom;
            if (c.top > h) a.y -= c.top - h;
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
              throw new AkariError('R412', '重なりを 動かす 数は 0、1、2 のような 数に します');
            this.runtime.reorderActor(ctx.runtimeId, n.op, v);
          } else if (n.op === 'HIDE') a.visible = false;
          else if (n.op === 'SHOW') a.visible = true;
          else if (n.op === 'SET_SCALE') {
            const v = numberInUnit(arg(0), '％');
            if (v < 1 || v > 1000) throw new AkariError('R412', '大きさは 1〜1000％に します。見えなく するときは「すがたをかくす」を 使います');
            a.scalePercent = v;
          } else if (n.op === 'SET_COLOR')
            a.color = resolveColor(stringv(arg(0)), { allowTransparent: false });
          else if (['SET_COSTUME', 'NEXT_COSTUME', 'PREV_COSTUME'].includes(n.op)) {
            if (c?.type !== 'sprite') throw new AkariError('R406', 'すがたを えらべるのは キャラクターだけです');
            const arr = c.costumes;
            if (n.op === 'SET_COSTUME') {
              // A value that is not a name is answered with this character's own costume names (F-03).
              const name = stringv(arg(0), 'すがたの 名前を 入れます。れい：' + arr.slice(0, 3).map(x => '「' + x.name + '」').join('、')),
                co = arr.find((x) => x.name === name);
              if (!co) throw new AkariError('R405', `すがた「${name}」が ありません。この キャラクターの すがたの 名前を 書きます。れい：${arr.slice(0, 3).map(x => '「' + x.name + '」').join('、')}`);
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
              ? this.runtime.setBackdropByName(stringv(arg(0), 'はいけいの 名前を 入れます。れい：' + this.runtime.project.stage.backdrops.slice(0, 3).map(x => '「' + x.name + '」').join('、')))
              : this.runtime.stepBackdrop(n.op === 'NEXT_BACKDROP' ? 1 : -1);
          if (ch) this.spawnDistributed('backdropChanged', ch);
          return;
        }
        if (n.op === 'SET_SELF_TEXT') {
          const a = this.runtime.requireActor(ctx),
            c = this.runtime.component(ctx.runtimeId);
          if (!['label', 'button', 'box'].includes(c?.type))
            throw new AkariError('R406', '「文字を〜にする」は 文字・ボタン・四角で 使います');
          a.text = valueText(arg(0), true);
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_TARGET_TEXT') {
          const name = targetName(arg(0), () => partNeeded(ctx, 'text')),
            v = valueText(arg(1), true),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (!['label', 'button', 'box'].includes(c.type))
            throw new AkariError('R406', `「${name}」は 文字を かえられる 部品では ありません`);
          this.runtime.actor(c.id).text = v;
          this.ui.render?.();
          return;
        }
        if (n.op === 'SET_INPUT') {
          const name = targetName(arg(0), () => partNeeded(ctx, 'input')),
            v = assertRuntimeValueLimit(stringv(arg(1))),
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'input') throw new AkariError('R406', `「${name}」は 入力らんでは ありません`);
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
        if (n.op === 'CLEAR') { this.ui.penClear?.(); return; }
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
            throw new AkariError('R412', 'ペンの 太さは 0より 大きく、200までに します');
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
        // 名人: ねこの音を止める — only the sounds that part plays.
        if (n.op === 'STOP_PART') {
          this.runtime.stopPartSounds(ctx.runtimeId);
          return;
        }
        if (n.op === 'SET_VOLUME') {
          const v = num(0);
          if (v < 0 || v > 100) throw new AkariError('R412', '音の 大きさは 0〜100％に します');
          state.volume = v;
          return;
        }
        if (n.op === 'PITCH_UP' || n.op === 'PITCH_DOWN') {
          const v = num(0);
          state.pitch = ensureFinite(state.pitch + (n.op === 'PITCH_UP' ? v : -v));
          return;
        }
        // A sound's name is text (a へんすう whose value is a number stops here); the example is a sound of the work.
        if (n.op === 'SAMPLE' || n.op === 'SAMPLE_WAIT') {
          const value = evalExpression(n.args[0], ctx),
            name = typeof value === 'string' ? value : stringv(value, `鳴らす 音の 名前は 文字です。れい：「${this.project.sounds?.[0]?.name || 'ベル'}」を鳴らす`),
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
          throw freq < 30 || freq > 5000 ? valueError('R412', '音の 高さは 30Hzから 5000Hzまでの 数に します', n.args[0])
            : valueError('R412', '鳴らす 時間は 0.01秒から 60秒までの 数に します', n.args[1]);
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
          // 名人: the part may be a value (主役のコピーを作る copies the part held there).
          const target = targetValue(evalExpression(n.args[0], ctx), () => partNeeded(ctx, 'copy')), name = isPart(target) ? target.name : target,
            c = this.project.components.find((x) => x.name === name);
          if (!c) throw new AkariError('R405', `部品「${name}」が ありません`);
          if (c.type !== 'sprite')
            throw new AkariError('R406', 'コピーを 作れるのは キャラクターだけです');
          const candidates = this.runtime.instancesByName(name);
          src = isPart(target) ? this.runtime.partActor(target).runtimeId : candidates[0]?.runtimeId || c.id;
        } else if (n.op === 'DELETE_ALL') {
          // 名人: 星のコピーを全部消す — every copy of that part; the part itself stays.
          const base = this.runtime.actor(ctx.runtimeId)?.baseId;
          for (const copy of [...this.runtime.actors.values()].filter(a => a.isClone && a.baseId === base)) {
            this.runtime.deleteClone(copy.runtimeId);
            this.cancelRuntimeTasks(copy.runtimeId, task);
          }
          return;
        } else {
          const own = ctx.runtimeId === task.runtimeId;
          this.runtime.deleteClone(ctx.runtimeId);
          this.cancelRuntimeTasks(ctx.runtimeId, task);
          // 名人: a copy named as the subject (できたコピーは…消える) goes; the flow that said so goes on.
          if (!own) return;
          this.finishTask(task, 'DONE');
          return { requeue: false };
        }
        const count=n.count===undefined?1:numberValue(evalExpression(n.count,ctx));
        if(!Number.isSafeInteger(count)||count<0)throw new AkariError('R410','コピーの 数は 0、1、2 のような 数に してください');
        if([...this.runtime.actors.values()].filter(actor=>actor.isClone).length+count>LIMITS.clones)
          throw new AkariError('R410','コピーは もう 作れません。いらない コピーを けしてください');
        this.runtime.requireActor({runtimeId:src});
        const component=this.runtime.component(src);
        if(component?.type!=='sprite')throw new AkariError('R406','コピーを 作れるのは キャラクターだけです');
        const receivers=this.matchingScripts(component.id,'cloneStart',{sourceRuntimeId:src}).filter(script=>this.hasExecutable(this.scriptAst(component.id,'cloneStart',script.id))).length;
        if(this.tasks.size+count*receivers>LIMITS.activeTasks)throw new AkariError('R413','同時に 動いている 動きが 多すぎます。コピーや 合図を へらしてください');
        // 名人: できたコピー are the copies this statement made.
        const made = [];
        for(let i=0;i<count;i++){
          const rid = this.runtime.createClone(src);
          made.push(partValue(rid, component.name));
          this.spawnForRuntime(rid, 'cloneStart', { sourceRuntimeId: src });
        }
        task.createdCopies = made;
      }
      cancelRuntimeTasks(runtimeId, except = null) {
        for (const t of this.tasks.values())
          if ((t.runtimeId === runtimeId || t.blockReason?.runtimeId === runtimeId ||
            t.callFrames.some((f) => f.runtimeId === runtimeId)) && t !== except) this.cancelTask(t);
      }
    }
    function validProducerLabel(value) {
      return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value);
    }
    // packed (only when a file is made, generateStandaloneHtml): the file's assets by id, each with the record whose bytes
    // were hashed while packing and the text made from them. An asset whose text is that same text is not decoded and
    // hashed again; every other check still runs. The player passes nothing and checks every asset.
    function restoreExecutable(data, { packed = null } = {}) {
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
          'この 作品の ファイルは、この あかりでは 動かせません',
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
        fail('作品の 中身が こわれています');
      if (
        !Number.isInteger(p.stage.width) ||
        p.stage.width < 200 ||
        p.stage.width > 1200 ||
        !Number.isInteger(p.stage.height) ||
        p.stage.height < 150 ||
        p.stage.height > 800
      )
        fail('画面の 大きさが 正しくありません');
      if(Object.hasOwn(p.stage,'showSpeechNames')&&typeof p.stage.showSpeechNames!=='boolean')
        fail('ふきだしに 名前を 出すかどうかの せっていが 正しくありません');
      validateRuntimeData(p, fail);
      const ownerIds = new Set(['stage', ...p.components.map(c => c.id)]);
      const callPhrases=new Set();
      for(const definition of p.actions){
        if(definition.callPhrase===undefined||definition.callPhrase==='')continue;
        if(typeof definition.callPhrase!=='string'||cpLen(definition.callPhrase)>80||/[\p{Cc}\p{Zl}\p{Zp}。．.、,※]/u.test(definition.callPhrase))fail('短い よび方が 正しくありません');
        const phrase=definition.callPhrase.replace(/[\s\u3000]/gu,'');
        if(!phrase||callPhrases.has(phrase))fail('短い よび方が 空っぽか、同じ ものが 2つ あります');
        callPhrases.add(phrase);
      }
      // 名人: procedures made in a 名人 script's text travel with their program items.
      const textActions = data.program.filter(item => item && typeof item.key === 'string' && item.key.startsWith('action:meijin-')).map(item => {
        const d = item.definition;
        if (!exactKeys(d, ['id', 'ownerId', 'name', 'args', 'scriptId', 'line']) || item.key !== `action:${d.id}` || d.ownerId !== 'stage' ||
          typeof d.name !== 'string' || !d.name || cpLen(d.name) > 32 || !Array.isArray(d.args) || d.args.length > 16 ||
          d.args.some(a => typeof a !== 'string' || !a || cpLen(a) > 32) || !safeId(d.scriptId) || !Number.isSafeInteger(d.line) || d.line < 1 ||
          p.actions.some(a => a.name === d.name))
          fail('名人の 本文で 作った てじゅんが 正しくありません');
        return { ...d, meijin: true };
      });
      if (new Set(textActions.map(d => d.name)).size !== textActions.length) fail('名人の 本文で 作った てじゅんが 正しくありません');
      const definitionKeys = new Map([
        ...p.actions.map(d => [`action:${d.id}`, d]),
        ...textActions.map(d => [`action:${d.id}`, d]),
        ...p.functions.map(d => [`function:${d.id}`, d]),
      ]);
      if ([...definitionKeys.values()].some(d => d.ownerId !== 'stage'))
        fail('自分で作ったブロックの 持ち主が 正しくありません');
      const items = [],
        astByKey = new Map();
      const validActorRef = (ref, node) => !ref ||
        (exactKeys(ref, ['kind']) && (ref.kind === 'self' || (ref.kind === 'all' && everyoneWaitKind(node?.kind)))) ||
        // 名人: a subject read from a value (主役は…) is checked when it runs.
        (exactKeys(ref, ['kind', 'value']) && ref.kind === 'value' && !!ref.value && typeof ref.value.kind === 'string') ||
        // ねこが…: the written particle が may be kept with a named subject.
        ([['kind', 'name'], ['kind', 'name', 'targetId']].some(keys => exactKeys(ref, keys) || (ref?.particle === 'が' && exactKeys(ref, [...keys, 'particle']))) &&
          ref.kind === 'named' && typeof ref.name === 'string' &&
          (ref.name === '画面' || ref.name === p.stage.name || p.components.some(c => c.name === ref.name)) &&
          (ref.targetId === undefined || ownerIds.has(ref.targetId)));
      const directions = ['right', 'left', 'up', 'down', 'forward', 'backward'];
      for (const item of data.program) {
        const parts = typeof item.key === 'string' ? item.key.split(':') : [];
        const type = item.ownerId === 'stage' ? 'stage' : p.components.find(c => c.id === item.ownerId)?.type;
        // ふれたとき for a part; 〜になったとき and 〜秒ごとに for a 名人 script (the stage).
        const events = ['start', 'click', 'keyDown', 'message', 'backdropChanged',
          ...(type === 'input' ? ['valueChanged'] : []), ...(type === 'sprite' ? ['cloneStart'] : []),
          ...(type && type !== 'stage' ? ['touchStart'] : []), ...(type === 'stage' ? ['conditionTrue', 'interval'] : [])];
        // A later heading of a body saved without unit IDs keeps the key analysis gives it:
        // script:document:<the body's key>:unit:<n>, where the body's key is script:<id> or script:<owner>:<event>.
        const documentUnit = parts[1] === 'document' && parts[2] === 'script' && parts.at(-2) === 'unit' &&
          /^[1-9][0-9]{0,4}$/.test(parts.at(-1)) && parts.at(-1) !== '1' &&
          ((parts.length === 6 && safeId(parts[3])) || (parts.length === 7 && ownerIds.has(parts[3]) && /^[A-Za-z]{1,32}$/.test(parts[4])));
        if (
          typeof item.key !== 'string' ||
          !ownerIds.has(item.ownerId) ||
          (item.key.startsWith('script:')
            ? !((((parts.length === 2 && safeId(parts[1])) || documentUnit) && item.id === parts.slice(1).join(':') &&
                item.targetId === item.ownerId && events.includes(item.event)) ||
              (parts.length === 3 && parts[1] === item.ownerId && events.includes(parts[2])))
            : definitionKeys.get(item.key)?.ownerId !== item.ownerId) ||
          astByKey.has(item.key) ||
          item.ast?.kind !== 'Script' ||
          !Array.isArray(item.ast.body)
        )
          fail('動きの 中身が こわれています');
        const watched = item.event || parts[2];
        if ((watched === 'touchStart' && !isEdgeTarget(item.filter?.target) && !p.components.some(c => c.name === item.filter?.target)) ||
          (watched === 'conditionTrue' && typeof item.ast.heading?.condition?.kind !== 'string') ||
          (watched === 'interval' && typeof item.ast.heading?.seconds?.kind !== 'string'))
          fail('きっかけの 中身が 正しくありません');
        if (item.filter != null) {
          const event = item.event || parts[2], field = event === 'keyDown' ? 'key' : event === 'message' ? 'message' : event === 'touchStart' ? 'target' : null;
          if (!field || !exactKeys(item.filter, [field]) || typeof item.filter[field] !== 'string' ||
            cpLen(item.filter[field]) > LIMITS.stringChars) fail('きっかけの キーや 合図の 名前が 正しくありません');
        }
        if (item.ast.rules !== undefined && (!Array.isArray(item.ast.rules) || item.ast.rules.length > LIMITS.scripts))
          fail('つづけて 動く ルールが 正しくありません');
        for (const rule of item.ast.rules || []) {
          if (rule?.kind !== 'ContinuousRule' || !validActorRef(rule.actorRef) ||
            !directions.includes(rule.direction) ||
            ['condition', 'seconds', 'distance'].some(key => !rule[key] || typeof rule[key].kind !== 'string'))
            fail('つづけて 動く ルールの「だれが」「どの向きへ」「どんな あいだ」「どの速さで」の どれかが 正しくありません');
        }
        // Validate units in every saved expression, including currently unreachable branches.
        const pending = [item.ast];
        while (pending.length) {
          const node = pending.pop();
          if (!node || typeof node !== 'object') continue;
          if (['ExtensionCommand', 'ExtensionCalculation'].includes(node.kind)) {
            const operation = extensions.describe(node.name, node.kind === 'ExtensionCommand' ? 'commands' : 'calculations');
            if (!operation || !Array.isArray(node.args) || node.args.length !== operation.args.length) fail('かくちょうの ブロックと 入れるものが 合いません');
          }
          if (node.kind === 'Hole') fail('書きかけの ところを さいごまで 書いてください');
          if (Object.hasOwn(node, 'actorRef') && !validActorRef(node.actorRef, node)) fail('動かす キャラクターや 部品が 正しくありません');
          if (node.kind === 'MoveUntil' && !directions.includes(node.direction)) fail('動く 向きが 正しくありません');
          // The move sentences: 前へ／後ろへ, one leg per axis (both for 決めたばしょへ行く), and 〜のところへ行く's partner.
          if (node.kind === 'MotionCommand' && ((node.op === 'MOVE' && !['forward', 'backward'].includes(node.direction)) ||
            (['GOTO', 'MOVE_BY'].includes(node.op) && (!['right', 'left'].includes(node.xDir) || !['up', 'down'].includes(node.yDir) ||
              (node.op === 'GOTO' ? !(node.x && node.y) : !(node.x || node.y)))) ||
            (node.op === 'GOTO_PART' && (!Array.isArray(node.args) || node.args.length !== 1))))
            fail('動く 向きが 正しくありません');
          // Values made while running are never saved.
          if (['PartValue', 'DeadlineBound', 'EventCountBound'].includes(node.kind)) fail('動きの 中身が こわれています');
          if (node.argumentNames !== undefined && (!Array.isArray(node.argumentNames) ||
            node.argumentNames.some(name => typeof name !== 'string' || !name || cpLen(name) > 32) ||
            new Set(node.argumentNames).size !== node.argumentNames.length ||
            (node.argumentNames.length && node.argumentNames.length !== node.args?.length)))
            fail('入れるものの 名前が 正しくありません');
          if (node.kind === 'QuantityLiteral' &&
              (!UNIT_TAGS.includes(node.unit) || !node.value || typeof node.value !== 'object'))
            fail('数の たんいか 計算が 正しくありません');
          if (node.kind === 'UnitlessRead' && (!node.value || typeof node.value !== 'object'))
            fail('数だけを 取り出す 計算が 正しくありません');
          if (node.kind === 'NumberLiteral' && !finite(node.value)) fail('数の 計算が 正しくありません');
          for (const value of Object.values(node)) {
            if (Array.isArray(value)) for (const entry of value) pending.push(entry);
            else if (value && typeof value === 'object') pending.push(value);
          }
        }
        items.push(item);
        astByKey.set(item.key, item.ast);
      }
      if ([...definitionKeys.keys()].some(key => !astByKey.has(key)))
        fail('自分で作ったブロックの 中身が ありません');
      const compiled = {
        items,
        rules: items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
          ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
        }))),
        astByKey,
        errors: [],
        symbols: {
          actions: new Map([...p.actions, ...textActions].map((x) => [x.name, x])),
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
          fail('絵や音の 中身が 正しくありません');
        if (
          !(
            a.kind === 'image'
              ? ['image/png', 'image/jpeg', 'image/webp']
              : ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg']
          ).includes(a.mime)
        )
          fail('絵や音の しゅるいが 正しくありません');
        total += a.byteLength;
        const known = packed?.get(a.id),
          checked = !!known && known.text === a.dataBase64 && known.record?.sha256 === a.sha256 && known.record.byteLength === a.byteLength;
        if (total > LIMITS.assetRawTotal || (!checked && decodedBase64Length(a.dataBase64) !== a.byteLength))
          fail('絵や音の 大きさが 正しくありません');
        const bytes = checked ? known.record.bytes : decodeBase64(a.dataBase64);
        if (!checked && sha256Fallback(bytes) !== a.sha256)
          fail('絵や音の 中身が こわれています');
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
            fail('使う 絵や音が 見つかりません');
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
      isPart,
      freezeRecord,
      snapshotEntries,
      LIMITS,
      COLOR_NAMES,
      COLOR_LABELS,
      EVENT_LABELS,
      EDGE_TARGETS,
      isEdgeTarget,
      eventText,
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
      namesStage,
      BUILTIN_DEFINITIONS,
      EXECUTABLE_CONTRACT,
      validProducerLabel,
      restoreExecutable,
    };
  }

