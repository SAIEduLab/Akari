# あかり1.0.1の文法表面監査

> このファイルのJPF-001〜042、256入力例、605件という数は、1.0.1で追跡した旧文型コーパスの基準coverageです。1.0.2の自然文法を構成する文型数でも、1.0.2 parser/runtimeの合格証拠でもありません。旧行は全能力の由来・基準比較を保つために残し、新しい標準文型は以下の新設計対応表と1.0.2仕様書付録A/Bを参照してください。1.0.2の対応試験は未実施です。

256件の有限な入力例、独立した標準ASTと実行期待値を固定し、合計605件の試験を実行します。sourceを標準文へ書き換えてから試験することは禁止です。日本語の語順と、命令の引数を評価する順序を分けて検証します。

R/L はデータの対象、Q/E/X/Y/T/F/A/N は式です。引用文字列、明示名、入れ子を保護して外側の助詞・終端を認識します。句点は省略できます。「くり返す」「繰り返す」は固定された終端で扱います。

| JPF | ケース数 | 文法と役割 | ASTと評価契約 |
|---|---|---|---|
| 001 | 2 | Terminal `。` present/absent; no role change | Same statement and runtime |
| 002 | 4 | Repeat terminal spelling only | Same repeat node and runtime |
| 003 | 4 | `もし Cなら/ならば、次のことをする` | IfStatement.condition, thenBody/elseBody; condition once per visit |
| 004 | 12 | C then `なら/ならば`, optional `もし`; long or short header | Same IfStatement; nonempty indented body required |
| 005 | 8 | `もし Cなら/ならば` with zero/one final comma | Same IfStatement; condition then selected body |
| 006 | 2 | Inline if | Existing IfStatement with exactly one non-block statement in thenBody |
| 007 | 6 | `そうでなければ` with zero/one comma or long suffix | Existing hasElse/elseBody, same-indent preceding if |
| 008 | 2 | Inline else | Existing elseBody with exactly one non-block statement |
| 009 | 8 | E then `回[だけ]` then repeat | RepeatCount.count; evaluate once at entry |
| 010 | 4 | E then `回、次のことを` then repeat | Same RepeatCount |
| 011 | 4 | `ずっと` then repeat | Forever.body; same scheduler |
| 012 | 8 | Condition connective `あいだ/間` | RepeatWhile.condition; before every iteration |
| 013 | 24 | `XがY未満`; `未満の/未満である` + while, `未満になる` + until/wait | CompareExpression.LT left=X/right=Y; left then right; existing RepeatWhile/Until/WaitUntil |
| 014 | 18 | `XがYを超える/超えている`; while only `超えている`, until/wait `超える` | CompareExpression.GT left=X/right=Y; strict comparison |
| 015 | 16 | `XがYと等しい`; while `等しい`, until/wait `等しくなる` | CompareExpression.EQ; no new type conversion |
| 016 | 12 | `XがYと異なる/等しくない`; short while only `異なる` | CompareExpression.NEQ; short until not added |
| 017 | 2 | `[Rに][Eを]加える` | NumericUpdate.ADD target/value; binding/current value then E then update |
| 018 | 4 | `[Rを][E][だけ]増やす`; fixed order | NumericUpdate.ADD; increment, not final value |
| 019 | 4 | `[Rを][E][だけ]減らす`; fixed order | NumericUpdate.SUB; current minus E |
| 020 | 4 | `[横X、縦Yの位置][へ/に]行く` | MotionCommand.GOTO args=[X,Y]; actor then X then Y |
| 021 | 8 | `[T秒で][coordinateの位置へ]滑る/すべる`; includes 039 composition | MotionCommand.GLIDE args=[T,X,Y]; actor then T,X,Y then start/wait |
| 022 | 2 | `[Lの末尾に][Eを]追加する` | ListAppend target/value; resolve list/type, E, value/size checks, mutate |
| 023 | 2 | `[Lから][N番目を]削除する` | ListDelete target/index; list then N then range then mutate |
| 024 | 2 | `[Lのすべての要素を]削除する` | ListClear.target; clear value, retain definition |
| 025 | 2 | `[T秒間]待つ` | WaitTime.seconds; T once, logical clock/task wait |
| 026 | 2 | `[Eと]尋ねる` | Ask.question; E once, existing question queue/task answer |
| 027 | 2 | `[Eと]いう` | Say.value; existing output conversion |
| 028 | 4 | `[Lの各要素を][Iとして]` then repeat | ForEach.list/binder/body; snapshot once, readonly item |
| 029 | 8 | `でなければ` short/long; inline | Existing hasElse/elseBody; preceding same-indent if only |
| 030 | 2 | `[Lのすべてを]削除する` | ListClear.target |
| 031 | 2 | `[Eと]聞いて待つ` | One Ask.question; no added WaitTime/opcode |
| 032 | 4 | `[Rに][Eを]` or `[Eを][Rに]代入する` | Assignment.target/value; E then writeTarget/target checks |
| 033 | 8 | `[Rに][Eを]` or reverse; `足す/加える` | NumericUpdate.ADD; canonical binding/current/E order |
| 034 | 4 | `[Rから][Eを]` or reverse; `引く` | NumericUpdate.SUB; target is subtraction source |
| 035 | 8 | `[Lに/の末尾に][Eを]` or reverse; `追加する` | ListAppend.target/value; explicit destination phrase remains intact |
| 036 | 4 | `[LのN番目に][Eを]` or reverse; `挿入する` | ListInsert.target/index/value; list/type, N/integer/range, E, size, mutate |
| 037 | 4 | `[Qに][Eを]` or reverse; `入れる` | LooksCommand.SET_INPUT args=[Q,E]; Q then E, existing original-component action |
| 038 | 8 | `[Dに][A度]` or reverse; `回る`; D=右/左 | TURN_RIGHT/LEFT args=[A]; actor then A |
| 039 | 4 | `[縦Y、横X]` or standard XY; each label once; 行くへ/に; also slide | GOTO [X,Y] / GLIDE [T,X,Y]; expression evaluation never follows surface order |
| 040 | 16 | `[coordinateの位置へ][optional one comma][T秒で]滑る/すべる`; XY/YX | GLIDE [T,X,Y]; no 位置に or 秒後に expansion |
| 041 | 8 | `[FHzの音を][T秒]` or `[T秒、][FHzの音を]`; each wait terminal | SoundCommand.TONE/TONE_WAIT args=[F,T]; F then T then range/start/wait |
| 042 | 4 | `[Yより][Xが]大きい/小さい` versus canonical `[Xが][Yより]` | CompareExpression.GT/LT left=X/right=Y; left then right; logical order unchanged |

