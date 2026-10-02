# Implementation and acceptance status

The reviewed public specification and acceptance plan are the completion contract.
This table tracks unfinished work as well as implemented behavior. Registration
counts and a successful composition subset do not establish release readiness.

| Requirement | Implemented evidence | Still required |
| --- | --- | --- |
| FIX-001 event selection | Fixed browser identity regression; document unit identity and collision traces | Compound heading edits, Undo/Redo and selection coverage |
| FIX-002 connecting words | Original I07 source and runtime; protected quoted strings | Full original and variant manifest |
| FIX-003 question/concatenation | Original I09 waiting and answer; 36 concatenation variants | Wider name and input variants |
| FIX-004 search focus | Existing first-use/focus gates; added native click/Tab/composition/Escape at 1366/1024/390 | Fixed92bf7a8 native click/Tab/composition/Escape PASS; rerun current head |
| FIX-005 list input | Default line-per-string-item form, retained literal mode, whitespace/empty items and field-local errors | Fixed92bf7a8 native correction/cancel PASS; rerun current head |
| FIX-006 list iteration | Original I08 source, order and clock trace | Snapshot mutation and binder scope cases |
| FIX-007 procedures/return | Original I10 source and runtime, arithmetic variants | Nested natural expressions and full parameter matrix |
| FIX-008 multiple receivers | Original I11, independent event keys and source ranges | Isolated concurrent send groups, receiver failure/stop |
| FIX-009 counted clones | Original I12, atomic invalid-count rejection, existing schema and event-trace gates | Wider full-spec clone/receiver variants |
| FIX-010 event Block edit | Stable script identity and unit identity core checks | All heading-only and body event-change GUI cases |
| FIX-011 continuous quantity edit | Existing unit gates and continuous parser variants | Same-session edits, cancel, run across role orders |
| FIX-012 declared data units | Declared numeric initial values receive the declared unit; mismatches reject atomically | Fixed92bf7a8 native declared-point trace PASS; rerun current head |
| FIX-013 referenced assets | Shared semantic reference graph, deletion impact and uncertainty; resource and typed binding renames preserve IDs and other source tokens; 28 core cases | Fixed92bf7a8 native asset protection4 PASS; current actor/data/definition rename adds 13 core and four native cases, current native proof pending |
| FIX-014 intent search | Shared purpose/readings/name index; typed and scoped candidate nodes; 21 core cases and seven native cases | Fixed92bf7a8 seven native cases PASS; custom readings remain explicit rather than inferred |
| FIX-015 Return hole | Palette insertion now produces a hole | Same-head native save/readback evidence |
| FIX-016 multiline strings | Lexer/codec/source core; three viewport native text edits | Draft save and Undo/Redo variants |
| FIX-017 current diagnostics | Existing cancel gates | Full revised lifecycle matrix |
| FIX-018 restored history | Persistent structural deltas, shared history-only assets, 30-frame cursor core checks | Same-head native Undo/Redo and quota-atomicity browser evidence |
| FIX-019 output/monitor | Open output reserves a readable monitor area; native disclosure routes at three widths | Same-head 1366/1024/390 execution and screenshots |
| FIX-020 numeric display | Separate 12-significant-digit presentation; exact raw value details, semantic text conversion unchanged; 21 boundary/core cases | Same-head native bubble/monitor/save/offline browser proof |
| FIX-021 unfinished files | Editor-state version 1, file and autosave integration, ten core cases | Same-head pending-number browser fix, autosave parity and all drafts |
| FIX-022 explanation contrast | Explicit panel text and selection colors in five manuals; native matrix at three widths and two themes | Fixed92bf7a8 all30 manual views PASS: body/heading11.70:1, selection8.87:1; rerun current head |
| FIX-023 natural continuous roles | Name/quote/order/rate variants through parser, session, codec and runtime | Original 20 and 30 units/sec UI journeys |
| UX-01 new work and speech | Empty initial/new work, explicit editable sample, scaled readable bubbles with overlap minimization and exact full text | Fixed92bf7a8 startup/click/remove/Undo and three bubble conditions PASS; font14px, overlap0, full text exact; rerun current head |
| Semantic document contract | Multiple events, revisions, source ranges, persistent IDs | Complete editable definition units, ambiguous identity policy and actor references |
| Full original/variant/negative matrix | Immutable I01-I12 and T13 core; seven original basic GUI journeys; frozen V01-V14 matrix267 with independent logical traces and three codec/format roundtrips; N01-N22/N25 core23 | Current T01 visible hit-target fix needs fixed CI; connect N13/N21-N25 external scope, file and boundary evidence plus capability groups |
| Release evidence | 9d57bbb full CI including aggregate and fixed acceptance PASS; exact release freeze | Current changes need all required same-head gates, complete remaining specification/self-review, then merge and Pages verification |

