# 入門画面と操作チュートリアルの契約

この文書は要件と試験の対応を定義します。実施済み・合格の証拠ではありません。製品のpathと版は `audit/public-files.json`、言語・ランタイム・プログラム形式・作品形式の番号はLANGUAGE.mdの「保存・実行データの契約と検証」に従います。

| 要件ID | 根拠・期待値 | 実装箇所 | 試験ID・起動先 | 証拠 |
|---|---|---|---|---|
| ENTRY-SETTINGS | 初回のみブロック表示の「はじめて」。保存済みの「かんたん」「くわしく」を保つ。「はじめて」はブロックモードだけで、見せ方の切りかえボタン（「ブロックモード ⇄」）を押してもコードモードにせず、ボタンの下に「コードで 書くときは、上の「かんたん」か「くわしく」を えらんでね」と出す | normalizeEntryUiLevel、uiLevelハンドラー | entry-workshop-core / ENTRY-SETTINGS、entry-workshop-browser / ENTRY-MODE-PRESERVATION | entry-unit.json、entry-browser.json |
| ENTRY-SURFACE | 左ブロック・中央編集・右作品と部品。常設操作、内部スクロール | 入門CSS、renderEntrySurface、syncEditorShell | ENTRY-FIRST-VIEW | 1280×720、1366×768、1920×1080の画像と領域境界 |
| ENTRY-CATALOG | 入門集合と通常基本を別に検証。既存本文を削除しない | ENTRY_BLOCK_SCHEMA_IDS、BASIC_BLOCK_SCHEMA_IDS、renderPalette | ENTRY-CATALOG、ENTRY-MODE-PRESERVATION、既存search-bindings | スキーマ列、本文・履歴比較 |
| EDITOR-APPEND | 明示挿入点が優先、未指定は最上位末尾。選択を挿入点扱いしない | 既存defaultDestination、paletteAdd、prepareBlockEdit、追加後focus | EDITOR-APPEND-POSITION、既存ux-insertion-context-browser | 追加・Undo/Redo、明示点・入れ子・原文の比較 |
| EDITOR-DESIGN-POSITION | 新規座標だけに確定設計位置。倍率・実行座標を混ぜない | computeBlockInsertionAvailability、createSyntaxNode | EDITOR-DESIGN-POSITION、EDITOR-POSITION-DEFAULTS、既存designer-zoom | 整数・小数・負数・外側座標、API標準値 |
| TUTORIAL-DEFINITIONS | 共通手順と9分岐に許可、入力、判定、回復、出口を定義 | TUTORIAL_STEPS、tutorialAdvance、tutorialAllows | TUTORIAL-DEFINITIONS、TUTORIAL-TRANSITIONS | 機械可読な定義と各経路の遷移拒否ケース |
| TUTORIAL-GUARD | 外観だけに依存せず、操作入口とDOM経路で拒否する | tutorialCapture、tutorialOperationAllowed、run/save/undo/openの入口 | TUTORIAL-ALL-STEPS | 代表の全手順と9分岐の固有手順×19禁止経路の変更前後比較、手順画像 |
| TUTORIAL-RUNTIME | 通常ランタイムの発話・逃げる座標変化・点数・条件・大きさ・衣装・回転を観察する | bridgeのbeforeStatement、tutorialCollectRuntime、tutorialFacts | TUTORIAL-ALL-STEPS | 実操作・確定本文・実行到達に基づく手順通過 |
| TUTORIAL-EXIT | 実行を止め、制限と強調を解き、作品と未確定入力を残す | finishTutorial、releaseInteraction | TUTORIAL-ALL-STEPS、TUTORIAL-PENDING-EXIT、TUTORIAL-PROTECTED-START | 代表の全手順と9分岐の固有手順で退出・保持・解除、合成IME中の保持、開始取消、退出後の通常編集 |
| TUTORIAL-RESUME | 同じページ・未変更の同じ練習だけ再検査。進度を永続保存しない | pausedTutorial、workspaceIdentity、beginTutorial | TUTORIAL-RESUME-IDENTITY | 続行・改造後の開始取消の比較 |
| TUTORIAL-SAVE | 既存保存後に選んだファイルの内容一致で完了する | saveProject、verifyTutorialSave、tutorialSavedFile | TUTORIAL-SAVE-REFUSALS、TUTORIAL-ALL-STEPS | 実download、取消・解析失敗・不一致・再試行、作品/履歴不変 |
| ENTRY-GATE | 未実施・欠落・重複・SKIP・別SHAを合格にしない | entry-workshop-contract、entry-workshop-verify、gate-contract、verify-gate-results | entry-verify | 20種の不正証拠拒否、既存selftest集約、acceptanceのentry-workshopジョブ |

追加のDOM試験は、EDITOR-POSITION-DOM（小数・負数・表示倍率・回転・ドラッグ完了/取消・Undo/Redo・対象切替）、TUTORIAL-INPUT-RECOVERY（誤値・合成IME・取消・連打・フォーカス）、TUTORIAL-SAVE-FAILURE（保存準備失敗・保存後改造・再保存）、TUTORIAL-STALE-CALLBACK（退出後の遅延完了・更新後の作品復元）です。代表の全手順と9分岐の固有手順で、操作なしの待機中には進度と作品が変わらないことも比較します。判定は値の一致と、その手順の操作確定の両方を必要とします。

