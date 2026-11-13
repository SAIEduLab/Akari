# あかりの拡張を組み込む

あかりの拡張API契約は `1` です。拡張は派生作者が管理するJavaScriptを、派生HTMLの起動設定に組み込みます。本家の標準HTMLは追加処理を登録せず、通常操作・標準の意味・標準上限・通信禁止を維持します。

製品の意味・保存契約の正本は [LANGUAGE_1_0_5.md](LANGUAGE_1_0_5.md)、受入試験と証跡の契約は [AUDIT.md](AUDIT.md) です。このガイドは開発手順とAPIの使い方を説明します。第三者が同じJavaScript空間へ組み込んだコードを完全隔離する仕組みではありません。

## 最小の派生HTMLを作る

[offline.ts](extensions/examples/offline.ts) は、互いに独立した二つの追加処理を提供します。`demo.offline` は2倍の計算・値の記憶・変化のできごと、`demo.text` は文字の加工を行います。それぞれ `{manifest, factory}` を持ち、factory は外側の変数を参照しません。

ビルド補助の `extensions/build.mjs` から `buildDerivedProduct` を呼びます。出力先には元の製品とは別のpathを指定します。ビルド補助と実例はTypeScriptのファイルを読むので、型をそのまま外して読めるNode.js（22.18以上）で動かします。ビルド補助は、派生の製品が起動するときと同じ確かめを登録情報にします。元の製品の組みこみの計算の名前（「四捨五入」など）と同じ拡張名・機能名は E702、元の製品の契約とちがう `standard` は E701 で、ビルドのときに止めます。登録情報は派生にJSONで書きこむので、ビルド補助はJSONにする前の書いたままの登録情報も同じく確かめます。NaN・Infinity の上限は E_PROFILE、manifest の中の NaN などは E701 で止め、`null`（上限なし）に書きかえません。上限を書かない項目（`undefined`）は、これまでどおり標準を継承します。

```js
import { buildDerivedProduct } from './extensions/build.mjs';
import { offline, text } from './extensions/examples/offline.ts';

await buildDerivedProduct({
  product: './Akari_1_0_5.html',
  output: './derived-offline.html',
  extensions: [offline, text],
  profiles: [],
  allowedCapabilities: [],
});
```

`allowedCapabilities`（実行に許可する能力）は、重ならない能力の名前の並びにします。そうでない値は、ビルド補助と派生の起動が E707 で止めます（どの実行も始められない派生を作らない）。

生成した派生HTMLだけで編集・実行できます。標準の利用にNode.jsやビルド補助を要求しません。製品を直接フォークして変更する場合も、`configureAkariFoundation()` の起動設定へ同じ登録情報とfactoryを含めます。登録はエディタの文型・ブロック表を作る前に完了し、起動後の `Akari.extensions` は登録を確定したホストです。後から任意のJavaScriptをインストールする管理画面は提供しません。

追加命令と計算は、登録した日本語の拡張名と機能名で書きます。ブロックと同じ名前なので、ブロックからコードへ切り替えても表記が変わりません。

```text
拡張「数の記憶」「数を記憶する」（9）
拡張計算「数の記憶」「数を2倍にする」（7）を言う
拡張計算「文字の加工」「文字にびっくりを付ける」（「hello」）を言う
```

`拡張「demo.offline」「remember」（9）` のように拡張ID・機能IDで書いた本文も同じ命令として読みます。整形とブロックからのコード生成は日本語名で出力します。日本語の拡張名（manifestの `name`）を登録していない拡張は、拡張名の位置に拡張IDを出力します。

登録された命令・計算のブロックも同じ定義を使います。入力欄の名前・個数・型・単位はmanifestから決まります。できごとは `extension-id/event-id` で識別され、製品の合図の入口へ接続されます。できごとの値の読み方ときっかけの表記はLANGUAGEを参照してください。

## 登録情報

型定義は [types.d.ts](extensions/types.d.ts)、自己完結した実装factoryは [foundation.ts](extensions/foundation.ts) にあります。

