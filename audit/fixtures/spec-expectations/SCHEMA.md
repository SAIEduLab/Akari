# 仕様の期待値データの形式

この文書は、`audit/fixtures/spec-expectations/` の `common/` と `meijin/` に置くデータの形式を定めます。期待値は **LANGUAGE.md に書かれた仕様だけ**から作ります。製品の出力や実装から作りません。

形式の検査は `node audit/tests/spec-expectations-static.mjs` で行います。この検査は製品を読み込まず、動かしません（GA-STATIC）。

## ファイル

| ファイル | 内容 |
|---|---|
| `common/items.json`、`meijin/items.json` | 仕様の項目の一覧。何を確かめるべきかを、仕様の文から切り出したもの |
| `common/cases.json`、`meijin/cases.json` | 期待値の事例（正例・反例・実行の経過） |

## items.json

```json
{
  "schema": "akari-spec-items-v1",
  "area": "common",
  "items": [
    {
      "id": "CI-001",
      "section": "日本語の作文と文法 > 役割と語順",
      "summary": "条件を先に書いた「〜まで、Xは待つ」を、「Xは、〜まで待つ」と同じ意味に読む",
      "polarity": "both",
      "coverage": "cases",
      "cases": ["CC-001", "CC-002"]
    }
  ],
  "specGaps": [
    { "where": "名人のできごと", "question": "仕様に書かれていない点", "items": ["MI-004"] }
  ]
}
```

- `id`：共通は `CI-` + 3桁、名人は `MI-` + 3桁。
- `section`：LANGUAGE.md の見出し（`##` か `###`）の文字そのもの。入れ子のときは「親 > 子」。検査が見出しの存在を確かめます。
- `polarity`：`positive`（読める・動く）、`negative`（止まる・読めない）、`both`（両方がある項目）。`both` の項目には、正例と反例が一つ以上要ります。
- `coverage`：
  - `cases`：事例がある（`cases` が空でない）。
  - `ui-only`：画面の操作でだけ確かめられる。`kind: "ui"` の事例を書き、ここにも `reason` を書く。
  - `unexpressible`：この形式では書けない。`reason` に、書きたかった観察を具体的に書く。
  - `document-only`：説明の文であって、確かめる動作がない。`reason` を書く。
- `specGaps`：仕様が黙っている、または二通りに読める点。**推測して期待値を作らず、ここに書きます。** 仕様に書かれた意味だけを期待値にします。

## cases.json

```json
{ "schema": "akari-spec-expectations-v1", "area": "common", "cases": [ ... ] }
```

どの事例にも次の欄があります。

| 欄 | 内容 |
|---|---|
| `id` | 共通は `CC-` + 3桁、名人は `MC-` + 3桁。両方の領域で重ならない |
| `item` | 対応する項目の `id`。項目の `cases` に、この `id` が入っていること |
| `kind` | `format`、`check`、`run`、`file`、`rename`、`ui` のどれか |
| `title` | 何を確かめるかの短い説明 |
| `polarity` | `positive` か `negative` |
| `basis` | 根拠。`[{ "file": "LANGUAGE.md", "quote": "仕様の文からの引用" }]`。一つ以上。引用は仕様の文のとおりで、空白と改行の違いは無視して検査します。6文字以上 |

### world（check・run・file・rename で使う）

```json
{
  "stage": { "width": 640, "height": 400 },
  "parts": [{ "name": "ねこ", "x": 320, "y": 100, "direction": 90, "size": 100, "visible": true, "vars": { "体力": 10 } }],
  "variables": { "点数": 0 },
  "lists": { "持ち物": ["本", "ぼうし"] },
  "scripts": [{ "owner": "ねこ", "source": "ねこは、いまのばしょから、右へ10歩動く。" }]
}
```

