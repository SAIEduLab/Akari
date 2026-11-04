  // ────────────────────────────────────────────────────────────────────────
  // 01 — createAkariRuntime: its body lies in the 01-runtime files in order, and each uses only the body's names in
  // the files before it (AUDIT.md「ソースの置き場所・向き・大きさ」). Definitions, errors, values, assets.
  // ────────────────────────────────────────────────────────────────────────
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
      languageContractId: 5,
      runtimeContractId: 5,
      programFormatVersion: 4,
      projectFormatVersion: 6,
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
      register() { throw new Error('プロファイルは 起動設定で 登録して ください'); },
      select() { throw new Error('プロファイルは 起動前に ホスト側で 選択して ください'); },
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
      click: 'おされた とき',
      keyDown: 'キーを おしたとき',
      message: '合図を 受けたとき',
      backdropChanged: 'はいけいが かわった とき',
      valueChanged: '中身が かわった とき',
      cloneStart: 'コピーが できたとき',
      touchStart: 'ふれたとき',
      conditionTrue: 'そう なったとき',
      interval: '〜秒ごとに',
    };
    // The touch targets that are no part: the whole stage edge (端) and its four sides, by the words code writes.
    const EDGE_TARGETS = Object.freeze({ 端: '画面のはし', '端:上': '画面の上のはし', '端:下': '画面の下のはし', '端:右': '画面の右のはし', '端:左': '画面の左のはし' });
    const isEdgeTarget = (target) => typeof target === 'string' && Object.hasOwn(EDGE_TARGETS, target);
    const EDGE_SIDES = Object.freeze(['端:上', '端:下', '端:右', '端:左']);
    // A key is written with the name printed on the keyboard (F-34): 「スペース」キー, 「エンター」キー, 「エスケープ」キー.
    // It lives here because eventText names key bodies in the exported player too.
    const KEY_SURFACES = Object.freeze({ 空白: 'スペース', 決定: 'エンター', 取消: 'エスケープ' });
    const keySurface = (key) => typeof key === 'string' && Object.hasOwn(KEY_SURFACES, key) ? KEY_SURFACES[key] : key;
    // A body is named by its event; a touch body also by what it touches (「星」に ふれたとき, 画面のはしに ふれたとき).
    const eventText = (event, filter) => event === 'touchStart' && typeof filter?.target === 'string' && filter.target
      ? (isEdgeTarget(filter.target) ? EDGE_TARGETS[filter.target] : '「' + filter.target + '」') + 'に ふれた とき'
      : event==='keyDown'&&typeof filter?.key==='string'?'「'+keySurface(filter.key)+'」キーを おした とき'
      : event==='message'&&typeof filter?.message==='string'?'「'+filter.message+'」という 合図を 受けた とき':EVENT_LABELS[event];
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
      if (other !== undefined) throw new AkariError('R411', `「みんな」「それぞれ」「順番に」の リストに、部品では ない「${valueText(other)}」が 入って います。部品だけを 入れた リストに 使います`);
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
      if (!scalar(v) && !Array.isArray(v)) throw new AkariError('R411', '中身の しゅるいが 正しく ありません');
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
      if (!Number.isFinite(n)) throw new AkariError('R403', '計算の 答えが、あかりで 使える 数に なりませんでした。使う 数や 計算の しかたを たしかめて ください');
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
    // The waits that may be written without a subject (0.2秒待つ, みんなは…: {kind:'all'}). Every wait, with a subject
    // or without one, stops the flow it is in (LANGUAGE.md 待つ).
    function everyoneWaitKind(kind) {
      return ['WaitTime', 'WaitUntil', 'BroadcastAndWait', 'WaitBroadcastGroup'].includes(kind);
    }
    function hasEventCount(node) {
      if (!node || typeof node !== 'object') return false;
      if (node.kind === 'EventCount') return true;
      return Object.values(node).some(v => v && typeof v === 'object' && hasEventCount(v));
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
        throw new AkariError('F508', '絵や 音の 中身を 表す 文字の 書き方が、正しく ありません');
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
          throw new AkariError('F508', '絵や 音の 中身を 表す 文字の 書き方が、正しく ありません');
      }
      if (pad && end < 2)
        throw new AkariError('F508', '絵や 音の 中身を 表す 文字の 書き方が、正しく ありません');
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
          throw new AkariError('F508', '絵や 音の 中身を 表す 文字を、読みとれません');
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
      if (encodeBase64(out) !== text) throw new AkariError('F508', '絵や 音の 中身を 表す 文字が、決まった 形に なって いません');
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
      const raw = new Uint8Array(asset.bytes),
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
              throw new AkariError('F508', '同じ しるしの 絵や 音なのに、大きさが ちがいます');
            if (bytes && !bytesEqual(a.bytes, bytes))
              throw new AkariError('F508', '同じ しるしと 大きさの 絵や 音なのに、中身が ちがいます');
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
          throw new AkariError('R416', `同時に 鳴らせる 音は ${LIMITS.activeAudioVoices}こまでです。鳴って いる 音が おわってから 次の 音を 鳴らします`);
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
            '音が 高すぎるか、長さが 正しく ないので 鳴らせません',
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
            '音の 高さを かえすぎたので、この音を 鳴らせません。高さの かえかたを 小さく して ください',
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
    function stringv(v, msg = 'ここには 文字が いります。れい：「こんにちは」') {
      if (typeof v !== 'string') throw new AkariError('R411', msg);
      return v;
    }
    function numberValue(v, msg = 'ここには 数が いります。れい：10') {
      if (!isNumberValue(v)) throw new AkariError('R411', msg);
      return isQuantity(v) ? v.magnitude : v;
    }
