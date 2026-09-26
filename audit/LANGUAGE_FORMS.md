# Language surface audit

This audit separates the phase-1 relocation (884 origin IDs) from new language acceptance. One obsolete syntax rejection is explicitly replaced under the 1.0.0 specification; 884 current core IDs remain after the explicit phase-3 version/save replacements. The fixed 0.8 fixture and its embedded comparison route remain mandatory through 1.0.0 completion. `language-form-coverage.json` records actual results from the phase-1 Git blob, not assumptions from a design document. `fixtures/language/forms.mjs` independently enumerates its finite inputs. The runner rejects missing, duplicate or extra case/test IDs.

Phase 3 connects all six previously deferred inline forms to the existing IfStatement and statement AST. The original phase-1 manifest remains historical measurement; phase-3 acceptance is established only by the actual candidate reports. Editing, undo, storage and generated artifacts have separate API and real-GUI tests; parser/formatter equality alone cannot discharge those obligations.

## Inventory and role mapping

The historical phase-1 measurement baseline is `05789beae52221fb8aa259f1de0f778c236afbf9`. The finite manifest contains 256 cases: 36 accepted and 220 rejected there, including six phase-3 cases. A count such as `2/4` below means two baseline acceptances among four measured cases, not two newly implemented forms. Those acceptance counts remain historical observations. Current canonical AST, formatter and runtime comparisons use completed 1.0.2 at `1207f8a44b783afbb2274e794759de4c58edb450`, whose source and SHA-256 are frozen in `fixtures/1.0.2/manifest.json`. The prior 1.0.0 manifest and its historical observations remain preserved in `fixtures/1.0.0/`. No candidate observation updates the goldens. Each candidate is passed unmodified to the actual candidate parser and runtime. Runtime comparisons use controlled logical time, seed and audio/question completion, plus independent expected values and failures.

R/L are syntactic data targets (`parseTargetPrefix`, no lookup); Q/E/X/Y/T/F/A/N use the existing expression parser. `target` means `{name,qualifier}`, preserving exact/self/project. Existing semantic analysis still checks names, readonly bindings, component kinds and function purity. Punctuation is optional; repetition spelling is `くり返す` or `繰り返す` in its fixed terminal position. Strings, exact names and nested expressions are protected before outer markers are recognized.