- `parts[].name` 以外は省略できます。省略した値は、仕様の既定の値です。値が結果に関わるときは、必ず書きます。
- `x`・`y` は部品のまん中のばしょで、画面の左下のはしからはかります（右と上が正）。`direction` は右が0、上が90で、左回りに大きくなり、0以上360未満で比べます。どれもLANGUAGE.mdの座標のきまりのとおりです。`world.stage`（例 `{ "width": 640, "height": 300 }`）で作品画面の大きさを決められます（省略すると640×400）。省略した `x`・`y` は画面のまん中、`direction` は0（右）、`size` は100、`visible` は `true` です。
- 部品の幅と高さは `w`、`h`（省略は 40）。world の部品のすがたは文字（「●」）なので、「ふれる」は、部品の外接長方形がかさなるか、辺がふれていることです。画面のはしにふれているかは、外接長方形を よこ0〜画面のはば・たて0〜画面の高さ とくらべます。絵の部品が見えているところでふれるきまり（LANGUAGE.mdの「ふれているかの決め方」）は、絵を用意できる画面の操作の事例で確かめます。かさなりが結果に関わるときは、`x`、`y`、`w`、`h` を書きます。
- 外から書き換えるときの欄（`edits[].set`）は `x`、`y`、`direction`、`size`、`visible`、`vars`（部品の変数）です。観察（`at[].parts`）も同じ欄で、`vars` は部品の変数を名前ごとに比べます。
- 名前で呼ぶものの準備は `world.assets`（`{ "backdrops": ["空色"], "sounds": ["ベル"], "costumes": { "ねこ": ["えがお"] } }`）に書きます。`costumes` で足すすがたも文字のすがた（「☺」）なので、すがたを変えても world の部品は文字の部品のままで、「ふれる」は外接長方形で決まります。
- `scripts[].owner`：部品の名前、`stage`（背景）、または `meijin`（どの部品にも属さない名人の本文。名人の事例だけ）。
- 名人の本文を二つ以上置くときは、`scripts` に `owner: "meijin"` を並べます。
- 本文が見出しを持たないとき、その本文は「作品を動かしたとき」に始まります。
- 自分で作った手順は `world.actions`（`[{ "name": "ジャンプ", "args": [], "source": "いまのばしょから、上へ20歩動く。" }]`）、答えを求める定義は `world.functions` に書きます。`source` は手順の中身の本文です。呼び出しは本文に書きます。

### kind: format（共通の本文だけ。名人の本文は整えません）

```json
{ "kind": "format", "owner": "ねこ", "source": "…", "formatted": "…", "blockRoundTrip": true }
```

`owner` の本文として読み、「整える」が書き出す文を `formatted` に書きます（行末は `\n`、字下げは半角空白2個、文末は「。」）。`blockRoundTrip` が `true` のとき、本文をブロックにして本文に戻しても `formatted` と同じになります。もう一度整えても変わりません。

format の事例は `world` を書けます。書かないときは、次の作品の名前で読みます：部品 たくどん・ねこ・だんご・いぬ・犬・星・鳥・ロケット（どれも部品の変数「体力」10 を持つ）、変数 点数（0）・名前（空の文字）・合計（0）、リスト 名前一覧・持ち物（どちらも空）。ほかの名前（部品・データ・音など）を使う事例は、その名前のある `world` を書きます。

### kind: check

```json
{ "kind": "check", "world": { }, "expect": {
  "stops": true, "line": 2,
  "guidanceContains": ["…"], "guidanceAbsent": ["…"], "fixContains": ["…"],
  "notices": [{ "line": 3, "contains": "…" }], "noNotices": false } }
```

作品チェックの結果です。

- `stops`：実行を止める誤りがあるか。作品が本文として受け取らない文（例：画面の本文に書いた「「星」にふれたとき、」。作る画面では、本文欄の下に理由が出ます）も、その本文の1行目の、止める誤りとして数えます。
- `line`：誤りが最初に出る行（1から数える）。省略可。
- `guidanceContains`、`guidanceAbsent`：誤りの案内の文に含まれる語、含まれない語。仕様に案内の文が書いてあるときだけ書く。語は、表記の違いを並べた配列でも書けます（`["順", "じゅん"]` はどちらかがあればよい）。案内の文は子ども向けに、かなで書いたり、ことばの間に空白を入れたり（分かち書き）するので、空白は比べません。知らせの `contains` も同じです。
- `fixContains`：直し方（押すと子どもの文を書きかえる文。LANGUAGE.md では「直し方を出します」「書きかえる文をえらべます」と書く）に含まれる語。誤りと知らせの直し方のどれか一つに含まれればよい。仕様に直し方の文が書いてあるときだけ書く。語の書き方と空白の扱いは `guidanceContains` と同じです。案内の文に出る語は `guidanceContains`、直し方の文に出る語は `fixContains` に分けて書きます。
- `notices`：止めない知らせ。`contains` は知らせの文に含まれる語。
- `noNotices`：`true` のとき、知らせが一つもない。

### kind: run

```json
{ "kind": "run", "world": { },
  "run": { "untilMs": 3000 },
  "inputs": [{ "atMs": 500, "key": "空白" }, { "atMs": 800, "click": "ねこ" }, { "atMs": 900, "answer": "はい" }],
  "edits": [{ "atMs": 400, "part": "星", "set": { "x": 100 } }],
  "expect": {
    "speech": [{ "part": "ねこ", "text": "やあ", "atMs": 0 }],
    "at": [{ "atMs": 1000, "parts": { "ねこ": { "x": 20, "y": 100 } }, "variables": { "点数": 3 }, "lists": { "持ち物": ["本"] } }],
    "final": { "variables": { "点数": 10 }, "lists": { }, "copies": { "星": 3 }, "runtimeErrors": "none", "activeTasks": 0 },
    "tolerance": { "ms": 20, "px": 1 } } }
```