| 項目 | 契約 |
| --- | --- |
| `id`、機能の `id` | 小文字英字で始まるASCII識別子。英小文字・数字と `. _ -` の区切り、120文字以内 |
| `name` | 任意。コードとブロックに出す日本語の拡張名。60文字（コードポイントで数える）以内で「」・`\`・改行を含めず、ほかの拡張のID・日本語名、標準の予約名と重ならない |
| `version` | `major.minor.patch`。後ろに `-` か `+` で始まる記録（pre-releaseかbuild）を一つだけ付けられる（英数字・`.`・`-`）。両方は付けない |
| `apiContract` | `1` |
| `standard` | 基礎Standardの `languageContractId` と `runtimeContractId`。製品版とは独立 |
| `dependencies` | 必要拡張の `id/version/contentHash`。依存先を先に登録 |
| `capabilities` | 明示許可が必要なコネクタ機能名。`rpc.`、`akari.` を使わない |
| `offline` | 本体に含めた処理とローカルデータだけで動く場合 `true` |
| `selfContained` | 処理factoryを実行HTMLに含められる場合 `true`。`false` の拡張を作品の記録が挙げる（作品が使う、使う拡張がそれに依存する、状態が初期と違う）とき、書き出しを E709 で止めます |
| `state` | 状態形式の正整数 `formatVersion`、JSONの `initial`、任意の `persist`（`"run"` 既定、または `"project"`） |
| `commands`、`calculations` | `id/name/description/args/returns/async`。任意の `capability`。`name` は「」・`\`・改行を含めない（できごとも同じ） |
| `events` | `id/name/description/payload` |
| `scope`（命令・計算・できごとごと、任意） | `"all"`（既定。どの本文でも使える）または `"meijin"`（名人の本文でだけ使える） |

引数は `{name,type,unit}`、結果とできごとの値は `{type,unit}` で定義します。型は `number/string/boolean/list/value`、命令の結果だけ `void` も使えます。数の単位は `歩/秒/度/回/番目/点/個/％/Hz` または単位なしの `null`。単位付き数の実際の値は `{magnitude,unit}` です。リストは既存の数・文字・条件の答えを並べた値です。Promiseや任意オブジェクトを作品の式の値へ混入させません。

同じ拡張IDの再登録、機能ID・日本語名の重複、同じ区分（命令・計算・できごと）の別の機能のIDと同じ機能名（名前で書いた呼び出しがそのIDの機能に読まれるため）、標準の予約名との衝突、契約不一致、依存先不足、`scope` の不正な値を診断します。登録失敗では登録表を変更しません。登録名を固定された標準の文型に差し込むことはできません。

登録時に、キーを整列したmanifestとfactoryの `Function.prototype.toString()` の間へ改行を一つ入れたUTF-8列のSHA-256を求めます。これが `contentHash` です。ID・版が同じでも内容hashが違えば復元を拒否します。factoryの空白やコメント変更も同一性に影響します。TypeScriptで書くときは、factoryの中に型の構文を書きません。型を外す道具によって、外した後の空白が違い、内容hashが変わるためです。型は factory の外から付けます（実例は `satisfies Definition` で付け、受けた値を実行時に確かめます）。

### 座標と向き

Standard契約（言語契約5・runtime契約5）では、作品の座標は画面の左下のはしを0とし、右と上が正です。部品のよこのばしょ・たてのばしょは部品の中心です。向きは右を0度として、左回りにふえます（上は90度）。製品が提供する実行情報のなかの部品の `x`・`y` は、画面の左下のはしから部品のまん中までの歩数（右と上が正）、`direction` は右が0、上が90の左回りで、0以上360未満です。拡張にわたす数と、拡張が返す数も、このきまりで読みます（引数の単位を `歩`・`度` にすると、作品の `よこのばしょ`・`たてのばしょ`・`向き` をそのままわたせ、`{magnitude,unit}` で届きます）。拡張API契約は `1` のままです。

### 版の運用

- factoryの改行はLFにします（HTMLはCR LFをLFとして読むため、CRを含むfactoryは登録で拒否します）。
- factoryの文字に、NUL（U+0000）と、対になっていないサロゲートを使いません（HTMLはscriptの中のNULをU+FFFDとして読み、UTF-8のファイルは対になっていないサロゲートを持てないため、どちらかを含むfactoryは登録とビルドで E701 として拒否します）。
- 拡張名、命令・計算・できごとの名前、引数の名前にも、対になっていないサロゲートを使いません（名前は作品のプログラムに書かれ、UTF-8のファイルではU+FFFDに変わり、開いた作品が登録した名前と合わなくなるため、登録とビルドで E701 として拒否します）。説明文は作品に保存しないので、この確かめをしません。状態の値（`initial` と `setState` の値）は作品のJSONにエスケープの書き方でそのまま保存するので、対になっていないサロゲートも変わらずに残ります。
- 公開した拡張のmanifestとfactoryの文字列は固定します。圧縮・整形・コメント除去などの加工は `contentHash` を求める前に済ませ、公開後に加工し直しません。
- 空白一つでも変えたら版を上げます。同じ版で内容が違う拡張は、作品を開くときに拒否されます。
- 同じメジャー版の中では、拡張ID、機能ID、日本語の拡張名・機能名、引数の個数・型・単位、作品に保存する状態の `formatVersion` を変えません。変える場合はメジャー版を上げます。
- `standard` の番号が変わったら、manifestが変わるので版を上げます。
- 引数・結果・できごとの値の意味が変わるとき（座標や向きの数のきまりが変わったときなど）は、メジャー版を上げます。
- 製品は、作品に記録した版より新しい同じメジャー版の拡張が登録されていれば、確認したうえで新しい版で作品を開けます（後述）。

### 名人の本文だけの命令・計算・できごと

命令・計算・できごとに `scope: "meijin"` を書くと、その機能は名人の本文でだけ使えます。[meijin.ts](extensions/examples/meijin.ts) がその例です。

- 名人の本文には、ほかの拡張と同じく `拡張「拡張名」「機能名」（…）`・`拡張計算「拡張名」「機能名」（…）` と書きます。名人の本文の「書ける ことば」にも出ます。
- ブロックにはなりません。ブロックの道具箱と、名人の本文でない本文の「書ける ことば」には出ません。
- 名人の本文でない本文（部品・画面の本文、自分で作ったブロック）に書くと、作品チェックが「拡張「…」「…」は、名人の本文で だけ 使えます」（S317）で止めます。名人の本文だけのできごとの合図を受ける見出しを、名人の本文でない本文に書いたときも同じです（「拡張の きっかけ「…」は、名人の本文で だけ 使えます」）。
- 登録名を名人の自然な文型（「〜のうち、…ほう」「〜にふれているもの」など）に差し込むことはできません。部品の値は、名人の本文からも拡張にわたせません（E705）。
- `scope` を書かない機能と `"all"` の機能は、これまでどおりどの本文でもブロックでも使えます。拡張API契約は `1` のままです。

<!-- akari-example: meijin -->
```text
拡張「名人の記録」「数を記録する」（7）。
ねこは拡張計算「名人の記録」「記録した数」（）を言う。
```

## factoryと実行の寿命

`register(manifest, factory)` は同期でIdentityを返します。factoryは `function example(api) { ... }` または同期のarrow関数として宣言します。オブジェクトのmethod省略形・async関数・generator・bound/native関数は使いません。factoryは各実行sessionの開始時に新しく呼ばれ、次のAPIを受け取ります。

| API | 用途 |
| --- | --- |
| `getState()`、`setState(json)` | この拡張だけの保存状態のcopy取得・置換 |
| `emit(eventId,payload)` | 登録したできごとの値を検証して送る |
| `signal`、`sessionId` | sessionの取消と識別 |
| `connector` | 明示的に接続して版・能力を確認したコネクタ、未接続時は `null` |

factoryは `{commands, calculations, initialize?, dispose?}` を返します。機能表のキーはmanifestの機能ID、handlerは `(args, context)` です。handlerの `context` には、`signal`・`sessionId`・`runtimeId`・`runtime` の四つだけがあります（[types.d.ts](extensions/types.d.ts) の `InvokeContext` と `PartView`）。`runtimeId` は呼び出した文の持ち主（部品、または `"stage"`）です。`runtime` は `actor(runtimeId)` だけを持ち、呼ぶたびに、その時点の部品の見え方 `{runtimeId, baseId, isClone, x, y, direction}` を新しく作り、凍結して返します（画面と、その実行にない部品は `null`）。`runtime` も凍結しています。`x`・`y`・`direction` は「座標と向き」のきまりの数です。見え方を書きかえても部品は変わりません（strict modeのコードでは TypeError になります）。時間のかかる命令は、もう一度 `actor` を呼ぶと、そのときのばしょと向きを読めます。製品の内部の実行情報は拡張にわたしません。ばしょや向きを引数でわたしてもかまいません（単位 `歩`・`歩`・`度` の引数を登録し、`拡張「拡張名」「機能名」（よこのばしょ、たてのばしょ、向き）` のように書きます）。factoryと `initialize()` は同期処理とし、失敗時は既に作ったinstanceを破棄します。`dispose()` は資源解放に使い、終了後の状態変更・できごと送信を行いません。

計算は `async:false` とし、即座に既存型の値を返します。命令は `async:true` ならPromiseを返せます。待機は呼出元の処理だけを止め、ほかのできごとや停止操作を処理します。長時間処理は `context.signal` を確認し、timer・外部要求を取り消してください。同期の無限ループを契約外のJavaScriptから強制停止する保証はありません。

作品に、登録したできごとの合図（`拡張:拡張ID/機能ID`）を受ける本文があると、拡張が動いているあいだは、ほかの本文がすべて終わっても実行は「おわった」状態にならず、作る画面の下の行は「「拡張:拡張ID/機能ID」の 合図を 受けると 動くよ」になります（おされたときやキーの本文と同じです。いくつもあるときは、画面、部品の登録順で はじめの本文で示します。書き出した作品は「■ 止める」と「⏸ いったん止める」を出したままです）。そういう本文がなければ、拡張を登録しているだけでは実行の終わりを止めません。登録されていない `拡張:…` の名前は ふつうの合図です。非同期の命令が答えを待っているあいだと、とどいた できごと・答えを まだ受け取っていないあいだは、動いているあいだです。

停止はsessionのsignalをabortし、保留要求・接続・遅延結果を破棄します。古いfactory APIは状態変更やできごと送信を拒否します。拡張の状態の寿命は `state.persist` で決めます。既定の `"run"` では、作品の変数と同じく、実行ごとに `initial` から始まり、`snapshotState()` も `initial` を返します。子どもが「動かす」「最初に戻す」で予想するとおりに戻る値です。`"project"` は、ハイスコアや機器の設定のように作品に残す値に使います。停止前に確定した状態を次のsnapshotと作品へ保持し、製品は止まっている間「動きのようす」に表示して、`resetState()` で初期状態に戻すボタンを出します。初期化失敗の部分的な状態変更は保持しません。別作品へ状態を漏出させないため、製品は作品に保存した状態、または `initialState()` の初期状態を明示してsessionを開始します。製品の一時停止中は結果とできごとを順番に滞留させ、再開後に処理します。滞留の上限・流量とエラー扱いはLANGUAGEに従います。

`resolve(拡張, 機能, kind)` は拡張ID・日本語の拡張名と機能ID・日本語の機能名から `'id/member'` を返し、見つからなければ `null` を返します。`stateInfo()` は各拡張の状態の寿命を返します。`beginSession({state,onEvent,capabilities})` はsession IDを返し、`onEvent` は `{name,payload,sessionId,connectionId?,sequence?}` を受け取ります。製品はこの通知をschedulerへ渡します。`endSession()` は取消・破棄を行います。`operations(kind)` と `describe('id/member',kind)` は処理を実行せず説明情報を返します。機能区分は単数・複数の `command/calculation/event` を使えます。型（`extensions/types.d.ts`）では、命令・計算の区分なら `OperationDescription`（`args` と `returns` を持つ）、できごとの区分なら `EventDescription`（`payload` を持つ）を返し、`kind` はそれぞれ `'commands'`・`'calculations'`・`'events'` です。`ExtensionHost` を自分で実装するときは、この区分ごとの形で書きます。

## 保存と実行HTML

`requirements()` はAPI契約・Standard契約・必要拡張Identity・必要能力を返し（拡張IDの一覧を渡すと、その拡張と依存先だけの情報を返します。製品は作品が使う拡張を渡して保存のenvelopeを作ります）、`validateRequirements(envelope)` は既知の版・内容・依存関係を照合します。保存のenvelopeはこの情報に `state` と選択した `profile` を含めます。stateには必要拡張ごとの `{id,formatVersion,value}` を一つずつ記録し、不足・重複・余分な状態・版不一致・JSON以外の値を拒否します。プロファイルの照合はホスト側のprofile registryが担当します。`snapshotState()` と `restoreState(records)` は同じ状態一覧を扱います。

拡張を使わない作品には、派生製品で保存しても拡張の記録を追加しません（作品が使う拡張の決まりはLANGUAGEの「拡張」に従います）。プロファイルを選んだ派生製品で保存した作品は、拡張を使わなくてもプロファイルの記録を持ちます。拡張作品には必要情報とJSON状態を記録し、作品ファイルから処理コード・profile・通信許可を自動導入しません。不足・不一致は現在作品を置き換える前に診断します。

`upgradeRequirements(envelope, unused)` は、作品に記録した拡張が登録中の同じIDより古い版で、メジャー版が同じ、pre-release記号がなく（`+` で始まるbuildの記録は新しさの比べに使いません）、`"project"` の状態の `formatVersion` が一致する場合だけ、現在の版・内容hashに書き換えたenvelopeと変化の一覧 `{id,name,from,to}` を返します。版の数は、桁がいくつあっても正確に比べます。`"run"` の状態は初期状態に置き換えます。新しい版が、作品に記録のない登録中の拡張に依存するときは、その拡張（とその依存先）も記録に加え、状態は初期状態から始めます（変化の一覧には入りません）。新しい版が依存をやめたため、作品に記録した拡張が登録されていないときは、二つ目の引数 `unused` に、作品がその拡張を使っていないとして渡されたその拡張のIDがあり、記録に残るどの拡張もそれに依存しない場合だけ、変化の一覧があるときに記録と状態から外し、外したIDを `dropped` で返します。それ以外は `validateRequirements` と同じく拒否します。製品はこの一覧を示して確認し、了承したときだけ作品を開きます。製品は、作品の記録にあって登録されていない拡張を `unused` に渡し、作品がその拡張のブロック（登録されていない拡張のブロック）やできごとを使っているときは、確認せずに「必要な 拡張「ID」が 登録されて いません」（E703）として開きません。

`exportDefinitions()` は登録したすべての拡張の `{manifest,factorySource,contentHash}` を、`exportDefinitions(ids)` はそのIDの拡張とその依存先のものを、登録の順に返します。返す拡張に `selfContained` が `false` のものがあれば E709 で止めます。作品の書き出しは、作品の記録（`extensions`）が挙げる拡張だけを含めます。作品が使わず、状態も初期のままの拡張は含めないので、`selfContained` が `false` でも書き出しを止めません。ビルド・書き出しはfactoryを **関数のリテラル** としてinline scriptへ含め、保存ファイル由来の文字列を `eval` や `new Function` で実行しません。factoryは外側の変数へ依存せず、終了scriptタグ（`</script`）も、`<!--` と `<script` も含めません（inline scriptの終わりを変えるので、登録とビルドが E701 で止めます）。生成HTMLを別ブラウザーcontextで実行して、独立性を確認してください。外部依存型は処理コードを含められても、別の接続用ページやサービスへの明示接続が必要です。

## MessageChannelコネクタ

本体のCSPを保持し、別ウィンドウの [connector.html](extensions/examples/connector.html) とWeb Messagingで受け渡します。派生側の明示的な操作で `window.open()` したWindowを渡します。接続用ページは自身のネットワーク条件を持ちます。オンライン作品の通信を無通信とは扱いません。

```js
// An explicit derived-product operation; session must already be active.
const peer = window.open('./extensions/examples/connector.html', 'akari-connector');
const connector = await Akari.extensions.connectWindow(peer, {
  origin: 'null', // file: example only; HTTPS uses the exact HTTPS origin
  capabilities: ['demo.add', 'demo.event'],
  timeoutMs: 10000,
});
const answer = await connector.request('demo.add', [7, 7], {signal});
```

`timeoutMs`（接続と要求）は2147483647ミリ秒までの正の値です。

起動設定の `allowedCapabilities` とsessionの許可能力に `demo.add` と `demo.event` を含めます（接続用ページは、接続が `demo.event` を求めたときだけできごとを送ります）。接続用ページの「数のできごとを送る」が送るできごと（`sample`、値は数）は、[connector.ts](extensions/examples/connector.ts) の `demo.connector`（能力は `demo.add` と `demo.event`）を登録した派生で受け取ります。接続がない作品から要求すれば明確に未接続の診断とし、勝手に接続用ページを開きません。credentialを本体へ含めず、特定サービスの認証・課金は外部ホストが担当します。

接続開始は、読み込み直後のpopupに要求を失わないよう、`akari.probe` 要求の `{nonce}` に対する同じID・nonceのresultを待ちます。本体は100ms間隔でprobeを再送し、接続timeoutを維持します。応答後に `akari.hello` のJSON-RPC要求を相手Windowへ送り、新しいMessagePortを一度だけ転送します。paramsは `{nonce,connectionId,sessionId,apiContract,standard,capabilities}`。相手は同じ要求IDのresultとして `{nonce,connectionId,apiContract,standard,capabilities}` を相手Windowへ返します。本体はexact Window/source、origin、nonce、接続ID、版、全必要能力を検証してからportを有効にします。ローカルfileの `null` originは単独の信頼根拠ではなく、送信のtargetOriginには `*` が必要です。受信時のsource・nonce・port結合は維持します。

portの通信はJSON-RPC 2.0です。ObjectとJSON文字列を受け付け、要求・result・error・通知・batchを処理します。`request()` はPromise、`notify()` は応答なし、`batch()` は要求の順序で結果のPromiseを返します。相手からの応答の順序には依存しません。通知への応答や、通知だけのbatchへの空配列応答は送りません。空batch、不正要求、不正params、不明method、parse失敗を規格のエラーコードで扱います。`rpc.*` は規格の予約名、`akari.*` は本補足契約の制御名です。

一般要求のmethod名は許可能力の名前と一致させます。要求IDはconnection/sessionを含み、保留表で所有します。timeout・signalのabort・切断・停止で保留を拒否し、重複・不明・古い応答を無視します。取消・timeout時には `akari.cancel` 通知を送り、paramsに `{connectionId,sessionId,id}` を含めます。`akari.close` は同じ接続・sessionの終了を通知します。再接続は新しい接続IDとnonceを使います。

外部できごとは `akari.event` 通知のparamsとして `{connectionId,sessionId,sequence,extensionId,eventId,payload}` を送ります。sequenceは接続ごとに1から一つずつ増やし、重複・逆順・欠落を拒否します。順番どおりに届いたできごとは、中身（拡張・できごと・値）を拒否したときも順番を進め、次のできごとを受けます。外部接続型の登録イベントと許可能力が必要です。型・単位を検証してからschedulerへ渡します。

このJSON-RPC経路だけでMCP互換、高速対戦同期、未知の外部実装の適合を宣言しません。[JSON-RPC 2.0](https://www.jsonrpc.org/specification) と [Web Messaging](https://html.spec.whatwg.org/multipage/web-messaging.html) が採用規格です。

## 派生上限と適合確認

[profile.ts](extensions/examples/profile.ts) は有限profileと上限なしprofileの登録情報です。[extensions/limits.md](extensions/limits.md) の「Policy inventory」で変更可能な項目・標準値・適用範囲を確認し、ビルドの `profiles` と `profile:{id,version}` へ指定します。未指定項目は標準を継承し、正の有限値は指定上限、`null` はソフトウェア上限なしです。作品の自己申告だけではprofileを切り替えません。型・参照・素材破損・ブラウザー制約は残ります。

公開の拡張監査は実製品と派生HTMLを使い、独立した処理の登録、日本語・ブロック、命令・計算・できごと、型・単位・衝突、状態保存・復元、別contextの単体実行、現行CSP下の実popup/MessageChannel、取消・timeout・古いsession、有限profile・上限なしを確認します。実行手順と必須結果はAUDITの拡張基盤試験を参照してください。実例を改変した派生作者は、その追加処理の適合を自身のfixtureと実ブラウザーで確認します。
