# 創作中の復帰とブロック操作

現行の製品は public-files.json から取得する。固定24課題と独立期待は [児童目線監査](CHILD_UX.md) と [UX契約](UX_CONTRACT.md) を参照する。試験結果を製品hash、共通入力digest、commit、環境、run/attemptへ結び付ける。

## 操作と作品保護

| ID | 現在守る挙動 | 試験の対応 |
|---|---|---|
| R01 | 所属一致を事前検査。画面復元成功まで元作品・素材・下書き・履歴・Redo・保存状態・自動保存を保持し、復元例外でも元へ戻す。同じできごとの複数本文は受け入れる | `draft/selection-belongs-to-target-and-event`、`OPEN-APPROVED-CORRUPT-RETAINED` |
| R02 | 全対象の区間加算と次位置を変更前に検査。R403で一時停止し、失敗した本文を示し、停止して編集へ戻れる。有限数の受入れと既存上限を狭めない | `limit:continuous-number-overflow`。上下左右、停止境界、通常30歩/秒、code/blocksのGUI |
| R03 | 検索と独立した文字dialogではブラウザーの文字Undo/Redo。作品editorでは作品履歴。検索・取消で作品sourceを変えない | `RELEASE-GUI/source-selection-history-focus` |
| R04 | 選択だけでは履歴数を増やさず、編集後のUndo/Redoは選んだ本文・手順・答えに戻る | `RELEASE-GUI/source-selection-history-focus`、`RELEASE-GUI/unregistered-draft-autosave-registration` |
| R05 | 760/390/320pxで「道具箱」1クリックにより有効入力を1回確定し再表示。変換中・無効入力を保護し、通常の開閉も維持 | `UI-BUTTON-RESPONSIVE` |
| R06 | 文の入口を「ならべかえ」と表示。式の「…」は維持。候補補足をpreviewの下へ折り返す。移動・複製・削除等の既存操作も残す | `REVIEW-DEFAULTS-FIRST-RUN`。1188/390/320pxで「ならべかえ」→「上へ」、2クリック・drag0回、1履歴、Undo/Redo |
| R07 | 見えているeditor／本文一覧へfocus。「閉じる」後は本文確認、書き直しには「止める」と案内。継続条件とR403を平易に表示し、詳細診断も保持 | `running-paused-lock-switch`、`debug-function-owner`、overflowのGUI |
| R08 | 保存時の作品・editor内容と比較。保存済み未変更のコード・数値欄・定義下書きは警告なし。保存後に変更した新規作成／読込みの取消は保持 | `OPEN-RECOVERY-SAVED-DRAFT-CLEAN` |

各IDは操作・意味の参照であり、過去の差分や工程を保存する義務ではない。命令・schema・能力・上限の現在の集合はmanifest/contractで検査する。作品保護と、廃止した旧保存形式の互換要求を区別する。

## 表示と編集の検査

- 目的検索、候補の意味、型・単位・所属、挿入先、取消と履歴を直接検査する。
- B03の局所2クリック経路とB06の移動経路を別に確認し、文・囲い・順序を保持する。操作経路の成立を児童の範囲理解へ一般化しない。
- 検索／全文の文字Undoと、code/blocksの作品Undoを区別し、今編集している本文・定義へ戻る。
- B07〜B12/B23の対象・きっかけ・元本文・復帰を確認する。B13〜B21の枝・式・左右値・list・時刻を独立期待へ照合する。
- 実行・pause・停止・本文確認、破損import、復元例外、overflow、保存済み下書き、取消、素材・履歴・自動保存の保護を確認する。
- basic-intents-browser と structured-editing-browser はRUNNINGを待って実入力する。T06は初回描画後に既存の座標と描画量を検査する。7件／9件のID、原文、座標・描画量・発話・速度、8秒制限とassertionを維持する。
- 児童向け用語案内は、初期折り畳みに従い「探す・作るをひらく」を通常クリックしてkeyboard-helpへ進む。
- 出力と詳細は通常wheelとクリックで到達し、保存・読込み4診断×2表示×3高さで作品保護を検査する。閉じたblocksの折り畳みを保ち、Tabの自動スクロールだけをwheelの代わりにしない。

## 検証と受入れ

必要集合はgate-contract、full-browserの5群、書出し／読込み31 IDと負例、composition／editingの現在の集合とvalidatorを正本とする。入力変化、別snapshot、未実行、環境阻害、欠落、timeout、失敗をPASSにしない。

Windows/Linux、実OS IME/合成composition、機械GUI/人の評価を区別する。自動操作の成功から初見の発見性・児童の理解・Scratchとの優位性を主張しない。独立した最終受入は別に行う。
