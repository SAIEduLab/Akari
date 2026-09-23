# あかり 0.8 — リリース監査

この文書は、あかり 0.8 を変更・配布するときの検査項目、検証方法、判定基準の正本です。製品の概要は `README.md`、利用者向けの使い方と言語仕様は `LANGUAGE.md`、実装の現在状態は `Akari.html` を参照します。

## 判定の原則

- `PASS` は、実際に実行した必須検査がすべて合格したことだけを表します。
- 実行していない必須項目は `PASS` とせず、未検証として扱います。
- 組み込み自己検査の `PASS` は、定義された自動検査に合格したことを表すもので、すべての環境で未知の不具合がないことを保証しません。
- 変更時の監査では、その変更によって影響し得る契約・実行経路を必須範囲とします。リリース判断では、自動検査だけでなく、この文書に定める製品カテゴリについて必要な実ブラウザー確認を行います。Playwright 等によるブラウザー自動操作を実ブラウザー確認に含めます。
- 過去の `PASS` や過去の監査記録を、現在の実体に対する合格の代用にしません。監査対象のcommitまたはPR headを固定して、その実体から判定します。
- 必須項目のFAILを修正した場合、その修正後のcommitまたはPR headを新しいsnapshotとして扱います。正式なリリースPASSは、修正前の結果を継ぎ足さず、新snapshotに対する必須監査を完了してから判定します。
- 判定直前に対象commitまたはPR headが監査対象snapshotと一致していることを再確認します。対象が変化していた場合、その新しいsnapshotは未監査として扱います。

## 0.8 の受入基準

0.8 の変更では、少なくとも次の製品原則を壊していないことを確認します。

- 人間には自然な日本語として読め、機械には構文と意味が一意に決まる標準文型である。
- 0.7 で表現・実行できた言語能力・製品能力を、互換性の有無とは別に失わない。
- `ここまで` を0.8のブロック終端として復活させず、処理範囲を字下げで一意に表す。
- `Akari.html` 1ファイルで編集・実行でき、作品の編集・実行に外部ネットワークや外部スクリプトを必要としない。
- 表示領域の変更によって主要操作、未保存編集、選択、実行状態などを不必要に失わない。
- `Akari.html` と、あかりの実行コードを含む書き出し済み単体HTMLが Apache License 2.0 の識別子とライセンス本文を保持し、利用者自身の作品内容を一律に Apache-2.0 と扱わない。
- `README.md`、`LANGUAGE.md`、`AUDIT.md`、`LICENSE` と `Akari.html` の責務・記述・実装が矛盾しない。

0.7以前とのソースコード互換、保存形式互換、プロジェクトファイル互換そのものは要求しません。能力の縮小は別問題として監査します。

## 0.7 能力非退化監査

0.7の比較元は `6f1e9c63c7e8dd8485e8aad34e1220366aa6b5a6` に固定します。このsnapshotの `Akari.html`、`LANGUAGE.md`、`AUDIT.md` を比較元とし、現在の `main` や0.8側の同名ファイルを0.7の証拠として代用しません。

能力非退化を監査するときは、固定snapshotの `Akari.html`、`LANGUAGE.md`、`AUDIT.md` にある parser、意味検査、対象制約、実行時処理、入力候補、検証契約、資源上限などを突き合わせ、少なくとも次を能力台帳へ含めます。

- 命令、局所宣言、返却などの文。
- 数・文字・真偽・リストなどの値とリテラル。
- 演算子、比較、否定、短絡評価、優先順位・結合規則。
- リスト・文字の読取り式。
- キーの押下状態、接触、色の接触、距離など、条件・述語・センサーとして使える式。
- マウス、位置、方向、背景、衣装、音量、音程、タイマーなどの読み取れる状態。
- 名前、所属修飾、名前解決、スコープ、反復項目、引数、局所値。
- 組み込み求値と利用者定義の動作・求値。
- イベント、イベント固有値、対象種類ごとの利用可能イベント。
- 命令・式・センサーの対象種類や利用場所による制約。
- 待機、通知待ち、質問、滑走、音待ち、並行実行、停止、クローンなどの実行意味。
- 型・範囲・資源上限によって0.7では可能だった入力領域。

能力台帳は、**恒久的な追跡定義**と**snapshotごとの監査証拠・結果**を分けます。監査結果を正本Markdownへ固定して陳腐化させません。

恒久台帳として本書に保持するもの:

1. 0.7基準SHA。
2. 安定した能力ID。
3. その能力に最低限対応する安定した自己検査ID。
4. test ID対応が「最低限の追跡要求」であり、実装能力そのものの存在や完全性を自己申告で保証しないという保証意味。

各snapshotの監査時に、現在実体から新しく生成・確認する証拠記録:

1. 能力が表現または観測できる現在の定義・実装根拠。
2. 0.8で対応する標準構文、UI操作、または仕組み。
3. parser / 意味検査による受理・制約の確認結果。
4. runtimeによる実行・観測結果。
5. `selfTestReport.results` に対応test IDが存在し、そのsnapshotでPASSしていること。

つまり本書のJSON台帳、現在の `Akari.html` から再列挙した能力、現在snapshotのself-test結果を三者照合して初めて追跡PASSとします。未対応、意味・対象範囲の縮小、根拠のない台帳からの除外、必要な確認の未実施があれば合格にしません。

## 0.8 能力・自己検査追跡台帳

この節は、0.7能力非退化を0.8で追跡するための**監査側の機械可読台帳**です。人間が監査方針を定め、AIを含む監査実行者が現在の実装と自己検査結果を照合するときの正本として使います。

- `baseline` は能力比較元の0.7固定snapshotです。
- `entries[].id` は監査する能力IDです。
- `entries[].tests` は、その能力について最低限成功を要求する `selfTestReport.results[].id` です。
- 台帳が現在の `Akari.html` の能力を網羅しているかは、監査時に `COMMAND_CATALOG08`、組み込み求値、センサー、parser、意味検査、runtimeを現在snapshotから再列挙して確認します。台帳に項目があること自体を実装能力の証拠にはしません。
- 台帳のtest IDが自己検査結果に存在しない、またはFAILしている場合、その能力は追跡PASSにしません。
- `Akari.html` はこの台帳を埋め込まず、実行可能なself-testと安定したtest IDだけを保持します。台帳との対応確認と監査判定は本書を読む監査実行者の責務です。

