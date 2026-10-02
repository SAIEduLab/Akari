# UX監査を支えるActions移管対応

## 対象と判定の分離

比較基準は public `SAIEduLab/Akari` main `9d8ef194af2a65e92f6419a5d51700aaec4fdf0e`、製品SHA256 `d5da5c93a7486a35fe84b42a1013092c594da989e02da76ad9b978c4453fa302`。現在の作業は同じPRで製品の意味・編集・保存の修正と監査を進める。[公開仕様](reviewed/PUBLIC_SEMANTIC_UX_SPEC.md)と[再監査計画](reviewed/PUBLIC_UX_ACTIONS_ACCEPTANCE_PLAN.md)を完了条件とし、当該HEADの全必須機械ゲートと自己レビューが成功した後、明示された統合許可に従ってmainへmergeし、Pages公開を確認する。公開後の本人PCでのUX評価は別に記録する。仕様にある未実装項目を、部分的なPASSで完了扱いしない。

主目的は、子どもが制作を始め、意図した作品を完成できるかを実操作で判断すること。機械化できる互換・境界・往復・安全・保存・ブラウザ回帰はActionsへ移し、本人PCで全命令・全式を重複して手操作する工程を作らない。

判定は次の三つを混ぜない。

- **受入成功**：固定した原文を受理し、独立した期待動作・値・対象・順序を満たす。拒否、pending、確認未完了は成功ではない。
- **拒否安全性**：不正・曖昧な入力で既存作品・原文・履歴を壊さず、勝手に実行しない。安全に拒否した結果だけで日本語制作成功とは判定しない。
- **UX判断**：説明の理解、候補の探しやすさ、見失い、操作負荷、作品完成までの自然さ。自動クリックや機械PASSは児童視点の判定を代替しない。

`docs/1.0.2/` の六つの固定文書、旧原本、全既存ID・期待値を維持する。C/Q/E/L/schemaの個数は対象集合の照合に使い、個数一致を動作成功の証拠にしない。取消/UndoはU11/U12等の固有条件に、全幅・倍率は該当レイアウト観点に適用する。全Qへ全条件を掛ける直積は作らない。

## 既存で実行される検査と追加範囲

