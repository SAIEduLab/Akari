# あかり — 監査契約
本書は現在必要な機能保証の契約です。機能別説明の試験IDは現在の保証への参照です。必要な意味・独立期待値・実操作を保ち、過去の件数・工程・資料の復元は求めません。

## 入門とチュートリアルの追加契約

[入門契約と要件対応表](audit/ENTRY_WORKSHOP.md)に、入門集合・通常基本・共通手順と9分岐の許可操作と判定、退出・保存確認、通常編集の追加と座標初期値を定義します。`entry-workshop-core`、`entry-workshop-browser`、`entry-workshop-verify`を必要な実行・集約へ接続します。同じ入力・環境での二重起動は要求せず、有効な結果を共有します。全手順で操作前の待機、許可操作、禁止操作、退出を検査し、未実施・SKIP・証拠欠落・別SHAを合格にしません。

作業コピーの限定試験はそのように記録します。最終集約ではコミット済みHTMLのSHA-256と試験対象の一致、全画面証拠の存在とハッシュを確認します。自動ブラウザー試験は実児童・実Chromebook・実IME・独立実監査の代替ではありません。

## 対象と固定

この契約は現行製品を守るための検査を定める。所有者の明示した方針が基準であり、過去の監査規則や実装形態はその決定を妨げない。互換維持なら検査を機能させ、互換切りなら対応する旧互換要求・専用データ・参照を除去する。代理の判断は委任範囲に限る。

製品のpath/版は audit/public-files.json、意味と保存契約はLANGUAGE.md、現在の独立期待値と必要結果は各現行contract/fixtureを参照する。製品・LANGUAGE・マニュアル不変の基盤整理では、これらのbyteや版を変えない。製品版と形式・言語/runtime契約番号は独立する。

現行の実行証拠を製品hash、commit、試験入力、環境、run/attemptへ結び付ける。固定値の更新だけで実行成功としない。必須結果の欠落・重複・失敗・例外・timeout・別入力・偽PASSを拒否する。過去の台帳やsourceのbyte復元を現在の合格条件にしない。

## 製品版から独立した命名と受入判定

配布する製品HTMLは `Akari_<major>_<minor>_<patch>.html` とし、`Akari` 直後の `_` を必須にします。`audit/public-files.json` の `productFile` を現行pathの正本にします。製品を変更する作業では、mainの現行製品版からpatchを一度だけ上げます。それ以外の上げ方（minor・major・patchの複数）は所有者の判断であり、PRに所有者のラベル（後掲）を付けた場合だけ受け入れます。版を下げることは認めません。製品不変の指示・監査基盤整理では製品版を変更しません。同じ作業内の複数改修・commit・レビュー対応では版上げを繰り返さず、版上げと関連更新をmergeする作業branch/PRに含めます。製品版、ファイル名、公開リンクを一致させ、現行ツリーには製品HTMLを1つだけ置き、入れ替えた旧製品HTMLを削除します。製品ファイルとrelease freezeの版表示は配布ラベルであり、機能名・安定test ID・保存形式・言語とruntimeの契約番号には流用しません。

- 関数・変数・監査IDは機能・責務を示す名前にします。`restoreV103`、`runVersion09Tests`、`parseRelease104`のようにリリース番号を組み込まず、整理番号が必要なら`validateCase001`や`FORMAT-PROJECT-001`のように機能名から区切ります。番号の対応先は製品版ではありません。
- 製品のリリースラベルは一か所に定義し、UI表示・保存と書出しの作成元記録・公開APIへの露出だけで参照します。`appVersion`は型・長さ・文字種を検証する記録項目で、現在製品版との一致や大小比較を受入条件にしません。
- 保存形式・プログラム形式・言語・runtimeは独立した整数契約番号で検証します。同じ契約の別製品版を受け入れ、契約不一致・型不正・欠落・破損を拒否します。所有者、素材、上限、本文一致、原子的な失敗の保証を維持します。自動変換・暗黙の補完は加えません。
- `audit/lib/release-policy.mjs`をstatic gateで必須実行し、製品の識別子と監査コードの関数名をASTで検査します。製品版・作成元ラベルの参照は許可した構文と用途に限定し、別名経由の読取りや複製した版文字列を拒否します。外部の形式番号・標準API名まで一律禁止しません。`release-policy-negative.mjs`で禁止名・版比較・別名・計算プロパティ等の不正な追加を拒否できることを確認します。違反は警告ではなくFAILです。
- `format-compatibility.mjs`の固定9件は、製品のリリース表示値だけを変更した候補から作品を作り、同じ契約の別製品による読込み・実保存・自動復元・生成HTMLのオフライン実行を検査します。未保存内容とclean/dirtyの保持、作成元だけを除く指紋、未知の契約と不正データの拒否を含めます。結果の欠落・重複・失敗・別snapshotは独立したvalidatorで拒否します。
- SEMANTICでは、製品版を動作判定へ戻す間接参照や動的プロパティ名、静的検査の許可用途の拡張も差分レビューします。静的検査だけで任意の間接参照の不存在を証明したとは扱いません。HYBRIDではUI経由の読込み・復元と未保存保護を実ブラウザーで確認します。

保存の受入基準は、データの構造・意味を識別する契約の一致です。製品版の完全一致ではありません。この基準を`FORMAT-EXECUTABLE-CONTRACT`と`FORMAT-PROJECT-METADATA-001 作成元と保存契約`で固定します。現行の保存形式（項目形式3）以外のファイル、破損、契約不一致は、理由を示して拒否します。作成元だけが異なる作品は受け入れ、内容を保持します。

## 製品ソースとビルド

製品HTMLは `src/` からの生成物です。`src/akari.html` が骨組みと `<!-- @include … -->` で `src/css/` と `src/js/` を順に取り込み、`src/js/` の `// @portable extensions/<name>.js` は該当する拡張ソースから末尾のexport行を除いた本文を取り込みます。`node src/build.mjs` で生成し、`--check` で一致を確認します。製品を直接編集せず、`src/` を変更して生成し直します。

selftestの `product-source` は、`src/` から生成した結果がコミット済みの現行製品とbyte単位で一致し、`src/css/` と `src/js/` の全ファイルを一度ずつ取り込むことを検査します。変更したソース・拡張ソース、未取込みのファイル、重複取込み、不正な指示行をそれぞれ検出できることも同じ検査で確かめます。

## コードの所属と到達性

1. 全イベント本文に実在する画面・部品の `targetId` が必要です。共通動作・計算・定義下書きには画面を示す `ownerId: "stage"` が必要です。
2. 所属なし、存在しない対象、対象外イベント、重複識別子を読込み・保存・コンパイル・書出しで拒否します。無視・切り捨て・暗黙の所属補完で通しません。
3. 起動・新規作成・作品読込みと、部品の選択では、コード／ブロックの本文を追加の編集ボタン操作なしで編集できます。別の部品では現在のできごとに本文があれば維持し、空なら対応イベント順で最初の本文があるものを開きます。すべて空なら現在の有効イベントを、同じ部品の再選択では明示選択した空の本文も維持します。開始が空でクリックに処理があるボタンを実ポインターで選び、直接編集・Undo・Redoを検査します。「すべてのコード」から全本文一覧を開けることも検査します。
4. 複数イベント、式内の計算呼出し、共通動作から別の共通処理への呼出し、未使用定義、非表示部品、未完成・書き方エラーの本文を含めます。再帰は一度だけ表示してリンクで辿れることを検査します。
5. 参照表示は登録本文を複製しません。表示・編集・構文コンパイルが同じ本文識別子を使い、保存前後で所有者と本文が一致することを検査します。
6. ソースの所有者を実行対象と混同しません。画面所属の共通動作が呼出し元の部品で実行され、引数、局所値、再帰、求値の意味を保持することを検査します。

## 機能と編集の保証

- すべての命令・式・対象・できごと・上限は後掲の能力台帳に対応します。命令名や件数だけで代用せず、各試験は入力と独立した期待値を持ちます。
- コード／ブロックは一つの本文を編集します。字句表面、空白、改行、コメント、文字列、式の役割、入れ子、空の枝を保持します。無編集の往復でsourceを整形しません。
- 書き方エラーを含む途中の本文を保存・再読込できます。意味エラーだけでASTやブロックを消しません。保存・書出し・実行可否はそれぞれの契約で判定します。
- 編集は原子的です。IME、未確定入力、古い文脈、上限超過、取消で別の本文を上書きしません。Undo/Redoはコード、ブロック、部品、素材、定義下書きで共通に働きます。
- ブロックは命令・値・条件の形と接続を持ちます。入れ子の空間、空スロット、移動先、選択、注釈、無効理由、キーボード操作、ズーム、長大本文の段階表示を実ブラウザーで検査します。
- 実行と設計は分離します。停止・一時停止・単一ステップ・失敗記録・呼出し元・実行行・質問・音声・クローン・入力の終了処理を検査します。
- 自動保存は作品・素材・定義下書きを保存します。復元は利用者の選択後に行い、破損・未対応形式・書込み失敗は現在作品を壊しません。保存したことと永続化できたことを混同しません。
- 部品複製、透明なお絵かき、画像・背景・衣装、MP3/WAV(PCM)/M4A(AAC-LC)/FLAC/Ogg Opus、全上限、破損・不正素材の拒否を維持します。
- 作品画面のズーム・自動フィット・スクロール・ポインター座標・タッチ・狭い画面・ウィンドウのフォーカス喪失を検査します。必要なネイティブイベントを合成イベントで代用しません。
- 実行用HTMLは同梱runtimeでオフライン実行し、素材・版・プログラム所属を検証します。監査fixtureや自己テストを製品へ埋め込みません。

## UIとボタンの整合性

`audit/tests/ui-buttons.mjs`を実ブラウザーで実行します。次の安定IDを必須とし、GA-EXECで操作・表示・本文・履歴の期待値を検証します。HYBRIDではコード／ブロックと動作・計算の本文、かんたん／くわしく、狭い画面・マウス・キーボード・タッチを確認し、不要な有効ボタンや到達できない操作がないことをレビューします。代替操作の存在だけで、見えるボタンの不動作を合格にしません。

| 安定ID | 期待値 |
|---|---|
| UI-BUTTON-SOURCE-NAV | 「すべてのコード」で一覧を開く。「本文を なおす ところへ もどる」は一覧表示中だけ表示。「画面のコード」は部品選択時だけ表示し、画面の一覧へ進む。 |
| UI-BUTTON-BASIC-HISTORY | かんたんでもUndo/Redoを表示し、履歴なし・編集lock時は無効。本文と部品編集の履歴を共通に戻し、やり直せる。 |
| UI-BUTTON-SIDE-ACTIONS | コードのせってい／動きのようすは通常の見出し。ブロックの折り畳みは維持し、部品一覧直下の複製／削除は設定欄を開かず使える。コードでは設定欄に同じ操作を置く。 |
| UI-BUTTON-LEVELS | 表示設定ははじめて／かんたん／くわしくの3段階。初回のみはじめて。保存済みallはadvanced扱い。変更によって本文と履歴を変えない。 |
| UI-BUTTON-PENDING | 動作・計算の「入力を取り消す」は未確定／失敗入力時だけ表示し、反映済みの下書き全体は捨てない。入力確定は未確定入力があるときだけ表示する。定義保存と閉じる際の破棄確認を維持。 |
| UI-BUTTON-BLOCK-DESTINATION | 命令／式の追加先選択を取消とEscapeで解除し、本文と履歴を変えない。移動・複製・移動元の式の置換を取り消せる。 |
| UI-BUTTON-BLOCK-INSERTION | 命令の途中と末尾の追加先ボタンを可視の高さ28pxで表示し、マウス／タッチで選べる。ドラッグ／キーボードの代替も維持。 |
| UI-BUTTON-BLOCK-COMMANDS | 主本文と動作・計算で、追加・移動・複製・削除・式置換・可変入力操作、パレットの分類／検索／ページ／フィルター、作業台の拡大率／道具箱／表示範囲へ到達でき、必須入力と境界の制限を守る。 |
| UI-BUTTON-RESPONSIVE | 狭い画面でも本文・部品操作・未確定入力の確定／取消へ到達できる。表示幅だけで本文や履歴を変えない。 |

