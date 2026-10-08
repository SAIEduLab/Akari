# 監査台帳の保存形式移行記録

開始 main: 79e08a61f2d8e865db75a6d0ea90142548f741ec。作業 branch: codex/akari-audit-dedup-01。開始時の未コミット変更・指定 branch 名の衝突はなし。製品版は 1.1.1 のまま。

## 予定範囲と凍結

予定変更は audit/fixtures/audit-ledger-migration.json の plannedChanges に列挙した監査ファイルだけ。frozenFiles は開始時から不変の370追跡ファイルの具体的な一覧・byte 数・SHA-256。親が許可した related validator とUI監査の3ファイルは authorizedAuditImplementationChanges に対象・旧byte数・旧hash・理由を記録する。初回の373件全不変確認は initialRecord に残し、元の記録全体を旧固定hashへ再構成して検証する。製品 HTML、全 extensions、LANGUAGE、EXTENSIONS、Manual、公開入口、LICENSE、独立 baseline、旧原本、独立期待値・oracle を含む。開始 SHA と Git blob を照合して採録した。凍結対象の再生成・版更新・履歴資料の削除は行わない。

## 保存と保証

完全一致する値だけを commonDefinitions に一度保持し、sha256 を含む固定 ID で参照する。各記録・ID・順序・出典・意味のある重複は document に残す。似た記録の統合や歴史的 pending / NOT_RUN の更新は行わない。辞書の ID は値の JSON バイトから決まる。重複 ID、未知参照、参照欠落、未使用定義、不正型、参照自身の再帰定義を拒否する。

移行前の正本は sources の開始 SHA・path・旧 hash・byte 数。lib/audit-ledger-contract.mjs に同じ旧 hash を固定し、候補内の source 宣言だけでは受け入れない。専用 reader は展開後、元の pretty JSON または最上位配列の行単位 JSON を復元して原本バイトの旧 hash と長さを照合する。docs-consolidation の既存旧 hash も変更しない。公開 snapshot は保存された新ファイルの実 hash を従来通り記録する。復元原本 hash と保存形式 hash を区別する。

初回の全件比較は tests/audit-ledgers.mjs --compare-start で開始 SHA の Git blob を独立に読み、展開結果の項目・型・値・key 順序・配列順序・件数・ID・重複出現位置を比較し、原本バイトも Buffer.equals で比較する。通常の監査はローカル snapshot と固定旧 hash だけで完結し、Git 履歴・ネットワーク・Actions 成果物を必須データ源にしない。変換器は実結果・期待値・oracle を生成しない。

## 実行とレビュー

変更前の freeze-release、static-contract、release-policy-negative、contract-gate static / migration、japanese-gate-negative (86拒否)、finite-semantic-variants (267件) は PASS。basic-intents の初回呼出しは出力引数欠落で実行エラーとなったため PASS に含めない。開始 SHA の独立 archive で正しい引数を付けた再実行は7件 PASS、finite-semantic-variants も267件 PASS。製品不具合として扱わない。

全件・負例は node audit/tests/audit-ledgers.mjs [--compare-start]。案件固有の凍結は --check-freeze を明示する。373ファイル凍結を将来の製品開発へ恒久強制しない。移行記録の固定 hash と独立 source 宣言の一致、台帳・負例は static-contract にも必須統合し、既存 static / local / Actions の入口を継承する。独立の旧 hash との照合により期待値改変・共通本文改変・順序変更・意味のある重複の削減を拒否する。保存用の release 固定記録更新だけではこれらを通せない。

容量は reader が報告する保存ファイル byte 数と復元原本 byte 数を比較する。新しい実装・固定凍結記録の増加を別に含めて差分をレビューする。Git pack / 保存量、実行結果や Actions 成果物の容量削減はこの測定から推定しない。

運用ルールは AUDIT.md「監査データの追加と保存」に統合する。通常 commit・作業 branch への通常 Push と remote SHA 照合で停止する。PR、main 変更、force push、branch 削除、Push 後の Actions 監視は本件の終了範囲外。独立最終監査・実児童評価の完了は主張しない。

## 初回レビューの回帰と承認済み解消

読み取り専用レビューにより、child-ux-contract.mjs が child-ux-scope.json の protectedFiles を動的に読み、今回変更10ファイル（3台帳、reader6ファイル、audit/README）を旧 raw hash と比較する経路が判明した。開始 snapshot の verifyFrozenInputs は369保護ファイルすべて PASS、現在の候補では交差10件 FAIL。この時点の候補は未合格として停止した。既存 scope/oracle/hash は変更していない。