| 旧観点・対象 | 既存のActions入口 / 検査 | 既存の機械保証と限界 | この移管で扱う追加 / 実操作に残す事項 |
|---|---|---|---|
| C74 命令保持 | `selftest`: product / language / editor。`runCoreTests`: `catalog <id>`。`runBlockCodecTests` | 74固定命令の解析、AST・block変換、登録集合、文型・単位・文脈。個別runtime・traceは各意味試験の範囲 | 固定集合と実行入口を対応表へ束縛。単なる解析成功を74命令全動作成功へ昇格しない。UXでは制作課題に現れる命令を使う |
| Q76 式 | `selftest`: block codec / semantic / language。`full-browser-gate (schemas)`: `browser-schemas.cjs` の旧expression76行 | 固定式のブロック生成・各field/input編集、式移動・複製・再接続、code/block AST互換、保存再開。値・型・短絡・評価順は各runtime試験 | 同一Qに一律の取消・全幅等を追加しない。原計画の式IDと既存schema IDを対応させる。式・値・条件の説明理解はUX課題で判断 |
| E32 対象×イベント | `selftest`: core event。`full-browser-gate (ui)`: `browser-events.cjs` / `browser-event-traces.cjs` | 32組合せの選択・登録・実ブラウザ発火、source/block trace、対象・event sensor、保存。filter/同種複数本文はruntime-v2 / intent | 既知のIDなし本文の見出し変更について、本文数・選択・編集内容の保持を成功必須の回帰として追加。製品は修正しない |
| L38 上限 | `selftest`: language-boundaries / product limit suites。`full-browser-gate (limits)` 各design/runtime/asset/media boundary | 38定義集合、直前/一致/超過、実GUI拒否、資源・性能・素材境界、原子的保護 | 対象上限へ既存ケースを対応。境界対象の試験を再利用し、UIが理由を理解できる場所に出すかは実操作で残す |
| 別40能力（全260の残り） | 原固定表411〜678行と独立baselineのAST / Comment / Branch / Slot / Scope / Runtime / Save / Editor / Product / Maint | C/Q/E/Lの220行から独立した40能力。個々の既存product ID、browser task/case ID、形式互換・UIボタン・static policyへ照合 | `CAP-*` 40行を追加対応。schemaとの重複だけでカバー扱いしない。各能力で実際に登録された検査への参照が1つもなければ静的移管検査をFAILにする。登録成功から全意味条件の実行成功は主張しない |
| schema164 | static feature manifest。product block codec。`schemas` は旧153全行 | 現行164登録の固定、旧153の各GUI編集・構造操作・保存・往復。新11は既存の個別言語/runtime/editor試験にも分散 | 現行164と旧153の差分を明記。全164のGUI全操作が済んだという誤った主張はしない。追加11のHole4は拒否/下書き、他7は受入/意味を別分類 |
| code↔block、無編集往復 | `language-browser`, `editor-browser-core`, `editor-gui`, browser-session / schemas、intent source vs blocks | 605固定言語ID、38編集試験、GUI9、AST互換、原文・改行・注釈、履歴、モード切替 | 原作文受入の追加ケースでも同じ原文と意味を検査。既存の全schema手操作を本人PCへ戻さない |
| エラー安全 / U11・U12 | browser-session / boundaries / owner-delete、ui-buttons、review-units / first-use / harness-negative | 未確定入力、IME、取消、古い文脈、上限拒否、Undo/Redo、モデル・履歴保護、validator自身の拒否 | 原作文受入成功と別結果。モーダル裏の理由・気づきやすさは本人PCのUX不合格として保持 |
| 保存・復元・生成HTML | normal / source-ownership / format-compatibility / editor-assets、storage-media / modern-browser / persistence | 実download、作品再読込み、IndexedDB、自動復元、素材一致、offline player、破損拒否と未保存保護 | 新受入ケースの原文・event metadata・意味について保存/再読込みも機械化。保存した実感・復元選択の理解はUX |
| ブラウザ回帰・表示 | UI matrix、designer-zoom、block-field-width (Linux/Windows)、review-readable / first-use、native-focus | DOM寸法、pointer座標、キー/touch、focus、scroll、幅、6行到達、既知回帰 | 自動観察を支援証拠にする。操作感・全文編集の発見・「かんたん」初回導線・文字の読みやすさは本人PCで一巡 |
| 日本語の制作成功 | 既存intent89: 構造化sourceのruntimeとblocks、原作文23のpending保持、曖昧さ7 | 構造化sourceの成功と原作文の保護は別契約。原作文UI保持ルートは受理成功を主張していない | 現監査で拒否した6原文と期待動作を改変せず追加する。成功必須の別Actions結果を作り、失敗をskip/期待変更で隠さない |

対応先の正本は `audit/manifests/product-tests.json`、`audit/manifests/browser-results.json`、`audit/manifests/language-form-coverage.json`、`audit/lib/gate-contract.mjs`、`audit/lib/japanese-gate-contract.mjs`。原固定表の行番号をこれらの機能IDへ結び付ける際は原表を使用し、候補の観測出力から期待集合を生成しない。

原固定表の424行（C74/Q76/E32/L38、別40能力、S164）は `audit/fixtures/actions-transfer-plan.json` に原文の列・行番号・原本SHAを保存し、`actions-transfer-static.mjs` が登録集合と照合する。40能力は個別の実在するproduct/browser/補助gateのIDへ結び付ける。この結果は `REGISTRATION_ONLY` であり、動作成功・UX合格を主張しない。

追加Q76は `audit/fixtures/fixed-values.mjs` の独立期待値を、実候補の `evalExpression` / `RuntimeModel` で検査する。source、block decode、生成sourceの三経路の値・単位・型を比較し、元表のBoolean両値、負の四捨五入、整数乱数の範囲、リスト不在、押下状態、分身/接触の別条件も別観測として残す。これはNodeでの意味検査であり、実pointer/keyの発火保証は既存ブラウザ群に残る。