```json
{
  "baseline": "6f1e9c63c7e8dd8485e8aad34e1220366aa6b5a6",
  "entries": [
    {
      "id": "command:Assignment",
      "tests": [
        "08 catalog Assignment"
      ]
    },
    {
      "id": "command:NumericUpdate:ADD",
      "tests": [
        "08 catalog NumericUpdate:ADD"
      ]
    },
    {
      "id": "command:NumericUpdate:SUB",
      "tests": [
        "08 catalog NumericUpdate:SUB"
      ]
    },
    {
      "id": "command:ListAppend",
      "tests": [
        "08 catalog ListAppend"
      ]
    },
    {
      "id": "command:ListReplace",
      "tests": [
        "08 catalog ListReplace"
      ]
    },
    {
      "id": "command:ListInsert",
      "tests": [
        "08 catalog ListInsert"
      ]
    },
    {
      "id": "command:ListDelete",
      "tests": [
        "08 catalog ListDelete"
      ]
    },
    {
      "id": "command:ListClear",
      "tests": [
        "08 catalog ListClear"
      ]
    },
    {
      "id": "command:IfStatement",
      "tests": [
        "08 catalog IfStatement"
      ]
    },
    {
      "id": "command:Say",
      "tests": [
        "08 catalog Say"
      ]
    },
    {
      "id": "command:RepeatCount",
      "tests": [
        "08 catalog RepeatCount"
      ]
    },
    {
      "id": "command:RepeatWhile",
      "tests": [
        "08 catalog RepeatWhile"
      ]
    },
    {
      "id": "command:RepeatUntil",
      "tests": [
        "08 catalog RepeatUntil"
      ]
    },
    {
      "id": "command:WaitTime",
      "tests": [
        "08 catalog WaitTime"
      ]
    },
    {
      "id": "command:WaitUntil",
      "tests": [
        "08 catalog WaitUntil"
      ]
    },
    {
      "id": "command:ForEach",
      "tests": [
        "08 catalog ForEach"
      ]
    },
    {
      "id": "command:MotionCommand:MOVE",
      "tests": [
        "08 catalog MotionCommand:MOVE"
      ]
    },
    {
      "id": "command:MotionCommand:GOTO",
      "tests": [
        "08 catalog MotionCommand:GOTO"
      ]
    },
    {
      "id": "command:MotionCommand:GLIDE",
      "tests": [
        "08 catalog MotionCommand:GLIDE"
      ]
    },
    {
      "id": "command:MotionCommand:TURN_RIGHT",
      "tests": [
        "08 catalog MotionCommand:TURN_RIGHT"
      ]
    },
    {
      "id": "command:MotionCommand:TURN_LEFT",
      "tests": [
        "08 catalog MotionCommand:TURN_LEFT"
      ]
    },
    {
      "id": "command:MotionCommand:SET_DIRECTION",
      "tests": [
        "08 catalog MotionCommand:SET_DIRECTION"
      ]
    },
    {
      "id": "command:MotionCommand:SET_X",
      "tests": [
        "08 catalog MotionCommand:SET_X"
      ]
    },
    {
      "id": "command:MotionCommand:SET_Y",
      "tests": [
        "08 catalog MotionCommand:SET_Y"
      ]
    },
    {
      "id": "command:MotionCommand:POINT_TO",
      "tests": [
        "08 catalog MotionCommand:POINT_TO"
      ]
    },
    {
      "id": "command:MotionCommand:BOUNCE",
      "tests": [
        "08 catalog MotionCommand:BOUNCE"
      ]
    },
    {
      "id": "command:LooksCommand:SET_SCALE",
      "tests": [
        "08 catalog LooksCommand:SET_SCALE"
      ]
    },
    {
      "id": "command:LooksCommand:SET_COLOR",
      "tests": [
        "08 catalog LooksCommand:SET_COLOR"
      ]
    },
    {
      "id": "command:LooksCommand:HIDE",
      "tests": [
        "08 catalog LooksCommand:HIDE"
      ]
    },
    {
      "id": "command:LooksCommand:SHOW",
      "tests": [
        "08 catalog LooksCommand:SHOW"
      ]
    },
    {
      "id": "command:LooksCommand:FRONT",
      "tests": [
        "08 catalog LooksCommand:FRONT"
      ]
    },
    {
      "id": "command:LooksCommand:BACK",
      "tests": [
        "08 catalog LooksCommand:BACK"
      ]
    },
    {
      "id": "command:LooksCommand:FORWARD_LAYERS",
      "tests": [
        "08 catalog LooksCommand:FORWARD_LAYERS"
      ]
    },
    {
      "id": "command:LooksCommand:BACKWARD_LAYERS",
      "tests": [
        "08 catalog LooksCommand:BACKWARD_LAYERS"
      ]
    },
    {
      "id": "command:PenCommand:DOWN",
      "tests": [
        "08 catalog PenCommand:DOWN"
      ]
    },
    {
      "id": "command:PenCommand:SET_COLOR",
      "tests": [
        "08 catalog PenCommand:SET_COLOR"
      ]
    },
    {
      "id": "command:PenCommand:SET_SIZE",
      "tests": [
        "08 catalog PenCommand:SET_SIZE"
      ]
    },
    {
      "id": "command:PenCommand:UP",
      "tests": [
        "08 catalog PenCommand:UP"
      ]
    },
    {
      "id": "command:PenCommand:STAMP",
      "tests": [
        "08 catalog PenCommand:STAMP"
      ]
    },
    {
      "id": "command:PenCommand:CLEAR",
      "tests": [
        "08 catalog PenCommand:CLEAR"
      ]
    },
    {
      "id": "command:LooksCommand:SET_BACKDROP",
      "tests": [
        "08 catalog LooksCommand:SET_BACKDROP"
      ]
    },
    {
      "id": "command:LooksCommand:NEXT_BACKDROP",
      "tests": [
        "08 catalog LooksCommand:NEXT_BACKDROP"
      ]
    },
    {
      "id": "command:LooksCommand:PREV_BACKDROP",
      "tests": [
        "08 catalog LooksCommand:PREV_BACKDROP"
      ]
    },
    {
      "id": "command:LooksCommand:SET_COSTUME",
      "tests": [
        "08 catalog LooksCommand:SET_COSTUME"
      ]
    },
    {
      "id": "command:LooksCommand:NEXT_COSTUME",
      "tests": [
        "08 catalog LooksCommand:NEXT_COSTUME"
      ]
    },
    {
      "id": "command:LooksCommand:PREV_COSTUME",
      "tests": [
        "08 catalog LooksCommand:PREV_COSTUME"
      ]
    },
    {
      "id": "command:LooksCommand:SET_TARGET_TEXT",
      "tests": [
        "08 catalog LooksCommand:SET_TARGET_TEXT"
      ]
    },
    {
      "id": "command:SoundCommand:TONE",
      "tests": [
        "08 catalog SoundCommand:TONE"
      ]
    },
    {
      "id": "command:SoundCommand:TONE_WAIT",
      "tests": [
        "08 catalog SoundCommand:TONE_WAIT"
      ]
    },
    {
      "id": "command:SoundCommand:SET_VOLUME",
      "tests": [
        "08 catalog SoundCommand:SET_VOLUME"
      ]
    },
    {
      "id": "command:SoundCommand:PITCH_UP",
      "tests": [
        "08 catalog SoundCommand:PITCH_UP"
      ]
    },
    {
      "id": "command:SoundCommand:PITCH_DOWN",
      "tests": [
        "08 catalog SoundCommand:PITCH_DOWN"
      ]
    },
    {
      "id": "command:SoundCommand:STOP_ALL",
      "tests": [
        "08 catalog SoundCommand:STOP_ALL"
      ]
    },
    {
      "id": "command:Broadcast",
      "tests": [
        "08 catalog Broadcast"
      ]
    },
    {
      "id": "command:BroadcastAndWait",
      "tests": [
        "08 catalog BroadcastAndWait"
      ]
    },
    {
      "id": "command:Ask",
      "tests": [
        "08 catalog Ask"
      ]
    },
    {
      "id": "command:LocalVariableDeclaration",
      "tests": [
        "08 catalog LocalVariableDeclaration"
      ]
    },
    {
      "id": "command:ReturnStatement",
      "tests": [
        "08 catalog ReturnStatement"
      ]
    },
    {
      "id": "command:CloneCommand:CREATE_SELF",
      "tests": [
        "08 catalog CloneCommand:CREATE_SELF"
      ]
    },
    {
      "id": "command:CloneCommand:CREATE_TARGET",
      "tests": [
        "08 catalog CloneCommand:CREATE_TARGET"
      ]
    },
    {
      "id": "command:CloneCommand:DELETE_SELF",
      "tests": [
        "08 catalog CloneCommand:DELETE_SELF"
      ]
    },
    {
      "id": "command:StopCommand:THIS",
      "tests": [
        "08 catalog StopCommand:THIS"
      ]
    },
    {
      "id": "command:StopCommand:OTHERS",
      "tests": [
        "08 catalog StopCommand:OTHERS"
      ]
    },
    {
      "id": "command:StopCommand:ALL",
      "tests": [
        "08 catalog StopCommand:ALL"
      ]
    },
    {
      "id": "command:LooksCommand:SET_SELF_TEXT",
      "tests": [
        "08 catalog LooksCommand:SET_SELF_TEXT"
      ]
    },
    {
      "id": "command:LooksCommand:SET_INPUT",
      "tests": [
        "08 catalog LooksCommand:SET_INPUT"
      ]
    },
    {
      "id": "command:SoundCommand:SAMPLE",
      "tests": [
        "08 catalog SoundCommand:SAMPLE"
      ]
    },
    {
      "id": "command:SoundCommand:SAMPLE_WAIT",
      "tests": [
        "08 catalog SoundCommand:SAMPLE_WAIT"
      ]
    },
    {
      "id": "command:Break",
      "tests": [
        "08 catalog Break"
      ]
    },
    {
      "id": "command:Continue",
      "tests": [
        "08 catalog Continue"
      ]
    },
    {
      "id": "command:LocalListDeclaration",
      "tests": [
        "08 catalog LocalListDeclaration"
      ]
    },
    {
      "id": "command:Forever",
      "tests": [
        "08 catalog Forever"
      ]
    },
    {
      "id": "command:UserActionCall",
      "tests": [
        "08 catalog UserActionCall"
      ]
    },
    {
      "id": "state:マウスが押されている",
      "tests": [
        "08 sensor マウスが押されている"
      ]
    },
    {
      "id": "state:マウスの横位置",
      "tests": [
        "08 sensor マウスの横位置"
      ]
    },
    {
      "id": "state:マウスの縦位置",
      "tests": [
        "08 sensor マウスの縦位置"
      ]
    },
    {
      "id": "state:以前の背景名",
      "tests": [
        "08 sensor 以前の背景名"
      ]
    },
    {
      "id": "state:新しい背景名",
      "tests": [
        "08 sensor 新しい背景名"
      ]
    },
    {
      "id": "state:受け取った知らせ",
      "tests": [
        "08 sensor 受け取った知らせ"
      ]
    },
    {
      "id": "state:押されたキー",
      "tests": [
        "08 sensor 押されたキー"
      ]
    },
    {
      "id": "state:クローンである",
      "tests": [
        "08 sensor クローンである"
      ]
    },
    {
      "id": "state:背景番号",
      "tests": [
        "08 sensor 背景番号"
      ]
    },
    {
      "id": "state:背景名",
      "tests": [
        "08 sensor 背景名"
      ]
    },
    {
      "id": "state:衣装番号",
      "tests": [
        "08 sensor 衣装番号"
      ]
    },
    {
      "id": "state:衣装名",
      "tests": [
        "08 sensor 衣装名"
      ]
    },
    {
      "id": "state:横位置",
      "tests": [
        "08 sensor 横位置"
      ]
    },
    {
      "id": "state:縦位置",
      "tests": [
        "08 sensor 縦位置"
      ]
    },
    {
      "id": "state:方向",
      "tests": [
        "08 sensor 方向"
      ]
    },
    {
      "id": "state:大きさ",
      "tests": [
        "08 sensor 大きさ"
      ]
    },
    {
      "id": "state:タイマー",
      "tests": [
        "08 sensor タイマー"
      ]
    },
    {
      "id": "state:答え",
      "tests": [
        "08 sensor 答え"
      ]
    },
    {
      "id": "state:音量",
      "tests": [
        "08 sensor 音量"
      ]
    },
    {
      "id": "state:音程",
      "tests": [
        "08 sensor 音程"
      ]
    },
    {
      "id": "state:以前の値",
      "tests": [
        "08 sensor 以前の値"
      ]
    },
    {
      "id": "state:新しい値",
      "tests": [
        "08 sensor 新しい値"
      ]
    },
    {
      "id": "builtin:乱数",
      "tests": [
        "08 builtin 乱数"
      ]
    },
    {
      "id": "builtin:余り",
      "tests": [
        "08 builtin 余り"
      ]
    },
    {
      "id": "builtin:四捨五入",
      "tests": [
        "08 builtin 四捨五入"
      ]
    },
    {
      "id": "builtin:切り上げ",
      "tests": [
        "08 builtin 切り上げ"
      ]
    },
    {
      "id": "builtin:切り捨て",
      "tests": [
        "08 builtin 切り捨て"
      ]
    },
    {
      "id": "builtin:絶対値",
      "tests": [
        "08 builtin 絶対値"
      ]
    },
    {
      "id": "builtin:平方根",
      "tests": [
        "08 builtin 平方根"
      ]
    },
    {
      "id": "builtin:正弦",
      "tests": [
        "08 builtin 正弦"
      ]
    },
    {
      "id": "builtin:余弦",
      "tests": [
        "08 builtin 余弦"
      ]
    },
    {
      "id": "builtin:正接",
      "tests": [
        "08 builtin 正接"
      ]
    },
    {
      "id": "builtin:逆正弦",
      "tests": [
        "08 builtin 逆正弦"
      ]
    },
    {
      "id": "builtin:逆余弦",
      "tests": [
        "08 builtin 逆余弦"
      ]
    },
    {
      "id": "builtin:逆正接",
      "tests": [
        "08 builtin 逆正接"
      ]
    },
    {
      "id": "builtin:自然対数",
      "tests": [
        "08 builtin 自然対数"
      ]
    },
    {
      "id": "builtin:常用対数",
      "tests": [
        "08 builtin 常用対数"
      ]
    },
    {
      "id": "builtin:指数",
      "tests": [
        "08 builtin 指数"
      ]
    },
    {
      "id": "builtin:数",
      "tests": [
        "08 builtin 数"
      ]
    },
    {
      "id": "builtin:文字",
      "tests": [
        "08 builtin 文字"
      ]
    },
    {
      "id": "builtin:最小",
      "tests": [
        "08 builtin 最小"
      ]
    },
    {
      "id": "builtin:最大",
      "tests": [
        "08 builtin 最大"
      ]
    },
    {
      "id": "builtin:つなぐ",
      "tests": [
        "08 builtin つなぐ"
      ]
    },
    {
      "id": "predicate:空白キーが押されている",
      "tests": [
        "08 sensor 空白キーが押されている"
      ]
    },
    {
      "id": "predicate:端に触れている",
      "tests": [
        "08 sensor 端に触れている"
      ]
    },
    {
      "id": "predicate:「赤」の色に触れている",
      "tests": [
        "08 sensor 「赤」の色に触れている"
      ]
    },
    {
      "id": "predicate:マウスまでの距離",
      "tests": [
        "08 sensor マウスまでの距離"
      ]
    },
    {
      "id": "scopes-and-values",
      "tests": [
        "SCOPE 別の個体の変数",
        "SCOPE 反復項目は読み取り専用",
        "ACTION 引数は値渡し",
        "FUNCTION 外部副作用の拒否",
        "TYPE 変数にリストを代入しない"
      ]
    },
    {
      "id": "execution-model",
      "tests": [
        "SCHEDULER 公平な命令順",
        "WAIT 時間は論理時計",
        "WAIT 条件の再評価",
        "AUDIT SCHEDULER pause does not complete time waits",
        "AUDIT STOP clears questions timers all waits and physical input"
      ]
    }
  ]
}
```

