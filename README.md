# あかり（Akari）

あかりは、子どもが考えた場面を日本語の文で表し、同じ作品をコードとブロックの両方から編集するプログラミング環境です。1.0.2では「ねこは右へ10歩動く」「ねこを右へ10歩動かす」のように、対象・方向・量を文の役割で表す言語設計を採用します。

## できること

- 日本語の文から対象・順序・条件・範囲を表す
- 同じ本文をコードと文として読めるブロックの間で編集する
- 変数・リスト・名前付き引数・手順・値を求める定義を使う
- 数式、単位付き数値、条件、反復、複数対象の動きを組み合わせる。手順・値を求める定義、名前付き引数、局所データ・所属スコープ、再帰も扱う
- 画像・衣装・背景・音・ペン・分身、質問・知らせ、調査機能を扱う
- 作品を保存・復元し、単体HTMLへ書き出す。オフライン利用と資源上限も仕様の対象に含む

## 使い方

製品表示版は **あかり1.0.2** です。現行製品は [`Akari1_0_2.html`](./Akari1_0_2.html)。公開入口の案内に沿って開き、マスコットのクリックから始まる基本サンプルと初期文を確かめます。1.0.2の日本語文法・画面は再設計仕様に基づくもので、児童による使いやすさの実測や実装の受入試験を完了したという意味ではありません。

音声取込み形式は MP3 / WAV（PCM）/ M4A（AAC-LC）/ FLAC / Ogg Opus を仕様対象とします。ファイル単体での動作、保存・復元、ブラウザーごとの対応は、製品監査で確認します。

## ドキュメント

- [`Akari1_0_2.html`](./Akari1_0_2.html) — あかり本体
- [`LANGUAGE.md`](./LANGUAGE.md) — 操作方法・文法・言語仕様
- [`index.html`](./index.html) — 紹介・本体・マニュアルへの公開入口
- [`MANUAL.html`](./MANUAL.html) — はじめかた・保存・開く・書き出し・困ったとき
- [`Manual/`](./Manual/) — [ブロック](./Manual/block-mode.html)・[コード初級](./Manual/code-mode-beginner.html)・[中級](./Manual/code-mode-intermediate.html)・[上級](./Manual/code-mode-advanced.html)
- [`AUDIT.md`](./AUDIT.md) — 検査項目と受入基準の正本
- [`audit/LANGUAGE_FORMS.md`](./audit/LANGUAGE_FORMS.md) — 旧文型コーパスの基準 coverage と、新しい作文文法との対応
- [`LICENSE`](./LICENSE) — ライセンス

言語仕様の正本は `LANGUAGE.md`、監査契約の正本は `AUDIT.md` です。仕様上の `languageContractId`・`runtimeContractId`・`projectFormatVersion`・`programFormatVersion` はそれぞれ2で、製品表示版とは独立しています。自動保存の領域名は `akari-workspace-f2` と `akari.autosave.f2` です。1.0.2の合否、実ブラウザー試験、児童の作文・操作評価は区別して報告します。READMEや仕様上の例は、それだけで実装PASSを示しません。

単体HTMLでオフライン利用できることは製品仕様の対象です。実際の利用条件を確認するときは、監査済みの製品と配布物を参照してください。マニュアルも保存する場合は `MANUAL.html` と `Manual/` を同じ配置で保存します。

## Issueについて

不具合、ドキュメントの誤り、改善提案などはIssueから報告できます。いただいたIssueは確認しますが、すべてへの返信・対応を保証するものではありません。

## Pull Requestについて

このリポジトリへの外部PRは受け付けていません。Apache License 2.0の範囲で、自由にfork・改変・再配布できます。再配布時はライセンス条件に従ってください。

## 開発者

あかり（Akari）は **[SAIEL](https://sites.google.com/shimane-edu.org/saiel/%E3%83%9B%E3%83%BC%E3%83%A0)** が作成・開発しています。

## License

Licensed under the Apache License, Version 2.0. 詳細は [`LICENSE`](./LICENSE) を参照してください。