親は child-ux-contract の変更を当初の related validator 範囲として明示承認した。施工側が作った広い凍結一覧と、製品・仕様・独立 oracle のユーザー指定凍結を区別する。後者は解除しない。追加変更は child-ux-contract.mjs、lib/audit-ledger-reader-migration.mjs、fixtures/audit-ledger-reader-migration.json の3箇所（audit/ 配下）であり、予定一覧にも追記した。

3台帳は展開した旧バイトへ照合する。reader変更7ファイルと追加validatorは、開始 Git blob の旧hash、候補全体の after hash とbyte数、固定hunkの前後本文・byte offset・出現回数・適用1回をファイル別に保持する。逆射影は記録した位置だけへ一度適用し、復元後の全バイトを開始hashと照合する。全ファイルの厳密な集合、固定移行記録・adapter自身・変更後validatorのhashも独立の audit-ledger-contract.mjs で固定する。広い文字列除去・汎用正規化・旧scope更新は用いない。

追加98負例は余分なbyte、無関係変更、巻戻し、hunk欠落・重複、未知path、位置・適用回数・本文・出現回数の改変、移行記録・adapter・validatorの改変を拒否する。通常staticでも実行する。初回の独立Git照合以外は公開snapshotだけで検証できる。旧369ファイルの保護と既存原本hash、AUDITの旧append-only本文、既存workflow義務を維持する。

初期候補の freeze、全件同値・45負例、static、contract-gate static/migration、japanese-gate-negative 86拒否、basic-intents7件、finite-semantic-variants267件は PASS。上記の初回回帰はこの結果とは別に記録する。承認済み修正後は最終差分で全件/バイト/45+98負例/凍結/旧369保護/child-ux static と必要な実browser回帰を検証し、合格した差分だけ通常commit・Pushする。最終実行結果は当該snapshotのローカル証拠と完了報告へ対応付ける。Push後のActions監視・PR・main操作へは進まない。独立最終監査や児童理解の完了を主張しない。

## 保存容量と新しい移行記録の必要性

3台帳の実保存byte数は 8,011,401 → 4,634,614（3,376,787削減）。復元原本は開始時の8,011,401 bytesと完全一致する。新たなreader移行記録は台帳本文の再複製ではなく、旧369保護のsource byte保証を継承するための具体差分・位置・hashだけである。必要性は上記P1、参照先は audit-ledger-reader-migration.mjs の厳密な逆射影とstatic負例。継続回帰の結果へ移行根拠を丸ごと複製しない。新コードと固定記録の増加も含めた差分容量を最終報告で別途実測する。Git pack/保存量やActions成果物の削減は推定しない。

## UI監査の観測修正（追加の明示承認）

前段の44段階local gateは43 PASS、ui-buttons 1 FAIL。UI-BUTTON-PENDINGで本文「5を言う。」とhistory+1のassertion通過後、commitボタン非表示の即時観測がFAILとなった。元の結果・入力snapshotはローカル証拠に保持し、後のPASSで書き換えない。開始SHAと候補の単独UI9件は双方PASS。製品・当該試験・host・fixture等7入力は開始Git blobと全バイト一致した。追加の読み取り観測は既存のblur確定・focus保持・次フレーム描画を支持するが、元のassertion失敗は再現しておらず製品不具合の証拠に採用しない。ユーザーは監査側の問題として明示的に修正を指示した。

ui-buttons.mjsは確定後、既存の30000ms page上限内でDOMのhidden状態を待ち、元のsource/history/nonvisibility assertionsを維持する。試験9 ID、360000ms suite予算、準備fixture、期待値は変更しない。固定sleep追加、timeout延長、retry、skip、FAIL削除はない。永続表示は100msの専用負例deadlineでTimeoutErrorを要求し、閉じたpageも拒否する。次フレームでhiddenとなる正例を含む3観測controlを実browserで検査し、ui-buttons-contractは証拠の欠落・誤値・余分なcontrol・負例deadline改変を拒否する。

追加は監査試験・関連validatorの2ファイルで、製品凍結を解除しない。旧UI原本hashを維持し、具体差分をファイル別の固定位置hunkとして逆射影する。370 raw凍結＋3承認済み監査sourceの開始bytes保証を検査し、初回373と前段372の凍結記録、および前段reader記録・adapter・validatorも旧hashへ再構成して検証する。新hashは承認された監査差分の完全性専用であり旧原本hashを更新しない。同じ読み取り専用レビュアーで追加差分を確認し、最終snapshotの関連検査と必要な回帰が合格してから通常commit・Push・remote SHA照合で停止する。
