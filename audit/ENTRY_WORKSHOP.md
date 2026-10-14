# 入門画面と操作チュートリアルの契約

この文書は要件と試験の対応を定義します。実施済み・合格の証拠ではありません。製品版は1.2.3、言語・ランタイム・作品・実行形式の契約は既存の2を維持します。

| 要件ID | 根拠・期待値 | 実装箇所 | 試験ID・起動先 | 証拠 |
|---|---|---|---|---|
| ENTRY-SETTINGS | 初回のみ入門。保存済み通常設定を保つ | normalizeEntryUiLevel、uiLevelハンドラー | entry-workshop-core / ENTRY-SETTINGS、entry-workshop-browser / ENTRY-MODE-PRESERVATION | entry-unit.json、entry-browser.json |
| ENTRY-SURFACE | 左ブロック・中央編集・右作品と部品。常設操作、内部スクロール | 入門CSS、renderEntrySurface、syncEditorShell | ENTRY-FIRST-VIEW | 1280×720、1366×768、1920×1080の画像と領域境界 |
| ENTRY-CATALOG | 入門集合と通常基本を別に検証。既存本文を削除しない | ENTRY_BLOCK_SCHEMA_IDS、BASIC_BLOCK_SCHEMA_IDS、renderPalette | ENTRY-CATALOG、ENTRY-MODE-PRESERVATION、既存search-bindings | スキーマ列、本文・履歴比較 |
| EDITOR-APPEND | 明示挿入点が優先、未指定は最上位末尾。選択を挿入点扱いしない | 既存defaultDestination、paletteAdd、prepareBlockEdit、追加後focus | EDITOR-APPEND-POSITION、既存ux-insertion-context-browser | 追加・Undo/Redo、明示点・入れ子・原文の比較 |
| EDITOR-DESIGN-POSITION | 新規座標だけに確定設計位置。倍率・実行座標を混ぜない | computeBlockInsertionAvailability、createSyntaxNode | EDITOR-DESIGN-POSITION、EDITOR-POSITION-DEFAULTS、既存designer-zoom | 整数・小数・負数・外側座標、API標準値 |
| TUTORIAL-DEFINITIONS | 26小手順に許可、入力、判定、回復、出口を定義 | TUTORIAL_STEPS、tutorialAdvance、tutorialAllows | TUTORIAL-DEFINITIONS、TUTORIAL-TRANSITIONS | 機械可読な定義と234遷移ケース |
| TUTORIAL-GUARD | 外観だけに依存せず、操作入口とDOM経路で拒否する | tutorialCapture、tutorialOperationAllowed、run/save/undo/openの入口 | TUTORIAL-ALL-STEPS | 全26手順×19禁止経路の変更前後比較、手順画像 |
| TUTORIAL-RUNTIME | 通常ランタイムの発話→右→左と、150歩・順番変更を観察する | bridgeのbeforeStatement、tutorialCollectRuntime、tutorialFacts | TUTORIAL-ALL-STEPS | 実操作・確定本文・実行到達に基づく手順通過 |
| TUTORIAL-EXIT | 実行を止め、制限と強調を解き、作品と未確定入力を残す | finishTutorial、releaseInteraction | TUTORIAL-ALL-STEPS、TUTORIAL-PENDING-EXIT、TUTORIAL-PROTECTED-START | 全26手順で退出・保持・解除、合成IME中の保持、開始取消、退出後の通常編集 |
| TUTORIAL-RESUME | 同じページ・未変更の同じ練習だけ再検査。進度を永続保存しない | pausedTutorial、workspaceIdentity、beginTutorial | TUTORIAL-RESUME-IDENTITY | 続行・改造後の開始取消の比較 |
| TUTORIAL-SAVE | 既存保存後に選んだファイルの内容一致で完了する | saveProject、verifyTutorialSave、tutorialSavedFile | TUTORIAL-SAVE-REFUSALS、TUTORIAL-ALL-STEPS | 実download、取消・解析失敗・不一致・再試行、作品/履歴不変 |
| ENTRY-GATE | 未実施・欠落・重複・SKIP・別SHAを合格にしない | entry-workshop-contract、entry-workshop-verify、gate-contract、verify-gate-results | entry-verify | 16種の不正証拠拒否、既存selftest集約、acceptanceのentry-workshopジョブ |

