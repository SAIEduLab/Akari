# あかりの拡張を組み込む

あかり 1.1.1 の拡張API契約は `1` です。拡張は派生作者が管理するJavaScriptを、派生HTMLの起動設定に組み込みます。本家の標準HTMLは追加処理を登録せず、通常操作・標準の意味・標準上限・通信禁止を維持します。

製品の意味・保存契約の正本は [LANGUAGE.md](LANGUAGE.md)、受入試験と証跡の契約は [AUDIT.md](AUDIT.md) です。このガイドは開発手順とAPIの使い方を説明します。第三者が同じJavaScript空間へ組み込んだコードを完全隔離する仕組みではありません。

## 最小の派生HTMLを作る

[offline.js](extensions/examples/offline.js) は、互いに独立した二つの追加処理を提供します。`demo.offline` は2倍の計算・値の記憶・変化のできごと、`demo.text` は文字の加工を行います。それぞれ `{manifest, factory}` を持ち、factory は外側の変数を参照しません。

ビルド補助の `extensions/build.mjs` から `buildDerivedProduct` を呼びます。出力先には元の製品とは別のpathを指定します。

```js
import { buildDerivedProduct } from './extensions/build.mjs';
import examples from './extensions/examples/offline.js';

await buildDerivedProduct({
  product: './Akari1_1_1.html',
  output: './derived-offline.html',
  extensions: [examples.offline, examples.text],
  profiles: [],
  allowedCapabilities: [],
});
```

生成した派生HTMLだけで編集・実行できます。標準の利用にNode.jsやビルド補助を要求しません。製品を直接フォークして変更する場合も、`configureAkariFoundation()` の起動設定へ同じ登録情報とfactoryを含めます。登録はエディタの文型・ブロック表を作る前に完了し、起動後の `Akari.extensions` は登録を確定したホストです。後から任意のJavaScriptをインストールする管理画面は提供しません。

追加命令と計算の日本語表記は、拡張IDと機能IDを明示します。

```text
拡張「demo.offline」「remember」（9）
拡張計算「demo.offline」「double」（7）を言う
拡張計算「demo.text」「shout」（「hello」）を言う
```

登録された命令・計算のブロックも同じ定義を使います。入力欄の名前・個数・型・単位はmanifestから決まります。できごとは `extension-id/event-id` で識別され、製品の知らせの入口へ接続されます。できごとの値の読み方ときっかけの表記はLANGUAGEを参照してください。

## 登録情報

型定義は [types.d.ts](extensions/types.d.ts)、自己完結した実装factoryは [foundation.js](extensions/foundation.js) にあります。

| 項目 | 契約 |
| --- | --- |
| `id`、機能の `id` | 小文字英字で始まるASCII識別子。英小文字・数字と `. _ -` の区切り、120文字以内 |
| `version` | `major.minor.patch`、任意のpre-release/build記録 |
| `apiContract` | `1` |
| `standard` | 基礎Standardの `languageContractId` と `runtimeContractId`。製品版とは独立 |
| `dependencies` | 必要拡張の `id/version/contentHash`。依存先を先に登録 |
| `capabilities` | 明示許可が必要なコネクタ機能名。`rpc.`、`akari.` を使わない |
| `offline` | 本体に含めた処理とローカルデータだけで動く場合 `true` |
| `selfContained` | 処理factoryを実行HTMLに含められる場合 `true` |
| `state` | 状態形式の正整数 `formatVersion` とJSONの `initial` |
| `commands`、`calculations` | `id/name/description/args/returns/async`。任意の `capability` |
| `events` | `id/name/description/payload` |

引数は `{name,type,unit}`、結果とできごとの値は `{type,unit}` で定義します。型は `number/string/boolean/list/value`、命令の結果だけ `void` も使えます。数の単位は `歩/秒/度/回/番目/点/個/％/Hz` または単位なしの `null`。単位付き数の実際の値は `{magnitude,unit}` です。リストは既存の数・文字・条件の答えを並べた値です。Promiseや任意オブジェクトを作品の式の値へ混入させません。

同じ拡張IDの再登録、機能ID・日本語名の重複、標準の予約名との衝突、契約不一致、依存先不足を診断します。登録失敗では登録表を変更しません。登録名を固定された標準の文型に差し込むことはできません。