## ブロック入力欄の表示

短い入力値は実際のフォント、文字間隔、padding、border、候補リスト矢印を含む幅を確保します。入力・フォント読込み・ズーム・動作と計算の編集にも同じ処理を適用します。長い値は幅上限と入力中のスクロールを保ち、titleを全文へ更新します。

`audit/tests/block-field-width.mjs` の8件を必須とします。日本語、英字・数字・絵文字・結合文字、入力による拡縮、フォント変更、ズーム、長い値、定義モーダルを実ブラウザーで検査し、独立したDOM文字幅測定で見切れを判定します。幅を故意に狭くした拒否試験も維持します。LinuxとWindowsの証拠を必須bundleへ含め、結果欠落・重複・失敗・例外をPASSにしません。

## 実行区分と合格条件

| 区分 | 検証 |
|---|---|
| GA-STATIC | 現行製品HTMLの単一性・版付きpathと製品版の一致・旧製品混入の拒否、JavaScript構文、版、所有モデル、全公開ファイルhash、能力・ID集合、workflowと実行入口、資料整合、自作識別子と製品版参照のAST検査・拒否能力 |
| GA-EXEC | 製品試験、言語表面試験、編集試験、編集GUI試験、ブラウザー試験（全ブロックschemaのGUI行を含む）、素材編集試験、音声試験、画面ズーム試験、コード所属試験、形式互換試験、UIボタン整合性試験、ブロック入力欄表示試験（LinuxとWindows）、保存・生成HTML・マニュアル。件数は現行のmanifestとcontractが正本で、本書には書かない |
| SEMANTIC | 仕様と実装の一致、主要処理の可読性、命令・求値の機能保持、監査の非弱体化、教材操作の妥当性 |
| HYBRID | 所属と全本文への到達性、表示と実行対象の分離、エラー本文と下書きの保持、UIの読みやすさ、UIとボタンの整合性 |

Node実行は決定的な検査を補助します。DOM、pointer、IME、focus、drag、resize、touch、音声デコード、download、IndexedDB、生成HTMLには実ブラウザーが必要です。音声はLinuxとWindowsを対象にします。複数の表示幅・入力方法の試験を代表1件で代用しません。

性能試験は本文100,000文字、長大本文16,666行、構文の遅い失敗、式深さ、DOMの段階表示、選択・スクロールを扱います。タイムアウトや上限を緩めてPASSにしません。

能力・安定ID・期待値の変更は仕様変更と対応させます。実測結果から期待値を自動生成して追認しません。固定集合と独立したvalidatorで、欠落・重複・失敗・異なるsnapshotを拒否します。negative testでvalidator自身の拒否能力を検査します。

ローカル監査の入口は `audit/run-local-gate.mjs`、ブラウザー群の入口は `audit/browser/run-full-browser-audit.mjs` です。CIでも同じ入口を使います。証拠は `audit-evidence/` に出し、Gitに含めません。Actions artifactの保持期間は3日です。

## 監査基盤の保証

監査基盤そのものも検査します。次はローカルgate（`audit/lib/gate-contract.mjs`の`gateSteps`）の必須段です。段の一覧と各段の結果の検証は`gate-contract`と`verify-gate-results`が正本で、本書に件数を書きません。

- **公開ファイルの一致**（`publication-inventory`）: `audit/public-files.json`は`git ls-files`と両方向で一致します。gitがない環境ではFAILです。
- **文書の整合**（`publication-documents`）: 追跡する文書は、現行の製品ファイルと現行のリリース表示だけを挙げます。
- **配布の固定**（`release-distribution`）: `audit/manifests/release-<版>.json`は1つだけで、製品・文書・契約番号のhashと一致します。契約番号は`features.json`のEXECUTABLE_CONTRACTから読みます。
- **監査ファイルの到達性**（`audit-inventory`）: `audit/`の追跡ファイルは、gate段・受入コマンド・ブラウザー群・workflow・runnerの読込み・本書とREADMEの案内のいずれかから到達できます。到達できないファイルはFAILで、合成した孤立ファイルで拒否能力を示します。
- **workflowの契約**（`workflow-contract`）: 必須ジョブと`needs`、トリガー、`continue-on-error`の禁止、全ジョブの`timeout-minutes`、artifact保持3日、mainの実行を途中で取り消さない並行制御を、workflowの文面から検査します。段の実行はgate・runnerの入口に限ります。
- **結果の形式**: 終了コードだけで判定していた段も、case IDを持つ結果（`akari-gate-cases-v1`）を書き、validatorが全case PASSの集合を確認します。
- **文の形の網羅**（`sentence-form-coverage`）: 製品の有限な文型表（`SENTENCE_FORMS`、`CONDITION_FORMS`、`SENTENCE_TE_FORMS`等）の全項目に、独立した入力と期待値を持つ事例が必要です。到達できない項目は網羅の不足としてFAILになり、製品の表から消します。項目を外しても結果が変わらないことで、各項目が必要なことを確かめます。
- **仕様の例文**（`spec-examples`）: LANGUAGE.mdとEXTENSIONS.mdの`text`ブロックは、製品の構文解析器で読めます。読めない例は`<!-- akari-example: rejected -->`で明示し、拒否されることを確かめます。
- **現行schemaの網羅**: `audit/fixtures/block-schemas.json`は、現行のブロックschemaをLANGUAGE.mdから手で書いた独立の期待値です。ブラウザー群`schemas`は、`features.json`のschema全件にGUI行を持ちます。
- **命名**: 関数・ID・ファイル名・gate段に、版番号や過去の作業名を使いません。`static-contract`が拒否します。

### 監査の変更ガード

`.github/workflows/akari-change-guard.yml`のジョブ`audit-change-guard`は、PRのbaseとheadを比べます。

- gate段・受入suite・ブラウザー群のタスクとcase・製品試験・言語試験のIDを、1つでも消す、または固定値（sha、pin）を変えると、PRに所有者のラベル`owner-approved-audit-change`が必要です。追加にラベルは要りません。
- 製品またはsrc/を変えたPRの製品版は、baseのpatchを1つ上げた版です。それ以外の上げ方（minor・major・patchの複数）は、同じラベルがあれば受け入れます。下げることと、製品を変えないPRで版を変えることは、ラベルがあってもFAILです。
- リリースの記録は、head版の名前の1つだけです。
- ラベルは所有者だけが付けます。ガードのファイルの変更には、所有者の承認が必要です（`.github/CODEOWNERS`）。
- `change-guard-negative`は、合成したbase/headで各規則の拒否を確かめます。

### 製品内の保存確認

未保存の作業があるときに「新しく作る」「いっしょに作る」「ファイルを開く」を押すと、製品は自前の確認画面（`#loseConfirmModal`、ボタンは「すてて つづける」「やめる」）で尋ねます。ブラウザー標準の確認は使いません。標準の確認に自動で答えるテストは、`audit/lib/product-dialogs.cjs`で製品の確認画面にも答えます。確認そのものを検査するテストは、ボタンを押して文面と結果を確かめます。

## 能力台帳

各行は現行能力の対応を示します。必要な意味・操作を検証し、件数や内部実装名だけで保証保持を認定しません。試験集合の正本は現行manifest/contractです。

| ID | 能力 | 意味 | 保証 |
|---|---|---|---|
| command:Assignment | 点数を0にする | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:NumericUpdate:ADD | 点数に1を足す | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:NumericUpdate:SUB | 点数から1を引く | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ListAppend | 名前一覧に「あかり」を追加する | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ListReplace | 名前一覧の1番目を「ひかり」にする | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ListInsert | 名前一覧の1番目に「ほたる」を挿入する | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ListDelete | 名前一覧の1番目を削除する | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ListClear | 名前一覧を空にする | targetの名前/修飾/束縛・項目readonly・求値の外部変更禁止; 型と範囲はruntime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:IfStatement | 条件分岐とthen本文 | 条件は真偽; 回数は0以上の整数; 必須本文には実行文; 既存スコープと上限 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Say | 「10点以上です」と言う | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:RepeatCount | 開始時に一度評価する回数反復 | 条件は真偽; 回数は0以上の整数; 必須本文には実行文; 既存スコープと上限 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:RepeatWhile | 条件成立中の反復 | 条件は真偽; 回数は0以上の整数; 必須本文には実行文; 既存スコープと上限 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:RepeatUntil | 条件成立までの反復 | 条件は真偽; 回数は0以上の整数; 必須本文には実行文; 既存スコープと上限 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:WaitTime | 0.1秒待つ | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:WaitUntil | 点数が100以上になるまで待つ | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ForEach | リストの各要素の反復 | 項目名衝突S312は意味診断。項目readonly・複製したリストを順次反復 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:MOVE | 10歩動く | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:GOTO | 横100、縦50の位置へ行く | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:GLIDE | 1秒で横200、縦100の位置へ滑る | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:TURN_RIGHT | 右に15度回る | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:TURN_LEFT | 左に15度回る | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:SET_DIRECTION | 方向を90度にする | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:SET_X | 横位置を100にする | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:SET_Y | 縦位置を50にする | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:POINT_TO | 「マウス」の方向を向く | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:MotionCommand:BOUNCE | 端に触れていれば跳ね返る | 部品のみ。数値・対象名・範囲は共通意味検査とruntimeで検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_SCALE | 大きさを120％にする | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_COLOR | 表示色を「赤」にする | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:HIDE | 隠れる | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SHOW | 現れる | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:FRONT | 前面へ出す | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:BACK | 背面へ下げる | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:FORWARD_LAYERS | 1層前へ出す | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:BACKWARD_LAYERS | 1層後ろへ下げる | 部品のみ; 値・色・範囲を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:DOWN | ペンを下ろす | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:SET_COLOR | ペンの色を「青」にする | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:SET_SIZE | ペンの太さを3にする | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:UP | ペンを上げる | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:STAMP | スタンプを押す | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:PenCommand:CLEAR | 描いた線とスタンプを消す | 部品のみ。色・太さの制約を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_BACKDROP | 背景を「空色」にする | 背景名と順序; 全対象 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:NEXT_BACKDROP | 次の背景にする | 背景名と順序; 全対象 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:PREV_BACKDROP | 前の背景にする | 背景名と順序; 全対象 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_COSTUME | 衣装を「星」にする | spriteのみ; 衣装名を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:NEXT_COSTUME | 次の衣装にする | spriteのみ; 衣装名を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:PREV_COSTUME | 前の衣装にする | spriteのみ; 衣装名を検査 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_TARGET_TEXT | 「ボタン1」の文字を「始める」にする | 指定対象はlabel/button/box | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:TONE | 440Hzの音を0.2秒鳴らす | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:TONE_WAIT | 440Hzの音を0.2秒鳴らし、終わるまで待つ | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:SET_VOLUME | 音量を50％にする | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:PITCH_UP | 音程を1段階上げる | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:PITCH_DOWN | 音程を1段階下げる | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:STOP_ALL | すべての音を止める | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Broadcast | 「開始」と知らせる | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:BroadcastAndWait | 「開始」と知らせ、受け手の処理が終わるまで待つ | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Ask | 「名前は？」とたずねる | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LocalVariableDeclaration | 合計という変数を作り、初期値を0にする | 動作/求値の本文先頭のみS313; 引数/宣言衝突と使用前宣言 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:ReturnStatement | 合計を返す | 求値最上位末尾に1個; action/scriptではS307 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:CloneCommand:CREATE_SELF | 自分のクローンを作る | 自分の対象はsprite。削除はcloneに限る | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:CloneCommand:CREATE_TARGET | 「星」のクローンを作る | 指定対象はsprite。呼出し元は全対象 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:CloneCommand:DELETE_SELF | このクローンを削除する | 自分の対象はsprite。削除はcloneに限る | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:StopCommand:THIS | このスクリプトを止める | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:StopCommand:OTHERS | ほかのスクリプトを止める | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:StopCommand:ALL | すべてを止める | 求値では禁止; 値の型・待機条件・範囲は既存runtime | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_SELF_TEXT | 文字を「文字」にする | label/button/boxのみ | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LooksCommand:SET_INPUT | 「入力欄1」に「答え」を入れる | 指定対象はinput | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:SAMPLE | 「ベル」を鳴らす | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:SoundCommand:SAMPLE_WAIT | 「ベル」を鳴らし、終わるまで待つ | 求値では禁止。音名・個別handle・数値範囲・voice上限を維持 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Break | このくり返しを終える | 内側の反復内のみS309 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Continue | 次のくり返しへ進む | 内側の反復内のみS309 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:LocalListDeclaration | 結果というリストを作る | 動作/求値の本文先頭のみS313; 引数/宣言衝突と使用前宣言 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:Forever | 無限反復 | 条件は真偽; 回数は0以上の整数; 必須本文には実行文; 既存スコープと上限 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:UserActionCall | 増やす（3）を実行する | 元の名前と全引数を保持; S301/S308; 呼出し元の対象制約; 求値では禁止 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| command:NoOperation | 何もしない | 状態変更なし; 空でない必須本文を構成する実行文 | GUI-CATALOG; GUI-SCHEMA; GUI-STMT |
| ast:Script | 最上位本文（空配列可） | 構造上限・本文owner/context | 構造化した本文の入口。エラーsourceの保存と実行成功条件を区別; GUI-SCHEMA |
| comment:line | 独立コメントの本文・位置・空白 | ※直後から行末全文; コメントだけは必須本文を満たさない | ※以降の全文・目印列・注釈付随先を比較。閉じ境界だけの所属差を許可; GUI-SCHEMA |
| branch:else | elseの有無・枝・注釈 | 同じ字下げの直前Ifのみ; 存在する枝は実行文必須 | 分岐実行・hasElse・elseCommentの保持と差分検出。枝のGUI操作はBROWSER-LANGで別確認 |
| slot:TargetReference | 代入先の名前と所属修飾を独立に編集 | VariableRead式と代入先slotを区別; 元の名前/修飾保持 | 代入先のslotであり実行可能な独立ASTを追加しない; GUI-SCHEMA |