監査時は上のJSONを機械的に読み取ってよいものとします。能力追加・削除・test ID変更がある変更では、実装・自己検査と同じsnapshotでこの台帳も更新し、変更後の固定SHAに対して再照合します。

## 言語・パーサー・整形・診断の検査

変更内容が言語処理へ影響する場合は、少なくとも次を自動検査します。

- 同じ受理コードから複数の意味を持つASTを作らない。
- `format(parse(source))` が標準形を返す。
- `parse(format(parse(source)))` が元のASTと意味的に一致する。
- `format(format(source))` が同じ結果になり、整形が冪等である。
- 表記揺れを受理しても整形後は一つの標準形になる。
- 条件分岐、回数反復、条件反復、無限反復、リスト反復の字下げと、2重・3重以上の入れ子を正しく解析する。
- 空行・コメント行で意図しないブロック終了を起こさない。
- 不正な字下げ戻り、タブ、曖昧な名前境界、対応しない `そうでなければ` などを推測で受理しない。
- 診断が少なくとも場所、行、理由を示す。
- 入力候補が挿入するコードが、その文脈で正しい標準形として解析できる。
- 標準形の定義を入力候補、整形、文書、自己検査で矛盾する形に重複させず、可能な限り `Akari.html` の同じ機械可読情報から導く。

