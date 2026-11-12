import { createAkariProfiles } from '../../extensions/profiles.ts';
import { createAkariExtensionHost } from '../../extensions/foundation.ts';
import { createRuntimeBase } from './01-runtime-base.ts';
import { createRuntimeModel } from './01-runtime-model.ts';
import { createRuntimeScheduler } from './01-runtime-scheduler.ts';
import { createRuntimeRestore } from './01-runtime-restore.ts';
import { createAkariRuntime } from './01-runtime.ts';
import { createAkariStageView } from './08-stage-view.ts';
import { mountAkariPlayer } from './08-player.ts';
import { AKARI_LICENSE, PRODUCT_RELEASE } from './00-prelude.ts';
import { AKARI_RUNTIME, AkariError, AssetStore, EXTENSION_HOST, FOUNDATION_CONFIGURATION, LIMITS, collectRuntimeAssetRequirements } from './02-language-contracts.ts';
import { withDefaultMascotAsset } from './03-default-assets-core.ts';
import { compileProject, serializedRoot, validateSerializedProjectStructure } from './07-semantic-analysis.ts';
import type { Diagnostic } from '../types/compiled.d.ts';
import type { Project } from '../types/project.d.ts';
import type { AssetRecord } from '../types/runtime.d.ts';
import type { ExecutableData } from '../types/view.d.ts';

// ────────────────────────────────────────────────────────────────────────
// 08 — Portable stage view and standalone export
// ────────────────────────────────────────────────────────────────────────
export const AKARI_STAGE_CSS =
  ':root{\n    --bg:#edf2f8;\n    --panel:#f6f8fb;\n    --panel2:#ffffff;\n    --panel3:#e9eef6;\n    --surface:#ffffff;\n    --surface-2:#f8fbff;\n    --dark:#1f2937;\n    --muted:#5f6b7a;\n    --line:#c7d2df;\n    --line-strong:#a9b8ca;\n    --hilite:#ffffff;\n    --shadow:rgba(38,57,89,.14);\n    --shadow-strong:rgba(27,39,58,.22);\n    --title1:#315a96;\n    --title2:#5076b6;\n    --title3:#6f92cb;\n    --accent:#2f6fd6;\n    --accent-soft:#eaf2ff;\n    --accent-strong:#1f56b4;\n    --danger:#c43b3b;\n    --success:#1d7d44;\n    --code:#fbfcfe;\n    --console:#1d2430;\n    --console-fg:#eef3fb;\n    --select:#2f6fd6;\n    --radius-sm:7px;\n    --radius:10px;\n    --radius-lg:14px;\n  }\n#formSurface{\n    position:relative;width:640px;height:400px;overflow:hidden;background-color:#fff;\n    background-image:radial-gradient(rgba(94,126,168,.24) 1px,transparent 1px);\n    background-size:10px 10px;background-position:left -5px bottom -5px;cursor:default\n  }\n#penCanvas{position:absolute;inset:0;z-index:1;pointer-events:none}\n.component{position:absolute;z-index:2;user-select:none;transform-origin:center center}\n.ak-label{display:flex;align-items:center;white-space:pre-wrap;overflow:hidden;padding:2px 4px}\n.ak-button{\n    display:flex;align-items:center;justify-content:center;\n    border:1px solid var(--line-strong);border-radius:8px;\n    background:linear-gradient(180deg,#ffffff 0%,#eaf1fb 100%);\n    padding:2px 8px;cursor:pointer;\n    box-shadow:0 1px 0 rgba(255,255,255,.8) inset,0 1px 3px rgba(24,36,54,.08)\n  }\n.ak-button:active{transform:translateY(1px)}\n.ak-input{border:1px solid var(--line-strong);border-radius:8px;background:#fff;padding:3px 8px}\n.ak-box{border:1px solid #c5d2e2;border-radius:10px;background:linear-gradient(180deg,#fbfcfe 0%,#eef3f8 100%)}\n.ak-sprite{display:flex;align-items:center;justify-content:center;font-size:34px;cursor:pointer;background:transparent;line-height:1}\n.sprite-bubble{overflow-wrap:anywhere;max-height:160px;overflow:hidden;\n    position:absolute;z-index:20;background:#fff;border:1px solid #b7c5d8;border-radius:12px;padding:6px 10px;\n    min-width:40px;max-width:180px;pointer-events:none;box-shadow:0 8px 18px rgba(48,67,97,.18);white-space:pre-wrap\n  }\n.costume-img{width:100%;height:100%;object-fit:fill;pointer-events:none;user-select:none}\n.component{touch-action:none}\n.component.ak-input{touch-action:auto}\n.sprite-bubble{font-size:13px}\n.sprite-bubble::before{content:attr(data-speaker);display:block;font-size:0.8em;margin-bottom:var(--speech-heading-gap,3px);margin-right:var(--speech-full-space,0px)}' + "\n.sprite-bubble [data-speech-full]::before { content:attr(data-label); }\n.sprite-bubble[data-show-speaker=\"false\"]::before{content:none;display:none}";