### 式・全演算子・組み込み・sensor

| id | capability | ast | cui | gui | semantic | runtime | selftest | browser | guarantee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| expression:NumberLiteral | 有限の非負数literal（負数はNEG node） | 有限数・-0/負数の標準AST形 | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:StringLiteral | Unicode・空白・句読点を保持する文字literal | かぎ括弧/行区切りの構文制約とstringChars | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:BooleanLiteral | 真/偽literal | boolean型を保持 | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:ListLiteral | 順序付きリストliteralと動的要素 | 入れ子リストはruntime拒否; listItems; 要素順を保持 | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:VariableRead | 名前と所属修飾による値参照 | 未定義でもVariableReadを保持; exact/self/projectを区別 | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:ListRead | 1から始まるリスト要素番号参照 | list型; 整数index; 範囲外R404 | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| expression:UserFunctionCall | 求値を名前と全実引数で呼ぶ | S301/S308をAST保持して診断; 副作用禁止とcallDepth/functionOps | 既存CUIの値/拒否の代表例; 独立AST fieldはGUI-SCHEMA、GUI操作はBROWSER-LANG |
| operator:POS | 単項正号 | 数だけ | 正号・負値への正号・0の評価、型違反R411とformatter往復を検査。実GUI操作はschema suiteで別検査; GUI-SCHEMA |
| operator:NEG | 単項負号 | 累乗より低い優先順位 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:NOT | 真偽否定 | 真偽だけ; 比較より低く論理より高い | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:ADD | 加算 | 数だけ; 左結合 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:SUB | 減算 | 数だけ; 左結合 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:MUL | 乗算 | 数だけ; 加減より優先 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:DIV | 除算 | 数だけ; 0除算拒否 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:POW | 累乗 | 右結合; 単項符号より優先; 定義域 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:GTE | 以上 | 数だけ | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:LTE | 以下 | 数だけ | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:GT | より大きい | 数だけ | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:LT | より小さい | 数だけ | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:EQ | 同じ | 型を区別したsameValue; リストも比較 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:NEQ | 違う | 型を区別したsameValue; リストも比較 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:AND | かつ | 真偽だけ; 右側短絡; ORより優先 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| operator:OR | または | 真偽だけ; 右側短絡 | 演算結果/短絡の代表例をself-testで検査。GUI構造はschema suite、評価順一致はruntime traceで別検査; GUI-SCHEMA |
| builtin:乱数 | 乱数（引数 2..2） | 両端整数はinclusive; seedと乱数消費; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:余り | 余り（引数 2..2） | 数; 除数0はR401; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:四捨五入 | 四捨五入（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:切り上げ | 切り上げ（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:切り捨て | 切り捨て（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:絶対値 | 絶対値（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:平方根 | 平方根（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:正弦 | 正弦（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:余弦 | 余弦（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:正接 | 正接（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:逆正弦 | 逆正弦（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:逆余弦 | 逆余弦（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:逆正接 | 逆正接（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:自然対数 | 自然対数（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:常用対数 | 常用対数（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:指数 | 指数（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:数 | 数（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:文字 | 文字（引数 1..1） | 既存の型/定義域/有限値検査; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:最小 | 最小（引数 1..∞） | 数; args上限32を流用しない; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:最大 | 最大（引数 1..∞） | 数; args上限32を流用しない; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:つなぐ | つなぐ（引数 2..∞） | scalar; args上限32を流用しない; stringChars; arityを共通検査 | 各arityの0/下限前/下限/上限/超過、可変長32/33/65引数とAST全args保持を検査。GUI可変長slotはschema/boundaries suiteの対応範囲で別検査; GUI-SCHEMA |
| builtin:CONTAINS | 含まれている（引数 2） | list/stringの検索 | 後置構文を通常builtinと別に網羅。全fieldのGUI往復はschema suiteで別検査; GUI-SCHEMA |
| builtin:INDEX_OF | 最初にある番号（引数 2） | 1-based; 未発見0; Unicode | 後置構文を通常builtinと別に網羅。全fieldのGUI往復はschema suiteで別検査; GUI-SCHEMA |
| builtin:LENGTH | 長さ（引数 1） | list/string | 後置構文を通常builtinと別に網羅。全fieldのGUI往復はschema suiteで別検査; GUI-SCHEMA |
| builtin:STRING_LENGTH | 文字数（引数 1） | string; Unicode code point | 後置構文を通常builtinと別に網羅。全fieldのGUI往復はschema suiteで別検査; GUI-SCHEMA |
| builtin:STRING_CHAR | 文字目（引数 2） | string; 1-based範囲; Unicode | 後置構文を通常builtinと別に網羅。全fieldのGUI往復はschema suiteで別検査; GUI-SCHEMA |
| state:マウスが押されている | マウスが押されている | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:マウスの横位置 | マウスの横位置 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:マウスの縦位置 | マウスの縦位置 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:以前の背景名 | 以前の背景名 | event backdropChanged専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:新しい背景名 | 新しい背景名 | event backdropChanged専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:受け取った知らせ | 受け取った知らせ | event message専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:押されたキー | 押されたキー | event keyDown専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:クローンである | クローンである | 部品のみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:背景番号 | 背景番号 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:背景名 | 背景名 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:衣装番号 | 衣装番号 | spriteのみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:衣装名 | 衣装名 | spriteのみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:横位置 | 横位置 | 部品のみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:縦位置 | 縦位置 | 部品のみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:方向 | 方向 | 部品のみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:大きさ | 大きさ | 部品のみ | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:タイマー | タイマー | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:答え | 答え | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:音量 | 音量 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:音程 | 音程 | 既存対象/時計/個別task文脈 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:以前の値 | 以前の値 | event valueChanged専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| state:新しい値 | 新しい値 | event valueChanged専用; 定義内の直接参照S311 | sensorの代表値のみ。event/target違反とGUI変更は別検証; GUI-SCHEMA |
| sensor:INPUT_VALUE | 名前で指定した入力欄の値 | 指定対象input; 不足/別種類の共通診断 | AST構造・引数編集の往復と、input初期値/更新値・未知対象R405/別種類R406を検査。実GUI操作はschema suiteで別検査; GUI-SCHEMA |
| sensor:DISTANCE_TO | 対象/マウスまでの中心距離 | 部品のみ; 対象文字列; マウス可 | 引数付きsensorの代表値をself-testで検査。動的引数とGUI全slotはschema suiteで別検査; GUI-SCHEMA |
| sensor:KEY_DOWN | 指定キーの現在押下状態 | キー文字列 | 引数付きsensorの代表値をself-testで検査。動的引数とGUI全slotはschema suiteで別検査; GUI-SCHEMA |
| sensor:TOUCHING_COLOR | 設定色と外接長方形による接触 | 部品のみ; 色の検査; 画像画素/penは対象外 | 引数付きsensorの代表値をself-testで検査。動的引数とGUI全slotはschema suiteで別検査; GUI-SCHEMA |
| sensor:TOUCHING | 対象/マウス/端との接触 | 部品のみ; 対象文字列; マウス/端可 | 引数付きsensorの代表値をself-testで検査。動的引数とGUI全slotはschema suiteで別検査; GUI-SCHEMA |

### イベントと利用対象

| id | capability | ast | cui | gui | semantic | runtime | selftest | browser | guarantee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| event:stage:start | stageのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:stage:click | stageのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:stage:keyDown | stageのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:stage:message | stageのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:stage:backdropChanged | stageのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:label:start | labelのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:label:click | labelのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:label:keyDown | labelのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:label:message | labelのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:label:backdropChanged | labelのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:button:start | buttonのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:button:click | buttonのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:button:keyDown | buttonのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:button:message | buttonのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:button:backdropChanged | buttonのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:box:start | boxのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:box:click | boxのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:box:keyDown | boxのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:box:message | boxのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:box:backdropChanged | boxのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:start | inputのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:click | inputのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:keyDown | inputのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:message | inputのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:backdropChanged | inputのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:input:valueChanged | inputのvalueChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:start | spriteのstart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:click | spriteのclick | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:keyDown | spriteのkeyDown | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:message | spriteのmessage | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:backdropChanged | spriteのbackdropChanged | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |
| event:sprite:cloneStart | spriteのcloneStart | EVENT_BY_TYPEで許可; event-specific valueは同じcontext | self-testはcompileとschedulerへの直接event投入を検査。実DOM発火と固定時計の全観測列はbrowser-events/event-tracesで別検査 |

### スコープ・実行・保存・製品・編集の継承