`.github/workflows/akari-acceptance.yml` は固定Chrome140 / Playwright1.55で、I07〜I12の原文UI受理、source/block意味・trace、実保存、I10の原手順/原計算定義、IDなし本文の選択保持を15結果として検査する。原文がpendingになった場合は制作受入FAILとする。既存の23作文保持・安全拒否ルートは変更しない。追加結果validatorは原文・snapshot・環境・完全集合・観測値・時刻・重複本文を再検査し、合成controlによる拒否能力検査を製品実行証拠へ数えない。

### 現行schemaに追加された11行

下書き専用は `Hole:expression` / `Hole:statement` / `Hole:target` / `Hole:rule`。受入・意味検査対象は `QuantityLiteral` / `UnitlessRead` / `ActorQualifiedRead` / `ContinuousRule` / `MotionCommand:MOVE_DIRECTION` / `MotionCommand:GLIDE_DIRECTION` / `WaitBroadcastGroup`。下書き穴を空値で補完して実行成功に数えない。

## 実行時間と重複除去

main push run [36948082810](https://github.com/SAIEduLab/Akari/actions/runs/36948082810) の実測。待ち行列時間を含まず、将来の上限値ではない。

| ジョブ | 秒 | 分類 |
|---|---:|---|
| static | 19 | 静的・集合・SHA・負検査 |
| selftest | 408 | 36段階、機能・意味・言語・編集・保存・回帰 |
| full-browser session | 294 | 編集状態・復元・runtime |
| full-browser ui | 542 | UI・イベント・操作経路 |
| full-browser limits | 130 | 境界・資源 |
| full-browser schemas | 614 | 旧153schemaの全GUI操作 |
| full-browser extra | 674 | 長大本文・native focus・追加回帰 |
| audio Linux / Windows | 67 / 86 | codec・field幅の環境差 |
| aggregate | 14 | 全証拠とsnapshotの再検証 |

1回の全runはジョブ実時間合計2,848秒（約47分28秒）、並列の最長ジョブは674秒（約11分14秒）。本人PCで同群を並列実行しない。標準 `ubuntu-latest` / `windows-latest` を使い、有料大型runner・課金設定を追加しない。

- 既存36段階と5ブラウザ群・2OS音声は再利用する。新しいコピーや同一の全能力suiteを増殖させない。
- 追加受入検査は一つのジョブ内で固定browserを共有し、各ケースは独立contextで実行する。ケースの例外後も残りの結果を集めるが、例外・timeoutはFAILのまま。
- 新しい受入workflowはPR/明示dispatchで起動し、pushとPRの二重起動を新たに増やさない。既存workflowの承認済みtrigger・matrixは保持する。
- 同一SHAで完了済みの検査を根拠なく繰り返さない。診断用の部分実行はINCOMPLETEとし、最終候補は全必須suiteを通す。
- artifactは3日、製品SHA・監査入力SHA・原文・期待動作・実測・失敗分類を記録。MACHINE_PASSはUX合格を意味しない。統合時は全必須結果・自己レビュー・現在HEADと明示された統合許可を照合する。

## 回帰分類と不足資料

追加結果は `SOURCE_ACCEPTANCE`（日本語受入）、`EDITOR_IDENTITY`（本文選択）、`SEMANTIC_ROUNDTRIP`（意味互換）、`REJECTION_SAFETY`（拒否安全）、`PERSISTENCE`（保存）、`LAYOUT`（寸法）を分ける。製品既知不具合によるFAILは新テストの不具合とは区別し、製品一括修正まで不合格として残す。

親から原本を受領・読取確認した。固定表 `Akari-zero-base-visible-audit-plan.md` のSHA256は `27673006b29ec3732fcab19b17c200db7b80146c8b794930a6151f82e7e4c405`、作文原本 `composition-first-drafts.json` は `0c2fe4d8b5f5921325eea053a6f685f3e40cb246e29323940b6cec59e2fd2479`。I07〜I12は無改変抽出して `composition-acceptance.json` に固定し、I10 extraも必須とする。`docs/1.0.2/` の成人作成23作文候補を代わりに使用しない。元可視計画のOS手操作を自動操作PASSへ読み替えず、この対応表と親のUX中心再計画で機械/UXの担当を分ける。