| JPF | Baseline | Predicate / roles / fixed markers and allowed order | Existing AST and evaluation contract |
|---|---:|---|---|
| 001 | 2/2 | Terminal `。` present/absent; no role change | Same statement and runtime |
| 002 | 4/4 | Repeat terminal spelling only | Same repeat node and runtime |
| 003 | 2/4 | `もし Cなら/ならば、次のことをする` | IfStatement.condition, thenBody/elseBody; condition once per visit |
| 004 | 0/12 | C then `なら/ならば`, optional `もし`; long or short header; omitted-if short family covered by the explicit guarantee transition | Same IfStatement; nonempty indented body required |
| 005 | 0/8 | `もし Cなら/ならば` with zero/one final comma | Same IfStatement; condition then selected body |
| 006 | 0/2 | Inline if; phase 3 | Existing IfStatement with exactly one non-block statement in thenBody; implemented |
| 007 | 2/6 | `そうでなければ` with zero/one comma or long suffix | Existing hasElse/elseBody, same-indent preceding if |
| 008 | 0/2 | Inline else; phase 3 | Existing elseBody with exactly one non-block statement; implemented |
| 009 | 0/8 | E then `回[だけ]` then repeat | RepeatCount.count; evaluate once at entry |
| 010 | 0/4 | E then `回、次のことを` then repeat | Same RepeatCount |
| 011 | 0/4 | `ずっと` then repeat | Forever.body; same scheduler |
| 012 | 4/8 | Condition connective `あいだ/間` | RepeatWhile.condition; before every iteration |
| 013 | 0/24 | `XがY未満`; `未満の/未満である` + while, `未満になる` + until/wait | CompareExpression.LT left=X/right=Y; left then right; existing RepeatWhile/Until/WaitUntil |
| 014 | 0/18 | `XがYを超える/超えている`; while only `超えている`, until/wait `超える` | CompareExpression.GT left=X/right=Y; strict comparison |
| 015 | 0/16 | `XがYと等しい`; while `等しい`, until/wait `等しくなる` | CompareExpression.EQ; no new type conversion |
| 016 | 0/12 | `XがYと異なる/等しくない`; short while only `異なる` | CompareExpression.NEQ; short until not added |
| 017 | 0/2 | `[Rに][Eを]加える` | NumericUpdate.ADD target/value; binding/current value then E then update |
| 018 | 0/4 | `[Rを][E][だけ]増やす`; fixed order | NumericUpdate.ADD; increment, not final value |
| 019 | 0/4 | `[Rを][E][だけ]減らす`; fixed order | NumericUpdate.SUB; current minus E |
| 020 | 2/4 | `[横X、縦Yの位置][へ/に]行く` | MotionCommand.GOTO args=[X,Y]; actor then X then Y |
| 021 | 2/8 | `[T秒で][coordinateの位置へ]滑る/すべる`; includes 039 composition | MotionCommand.GLIDE args=[T,X,Y]; actor then T,X,Y then start/wait |
| 022 | 0/2 | `[Lの末尾に][Eを]追加する` | ListAppend target/value; resolve list/type, E, value/size checks, mutate |
| 023 | 0/2 | `[Lから][N番目を]削除する` | ListDelete target/index; list then N then range then mutate |
| 024 | 0/2 | `[Lのすべての要素を]削除する` | ListClear.target; clear value, retain definition |
| 025 | 0/2 | `[T秒間]待つ` | WaitTime.seconds; T once, logical clock/task wait |
| 026 | 0/2 | `[Eと]尋ねる` | Ask.question; E once, existing question queue/task answer |
| 027 | 0/2 | `[Eと]いう` | Say.value; existing output conversion |
| 028 | 0/4 | `[Lの各要素を][Iとして]` then repeat | ForEach.list/binder/body; snapshot once, readonly item |
| 029 | 0/8 | `でなければ` short/long; inline phase 3 | Existing hasElse/elseBody; preceding same-indent if only |
| 030 | 0/2 | `[Lのすべてを]削除する` | ListClear.target |
| 031 | 0/2 | `[Eと]聞いて待つ` | One Ask.question; no added WaitTime/opcode |
| 032 | 0/4 | `[Rに][Eを]` or `[Eを][Rに]代入する` | Assignment.target/value; E then writeTarget/target checks |
| 033 | 2/8 | `[Rに][Eを]` or reverse; `足す/加える` | NumericUpdate.ADD; canonical binding/current/E order |
| 034 | 2/4 | `[Rから][Eを]` or reverse; `引く` | NumericUpdate.SUB; target is subtraction source |
| 035 | 2/8 | `[Lに/の末尾に][Eを]` or reverse; `追加する` | ListAppend.target/value; explicit destination phrase remains intact |
| 036 | 2/4 | `[LのN番目に][Eを]` or reverse; `挿入する` | ListInsert.target/index/value; list/type, N/integer/range, E, size, mutate |
| 037 | 2/4 | `[Qに][Eを]` or reverse; `入れる` | LooksCommand.SET_INPUT args=[Q,E]; Q then E, existing original-component action |
| 038 | 4/8 | `[Dに][A度]` or reverse; `回る`; D=右/左 | TURN_RIGHT/LEFT args=[A]; actor then A |
| 039 | 0/4 | `[縦Y、横X]` or standard XY; each label once; 行くへ/に; also slide | GOTO [X,Y] / GLIDE [T,X,Y]; expression evaluation never follows surface order |
| 040 | 0/16 | `[coordinateの位置へ][optional one comma][T秒で]滑る/すべる`; XY/YX | GLIDE [T,X,Y]; no 位置に or 秒後に expansion |
| 041 | 4/8 | `[FHzの音を][T秒]` or `[T秒、][FHzの音を]`; each wait terminal | SoundCommand.TONE/TONE_WAIT args=[F,T]; F then T then range/start/wait |
| 042 | 0/4 | `[Yより][Xが]大きい/小さい` versus canonical `[Xが][Yより]` | CompareExpression.GT/LT left=X/right=Y; left then right; logical order unchanged |

The comparison implementation first preserves a successful existing predicate. New comparison frames select a finite terminal and parse original operands with the existing additive parser, emitting existing left/right fields. Normal comparison uses that parser to locate the outer が, preserving the internal が in key/mouse sensors; reverse comparison requires one outer より. No global name delimiter, symbol table, type or current value selects a frame. Old valid names containing `未満`, `と等しい`, `より`, `だけ`, etc. retain their prior meaning. New-frame marker conflicts require explicit `【name】` or parentheses; `だけ` immediately before `増やす/減らす` is the optional fixed marker.

The surface scanner and finite anchored frames neither enumerate token permutations nor rewrite source into another statement. They preserve `Script.source`; the existing formatter still produces the pre-change standard. Phase 3 adds UTF-16 source ranges outside the semantic AST. Phase 4 also maps unchanged operands of inflected conditions and preserves untouched loop bodies when replacing a condition header. The canonical coordinate/header paths are extended at one dispatch point, not kept as a second competing implementation.