登録時に、キーを整列したmanifestとfactoryの `Function.prototype.toString()` の間へ改行を一つ入れたUTF-8列のSHA-256を求めます。これが `contentHash` です。ID・版が同じでも内容hashが違えば復元を拒否します。factoryの空白やコメント変更も同一性に影響します。

## factoryと実行の寿命

`register(manifest, factory)` は同期でIdentityを返します。factoryは `function example(api) { ... }` または同期のarrow関数として宣言します。オブジェクトのmethod省略形・async関数・generator・bound/native関数は使いません。factoryは各実行sessionの開始時に新しく呼ばれ、次のAPIを受け取ります。

| API | 用途 |
| --- | --- |
| `getState()`、`setState(json)` | この拡張だけの保存状態のcopy取得・置換 |
| `emit(eventId,payload)` | 登録したできごとの値を検証して送る |
| `signal`、`sessionId` | sessionの取消と識別 |
| `connector` | 明示的に接続して版・能力を確認したコネクタ、未接続時は `null` |

factoryは `{commands, calculations, initialize?, dispose?}` を返します。機能表のキーはmanifestの機能ID、handlerは `(args, context)` です。contextには `signal/sessionId` と製品が提供する実行情報があります。factoryと `initialize()` は同期処理とし、失敗時は既に作ったinstanceを破棄します。`dispose()` は資源解放に使い、終了後の状態変更・できごと送信を行いません。

計算は `async:false` とし、即座に既存型の値を返します。命令は `async:true` ならPromiseを返せます。待機は呼出元の処理だけを止め、ほかのできごとや停止操作を処理します。長時間処理は `context.signal` を確認し、timer・外部要求を取り消してください。同期の無限ループを契約外のJavaScriptから強制停止する保証はありません。

停止はsessionのsignalをabortし、保留要求・接続・遅延結果を破棄します。古いfactory APIは状態変更やできごと送信を拒否します。停止前に確定した拡張状態は次のsnapshotへ保持します。初期化失敗の部分的な状態変更は保持しません。別作品へ状態を漏出させないため、製品は作品に保存した状態、または `initialState()` の初期状態を明示してsessionを開始します。製品の一時停止中は結果とできごとを順番に滞留させ、再開後に処理します。滞留の上限・流量とエラー扱いはLANGUAGEに従います。

`beginSession({state,onEvent,capabilities})` はsession IDを返し、`onEvent` は `{name,payload,sessionId,connectionId?,sequence?}` を受け取ります。製品はこの通知をschedulerへ渡します。`endSession()` は取消・破棄を行います。`operations(kind)` と `describe('id/member',kind)` は処理を実行せず説明情報を返します。機能区分は単数・複数の `command/calculation/event` を使えます。

## 保存と実行HTML

`requirements()` はAPI契約・Standard契約・必要拡張Identity・必要能力を返し、`validateRequirements(envelope)` は既知の版・内容・依存関係を照合します。保存のenvelopeはこの情報に `state` と選択した `profile` を含めます。stateには必要拡張ごとの `{id,formatVersion,value}` を一つずつ記録し、不足・重複・余分な状態・版不一致・JSON以外の値を拒否します。プロファイルの照合はホスト側のprofile registryが担当します。`snapshotState()` と `restoreState(records)` は同じ状態一覧を扱います。

標準作品には拡張の記録を追加しません。拡張作品には必要情報とJSON状態を記録し、作品ファイルから処理コード・profile・通信許可を自動導入しません。不足・不一致は現在作品を置き換える前に診断します。

`exportDefinitions()` は `{manifest,factorySource,contentHash}` を返します。ビルド・書き出しはfactoryを **関数のリテラル** としてinline scriptへ含め、保存ファイル由来の文字列を `eval` や `new Function` で実行しません。factoryは外側の変数へ依存せず、終了scriptタグを含めません。生成HTMLを別ブラウザーcontextで実行して、独立性を確認してください。外部依存型は処理コードを含められても、別の接続用ページやサービスへの明示接続が必要です。

## MessageChannelコネクタ

本体のCSPを保持し、別ウィンドウの [connector.html](extensions/examples/connector.html) とWeb Messagingで受け渡します。派生側の明示的な操作で `window.open()` したWindowを渡します。接続用ページは自身のネットワーク条件を持ちます。オンライン作品の通信を無通信とは扱いません。