実行例: `node audit/tests/entry-workshop-core.mjs audit-evidence/entry/unit.json`、`node audit/tests/entry-workshop-browser.mjs <固定Chrome> audit-evidence/entry/browser.json`、`node audit/tests/entry-workshop-verify.mjs audit-evidence/entry/unit.json audit-evidence/entry/browser.json audit-evidence/entry/verification.json`。最終集約は未コミットの公開入力を拒否します。ダウンロードした監査成果物など、公開入力以外の未追跡ファイルは入力の変更と区別します。限定試験だけに使える`--working-copy`は、最終証拠として集約されません。

## レベルの設定の読み方

| localStorageのakari.uiLevel.v1 | レベル |
|---|---|
| キーなし・読取り不能 | はじめて（entry） |
| entry | はじめて（コード表示で始まるときは、コード表示のまま「かんたん」） |
| basic | かんたん |
| advanced | くわしく |
| 空文字・all・その他の値 | かんたん |

「名人」はこの設定に残さず、作品に名人の本文があるかで決まります。作品形式のeditorState.uiLevelはbasic/advancedを持ち、entryの保存時はbasicを記録します。入門はlocalStorageの表示選択です。作品に学習進度や操作ロックを追加しません。Undo/Redoの一時的な表示状態は現在の入門選択を保持できます。モード変更は未確定入力・IME・ドラッグ中には保留し、構造上の書きかけは保持します。

## ブロック選定

入門は「決めたばしょへ行く」「いまのばしょから動く」（三つの動きのブロックのうち、時間を足せるのはこれだけです）「前へ進む」、左右回転、時間付き発話、待つ、回数反復、衣装/背景変更、同期の合成音/音声を表示します。並びは「話す」「待つ」「くり返す」を先に置き、1366×768で1ページに全部見えます。そのまま入れて動かしても止まらない初期値で入ります（すがたは次のすがた、時間は1秒、時間をかけて動く文は1秒で10歩、音は440Hzを0.5秒）。「はいけいを かえる」ははいけいが2つ以上ある作品で、「〔音〕を鳴らす」は音を入れた作品でだけ表示します。入門では本文の中に「いつ動く？」を出さず、きっかけは上の「「動かす」を おしたとき」「「〔名前〕」が おされたとき」で選びます。対象種別や素材不足による無効理由は既存検証を使用します。値・条件・内部下書きスキーマは入門のパレットへ公開しません。本文にある対象外の命令や、ほかのきっかけの本文は消さずに残し、「この 作品には、「はじめて」では 見えない 動きも あるよ。けさずに のこしてあるよ。見るときは、ブロックで「かんたん」を えらんでね。」と表示します。

通常基本（「かんたん」）は6作品の改造で頻用する発話、動きの三つのブロック、回数、待つ、左右回転、条件、部品の文字、共通手順、音を先頭に置きます。入門集合に加えて「〜のところへ行く」、ふれたときのきっかけ、「自分のほかの動きを止める」を持ち、ずっと反復と表示/非表示も保持します。点数等の設定・加算、リスト項目、花もようのペン操作も基本から届きます。従来の分類・検索は残します。

## 保存確認の設計決定

既存保存はダウンロード開始までしか観測できません。保存操作そのものの意味は変更せず、チュートリアルの最後に、保存した.akari.mdを選ぶ確認を追加することが承認されました。作品を開く処理から分離し、解析・素材検証後の作品指紋を保存時点の指紋と比較します。ファイル名やappVersionだけでは一致にしません。選択取消、解析失敗、不一致は制限を解除せず、再選択・途中退出ができます。保存後に作品が変わった場合は再保存を要求します。古い非同期読込みはepoch・保存記録・作品同一性を再確認してから判定します。

## 未保存の作品を置き換える前の確認

練習を始めるとき、いまの作品に未保存の変更があれば、製品自身の確認画面（#loseConfirmModal。ボタンは「やめる」「ほぞんしてから つづける」「すてて つづける」）で尋ねる。確認画面は開いた時点で「やめる」にフォーカスがあり、文は「「〔作品名〕」には まだ ほぞんしていない ところが あるよ。このまま つづけると、いまの 作品は なくなるよ。」である。「やめる」は作品・履歴・書きかけ・選択を変えず、練習を始めない。「ほぞんしてから つづける」は作品ファイルを保存してから、「すてて つづける」はいまの作品を残さずに、練習用の作品に置き換える。試験はブラウザー標準の確認ではなく、この確認画面のボタンを実際に押す。

## 実施環境と未確認の区別

ブラウザー自動試験は固定Chrome for Testing 140.0.7339.207、Playwright 1.55.0を使います。マウス・キーボードは実DOMへの操作、touch/drag/drop/IMEの合成イベントはそのように記録します。headlessのdeviceScaleFactor・viewportと、実PCのOS表示倍率は別の情報です。実Chromebook、実IME、実児童、独立実監査の未実施を自動試験PASSで代替しません。