| id | capability | ast | cui | gui | semantic | runtime | selftest | browser | guarantee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| scope:precedence | 反復項目→局所→引数→個体→作品の解決順位 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 31層組合せ×4修飾の名前解決、実行5例、局所/引数/反復項目の禁止衝突を検査。GUIの入力と診断表示はBROWSER-PRODUCTで別検査 |
| scope:readonly | 反復項目は読み取り専用 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | readonly違反拒否 |
| scope:arguments | 動作・求値の引数を値渡しする | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 元のリストを変更しない代表例 |
| scope:local | 局所変数・局所リストの先頭宣言と使用前検査 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 先頭・途中・入れ子宣言、自己/後続局所の初期化前使用、重複、コメント間宣言を検査。GUIの位置制約表示はBROWSER-PRODUCTで別検査 |
| scope:purity | 求値の外部副作用禁止 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 副作用54kind/opと外部更新8文型のS305を検査し、拒否されたASTの保持も確認。GUI候補と診断表示はBROWSER-PRODUCTで別検査 |
| runtime:fairness | 複数処理を命令単位で公平に進める | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | A1/B1/A2/B2順序 |
| runtime:time | 論理時計による待機 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | deadline境界の待機 |
| runtime:condition | 条件待機の再評価・失敗時停止 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 条件更新とエラー停止の順序 |
| runtime:notify | 直接起動した受け手だけの完了待ち | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 入れ子通知の待つ/待たない両方について、999/1000msの出力順・待機group・残taskを検査。実イベント起動はbrowser suiteで別検査 |
| runtime:question | 質問の直列化とtask別の答え | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 古い回答callbackを無視し次の質問を保護 |
| runtime:glide | 滑走と他taskの並行実行 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 499/500/999/1000msで途中/完了座標と並行taskの観測順を比較し、CUI/codec往復で一致を確認。実schedulerの中間座標と並行taskはbrowser-event-tracesで別検査 |
| runtime:audio-wait | 開始した音のhandleだけを待つ | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | simulate handleの個別完了はself-test、実decode/再生はstorage-media suiteで別検査 |
| runtime:stop | 停止後のtask/待機/質問/物理入力解放 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 停止後の後始末 |
| runtime:pause-step | pause/resume/1命令実行で時計を早送りしない | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | step と時計の意味は既存 self-test、Switch と readonly は browser-session で別に検査する |
| runtime:clone | clone生成・個体データ分離・開始・削除 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | clone個体データ・接触の代表例と500個の生成/超過拒否をself-testで検査。開始はevent suite、削除/終了とmode同値はevent-traces suiteで別検査。CLONE 個体データを複製 のprojectVars自己比較は作品データ共有の証拠に数えない |
| runtime:error | エラーの場所・call frame・値を固定して記録 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 失敗時の本文key・line・値の固定は self-test、block位置とdebug ownerは browser-session で検査する |
| save:project | source正本の保存・復元・作りかけ保持 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 構文不正 source の保存と現行保存形式・F512拒否。素材付き実往復はbrowser suite |
| save:autosave | 作品と定義下書きの自動復元 | LANGUAGE.mdの現行意味 + 本書の自動保存契約 | GA-STATICで専用コード・UIと保存領域を固定し、GA-EXECで作品・素材・下書きの復元、破損拒否、現在作品保護を検査する |
| save:format-contract | 保存・実行の構造と言語・runtime契約の整合 | LANGUAGE.mdの現行意味 + 本書「製品版から独立した命名と受入判定」 | 形式と意味の不一致・型不正・欠落を拒否し、現在作品を保持する |
| save:producer-metadata | 作成元ラベルと作品内容の独立 | LANGUAGE.mdの現行意味 + 本書「製品版から独立した命名と受入判定」 | 作成元だけで拒否せず、実行意味・本文・clean/dirtyを保持する |
| maint:identifier-policy | 機能由来の自作名と製品版参照の用途制限 | 本書「製品版から独立した命名と受入判定」 | 静的ゲートのrelease-policy-negativeで版由来名・受入への版参照をFAILにし、間接参照も意味レビューする |
| save:standalone | 共通runtimeの単体HTML書き出し | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 同じcompile/pack/runtimeを使用。生成payloadの除去field・実オフライン実行は完成監査で確認 |
| product:ui-buttons | コード／ブロックのボタン表示・到達性・操作一致 | 本書「UIとボタンの整合性」 | audit/tests/ui-buttons.mjsをGA-EXECで実行し、HYBRIDでモード・表示段階・入力方法・狭い画面を確認。未確定入力、追加先解除、部品操作と必要な代替操作を保持する |
| product:designer | 部品追加・選択・移動・サイズ変更・色・削除・properties・標準キャラクター | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 部品候補の可視到達性、追加、properties、位置移動とresizeの分離、色の確定/取消、削除、共通履歴を実ブラウザーで検査する。pure resize/color test は計算層だけを保証し、pointer/keyboard/scroll/履歴を代用しない |
| product:data | 作品/個体データの編集・保存 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 作品/個体データUIの作成・削除・同名参照と共通履歴をbrowser-productで検査 |
| product:assets | 画像オブジェクト・背景・衣装・音素材の登録・保持 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 模擬decodeと拒否例はself-test、PNG/JPEG/WebP/MP3/WAVの実decodeはstorage-media suiteで別検査する。画像オブジェクト/背景/衣装/音声の入口の到達性と追加先の区別、候補一覧展開後の操作可能性は実ブラウザーで確認する |
| product:callable-draft | 定義下書きと明示保存の境界 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 純粋candidateがprojectへ下書きを登録しないことと、明示登録・Undo・ファイル再読込みを分けて検査する |
| product:diagnostics | 場所・行・理由つき作品診断 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 共通analyzeAstの内容保持と、GUIの位置・理由表示を別々に検査する |
| product:hints | 対象/event/スコープ別の候補・理由 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | CUI候補とGUI availability が同じ文脈/意味診断を用いる。自動生成名はCUI候補とGUI availabilityの双方で、引数・反復項目・局所宣言との連続衝突でも32文字上限内の未使用名を生成し、実際の候補・パレットから追加できる。個別候補の実操作はschema suite |
| product:monitor | 実行モニターと現在位置 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 失敗記録はself-test、画面描画・block位置・owner対応はbrowser-sessionで別検査 |
| editor:switch | 無編集Switchで原文/dirty/履歴/redo不変 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 純粋no-opと実モード往復・元source/dirty/history/redo・実行snapshot維持を分けて検査する |
| editor:transaction | GUI操作の原子的なsource反映・取消 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 純粋candidateの不変条件と、DOM/owner/共通historyの原子的反映を別々に検査する。動作・求値モーダル内のEscape取消と、構造操作拒否時の表示ロールバックも実DOMで確認する |
| editor:history | コード/GUI/下書き/作品共通Undo/Redo | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 履歴の前後snapshot・下書きbaseline/loadedKey・native Undoは実browser経路で検査する |
| product:block-workbench | 形で構造を示し、直接つかんで接続できる連続作業台 | EDITOR-GUI-001/002、EDITOR-EDIT-001/002、EDITOR-SWITCH-001 と LANG-WB-001〜006 | 形・直接操作・接続予告・広い作業領域・長い本文・対象/結果把握・代替操作を同じsnapshotの実ブラウザーで検査し、未実施経路を過去結果やpure testで補完しない |
| product:responsive | responsive/縮尺/スクロール到達性/キーボード/IME/pointer | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | 既存6 viewport・resize・200%・composition・touchに加え、部品候補・素材入口・設定・resize handle の可視到達性と正しい scroll container を実ブラウザーで検査する |
| product:offline-license | 単一HTML/オフライン/CSP/MIT全文・著作権表示保持 | LANGUAGE.mdの現行意味 + 本書「機能と編集の保証」 | licenseとescapeの自動追跡。実オフライン動作は別検証 |

### 資源上限

| id | capability | ast | cui | gui | semantic | runtime | selftest | browser | guarantee |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| limit:fileBytes | fileBytes = 25165824 | LANGUAGE.md「資源の上限」のfileBytes | 無効な内容の入力を閾値直前/到達では後段F502、超過ではF504へ振り分ける入口guard。最大サイズの有効作品往復は別検査 |
| limit:importFileBytes | importFileBytes = 12582912 | LANGUAGE.md「資源の上限」のimportFileBytes | 零バイト列を閾値直前/到達では後段F509、超過ではF504へ振り分ける入口guard。実decode成功は保証しない |
| limit:assetRawTotal | assetRawTotal = 16777216 | LANGUAGE.md「資源の上限」のassetRawTotal | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:assets | assets = 128 | LANGUAGE.md「資源の上限」のassets | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:imageAssets | imageAssets = 64 | LANGUAGE.md「資源の上限」のimageAssets | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:audioAssets | audioAssets = 64 | LANGUAGE.md「資源の上限」のaudioAssets | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:imageBytes | imageBytes = 4194304 | LANGUAGE.md「資源の上限」のimageBytes | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:audioBytes | audioBytes = 6291456 | LANGUAGE.md「資源の上限」のaudioBytes | 保存構造fixtureの上限直前/到達/超過。Base64長・record数/bytes合計を検査し、digest照合や実媒体decodeの成功は保証しない |
| limit:imageWidth | imageWidth = 4096 | LANGUAGE.md「資源の上限」のimageWidth | 寸法validatorを上限直前/到達/超過で検査。実decodeは別検査 |
| limit:imageHeight | imageHeight = 4096 | LANGUAGE.md「資源の上限」のimageHeight | 寸法validatorを上限直前/到達/超過で検査。実decodeは別検査 |
| limit:imagePixels | imagePixels = 4194304 | LANGUAGE.md「資源の上限」のimagePixels | 4096×1023、4096×1024を受理し4096×1025を拒否する寸法validator境界。実decodeは別検査 |
| limit:imagePixelsTotal | imagePixelsTotal = 16777216 | LANGUAGE.md「資源の上限」のimagePixelsTotal | 人工metadataの合計を上限直前/到達/超過で検査。個別画像の正当性と実decodeは別検査 |
| limit:audioDuration | audioDuration = 60 | LANGUAGE.md「資源の上限」のaudioDuration | duration/channels/sampleRateのmetadata境界を検査。実decode/再生は別検査 |
| limit:audioDurationTotal | audioDurationTotal = 120 | LANGUAGE.md「資源の上限」のaudioDurationTotal | 人工metadataの合計秒数を上限直前/到達/超過で検査。実decode/再生は別検査 |
| limit:audioChannels | audioChannels = 2 | LANGUAGE.md「資源の上限」のaudioChannels | duration/channels/sampleRateのmetadata境界を検査。実decode/再生は別検査 |
| limit:audioSampleRateMin | audioSampleRateMin = 8000 | LANGUAGE.md「資源の上限」のaudioSampleRateMin | duration/channels/sampleRateのmetadata境界を検査。実decode/再生は別検査 |
| limit:audioSampleRateMax | audioSampleRateMax = 48000 | LANGUAGE.md「資源の上限」のaudioSampleRateMax | duration/channels/sampleRateのmetadata境界を検査。実decode/再生は別検査 |
| limit:activeAudioVoices | activeAudioVoices = 32 | LANGUAGE.md「資源の上限」のactiveAudioVoices | 模擬audio nodeを32まで生成、33個目R416、個別完了/全停止で解放。実AudioContext負荷は別検査 |
| limit:backdrops | backdrops = 256 | LANGUAGE.md「資源の上限」のbackdrops | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:costumesPerSprite | costumesPerSprite = 256 | LANGUAGE.md「資源の上限」のcostumesPerSprite | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:sounds | sounds = 256 | LANGUAGE.md「資源の上限」のsounds | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:components | components = 500 | LANGUAGE.md「資源の上限」のcomponents | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:clones | clones = 500 | LANGUAGE.md「資源の上限」のclones | 500個のclone生成と501個目R410、拒否後個数不変。実画面負荷は別検査 |
| limit:scripts | scripts = 1000 | LANGUAGE.md「資源の上限」のscripts | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:sourceEach | sourceEach = 100000 | LANGUAGE.mdの本文上限; 整形で超過する場合も拒否 | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:sourceTotal | sourceTotal = 1000000 | LANGUAGE.md「資源の上限」のsourceTotal | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:projectVars | projectVars = 1000 | LANGUAGE.md「資源の上限」のprojectVars | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:projectLists | projectLists = 500 | LANGUAGE.md「資源の上限」のprojectLists | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:listItems | listItems = 100000 | LANGUAGE.md「資源の上限」のlistItems | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:stringChars | stringChars = 100000 | LANGUAGE.md「資源の上限」のstringChars | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:callables | callables = 500 | LANGUAGE.md「資源の上限」のcallables | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:args | args = 32 | LANGUAGE.md「資源の上限」のargs | 作品validatorの上限直前/到達/超過を検査。名前/ID/対象eventは有効なfixture。実GUI操作・保存媒体は別検査 |
| limit:callDepth | callDepth = 64 | LANGUAGE.md「資源の上限」のcallDepth | 動作64frameと65個目R408、求値depth63/64で返却・65でR408。browserの実呼出し経路は別検査 |
| limit:functionOps | functionOps = 100000 | LANGUAGE.md「資源の上限」のfunctionOps | budget99999/100000で評価、100001でR409。既存の非終了求値検査を併用 |
| limit:blockDepth | blockDepth = 128 | LANGUAGE.mdのブロック深さ | 上限深さのAST往復と超過拒否。字下げsource・実GUI上限境界は別検査 |
| limit:expressionDepth | expressionDepth = 128 | LANGUAGE.md「資源の上限」のexpressionDepth | 上限深さの式AST往復・超過拒否と深すぎる括弧の拒否。全表現経路のブラウザー境界は別検査 |
| limit:repeatCount | repeatCount = 1000000 | LANGUAGE.md「資源の上限」のrepeatCount | 上限直前/到達の反復stack設定と超過R413・stack不変。全反復の完走性能を保証しない |
| limit:activeTasks | activeTasks = 2000 | LANGUAGE.md「資源の上限」のactiveTasks | 2000 task生成と2001個目R413、拒否後個数不変。実入力/並行操作は別検査 |