```js
// An explicit derived-product operation; session must already be active.
const peer = window.open('./extensions/examples/connector.html', 'akari-connector');
const connector = await Akari.extensions.connectWindow(peer, {
  origin: 'null', // file: example only; HTTPS uses the exact HTTPS origin
  capabilities: ['demo.add'],
  timeoutMs: 10000,
});
const answer = await connector.request('demo.add', [7, 7], {signal});
```

起動設定の `allowedCapabilities` とsessionの許可能力に `demo.add` を含めます。接続がない作品から要求すれば明確に未接続の診断とし、勝手に接続用ページを開きません。credentialを本体へ含めず、特定サービスの認証・課金は外部ホストが担当します。

接続開始は、読み込み直後のpopupに要求を失わないよう、`akari.probe` 要求の `{nonce}` に対する同じID・nonceのresultを待ちます。本体は100ms間隔でprobeを再送し、接続timeoutを維持します。応答後に `akari.hello` のJSON-RPC要求を相手Windowへ送り、新しいMessagePortを一度だけ転送します。paramsは `{nonce,connectionId,sessionId,apiContract,standard,capabilities}`。相手は同じ要求IDのresultとして `{nonce,connectionId,apiContract,standard,capabilities}` を相手Windowへ返します。本体はexact Window/source、origin、nonce、接続ID、版、全必要能力を検証してからportを有効にします。ローカルfileの `null` originは単独の信頼根拠ではなく、送信のtargetOriginには `*` が必要です。受信時のsource・nonce・port結合は維持します。

portの通信はJSON-RPC 2.0です。ObjectとJSON文字列を受け付け、要求・result・error・通知・batchを処理します。`request()` はPromise、`notify()` は応答なし、`batch()` は要求の順序で結果のPromiseを返します。相手からの応答の順序には依存しません。通知への応答や、通知だけのbatchへの空配列応答は送りません。空batch、不正要求、不正params、不明method、parse失敗を規格のエラーコードで扱います。`rpc.*` は規格の予約名、`akari.*` は本補足契約の制御名です。

一般要求のmethod名は許可能力の名前と一致させます。要求IDはconnection/sessionを含み、保留表で所有します。timeout・signalのabort・切断・停止で保留を拒否し、重複・不明・古い応答を無視します。取消・timeout時には `akari.cancel` 通知を送り、paramsに `{connectionId,sessionId,id}` を含めます。`akari.close` は同じ接続・sessionの終了を通知します。再接続は新しい接続IDとnonceを使います。

外部できごとは `akari.event` 通知のparamsとして `{connectionId,sessionId,sequence,extensionId,eventId,payload}` を送ります。sequenceは接続ごとに1から一つずつ増やし、重複・逆順・欠落を拒否します。外部接続型の登録イベントと許可能力が必要です。型・単位を検証してからschedulerへ渡します。

このJSON-RPC経路だけでMCP互換、高速対戦同期、未知の外部実装の適合を宣言しません。[JSON-RPC 2.0](https://www.jsonrpc.org/specification) と [Web Messaging](https://html.spec.whatwg.org/multipage/web-messaging.html) が採用規格です。

## 派生上限と適合確認

[profile.js](extensions/examples/profile.js) は有限profileと上限なしprofileの登録情報です。`extensions/profiles.js` のinventoryで変更可能な項目・標準値・適用範囲を確認し、ビルドの `profiles` と `profile:{id,version}` へ指定します。未指定項目は標準を継承し、正の有限値は指定上限、`null` はソフトウェア上限なしです。作品の自己申告だけではprofileを切り替えません。型・参照・素材破損・ブラウザー制約は残ります。

公開の拡張監査は実製品と派生HTMLを使い、独立した処理の登録、日本語・ブロック、命令・計算・できごと、型・単位・衝突、状態保存・復元、別contextの単体実行、現行CSP下の実popup/MessageChannel、取消・timeout・古いsession、有限profile・上限なしを確認します。実行手順と必須結果はAUDITの拡張基盤試験を参照してください。実例を改変した派生作者は、その追加処理の適合を自身のfixtureと実ブラウザーで確認します。
