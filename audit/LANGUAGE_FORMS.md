# あかり1.0.1の文法表面監査

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

文字列、明示名、入れ子、同じ助詞を含む名前を保持します。式の評価順、乱数、最初のエラー、読み取り専用の反復要素、計算の純粋性、未知の名前、リスト境界、ゼロ回反復、質問の所有者、短絡評価を検査します。

標準ASTは `manifests/language-form-coverage.json`、実行期待値・95件の標準文・153スキーマは `fixtures/language/expected.json` に固定します。実行結果から期待値を生成し直しません。欠落・重複・未完了・別snapshotの結果をvalidatorが拒否します。

38件の編集試験と9件のGUI試験は、256件の無編集往復、空白、Unicode、CRLF、コメント、式の役割、インライン分岐、原子的編集、Undo/Redo、保存・復元・実行HTMLを扱います。構文受理だけで編集と実行の保証を代用しません。

境界試験は45個の独立プロセスで、100,000文字に近い遅い失敗と長大な有効本文を検査します。各プロセスのtimeoutは5秒です。命令、スキーマ、上限、版は機能固定と照合します。

```sh
node audit/run-language-tests.mjs --node
node audit/run-language-tests.mjs "$AKARI_BROWSER"
node audit/tests/language-boundaries.mjs
```

GA-STATICは有限入力とID集合、標準AST、カタログ、上限、版。GA-EXECは実製品の構文・実行・GUI・境界検査。SEMANTICは役割解釈と評価規則の一致です。Node実行でブラウザーの義務を満たした扱いにはしません。