Editor project files retain the existing project-format 2 design and assets and
add an optional `editorState` record with its own explicit version 1. This record
contains pending source/Block trees, unfinished callable state, selection and
view. Its validator checks structure and limits; it does not require executable
source. Run and executable export retain their separate rejection gates. Assets
remain in the single project asset collection. Autosave record version 2 stores
the same editor state in a versioned history envelope: one base frame, structural
and text deltas, a cursor, and asset bytes shared by digest. Original per-frame
asset IDs remain separate so a reused ID cannot change an older frame's content.
Native browser recovery and quota checks are required before acceptance.

No completed release or human UX acceptance is claimed by this table.

## Search checkpoint 68291d6

Full Actions37050362939 passed every producer and aggregate. Fixed Actions37050362966 passed all prior cases and the 21 search core cases, with five of seven new search browser cases passing. The two failures exposed a hidden value-slot selector in the new test and an inaccessible disabled-candidate reason; the current change reveals the selector through ordinary field focus and always displays the disabled candidate's reason. The correction requires a new same-head fixed run.

## Verified checkpoint 9d57bbb

Full Actions37047035534 passed all producer jobs and aggregate, including all36 selftest gates, UI, session, limits, schemas, extra, static and both audio platforms. Fixed Actions37047035627 passed native composition/save22, recovery4, data forms3, numeric display10 and reference protection4. Independent review confirmed the repaired pending-view/history behavior. These results prove the listed implemented subset, not completion of every requirement above.

## UX checkpoint 92bf7a8

Fixed Actions37052239782 passed all mandatory reports, including seven search browser cases, ten UX cases and 77 validator rejection controls. Full Actions37052239667 exposed two obsolete implicit-sample assumptions in ownership and readable review. Their current migration retains all prior assertions and stable IDs, verifies empty new work, and explicitly opens the sample. Component/data/callable renames are the next additive change and require new same-head browser evidence.

## Original basic intentions

T01-T06 sources were extracted from the approved public specification and independently hash-compared with the original I01-I06 drafts: all six are byte-identical. The new frozen basic-intents fixture also contains the separate20-step/second T13 source. Seven actual parser/codec/runtime cases pass locally, including fixed logical-time traces, two clicks, held/released keys, visibility delay, actor order and four20-step pen edges. Their added native original-input journey remains pending.

At9c5ad44 the fixed rename extension passed component/data GUI rename, Undo, runtime and save. Callable rename/Undo worked but the test attempted the covered toolbar Redo after Undo restored the callable modal; the test now uses its normal Control+Y route. Full session identified an obsolete dangling-callee expectation after rename; the revised stable-ID test preserves arity/argument and explicit unknown-callee guarantees under SEM-09.

## Finite semantics checkpoint

Full Actions37055389465 at63e15f7 passed every producer and aggregate, including all36 selftest steps. The old sample-setup and callable rename audit migrations are verified. Fixed Actions37055389402 passed every prior mandatory report, including all8 reference/rename browser cases, and six of seven original basic browser journeys. T01's second click hit the overlapping star at the default center; the updated test checks the visible left portion's actual hit target before its ordinary mouse click. It retains the frozen original source, positions, two clicks and exact speech expectation.