追加のDOM試験は、EDITOR-POSITION-DOM（小数・負数・表示倍率・回転・ドラッグ完了/取消・Undo/Redo・対象切替）、TUTORIAL-INPUT-RECOVERY（誤値・合成IME・取消・連打・フォーカス）、TUTORIAL-SAVE-FAILURE（保存準備失敗・保存後改造・再保存）、TUTORIAL-STALE-CALLBACK（退出後の遅延完了・更新後の作品復元）です。全26手順で、操作なしの待機中には進度と作品が変わらないことも比較します。判定は値の一致と、その手順の操作確定の両方を必要とします。

実行例: `node audit/tests/entry-workshop-core.mjs audit-evidence/entry/unit.json`、`node audit/tests/entry-workshop-browser.mjs <固定Chrome> audit-evidence/entry/browser.json`、`node audit/tests/entry-workshop-verify.mjs audit-evidence/entry/unit.json audit-evidence/entry/browser.json audit-evidence/entry/verification.json`。最終集約は未コミットの公開入力を拒否します。ダウンロードした監査成果物など、公開入力以外の未追跡ファイルは入力の変更と区別します。限定試験だけに使える`--working-copy`は、最終証拠として集約されません。

## 表示設定の変換

| localStorageのakari.uiLevel.v1 | 表示 |
|---|---|
| キーなし・読取り不能 | はじめて（entry） |
| entry | はじめて |
| basic | かんたん |
| advanced、旧all | くわしく |
| 空文字・その他未知値 | 旧動作と同じかんたん |

作品形式のeditorState.uiLevelは従来のbasic/advancedを維持し、entryの保存時はbasicを記録します。入門はlocalStorageの表示選択です。作品に学習進度や操作ロックを追加しません。Undo/Redoの一時的な表示状態は現在の入門選択を保持できます。モード変更は未確定入力・IME・ドラッグ中には保留し、構造上の書きかけは保持します。

## ブロック選定

入門は方向移動、左右回転、横縦座標移動、時間付き座標/方向移動、時間付き発話、待つ、回数反復、衣装/背景変更、同期の合成音/音声を表示します。対象種別や素材不足による無効理由は既存検証を使用します。値・条件・内部下書きスキーマは入門のパレットへ公開しません。本文にある対象外の命令は残して表示し、通常表示で編集する案内を出します。

通常基本は6作品の改造で頻用する発話、座標/時間付き移動、回数、待つ、左右回転、条件、部品の文字、共通手順、音を先頭に置きます。入門集合、ずっと反復、旧基本の前移動・表示/非表示も保持します。点数等の設定・加算、リスト項目、花もようのペン操作も基本から届きます。従来の分類・検索は残します。

## 保存確認の設計決定

既存保存はダウンロード開始までしか観測できません。保存操作そのものの意味は変更せず、チュートリアルの最後に、保存した.akari.mdを選ぶ確認を追加することが承認されました。作品を開く処理から分離し、解析・素材検証後の作品指紋を保存時点の指紋と比較します。ファイル名やappVersionだけでは一致にしません。選択取消、解析失敗、不一致は制限を解除せず、再選択・途中退出ができます。保存後に作品が変わった場合は再保存を要求します。古い非同期読込みはepoch・保存記録・作品同一性を再確認してから判定します。

## 実施環境と未確認の区別

ブラウザー自動試験は固定Chrome for Testing 140.0.7339.207、Playwright 1.55.0を使います。マウス・キーボードは実DOMへの操作、touch/drag/drop/IMEの合成イベントはそのように記録します。headlessのdeviceScaleFactor・viewportと、実PCのOS表示倍率は別の情報です。実Chromebook、実IME、実児童、独立実監査の未実施を自動試験PASSで代替しません。

開始mainは2d4022a88dceef1cbe3a9a8d87dc3bd8c3a91497。開始時の文書にはAUDIT.mdの製品版1.2.1と、起動時の選択が画面であるとの記述が残っていました。実装は1.2.2、起動・新規はマスコット選択、作品読込みは画面選択です。これらは実装の観察に基づく文書修正であり、試験だけを根拠に仕様変更していません。
