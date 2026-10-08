# 児童目線UXの再現可能な監査

この追加契約は既存の機能・意味保証を維持し、児童が使う操作経路と表示を検査する。固定スクリプトの成功は操作経路の成立の証拠であり、初見の見つけやすさ、児童の理解、製品全体の最終受入を証明しない。技術検証、GitHub Actions、児童目線の独立最終評価は別に報告する。

## 基準と変更境界

小学3年生を入口に、高学年の表現の幅も維持する。あかり・Scratch・プログラミング・座標・変数・PC操作を既知としない。「読む力」「意味と概念」「文字入力」「機器操作」の4軸を分ける。配当漢字や支援文の存在を理解の合格に置き換えない。説明書や大人の説明を必須にせず画面内の短い案内・例から制作できることが目標である。

開始mainはpublic SAIEduLab/Akariの `2da327685b313ba781f696a4e4a7f8726a15c661`。追加前の1.1.1候補を凍結した `fixtures/child-ux-scope.json` の369入力を保護する。製品HTML、LANGUAGE、既存fixture・baseline・oracleおよび既存監査workflowを含む356ファイルはバイト照合する。残る13ファイルは元のhashを保った正確な差分検証を行う。 `tests/ux-repair-language.mjs` は承認された比較入力の補正1箇所だけを許可する。旧1.0.2側へ渡す複製作品から新設定 `stage.showSpeechNames` だけを除き、現行側の入力、対象名「今」の意味、固定期待 `[[0,'dango','7']]` と27件の検査は保持する。補正後の全文hashと、補正を戻した元の全文hashを両方照合し、期待値の変更・余分な変更を負例で拒否する。作品の旧版読込み互換を新しい保証として追加するものではない。先行する1.1.1改修の `tests/speech-display-browser.mjs` は初期viewportを読込み前に固定する準備差分だけを許可する。同じ画面幅・高さ、通常クリック、7群と全条件、期待・8秒制限を保ち、共通host・製品は変えない。変更後の全文hashと準備差分・追加検査の正確な逆変換後の元hashを要求し、timeout変更と余分な変更を2負例で拒否する。scope原本とそのpin、全baseline・oracleは変えない。読込み後のresizeとの因果は未確定で、初回の2回のクリックtimeoutを残し、変更後のLinuxを別に検証する。今回のPRには先行する1.1.1製品改修があるが、この追加監査はその製品を変更しない。既存AUDIT・UX_REPAIRの内容を残して追記する。製品不具合は再現手順と期待結果を報告し、試験側で隠さず、製品修正の承認を別に得る。

## 要求から証拠までの対応

「既存で保証済み」は、実結果の対象・順序・時刻・回数・値、描画領域、実操作、本文と履歴などを既存validatorが固定期待へ照合する部分を指す。件数や項目名だけで判定しない。人の理解・発見性を保証済みに含めない。詳細な機械可読の対応は `fixtures/child-ux-plan.json` に置く。

