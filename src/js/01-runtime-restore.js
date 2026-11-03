  // ────────────────────────────────────────────────────────────────────────
  // 01 — createAkariRuntime, continued: restoring an executable, and the runtime it returns. It closes here.
  // ────────────────────────────────────────────────────────────────────────
    function validProducerLabel(value) {
      return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/.test(value);
    }
    // packed (only when a file is made, generateStandaloneHtml): the file's assets by id, each with the record whose bytes
    // were hashed while packing and the text made from them. An asset whose text is that same text is not decoded and
    // hashed again; every other check still runs. The player passes nothing and checks every asset.
    const VERIFIED_ASSET_TEXT=new WeakMap();
    function verifiedAssetText(record){
      const kept=VERIFIED_ASSET_TEXT.get(record);if(kept!==undefined)return kept;
      const bytes=record?.bytes;
      if(!(bytes instanceof Uint8Array)||bytes.length!==record.byteLength||sha256Fallback(bytes)!==record.sha256)
        throw new AkariError('F508','絵や音の 中身が、ほぞんした ときと 合いません');
      const text=encodeBase64(bytes);if(IMMUTABLE_ASSET_RECORDS.has(record))VERIFIED_ASSET_TEXT.set(record,text);return text;
    }
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
      if(Object.hasOwn(p.stage,'showSpeechNames')&&typeof p.stage.showSpeechNames!=='boolean')
        fail('ふきだしに 名前を 出すか どうかの せっていが 正しく ありません');
      validateRuntimeData(p, fail);
      const ownerIds = new Set(['stage', ...p.components.map(c => c.id)]);
      const callPhrases=new Set();
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
          d.args.some(a => typeof a !== 'string' || !a || cpLen(a) > 32) || !safeId(d.scriptId) || !Number.isSafeInteger(d.line) || d.line < 1 ||
          p.actions.some(a => a.name === d.name))
          fail('名人の 本文で 作った てじゅんが 正しく ありません');
        return { ...d, meijin: true };
      });
      if (new Set(textActions.map(d => d.name)).size !== textActions.length) fail('名人の 本文で 作った てじゅんが 正しく ありません');
      const definitionKeys = new Map([
        ...p.actions.map(d => [`action:${d.id}`, d]),
        ...textActions.map(d => [`action:${d.id}`, d]),
        ...p.functions.map(d => [`function:${d.id}`, d]),
      ]);
      if ([...definitionKeys.values()].some(d => d.ownerId !== 'stage'))
        fail('自分で作ったブロックの 持ち主が 正しく ありません');
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
              (parts.length === 3 && parts[1] === item.ownerId && events.includes(parts[2])))
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
            ['condition', 'seconds', 'distance'].some(key => !rule[key] || typeof rule[key].kind !== 'string'))
            fail('つづけて 動く ルールの「だれが」「どの向きへ」「どんな あいだ」「どの速さで」の どれかが 正しく ありません');
        }
        // Validate units in every saved expression, including currently unreachable branches.
        const pending = [item.ast];
        while (pending.length) {
          const node = pending.pop();
          if (!node || typeof node !== 'object') continue;
          if (['ExtensionCommand', 'ExtensionCalculation'].includes(node.kind)) {
            const operation = extensions.describe(node.name, node.kind === 'ExtensionCommand' ? 'commands' : 'calculations');
            if (!operation || !Array.isArray(node.args) || node.args.length !== operation.args.length) fail('かくちょうの ブロックと 入れる ものが 合いません');
          }
          if (node.kind === 'Hole') fail('書きかけの ところを さいごまで 書いて ください');
          if (Object.hasOwn(node, 'actorRef') && !validActorRef(node.actorRef, node)) fail('動かす キャラクターや 部品が 正しく ありません');
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
        let decodedLength;
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
      keySurface,
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
      restoreExecutable, verifiedAssetText,
    };
  }

