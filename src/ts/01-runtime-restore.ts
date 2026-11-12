import type { RuntimeBase } from './01-runtime-base.ts';
import type { RuntimeModel } from './01-runtime-model.ts';
import type { RuntimeScheduler } from './01-runtime-scheduler.ts';
import type { ActionDefinitionData, FunctionDefinitionData, Project, SavedAsset, RunnableProject } from '../types/project.d.ts';
import type { RunnableMeijinDefinition, RunnableProgram, SyntaxItem, RunnableItem } from '../types/compiled.d.ts';
import type { Operation, Requirements } from '../../extensions/types.d.ts';
import type { Script } from '../types/syntax.d.ts';
import type { AssetRecord } from '../types/runtime.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 01 — createAkariRuntime, its last part: restoring an executable, and the runtime it returns.
// ────────────────────────────────────────────────────────────────────────
export function createRuntimeRestore(base: RuntimeBase, model: RuntimeModel, scheduler: RuntimeScheduler) {
  'use strict';
  const {
    AkariError, AssetRuntimeCache, AssetStore, BUILTIN_DEFINITIONS, BUILTIN_META, COLOR_LABELS, COLOR_NAMES,
    EDGE_TARGETS, EVENT_LABELS, EXECUTABLE_CONTRACT, IMMUTABLE_ASSET_RECORDS, LIMITS, PRNG, ScriptSignal, UNIT_TAGS,
    assertRuntimeValueLimit, bytesEqual, clamp, cloneDesignProject, collectRuntimeAssetRequirements, cpLen,
    decodeBase64, decodedBase64Length, deepCopy, displayValue, encodeBase64, ensureFinite, eventText,
    everyoneWaitKind, exactKeys, extensions, finite, isEdgeTarget, isNumberValue, isPart, isQuantity, keySurface,
    listValue, makeImmutableAssetRecord, namesStage, nowMs, numberValue, profiles, quantity, resolveColor, rotr,
    safeId, sameValue, scalar, sha256, sha256Fallback, stringv, tailText, typeName, unitOf, validateColorHex,
    validateExtensionEnvelope, valueText
  } = base;
  const {
    RuntimeModel, addNumericUpdate, arithmetic, bool, commonUnit, evalBuiltin, evalExpression, evalSensor,
    execFunctionNodes, execListMutation, freezeRecord, integerIndex, localScalar, namedArgumentDetails, numberInUnit,
    numeric, runUserFunction, snapshotEntries, unicodeIndexOf, validateExpectedUnit, validateRuntimeData
  } = model;
  const { EventScheduler } = scheduler;
  // An executable as read (generateStandaloneHtml writes one): typed as the shape a valid one has. What the run reads of
  // it is checked below before it is used (fail refuses the file): the envelope, the work's parts (its stage and
  // backdrops, each part's kind, numbers, text and colours and its costumes, its sounds and its own blocks), and each
  // tree's lists and values. The types say
  // what is read, not what is proven. The work keeps no source (RunnableProject), and each tree is the one read less its
  // comments, its texts as written and its end lines (packExecutable leaves them out; a run reads none of them).
  interface ExecutableData {
    schema: string; appVersion: string; languageContractId: number; runtimeContractId: number; programFormatVersion: number;
    projectFormatVersion: number; project: RunnableProject; program: ProgramItem[]; assets: (SavedAsset & { meta?: Record<string, unknown> })[]; extensions?: Requirements;
  }
  // A node of a saved tree as the check reads it: any of these may be there (the check refuses what is wrong).
  type LooseNode = { kind?: string; name?: string; args?: unknown[]; actorRef?: unknown; direction?: string; op?: string; xDir?: string; yDir?: string;
    x?: unknown; y?: unknown; argumentNames?: unknown; unit?: unknown; value?: unknown; [key: string]: unknown };
  type LooseRef = { kind?: unknown; name?: unknown; particle?: unknown; targetId?: unknown; value?: { kind?: unknown } };
  // A source as read and saved with the executable; a 名人 text's procedure keeps its definition.
  type ProgramItem = RunnableItem & { definition?: RunnableMeijinDefinition | ActionDefinitionData | FunctionDefinitionData | null };
  function validProducerLabel(value: unknown): boolean {
    return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value);
  }
  // packed (only when a file is made, generateStandaloneHtml): the file's assets by id, each with the record whose bytes
  // were hashed while packing and the text made from them. An asset whose text is that same text is not decoded and
  // hashed again; every other check still runs. The player passes nothing and checks every asset.
  const VERIFIED_ASSET_TEXT=new WeakMap<AssetRecord, string>();
  function verifiedAssetText(record: AssetRecord): string{
    const kept=VERIFIED_ASSET_TEXT.get(record);if(kept!==undefined)return kept;
    const bytes=record?.bytes;
    if(!(bytes instanceof Uint8Array)||bytes.length!==record.byteLength||sha256Fallback(bytes)!==record.sha256)
      throw new AkariError('F508','絵や音の 中身が、ほぞんした ときと 合いません');
    const text=encodeBase64(bytes);if(IMMUTABLE_ASSET_RECORDS.has(record))VERIFIED_ASSET_TEXT.set(record,text);return text;
  }
  // The forms of the nodes a run reads, by the id of a block of the form (its kind, and its op, name, sensor or event
  // where the blocks of a kind differ), each with the parts it always has (audit/lib/runtime-forms.mjs says how a part is
  // written): what the block schemas say, then the forms only 名人 text writes. restoreExecutable refuses a node of no
  // form here, or without a part its form has. product-source checks the table against the schemas and
  // src/types/syntax-base.d.ts (RUNTIME-FORMS). The table handed out reads as a map and cannot be changed: it has no set,
  // delete or clear, and each form and each of its parts is frozen.
  const FORMS = new Map(([
    // the blocks
    ['body:B', 'Script Forever'],
    ['unit:u value:e', 'QuantityLiteral'],
    ['value:e', 'UnitlessRead Say ReturnStatement UnaryExpression:POS UnaryExpression:NEG UnaryExpression:NOT'],
    ['actorRef:a value:e', 'ActorQualifiedRead'],
    ['actorRef:a name:s count:e', 'EventCount:action'],
    ['actorRef:a count:e', 'EventCount:click'],
    ['actorRef:a direction:d condition:e seconds:e distance:e', 'ContinuousRule'],
    ['xDir:d yDir:d x:e y:e', 'MotionCommand:GOTO'],
    ['xDir:d yDir:d', 'MotionCommand:MOVE_BY'],
    ['direction:d args:e[1,1]', 'MotionCommand:MOVE'],
    ['args:e[1,1]', 'MotionCommand:GOTO_PART MotionCommand:TURN_RIGHT MotionCommand:TURN_LEFT MotionCommand:SET_DIRECTION MotionCommand:POINT_TO'],
    ['args:e[1,1]', 'LooksCommand:SET_SCALE LooksCommand:FORWARD_LAYERS LooksCommand:BACKWARD_LAYERS LooksCommand:SET_COLOR'],
    ['args:e[1,1]', 'LooksCommand:SET_COSTUME LooksCommand:SET_BACKDROP LooksCommand:SET_SELF_TEXT PenCommand:SET_COLOR PenCommand:SET_SIZE'],
    ['args:e[1,1]', 'SoundCommand:SAMPLE_WAIT SoundCommand:SAMPLE SoundCommand:SET_VOLUME SoundCommand:PITCH_UP SoundCommand:PITCH_DOWN'],
    ['args:e[1,1]', 'CloneCommand:CREATE_TARGET BuiltinCall:LENGTH BuiltinCall:STRING_LENGTH'],
    ['broadcastRef:s', 'WaitBroadcastGroup'],
    ['', 'CommentLine NoOperation Break Continue TimerReset StopCommand:THIS StopCommand:OTHERS StopCommand:OWN_OTHERS StopCommand:ALL'],
    ['', 'SensorRead:マウスが押されている SensorRead:マウスの横位置 SensorRead:マウスの縦位置 SensorRead:以前の背景名 SensorRead:新しい背景名 SensorRead:受け取った知らせ SensorRead:押されたキー'],
    ['', 'SensorRead:クローンである SensorRead:背景番号 SensorRead:背景名 SensorRead:衣装番号 SensorRead:衣装名 SensorRead:横位置 SensorRead:縦位置 SensorRead:方向'],
    ['', 'SensorRead:大きさ SensorRead:タイマー SensorRead:答え SensorRead:音量 SensorRead:音程 SensorRead:以前の値 SensorRead:新しい値'],
    ['target:t value:e', 'Assignment NumericUpdate:ADD NumericUpdate:SUB ListAppend'],
    ['target:t index:e value:e', 'ListInsert ListReplace'],
    ['target:t index:e', 'ListDelete'],
    ['target:t', 'ListClear'],
    ['hasElse:b condition:e thenBody:B elseBody:B', 'IfStatement'],
    ['count:e body:B', 'RepeatCount'],
    ['condition:e body:B', 'RepeatWhile RepeatUntil'],
    ['binder:s list:e body:B', 'ForEach'],
    ['seconds:e', 'WaitTime'],
    ['condition:e', 'WaitUntil'],
    ['question:e', 'Ask'],
    ['message:e', 'Broadcast BroadcastAndWait'],
    ['name:s args:e[0,100000]', 'UserActionCall UserFunctionCall'],
    ['name:s initial:e', 'LocalVariableDeclaration'],
    ['name:s', 'LocalListDeclaration'],
    ['args:e[0,0]', 'MotionCommand:BOUNCE LooksCommand:FRONT LooksCommand:BACK LooksCommand:HIDE LooksCommand:SHOW LooksCommand:NEXT_COSTUME'],
    ['args:e[0,0]', 'LooksCommand:PREV_COSTUME LooksCommand:NEXT_BACKDROP LooksCommand:PREV_BACKDROP PenCommand:DOWN PenCommand:UP PenCommand:CLEAR'],
    ['args:e[0,0]', 'PenCommand:STAMP SoundCommand:STOP_ALL CloneCommand:CREATE_SELF CloneCommand:DELETE_SELF'],
    ['args:e[2,2]', 'LooksCommand:SET_TARGET_TEXT LooksCommand:SET_INPUT SoundCommand:TONE_WAIT SoundCommand:TONE BuiltinCall:CONTAINS'],
    ['args:e[2,2]', 'BuiltinCall:INDEX_OF BuiltinCall:STRING_CHAR'],
    ['value:n', 'NumberLiteral'],
    ['value:s', 'StringLiteral'],
    ['value:b', 'BooleanLiteral'],
    ['items:e[0,100000]', 'ListLiteral'],
    ['name:s qualifier:q', 'VariableRead'],
    ['left:e right:e', 'BinaryExpression:ADD BinaryExpression:SUB BinaryExpression:MUL BinaryExpression:DIV BinaryExpression:POW'],
    ['left:e right:e', 'CompareExpression:GTE CompareExpression:LTE CompareExpression:GT CompareExpression:LT CompareExpression:EQ'],
    ['left:e right:e', 'CompareExpression:NEQ LogicalExpression:AND LogicalExpression:OR'],
    ['list:e index:e', 'ListRead'],
    ['args:e[0,100000]', 'BuiltinCall:乱数 BuiltinCall:余り BuiltinCall:四捨五入 BuiltinCall:切り上げ BuiltinCall:切り捨て BuiltinCall:絶対値 BuiltinCall:平方根'],
    ['args:e[0,100000]', 'BuiltinCall:正弦 BuiltinCall:余弦 BuiltinCall:正接 BuiltinCall:逆正弦 BuiltinCall:逆余弦 BuiltinCall:逆正接 BuiltinCall:自然対数'],
    ['args:e[0,100000]', 'BuiltinCall:常用対数 BuiltinCall:指数 BuiltinCall:数 BuiltinCall:文字 BuiltinCall:最小 BuiltinCall:最大 BuiltinCall:つなぐ'],
    ['arg:e', 'SensorRead:INPUT_VALUE SensorRead:DISTANCE_TO SensorRead:KEY_DOWN SensorRead:TOUCHING_COLOR SensorRead:TOUCHING'],
    // 名人
    ['args:S name:s', 'ActionDefinition'],
    ['lanes:L', 'Parallel'],
    ['binder:s body:B list:e', 'ParallelEach'],
    ['actorRef:a body:B seconds:e', 'TimedRepeat'],
    ['actorRef:a direction:s distance:e seconds:e', 'MoveUntil'],
    ['actorRef:a target:t value:e', 'ListRemoveValue'],
    ['args:e[0,0]', 'CloneCommand:DELETE_ALL SoundCommand:STOP_PART'],
    ['', 'StopCommand:COPIES StopCommand:PART SensorRead:拡張の値 CreatedCopies'],
    ['actorRef:a', 'PartName'],
    ['name:s', 'PartRef PartFamily'],
    ['except:e list:e', 'PartExcept'],
    ['list:e', 'PartRandom'],
    ['by:r list:e', 'PartPick'],
    ['of:e', 'PartNearest'],
    ['target:e', 'PartsTouching'],
    ['actorRef:a state:s', 'PartState'],
  ] as const).flatMap(([parts, ids]) => ids.split(' ').map(id => [id, Object.freeze(parts.split(' ').filter(Boolean).map(part => Object.freeze(part.split(':') as [string, string])))] as const)));
  const RUNTIME_FORMS: ReadonlyMap<string, readonly (readonly [string, string])[]> = Object.freeze({
    get size() { return FORMS.size; }, get: (id: string) => FORMS.get(id), has: (id: string) => FORMS.has(id),
    keys: () => FORMS.keys(), values: () => FORMS.values(), entries: () => FORMS.entries(), [Symbol.iterator]: () => FORMS.entries(),
    forEach: (each: (parts: readonly (readonly [string, string])[], id: string, table: typeof RUNTIME_FORMS) => void, self?: unknown) => FORMS.forEach((parts, id) => each.call(self, parts, id, RUNTIME_FORMS)),
  });
  const FORM_DISCRIMINATORS: Readonly<Record<string, string>> = { BuiltinCall: 'name', SensorRead: 'sensor', EventCount: 'event' };
  // (a node's form: by its kind, or its kind and its op, name, sensor or event)
  const runtimeForm = (node: { readonly [key: string]: unknown }) => RUNTIME_FORMS.get(node.kind as string) ??
    RUNTIME_FORMS.get(node.kind + ':' + String(node[FORM_DISCRIMINATORS[node.kind as string] ?? 'op']));
  // Whether a part holds what its type says (RUNTIME_FORMS).
  function partHolds(type: string, value: unknown): boolean {
    const record = (x: unknown): x is { readonly [key: string]: unknown } => !!x && typeof x === 'object' && !Array.isArray(x);
    const isNode = (x: unknown) => record(x) && typeof x.kind === 'string';
    const list = /^e\[(\d+),(\d+)\]$/.exec(type);
    if (list) return Array.isArray(value) && value.length >= Number(list[1]) && value.length <= Number(list[2]) && value.every(isNode);
    switch (type) {
      case 'e': return isNode(value);
      case 'B': return Array.isArray(value) && value.every(isNode);
      case 'L': return Array.isArray(value) && value.every(lane => Array.isArray(lane) && lane.every(isNode));
      case 't': return record(value) && typeof value.name === 'string';
      case 's': case 'd': case 'u': return typeof value === 'string';
      case 'S': return Array.isArray(value) && value.every(x => typeof x === 'string');
      case 'n': return typeof value === 'number';
      case 'b': return typeof value === 'boolean';
      // (a name read with no place written is read as one with none: the run takes it as null)
      case 'q': return [undefined, null, 'exact', 'self', 'project'].includes(value as string | null | undefined);
      case 'a': return record(value);
      case 'r': return record(value) && ['near', 'position', 'variable'].includes(value.kind as string);
      default: return false;
    }
  }
  function restoreExecutable(data: ExecutableData, { packed = null }: { packed?: Map<string, { record: AssetRecord; text: string }> | null } = {}) {
    const fail: (message: string) => never = (message) => {
      throw new AkariError('X602', message);
    };
    if (
      !exactKeys(data, ['schema', 'appVersion', 'languageContractId', 'runtimeContractId',
        'programFormatVersion', 'projectFormatVersion', 'project', 'program', 'assets', ...(Object.hasOwn(data || {}, 'extensions') ? ['extensions'] : [])]) ||
      data.schema !== 'akari-executable' ||
      !validProducerLabel(data.appVersion) ||
      Object.entries(EXECUTABLE_CONTRACT).some(([k, v]) => data[k as keyof typeof EXECUTABLE_CONTRACT] !== v)
    )
      fail(
        'この 作品の ファイルは、この あかりでは 動かせません',
      );
    if (Object.hasOwn(data, 'extensions')) validateExtensionEnvelope(data.extensions);
    // (the extensions a work needs travel beside it, never in it: packExecutable writes them there)
    if (data.project && typeof data.project === 'object' && Object.hasOwn(data.project, 'extensions')) fail('作品の 中身が こわれて います');
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
      fail('作品の 中身が こわれて います');
    if (
      !Number.isInteger(p.stage.width) ||
      p.stage.width < 200 ||
      p.stage.width > 1200 ||
      !Number.isInteger(p.stage.height) ||
      p.stage.height < 150 ||
      p.stage.height > 800
    )
      fail('画面の 大きさが 正しく ありません');
    // The parts of the work the run reads (RuntimeModel, collectRuntimeAssetRequirements): the stage's backdrops (one at
    // least), each part (below) and each キャラクター's costumes, the work's sounds, and its own blocks, each with what is
    // read of it.
    const record = (x: unknown): x is { readonly [key: string]: unknown } => !!x && typeof x === 'object' && !Array.isArray(x);
    const isNode = (x: unknown) => record(x) && typeof x.kind === 'string';
    const look = (x: unknown) => record(x) && typeof x.id === 'string' && typeof x.name === 'string' &&
      (x.kind === 'image' ? typeof x.assetId === 'string' : (x.kind === 'text' || x.kind === 'color') && typeof x.value === 'string');
    // Each part as the run and the stage read it, in the ranges a saved work keeps (validateDesignProject): its kind, its
    // place, size, turn, letter size and scale as numbers, whether it is shown, its text and its colours.
    const part = (c: { readonly [key: string]: unknown }) => ['label', 'button', 'box', 'input', 'sprite'].includes(c.type as string) &&
      ['x', 'y', 'w', 'h', 'fontSize', 'direction', 'scalePercent'].every(k => finite(c[k])) && typeof c.visible === 'boolean' && typeof c.text === 'string' &&
      [['w', 8, 1200], ['h', 8, 1200], ['fontSize', 8, 200], ['scalePercent', 1, 1000]].every(([k, low, high]) => (c[k as string] as number) >= (low as number) && (c[k as string] as number) <= (high as number)) &&
      validateColorHex(c.fg) && validateColorHex(c.bg, true);
    if (!Array.isArray(p.stage.backdrops) || !p.stage.backdrops.length || !p.stage.backdrops.every(look) ||
      p.components.some(c => !record(c) || !part(c) || (c.type === 'sprite' && (!Array.isArray(c.costumes) || !c.costumes.length || !c.costumes.every(look) ||
        new Set(c.costumes.map(x => (x as { id: string }).id)).size !== c.costumes.length))) ||
      // (each part, backdrop, sound and made block has its own id, as a saved work's are: one id twice would run twice)
      new Set(p.components.map(c => c?.id)).size !== p.components.length || new Set(p.stage.backdrops.map(b => (b as { id: string }).id)).size !== p.stage.backdrops.length ||
      (Array.isArray(p.sounds) && new Set(p.sounds.map(x => x?.id)).size !== p.sounds.length) || new Set([...p.actions, ...p.functions].map(d => d?.id)).size !== p.actions.length + p.functions.length ||
      !Array.isArray(p.sounds) || !p.sounds.every(s => record(s) && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.assetId === 'string') ||
      ![...p.actions, ...p.functions].every(d => record(d) && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.args) && d.args.every(a => typeof a === 'string')))
      fail('作品の 中身が こわれて います');
    if(Object.hasOwn(p.stage,'showSpeechNames')&&typeof p.stage.showSpeechNames!=='boolean')
      fail('ふきだしに 名前を 出すか どうかの せっていが 正しく ありません');
    validateRuntimeData(p, fail);
    const ownerIds = new Set(['stage', ...p.components.map(c => c.id)]);
    const callPhrases=new Set<string>();
    for(const definition of p.actions){
      if(definition.callPhrase===undefined||definition.callPhrase==='')continue;
      if(typeof definition.callPhrase!=='string'||cpLen(definition.callPhrase)>80||/[\p{Cc}\p{Zl}\p{Zp}。．.、,※]/u.test(definition.callPhrase))fail('短い よび方が 正しく ありません');
      const phrase=definition.callPhrase.replace(/[\s\u3000]/gu,'');
      if(!phrase||callPhrases.has(phrase))fail('短い よび方が 空っぽか、同じ ものが 2つ あります');
      callPhrases.add(phrase);
    }
    // 名人: procedures made in a 名人 script's text travel with their program items.
    const textActions = data.program.filter(item => item && typeof item.key === 'string' && item.key.startsWith('action:meijin-')).map(item => {
      const d = item.definition;
      if (!exactKeys(d, ['id', 'ownerId', 'name', 'args', 'scriptId', 'line']) || item.key !== `action:${d.id}` || d.ownerId !== 'stage' ||
        typeof d.name !== 'string' || !d.name || cpLen(d.name) > 32 || !Array.isArray(d.args) || d.args.length > 16 ||
        d.args.some(a => typeof a !== 'string' || !a || cpLen(a) > 32) || !safeId(d.scriptId) || !Number.isSafeInteger(d.line) || (d.line as number) < 1 ||
        p.actions.some(a => a.name === d.name))
        fail('名人の 本文で 作った てじゅんが 正しく ありません');
      return { ...d, meijin: true };
    });
    if (new Set(textActions.map(d => d.name)).size !== textActions.length) fail('名人の 本文で 作った てじゅんが 正しく ありません');
    const definitionKeys = new Map<string, RunnableProject['actions'][number] | RunnableMeijinDefinition | RunnableProject['functions'][number]>([
      ...p.actions.map(d => [`action:${d.id}`, d] as const),
      ...textActions.map(d => [`action:${d.id}`, d] as const),
      ...p.functions.map(d => [`function:${d.id}`, d] as const),
    ]);
    if ([...definitionKeys.values()].some(d => d.ownerId !== 'stage'))
      fail('自分で作ったブロックの 持ち主が 正しく ありません');
    const items: ProgramItem[] = [],
      astByKey = new Map<string, Script>();
    // (ref as read: each of its forms is checked here)
    const validActorRef = (ref: LooseRef | null | undefined, node?: { kind?: string }): boolean => !ref ||
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
      if (!item || typeof item !== 'object' || (Object.hasOwn(item, 'meijin') && typeof item.meijin !== 'boolean'))
        fail('名人の 本文の せっていが 正しく ありません');
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
            // (a body saved without an ID is named by its owner and event, as the run finds it)
            (parts.length === 3 && parts[1] === item.ownerId && events.includes(parts[2]) && item.id === parts[1] &&
              item.targetId === item.ownerId && item.event === parts[2]))
          : definitionKeys.get(item.key)?.ownerId !== item.ownerId) ||
        astByKey.has(item.key) ||
        item.ast?.kind !== 'Script' ||
        !Array.isArray(item.ast.body)
      )
        fail('動きの 中身が こわれて います');
      const watched = item.event || parts[2];
      if ((watched === 'touchStart' && !isEdgeTarget(item.filter?.target) && !p.components.some(c => c.name === item.filter?.target)) ||
        (watched === 'conditionTrue' && typeof item.ast.heading?.condition?.kind !== 'string') ||
        (watched === 'interval' && typeof item.ast.heading?.seconds?.kind !== 'string'))
        fail('きっかけの 中身が 正しく ありません');
      if (item.filter != null) {
        const event = item.event || parts[2], field = event === 'keyDown' ? 'key' : event === 'message' ? 'message' : event === 'touchStart' ? 'target' : null;
        if (!field || !exactKeys(item.filter, [field]) || typeof item.filter[field] !== 'string' ||
          cpLen(item.filter[field]) > LIMITS.stringChars) fail('きっかけの キーや 合図の 名前が 正しく ありません');
      }
      if (item.ast.rules !== undefined && (!Array.isArray(item.ast.rules) || item.ast.rules.length > LIMITS.scripts))
        fail('つづけて 動く ルールが 正しく ありません');
      for (const rule of item.ast.rules || []) {
        if (rule?.kind !== 'ContinuousRule' || !validActorRef(rule.actorRef) ||
          !directions.includes(rule.direction) ||
          ['condition', 'seconds', 'distance'].some(key => !(rule as Record<string, unknown>)[key] || typeof ((rule as Record<string, unknown>)[key] as { kind?: unknown }).kind !== 'string'))
          fail('つづけて 動く ルールの「だれが」「どの向きへ」「どんな あいだ」「どの速さで」の どれかが 正しく ありません');
      }
      // Validate units in every saved expression, including currently unreachable branches.
      const pending: LooseNode[] = [item.ast];
      while (pending.length) {
        const node = pending.pop();
        if (!node || typeof node !== 'object') continue;
        if (['ExtensionCommand', 'ExtensionCalculation'].includes(node.kind)) {
          // (describe finds nothing for a name that is not text; a command or a calculation is an Operation)
          const operation = extensions.describe(node.name as string, node.kind === 'ExtensionCommand' ? 'commands' : 'calculations');
          if (!operation || !Array.isArray(node.args) || node.args.length !== (operation as Operation).args.length) fail('かくちょうの ブロックと 入れる ものが 合いません');
        }
        if (node.kind === 'Hole') fail('書きかけの ところを さいごまで 書いて ください');
        // A node has a form a run reads and each part its form always has (an extension's checks are its own, above).
        if (typeof node.kind === 'string' && !['ExtensionCommand', 'ExtensionCalculation'].includes(node.kind)) {
          const form = runtimeForm(node);
          if (!form || form.some(([key, type]) => !partHolds(type, node[key]))) fail('動きの 中身が こわれて います');
        }
        // The parts of a sentence or a value the run reads as lists and as values: a list of sentences, a list of values
        // (a block's own definition lists its parameters' names), a value, and the variable or list a sentence names.
        // Only a part with a kind has them: a record in the tree with no kind keeps text under the same names (a heading's
        // filter is {message:'合図'}, {key:'a'} or {target:'端'}).
        if (typeof node.kind === 'string' && (
          ['body', 'thenBody', 'elseBody', 'units'].some(key => node[key] !== undefined && (!Array.isArray(node[key]) || !(node[key] as unknown[]).every(isNode))) ||
          ['args', 'items', 'targets'].some(key => node[key] !== undefined && (!Array.isArray(node[key]) ||
            !(node[key] as unknown[]).every(x => isNode(x) || (key === 'args' && node.kind === 'ActionDefinition' && typeof x === 'string')))) ||
          ['arg', 'condition', 'count', 'distance', 'duration', 'index', 'initial', 'left', 'list', 'message', 'question', 'right', 'seconds', 'x', 'y']
            .some(key => node[key] !== undefined && !isNode(node[key])) ||
          (node.value !== null && typeof node.value === 'object' && !isNode(node.value)) ||
          (node.target !== undefined && !(record(node.target) && typeof node.target.name === 'string'))))
          fail('動きの 中身が こわれて います');
        if (['actorRef', 'speaksAs'].some(key => Object.hasOwn(node, key) && !validActorRef(node[key] as LooseRef, node))) fail('動かす キャラクターや 部品が 正しく ありません');
        if (node.kind === 'MoveUntil' && !directions.includes(node.direction)) fail('動く 向きが 正しく ありません');
        // The move sentences: 前へ／後ろへ, one leg per axis (both for 決めたばしょへ行く), and 〜のところへ行く's partner.
        if (node.kind === 'MotionCommand' && ((node.op === 'MOVE' && !['forward', 'backward'].includes(node.direction)) ||
          (['GOTO', 'MOVE_BY'].includes(node.op) && (!['right', 'left'].includes(node.xDir) || !['up', 'down'].includes(node.yDir) ||
            (node.op === 'GOTO' ? !(node.x && node.y) : !(node.x || node.y)))) ||
          (node.op === 'GOTO_PART' && (!Array.isArray(node.args) || node.args.length !== 1))))
          fail('動く 向きが 正しく ありません');
        // Values made while running are never saved.
        if (['PartValue', 'DeadlineBound', 'EventCountBound'].includes(node.kind)) fail('動きの 中身が こわれて います');
        if (node.argumentNames !== undefined && (!Array.isArray(node.argumentNames) ||
          node.argumentNames.some(name => typeof name !== 'string' || !name || cpLen(name) > 32) ||
          new Set(node.argumentNames).size !== node.argumentNames.length ||
          (node.argumentNames.length && node.argumentNames.length !== node.args?.length)))
          fail('入れる ものの 名前が 正しく ありません');
        if (node.kind === 'QuantityLiteral' &&
            (!UNIT_TAGS.includes(node.unit) || !node.value || typeof node.value !== 'object'))
          fail('数の たんいか 計算が 正しく ありません');
        if (node.kind === 'UnitlessRead' && (!node.value || typeof node.value !== 'object'))
          fail('数だけを 取り出す 計算が 正しく ありません');
        if (node.kind === 'NumberLiteral' && !finite(node.value)) fail('数の 計算が 正しく ありません');
        for (const [key, value] of Object.entries(node)) {
          // (who a sentence is for and the rule 名人 picks a part by are no nodes: a who read from a value has one)
          if (['actorRef', 'speaksAs', 'by'].includes(key)) { if (record(value) && value.kind === 'value') pending.push(value.value as LooseNode); continue; }
          if (Array.isArray(value)) for (const entry of value) pending.push(entry as LooseNode);
          else if (value && typeof value === 'object') pending.push(value as LooseNode);
        }
      }
      items.push(item);
      astByKey.set(item.key, item.ast);
    }
    if ([...definitionKeys.keys()].some(key => !astByKey.has(key)))
      fail('自分で作ったブロックの 中身が ありません');
    const compiled: RunnableProgram = {
      items,
      // (a Hole was refused above, so every rule is a ContinuousRule)
      rules: items.flatMap(item => (item.ast.rules || []).map((rule, index) => ({
        ...rule, id: `${item.key}:rule:${index}`, targetId: item.targetId || item.ownerId,
      }))) as RunnableProgram['rules'],
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
        fail('絵や音の 中身が 正しく ありません');
      if (
        !(
          a.kind === 'image'
            ? ['image/png', 'image/jpeg', 'image/webp']
            : ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/flac', 'audio/ogg']
        ).includes(a.mime)
      )
        fail('絵や音の しゅるいが 正しく ありません');
      total += a.byteLength;
      const known = packed?.get(a.id),
        checked = !!known && VERIFIED_ASSET_TEXT.get(known.record) === a.dataBase64 && known.text === a.dataBase64 && known.record?.sha256 === a.sha256 && known.record.byteLength === a.byteLength;
      let decodedLength: number | undefined;
      try{if(!checked)decodedLength=decodedBase64Length(a.dataBase64);}catch(error){if(!(error instanceof AkariError))throw error;fail('絵や音の 中身を 表す 文字が 正しく ありません');}
      if (total > LIMITS.assetRawTotal || (!checked && decodedLength !== a.byteLength))
        fail('絵や音の 大きさが 正しく ありません');
      const bytes = checked ? known.record.bytes : decodeBase64(a.dataBase64);
      if (!checked && sha256Fallback(bytes) !== a.sha256)
        fail('絵や音の 中身が こわれて います');
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
    UNIT_TAGS, RUNTIME_FORMS,
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
    keySurface,
    BUILTIN_META,
    AkariError,
    ScriptSignal,
    cpLen,
    tailText,
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
    restoreExecutable, verifiedAssetText,
  };
}