- 作品を動かした時刻を 0 とし、論理時計（1秒を60に分けたこま）で進めます。`untilMs` まで進めて観察します。
- `inputs`：キーを押す（`key`。押し続けるときは `releaseAtMs` に離す時刻）、部品を押す（`click`）、たずねたことに答える（`answer`）、合図を送る（`signal`）。`key` は作品が持つキーの名前で書きます：「スペース」キーは `空白`、「エンター」キーは `決定`、「エスケープ」キーは `取消`、矢印のキーは `右`・`左`・`上`・`下`、文字のキーはその文字（`a`、`1`）です。キー・クリック・合図は、作品が動いていて、いったん止めていないあいだだけ届きます（「作品を全部止める」のあとは届きません）。答えは、たずねているときに届きます。
- 時刻 t に終わる待ち（「1秒待つ」の終わりなど）のあとの文は、時刻 t に行います。
- `edits`：その時刻に、部品の値を外から書き換えます（ふれる・離れるなどを作るために使う）。
- `speech`：話した順の全部。`part` は話した部品の名前（コピーは元の名前）、`atMs` は話し始めた時刻。**順序と数を含めて完全に一致させます。** 一部だけを確かめたいときは `speechContains` に同じ形の配列を書くと、その要素がその順で含まれることを確かめます。乱数で決まる話し手のときは、`speechCount`（話した数）と `speechEachPartIn`（話した部品が、この名前のどれかであること）で書きます。
- `at`：その時刻の部品の位置・向き・大きさ・表示、変数・リスト。
- 変数・部品の変数（`vars`）・リストの項目に入っている値の比べ方：単位のある数は大きさだけを比べます（`200歩` も `200点` も `200` と書きます）。部品を入れた変数は部品の名前（`"ねこ"`）、文字は文字、条件の答えは `true`／`false` で書きます。単位まで確かめたいときは、その値を「言う」の `speech`（「200歩」）で確かめます。
- `final`：`untilMs` の時点の変数・リスト、コピーの数（部品の名前ごと）、実行の誤り（`none`、`any`、または `["R405"]` のようにコードの一覧。コードは仕様に書いてあるときだけ）、動いている流れの数。
- `tolerance`：時刻の許容（既定 20ms）と位置の許容（既定 1）。仕様が決めた時刻は、許容を詰めて書く。

### kind: file

```json
{ "kind": "file", "action": "save-reopen", "world": { },
  "expect": { "scripts": [{ "index": 0, "has": { "mode": "meijin" }, "lacks": ["targetId", "event"], "source": "…" }] } }
```

```json
{ "kind": "file", "action": "open-declared", "declare": { "projectFormatVersion": 4 }, "expect": { "refused": true } }
```

- `save-reopen`：作品を保存して開き直した結果。**保存されたファイルの中の** `scripts` の項目の欄（`has`、`lacks`）と本文（`source`）を確かめる。開き直した作品が同じ本文を読み戻すことも確かめる。
- `open-declared`：空の作品を、指定した形式の番号を名乗るように書き換えて開く。`refused` が `true` なら断る。

### kind: rename

```json
{ "kind": "rename", "world": { }, "rename": { "what": "part", "from": "ねこ", "to": "みけ" },
  "expect": { "sourceContains": ["みけ"], "sourceAbsent": ["ねこ"] } }
```

`what` は `part`、`variable`、`list`、`procedure`。名前を変えたあとの全ての本文（`scripts[]` の順）の文を確かめます。

```json
{ "kind": "rename", "world": { }, "rename": { "what": "procedure", "from": "ジャンプ", "to": "ねこ" },
  "expect": { "refused": true, "sourceContains": ["【ジャンプ】という手順を行う"] } }
```

- `refused`：`true` なら、名前の変更を断ります。断ったときの本文は元のままなので、`sourceContains`・`sourceAbsent` は元の本文で確かめます（元の名前が残っていること）。
- `refusalContains`：断る理由の文に含まれる語。仕様に理由の文が書いてあるときだけ書きます。
- rename の事例には、`sourceContains`・`sourceAbsent` のどちらか、または `refused: true` と `refusalContains` が要ります。

### kind: ui

```json
{ "kind": "ui", "steps": ["…"], "expect": ["…"] }
```

画面の操作の手順と、その結果。この回では実行しません。ブラウザの監査が後で使います。手順は「ボタンの名前」「画面の状態」を具体的に書きます。

レベルを選ぶときは、「コードで「くわしく」を選ぶ」「ブロックで「はじめて」を選ぶ」のように、コードかブロックかを先に書きます。ブロックの「名人」や、コードの「はじめて」のように仕様で選べない組み合わせは手順に書かず、選べないことを確かめる事例では「えらべる ものを 見る」と書きます。

## 書くときの決まり

- 正例と反例は同じ数ぐらいに。反例は「なぜ止まるか」が仕様に書かれた文から作る。
- 期待値の数や文字は、仕様の文と、仕様が示す手計算（歩数、秒、論理時計）だけから決める。製品を動かして確かめない。
- 仕様が決めていないことは、推測せず `specGaps` に書く。
- 名人の本文の事例は、**書いたとおり**に保たれることを前提にする（整えない）。
