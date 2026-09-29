# あかり1.0.0の監査

契約は [AUDIT.md](../AUDIT.md)、機能固定は `manifests/features.json`、公開ファイル固定は `manifests/release-1.0.0.json` です。

## 実行

Node.js 24、Python 3、Playwright、@babel/parser 7.28.4、Chromium系ブラウザー、Pillow、ffmpegを用意します。`AKARI_BROWSER` にブラウザーの実行ファイルを指定します。音声試験の固定環境は `lib/feature-contract.mjs` を参照します。

```sh
node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/local
node audit/browser/run-full-browser-audit.mjs --group all --evidence audit-evidence/browser
```

static gateで機能由来の命名と製品版参照の用途をASTで検査し、拒否fixtureも実行します。local gateには作成元ラベルに依存しない形式互換の9件を含め、実ブラウザーで保存・復元・生成HTMLを確認します。

必須の結果集合を独立したvalidatorで検証します。省略・重複・例外・timeout・環境不足をPASSにしません。公開ファイルを変更したら固定記録を更新し、その入力に対して再検証します。固定記録の作成は監査合格を意味しません。

```sh
node audit/freeze-release.mjs --record
node audit/freeze-release.mjs
```