| 要求ID | 分類 | 検査する保証 | 安定試験ID | ジョブ | 証拠／検証関数 |
|---|---|---|---|---|---|
| A1 | 既存で保証済み | 24課題の独立した対象・順序・時刻・条件・回数・値 | `B01/code`<br>`B01/blocks`<br>`B02/code`<br>`B02/blocks`<br>`B03/code`<br>`B03/blocks`<br>`B04/code`<br>`B04/blocks`<br>`B05/code`<br>`B05/blocks`<br>`B06/code`<br>`B06/blocks`<br>`B07/code`<br>`B07/blocks`<br>`B08/code`<br>`B08/blocks`<br>`B09/code`<br>`B09/blocks`<br>`B10/code`<br>`B10/blocks`<br>`B11/code`<br>`B11/blocks`<br>`B12/code`<br>`B12/blocks`<br>`B13/code`<br>`B13/blocks`<br>`B14/code`<br>`B14/blocks`<br>`B15/code`<br>`B15/blocks`<br>`B16/code`<br>`B16/blocks`<br>`B17/code`<br>`B17/blocks`<br>`B18/code`<br>`B18/blocks`<br>`B19/code`<br>`B19/blocks`<br>`B20/code`<br>`B20/blocks`<br>`B21/code`<br>`B21/blocks`<br>`B22/code`<br>`B22/blocks`<br>`B23/code`<br>`B23/blocks`<br>`B24/code`<br>`B24/blocks` | `composition-acceptance` | `ux-repair02-matrix.json` / `verifyRepairMatrix` |
| A2 | 不足を今回補う | 両モードを起点に実UIを往復し同じ独立期待と照合 | `CHILD-UX-ROUNDTRIP` | `composition-acceptance` | `child-ux-matrix.json` / `verifyChildMatrix` |
| A3 | 既存で保証済み | 未完成・不正入力を勝手に別意味へ変えない | `diagnostics/current-source`<br>`editor/synthetic-composition` | `composition-acceptance` | `ux-repair02-browser.json` / `verifyRepairBrowser` |
| B1 | 既存で保証済み | 分類・検索・候補の到達と挿入、状態保持 | `controls/palette-and-search` | `composition-acceptance` | `ux-repair02-browser.json` / `verifyRepairBrowser` |
| B2 | 既存で保証済み | 対象・きっかけ・元の本文を保持 | `B08/code`<br>`B08/blocks`<br>`B09/code`<br>`B09/blocks`<br>`B23/code`<br>`B23/blocks` | `composition-acceptance` | `ux-repair02-matrix.json` / `verifyRepairMatrix` |
| B3 | 既存で保証済み | 取消・Undo/Redoと編集への復帰 | `B24/code`<br>`B24/blocks` | `composition-acceptance` | `ux-repair02-matrix.json` / `verifyRepairMatrix` |
| B4 | 既存で保証済み | エラー箇所への到達と修正復帰 | `syntax/closing`<br>`syntax/quote` | `ux-repair05` | `child-diagnostics.json` / `verifyChildDiagnosticsReport` |
| C1 | 既存で保証済み | 固定画面幅・実ブラウザー拡大・必須部品の到達 | `COMPONENT-CONTROLS-RESPONSIVE`<br>`COMPONENT-CONTROLS-ZOOM` | `ux-repair05` | `component-controls.json` / `verifyComponentControls` |
| C2 | 既存で保証済み | 10/28/100%・短文長文・複数話者・全文一致と閉じる | `speech-preview/fresh/10`<br>`speech-preview/fresh/28`<br>`speech-preview/fresh/100`<br>`speech-preview/full-78/10`<br>`speech-preview/full-78/485` | `ux-repair05` | `speech-preview.json` / `verifyPreviewReport` |
| C3 | 既存で保証済み | 寸法・文字の描画・実操作・画像を併用 | `speech-name/position-edges`<br>`speech-name/native-browser-125/full-78` | `ux-repair05` | `speech-name-layout.json` / `verifySpeechNameLayoutReport` |
| D1 | 不足を今回補う | 製品ソースと実画面の候補語を対応・欠落を検出 | `CHILD-UX-LANGUAGE-INVENTORY` | `ux-repair05` | `child-ux-language.json` / `verifyChildLanguage` |
| D2 | 既存で保証済み | 読み・平易な意味・例・操作への支援を実画面で確認 | `CHILD-UI-ACTION-HELP`<br>`CHILD-UI-DATA-EXAMPLES`<br>`CHILD-UI-BLOCK-WORDS` | `ux-repair05` | `child-language-ui.json` / `verifyChildLanguageUi` |
| D3 | 人による確認が必要 | 語や概念を児童が理解できるか、未知語の意味審査 | `CHILD-UX-VOCABULARY-REVIEW` | `manual` | `manual-events.jsonl` / `verifyManualSession` |
| E1 | 既存で保証済み | 入力・貼付・focus・合成composition中と確定後 | `editor/synthetic-composition`<br>`editor/enter-indent` | `composition-acceptance` | `ux-repair02-browser.json` / `verifyRepairBrowser` |
| E2 | 不足を今回補う | OS・フォント・ブラウザー・snapshot・実行由来を区別 | `CHILD-UX-PROVENANCE` | `child-ux-aggregate` | `child-ux-aggregate.json` / `verifyChildBundle` |
| E3 | 人による確認が必要 | 実OS日本語IMEと機器操作の理解 | `CHILD-UX-REAL-IME` | `manual` | `manual-events.jsonl` / `verifyManualSession` |
| F1 | 人による確認が必要 | 事前予測・解答なしの制作・画面だけの修正・援助記録 | `CHILD-UX-INDEPENDENT-OBSERVATION` | `manual` | `manual-events.jsonl` / `verifyManualSession` |
| F2 | 人による確認が必要 | 同24課題のScratch日本語比較 | `CHILD-UX-SCRATCH-COMPARISON` | `manual` | `manual-events.jsonl` / `verifyManualSession` |
| G1 | 不足を今回補う | 意味・話者・支援・隠れ・結果欠落を独立に拒否 | `CHILD-UX-REJECTION-CONTROLS` | `child-ux-aggregate` | `child-ux-aggregate.json` / `verifyChildBundle` |
| H1 | 不足を今回補う | 欠落・失敗・skip・取消・timeout・別SHA/実行を拒否 | `CHILD-UX-STRICT-AGGREGATE` | `child-ux-aggregate` | `child-ux-aggregate.json` / `verifyChildBundle` |
| H2 | 不足を今回補う | 再試行前の失敗を履歴として保持 | `CHILD-UX-RETRY-HISTORY` | `child-ux-aggregate` | `retry-history.json` / `verifyRetryHistory` |

