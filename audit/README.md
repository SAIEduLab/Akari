# あかりの現行監査

保証と受入条件は [AUDIT.md](../AUDIT.md)、製品意味は [LANGUAGE_1_5_1.md](../LANGUAGE_1_5_1.md) を参照する。現行製品pathは public-files.json から取得する。内部運用指示は公開しない。

作業開始と変更受入は [明示指示と変更受入](WORK_AUTHORIZATION.md) に従う。

## 実行の入口

- Node.js 24、固定されたPlaywright / browser、必要なcodec依存を使う。
- 文書の実リンクは `mdast-util-from-markdown@2.0.2` と `parse5@7.3.0` の構文木・ソース位置で検査する。配布準備コマンドもこの監査依存を使うため、既存の監査依存と同じ場所へインストールし、`NODE_PATH` に含める。文章、属性風の文字列、コード例をリンクとして置換しない。
- node audit/run-local-gate.mjs "$AKARI_BROWSER" audit-evidence/local
- node audit/browser/run-full-browser-audit.mjs --group all --evidence audit-evidence/browser
- 公開ActionsのAkari audit / Akari fixed acceptanceで必要なsuiteを実行・集約する。現行の実行集合はgate-contractと各runner/validatorを正本とし、段階数をここへ手で複製しない。

公開CIはWindows上で実行する。固定browserと媒体fixtureを使い、OS・入力・run/attemptの一致を検証する。Windowsの結果をLinuxの実行証拠として扱わない。

監査基盤自体の検査（ファイルの到達性、workflowの契約、変更ガード、文の形の網羅、仕様の例文、仕様の期待値）はgateの必須段で、内容は [AUDIT.md](../AUDIT.md) の「監査基盤の保証」を参照する。PRでは`audit-change-guard`が、検査の削除・固定値の変更・製品版の上げ方を確認し、所有者のラベル`owner-approved-audit-change`がない変更を止める。

通常の正規経路はpublicのActions。privateコピーはpublic-onlyのworkflowやマニュアルを持たないため、同じファイル群があることだけでprivate単独full gateの成立を主張しない。publicからprivateの認証・資料へ依存しない。

## 結果を見る

対象repo・commit・製品hash・実行環境・run/attemptと、必須suiteのPASS/FAIL/未実行をsummaryで確認する。失敗時は該当IDとログ・artifactへ進む。すべてのsource/台帳/全ログを毎回読み直さない。
欠落・例外・timeout・失敗・別入力・偽PASSは合格にしない。静的検査、製品実行、意味審査、人間のUXは区別する。実児童・実IME・実機など未観測のものを機械PASSへ含めない。

## 入力と独立期待値

候補とテスト入力の同一性を検査する。配布固定の更新は実行成功ではない。現在の期待値を候補出力から自動生成して追認しない。
同じ環境の同じproducerは一回の有効結果を共有できる。Node/browserなど目的の異なる検査は残す。最後の修正に必要な結果は最終候補へ結び付ける。

## 保守

今と次だけを扱う。完了済み移行台帳、旧source逆変換、歴史資料や旧workflow行の恒久保持は不要。過去はGit/PRへ、必要な現行期待値は現行fixtureへ置く。
新たな保証が必要なら既存の入口へ統合し、置き換えた旧処理と参照を除去する。歴史資料の保存形式を守るための検査を増やさない。実行証拠はaudit-evidenceとActions artifactへ出し、Gitへ蓄積しない。