## 日本語と独立実行の監査

現在の入力と独立期待値を使い、文型、原文・コメント保持、AST、source/block往復、意味・単位・対象・名前解決、実行traceを直接検証する。旧文書や移行台帳の意味対応を毎回再証明しない。原本由来の独立期待値を現行fixtureへ移す際は候補出力から再生成しない。

- 現行の命令・式・schema・能力・上限の網羅をcurrent manifestと製品の実体へ対応付ける。旧baselineの件数を現在の能力の上限にも、過去検査の恒久維持義務にも使わない。
- 独立20意図の原文、曖昧さoracle、意図の89check、runtime境界20checkを、必要な現在の意味検査として保持する。登録成功を実行成功としない。
- Nodeと実file browserの役割を区別する。未確定の非実行・取消・回復、量、名前付き引数、対象、イベントfilter、継続rule、質問・音声の取消、生成playerを確認する。
- 必要な256有限入力、95corpus等のAST・実行期待値は現行の値へ直接対応させ、旧sourceの全複製や旧新hunkへ依存させない。
- 高度な式、全組込み、状態値、sensor、演算、スコープ、素材、調査、保存、全schemaと編集操作を実際の保証で覆う。名称や内部構造の一致だけで能力保持としない。
- 「自分は」の呼出し開始対象と「自分のデータ」の文対象、途中作品の安全保存と実行/実行HTMLゲートを区別する。IMEやdrag中は現在の確定・保存契約に従う。
- 引数なし手順、実行後の監視、サイズ境界、符号・全半角・IME・貼付・取消、名前変更/削除後の検索、狭幅・200%と文字幅・単位・助詞などの現行回帰を保持する。
- 実行結果は同じ候補入力へ束縛する。必須集合と独立validatorは欠落、未検証、trace不一致、子runner timeout、偽実行を拒否する。

部分再実行は同じrunの各必須kindの最新attemptを確認する。失敗や欠落を古いPASSで補わず、別run・未来attemptを混入させない。固定受入など同attemptが必要な結果はその契約を守る。

ネイティブタブ可視性の補助観測はUNVERIFIEDのまま区別し、必須実行のPASSへ数えない。成人作成の作文による機械結果は実児童・教員の評価ではない。実児童観察、比較試行、個人情報や録画は別途許可と検証を要する。

### 文書移管と保証の継承

この節のリンクは既存公開案内との接続を保つ。現在守る意味はLANGUAGE.mdと現行の公開意味UX契約を正本とし、案件の工程・旧案名・旧合否は現行要件に含めない。過去の移管記録はGit履歴から辿り、現在の検査は現行契約・独立期待値に直接基づく。

## 固定制作意図の成功必須ゲート

現行の制作意図とUX要件は audit/reviewed/PUBLIC_SEMANTIC_UX_SPEC.md と audit/reviewed/PUBLIC_UX_ACTIONS_ACCEPTANCE_PLAN.md の現在有効な要件を参照する。これらは製品の受入条件であり、記載だけで実装済みとしない。完了済みの工程や旧source復元は合格条件にしない。

C74/Q76/E32/L38、別40能力、schemaの現在必要な意味と実動作を試験へ対応付ける。登録だけで実行成功とせず、独立した値・単位・型、source/block/generated source、命令・scheduler・入力と結果を確認する。対応表の正本は現行manifestであり、別の移行台帳を必須にしない。

I07〜I12原作文とI10補助定義は独立期待値として保持し、制作の受理・意味・本文選択・実行を要求する。安全拒否や途中保存を制作成功の代替にしない。自然な役割、符号・小数・距離、文字結合、計算・手順・分身・継続移動の意味を検証する。

Akari auditと固定受入の必要結果を最終集約する。同じproducerを両入口で二重実行する必要はなく、同じ入力・環境の有効結果を共有できる。別の保証を単に片方のgreenで代用しない。合成negative controlsは検査器の拒否試験であり、製品成功に数えない。

## 組込みだんご画像の寸法契約

組込み「だんご」は既存マスコットと同じ180×180pxの透過PNG実体を使用し、追加時の表示枠も180×180、倍率100%とする。

同梱PNGはSHA-256 `35eea719e70c3f4ec196c800e107232cee7a16408b44cb04f6094d9c622d7158`、35,664 bytes、180×180。保存・再読込・書出しでも素材同一性と表示寸法を検査する。

GA-STATICはPNG実寸・metadata・byte数・固定SHAを検査する。GA-EXECは実ブラウザーでパレットと配置画像の復号画素一致、180×180表示、透明部分、元マスコットの存続、繰り返し配置の素材共有、Undo/Redo、保存・再読込、生成HTMLへの同一PNG包含とオフライン表示を引き続き必須とする。試験ID・検査の削除、skip、timeout緩和は行わない。SEMANTICでは寸法変更がリサイズ要件に対応し、これらの保証を残していることを確認する。UX実監査の合格とは扱わない。

## 編集と自然文の追加UX監査

追加契約は [audit/UX_CONTRACT.md](audit/UX_CONTRACT.md)。固定9原文の受理・意味・結果と編集回復を既存の必須検査へ追加する。48枠の独立実操作再監査、施工対象外のScratch24枠（依頼元の実施状況は別記）、資料移管の未完了を自動検査から分けて記録する。既存監査を削除・緩和せず、新しい最終SHAで全必須CIを確認する。


## 通常編集の追加回帰と独立集約

`ux-normal-language`（28件）、`ux-normal-browser`（12件）、`ux-normal-matrix`（48件）、`ux-normal-layout`（100件）、`ux-normal-speech`（100件）を既存の追加受入へ必須接続する。原文・実行結果・回答・対象・時刻・取消・幅を `ux-normal-contract.mjs` で別に検証する。自己申告のPASSだけでは受け入れない。欠落、重複、FAIL、異なるsnapshot、意味を壊した結果、結果ファイルの欠落を拒否する。独立集約の拒否試験は既存141件を保持し42件を追加した183件である。

GUI三群は独立したbrowser processで並列実行する。ジョブの時間上限（`workflow-contract`が検査）、個別入力の12,000ms境界、現行の意味・期待値・観測境界を維持する。ホスト・子実行の例外やtimeoutはFAILであり、機械PASSから実児童UXや実IMEの完了を主張しない。Windowsローカルの成功はLinuxのCI実行に読み替えない。

現在の意味契約はLANGUAGE.mdの自然文・編集・発話の各節、現在の文型はaudit/LANGUAGE_FORMS.mdを参照する。過去の文書移管mapや旧文書を通常監査の必須入力にしない。

GUI制作後の実作品も独立時計で検査する。B02/B11の再実行、B10〜12の1秒後の並行発話、B12の初期3秒から1秒への変更範囲、B20の初期0とクリック1→2→3を別の期待にする。表示試験は吹出し全体の舞台・viewport内包含も要求する。新たな拒否対照12件は、既存171件へ時刻・可視状態・初期値・局所変更・再実行・画面外・回答所属の改変を加えたもので、製品実行件数へ数えない。

## きっかけ・話者・引用リストの追加回帰

`audit/run-ux-phrase-gui.mjs` は `ux-phrase-trigger`（16件）、`ux-phrase-speech`（19件）、`ux-phrase-list`（35件）の計70件を実行する。各群は独立した固定IDと期待値を持ち、実ブラウザーの1180×757と1188×848を区別する。リスト群には製品から分離したruntimeと書き出しHTMLの失敗処理も含める。既存の必須群と183件の集約拒否試験を維持し、`actions-transfer-verify.mjs` が新しい3群の完全な結果と同じ製品・監査入力snapshotを必須とする。

きっかけは本文選択と基本変更の区別、開くだけ・取消の無変更、開始とクリックの往復、対象・本文・他のまとまりの保持、詳細条件、実イベント、Undo/Redoを検査する。発話全文は二体の78字、話者と原文の同時点保持、更新・消去・停止・再実行、狭い舞台と通常倍率、長名・Unicode・クローン、本文だけのコピー対象、一般値・リストを検査する。引用リストは原文の型エラー拒否、失敗から編集への復帰、明示選択による式範囲だけの修復、所属、添字・時間・データの保持、履歴、古い記録・候補なし・特殊文字を検査する。

`audit/lib/ux-phrase-contract.mjs` は各群の独立validatorへ接続し、欠落・重複・失敗・別snapshot・別環境・例外・外部通信・結果の意味の改変とレポート欠落を追加75条件で拒否する。拒否検査で改変した証拠を製品の実行成功数へ加えない。局所の再検証入口は `node audit/tests/ux-phrase-verify.mjs <証拠ディレクトリ>` とする。機械検査・実ブラウザーでの操作結果から、独立UX監査や実児童による理解、実IME調査の完了を主張しない。

## 自動保存状態と実行本文の所属

`audit/tests/autosave-state-browser.mjs` の9件を固定受入へ追加する。実行中の文書単位の識別子と、保存する編集本文の識別子を区別する。R411で停止中にも本文の所属を保持し、修復への移行・取消・適用・再実行と、保存復元後のUndo/Redoを検査する。