既存の取消・Redo・検索・候補・対象・きっかけ・エラー復帰・実画面の支援・描画保証は既存の試験とvalidatorをそのまま使う。別の同等試験は追加しない。24課題の各48枠に実UIでの往復を追加し、既存8枠の画像取得時に言葉と領域を観測する。

## 固定24課題

取得できた `fixtures/ux-repair-benchmark.json` のB01–B24、意図、期待、復帰条件、実施順を引き継ぐ。新しい課題を既存台帳の復元と偽らない。7概念×読む・作る・直すの21課題に、入口・文脈・取消の3課題を加える。各課題の事前条件、読む文、制作意図、誤り、画面の手掛かり、手順、意味・観測結果・復帰条件、適用モード・環境、証拠は追加planに記録する。コードとブロックの両方を実施する。

| ID | 概念／課題 | 事前に固定した意味・観測結果 | 制作・修正・復帰条件 |
|---|---|---|---|
| B01 | 順次／読む | こんにちは→またね、各2秒 | 順序と秒数を予測する |
| B02 | 順次／作る | おはよう→いってきます、各2秒 | 空の開始本文から作る |
| B03 | 順次／直す | ただいま→おやつにしよう | 逆順だけを直す |
| B04 | 反復／読む | やあ3回→おしまい1回 | 反復の範囲を予測する |
| B05 | 反復／作る | こっちだよ2秒＋無発話1秒を2回→おしまい2秒を1回 | 1つの反復の外に終わりを置く |
| B06 | 反復／直す | やあ3回→おしまい1回 | おしまいを反復の外へ移す |
| B07 | イベント／読む | 開始では無発話、あかりクリックでよんだ？ | イベントの対応を予測する |
| B08 | イベント／作る | だんごクリックでのみなあに？ | だんごのクリック処理を作る |
| B09 | イベント／直す | 開始では無発話、クリック時だけ発話 | きっかけだけを開始からクリックへ直し本文を保持する |
| B10 | 並行処理／読む | あか2秒と、1秒後のあお2秒が重なる | 2体の同じ開始からの時間を予測する |
| B11 | 並行処理／作る | こんにちは2秒と、1秒後のやあ2秒が重なる | 2体の開始時処理を作る |
| B12 | 並行処理／直す | だんごの待ち1秒で発話が重なる | 待ち3秒だけを1秒へ直す |
| B13 | 条件分岐／読む | そら→どうぞ、うみ→ちがうよ | 質問後の両分岐を予測する |
| B14 | 条件分岐／作る | ほし→どうぞ、つき→もういちど | 準備済みの質問の後に2分岐を作る |
| B15 | 条件分岐／直す | そら→どうぞ、うみ→ちがうよ | 空のそうでなければ側だけを補う |
| B16 | 演算／読む | 2＋3の計算結果5 | 式の結果を予測する。文字23や固定5は不可 |
| B17 | 演算／作る | 4−1の計算結果3 | 引き算の式を作る。固定文字3は不可 |
| B18 | 演算／直す | 2×3の6から2＋3の5 | 演算子だけを変え、左右の2と3を保持する |
| B19 | データ／読む | 点数0設定→2増加→表示・発話2、再実行も2 | 初期化と現在値の変化を予測する |
| B20 | データ／作る | 開始0、発話終了後の各クリックで表示・発話1→2→3 | 既存の点数を1増やす処理を作る |
| B21 | データ／直す | りんご→パン | 買うもの［りんご、パン、牛乳］を保持し、参照1番目だけを2番目へ変える |
| B22 | 初回から実行／入口 | こんにちは2秒。文言の編集と復帰も実行 | 通常入口から画面内の手掛かりだけで探す |
| B23 | 対象・きっかけの切替／文脈 | 開始あかりのみおはよう、クリックだんごのみなあに？ | 元の処理を保持し、追加後にあかり開始の編集へ戻る |
| B24 | 誤編集からの復帰／取消 | おはよう→いってきます | 実際にいってきますを削除し取消で復元。コード候補の開閉、Redoも確認 |

