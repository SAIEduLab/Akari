/* SPDX-License-Identifier: Apache-2.0 */
const AkariOfflineExample = {
  manifest: {
    id: 'demo.offline', version: '1.0.0', apiContract: 1,
    standard: { languageContractId: 2, runtimeContractId: 2 },
    description: '数を2倍にする計算と、値を記憶してできごとを出す命令。',
    dependencies: [], capabilities: [], offline: true, selfContained: true,
    state: { formatVersion: 1, initial: { value: 0 } },
    commands: [{ id: 'remember', name: '数を記憶する', description: '記憶した値を返し、変化のできごとを出す。',
      args: [{ name: '値', type: 'number', unit: null }], returns: { type: 'number', unit: null }, async: false }],
    calculations: [
      { id: 'double', name: '数を2倍にする', description: '受け取った数の2倍を返す。',
        args: [{ name: '値', type: 'number', unit: null }], returns: { type: 'number', unit: null }, async: false },
      { id: 'remembered', name: '記憶した数', description: '最後に記憶した数を返す。',
        args: [], returns: { type: 'number', unit: null }, async: false },
    ],
    events: [{ id: 'changed', name: '記憶した数が変わった', description: '記憶した数を渡す。', payload: { type: 'number', unit: null } }],
  },
  factory: function offlineExampleFactory(api) {
    return {
      commands: { remember(args) { api.setState({ value: args[0] }); api.emit('changed', args[0]); return args[0]; } },
      calculations: { double(args) { return args[0] * 2; }, remembered() { return api.getState().value; } },
      initialize() {
        const state = api.getState();
        if (!state || typeof state.value !== 'number' || !Number.isFinite(state.value)) throw new Error('記憶した数が不正です');
      },
      dispose() {},
    };
  },
};
const AkariTextExample = {
  manifest: {
    id: 'demo.text', version: '1.0.0', apiContract: 1,
    standard: { languageContractId: 2, runtimeContractId: 2 },
    description: '数の実例とは独立した、文字を加工する拡張。',
    dependencies: [], capabilities: [], offline: true, selfContained: true,
    state: { formatVersion: 1, initial: null }, commands: [], events: [],
    calculations: [{ id: 'shout', name: '文字にびっくりを付ける', description: '英字を大文字にして、文字の後ろに!を付ける。',
      args: [{ name: '文字', type: 'string', unit: null }], returns: { type: 'string', unit: null }, async: false }],
  },
  factory: function textExampleFactory() { return { commands: {}, calculations: { shout(args) { return args[0].toUpperCase() + '!'; } } }; },
};
function installAkariOfflineExample(host) { return host.register(AkariOfflineExample.manifest, AkariOfflineExample.factory); }
function installAkariTextExample(host) { return host.register(AkariTextExample.manifest, AkariTextExample.factory); }
if (typeof globalThis !== 'undefined') globalThis.AkariExtensionExamples = { offline: AkariOfflineExample, text: AkariTextExample };
if (typeof module !== 'undefined' && module.exports) module.exports = { offline: AkariOfflineExample, text: AkariTextExample };