The finite variant fixture contains267 cases inV01-V14. Inputs and expected traces were authored independently of product execution. Fixture construction was checked for valid resource identities and explicit quoting; prototype invalid duplicate costume IDs, unescaped nested quotes and unquoted reserved names were corrected before publication, without changing expected effects. The source contains the original clone heading form. Signed rate variants are additive. This new artificial fixture does not replace or modify any original composition.

The matrix exposed one product role-order gap: distance followed by duration then direction was interpreted as a single time expression. Duration now binds independently, with original capture offsets retained. N03 checks a Block edit changes only the time token and preserves the rest of that sentence and its comment. Missing, duplicate and unknown named arguments now identify the specific names while preserving existing refusal codes and source. Local267 variant cases,23 minimum-pair/core refusal cases and810 product checks pass. The fixed validator rejects100 synthetic corruptions; none of those synthetic records is product evidence.

N23 remains tied to the existing full limit families, andN24 to the actual invalid-file/unsaved-work browser gate. N13 scope ambiguity, N21 draft GUI persistence, N22 concurrent notification groups/callable scope, andN25 actual semantic-draft download/readback retain their separate full/fixed browser obligations. The new model suite alone does not establish those UI results or human UX acceptance.

## Actual audio output checkpoint

At944c1d2 the fixed run passed all267 finite variants and23 minimum-pair cases; T01 native clicking passed. T03 exposed an observation race: key release precedes its queued final DOM render. The native test now waits two animation frames before requiring an unchanged position for300ms. The original rate, distance, release and source assertions remain.

The eight fixed sound commands now have an additional mandatory WebAudio output probe. It forwards each original destination connection unchanged, records rendered PCM from a parallel zero-output branch, and retains WAV files. Frequency, amplitude ratio, duration, silent tail, actual ended events and visible speech timing are checked independently. This is browser output-graph evidence, not decoder-only evidence, OS loopback or human listening. Bell and long fixtures are deterministic0.4s/440Hz and1s/660Hz PCM. Current-head fixed CI is required; no PC audio software is introduced.

Atbc9d214 all seven basic native intentions pass, including the T03 release/render observation repair. The new audio probe timed out waiting for sprite speech because file loading selects the stage and the harness had not selected the actor before entering the unqualified sound/speech source. It now selects the fixture actor through the visible control and asserts its stable owner. Failures retain console, voice and screenshot diagnostics.

FIX-010/011 receive nine focused native cases: empty, headed and body-only scripts change to key/message via Block controls, preserving ID/body and Undo/Redo; continuous condition/time/distance are edited in three orders, with cancellation, exact units, history and physical-key runtime checks. The key changes to left while the original world direction remains right, so this check also rejects accidental coupling of input key and motion direction. These are existing required regressions, not a new acceptance scope.

## Resumed failure classification

Atc02ab6a both full audit runs passed, and the fixed run passed20 of22 reports. All seven original basic native cases passed. The pending follow-up preserves native key event times and DOM positions immediately after release, after two animation frames and after300ms before evaluating assertions. Original inputs and the existing speed/stop tolerances are unchanged.

The fixed audio run produced all eight output recordings. Whole-window crossing counts were biased by a few nonperiodic crossings; individual periods overwhelmingly matched the specified frequencies. The meter now uses the median individual period, retains the old whole-window estimate and adds an interquartile stability check. The existing2Hz expected-frequency tolerance and all duration, amplitude, wait/stop, WAV/hash requirements remain. Independent artificial signals at both sample rates exercise fixed pitch with phase discontinuities; silence and unstable pitch are rejected.

The headed-script Undo failure was a product selection/history defect: file import recorded the stage selection, and object navigation did not refresh that frame. Navigation now refreshes the current history snapshot without adding a content change, so the next atomic edit undoes to the selected owner. The three continuous-rule cancellations were harness selector errors: the visible Block toolbar cancel is now used, preserving the unchanged-design, diagnostics and history assertions. Same-head native reruns remain mandatory.
