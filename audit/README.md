# あかり1.0.1の監査

契約は [AUDIT.md](../AUDIT.md)、機能固定は `manifests/features.json`、公開ファイル固定は `manifests/release-1.0.1.json` です。

## 実行

Node.js 24、Python 3、Playwright、@babel/parser 7.28.4、Chromium系ブラウザー、Pillow、ffmpegを用意します。`AKARI_BROWSER` にブラウザーの実行ファイルを指定します。音声試験の固定環境は `lib/feature-contract.mjs` を参照します。

```sh
node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/local
node audit/browser/run-full-browser-audit.mjs --group all --evidence audit-evidence/browser
```

static gateで機能由来の命名と製品版参照の用途をASTで検査し、拒否fixtureも実行します。local gateには作成元ラベルに依存しない形式互換の9件と、`audit/tests/ui-buttons.mjs`のUIボタン整合性9件を含めます。実ブラウザーで保存・復元・生成HTMLに加え、一覧への往復、2段階の表示設定、かんたんの履歴、部品操作、未確定入力、追加先の取消、途中挿入と狭い画面での到達性を確認します。安定IDと期待値は[AUDIT.md「UIとボタンの整合性」](../AUDIT.md#uiとボタンの整合性)に対応します。GA-EXECで実行し、HYBRIDでもコード／ブロックと動作・計算の操作を確認します。

必須の結果集合を独立したvalidatorで検証します。省略・重複・例外・timeout・環境不足をPASSにしません。公開ファイルを変更したら固定記録を更新し、その入力に対して再検証します。固定記録の作成は監査合格を意味しません。

```sh
node audit/freeze-release.mjs --record
node audit/freeze-release.mjs
```

現行製品pathと製品版は `public-files.json` の `productFile` / `productVersion` から `lib/product-path.cjs` を通じて取得します。版更新は製品HTMLとrelease freezeを入れ替え、公開対象・リンクも同時に更新します。ブロック入力欄の全文表示は `tests/block-field-width.mjs` で実ブラウザー検査し、selftestとLinux / Windowsの必須証拠へ含めます。


## 日本語改訂の追加gate

`run-local-gate.mjs` は既存25 stepに、六文書と独立baselineの静的契約、言語移行の意味保持、実browserの意図89 check、Nodeと実browserの実行境界20 check、新validator拒否検査を加えた30 stepを実行します。固定環境と当該製品snapshotの全結果が必要です。静的fixtureの `pending` / `NOT_RUN` は実行結果へ書き換えません。

```sh
node audit/tests/contract-gate.mjs static audit-evidence/new-contract.json
node audit/tests/contract-gate.mjs migration audit-evidence/new-migration.json
node audit/tests/japanese-intent-browser.mjs "$AKARI_BROWSER" audit-evidence/new-intent.json
node audit/tests/runtime-boundary-gate.mjs "$(node -p 'require("./audit/lib/product-path.cjs").currentProductFile()')" "$AKARI_BROWSER" audit-evidence/new-runtime audit-evidence/new-runtime.json
node audit/tests/japanese-gate-negative.mjs audit-evidence/new-validator-negative.json
```

各出力先は未使用pathにします。意図の絞込み診断は常に `INCOMPLETE` であり、必須89 checkの代わりにしません。原文の保持と構造化された意味の実行を分けて記録します。成人が作成した20作文の仮説は、実児童の観察実績を意味しません。

GitHub Actionsは同一repositoryのbranch push / PRでstatic・selftest・既存full-browser・既存音声matrixを実行し、aggregateが最新checkoutの製品/監査入力hashとrun / attemptを照合します。新reportの集合・SHA・primitive実行証拠・child runner結果は `lib/japanese-gate-contract.mjs` で再検査します。古いPASS・欠落・重複・例外・timeout・未検証の結果は受理しません。

実行境界の20必須試験とは別に、headless環境のネイティブタブ可視性観測は `UNVERIFIED` のまま記録します。補助観測を必須試験のPASSとして数えません。