| 安定ID | 独立した期待値 |
|---|---|
| paused/persistent-first | 固定文書IDを持つ本文のR411停止中に元の本文IDで保存し、本文・リストを保持する。 |
| paused/legacy-second-cancel | 明示文書IDのない複数まとまりの第2対象で停止しても、保存する本文IDを保持する。修復取消は本文と履歴を変えない。 |
| restored/persistent-second-repair | 復元後に別対象の文書単位で停止し、明示したリストだけを修復する。実行結果はパン、所属・他の文・履歴・再復元を保持する。 |
| paused/plain-script | 文書見出しのない本文のR411停止も保存できる。 |
| storage/completion-order | IndexedDBの要求成功だけでは済みにせず、transaction完了通知後に済みとなる。 |
| storage/stale-completion | 保存中に追加編集した場合、古い完了通知で新しい編集を済みにしない。最後の本文が永続化・復元される。 |
| storage/quota-retains-current-and-draft | IndexedDBと代替保存の容量不足で失敗とファイル保存の案内を示し、以前の保存記録、現在本文、未完の入力を保持する。 |
| restored/pending-draft | 未完の入力を保存・復元し、Undo/Redoでも本文と下書きを取り違えない。 |
| restored/callable-clone-pause | 復元した分身開始本文から手順内で停止しても、有効な呼出元本文を保存し、手順のデバッグ表示とファイル保存を保持する。 |

記録は固定Chrome / Playwrightの実ブラウザーで採取し、テスト側だけで保存要求・transaction完了・状態表示の時系列を観測する。製品に診断fixtureや送信処理を入れない。`audit/lib/autosave-state-contract.mjs` が固定ID、独立期待値、実保存内容、時系列、環境、当該snapshotを検証する。固定受入の集約は既存183件・追加75件の拒否検査を維持し、この9件の意味改変・欠落・別snapshot等とレポート欠落を19条件で拒否する。未実施OS、実IME、実児童UXをこの機械検査の合格へ含めない。

## 検索欄の可視性と入力操作

`audit/tests/search-layout-browser.mjs` の8件を固定受入へ追加する。`main/1180x757`、`main/1188x848`、`main/1366x768`、`main/1024x768`、`main/390x844`、`callable/1188x848`、`callable/390x844`、`browser-zoom/125-percent`を固定IDとする。

常時可視の「ブロックを探す」、13px以上の入力文字、通常語と検索欄の消去操作を収める実測幅、候補表示・分類案内の折返しと非重複、候補設定を開いた際の幅内配置を、実画面とDOM寸法で検査する。検索で本文を変更しないこと、検索語保持、分類切替・消去、Tab/Enterによる候補表示と追加、0.1秒待つ命令の意味、Undo/Redo、作業台の主要操作への到達を別に確認する。

手順本文の390px幅では、道具箱の行が高さ0にならず、検索欄・分類・候補へ実際に入力・クリックできることを確認する。候補から追加した標準の1秒待つ命令を数欄で0.1秒へ編集し、追加と編集それぞれのUndo/Redoを確認する。未完の数入力では取消操作へ到達でき、確定済み本文へ戻ることも検査する。

拡大検査は新しいテスト専用のローカル拡張から実ブラウザーの倍率を125%に設定し、実際の倍率、同じウィンドウ外寸、CSS表示幅の減少、DPR変化を記録する。CSS zoomやviewportだけの変更をブラウザー拡大の証拠にしない。拡張や観測処理は製品へ含めない。

`audit/lib/search-layout-contract.mjs` が固定ID、独立期待値、当該snapshotと固定環境を検証する。固定受入の集約は既存の拒否検査を保持し、ラベル欠落、文字縮小、見切れ、案内省略、重複、操作喪失、本文変更、誤った候補、履歴喪失、到達不能、偽の拡大、欠落・別snapshot等とレポート欠落を追加19条件で拒否する。画面幅は再現条件と既存境界であり、児童能力の統計的数値を表さない。独立UX監査、実児童、実IME、未実施OSの合格を主張しない。

## 明示的な本文取り込みの履歴境界

既存ID `UX13/explicit-current-document-edit` と180ms待機・本文期待値を保持する。同じ検査内で、履歴保存の250msタイマーより前と経過後の2条件を追加する。旧本文から「この本文を変更して取り込む」を確定し、Undoで旧本文、Redoで取り込み本文へ戻ることを検査する。取消時の本文・履歴、他のownerと本文ID、自動保存を復元した後のUndo/Redoも確認する。

`audit/lib/ux-edit-contract.mjs` は実測した確定時刻の250ms前後、pending importと有効本文の区別、取り込み前後の完全なproject、取消・復元結果を独立に照合する。未完の取り込み原文を旧本文の履歴として扱わず、既存の34件、全検査の制限と拒否条件を維持する。

## 読む手掛かり・挿入文脈・話者名の追加監査

ローカルgate、ブラウザー群、固定acceptanceの全入口と独立validatorを保持します。件数の正本は現行のmanifestとcontractです。追加監査は既存の集合、負例、timeout、独立oracleを置き換えません。

追加の固定集合は次の59件。通常のクリック・キー入力と `fill` を別の入力経路として観測する。反復・条件の親/子ID、連続する値、指定挿入先、本文・履歴、取り消しと Undo/Redo を照合する。日本語の composition event 検査は実IMEの操作証明ではない。

| 対象 | 固定件数 | 実行入口 | 独立検証 |
| --- | ---: | --- | --- |
| 分類・検索保持と入力確定/挿入先 | 15 | `audit/tests/ux-insertion-context-browser.mjs` | `audit/tests/ux-insertion-context-verify.mjs` |
| 話者名・短文・全文・倍率/位置境界 | 13 | `audit/tests/speech-name-layout-browser.mjs` | `audit/tests/speech-name-layout-verify.mjs` |
| 画面内の読み・具体例・操作結果 | 8 | `audit/tests/child-language-ui-browser.mjs` | `audit/tests/child-language-ui-verify.mjs` |
| 診断・保存失敗・取込みの具体案内と詳細 | 23 | `audit/tests/child-diagnostics-browser.mjs` | `audit/tests/child-diagnostics-verify.mjs` |

ブラウザー入口の引数は固定ブラウザー実行ファイルと新しい出力JSON、独立検証の引数はそのJSONとする。各 validator は欠落・重複・古い snapshot・観測内容の不整合を拒否する負例も検査する。新しい公開入力の固定後に実行し、途中版の結果を最終版の証拠へ流用しない。

話者名は1180×757の舞台28%、1188×848、390 CSS px、舞台10%/200%、位置の境界、Chrome自身の125%拡大を検査する。短文の2秒契約、待機、既存マスコットサイズ、14 CSS pxの本文を保つ。長文の全文操作には読み取り用の10秒fixtureを明記して用い、短文の2秒検査とは区別する。78文字の二つの本文、話者名、コピー可能な全文、キーボードでの到達を照合する。OSと実フォントにより観測が異なるため、Windowsの結果をLinux実施済みとは扱わない。

幅はCanvasの推定だけに頼らず、見える話者名と同じフォント・字間の実DOMで測る。全文ボタンの実幅、吹出しの幅上限、枠と余白を先に確保してから本文の見切れを判定する。小さい舞台の二列に収まらない短文は、名前と本文を組にした上下配置で検査する。既存13件・独立9負例のID、許容差、文字サイズ、発話時間、全文への到達条件を維持する。

追加の個別開始発話は `audit/tests/speech-preview-browser.mjs` の固定8件と `speech-preview-verify.mjs` の13拒否対照で検査する。1180×756、新規・自動保存復元、標準フォント・全角幅フォント、10%・28%・100%、78字の10%全文と485px閲覧を含む。各対象への通常入力と2秒の実時刻、全文予約ゼロ、吹出し全体の舞台内包含・非重複、個々の描画文字の境界を追加する。既存のRange・scrollオラクルは変更せず、新しいフォント条件ではem余白と実描画を別々に残す。長文10秒の読取り補助を短文2秒の代替にしない。最終合否はだんごの修正後版の実操作監査を必要とし、Actions成功は必要条件に留まる。

言語支援はG3-R（読む手掛かり）、G3-M（意味と具体例）、G3-A（対象/操作/結果）、G3-S（説明への到達）、G3-V（まとまり/折返し/密度）を製品側で確認する。保存/書き出しの違い、見た目のコピーにコードが含まれないこと、数・文字・条件の答えの区別、変数/リスト/手順、透明ます目、表示語と受理構文の別表記、原診断/内部IDの詳細を維持する。画面確認していない分岐、実児童理解率、実IME、学習効果は合格と主張しない。

`.github/workflows/akari-acceptance.yml` の追加 `ux-editing` job は既存の acceptance job と別に実行する。固定 Chrome 140.0.7339.207・Playwright 1.55.0を使い、LinuxではNoto CJKを導入する。既存jobの15分上限を変更せず、追加jobも15分とし、独立した項目と validator を `always()` で最後まで実施して証拠を保存する。ローカルWindowsでLinux条件と両OS集約が未実施なら、その状態を報告に残す。

表示と原文・操作・履歴の保持を現行の期待値で照合する。「台詞」の意味は画面上の「そのままの文字を話す」と、音を鳴らす候補の原文を別々に照合する。日本語 gate の従来68負例を保持し、表示と原文の混線を拒否する2負例を加える。DOM描画の負例では従来の正常判定を保ち、最新ノードを読む保護も外した不正状態を同じ正常判定が拒否することを検査する。

コピー説明を固定見出しの直下へ置き、色選択をキーボードで進めた際に見出しがボタンを覆わないようにする。コード/ブロックの移動でも説明と対象を同じ場所へ移す。読み取りヒントのスクロール検査は、実キー・フォーカス・既定動作・実際の `scrollend` と作品/履歴の不変を照合する。通常の挿入画面にも命令・本文・分類・検索の読みと具体例を表示し、これらを既存8件の画面内支援検査と独立負例で確認する。

## 部品操作欄の到達性

`audit/tests/component-controls-browser.mjs` と独立した `audit/tests/component-controls-verify.mjs` で、部品一覧と下部操作欄の別々のスクロールを検査する。固定IDは `COMPONENT-CONTROLS-RESPONSIVE`、`COMPONENT-CONTROLS-KEYBOARD`、`COMPONENT-CONTROLS-LIST`、`COMPONENT-CONTROLS-TOUCH`、`COMPONENT-CONTROLS-ZOOM` の5件。機能固定は `audit/manifests/features.json`、仕様・監査・testの対応は追加台帳 `audit/manifests/component-controls-traceability.json` に記録する。既存のUIボタン9件と画面内支援8件の代替にしない。

GA-EXECでは1920×1080、1366×768、1280×720、1024×768、760×600、390×600、320×500の7表示寸法で、かんたん／くわしくと部品追加欄の開閉を組み合わせた28条件を実行する。コピー・削除・説明・部品追加・音声追加・画像音声管理・変数リストの全体が、viewportと全祖先のクリップ領域内へ到達し、文字とふりがなもボタンの内側に収まることを実測する。隠された領域へのプログラムによる直接スクロールだけで成功とせず、マウスwheel、Tab／Shift+Tab、Home／End、Chromiumのネイティブtouch入力で到達し、音声file chooserと素材・データdialogが実際に開くことを確認する。25部品を持つ一覧と下部操作欄のスクロールは互いを動かさない。