const AKARI_PLAYER_CSS =
  '*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#edf2f8;color:#1f2937;font:14px "Yu Gothic UI","Yu Gothic","Meiryo",sans-serif}button,input{font:inherit}button{padding:7px 12px;background:#fff;border:1px solid #a9b8ca;border-radius:7px;cursor:pointer}button:disabled{opacity:.5;cursor:default}button:focus-visible,input:focus-visible{outline:3px solid #2f6fd6;outline-offset:2px}#playerRoot{width:max-content;min-width:min(100%,640px);max-width:100%;margin:0 auto;padding:14px}header{margin-bottom:12px}h1{font-size:20px;margin:0 0 10px;overflow-wrap:anywhere}.player-controls{display:flex;align-items:center;flex-wrap:wrap;gap:8px}#playerPause{display:inline-grid;justify-items:center}#playerPause[hidden]{display:none}#playerPause>span{grid-area:1/1}#playerPause[data-paused="true"]>.pl-pause,#playerPause:not([data-paused="true"])>.pl-cont,#playerPause[data-idle="true"]{visibility:hidden}#playerStatus{font-size:12px;color:#536273;margin-left:6px}.player-stage{max-width:100%;overflow:auto;border:1px solid #bccbe0;border-radius:10px;background:#fff}#formSurface{outline:none}#formSurface:focus-visible{outline:2px solid #2f6fd6;outline-offset:-2px}#playerOutput{max-height:130px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:#fff;border:1px solid #c7d2df;border-radius:8px;margin:12px 0 0}.modal{display:none;position:fixed;inset:0;background:rgba(25,37,55,.4);z-index:10000;align-items:center;justify-content:center;padding:16px}.modal.show{display:flex}.question-box{width:min(500px,100%);max-height:90vh;overflow:auto;background:#fff;padding:20px;border-radius:12px;box-shadow:0 12px 35px #0003}#questionText{white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:14px;font-weight:700}#questionAnswer{width:100%;padding:8px;border:1px solid #a9b8ca;border-radius:7px}.question-controls{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}@media(max-width:600px){#playerRoot{padding:8px}h1{font-size:17px}}\n';