## 保証

文字列、明示名、入れ子、同じ助詞を含む名前を保持します。式の評価順、乱数、最初のエラー、読み取り専用の反復要素、旧基準の関数副作用制約、未知の名前、リスト境界、ゼロ回反復、質問の所有者、短絡評価を検査します。

標準ASTは `manifests/language-form-coverage.json`、実行期待値・95件の標準文・153スキーマは `fixtures/language/expected.json` に固定します。実行結果から期待値を生成し直しません。欠落・重複・未完了・別snapshotの結果をvalidatorが拒否します。

38件の編集試験と9件のGUI試験は、256件の無編集往復、空白、Unicode、CRLF、コメント、式の役割、インライン分岐、原子的編集、Undo/Redo、保存・復元・実行HTMLを扱います。構文受理だけで編集と実行の保証を代用しません。

境界試験は45個の独立プロセスで、100,000文字に近い遅い失敗と長大な有効本文を検査します。各プロセスのtimeoutは5秒です。命令、スキーマ、上限、版は機能固定と照合します。

```sh
node audit/run-language-tests.mjs --node
node audit/run-language-tests.mjs "$AKARI_BROWSER"
node audit/tests/language-boundaries.mjs
```

GA-STATICは有限入力とID集合、標準AST、カタログ、上限、版。GA-EXECは実製品の構文・実行・GUI・境界検査。SEMANTICは役割解釈と評価規則の一致です。Node実行でブラウザーの義務を満たした扱いにはしません。