LANGUAGE.mdの保護本文には、起動・新規・読込みで画面の本文を編集できる契約があります。実装の初期選択は、起動・新規がマスコット、読込みが画面です。保護された33節と元の意味・期待値を維持し、初期選択の明記は別節に置きます。通常画面で部品を追加する既存の試験は、通常表示を選ぶ準備操作を明示します。

タッチ相当のブラウザー操作（hasTouchとlocator.tap）では代表経路の全手順と完成を検査し、各実行試行の最初のキャラクター操作をEnterでも起動します。9分岐の固有手順の退出・再開は別のマウス・キーボード実DOM検査です。TUTORIAL-TOUCH-AND-KEYBOARDは物理タッチ・実Chromebookの検証ではありません。

RUNTIME-CLICK-KEYBOARDは、IDを持つ複数のクリック本文の先頭がコメントだけでも、実行本文があるキャラクターをEnterで起動できることを検査します。renderComponentsは通常のmatchingScriptsとscriptAstを使い、1回の実行中に固定された対象集合を描画とコピーで再利用します。ブラウザー所有の更新・閉じる・検索・印刷・タブ切替等はチュートリアルの操作制限から除外し、全手順でキーイベントの非取消を確認します。既存の通常画面の検査は元の順序を保ち、入門の3工程（entry-unit、entry-browser、entry-verify）をselftestの末尾へ登録します。


## さかなキャッチ：共通作品と3×3の続き

共通部分はクリックの選択、発話ブロックの挿入と言葉の編集、逃げるブロックの挿入、3回遊ぶ、停止、コース選択。案内は自動開始しない。

| 親コース | 子コース | 新たに経験する操作・変化 |
|---|---|---|
| 動き：滑らかな移動を足す | あちこちへ泳ぐ | 座標と移動時間、秒数の自由変更 |
| 同上 | いったりきたり | 反復の囲い、右・左の順序、回数の自由変更 |
| 同上 | 小さなさかな | 大きさの％と捕まえやすさ、45〜100の自由変更 |
| ゲーム：点数を増やし表示する | めざせ、5ひき | 条件の囲い、到達後の発話、目標数の自由変更 |
| 同上 | おまけの点 | 一致条件で加点、条件の数の自由変更 |
| 同上 | あと何びき | 引き算と0を下限にした残り表示、目標数の自由変更 |
| 音：キャッチ音を足す | 音をならべよう | 3音の順序と待機、音の高さの自由変更 |
| 同上 | さかながへんしん | 2つの衣装の切替、大きさの自由変更 |
| 同上 | くるくるショー | 回転・待機・反復、回数の自由変更 |

子コースは一つ作って終わるだけでなく、他の親コースを足せる。選んだ親は重複させない。同じ親の別の子を無断で置換しない。各選択点に「ほぞんしておわる」を置く。最後は通常ファイルの内容照合で完了する。

絵2点・点数ボード・点数0・見える「自分のほかの動きを止める。」ブロックを教材の土台として用意する。最初の場面で「いちばん上の ブロックは、前に おしたときの 動きを 止めて、はじめから 動くための ものだよ。」と説明する。通常のクリック本文に児童が命令を挿入し、専用ランタイム・新スキーマ・保存形式は増やさない。連打で未完了の前の実行を止めるため、次のクリックは新しい反応として動く。条件のコースは条件成立時にお祝いし、その後も遊べる。停止・再実行で点数・位置・姿は初期状態へ戻る。

手順判定は実操作確定と全文の構造一致を要求する。自由変更も指定欄・型・範囲を守り、以前と異なる値を本人が選ぶ。囲いの空欄は次の挿入で埋める。操作数や経過時間だけで合格しない。退出・未確定入力・IME・取消・保存・古い非同期結果の保護を維持する。

TUTORIAL-BRANCHES は9経路を独立した経路表から実DOM操作し、分岐固有の退出・再開、任意値の変更とUndo、描画、保存完了を検査する。共通の代表経路は全手順×19禁止経路、ブラウザー所有キー、画像、マウスとタッチ相当を検査する。期待経路は製品の許可リストから取得しない。Nodeの音終了コールバックは実際の聴取と区別する。実児童の習得は、技術試験のみで確認済みとしない。

案内が編集欄へ移るときは、その欄を作業台内にスクロールしてから操作できるようにする。数の変更では、その数がゲームの何を変えるかを短く示す（目標数、くり返す回数、泳ぐ時間、大きさ、音の高さ）。泳ぐ時間は0.5〜2秒の範囲とし、百分の一の値を要求しない。全親コースを追加した後は、存在しない次のコースを勧めず保存を案内する。

## 誘導表示の回帰検査

全分岐の追加操作で、通常候補を複数表示、挿入先だけを強調、選択前の追加拒否、挿入先クリック後の対象候補強調、対象外クリック拒否、追加後の次手順を確認する。矩形とcomputed style、画面キャプチャで見える強調を確認する。DOM上のクラス存在だけで実画面合格とはしない。再描画後にも同じ判定を行う。