// The functions the exported player embeds through toString(), in the order src/akari.html includes them: every
// top-level function of the modules it marks portable.
export const PORTABLE_FUNCTIONS = Object.freeze([createAkariProfiles, createAkariExtensionHost, createRuntimeBase, createRuntimeModel, createRuntimeScheduler, createRuntimeRestore, createAkariRuntime, createAkariStageView, mountAkariPlayer]);
export function packExecutable(project: Project, assetStore: InstanceType<typeof AssetStore> | null | undefined) {
  assetStore = withDefaultMascotAsset(project, assetStore || new AssetStore());
  const compiled = compileProject(project);
  if (compiled.errors.length) {
    const error = new AkariError(
      'X601',
      '作品の まちがいを 直してから、うごく作品を ファイルにしてね',
    );
    // (the error carries the work's mistakes)
    (error as InstanceType<typeof AkariError> & { diagnostics?: Diagnostic[] }).diagnostics = compiled.errors;
    throw error;
  }
  const root = serializedRoot(project, assetStore);
  validateSerializedProjectStructure(root);
  const requirements = collectRuntimeAssetRequirements(compiled, project),
    used = new Set([...requirements.imageIds, ...requirements.audioIds]);
  // (every object of the tree is gone through as a record; a node's kind is read from it)
  function clean(value: unknown): unknown {
    if (Array.isArray(value)) return value.filter((x) => (x as { kind?: unknown } | null)?.kind !== 'CommentLine').map(clean);
    if (value && typeof value === 'object') {
      const out: { [key: string]: unknown } = {};
      for (const [key, v] of Object.entries(value))
        // 名人: topicEnded and mustName on a 自分 subject are read only by 作品チェック.
        if ((value as { kind?: unknown }).kind === 'self' && ['topicEnded', 'mustName'].includes(key)) continue;
        else if (
          ![
            'source',
            'raw',
            'inlineComment',
            'elseComment',
            'headingComment',
            'binderComment',
            'endLine',
            'whileForm',
            'untilForm',
            'waitForm',
            'boolExpr',
          ].includes(key)
        )
          out[key] = clean(v);
      return out;
    }
    return value;
  }
  const program = compiled.items.map((item) => ({
    key: item.key, ownerId: item.ownerId, ast: clean(item.ast),
    ...(item.meijin ? { meijin: true } : {}),
    ...(item.key.startsWith('script:') ? { id: item.id || item.scriptId || item.key.split(':')[1],
      targetId: item.targetId, event: item.event, filter: item.filter || null } : {}),
    // A procedure made in a 名人 script's text carries its name and inputs (it is in no list of procedures).
    ...(item.definition?.meijin ? { definition: { id: item.definition.id, ownerId: 'stage', name: item.definition.name, args: [...item.definition.args],
      scriptId: item.definition.scriptId, line: item.definition.line } } : {}),
  }));
  const p = {
    name: root.name,
    stage: root.stage,
    projectData: root.projectData,
    components: root.components,
    actions: root.actions.map(({ id, ownerId, name, args, callPhrase }) => ({ id, ownerId, name, args, ...(callPhrase !== undefined ? {callPhrase} : {}) })),
    functions: root.functions.map(({ id, ownerId, name, args }) => ({ id, ownerId, name, args })),
    sounds: root.sounds.filter((s) => used.has(s.assetId)),
  };
  const assets = root.assets
    .filter((a) => used.has(a.id))
    // (the work's pictures and sounds are in the store: validateSerializedProjectStructure has found them)
    .map((a) => ({ ...a, meta: { ...assetStore.get(a.id)!.meta } }));
  return {
    ...(Object.hasOwn(root, 'extensions') ? { extensions: root.extensions } : {}),
    schema: 'akari-executable',
    appVersion: PRODUCT_RELEASE,
    ...AKARI_RUNTIME.EXECUTABLE_CONTRACT,
    project: p,
    program,
    assets,
  };
}
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
// (the pattern takes only the table's characters)
function escapeHtmlText(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as { readonly [c: string]: string })[c],
  );
}
export function generateStandaloneHtml(project: Project, assetStore: InstanceType<typeof AssetStore> = new AssetStore(), { presentation = 'controls' }: { presentation?: string } = {}): string {
  if (!['controls', 'artwork'].includes(presentation)) throw new AkariError('X605', '作品の はじめ方が 正しく ありません');
  const artwork = presentation === 'artwork';
  assetStore = withDefaultMascotAsset(project, assetStore || new AssetStore());
  const payload = packExecutable(project, assetStore),
    payloadJson = inlineJson(payload),
    title = escapeHtmlText(payload.project.name);
  // The file is made only when its player would open it: the same check the player runs on the same JSON. Packing
  // has just hashed each asset's bytes and written its text, so that text is not decoded and hashed a second time.
  // (the data read back is the one just packed, whose pictures and sounds are in the store)
  AKARI_RUNTIME.restoreExecutable(JSON.parse(payloadJson) as ExecutableData,
    { packed: new Map<string, { text: string; record: AssetRecord }>(payload.assets.map(a => [a.id, { text: a.dataBase64, record: assetStore.get(a.id)! }])) });
  const definitions = EXTENSION_HOST.exportDefinitions();
  const selected = AKARI_RUNTIME.profiles.describe();
  const configuration = `{extensions:[${definitions.map(x => `{manifest:${inlineJson(x.manifest)},factory:(${x.factorySource})}`).join(',')}],profiles:${inlineJson(selected.profiles.map(({id,version,limits})=>({id,version,limits})))},profile:${inlineJson(selected.selected ? {id:selected.selected.id,version:selected.selected.version} : null)},allowedCapabilities:${inlineJson(FOUNDATION_CONFIGURATION.allowedCapabilities || [])}}`;
  const script = `'use strict';\n${PORTABLE_FUNCTIONS.map(f => f.toString()).join('\n')}\nmountAkariPlayer(createAkariRuntime(${configuration}),createAkariStageView,${payloadJson},${inlineJson({artwork})});`;
  if (/<\/script/i.test(script))
    throw new AkariError(
      'X603',
      'うごく作品を 安全な ファイルに できなかったよ',
    );
  const html =
    '<!DOCTYPE html>\n<!-- SPDX-License-Identifier: MIT -->\n<!--\n' +
    AKARI_LICENSE +
    '\n-->\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src blob:; media-src blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'\">\n" +
    '<title>' +
    title +
    '</title>\n<style>' +
    AKARI_STAGE_CSS +
    '\n' +
    AKARI_PLAYER_CSS +
    '\nhtml{overscroll-behavior-x:none}' +
    // No dots before the first paint either (renderStage paints the backdrop alone).
    '\n#formSurface{background-image:none}' +
    (artwork ? '\n#formSurface .component{touch-action:pinch-zoom}' : '') +
    (artwork ? '\nhtml,body{background:transparent}#playerRoot{min-width:0;max-width:none;margin:0;padding:0}.player-stage{position:relative;max-width:none;overflow:visible;border:0;border-radius:0;background:transparent}.stage-viewport{margin:0!important}#playerActivation{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1000;background:transparent}#playerActivation[hidden]{display:none}#playerActivate{border:2px solid #000;border-radius:12px;background:#fff;color:#000;opacity:1;max-width:100%;padding:12px 18px;font-weight:700}#playerOutput{max-width:100vw}' : '') +
    // On a touch screen the player's buttons are 40 px tall, as the editor's are.
    '\n@media(pointer:coarse){.player-controls button,.question-controls button{min-height:40px}}' +
    '</style>\n</head>\n<body>\n' +
    '<main id="playerRoot">' + (artwork ? '' : '<header><h1 id="playerTitle">' +
    title +
    '</h1><div class="player-controls"><button id="playerStart" disabled>▶ 動かす</button><button id="playerStop" hidden>■ 止める</button><button id="playerPause" hidden><span class="pl-pause">⏸ いったん止める</span><span class="pl-cont">▶ つづける</span></button><span id="playerStatus" role="status">読みこみ中</span></div></header>') +
    '<div class="player-stage"' + (artwork ? ' style="width:' + payload.project.stage.width + 'px;height:' + payload.project.stage.height + 'px"' : '') + '><div id="formSurface" tabindex="0"><canvas id="penCanvas"></canvas></div>' + (artwork ? '<div id="playerActivation" hidden><button id="playerActivate" type="button">ここを おして はじめる</button></div>' : '') + '</div><pre id="playerOutput" role="log" hidden></pre></main>' +
    '<div class="modal" id="questionModal" role="dialog" aria-modal="true" aria-labelledby="questionText"><div class="question-box"><div id="questionText"></div><input id="questionAnswer" aria-label="\u7b54\u3048" autocomplete="off"><div class="question-controls"><button id="questionStop">■ 止める</button><button id="questionSubmit">\u7b54\u3048\u308b</button></div></div></div>' +
    '<noscript>この 作品を 動かすには、JavaScriptを 使えるように して ください。</noscript>\n<script>\n' +
    script +
    '\n<' +
    '/script>\n</body>\n</html>\n';
  if (new TextEncoder().encode(html).length > LIMITS.executableBytes)
    throw new AkariError(
      'X604',
      '作品が 大きすぎて、うごく作品の ファイルに できないよ。絵や 音を へらして みてね',
    );
  return html;
}
export function safeDownloadName(name: unknown): string {
  const s = String(name)
    .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/, '');
  return s || 'akari';
}