## Finite coverage and other capabilities

The fixture enumerates both arithmetic orders × both addition words, append orders × destination forms, rotation orders × both directions, XY/YX × destination particles, slide coordinate order × phrase order × verb × allowed comma location, sound order × wait flag, comparison operators, repetition spelling, condition connectors, and punctuation. Rejected unknown combinations have separate negative IDs. Independent tests cover nonsymmetric values, PRNG assignment, first-error order, readonly foreach items, function purity, unknown names, list boundaries, zero-iteration loops, question ownership through the unchanged core suites, and short circuiting. A syntactic finite matrix is not proof of all possible Japanese sentences.

There are 256 keyed cases and 252 distinct source strings (250 phase-2 cases, 246 distinct phase-2 strings); four intentional overlaps cross JPF groups. Boundary tests perform 90 process-isolated measurements, including missing late delimiters and terminal failures near the 100,000-character limit. Mandatory outer markers are checked before multi-capture matching; repeated particles must not cause a search over candidate splits.

Other existing capabilities are reviewed as follows: appearance, pen, events, clone, single-argument commands, builtin functions, arithmetic/logical operators and positional action/function arguments use their standard sufficient forms; no new arbitrary order is proposed. Bare `聞く`, generic `とき/場合`, particle omission and arbitrary command conjunction are deferred for ambiguity; implicit new targets, delayed glide and inferred repetition are deferred for new semantics. Existing accepted corpus entries remain valid regardless of this classification.

## Execution and proof boundary

```sh
node audit/tests/language-inventory.mjs
node audit/run-language-tests.mjs --node
node audit/run-language-tests.mjs "$AKARI_BROWSER"
node audit/tests/language-boundaries.mjs
```

The inventory command deliberately reads the fixed phase-1 Git blob. The tests execute the current real `Akari.html`; browser tests load its normal file URL in a fresh offline context using the existing host. All tracked and new audit inputs are hashed. Node does not discharge browser obligations. Legacy 884-ID suites, their origin map and immutable fixture stay separate from added language guarantees.

GA-STATIC: finite input/ID sets, fixture provenance, public API, runtime function source, command catalog, schema IDs, limits and versions. GA-EXEC: actual parser, runtime traces, independent expected values, negatives and timed process-isolated malformed inputs. HYBRID/SEMANTIC: role interpretation, legacy intersection, fixed-boundary restrictions and evaluation-contract review. Naturalness/user comprehension has not been measured in a user study.

`language-transition.json` records the old rejection collision, the first formal 1.0.0 specification change and subsequent fixed-comparison correction. Eight omitted-if short-header combinations now have new acceptance IDs. Only `08 indent reject 12` is retired; its source, diagnostic, origin and replacement guarantee are preserved. Core IDs 0–11 and 13 keep their original meanings. The fixed-0.8 capability ledger does not reference the retired rejection; all its 122 capability entries remain required. No other old ID is retired in phase 2.

Historical phase-2 result: phase 2 tested 250 finite parser forms plus 37 negatives, eight evaluation/structure checks and independent expected values (296 PASS results). Six inline forms remain explicitly DEFERRED_PHASE_3, never PASS. Product-version and save consistency work is phase 3; the phase-2 version-invariance observation is not a final restriction on the authorized 1.0.0 version/format changes. Only after 1.0.0 completion may the fixed checkpoint switch from 0.8 to the completed 1.0.0 snapshot, with commit, hashes, capability/test mappings and validation results.

Phase 3 adds 288 inline/short/long branch combinations, 15 malformed combinations and explicit replacement IDs for two formerly negative inline forms. The language runner requires exactly 605 PASS results and zero deferred/blocked cases. The 38 editor tests cover exact role edits, all 256 no-op sources, Unicode/CRLF, batch offsets, inline expansion, moves and atomic refusal. Nine real-GUI tests plus the existing full-browser groups cover the editing/save obligations. See phase3-guarantee-transition.json for retired assertions; historical observations above remain attributed to phase 2. Runtime equality now permits only the explicit release constants and diagnostic source locations; the remaining runtime must equal HA exactly.

Phase 4 strengthens the current editor count to 38 and the real-GUI count to eight. Inflected while/until operands have original source positions, and replacing a condition header leaves an unchanged body intact. Wait-trace comparison excludes only AST `sourceSpan` metadata; every semantic field and execution observation remains compared, while exact positions are asserted separately. No old language/core ID or finite case is removed.
