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

## 独立レビュー指摘の回帰

既存30 stepの後ろに、主語の保持、日本語・文字列、単位と診断、初回操作、可読性の5群と証跡validatorの拒否検査を追加し、local gateは36 stepです。新しい14件の安定IDは `lib/review-regression-contract.mjs` に固定します。各群は実ブラウザーの版、製品と監査入力のsnapshot、全IDの実測証拠、ページエラーと外部通信の不在を要求します。既存ケースの代替にはしません。

集約時はダウンロードされた証跡内の製品コピーを読み、実行元で記録したSHAと当該checkoutのSHAを照合します。実行元の絶対パスとfile URLは来歴として保持します。元のディレクトリがなくても検証でき、コピーの改変・欠落・記録URLの不一致は拒否検査で確認します。

## 監査台帳の保存

追加と容量レビューの規則は [AUDIT.md「監査データの追加と保存」](../AUDIT.md#監査データの追加と保存)、3台帳の形式・旧ハッシュ・凍結・初回同値検証は [移行記録](LEDGER_MIGRATION.md) を参照します。台帳の解析には `lib/audit-ledger-contract.mjs` の専用 reader を使用します。公開 snapshot の実ファイル hash は従来の読取りを維持します。


## 現行候補の監査基準と歴史的移行証拠

1.1.2では、過去の移行直後のバイト列を現行ファイルへ要求しない。`audit/manifests/current-audit-basis.json` は、レビューした現行対象一覧・全バイトSHA-256・サイズ・更新理由を固定する。`audit/lib/current-audit-basis.cjs` はその固定manifestと既存release freezeから現物を直接検査し、検査中に期待値を生成・更新しない。release freezeは基準validator自身を含む全公開ファイルを保護する。

基準更新は明示承認と差分レビュー後にだけ `node audit/record-current-basis.mjs --record --reason "承認された更新理由"` で行い、続いて `node audit/freeze-release.mjs --record` を実行する。通常gateと更新コマンドを分離する。記録成功はbyte整合の準備であり、製品実行・全件性・negative・児童理解のPASSではない。

旧commit/source pins/原本/移行hunk/過去のpending・NOT_RUN・合否は書き換えない。旧scope・MIT移行・reader移行の記録は歴史的証拠として検証する。通常gateは現行SHAを直接検査し、現行差分を逆変換する処理を使わない。2,277 IDの追跡・意味・独立oracle・assertion・素材上限・外部形式2・MIT本文/著作権・実動作・証拠snapshot・全件性は従来の検査を維持する。

`audit/tests/audit-ledgers.mjs --check-freeze` は現行基準の検査である。`--compare-start` は固定Git履歴2997cacから旧移行時点の入力を取り出す歴史検証で、現行ファイルへ旧hunkを適用しない。履歴Gitオブジェクトがなければその歴史検証は実施できない。移行名を持つ既存検査IDは追跡用に維持し、現行byte保護と保存原本/意味の確認に役割を分ける。児童向けの旧rollback負例も現行承認bytesへの無承認変更を拒否する。旧記録の合否を今回のPASSへ昇格させない。