期待は既存の独立した `ux-repair02-matrix.json:cases[].virtualRuns[].expected` と台帳の `fixedExpected` に基づく。実装出力から生成しない。実ブラウザーで制作した作品の実行traceと、仮想時計での意味を別々に照合する。実UIでコード→ブロック→コード、ブロック→コード→ブロックを行い、各時点で同じ独立期待へ照合する。双方が同じ誤りをしても合格しない。対象・ソース・作品hash・履歴・Redo・dirtyの保持も確認する。ブロック表示では、実UIから全ての本文を開いてDOMの構造・入力値・演算子・対象・きっかけと描画領域を記録する。製品のAST／parser／compiler／blockDecodeを使わない監査側の小さな意味評価で、7概念の表示が同じ既存期待を満たすか照合する。自動制作のfixture準備や正解入力は、解答なしの独立評価として数えない。

## 画面・言葉・入力の証拠

課題の固定画面は1188×848。既存の部品操作試験は1920×1080、1366×768、1280×720、1024×768、760×600、390×600、320×500と実ブラウザー倍率125・150・200%を使う。舞台10・28・100%を既存speech-previewの別ケースで検査する。全24課題を全境界で繰り返したという意味ではない。短文・長文・同時発話、話者名と全文、全文の開閉、必須部品の領域・スクロール・クリック到達は既存の実ブラウザー証拠へ追跡する。DOMの存在や画像差分だけでは合格にしない。

言葉の一覧は製品ソースの漢字・カタカナ候補と実際に表示されクリック領域を観測した画面の語を統合し、source行、画面名、読み、既存の支援参照を記録する。ソース中の候補すべてが児童に見える文言だとは主張しない。読み・平易な説明・具体例・操作案内の既存固定保証はG3 validatorで照合し、案内の欠落や旧文言への逆戻りを拒否する。全候補の人による理解判定はUNVERIFIEDとし、語彙一覧へ追加しただけで合格にしない。人による語彙点検では、画面の語／読み／説明／具体例／そこから行える操作／支援が実際に開くか／判断理由を記録する。

合成compositionイベントの試験と実OS日本語IMEの試験を区別する。報告はOS、Node、固定ブラウザー、フォントファイルhash、CSS宣言・実描画幅、入力種別を持つ。Linuxの成功をWindowsへ流用しない。フォント情報は観測条件であり全フォントfallbackの証明ではない。

実IMEの固定手順は各対象OSで次の通り。OS版・ブラウザー版・日本語IME名と版・フォント・画面寸法・倍率を先に記録する。B02の空の本文から開始し、英数でフォーカス移動、文字入力、貼付けを確認する。日本語入力へ切り替えて「おはよう」を変換し、未確定中の本文・候補・選択状態を画像と時系列で記録する。確定前のEnterが命令の挿入・実行へ混ざらないことを確認する。確定後に本文と保存内容を確認し、候補の取消、ダイアログの開閉、再入場、Undo／Redo、実行と編集復帰を確認する。実OS IMEを操作していない記録はUNVERIFIEDのまま残す。

## 代理評価・実操作の手順

`node audit/tests/child-ux.mjs manual-template <fresh-output.json>` で24枚の課題カードと、コード・ブロック・Scratchの72枠の未実施台帳を作る。B22を最初にした固定orderでカードと記録枠を作る。各モードの初回条件は別の未経験評価者／セッションで確認し、同じ評価者が2つ目のモードを試すときは経験ありと記録する。作る課題のカードには正解コードを渡さない。読む課題の実行前予測を追記保存し、そのファイルhashと時刻を実行前に記録する。実行後に予測を編集して合わせない。直す課題では実行・内部資料の閲覧前に、画面から判断した原因と場所を記録する。

