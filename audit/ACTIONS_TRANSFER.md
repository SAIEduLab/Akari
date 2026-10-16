# Actionsと機能保証

正規の実行先はpublicのAkari audit / Akari fixed acceptanceです。製品・試験入力は共通inventoryのdigest、commit、環境、run/attemptへ束縛します。正常時はsummaryを読み、失敗時はsuite/IDとログ・artifactを参照します。

登録は lib/gate-contract.mjs、各結果の独立検証は lib/verify-gate-results.mjs、lib/evidence-bundle.mjs、lib/child-ux-evidence.mjsです。selftestに静的契約、Node/browser、拡張保証、入門の実操作と拒否検査をまとめます。full-browserのsession/ui/limits/schemas/extra、Linux/Windows音声、Windows入力欄を別条件として実行し、Linux入力欄はselftest結果を使います。同じproducerを複数ジョブで起動しません。

compositionは原作文受入、独立値・意味・対象・順序、保存と往復を検査します。editingは挿入、発話、部品、診断、可視言語支援を検査します。欠落・重複・失敗・例外・timeout・別入力・run/attempt混在・改変artifactを拒否します。pushとPR merge refは各対象を検査します。

命令・schema・能力・上限の独立oracleは fixtures/capability-oracle.json、現在の意味と試験対応は manifests/capability-traceability.json、Q値は fixtures/fixed-values.mjsです。登録の一致は実行成功ではありません。受入成功、拒否時の作品保護、人のUX判断を区別します。Nodeは実pointer/key・IME・download・音声の代替ではありません。児童理解・実IME・Scratch比較は未観測のまま機械PASSへ含めません。