## 自動検査

あかり 0.8 は、開発・リリース検査用として組み込み自己検査を保持しています。通常の利用者向けUIからは実行しません。

`Akari.html?selftest=1` として読み込むと、定義済みのリリース検査を実行し、結果を `selfTestReport` と `data-selftest-failed` に出力します。

リリース時には少なくとも次を確認します。

- JavaScriptとして構文エラーがない。
- 組み込み自己検査が最後まで完了する。
- `data-selftest-failed="0"` となる。
- 日本語構文の正例と負例、字下げの入れ子、formatterの冪等性、parse / format / parse のAST同値が検査に含まれる。
- 本書の「0.8 能力・自己検査追跡台帳」を現在の実装から再列挙した能力と照合し、各 `entries[].tests` が `selfTestReport.results` に存在して成功している。
- 保存・復元、単体HTML書き出し、ライセンス保持、動作・求値、イベントと並行実行、クローン、エラーと上限など、変更対象に関係する検査が実際に含まれている。

組み込み自己検査の実装は `Akari.html` 内にあります。これは利用者向け機能ではなく、単一HTMLのまま現在の実装を検査するための開発用機構です。

能力台帳との追跡可能性は `Akari.html` 自身に自己申告させません。監査実行者が、現在snapshotの実装から再列挙した能力、本書の台帳、実際の `selfTestReport.results` を三者照合して判定します。