各観測はJSONLで `akari-child-ux-manual-session-v1` の1セッションを1行に記録する。actorはAI_PROXY／ADULT_PROXY／CHILD_OBSERVATION、taskはBxx、modeはcode／blocks／scratch-ja、結果はPASS／FAIL／UNVERIFIED。経験、screenOnly、firstEncounter、solutionProvided、assistance、environment、4軸のdimensions、eventsを記録する。各eventは連番・時刻・証拠参照・evidenceSha256と必要な内容を持つ。実施済みはinteractionCountsに比較の8種類の非負整数を記録する。4軸のOBSERVEDには証拠とhashが必要である。auditKindをTASK／VOCABULARY／REAL_IMEから選び、語彙の実施済みにはvocabularyReviewの語・理由・結果と、合格を主張する各語の読み・平易な説明・具体例・操作案内・表示証拠を記録する。実IMEの実施済みはosVersion／imeName／imeVersion／fontProfile／viewport／zoomを記録しsynthetic=falseとする。focus／paste／composition-unconfirmed／composition-confirmed／composition-cancelledの各eventも必要である。読むはprediction、作るはintent-only-brief、直すはcause-and-locationをexecutionより前に保存し、execution後にreturn-to-editingを記録する。クリック、drag、入力確定、画面遷移、誤選択、検索、支援、修正復帰の回数を観測する。情報が不足すればUNVERIFIEDを選ぶ。

ソース、解答、説明書、大人の支援を参照した場合はassistanceへ明記し、screenOnly／firstEncounterをfalseにする。施工担当は内部情報を既に知っているため、その評価を初見・独立最終評価として数えない。実児童の実測がなければ理解度・成功率を主張しない。

`node audit/tests/child-ux.mjs manual-verify <manual-events.jsonl> <fresh-validation.json>` は手順記録の構造と、ログと同じフォルダー内の証拠ファイルの実在・hashを検証する。VALID_PROTOCOL_RECORDSは理解の合格ではなく、MACHINE_PASS件数へ含めない。時刻だけで人による事後改ざんの不可能性を証明しない。生の追記ログと実行前hash・画像を別に保管して評価担当が照合する。

## Scratchの比較

同じ24課題・日本語・1188×848で、あかりブロック・コード・Scratchを比較する枠組みを維持する。Scratch版、画面条件、言語は比較開始前に固定し記録する。現在の版は未測定のためnull／UNVERIFIEDとし、測定済みと偽らない。操作種類と回数、探索、支援、修正復帰を同じ記録項目で観測する。第三者サイトの通信障害はUNVERIFIEDとし製品FAILへ混ぜない。外部Scratchを毎回の必須CIへ入れず、実児童で測定していない優位性は主張しない。

## 合否・負例・Actionsの集約

ブロックの命令・式の表示名と意味の対応も独立して照合する。B16／B18は左右2・3の加算、B17は左右4・1の減算を必要とし、結果だけが同じ固定文字・固定数値・別の式を拒否する。手動記録の一意性はauditKind／actor／mode／taskの組で判定し、同じB02のTASKとREAL_IMEを同じログに残せることを合成の正例で確認する。同じ組の重複は拒否する。この合成記録は実施済みの児童評価や実IME操作の証拠へ流用しない。

機械検査は独立期待・全必須ID・実結果・画像の実在とhash・実操作領域・snapshot・実行由来をすべて満たした場合だけPASS。必須欠落、重複、FAIL、skip、cancel、timeout、別SHA・実行・試行の混在を拒否する。UNVERIFIEDはPASS件数に含めない。負例は製品正本へ変更せず、隔離した結果データで話者・順序・値・分岐・回数・案内・可視性・証拠欠落・集約不整合を変異させて必ず拒否する。負例検証はSYNTHETIC_VALIDATION_ONLYと明示し、製品操作の正例と混同しない。

既存 `akari-audit.yml` と `akari-acceptance.yml` の必須検査を保持する。後者のcomposition-acceptance、ux-repair05に観測と独立validatorを追加し、child-ux-aggregateが両ジョブの成功と当該run／attemptのsealed bundle、実ファイルhash、既存validatorの再検証を必須とする。新しいブラウザー実行ジョブを重複増設しない。PRのheadと実際のcheckout（merge）のSHAは別フィールドに記録し、異なる作品・実行証拠を混ぜない。

各bundleは同じ公開snapshot、候補SHA、実行SHA、OS、run、attemptを持つ。修正済みSHAの再実行でも以前のFAILを消さない。同runの再試行はGitHubのworkflow-run-attemptとjobsから以前の結論・手順・リンクを取得しretry-history.jsonへ保存する。先行失敗があればRETRIED_AFTER_NON_SUCCESSを明記する。当該attemptに両必須ジョブの証拠が必要なため、失敗ジョブだけの再試行の旧証拠を混ぜて合格にしない。全必須ジョブを実行する。保持は3日、既存concurrencyで重複を抑え、既存画像を再利用しproject hashで証拠容量を抑える。保証・ケース・閾値・既存の実行制限を縮小しない。