## 1.0.2 自然文法の対応確認（試験前）

以下は新しい文型設計の公開文書用索引です。例は `audit/manifests/capability-traceability.json` の歴史的付録A/Bと同じ標準形を使います。採用する現在の文型は `LANGUAGE.md`、旧表と現在の対応は同台帳を参照します。全ての代替語順・活用・対象範囲・ブロック往復・実行トレースが実装済みとは示しません。各対応欄は未実施です。

| 文の役割 | 1.0.2標準例 | 仕様上の意味 | 状態 |
|---|---|---|---|
| 対象・方向・数量 | ねこは右へ10歩動く。 | 画面の右へ移動し、向きは変えない | 未実施 |
| 自他・対象 | ねこを右へ10歩動かす。 | 目的語で移動対象を明示 | 未実施 |
| 向きと移動の連接 | ねこは右を向いて、10歩進む。 | 向き変更後に前進する二命令 | 未実施 |
| 継続状態 | 「右」キーを押しているあいだ、ねこは右へ1秒に20歩の速さで動き続ける。 | 押下中の速度移動。解放時に止まる | 未実施 |
| 述語条件 | もし点数が10点以上なら、 | 条件を到達時に調べ、真側へ進む | 未実施 |
| 値の表示 | 点数の値を言う。 | 名前の値を発言する。台詞の引用とは区別 | 未実施 |
| 真偽値表示 | 条件の答え（あてはまる） | Boolean値の標準表示。条件式そのものではない | 未実施 |
| て形の順序 | ねこは姿をかくして、1秒待って、姿を見せる。 | 各節を公平に順次実行 | 未実施 |
| 待つ音 | 音「ベル」を鳴らす。 | その音の終了まで待つ | 未実施 |
| 待たない音 | 音「ベル」を鳴らし始める。 | 再生開始後すぐ次へ進む | 未実施 |
| 検索意図 | 「右に行きたい」→候補検索 | 検索語は実行文とは別 | 未実施 |

## 実装前レビュー上の制約

新文法の例・反例・役割・AST・コード/ブロック対応・固定トレースを正本へそろえてから実装試験を追加します。この文書の旧表にある許容形を、すべて新文法の標準形や無条件のaliasだと読み替えません。旧機能の意味・能力対応は維持対象として追跡し、表層の受理範囲は1.0.2仕様書の閉じた文型表に従います。


## 質問・加算・省略主語・明示リストの追加形

| 形 | 意味と守る境界 | 独立期待値 |
|---|---|---|
| 内容とたずねる／たずねます | Ask。回答待ち、取消、再実行の回答所有権を保持 | `ux-repair02-expectations.json` のB13両分岐・短い質問・助詞を含む引用 |
| AとBを足した答え | AにBを足した答えと同じ加算。加算以外や数値変換へ拡張しない | 9+2=11、1+7=8、名前付き加算、4−1=3、型不正の拒否 |
| 始めると、データ操作 | 自分の開始見出し。代入先の名前は点数のまま | B19の0→2と再実行2、B20のクリック1→2→3 |
| リスト「名前」／リスト『名前』 | 明示した名前参照。通常の引用文字列とは別 | 局所・作品の同名リスト、引用をリストとして使うR411、未定義S301、範囲外R404 |

上記のsource、Block codec、整形後sourceを同じ実RuntimeModel/EventSchedulerで検査する。元の引用、対象、時刻、待機と左右の値を独立fixtureと照合する。既存42形・256入力・605 IDを置き換えない。

短い質問には別名の話者と複数taskの独立回答を追加検査する。質問の表示主体を変更しても回答は質問を起動したtaskへ戻り、1秒待機後も他taskの回答に入れ替わらない。加算には同単位の正例、異単位R417、左右それぞれの未閉引用P207を含める。