### 正式な監査CI

`.github/workflows/akari-audit.yml` は、現在snapshotに結び付いた必須の自動検証証拠を継続的に生成する正式CIです。Pull Requestではmerge refではなく実際のPR head SHAをcheckoutし、`main` へのpushではそのcommit SHAを検査します。

このCIは少なくとも、JavaScript構文、実ブラウザーでの組み込みself-test完走、`data-selftest-failed="0"`、本書の能力台帳JSONの構造・baseline・ID整合、台帳が要求するtest IDの存在とPASSを同じsnapshotで確認します。workflowまたは検査内容を変更したcommitは、その新しいheadに紐づくCI成功を確認するまで、この自動検査部分をPASSとしません。

CI成功は監査そのものの代替ではありません。監査実行者はworkflow、self-test、validatorが通すために弱体化されていないことを独立確認し、現在実装からの能力再列挙、変更内容に応じた追加検査、必要な実ブラウザー操作を引き続き行います。

外部の検証スクリプトを用いる場合は、監査時点の一時検証物として作成してよく、最終PR差分に恒久的な `tests/` ディレクトリを残すことは必須ではありません。検証に使った手順・結果・対象SHAは監査記録へ残します。

## 必須の統合回帰作品

正式なリリース監査では、個別検査だけでなく、少なくとも次の性質を持つ小作品群を回帰検査に含めます。自己検査内のfixtureとして実装してもよいものとし、実ブラウザーでも各カテゴリを代表する作品を動かします。