GitHubの再試行APIの仕様は[workflow run attempts](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run-attempt)、[attempt jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt)を参照する。

## 報告の限界

技術検証のPASS、ActionsのMACHINE_PASS、代理評価の観測、実児童・独立最終評価の実施状況を分ける。この追加だけで児童の理解や製品全体の最終監査が完了したと宣言しない。製品・固定baseline・oracleの凍結、実行済み／未実行、PASS／FAIL／UNVERIFIED、対象snapshot、最初の失敗と再試行を報告する。


再生画面の不具合は別途指示された製品修正として扱う。大きなプレビューをコード／ブロックと、かんたん／くわしくの4組合せへ適用し、編集欄を隠して停止・一時停止・再開・1命令ずつの操作を残す。製品CSS、LANGUAGEの仕様追記、既存表示validator・拒否対照への追加は approved-run-preview-fix.json の全文hashと正確な逆変換で固定する。scope原本・pin・baseline・oracle・元の期待値を変更しない。既存の凍結検査を外すことなく、承認差分以外と巻き戻しを8負例で拒否する。先行30件を保った静的負例38件と、意味33・言語14・集約13件の合計98件を区別して記録する。DISPLAY-SETTINGSの4実操作では領域・クリック到達・一時停止・再開・停止後の編集復帰と本文保持を検査し、4画像を必須証拠に追加する。技術検証を児童の理解や独立最終評価へ置き換えない。


追加指示の上部領域の折り畳みは製品UI修正として同じ承認差分へ固定する。検索・候補の表示・変数やリストの作成・ヒントを1操作で畳み、命令一覧を広くする。初めは開状態で操作を見つけられ、再表示後の機能・検索語・分類・本文・履歴を保持する。既存selftestで両ブロック表示条件の高さ増加、通常クリックとEnter、データ作成への再到達を観測し独立検証する。

本文の検証では元のコード／ブロックと動きのようすを同じDOMのまま専用の検証画面へ開き、実行中の編集ロック、表示切替、実行位置、一時停止・再開・1命令ずつを保持する。質問・実行エラーは検証画面を閉じて通常の案内を操作できるようにする。通常画面4枚、検証画面4枚、折り畳み2枚の画像と、実操作・領域・本文保持を同じselftestへ必須追加する。


36cf9c0のActionsで検出した再生画面の出力・拡大時スクロール不良と、旧編集画面を前提とする試験操作を補正する。凍結原本は保持し、11ファイルの正確な承認差分を22拒否対照で保護する（先行30と合わせ静的52、意味33・言語14・集約13の合計112）。旧縮小吹き出しの尺度・文字サイズ・重なり・全文一致は維持し、大きな再生画面のfitを先に追加観測する。監査の変更は操作経路と追加観測に限り、元の試験ID・保存値・意味・時間制限・必須集約を緩めない。

0ad5154のActionsで検出した旧試験照合の不一致は、承認済みのbrowser-session操作4差分の逆変換を照合処理にも適用して修正する。固定台帳・scope・pin・期待値・製品は保持する。保護対象369ファイルのうち355はbyte一致、2既存adapterと12承認差分は全文hashと逆変換で照合する。静的負例は先行52を維持し、照合処理の巻き戻し・余分な変更の2件を加え54件（意味33・言語14・集約13と合わせ114件）とする。

0f3c68cの固定受入で検出した準備の競合に対し、共通UI準備の読込み完了条件だけを補強する。製品・試験fixture・期待値・workflowは変更しない。13承認差分と2既存adapter、354 byte一致で369保護対象を維持する。準備処理の巻き戻しと余分な変更を2件追加して静的負例56件とし、意味33・言語14・集約13と合わせ116件の定義を保持する。

ad69549の固定受入は、レイアウト84条件の成功後、次の390×844・light・B10の準備クリックで停止した。レイアウト検査のviewportと配色を製品読込み前に指定し、進行中の条件と工程を保存する。製品・LANGUAGE・baseline・oracle・期待値・workflow・時間制限は変更しない。14承認差分と2既存adapter、353 byte一致で369保護対象を維持する。巻き戻しと余分な変更の2負例を追加し、静的58・意味33・言語14・集約13の計118件の定義を保持する。
