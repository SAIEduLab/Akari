/* SPDX-License-Identifier: MIT */
/* This factory is deliberately self-contained: the product embeds it verbatim. */
function createAkariExtensionHost(options) {
  'use strict';
  options = options || {};
  const API_CONTRACT = 1;
  const standard = Object.freeze({ languageContractId: 2, runtimeContractId: 2, ...(options.standard || {}) });
  const records = new Map(), names = new Set(), connections = new Set();
  let session = null, sequence = 0, savedState = {}, sealed = false;
  const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  function json(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object' || (!Array.isArray(value) && !plain(value)) || seen.has(value))
      fail('E701', '拡張のデータは有限のJSON値にします');
    seen.add(value);
    if (Array.isArray(value) && (Object.keys(value).length !== value.length || value.some((_,index)=>!own(value,index))))
      fail('E701','拡張の配列は空の項目を含められません');
    const out = Array.isArray(value) ? value.map(item => json(item, seen)) : {};
    if (!Array.isArray(value)) for (const key of Object.keys(value).sort()) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('E701', '拡張データのキーが不正です');
      out[key] = json(value[key], seen);
    }
    seen.delete(value);
    return out;
  }
  const copy = value => json(value);
  const canonical = value => JSON.stringify(json(value));
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function keys(value, required, optional = []) {
    return plain(value) && required.every(key => own(value, key)) &&
      Object.keys(value).every(key => required.includes(key) || optional.includes(key));
  }
  const identifier = value => typeof value === 'string' && !['constructor','prototype','__proto__'].includes(value) &&
    /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value) && value.length <= 120;
  const version = value => typeof value === 'string' && /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(value);
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  function sha256(text) {
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const bytes = new TextEncoder().encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
    const data = new Uint8Array(size); data.set(bytes); data[bytes.length] = 128;
    const view = new DataView(data.buffer), bits = bytes.length * 8;
    view.setUint32(size - 8, Math.floor(bits / 4294967296)); view.setUint32(size - 4, bits >>> 0);
    const hash = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const rotate = (value, count) => (value >>> count) | (value << (32 - count));
    for (let offset = 0; offset < size; offset += 64) {
      const words = new Uint32Array(64);
      for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const x = words[i - 15], y = words[i - 2];
        words[i] = (words[i - 16] + (rotate(x,7)^rotate(x,18)^(x>>>3)) + words[i - 7] + (rotate(y,17)^rotate(y,19)^(y>>>10))) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = hash;
      for (let i = 0; i < 64; i++) {
        const first = (h + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^((~e)&g)) + constants[i] + words[i]) >>> 0;
        const second = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
        h=g; g=f; f=e; e=(d+first)>>>0; d=c; c=b; b=a; a=(first+second)>>>0;
      }
      [a,b,c,d,e,f,g,h].forEach((value,i) => { hash[i] = (hash[i] + value) >>> 0; });
    }
    return hash.map(value => value.toString(16).padStart(8,'0')).join('');
  }
  function spec(value, allowVoid = false) {
    if (!keys(value, ['type','unit']) || !['number','string','boolean','list','value',...(allowVoid?['void']:[])].includes(value.type) ||
      !(value.unit === null || (value.type === 'number' && ['歩','秒','度','回','番目','点','個','％','Hz'].includes(value.unit))))
      fail('E701', '拡張の型・単位が不正です');
  }
  function valueCheck(value, shape) {
    if (shape.type === 'void') { if (value !== undefined && value !== null) fail('E705','戻り値のない命令です'); return null; }
    if (options.validateValue) { const checked = options.validateValue(value, shape); return copy(checked === undefined ? value : checked); }
    const quantity = plain(value) && keys(value,['magnitude','unit']) && Number.isFinite(value.magnitude);
    const number = typeof value === 'number' && Number.isFinite(value);
    const scalar = item => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)) ||
      (plain(item) && keys(item,['magnitude','unit']) && Number.isFinite(item.magnitude) && ['歩','秒','度','回','番目','点','個','％','Hz'].includes(item.unit));
    const valid = shape.type === 'number' ? (shape.unit === null ? number : quantity && value.unit === shape.unit) :
      shape.type === 'string' ? typeof value === 'string' : shape.type === 'boolean' ? typeof value === 'boolean' :
      shape.type === 'list' ? Array.isArray(value) && value.every(scalar) : scalar(value) || (Array.isArray(value) && value.every(scalar));
    if (!valid) fail('E705','拡張の値の型・単位が一致しません');
    return copy(value);
  }
  function register(input, factory) {
    if (session || sealed) fail('E702','起動設定の確定後は拡張を登録できません');
    const manifest = copy(input);
    if (!keys(manifest,['id','version','apiContract','standard','description','dependencies','capabilities','offline','selfContained','state','commands','calculations','events']) ||
      !identifier(manifest.id) || !version(manifest.version) || manifest.apiContract !== API_CONTRACT ||
      canonical(manifest.standard) !== canonical(standard) || typeof manifest.description !== 'string' ||
      typeof manifest.offline !== 'boolean' || typeof manifest.selfContained !== 'boolean' ||
      !Array.isArray(manifest.dependencies) || !Array.isArray(manifest.capabilities) ||
      manifest.capabilities.some(value => typeof value !== 'string' || !value || value.startsWith('rpc.') || value.startsWith('akari.')) ||
      new Set(manifest.capabilities).size !== manifest.capabilities.length ||
      !keys(manifest.state,['formatVersion','initial']) || !Number.isSafeInteger(manifest.state.formatVersion) || manifest.state.formatVersion < 1 ||
      typeof factory !== 'function') fail('E701','拡張の登録情報が不正です');
    if (records.has(manifest.id)) fail('E702', `拡張「${manifest.id}」は登録済みです`);
    const dependencyIds = new Set();
    for (const dependency of manifest.dependencies) {
      if (!keys(dependency,['id','version','contentHash']) || !identifier(dependency.id) || !version(dependency.version) ||
        !digest(dependency.contentHash) || dependencyIds.has(dependency.id)) fail('E701','拡張の依存情報が不正です');
      dependencyIds.add(dependency.id);
      const found = records.get(dependency.id);
      if (!found || found.manifest.version !== dependency.version || found.contentHash !== dependency.contentHash)
        fail('E703',`必要な拡張「${dependency.id}」の版・内容が一致しません`);
    }
    const ids = new Set(), proposedNames = new Set();
    for (const kind of ['commands','calculations','events']) {
      if (!Array.isArray(manifest[kind])) fail('E701','拡張の機能一覧が不正です');
      for (const operation of manifest[kind]) {
        const required = kind === 'events' ? ['id','name','description','payload'] : ['id','name','description','args','returns','async'];
        if (!keys(operation,required,kind==='events'?[]:['capability']) || !identifier(operation.id) || ids.has(operation.id) ||
          typeof operation.name !== 'string' || !operation.name.trim() || /[\r\n「」]/.test(operation.name) ||
          typeof operation.description !== 'string' || names.has(operation.name) || proposedNames.has(operation.name) ||
          (options.reservedNames || []).includes(operation.name)) fail('E702','拡張の識別子・名前が不正または重複しています');
        ids.add(operation.id); proposedNames.add(operation.name);
        if (kind === 'events') spec(operation.payload);
        else {
          if (!Array.isArray(operation.args) || typeof operation.async !== 'boolean' || (kind === 'calculations' && operation.async) ||
            (own(operation,'capability') && !manifest.capabilities.includes(operation.capability))) fail('E701','拡張の引数・非同期契約が不正です');
          const argumentNames = new Set();
          for (const arg of operation.args) {
            if (!keys(arg,['name','type','unit']) || typeof arg.name !== 'string' || !arg.name || argumentNames.has(arg.name)) fail('E701','拡張の引数名が不正です');
            argumentNames.add(arg.name); spec({type:arg.type,unit:arg.unit});
          }
          spec(operation.returns,kind==='commands');
        }
      }
    }
    const factorySource = Function.prototype.toString.call(factory);
    if (!/^(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.test(factorySource) || /^function\s*\*/.test(factorySource) ||
      /\[native code\]|<\/script/i.test(factorySource)) fail('E701','拡張factoryは書き出せる同期の関数リテラルにします');
    const contentHash = sha256(canonical(manifest) + '\n' + factorySource);
    records.set(manifest.id,{manifest:freeze(manifest),factory,factorySource,contentHash});
    proposedNames.forEach(name => names.add(name));
    savedState[manifest.id] = copy(manifest.state.initial);
    return Object.freeze({id:manifest.id,version:manifest.version,contentHash});
  }
  const kindKey = kind => ({command:'commands',calculation:'calculations',event:'events',commands:'commands',calculations:'calculations',events:'events'})[kind];
  function operations(kind) {
    const key = kindKey(kind); if (!key) fail('E701','拡張の機能区分が不正です');
    return [...records.values()].flatMap(record => record.manifest[key].map(operation => freeze({
      ...copy(operation), displayName:operation.name, name:record.manifest.id+'/'+operation.id,
      qualifiedName:record.manifest.id+'/'+operation.id, extensionId:record.manifest.id, kind:key,
    })));
  }
  function describe(name, kind) {
    return operations(kind).find(operation => operation.name === name) || null;
  }
  function locate(name, kind) {
    const operation = describe(name,kind); if (!operation) fail('E703',`拡張機能「${name}」がありません`);
    return {operation,record:records.get(operation.extensionId)};
  }
  function active(captured = session) {
    if (!captured || captured !== session || captured.controller.signal.aborted) fail('E706','拡張の実行sessionは終了しています');
    return captured;
  }
  function checkedArguments(operation,args) {
    if (!Array.isArray(args) || args.length !== operation.args.length) fail('E705','拡張に渡す値の数が違います');
    return args.map((value,index) => valueCheck(value,operation.args[index]));
  }
  function invoke(name,kind,args,context = {}) {
    const current = active(), {operation} = locate(name,kind), instance = current.instances.get(operation.extensionId);
    if (operation.capability && !(current.capabilities.includes(operation.capability))) fail('E707','この実行では拡張の能力が許可されていません');
    const handler = instance?.[kindKey(kind)]?.[operation.id];
    if (typeof handler !== 'function') fail('E704','登録した拡張の処理がありません');
    const values = checkedArguments(operation,args);
    if(context.signal?.aborted)fail('E706','拡張の処理を取り消しました');
    const signal=context.signal||current.controller.signal;
    const result = handler(values,Object.freeze({...context,sessionId:current.id,signal}));
    const thenable = result != null && typeof result.then === 'function';
    if (thenable && !operation.async) { Promise.resolve(result).catch(()=>{}); fail('E705','同期の拡張処理はPromiseを返せません'); }
    if (!thenable) return valueCheck(result,operation.returns);
    return new Promise((resolve,reject) => {
      const cancelled = () => { cleanup(); const error=new Error('拡張の処理を取り消しました');error.code='E706';reject(error); };
      const cleanup = () => { current.controller.signal.removeEventListener('abort',cancelled);signal.removeEventListener('abort',cancelled); };
      current.controller.signal.addEventListener('abort',cancelled,{once:true});
      signal.addEventListener('abort',cancelled,{once:true});
      Promise.resolve(result).then(value=>{cleanup();try{active(current);resolve(valueCheck(value,operation.returns));}catch(error){reject(error);}},error=>{cleanup();reject(error);});
    });
  }
  function restoreState(input) {
    if (session) fail('E706','実行中の拡張状態は復元できません');
    if (!Array.isArray(input)) fail('E701','拡張状態の一覧が不正です');
    const next = {...savedState}, found = new Set();
    for (const item of input) {
      if (!keys(item,['id','formatVersion','value']) || found.has(item.id)) fail('E701','拡張状態が不正または重複しています');
      const record = records.get(item.id);
      if (!record || item.formatVersion !== record.manifest.state.formatVersion) fail('E703','拡張状態の版が一致しません');
      found.add(item.id); next[item.id] = copy(item.value);
    }
    savedState = next;
  }
  function snapshotState() {
    return [...records.values()].map(record=>({id:record.manifest.id,formatVersion:record.manifest.state.formatVersion,
      value:copy((session?session.state:savedState)[record.manifest.id])}));
  }
  function initialState() {
    return [...records.values()].map(record=>({id:record.manifest.id,formatVersion:record.manifest.state.formatVersion,
      value:copy(record.manifest.state.initial)}));
  }
  function endSession() {
    const old=session; if(!old)return;
    if(old.initialized)savedState=copy(old.state);
    session=null; connections.forEach(connection=>connection.close('session ended')); old.controller.abort();
    for(const instance of old.instances.values()) try {
      const result=instance.dispose?.(); if(result?.then)Promise.resolve(result).catch(error=>options.onError?.(error));
    } catch(error) { options.onError?.(error); }
  }
  function beginSession(settings = {}) {
    const capabilities=settings.capabilities||options.allowedCapabilities||[];
    if(!Array.isArray(capabilities)||new Set(capabilities).size!==capabilities.length||
      capabilities.some(value=>typeof value!=='string'||!value||(options.allowedCapabilities&&!options.allowedCapabilities.includes(value))))
      fail('E707','実行sessionの能力はホストが明示的に許可します');
    if(session)endSession();
    if(settings.state!==undefined)restoreState(settings.state);
    const current={id:'session-'+(++sequence),controller:new AbortController(),instances:new Map(),state:copy(savedState),
      capabilities:[...capabilities],onEvent:settings.onEvent};
    session=current;
    try {
      for(const record of records.values()) {
        const id=record.manifest.id;
        const api=Object.freeze({
          get signal(){return current.controller.signal;}, get sessionId(){return current.id;},
          get connector(){active(current);return [...connections].find(connection=>connection.ready)||null;},
          getState(){active(current);return copy(current.state[id]);},
          setState(value){active(current);current.state[id]=copy(value);},
          emit(eventId,payload){active(current);const event=record.manifest.events.find(item=>item.id===eventId);
            if(!event)fail('E705','未登録の拡張できごとです');
            current.onEvent?.({name:id+'/'+eventId,payload:valueCheck(payload,event.payload),sessionId:current.id});},
        });
        const instance=record.factory(api);
        if(!plain(instance)||instance.then)fail('E704','拡張factoryは同期の処理オブジェクトを返します');
        current.instances.set(id,instance);
        for(const kind of ['commands','calculations'])for(const operation of record.manifest[kind])
          if(typeof instance[kind]?.[operation.id]!=='function')fail('E704','登録機能の実装がありません');
        const initialized=instance.initialize?.();
        if(initialized?.then){Promise.resolve(initialized).catch(()=>{});fail('E704','拡張の初期化は同期で行います');}
      }
      current.initialized=true;
      return current.id;
    } catch(error) {endSession();throw error;}
  }
  function requirements() {
    return {apiContract:API_CONTRACT,standard:copy(standard),required:[...records.values()].map(record=>({
      id:record.manifest.id,version:record.manifest.version,contentHash:record.contentHash})),
      capabilities:[...new Set([...records.values()].flatMap(record=>record.manifest.capabilities))].sort()};
  }
  function validateRequirements(envelope) {
    if(!keys(envelope,['apiContract','standard','required','capabilities'],['profile','state']) || envelope.apiContract!==API_CONTRACT ||
      canonical(envelope.standard)!==canonical(standard) || !Array.isArray(envelope.required) || !Array.isArray(envelope.capabilities) ||
      new Set(envelope.capabilities).size!==envelope.capabilities.length || envelope.capabilities.some(value=>typeof value!=='string'))
      fail('E703','拡張の実行契約が一致しません');
    const ids=new Set(),declared=new Set();
    for(const item of envelope.required) {
      if(!keys(item,['id','version','contentHash'])||ids.has(item.id))fail('E703','必要拡張の記録が不正です');
      ids.add(item.id);const found=records.get(item.id);
      if(!found||found.manifest.version!==item.version||found.contentHash!==item.contentHash)fail('E703',`必要な拡張「${item.id}」の版・内容が一致しません`);
      found.manifest.capabilities.forEach(value=>declared.add(value));
      for(const dependency of found.manifest.dependencies)if(!envelope.required.some(value=>value.id===dependency.id&&value.version===dependency.version&&value.contentHash===dependency.contentHash))
        fail('E703','必要な依存拡張が記録されていません');
    }
    if(envelope.capabilities.some(value=>!declared.has(value))||[...declared].some(value=>!envelope.capabilities.includes(value)))fail('E703','必要能力の記録が一致しません');
    if(own(envelope,'state')) {
      if(!Array.isArray(envelope.state)||envelope.state.length!==ids.size)fail('E703','必要拡張の状態が不足しています');
      const stateIds=new Set();
      for(const item of envelope.state) {
        if(!keys(item,['id','formatVersion','value'])||!ids.has(item.id)||stateIds.has(item.id)||
          item.formatVersion!==records.get(item.id).manifest.state.formatVersion)fail('E703','拡張状態の識別子・版が一致しません');
        copy(item.value);stateIds.add(item.id);
      }
    }
    if(own(envelope,'profile')&&options.validateProfileRequirement)options.validateProfileRequirement(envelope.profile);
    return true;
  }
  function exportDefinitions() {
    return [...records.values()].map(record=>{
      if(!record.manifest.selfContained)fail('E708',`拡張「${record.manifest.id}」は自己完結書き出しに対応していません`);
      return {manifest:copy(record.manifest),factorySource:record.factorySource,contentHash:record.contentHash};
    });
  }
  function rpcError(code,message,id=null,data) {
    return {jsonrpc:'2.0',id,error:{code,message,...(data===undefined?{}:{data})}};
  }
  function connectWindow(targetWindow, settings = {}) {
    const current=active();
    if(!targetWindow||typeof targetWindow.postMessage!=='function'||typeof window==='undefined'||typeof MessageChannel==='undefined')
      fail('E707','接続相手のウィンドウがありません');
    if(typeof settings.origin!=='string'||!settings.origin||settings.origin==='*')fail('E707','接続相手のoriginを明示してください');
    const requested=copy(settings.capabilities||[]),allowed=options.allowedCapabilities||current.capabilities;
    if(!Array.isArray(requested)||new Set(requested).size!==requested.length||requested.some(value=>typeof value!=='string'||!allowed.includes(value)||!current.capabilities.includes(value)))
      fail('E707','接続能力はホストが明示的に許可します');
    const timeoutMs=settings.timeoutMs===undefined?10000:settings.timeoutMs;
    if(!Number.isFinite(timeoutMs)||timeoutMs<=0)fail('E707','接続timeoutは正の有限値にします');
    const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);
    const nonce=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
    const connectionId=current.id+'/connection-'+(++sequence),helloId=connectionId+'/hello',probeId=connectionId+'/probe';
    const channel=new MessageChannel(),port=channel.port1,pending=new Map();
    let closed=false,ready=false,helloSent=false,requestSequence=0,eventSequence=0,granted=[],handshakeTimer,probeTimer,rejectHandshake;
    function error(message,code='E707'){const value=new Error(message);value.code=code;return value;}
    function send(value){if(closed)throw error('接続は終了しています');port.postMessage(copy(value));}
    function close(reason='connection closed') {
      if(closed)return;closed=true;ready=false;clearTimeout(handshakeTimer);clearInterval(probeTimer);window.removeEventListener('message',handshake);
      current.controller.signal.removeEventListener('abort',aborted);
      for(const entry of pending.values()){entry.cleanup();entry.reject(error(reason));}pending.clear();
      port.onmessage=null;port.onmessageerror=null;port.close();channel.port2.close();connections.delete(connector);
      rejectHandshake?.(error(reason));rejectHandshake=null;
    }
    const aborted=()=>close('session ended');
    function checkMethod(method) {
      if(typeof method!=='string'||!method||method.startsWith('rpc.')||method.startsWith('akari.')||!granted.includes(method))
        throw error('未許可のコネクタ機能です');
    }
    function checkRequestOptions(requestOptions) {
      if(!plain(requestOptions))throw error('要求optionsはObjectです');
      const duration=requestOptions.timeoutMs===undefined?timeoutMs:requestOptions.timeoutMs,signal=requestOptions.signal;
      if(!Number.isFinite(duration)||duration<=0)throw error('要求timeoutは正の有限値にします');
      if(signal!==undefined&&(!signal||typeof signal.aborted!=='boolean'||typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function'))
        throw error('要求signalはAbortSignalです');
      return {duration,signal};
    }
    function newRequest(method,params,requestOptions={}) {
      active(current);if(!ready||closed)throw error('コネクタは未接続です');checkMethod(method);
      if(params!==undefined&&!(plain(params)||Array.isArray(params)))throw error('JSON-RPC paramsはObjectまたはArrayです');
      const checkedParams=params===undefined?undefined:copy(params);
      const {duration,signal}=checkRequestOptions(requestOptions);
      const id=connectionId+'/request-'+(++requestSequence);
      let resolve,reject,timer;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
      const cancel=()=>{if(!pending.has(id))return;pending.delete(id);cleanup();
        if(!closed)send({jsonrpc:'2.0',method:'akari.cancel',params:{connectionId,sessionId:current.id,id}});
        reject(error('要求を取り消しました','E706'));};
      if(signal?.aborted){reject(error('要求を取り消しました','E706'));return {promise,message:null};}
      pending.set(id,{resolve,reject,cleanup});signal?.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>{if(!pending.has(id))return;pending.delete(id);cleanup();
        if(!closed)try{send({jsonrpc:'2.0',method:'akari.cancel',params:{connectionId,sessionId:current.id,id}});}catch(cause){close(cause.message);}
        reject(error('要求がtimeoutしました'));},duration);
      return {promise,message:{jsonrpc:'2.0',method,...(checkedParams===undefined?{}:{params:checkedParams}),id}};
    }
    const connector={get ready(){return ready&&!closed;},get connectionId(){return connectionId;},get sessionId(){return current.id;},
      get capabilities(){return [...granted];},
      request(method,params,requestOptions){const item=newRequest(method,params,requestOptions);if(item.message)try{send(item.message);}catch(cause){close(cause.message);}return item.promise;},
      notify(method,params){active(current);if(!ready||closed)throw error('コネクタは未接続です');checkMethod(method);
        if(params!==undefined&&!(plain(params)||Array.isArray(params)))throw error('JSON-RPC paramsはObjectまたはArrayです');
        send({jsonrpc:'2.0',method,...(params===undefined?{}:{params})});},
      batch(items){if(!Array.isArray(items)||!items.length)throw error('batchには要求が必要です');
        const messages=[],promises=[];
        active(current);if(!ready||closed)throw error('コネクタは未接続です');
        const checkedItems=items.map(item=>{if(!plain(item)||typeof item.method!=='string')throw error('batch要求が不正です');
          checkMethod(item.method);if(item.params!==undefined&&!(plain(item.params)||Array.isArray(item.params)))throw error('JSON-RPC paramsが不正です');
          checkRequestOptions(item);
          return {...item,...(item.params===undefined?{}:{params:copy(item.params)})};});
        for(const item of checkedItems){if(item.notification){messages.push({jsonrpc:'2.0',method:item.method,...(item.params===undefined?{}:{params:item.params})});}
          else{const next=newRequest(item.method,item.params,item);if(next.message)messages.push(next.message);promises.push(next.promise);}}
        if(messages.length)try{send(messages);}catch(cause){close(cause.message);}return Promise.all(promises);},
      close(reason){if(ready&&!closed)try{send({jsonrpc:'2.0',method:'akari.close',params:{connectionId,sessionId:current.id}});}catch(_){}close(reason);},
    };
    function process(message) {
      if(!plain(message))return rpcError(-32600,'Invalid Request');
      const responseCandidate=!own(message,'method')&&(own(message,'result')||own(message,'error'));
      if(message.jsonrpc!=='2.0')return responseCandidate?null:rpcError(-32600,'Invalid Request');
      if(own(message,'method')) {
        const hasId=own(message,'id'),validId=!hasId||message.id===null||typeof message.id==='string'||(typeof message.id==='number'&&Number.isFinite(message.id));
        if(typeof message.method!=='string'||!validId||(own(message,'params')&&!plain(message.params)&&!Array.isArray(message.params)))return rpcError(-32600,'Invalid Request');
        let response;
        if(message.method==='akari.event') {
          const params=message.params;
          if(!keys(params,['connectionId','sessionId','sequence','extensionId','eventId','payload'])||params.connectionId!==connectionId||params.sessionId!==current.id||
            !Number.isSafeInteger(params.sequence)||params.sequence!==eventSequence+1)response=rpcError(-32602,'Invalid params',hasId?message.id:null);
          else {
            try {active(current);const record=records.get(params.extensionId),event=record?.manifest.events.find(item=>item.id===params.eventId);
              if(!event||record.manifest.offline||!record.manifest.capabilities.some(value=>granted.includes(value)))throw error('未許可のできごとです');
              const payload=valueCheck(params.payload,event.payload);eventSequence=params.sequence;
              current.onEvent?.({name:params.extensionId+'/'+params.eventId,payload,sessionId:current.id,connectionId,sequence:eventSequence});
              response={jsonrpc:'2.0',id:message.id,result:null};
            }catch(cause){response=rpcError(-32602,'Invalid params',hasId?message.id:null,{message:cause.message});}
          }
        } else if(message.method==='akari.close') {
          if(!keys(message.params,['connectionId','sessionId'])||message.params.connectionId!==connectionId||message.params.sessionId!==current.id)
            response=rpcError(-32602,'Invalid params',hasId?message.id:null);
          else {response={jsonrpc:'2.0',id:message.id,result:null};setTimeout(()=>close('peer disconnected'),0);}
        } else response=rpcError(-32601,'Method not found',hasId?message.id:null);
        return hasId?response:null;
      }
      if(!responseCandidate)return rpcError(-32600,'Invalid Request');
      if(!keys(message,['jsonrpc','id'],['result','error'])||own(message,'result')===own(message,'error')||
        !(message.id===null||typeof message.id==='string'||(typeof message.id==='number'&&Number.isFinite(message.id))))return null;
      if(own(message,'error')&&(!keys(message.error,['code','message'],['data'])||!Number.isInteger(message.error.code)||typeof message.error.message!=='string'))return null;
      const entry=pending.get(message.id);if(!entry)return null;
      pending.delete(message.id);entry.cleanup();
      try{active(current);if(own(message,'error')){const cause=error(message.error.message);cause.rpc=copy(message.error);entry.reject(cause);}else entry.resolve(copy(message.result));}
      catch(cause){entry.reject(cause);}return null;
    }
    port.onmessage=event=>{
      if(!ready||closed||session!==current)return;
      let input;try{input=typeof event.data==='string'?JSON.parse(event.data):copy(event.data);}catch(_){send(rpcError(typeof event.data==='string'?-32700:-32600,typeof event.data==='string'?'Parse error':'Invalid Request'));return;}
      if(Array.isArray(input)) {
        if(!input.length){send(rpcError(-32600,'Invalid Request'));return;}
        const responses=input.map(process).filter(Boolean);if(responses.length)send(responses);
      } else {const response=process(input);if(response)send(response);}
    };
    port.onmessageerror=()=>close('message deserialization failed');port.start();
    let resolveHandshake;
    function handshake(event) {
      if(event.source!==targetWindow||event.origin!==settings.origin||closed)return;
      const message=event.data;
      if(!helloSent&&keys(message,['jsonrpc','id','result'])&&message.jsonrpc==='2.0'&&message.id===probeId&&
        keys(message.result,['nonce'])&&message.result.nonce===nonce) {
        helloSent=true;clearInterval(probeTimer);
        try{targetWindow.postMessage({jsonrpc:'2.0',method:'akari.hello',id:helloId,params:{nonce,connectionId,sessionId:current.id,
          apiContract:API_CONTRACT,standard:copy(standard),capabilities:requested}},settings.origin==='null'?'*':settings.origin,[channel.port2]);}
        catch(cause){close(cause.message);}return;
      }
      if(!plain(message)||message.jsonrpc!=='2.0'||message.id!==helloId)return;
      if(!helloSent)return;
      const result=message.result;
      try {
      if(!keys(message,['jsonrpc','id','result'])||!keys(result,['nonce','connectionId','apiContract','standard','capabilities'])||
        result.nonce!==nonce||result.connectionId!==connectionId||result.apiContract!==API_CONTRACT||canonical(result.standard)!==canonical(standard)||
        !Array.isArray(result.capabilities)||new Set(result.capabilities).size!==result.capabilities.length||result.capabilities.some(value=>!requested.includes(value))) {
        close('connector contract mismatch');return;
      }
      if(requested.some(value=>!result.capabilities.includes(value))){close('required connector capability missing');return;}
      granted=[...result.capabilities];ready=true;clearTimeout(handshakeTimer);window.removeEventListener('message',handshake);
      rejectHandshake=null;resolveHandshake(connector);
      } catch(cause) {close(cause.message);}
    }
    const promise=new Promise((resolve,reject)=>{resolveHandshake=resolve;rejectHandshake=reject;});
    connections.add(connector);window.addEventListener('message',handshake);current.controller.signal.addEventListener('abort',aborted,{once:true});
    handshakeTimer=setTimeout(()=>close('connector handshake timeout'),timeoutMs);
    function probe(){if(closed||helloSent)return;try{targetWindow.postMessage({jsonrpc:'2.0',method:'akari.probe',id:probeId,params:{nonce}},settings.origin==='null'?'*':settings.origin);}catch(cause){close(cause.message);}}
    probeTimer=setInterval(probe,100);probe();return promise;
  }
  if(!keys(standard,['languageContractId','runtimeContractId'])||Object.values(standard).some(value=>!Number.isSafeInteger(value)||value<1))
    fail('E701','基礎Standardの契約番号が不正です');
  return Object.freeze({apiContract:API_CONTRACT,standard,register,operations,describe,seal(){sealed=true;},get sealed(){return sealed;},
    invokeCalculation:(name,args,context)=>invoke(name,'calculations',args,context),
    invokeCommand:(name,args,context)=>invoke(name,'commands',args,context),
    beginSession,endSession,requirements,validateRequirements,initialState,snapshotState,restoreState,exportDefinitions,connectWindow,
    get sessionId(){return session?.id||null;},get active(){return !!session;}});
}
if (typeof globalThis !== 'undefined') globalThis.createAkariExtensionHost = createAkariExtensionHost;