- **作品A：制御構造** — 条件分岐、`そうでなければ`、3重以上の入れ子、回数反復、条件反復、反復の中断・次回移行。
- **作品B：データと求値** — 作品変数、個体変数、リスト、動作、求値、引数、局所値、組み込み求値。
- **作品C：イベント並行実行** — 開始、クリック、キー、知らせ、待機、質問。
- **作品D：スプライト** — 移動、回転、衣装、ペン、クローン、接触。
- **作品E：素材・保存・書き出し** — 背景画像、衣装画像、音、保存、開き直し、単体HTML書き出し。
- **作品F：responsive UI** — 複数部品、長めのコード、長いプロパティ値、実行モニター表示、resize中の編集状態保持。

## 実ブラウザーで確認する項目

変更内容に応じ、少なくとも次を確認します。

### 起動と編集

- HTMLをブラウザーで直接開き、初期画面が正しく表示される。
- 部品の追加、選択、移動、削除、プロパティ編集ができる。
- コードを入力・編集・整形できる。
- 元に戻す・やり直すが成立する。
- データ、素材、動作・求値を編集できる。
- 入力候補が現在の対象・イベント・名前・スコープ・表示段階に応じて利用でき、対象外候補の理由も確認できる。
- 作品診断が文法・参照・字下げ上の問題を場所・行・理由とともに表示できる。

### 実行とデバッグ

- 実行と停止ができる。
- 一時停止、続行、1命令ずつの実行ができる。
- 実行位置と実行モニターが更新される。
- 実行エラーから停止・編集へ戻れる。
- 失敗時の命令、呼出し順、引数、局所値、作品データ、個体データを確認でき、長い値やリストも閲覧できる。
- 時間待機、条件待機、滑走、音待ち、通知待ち、質問などが、仕様どおり他の処理を不必要に停止しない。
- 無限反復中でも停止操作へ応答できる。

### 保存・復元・書き出し

- `.akari.md` を保存し、同じ作品として開き直せる。
- 部品、コード、データ、動作・求値、背景、衣装、音が保持される。
- 文法エラーを含む作りかけの本文を保存できる。
- 自動保存と復元が利用できる環境で、編集中の内容を含めて正しく動く。
- 不正な、または整合しないプロジェクトファイルを安全に拒否し、読込み失敗で現在の作品を破壊しない。
- 書き出し前に文法・参照エラーを拒否する。
- 単体HTMLを書き出し、編集用あかりや外部ネットワークを使わず実行できる。
- 書き出した単体HTMLでも、必要なイベント、素材、動作・求値、クローンなどが成立する。
- `Akari.html` と書き出した単体HTMLの双方に Apache License 2.0 の識別子とライセンス本文が保持される。

### 素材とブラウザー依存動作

- PNG、JPEG、WebP の画像を実デコードし、背景・スプライト衣装として表示できる。
- MP3、WAV の音声を実デコードし、再生開始・終了待ちの意味論を確認できる。
- 保存後・書き出し後にも素材が保持される。
- 書き出しや保存のダウンロードが実ブラウザーで成立する。
- Tabで主要操作へ移動でき、フォーカス位置を視覚的に確認できる。
- 選択可能な一覧を矢印、Home、End、Enterで操作できる。
- 実行画面上のクリック可能部品をキーボードから操作できる。
- 通常のダイアログをEscapeで閉じ、可能な限り元の操作位置へ戻れる。
- IME変換中相当の composition 状態で、Enterなどが質問送信や意図しない確定・実行を起こさない。
- コード編集中のcomposition状態が、自動字下げや候補挿入によって破壊されない。
- 200%相当の拡大表示や想定する画面幅で、主要な操作が失われない。

実際の日本語IMEを人が操作する確認、ブラウザーUIから200%へ変更する手動確認、音声出力機器から実際に音が聞こえることの聴取確認は、通常PASSの必須条件ではありません。対応する挙動を実ブラウザー自動検査で確認してよいものとします。