Chrome自身の125／150／200％拡大はテスト専用拡張のtabs APIで行い、実倍率、同じwindow外寸、CSS viewportの縮小とDPR変化を照合する。CSS zoomや表示幅だけの変更へ代替しない。作品・本文・Undo／Redo・dirty状態は、実際の編集とUndoで用意したfixtureの前後を照合する。snapshot、固定browser、画面証拠のhashを検証し、欠落・重複・見切れ・ふりがなのはみ出し・操作不能・履歴変更・偽の拡大を独立負例で拒否する。

GA-STATICは公開入力集合・構文・release freeze、SEMANTICは一覧と操作対象の対応、コピーの範囲と既存モード移動の保持、HYBRIDは可読性と実入力の到達を扱う。結果は実行したOSに限定し、別OS、実児童評価、実IMEや支援機器の未実施を合格へ含めない。


## 拡張基盤の必須監査

現行の拡張API・保存・停止・通信・上限の保証を独立した試験で検証する。表は現在の要件対応であり、PASSの証拠ではない。

| 要件 | 保証 | 主な追加試験ID | 区分 |
| --- | --- | --- | --- |
| EXT01 | 標準UI・命令・上限・CSP・オフライン維持 | EXTENSION-STANDARD-POLICIES / STANDARD-NO-NETWORK、既存全gate | HYBRID |
| EXT02 | 第三者登録、重複・衝突拒否 | EXTENSION-REGISTRATION-COLLISION-TYPES / INDEPENDENT-CALCULATIONS | GA-EXEC |
| EXT03 | 日本語・ブロック・型・単位・履歴の統合 | EXTENSION-LANGUAGE-BLOCK-ROUNDTRIP / TYPES-UNITS-DEPENDENCIES / GUI-HISTORY-AUTOSAVE | HYBRID |
| EXT04 | 同期計算、非同期命令、イベント、停止 | EXTENSION-ASYNC-PARALLEL-PAUSE-STOP / EVENT-LANGUAGE / SESSION-CANCELLATION | GA-EXEC |
| EXT05 | 現行CSPで実popupと実MessageChannel | EXTENSION-REAL-POPUP-MESSAGECHANNEL | GA-EXEC |
| EXT06 | 旧session、重複、不明、偽window、期限の拒否 | EXTENSION-RPC-NEGATIVE-LIFECYCLE | GA-EXEC |
| EXT07 | 宣言した上限の適用、保存・出力経路 | EXTENSION-PROFILE-IMPORT-FILE-RUNTIME / COUNT-CAPACITY-ROUNDTRIP | HYBRID |
| EXT08 | 継承・有限・null、固定整合、停止の維持 | EXTENSION-PROFILE-INHERIT-FINITE-UNLIMITED / COOPERATIVE-FUNCTION-BUDGET | HYBRID |
| EXT09 | 標準形式維持、依存・hash不一致の原子的拒否 | EXTENSION-DERIVED-SAVE-RESTORE / FAILED-IMPORT-PRESERVES-EDITOR | GA-EXEC |
| EXT10 | 独立した実行HTMLと未接続診断 | EXTENSION-OFFLINE-STANDALONE / REAL-POPUP-MESSAGECHANNEL | GA-EXEC |
| EXT11 | 通信遮断で隠さず実際の通信を観測 | EXTENSION-STANDARD-NO-NETWORK / DERIVED-NO-NETWORK / OFFLINE-STANDALONE | GA-EXEC |
| EXT12 | 必須結果・artifact・snapshot・run照合 | extension-foundation-negative、verify-gate-results | GA-STATIC |
| EXT13 | 公開型・ガイド・独立実例による再現 | EXTENSION-INDEPENDENT-CALCULATIONS / OFFLINE-STANDALONE、EXTENSIONS.md | HYBRID |
| EXT14 | 状態の寿命。既定は実行ごとに初期状態、`"project"` だけ作品に保持し、止まっている間だけ初期状態へ戻せる | EXTENSION-STATE-LIFETIME / COMMAND-EVENT-STATE | GA-EXEC |
| EXT15 | 日本語の拡張名・機能名とIDの表記が同じASTになり、整形は日本語名を出す。名前の重複・不正を拒否 | EXTENSION-JAPANESE-NAMES / LANGUAGE-BLOCK-ROUNDTRIP | GA-EXEC |
| EXT16 | 同じメジャー版の新しい版だけ確認のうえで開き、同じ版の内容違い・新しすぎる版・別メジャー・pre-release・状態形式違いを拒否 | EXTENSION-VERSION-UPGRADE / UPGRADE-OPEN-CONFIRM / FAILED-IMPORT-PRESERVES-EDITOR | GA-EXEC |

試験入口は `audit/tests/extension-foundation.mjs`。固定Playwright・Chromeで本体、派生editor、書出しplayer、外部popupを動かす。通信観測はoffline設定やroute.abortを入れず、HTTP要求・socket作成・pageerrorを記録する。観測を避けるための事前遮断はこの試験の証拠にしない。

独立validatorは `audit/lib/extension-foundation-contract.mjs`。順序付き必須結果、固定期待観測、同じ公開snapshot、固定browser版、run/attempt、candidate・derived・playerの内容hashを確認する。`extension-foundation-negative.mjs` は欠落、重複、偽PASS、例外、環境・通信・artifact改変、別snapshot/run/attemptを拒否する合成control専用試験であり、製品PASSへ混入しない。

必須の実ブラウザー検査とnegative/validatorを現行gateと最終集約へ接続する。同じ環境のproducerを複数workflowで重複起動することは要求しない。実行証拠は正規化せず現行入力へ結び付け、旧ラベル・旧source pinへ戻す検査は行わない。

## MITライセンスの監査

LICENSE、製品、書き出しHTML、派生editor/playerがMIT SPDX、同じMIT全文、Copyright (c) 2026 SAIEduLabを保持することを静的・実ブラウザーで検証する。オフライン・CSP・単体HTMLの保証を維持する。
現在製品に存在する互換aliasは製品仕様に従って検査するが、過去のライセンス変更hunkを逆投影して旧snapshotへ戻す処理は不要。現在のMIT保持と欠落・著作権改変の拒否を直接検査する。古い名前の試験IDは現行の意味を表す名前へ整理できる。

## 編集できるお手本

機能の正本はaudit/manifests/features.jsonのuiContracts.editableSamplesとaudit/manifests/samples.json。現行の六つのお手本を素材とともに開き、動かし、編集し、保存できることを検査する。ダンス、花もよう、星のゲーム、迷路、曲づくり、お話を扱い、未保存変更があるときの確認、選択画面の取消、原本を変えない編集を確認する。
新規作品は空の本文であり、お手本は明示操作で開く。初期UI設定と保存済み設定を尊重する。編集、Undo/Redo、保存・再読込、書出し、offline、素材整合を確認し、お手本由来でない独立した通常編集の回帰も維持する。
現行のsamples testとnegativeを必要な実行・集約へ接続する。人間の理解・楽しさを自動結果で実証したとは扱わない。

## 吹き出し設定と部品名の表示

追加監査の入口は `audit/tests/speech-display-browser.mjs <固定ブラウザー> <新しい出力JSON>`、独立検証は `audit/tests/speech-display-verify.mjs <出力JSON> <検証結果JSON>` とする。local gateとActionsのselftest・証拠集約に両方を必須追加し、既存42段・能力台帳260行・全ブラウザー群・既存の負例を保持する。

| 安定ID | GA-EXECの期待値 |
| --- | --- |
| DISPLAY-SETTINGS | 新規作品の表示あり、コード／ブロックと基本／詳細の4組合せでオン・オフ・Undo／Redo、名前行の余白除去と本文保持 |
| DISPLAY-PERSISTENCE | 両設定の実ダウンロード、再読込み、自動保存復元、書き出したHTMLのオフライン実行 |
| DISPLAY-BUBBLES | 両設定・短文／長文・1180／390px・舞台10／30／100／200％の32条件、舞台内包含・非重複・短文の全文字・長文の全文への実操作 |
| DISPLAY-DURATION | 両設定の同時2秒発話の実時刻と、時間指定なしの次の発話までの保持・停止時の消去 |
| DISPLAY-OBJECT-NAMES | コード／ブロック・基本／詳細・1366／390／320px・短名／長名の24条件、名前の折返し・上段配置と実コピー／削除、元の名前と本文の保持 |
| DISPLAY-NATIVE-ZOOM | 両モードでChrome自身の125／200％拡大の4条件、実倍率・viewport・DPR、長名と操作ボタンの表示と操作 |
| DISPLAY-INVALID | 6種類の不正設定値とnull／undefinedの画面データを、作品／実行データ境界でF503／X602として拒否 |

GA-STATICでは公開入力・構文・版とfreezeを照合する。HYBRIDでは実測した文字・枠・設定値・本文・履歴と独立期待値を検証する。SEMANTICでは設定の適用単位、保存と実行の整合、変更範囲と既存監査の非弱体化をレビューする。短文は2秒、長文の全文操作には10秒の読取りfixtureを使い、両者を代替しない。

検証器は順序付き7群、32＋24＋4条件、公開snapshot、固定Chrome／Playwright、保存作品・生成HTML・画像と候補製品の実hashを要求する。欠落・重複・失敗・別snapshot・環境・通信・名前や本文の欠け・復元設定・偽拡大・artifact改変を13拒否対照で検査する。期待本文を観測結果へ代入せず、全文ボタンを操作した場合は実際のdialog本文を記録する。実行したOSに結果を限定し、実児童UX・実IME・未実施OSをPASSとしない。


## 児童目線UX監査の追加契約

[再現可能な児童目線UX監査](audit/CHILD_UX.md)と `audit/fixtures/child-ux-plan.json` を追加契約とする。既存の必須保証、固定baseline・oracle、LANGUAGE、製品をこの追加の都合で変えない。技術検証・Actionsの機械合格・児童目線の独立最終評価を別々に扱い、実児童・実OS IME・Scratch比較の未実施をPASSへ含めない。既存48枠の両方向の実UI往復と既存8枠の実画面語彙観測を利用し、同run／attempt／snapshotの2ジョブの証拠を厳格に集約する。失敗・欠落・skip・cancel・timeoutを拒否し、再試行前の結果を履歴として保持する。

## 再生画面への切替の修正と監査

別途指示された製品不具合修正として、再生時の大きなプレビューをコード／ブロック・かんたん／くわしくの4組合せへ適用する。舞台と動きのようすを表示し、停止・一時停止・再開・1命令ずつの操作を残す。停止後は本文を変えず編集へ戻る。言語の意味・保存形式・実行形式・書き出しruntimeを変更しない。

既存selftestのDISPLAY-SETTINGSへ4組合せの実ブラウザー操作を追加する。`run-preview-contract.mjs` が画面に対する舞台の領域、編集欄の非表示、フォーカス、実際のクリック対象、操作と停止後の状態・本文を独立検証する。4画像の実在・hashと独立した拒否対照を必須とし、既存7群・全条件・13拒否対照・8秒制限を維持する。事前の失敗を残し、Linuxの修正結果は当該SHAのActionsで確認する。

児童監査のscope原本とpinは変更しない。承認された製品CSS・仕様の追記・既存表示試験への追加だけを `approved-run-preview-fix.json` に固定する。全文hashと、追加を正確に戻した元のhashをともに要求する。4対象ファイルの巻き戻し・余分な変更を8負例で拒否し、元のbaseline・oracle・期待値・既存workflowを保護する。

新しい吹き出し試験の固定幅はcontext生成時に指定し、読込み後の準備resizeを行わない。同じ画面条件・実操作・期待・8秒制限を維持する。児童UXのscope原本は保持し、この準備差分だけを変更後全文hashと逆変換後の元hashで限定する。元の28静的拒否対照にtimeout変更・余分な変更を拒否する2対照を追加し、最初の失敗を記録する。


