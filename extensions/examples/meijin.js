/* SPDX-License-Identifier: MIT */
// An extension whose operations only 名人 text may use (scope "meijin"): no block, not in an ordinary body.
const AkariMeijinExample = {
  manifest: {
    id: 'demo.meijin', name: '名人の記録', version: '1.0.0', apiContract: 1,
    standard: { languageContractId: 4, runtimeContractId: 4 },
    description: '名人モードの本文でだけ使える、数を記録する命令と、記録した数を読む計算。',
    dependencies: [], capabilities: [], offline: true, selfContained: true,
    state: { formatVersion: 1, initial: { value: 0 } },
    commands: [{ id: 'record', name: '数を記録する', description: '数を記録し、記録したできごとを出す。', scope: 'meijin',
      args: [{ name: '値', type: 'number', unit: null }], returns: { type: 'void', unit: null }, async: false }],
    calculations: [{ id: 'last', name: '記録した数', description: '最後に記録した数を返す。', scope: 'meijin',
      args: [], returns: { type: 'number', unit: null }, async: false }],
    events: [{ id: 'recorded', name: '記録した', description: '記録した数を渡す。', scope: 'meijin', payload: { type: 'number', unit: null } }],
  },
  factory: function meijinExampleFactory(api) {
    return {
      commands: { record(args) { api.setState({ value: args[0] }); api.emit('recorded', args[0]); } },
      calculations: { last() { return api.getState().value; } },
    };
  },
};
function installAkariMeijinExample(host) { return host.register(AkariMeijinExample.manifest, AkariMeijinExample.factory); }
if (typeof globalThis !== 'undefined') globalThis.AkariMeijinExtensionExample = AkariMeijinExample;
if (typeof module !== 'undefined' && module.exports) module.exports = { meijin: AkariMeijinExample };
