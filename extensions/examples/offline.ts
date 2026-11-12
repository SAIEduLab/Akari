/* SPDX-License-Identifier: MIT */
import type { Definition, ExtensionHost } from '../types.d.ts';
// The factories hold no type syntax: register embeds a factory as its text (toString), so the types come from
// `satisfies Definition` around it, and a handler checks the values it is given (the host gives a Value and the state as Json).
export const offline = {
  manifest: {
    id: 'demo.offline', name: '数の記憶', version: '1.2.1', apiContract: 1,
    standard: { languageContractId: 5, runtimeContractId: 5 },
    description: '数を2倍にする計算と、値を記憶してできごとを出す命令。',
    dependencies: [], capabilities: [], offline: true, selfContained: true,
    state: { formatVersion: 1, initial: { value: 0 }, persist: 'project' },
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
    const remembered = () => {
      const state = api.getState();
      if (!state || typeof state !== 'object' || Array.isArray(state) || typeof state.value !== 'number' || !Number.isFinite(state.value)) throw new Error('記憶した数が不正です');
      return state.value;
    };
    return {
      commands: { remember(args) { api.setState({ value: args[0] }); api.emit('changed', args[0]); return args[0]; } },
      calculations: {
        double(args) { const value = args[0]; if (typeof value !== 'number') throw new Error('数を受け取ります'); return value * 2; },
        remembered,
      },
      initialize() { remembered(); },
      dispose() {},
    };
  },
} satisfies Definition;
export const text = {
  manifest: {
    id: 'demo.text', name: '文字の加工', version: '1.2.1', apiContract: 1,
    standard: { languageContractId: 5, runtimeContractId: 5 },
    description: '数の実例とは独立した、文字を加工する拡張。',
    dependencies: [], capabilities: [], offline: true, selfContained: true,
    state: { formatVersion: 1, initial: null }, commands: [], events: [],
    calculations: [{ id: 'shout', name: '文字にびっくりを付ける', description: '英字を大文字にして、文字の後ろに!を付ける。',
      args: [{ name: '文字', type: 'string', unit: null }], returns: { type: 'string', unit: null }, async: false }],
  },
  factory: function textExampleFactory() {
    return { commands: {}, calculations: { shout(args) { const text = args[0]; if (typeof text !== 'string') throw new Error('文字を受け取ります'); return text.toUpperCase() + '!'; } } };
  },
} satisfies Definition;
export function installAkariOfflineExample(host: ExtensionHost) { return host.register(offline.manifest, offline.factory); }
export function installAkariTextExample(host: ExtensionHost) { return host.register(text.manifest, text.factory); }
