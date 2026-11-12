/* SPDX-License-Identifier: MIT */
import type { Definition, ExtensionHost } from '../types.d.ts';
// An extension whose operations only 名人 text may use (scope "meijin"): no block, not in an ordinary body.
export const meijin = {
  manifest: {
    id: 'demo.meijin', name: '名人の記録', version: '1.1.1', apiContract: 1,
    standard: { languageContractId: 5, runtimeContractId: 5 },
    description: '名人の本文でだけ使える、数を記録する命令と、記録した数を読む計算。',
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
      calculations: { last() {
        const state = api.getState();
        if (!state || typeof state !== 'object' || Array.isArray(state) || typeof state.value !== 'number') throw new Error('記録した数が不正です');
        return state.value;
      } },
    };
  },
} satisfies Definition;
export function installAkariMeijinExample(host: ExtensionHost) { return host.register(meijin.manifest, meijin.factory); }