命令一覧の「探す・作るをたたむ／ひらく」は検索・データ作成・ヒントの領域を開閉する。初期は開状態。DISPLAY-SETTINGSの両ブロック条件で実クリックとEnterによる再表示、命令一覧の高さ増加、検索・分類・作品・Undo／Redoの保持、変数・リストダイアログへの再到達を追加検査する。既存機能・期待値・試験件数を縮小しない。

本文の検証では元のコード／ブロックと動きのようすを同じDOMのまま専用の検証画面へ開き、実行中の編集ロック、表示切替、実行位置、一時停止・再開・1命令ずつを保持する。質問・実行エラーは検証画面を閉じて通常の案内を操作できるようにする。通常画面4枚、検証画面4枚、折り畳み2枚の画像と、実操作・領域・本文保持を同じselftestへ必須追加する。


再生画面の出力欄と200％でのスクロールは `numeric-display-browser` と `speech-name-layout-browser` の既存検査で確認する。数値の実値表示は本文検証画面からも操作し、モーダルに妨げられず読めて閉じられることを要求する。`paint-runtime-lock` は編集時に操作へ到達してから再生中の無効化と停止後の復帰を検証し、`browser-session` と `review-readable` は明示された本文検証画面を開いて既存のロック・表示切替・デバッグ・所有者の保証を確認する。`ux/browser-bubble-1366-fit` は大きなfitを確認した後、40％の操作で従来の39–43％縮小条件を再現し、元の境界・文字サイズ・非重複・全文一致を両方で維持する。独立validatorと合成正例は両方の観測を要求し、元の183負例を保持する。製品CSSと操作経路の承認差分は正確な逆変換と全文hashで限定する。

本文検証画面では元の「表示：かんたん／くわしく」の選択部品も移動し、実行中の表示段階切替を保持する。閉じた際に元の場所へ戻し、コード／ブロック・一時停止・再開・停止の経路とともに `review-readable` で確認する。

再生画面と編集画面の現行操作・状態・履歴を直接検証する。旧試験sourceへの逆変換や承認hunkの恒久保持は不要。現行の結果validatorと必要な拒否対照で検査の欠落・改変を拒否する。

`ux-normal-ui.mjs` の作品準備は、同じ作品名の再読込みでもファイル入力の非同期処理完了と要求したmain本文の一致を待ってから対象・きっかけ・モードを操作する。固定時間待ちや試行のやり直しで成功扱いにしない。読込みを遅らせた実ブラウザーで早すぎる操作を再現し、修正後は同一本文の再読込み、コード／ブロック、きっかけ切替を含めて確認する。既存の改行・範囲切取り・貼付け・字下げ・Undo／Redoの期待値と時間制限を保持する。

レイアウト検査は対象のviewportと配色をbrowser context作成時に固定し、その後で製品を開く。準備直後の画面変更と最初のクリックを重ねない。既存の5画面・2配色・5課題・2倍率の100条件、通常クリック、コードへの復帰、寸法・本文・履歴の期待値、30秒の操作制限と600秒のsuite制限を維持する。準備・配置・コード復帰の実行中条件を保存し、途中停止・未実施・timeoutは引き続きFAILとする。


## 監査データの追加と保存

現行ツリーは「今」の契約・実装・独立期待値だけを持つ。「次」は作業branchの差分であり、受入後に今へ置き換える。旧台帳、完了済み移行資料、旧source復元、旧workflow本文の維持、旧状態や全byteの再構成を恒久検査にしない。新しい歴史資料やarchiveを作らず、経緯はGit履歴とPRに残す。

追加前に既存の保証を確認する。必要な新しい保証は追加し、重複するproducer・本文・対応表は統合する。現行の独立期待値は必要部分だけ保持し、候補出力で追認しない。現行保証の意味を保つ統合・削除は可能であり、旧件数維持や追記のみを義務にしない。

監査結果は実行artifactに置き、Gitへ各回の台帳を蓄積しない。結果の同一性・完全性・改変拒否を機械検査し、短いsummaryから失敗箇所へ辿れるようにする。検査器の必要なnegativeは保持するが、退役した保存形式のnegativeを別名で存続させない。

現在のinput inventoryと配布対象の責務を分ける。テスト入力の識別を各suiteへ巨大な複製として持たせず、共通bundleで検証できる。正当な修正で複数の同一hash固定やvalidator内のpinを手動連鎖更新する構造を作らない。

## 書き出し形式と開く前の保護

`audit/tests/export-open-browser.cjs` と `audit/lib/export-open-contract.cjs` は追加の31件を固定IDで検査します。現行のlocal gateと必要な追加検査の対応を確認し、`node audit/tests/export-open-browser.cjs <Chrome実行ファイル> <新しい証拠ディレクトリ>` を実行します。現行公開snapshot、結果集合・順序・重複、個別PASS、ページ例外と外部通信を検証し、欠落・失敗・別snapshotを合格にしません。既存検査の削除・免除・期待値の緩和は行いません。

書き出し選択の静止見本・取消・フォーカス・狭い表示・連打と、従来API引数の既定形式・開始／再開始／一時停止／再開／停止を確認します。作品だけの形式は左上・設定サイズ・作品内ボタン／キー／質問／画像／ペン／停止、iframeと戻る操作、初期化と不正素材の拒否を確認します。音声なし／開始許可／ブラウザーによる開始待ち、待機中の無進行、native mouse／keyboard／touchの一度だけの開始と入力の二重伝播防止を確認します。音声decode失敗と操作後の権限制限はfault injectionを明記し、実環境の制限確認と混同しません。音声出力先の障害は無効なsinkIdを指定し、nativeのresumeとerrorイベントによる安全停止・詳細表示を確認します。既定の出力先で自然発生した観測とは区別します。

開く前の確認は、保存・自動保存・編集・Undo/Redo、取消、同じ作品の再選択、破損読込み、別経路、承諾後の編集、書きかけと自動復旧を対象にします。承諾だけで作品・素材・履歴・自動保存を消さず、読込み検証が成功してから置き換える保証を確認します。自動保存失敗の注入でも確認条件は未保存状態のままです。

実児童による確認は別工程です。日本語表示とブラウザー画面の確認を、児童が理解できたという実証へ置き換えません。実機未実施のブラウザーやOS、native BFCacheが利用されなかった環境は証拠から区別します。


## 現行候補の監査基準

実行対象のcommit・製品hash・現行の試験/期待値・環境を識別する。release固定は現行配布物の整合を扱い、独立期待値は現行意味の保証を扱う。同じ製品をcurrent-audit-basisとreleaseで二重管理する義務はない。
承認された差分の一回限りの移行確認はPRと実行証拠で終える。通常gateが旧移行commit、hunk、旧NOT_RUNや旧台帳の再構成を要求しない。未承認の保証縮小はせず、必要な現在の機能・誤入力保護・検査器の拒否能力を直接試験する。

## 編集時の構文再利用の回帰検査

編集診断で共有本文を繰り返し解析する負荷を対象とする。構文だけを再利用し、候補ごとの所属解決と意味検査は現在の作品に対して再実行する。キャッシュは保存対象外で、本文・解析文脈・宣言・部品／舞台・拡張操作の変化に追従し、最大256文書・本文合計100万UTF-16単位に制限する。実行器のcompile経路と外部形式は変更しない。

`audit/tests/editor-syntax-reuse.mjs` の非キャッシュ比較・無効化・非変更・解析回数・上限検査を `node-product` の追加検査として実行する。既存の安定ID、独立期待値、全ブラウザー検査を置き換えず、原本を使った実画面の改善確認とは別の証拠として扱う。

## 創作中の復帰とブロック操作の回帰検査

保存・編集・実行の失敗から、同じ作品と編集場所へ戻れることを検査する。現行のlocal gateと書出し／読込みの保証を保持し、次の観測を既存の該当ケースに追加する。現行の独立期待値を候補出力で追認しない。

- GA-EXEC／HYBRID：`editor-browser` の検索欄・全文編集の文字Undo/Redo、本文選択2経路と手順／答えの選択後のUndo/Redo。作品の本文、選択先、履歴数、Redoを照合する。
- GA-EXEC：`review-first-use` の `REVIEW-DEFAULTS-FIRST-RUN` に、1188／390／320pxで候補の説明全文と「ならべかえ」→「上へ」の実クリック、元に戻す／やり直すを追加する。並べ替えは2クリック・ドラッグ0回の操作成立を測り、初見の発見性を合格と推定しない。
- GA-EXEC：`UI-BUTTON-RESPONSIVE` に760／390／320pxの文字編集後の道具箱再表示を追加する。一度だけの確定と、変換中・確定失敗時の入力保持、通常開閉、作品と履歴の保護を確認する。合成IMEは実OS IMEと区別する。
- GA-STATIC／GA-EXEC：`draft/selection-belongs-to-target-and-event` で本文IDと対象／できごとの一致を検査し、同じできごとの複数本文を保持する。`OPEN-APPROVED-CORRUPT-RETAINED` は元の破損ケースに加え、選択不一致と復元時例外の注入で作品・素材・下書き・Undo/Redo・dirty・自動保存の非破壊を検査する。`OPEN-RECOVERY-SAVED-DRAFT-CLEAN` は保存済みのコード／ブロック／定義下書きと、その後の変更を区別する。
- GA-EXEC：`browser-session` の既存実行／停止・失敗場所ケースで、現在表示中の編集先へのフォーカスと正しい復帰案内を確認する。
- GA-EXEC／HYBRID：`browser-runtime-limits` に新ID `limit:continuous-number-overflow` を追加する（既存9 IDを維持して10 ID）。有限の速度でも時間積分で位置が溢れる4方向、停止境界での溢れ、通常速度の正確な停止位置を独立に計算する。コード／ブロックの実画面でR403の一時停止、日本語の対象・理由・復帰案内、停止成功、作品・履歴保持を検査する。受理する数値や既存の資源上限を狭めない。

観察に基づくScratch比較と改善仮説は [創作中の復帰とブロック操作](audit/CHILD_UX_RELIABILITY.md) に記録する。実操作、機械検証、児童理解の仮説を区別し、Scratchより使いやすいとの児童実証や独立最終受入を主張しない。

固定原作文7件と構造編集9件の実ブラウザー試験では、非同期の素材準備がRUNNINGへ遷移した後に入力・観測する。T06は初期位置と閉じた四角の最終位置が同じなので、最初の描画も観測してから従来の座標と `ink>=60` を照合する。既存ID・原文・全assertion・8秒制限・速度と時刻の許容差は変更しない。準備待ちの失敗をPASSやskipへ変えない。

R06の文書上の操作名と現行UIの一致を直接検証する。旧文書の節hashや移管件数の再構成は要求せず、現在の操作と維持する意味を確認する。

児童向けブロック用語の案内は、折り畳まれた初期道具箱の「探す・作るをひらく」へ通常操作で進んでから、従来のEnter開閉・全文・領域・本文履歴保持を検査する。8件の必須ID・assertion・時間制限を保持する。

保存・読込み診断の既存4ケースには、code/blocksと1180×757・1366×768・1188×848の「出力」到達を追加する。実wheelと通常クリック、全領域・中心hit・詳細表示、作品・本文・履歴の保持を必須とし、Tabによる自動スクロールをwheelの代替にしない。診断23件と旧17拒否対照を保持し、wheel証拠欠落と入口の切れを拒否する2件を追加する。閉じたblocksの枠は従来の折り畳みを維持する。