### 字下げと画面サイズ変更

- 1440×900、1024×768、768×1024、600×800、390×844、320×568のCSSピクセルで確認する。
- 各viewportで、新規・開く・保存・書き出し、実行・停止・最初に戻す、素材・動作・求値・データ・作品診断、道具箱、デザイナ、作品一覧、プロパティ、コード、入力候補、実行モニター、ステータス、主要ダイアログへ到達できる。
- 主要ダイアログでは、内容をスクロールでき、閉じる・保存・確定操作と入力欄へ到達でき、画面外へ固定されない。
- 1440×900 → 390×844 → 1440×900の連続変更で、未保存コード、選択範囲、編集対象、部品座標、作品データ、実行・一時停止状態を保持する。
- デザイナ全体が表示範囲に収まり、縮尺後のクリック・選択・ドラッグ・配置・実行時ポインター位置が論理座標と一致する。
- 縮尺によってペン描画や接触判定の意味を壊さない。
- CSS `zoom` 等による200%相当の自動ブラウザー検査で主要操作を確認する。
- ブロック開始後のEnterが2スペースの字下げを追加し、composition中は介入しない。
- 固定最小幅による恒常的な横スクロール、判読不能な重なり、クリック領域の被覆を生じさせない。

## ライセンスと配布の確認

ライセンス条件の正本は `LICENSE` とし、Apache License 2.0 の標準本文が保持されていることを確認します。

- `Akari.html` が `SPDX-License-Identifier: Apache-2.0` と `LICENSE` の本文を自身に保持し、1ファイルだけの配布でもライセンスを確認できる。
- 書き出し済み単体HTMLも、組み込まれたあかり実行コードについて同じ識別子とライセンス本文を保持する。
- 組み込み自己検査で単体HTMLへのライセンス保持を検査する。
- `README.md` と `LANGUAGE.md` が、利用者自身の作品コード・文章・画像・音まで一律にApache-2.0になるとは説明していない。
- ライセンス変更によって日本語文法、実行意味、保存形式、作品データの意味が変わったものとして扱わない。

## 文書整合性の確認

最終実装と次を照合します。

- `README.md` は、0.8の概要、日本語設計の考え方、主な特徴、利用開始方法、単一HTML・オフライン性、詳細文書への導線を担う。
- `LANGUAGE.md` は、文法、字下げ、条件・反復、名前解決、式、命令・状態・イベント、動作・求値、実行モデル、保存・書き出し、制限など利用者向け詳細仕様を担う。
- `AUDIT.md` は、自己検査、能力非退化、実ブラウザー、resize、PASSの意味、未検証の扱いなど開発・リリース時の判定基準を担う。
- `LICENSE` はライセンス条件の正本とし、READMEとLANGUAGEの説明が矛盾しない。
- 人間向けの詳細仕様・監査説明を `Akari.html` に重複させず、製品機能に必要な機械可読情報と自己検査は本体に保持する。

## 組み込み自己検査だけでは確認できないこと

組み込み自己検査だけでは、少なくとも次を合格済みとは扱いません。必要な項目は実ブラウザー検査で確認します。

- 実際の画面描画とレイアウト
- ブラウザーのダウンロード動作
- 画像・音声の実デコード
- 音声の再生開始・終了待ちの意味論
- composition中の入力処理
- 拡大表示やviewport変更時の操作性

学習者が実際に使用したときの分かりやすさなど、この文書で必須としていない人間評価は、未実施でも通常PASSを妨げません。

## リリース記録

監査結果を記録するときは、少なくとも次を残します。

- 対象branchまたはPRと、対象commit / PR head SHA
- 監査を行った日付
- 実行した自動検査と結果
- 0.7能力非退化を監査した場合は固定比較SHAと能力台帳の結果
- 実ブラウザーで確認した項目と環境
- 確認したviewportとresize試験の結果
- 素材試験の結果
- 実行していない必須検査
- ライセンス保持・配布表示の確認結果
- FAILがあった場合の再現条件と修正commit
- 既知の制約または残存問題
- 最終判定

正式なリリースPASSの記録では、必須項目に未検証がないことと、判定直前の対象SHAが監査対象と一致していることを明示します。

## 関連文書

- あかりの概要と基本的な使い方: `README.md`
- 使い方と言語仕様: `LANGUAGE.md`
