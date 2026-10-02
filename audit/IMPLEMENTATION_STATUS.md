# Implementation and acceptance status

The reviewed public specification and acceptance plan are the completion contract.
This table tracks unfinished work as well as implemented behavior. Registration
counts and a successful composition subset do not establish release readiness.

| Requirement | Implemented evidence | Still required |
| --- | --- | --- |
| FIX-001 event selection | Fixed browser identity regression; document unit identity and collision traces | Compound heading edits, Undo/Redo and selection coverage |
| FIX-002 connecting words | Original I07 source and runtime; protected quoted strings | Full original and variant manifest |
| FIX-003 question/concatenation | Original I09 waiting and answer; 36 concatenation variants | Wider name and input variants |
| FIX-004 search focus | Existing first-use and focus gates | Required click/Tab/IME/Escape journeys |
| FIX-005 list input | Existing literal validation | One item per line input and local form errors |
| FIX-006 list iteration | Original I08 source, order and clock trace | Snapshot mutation and binder scope cases |
| FIX-007 procedures/return | Original I10 source and runtime, arithmetic variants | Nested natural expressions and full parameter matrix |
| FIX-008 multiple receivers | Original I11, independent event keys and source ranges | Isolated concurrent send groups, receiver failure/stop |
| FIX-009 counted clones | Original I12 and atomic invalid-count rejection | Existing schema and event-trace browser gates |
| FIX-010 event Block edit | Stable script identity and unit identity core checks | All heading-only and body event-change GUI cases |
| FIX-011 continuous quantity edit | Existing unit gates and continuous parser variants | Same-session edits, cancel, run across role orders |
| FIX-012 declared data units | Existing expected-unit validation | Normalize unit-declared initial zero and GUI increment trace |
| FIX-013 referenced assets | Existing current/history asset behavior | Name-reference deletion graph, rename and uncertain drafts |
| FIX-014 intent search | Existing synonyms | All eight required searches with bindings and reasons |
| FIX-015 Return hole | Palette insertion now produces a hole | Same-head native save/readback evidence |
| FIX-016 multiline strings | Lexer/codec/source core; three viewport native text edits | Draft save and Undo/Redo variants |
| FIX-017 current diagnostics | Existing cancel gates | Full revised lifecycle matrix |
| FIX-018 restored history | Memory Undo/Redo retained | Persistent history/deltas/shared assets and quota atomicity |
| FIX-019 output/monitor | Existing readable output gates | Exact three viewport coexistence checks |
| FIX-020 numeric display | Existing numeric semantics | Display-only 12 significant digits with raw detail |
| FIX-021 unfinished files | Editor-state format version 1, structural validator and six core cases | Same-head browser download/readback, autosave parity and all drafts |
| FIX-022 explanation contrast | Existing manual gates | Required text/heading/hover/selection contrast observations |
| FIX-023 natural continuous roles | Name/quote/order/rate variants through parser, session, codec and runtime | Original 20 and 30 units/sec UI journeys |
| UX-01 new work and speech | Existing stage speech gate | Empty new work, explicit sample, clear events and bubble placement |
| Semantic document contract | Multiple events, revisions, source ranges, persistent IDs | Complete editable definition units, ambiguous identity policy and actor references |
| Full original/variant/negative matrix | Immutable I07-I12, Q76 and original definitions; additive variants | I01-I06, full V01-V14 and N01-N25, all capability groups |
| Release evidence | Existing 36 gate workflow, fixed acceptance, exact release freeze | All required gates on one head, complete self-review, then merge and Pages verification |

Editor project files retain the existing project-format 2 design and assets and
add an optional `editorState` record with its own explicit version 1. This record
contains pending source/Block trees, unfinished callable state, selection and
view. Its validator checks structure and limits; it does not require executable
source. Run and executable export retain their separate rejection gates. Assets
remain in the single project asset collection. Autosave history work is pending.

No completed release or human UX acceptance is claimed by this table.
