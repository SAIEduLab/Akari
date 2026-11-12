/* SPDX-License-Identifier: MIT */
import type { Definition, ExtensionHost } from '../types.d.ts';
// The extension that connector.html speaks for: an external connection (offline: false) whose capabilities are those
// the page answers, and whose event is the one the page sends (「数のできごとを送る」 sends sample with a number). Its
// commands and calculations are none: what it asks of the page it asks through api.connector.
export const connector = {
  manifest: {
    id: 'demo.connector', name: '接続の実例', version: '1.2.1', apiContract: 1,
    standard: { languageContractId: 5, runtimeContractId: 5 },
    description: '別ウィンドウの接続用ページ（connector.html）とつなぎ、そのページが送る数をできごとで受け取る。',
    dependencies: [], capabilities: ['demo.add', 'demo.event'], offline: false, selfContained: true,
    state: { formatVersion: 1, initial: null }, commands: [], calculations: [],
    events: [{ id: 'sample', name: '接続先から数が届いた', description: '接続用ページが送った数を渡す。', payload: { type: 'number', unit: null } }],
  },
  factory: function connectorExampleFactory() {
    return { commands: {}, calculations: {} };
  },
} satisfies Definition;
export function installAkariConnectorExample(host: ExtensionHost) { return host.register(connector.manifest, connector.factory); }
