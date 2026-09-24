# 1.0.0 candidate: semantic and consistency review

This is a source and contract review, not an automatic consequence of test PASS. The reviewed product is `Akari.html`; product/language/runtime versions are 1.0.0 and project/program formats are 3. This record, the inventory, and all implementation inputs are hashed in the final committed candidate's execution snapshot. `phase4-reviewed-inputs.json` additionally fixes normalized UTF-8/LF input hashes. Final local evidence records the actual HEAD; a commit does not contain its own SHA.

The starting public product was `87934d116e8a8117d46e794682cae4f1966452d6`. Phase-1 HA is `05789beae52221fb8aa259f1de0f778c236afbf9`; phase-3 results are historical evidence for their recorded candidate only. None is relabelled as a phase-4 run. The inventory separates source review, local execution, and pending GitHub Actions execution.

## S01 — Snapshot, authority and separation

Reviewed `LANGUAGE.md`, all AUDIT phases and D09 requirements, the 257-row capability ledger, public documentation, origin/quality/language/transition manifests, suite bodies and validators, product changes from HA, host/runner paths, and workflow wiring. LANGUAGE defines user semantics; AUDIT defines acceptance. Historical externalization and phase-2 descriptions are explicitly labelled. Public artifacts contain product/shared audits and public-source provenance, not internal project instructions.

`product-test-host.mjs` reads the actual product and snapshots all tracked files plus new audit inputs. Browser execution opens the normal local file in a fresh offline context and evaluates the external suite afterward. The host rejects page errors/network requests. Node executes the actual script and is labelled supplemental. Externalization static checks keep the original suite body hashes except the approved, enumerated transitions. Generated player checks prohibit audit entry points and globals. No fixture, expected value, ID table, or test dispatcher was added to the product.

## S02 — Finite language and role interpretation

Reviewed `ExpressionParser.predicate/legacyPredicate/surfaceComparison`, `surfaceMask09`, `readSurfaceStatement09`, `readBlockHead08`, `readConditionClause07`, and the complete `fixtures/language/forms.mjs` and LANGUAGE_FORMS role table. JPF-001–042 map to existing nodes and slots. The 256 finite cases, including intentional overlap between JPF groups, are enumerated before execution. The review inventory contains every group's IDs, roles, lowerings and expected canonical forms.

Punctuation and repeat spelling affect fixed terminals only. If headers use the finite optional lead/ending/comma forms. Data aliases require explicit targets and particles; assignment means set, increment/decrement mean update. List destination/index remains one phrase. Coordinate labels must occur once each; XY/YX lower to X,Y. Glide lowers to T,X,Y, sound to F,T, reverse comparison to left=X/right=Y. Omitted roles, `秒後に`, unlabelled coordinates, repeated role markers and unrestricted permutations are not accepted by inference.

Counterexamples reviewed include `点数を10に増やす`, duplicate 横 labels, missing duration/destination, `1を点数に残高に足す`, quoted `を/に/より/秒`, exact names, and nested expressions. Protected spans keep markers inside strings, exact names and brackets out of outer recognition. Existing successful predicates retain precedence; parsing does not consult registered values/types to select a reading. New ambiguous frames require explicit quoting/parentheses. Unchanged appearance, pen, events, clone, builtin and positional call syntax retain their sufficient standard forms; they are not silently removed as obsolete syntax.

## S03 — Existing AST and evaluation contract

Reviewed lowering fields against `EventScheduler.executeNode`, `evalExpression`, target resolution, and the controlled execution observer in `language-forms.js`. The observer records outputs, errors, resolution order, calls, every PRNG result/state, scheduler turns, blocked reasons, variable/list/actor/input state and answer. Its canonical observations come from fixed HA, while independent expected-value assertions check assignment=3, 5+3=8, 5−3=2, nonsymmetric coordinates, list indices and boundary comparisons.

Surface order never becomes runtime evaluation order. Assignment retains RHS then target-write validation; numeric update retains binding/current-value/RHS order; insertion retains list/index/range/value checks; coordinates, glide, audio and comparisons retain their canonical slot order. First-error fixtures deliberately put failing expressions in competing roles. Repeat count is evaluated once; foreach uses a snapshot and readonly binder; Ask remains one queued task-owned question. Short-circuit tests keep an otherwise failing RHS unvisited. The source-range repair changes only parser/editor metadata, with no new opcode, semantic node, schema, API export or runtime evaluation branch.

`completed-runtime-contract.mjs` checks the completed 1.0.0 runtime with only the recorded implementation-name correspondence. `language-boundaries.mjs` also compares API keys, all 153 schema IDs, 74 catalog entries and 38 limits. The A-only `product-diff.mjs` is not used to claim invariance after language/editing changes.

## S04 — Inline branches, indentation and comments

Reviewed `parseScript` block recursion, `nextCode`, `inlineChild`, sibling-else recognition, and `readBlockHead08`. Inline bodies consume exactly one non-block statement through the existing simple-statement parser. Nested inline if/repeat, multiple statements, same-line else, empty/comment-only body and a following deeper indented body are rejected. Else belongs to the immediately preceding if at the same indentation; intervening executable statements, duplicate/orphan else and wrong indentation are rejected. Comments do not create executable bodies.

The 288 independent lead/ending/truth/punctuation/else/inline-short-long combinations test both taken branches. Fifteen additional negative combinations retain their own IDs; the two phase-2 inline negatives have explicit replacement IDs. Phase 4 adds composition of every finite single-statement form into an inline body, compared with its independently declared indented canonical form. Inline comments remain on the body statement; comments between branches and trailing comments retain their recorded ownership. There is no new runtime else node.

## S05 — Source, local editing and structure

Reviewed `compactSourceMap09`, `SOURCE_RANGES09`, `parseMappedExpression09`, `blockEncode`, `preserveBlockSource09`, `editorReidentify09` and `prepareBlockEdit09`. Original source remains authoritative. Range maps are ephemeral UTF-16 side-table information, while diagnostic columns use Unicode code points. Semantic equivalence excludes locations but retains operands, comments, names, qualifiers, order and structure. A no-op returns before formatting/history changes. Edits are planned against a copy, applied in reverse offset order, reparsed, checked for AST/comment equality, checked against project limits, then committed together.

**Found and repaired:** inflected while/until conditions were parsed without original operand ranges. Editing `3が8未満の間…` rewrote unrelated body spelling and comments through a whole-block fallback. Unchanged operand prefixes now retain original offsets; conjugated synthetic suffixes never receive invented offsets. Explicit condition wrappers account for their prefix. Replacing an entire condition can normalize its header while preserving an unchanged body and suffix comment. This repair does not expand accepted grammar.

Independent source-string regressions cover repeated numeric values in different roles, XY/YX/time order, Unicode, CRLF, comments, batch offsets, literal predicates inserted into expression slots, condition conjugations, wrapped/inline waits, and header replacement. Structure edits preserve unaffected ranges; expanding an inline body formats the enclosing necessary construct and preserves its comments. A changed semantic candidate that cannot be faithfully reparsed is rejected atomically.

## S06 — History, focus, selection and IME

Reviewed the editor session/context/revision checks, pending-edit gates, common history, owner switching and UI commit paths. Pending composition cannot commit an intermediate syntax tree; stale owner or revision, locked execution, invalid mandatory slots and over-limit source reject before installation. Switching views is not an edit and does not clear redo or replace spelling.

The real-GUI suite observes source, project, history, redo, dirty, selection and focus through visible controls. Its added condition-edit case checks exact source and one history entry, undo/redo and the code view. Existing browser-session/ui/owner-delete/parent regressions remain required for owner changes, pending transactions, modal escape, native undo and drag rollback. Automated composition events and CDP touch/pen input are labelled as such; they do not establish physical Japanese IME or physical-device behavior.

The phase-4 review additionally found that branch positioning recognized only the old long else header. Short and inline else forms now map within their parsed If boundaries. Inline body offsets keep their statement selection instead of being overridden by the shared header line. A new real-GUI case exercises both else leads and all four long/short/inline endings, comment lookalikes, unchanged source/history, branch focus and code caret roundtrip. The pre-repair failure and the intermediate header/body collision are preserved; the completed regression passes all eight combinations.

## S07 — Names, scopes and error precedence

Reviewed the parser's syntax-only name tokens, `analyzeAst`, scope precedence, declaration restrictions, readonly iteration values, purity and the corresponding semantic/core suites. Unknown names and wrong target types remain AST nodes with diagnostics rather than vanishing code. Exact/self/project qualification is retained. Registration count/current value changes do not change parsing. Function/action arity, local-declaration placement, return placement and event-specific values use shared semantic rules.

Independent error-order and readonly fixtures distinguish target lookup from RHS evaluation and range validation; they also verify no partial state update after failure. User-call names and arguments are preserved after definition changes and deletion. New aliases do not turn into arbitrary user-defined verbs or implicit target completion.

## S08 — Execution, waiting, random and debugging

Reviewed scheduler waiting and failure boundaries, frozen diagnostic records, source-owner mapping and the event/runtime/condition trace fixtures. Controlled logical clocks and seeds compare complete observations, not physical audio finishing times. Actual browser media decode/playback and question controls are separate obligations. The event matrix requires all 32 target/event pairs; trace comparisons include stop/delete, error, wait/unblock, PRNG and final runtime state.

**Test correction:** after adding condition positions, four HA/candidate wait comparisons differed only by nested diagnostic `sourceSpan`. The observer now removes only that named metadata field from stored wait ASTs. All semantic fields and every execution observation remain compared; exact positions have separate editor/GUI assertions. This is not a relaxation of result, order, error, or waiting expectations. Initial failing evidence remains separate.

## S09 — Manual files, retired automatic persistence and drafts

Reviewed the removal against public main `f330b0c8b52ab1cce8d6c5bd59fd355b107ba5a4`: automatic write/read/delete, IndexedDB/fallback, recovery modal and handlers, scheduling hooks, queue/revision/epoch state, and persistence-only draft capture/restore are removed. No cleanup or migration accesses old browser data. UI-level persistence remains separate.

`validateCallableDraft` still validates both normal source/header editing paths. `lastSavedFingerprint`, `initialSnapshot`, dirty display, beforeunload, discard confirmations, common history, pending/IME guards, color/drag transactions, asset validation and file import rollback remain. Removing recovery epochs cannot loosen file import locking: the epochs only guarded the deleted asynchronous recovery path, while `modelLocked` and import state gates are retained.

Project source, including invalid unfinished source and material bytes, remains saveable by explicit file download and recoverable through explicit file open. Unregistered callable drafts remain separate until registration, with original names/source and Undo/Redo intact. Manual file structural validation, canonical Markdown/payload agreement (F512), material digest/decode, resource limits and failure state protection are unchanged. Product/language/runtime 1.0.0 and file/executable format 3 are unchanged. No automatic persistence guarantee remains.

The four replacement browser cases preserve non-retired assertions and add startup storage instrumentation, valid/corrupt old-record isolation, old-record byte/data preservation, post-edit wait, manual save/open and fresh-session checks. The material-bearing invalid-source file test continues from the existing media import setup, so removing automatic recovery does not narrow asset coverage. Static rejection covers product code/UI/namespace/API remnants, including escaped Japanese text. Negative mutations test the fixed exception and unrelated guarantee preservation. Browser execution results are recorded separately; source review alone is not browser PASS.

## S10 — Guarantee transition and nonweakening

Reviewed every changed historical assertion against its public Git source, the current suite and its retained assertions. Historical quotation hashes and normalized-source inclusion are now independently checked. The material-fixture quotation's retained trailing CR is documented and hashed; no fixture provenance was rewritten.

The 884 origin IDs classify as **876 maintained, 7 replaced, 1 old-version-only withdrawal**. The seven replacements include the earlier `08 indent reject 12` → eight short-if acceptance cases and six phase-3 version/save substitutions. `T09-VERSION-REJECT-PROJECT` alone withdraws enumerated release/marker rejection. Its ordinal slot's new marker-boundary test has a new ID and is not represented as the same guarantee. The mixed executable test splits malformed metadata and valid restore; the mixed schema test retains duplicate IDs, nonfinite values and excessive-input rejection; Markdown tests retain source/data/material visibility and exact roundtrip. Browser storage keeps mismatch/corruption/state protection, invalid-source restore and material byte identity. Material boundaries keep all original counts and limits.

`verifyAuthority` now enforces disposition per original ID and the 876/7/1 totals, rather than accepting any allowed enum value. Negative mutations exercise reclassification as well as missing mappings. The 257 capabilities remain in exact ledger order; wildcard references resolve against the complete required authority. Fixed 0.8 retains sourceCommit `ec43018d5ba546d5aa9df9c2799b18260a3ab2d7`, four fixture files and hashes, embedded runner, 508 tests and 122 capabilities/130 required IDs. Its obsolete syntax expectations apply to that fixed fixture only.

## S11 — Browser coverage and visible operation

Reviewed all five browser groups, each task's source/arguments/report and the declared ID/viewport/mode/event/limit matrices. `browser-results.json` fixes required case tuples independently of reported success counts. It is derived from reviewed suite declarations and fixed HA schema IDs, never generated from candidate results at execution time. Missing cases, duplicate tuples, page errors, network requests, wrong product hashes and failed shards reject the group.

The old workflow stopped at task exit codes. Final validation now reads actual reports, including all 153 schema cases, 32 event launches, 32 event traces, the 3×3 workbench matrix, 3×2×7 modern UI matrix, both long-input methods, six long-switch positions and the separate 300-statement gap test. WB09/DESIGN09 stable obligations map explicitly to complete underlying runner cases; keyboard resize remains in the modern resize/bounds assertions. A new shape case observes actual rendered schema categories, paths, dimensions and owner heading at all three representative widths, with screenshots for semantic visual review. Pure geometry tests are not substituted for interaction.

Local execution exposed an observation race in the existing workbench matrix: the pointer still occupied the auto-scroll edge band after the drop preview was first detected. The runner now reaches the target fully inside the stationary area before asserting its preview; all 3×3 cases, scrolling, cancellation, source/history assertions and the original loop/time bounds remain. The added shape check now selects actual schema nodes and the event hat explicitly, avoiding misclassifying palette previews without schema IDs as hats. Generated image/audio fixtures and their environment manifest are hashed before execution, checked against live inputs by each snapshot-aware runner, and rechecked in the final artifact validator. Schema shards copy these declared fixture snapshots as well as tracked inputs; a local zero-result failure exposed the initially missing shard copy and was rejected before any PASS aggregation.

## S12 — Limits and adversarial inputs

Reviewed all 38 ledger limits against product constants and boundary-suite assertions, separating synthetic metadata guards from real decoding/execution. Near/at/over-limit behavior, rejected-input state preservation and effective GUI/runtime routes are separate claims. For example, file-byte guards alone do not establish a valid maximum-size roundtrip; media and browser limit suites retain those obligations. Repetition/task setup limits do not imply performance for every maximal program.

The language boundary runner retains 90 HA/candidate process-isolated measurements, including long valid source, unclosed delimiters, duplicated particles/labels, missing late glide/audio/input markers and late comparison failures near 100,000 characters. Each worker still has a five-second upper bound. No threshold, finite expected set, limit, or malformed case is removed to obtain PASS.

## S13 — Offline, generated product and security boundary

Reviewed normal bootstrap, resource references, string escaping, format parsing and runtime serialization boundaries. Product source has no external resource dependency or audit bootstrap. The ordinary save/reload/export suite uses a hostile quoted string as data, verifies it is not evaluated, then starts/stops the generated HTML in a fresh offline context. License text is retained. Fixed fixtures remain audit inputs; they are not injected into the delivered product. These technical checks do not claim a separate penetration test or browser-engine security proof.

## S14 — Workflow, receipts and independent aggregation

**Found and repaired:** the requested `Akari_1_0_0` branch was absent from Push triggers; a new branch could classify scope from only its tip commit; no final job downloaded and independently verified every artifact. The branch and all new-branch/full-dispatch cases now require full scope. Static checks are executable in `static-contract.py`; preflight parses YAML, checks triggers, dependency graph, referenced scripts, immutable fixture connection, runner/task matrices, exact checkout and artifact rules, and checks script syntax. Negative workflows prove missing trigger/dependency/validator, changed retention and hidden-file exclusion are rejected. Artifact upload explicitly includes the reviewed public snapshot dotfiles (.github, .gitignore and .gitkeep); upload-artifact v4 otherwise omits these required hashed inputs. No Git database or credentials are in the captured tracked-file set.

The shared local/Actions gate records every invoked step and log. Successful job artifacts are sealed only after independent content validation. The final aggregate requires successful required jobs, all seven artifacts from the same run/attempt, identical HEAD and complete input hashes, exact case sets and actual browser identity. File removal/addition/change, wrong product/contract, duplicate IDs, FAIL and SKIP are negative cases. Failed/cancelled/missing/expired artifacts cannot become PASS. Default retention is three days. A documentation-only `SCOPE_ONLY` result cannot serve as a full product gate; this candidate branch always requires all gates.

## S15 — Measurements and review binding

H0/HA/this candidate measurements are separate. H0 → HA establishes the A-only extraction reduction; later language/editing additions are intentionally included in the candidate measurement. The final local review attestation records Git UTF-8/LF bytes, line count, SHA-256 and actual executed bytes, contracts, suite/runner/fixture hashes, per-step results and the evidence file manifest. HF is **not yet designated**. Changing any reviewed input requires impact review and new evidence; an older successful machine result is not promoted by editing its recorded HEAD.

## S16 — Contract resolution and remaining completion boundary

Corrected stale whole-source GUI formatting requirements, phase-2 inline placeholders, phase-3 version placeholders, autosave namespace/old-version rejection wording and public manuals still labelled 0.9. LANGUAGE, AUDIT and shared audits now describe the same finite acceptance, semantics and format-3 persistence contract. Historical records remain attributed to their checkpoints.

Source-review findings are addressed by implementation, regression additions and infrastructure changes described above. Local mandatory/regression results are recorded separately and must pass on the final committed candidate before handoff. GitHub Actions on the pushed SHA remains a separate required environment and is not inferred from local results. Subsequent changes require renewed semantic review of their impact and corresponding executions. No release-complete flag, HF, Ready, merge, or fixed-baseline switch is asserted here.

Naturalness and learning effects are design judgments, not measured user outcomes. No user study, physical mobile-device testing, or native Japanese IME study was performed. Browser automation records its concrete desktop environment, emulated viewports and input method; it does not extend those observations to untested devices. These limits must remain visible at release review.

Local preflight also exposed Windows checkout EOL conversion in the fixed fixture: static validation now verifies the immutable Git blob against its original byte/hash contract and separately permits only exact Git CRLF conversion in the executed copy. Both hashes are recorded; fixture contents/provenance are unchanged. The fixed runner also records actual browser identity and executed fixture SHA-256.

## S17 — Public documentation impact review after the phase-4 checkpoint

The phase-4 checkpoint is public `3458b61299e2e5d0a8e44030c542e6507cf38a08`. The sections above retain their original review-time status; they are not a claim that later execution or release review did not occur. The product HF at that checkpoint has 914,212 UTF-8/LF bytes, 24,351 lines, SHA-256 `6a5378f3d5368246772c94394cb3f77996bf241859e610623556322861179a74`. This documentation change does not alter those product bytes, LANGUAGE, AUDIT, the fixed-0.8 fixture, language/runtime versions or format 3. Repository HEAD and the all-file review binding do change.

Reviewed the existing public tree, README, index, MANUAL and all four Manual chapters against LANGUAGE, AUDIT and the relevant product paths: bootstrap/default project, toolbox and event selection, source/block editing, `saveProject`, `openProject`, `exportProject`, recovery controls, callable drafts and the offline player. `index.html` already exists in the checkpoint tree and in the reviewed-input map; it is improved in place. The entry pages guide readers to the same product and chapter paths, and name LANGUAGE/AUDIT as the respective authorities.

The manual now provides a complete first-work sequence, actual UI labels, save/open/export distinctions and explicit saving before closing, download confirmation, offline file placement, troubleshooting, shared navigation and chapter prerequisites. The existing four-chapter architecture and self-contained blue visual design are retained. Numbered steps, high-contrast code, linked section shortcuts, visible keyboard focus, a skip link, bounded scrolling contents, small-screen layout and reduced-motion handling improve reading. Diagrams are labelled as explanations, not exact product screenshots. Typography and wording are editorial judgments; no child usability study or measured learning effect is claimed.

Source review found the old advanced example `【手がかり】を「北」と同じか調べる。` is rejected by the actual 1.0.0 parser (P201). It is replaced with a valid conditional and explicit declaration prerequisites. This is a documentation correction, not a new language feature. Data initialization now precedes first use; partial loop/stop/callable examples identify the context they require. Inline if/else examples keep else on the next line and do not permit nested inline blocks or multiple statements. Reordered coordinate/data/rotation examples retain role markers; assignment, increment and evaluation order remain distinct. Changes do not add old-project conversion, old-marker rejection, embedded self-tests or device guarantees.

All 46 preformatted examples are parsed by the actual product script, and all 139 internal HTML links and relative README links are checked. Syntax acceptance alone does not establish execution for examples needing registered variables, assets, callable arguments or a specific event. The documentation browser runner additionally checks the six public HTML pages at desktop viewports 1366, 768 and 390, keyboard access and FAQ controls, and performs the documented first-work toolbox/event/code/run/click procedure. Screenshots require visual review separately from automated checks.

The candidate remains a product release PR relative to main `41d787b664ed00467bf55881c419ba4f3727add9`; the candidate branch and review-binding change require the full existing Actions gate. Old run `35757363183` is checkpoint evidence only, not evidence for the new repository HEAD. All old suites, 884 source IDs, 605 language cases, 38 editor cases, 9 GUI cases, 27 browser runners/416 cases, 508 fixed-0.8 cases, 122 baseline capabilities/130 required IDs and negative tests remain required. No old expectation, threshold, fixture or validator condition is removed. The inventory remains identical and resolves the same guarantees.

Additional documentation checks run in the existing browser-extra job before sealing. The independent bundle validator requires their PASS report, exact snapshot, 46 syntax records, all 18 page/viewport pairs, screenshots and first-work result. The workflow adds index to its path triggers. This is an additive GA-STATIC/GA-EXEC check; SEMANTIC remains the source/wording/authority review here and final visual review. Preflight continues to require the same jobs, checkout, browser groups, artifact integrity and three-day retention, and also checks the index trigger and documentation runner. Renewing `phase4-reviewed-inputs.json` attests only to this source review, not to unrun browser results.

The local verification copy has the exact checkpoint tree but not the historical Git object graph. Local static documentation checks and Node regressions are supplemental. Browser installation was unavailable in that environment; real Chrome rendering, first-work execution and full historical-fixture checks run on Actions and must be verified from the new HEAD's artifacts before completion. Final execution status and visual acceptance belong to the PR evidence, not to a self-referential commit-SHA edit in this file. Physical mobile, native Japanese IME input, user studies and learning effects remain unverified. This review does not authorize Ready, merge, branch deletion or a baseline switch.

## S18: PR Actions failure investigation and CI environment/isolation repair

The Phase 5 push run 35796695156 succeeded, but the same HEAD's PR run
35796699083 failed before core-browser suite execution: browserType.launch timed
out at the unchanged 15000 ms limit. The browser matrix was skipped because it
requires selftest; aggregate correctly rejected that failure. Its absent output
then caused the upload error. Those downstream results are not independent
product failures. The previous completion report failed to inspect this PR run;
the successful push run is historical evidence, not proof that all PR checks passed.

The older PR run 35786927311 at 3458b612 failed UI09-palette-drag-new-nested-location
because the palette select remained hidden. Source review identified cross-case
state: UI09-pointer-preview-single-drop-cancel invokes cancelDrag(), which sets
suppressClickUntil to Date.now()+350, then the shared-page runner continues to
IME and palette cases. A summary click in this interval is prevented. The product's
actual cancelDrag and click-guard source is executed under a controlled clock in
ci-regression.mjs to reproduce this suppression. The earlier hypothesis about
input redraw was not the identified cause. UI cases now use fresh contexts;
selectors, DOM pointer input, expected AST/source/history and all 19 result IDs
are preserved. Contexts close on success, assertion failure and setup failure.
Cases are not retried. Page errors/network requests remain accumulated failures.
Each case records an image; failure screenshots and the established summary image
remain available. The palette disclosure now explicitly confirms its open state.

The failed startup used Playwright 1.55.0 with the hosted image's Chrome 152. The
log proves a pre-suite startup timeout, but does not prove the specific OS cause
or that the DBus warning caused it. The unpinned executable/version combination
is removed: both execution jobs install Playwright's matching full Chromium
revision 1187 / 140.0.7339.16, including OS dependencies, and export its exact path.
Playwright documents that the bundled version is the supported pairing:
https://playwright.dev/docs/api/class-browsertype#browser-type-launch.
No retry, timeout extension, skipped case, smaller expected set, product limit
change or product file change is introduced. Three independent 15000 ms startup
checks (not retries) must all pass before product tests; they record binary hash,
package/revision/version, snapshot, script execution and MP3 capability. Any
failure rejects the gate. Independent bundle validation requires that report.
Selftest startup diagnostics are retained even if the product gate never begins.

GA-STATIC: workflow topology, pinned install/path/probe order, 7 negative workflow
cases, all script syntax, source binding, existing 20 evidence negatives and 15
new environment negatives. SEMANTIC: no guarantee/ID/fixture reduction, real
browser obligations retained; fresh-context setup removes accidental dependence
on earlier tests while preserving each case's operation sequence. GA-EXEC:
Node product and editor checks run locally. The browser attempt in this Work
container was blocked by socket() Operation not permitted before page creation;
therefore no local real-browser PASS is claimed. The language Node wrapper also
requires historical Git objects unavailable in the connector-built verification
copy and is not marked passed. Actions still performs those existing checks with
full history. Matching-browser startup and full browser product checks require
new Actions evidence; the user's latest instruction is to stop immediately after
Push, without waiting for or assessing that run. This snapshot is not yet a new
normal PASS or a renewed Phase 5 completion attestation.

Akari.html, LANGUAGE.md, AUDIT.md, public guides and fixed 0.8 bytes are unchanged.
The HF product SHA-256 remains
6a5378f3d5368246772c94394cb3f77996bf241859e610623556322861179a74.
Previous execution evidence is not rebound by editing its expected results;
phase4-reviewed-inputs.json binds this source review only. Final execution HEAD,
run/attempt, artifacts and validator results must be checked independently later.
Physical mobile, native Japanese IME, user studies and learning effects remain
unverified. PR stays Draft; no merge, shared synchronization or baseline switch.

## S19: product rendering re-entry, IME test synchronization and complete failure collection

Both af03f6bf PR run 35800841873 and push run 35800839118 completed browser
startup, core884, Node793, normal save/reload/export/offline, fixed0.8 508,
language605 in both environments, boundaries90 and editor38 in both environments.
The GUI suite recorded three failures on Chromium140: lost input focus,
replaceChildren throwing during blur, and an IME history count changing from2 to3.
These failures are not all framework-only. The previous browser downgrade made
old-browser event behavior visible, and was not adequately verified before Push.

Product bug: change/blur fired while removing old block inputs can enter flush
and render again during render. The product now guards render re-entry and ignores
input refresh/blur generated during its own rendering/commit or from disconnected
inputs. The public language/runtime/save contracts are unchanged. A simulated-DOM
regression executes the actual product block view with synchronous removal events:
old/mutated code performs two operations and attempts reentrant replaceChildren;
fixed code performs one operation, preserves expected source, leaves no pending
edit and restores focus. This is not claimed as real-browser execution. The
existing real-browser GUI assertions remain unchanged and required.

Framework bug: after code compositionend, commitSource09 queues history after
250ms. The GUI test took its next baseline before that already-committed input
entered history. The test now waits for the exact expected source AND exactly
one history increment before starting block composition; it does not accept an
extra history entry caused by the block edit. Native Japanese IME remains untested.

Framework design error: full-browser jobs depended on successful selftest and
the local gate broke on the first failure. Remove the unnecessary selftest
prerequisite; use explicit always conditions so a static failure also triggers
conservative full execution. Same-repository trust restrictions remain. Attempt
all15 local gate steps and preserve a sticky FAIL. Independent workflow checks,
extra documentation checks and sealing execute after earlier check failures;
sealing still rejects invalid/missing evidence. Aggregate inspects all7 expected
bundles even when another bundle, inventory or source binding fails, writes a
FAIL report with needs/provenance/snapshot/errors, then exits unsuccessfully.
No failed job/check is converted to success, retried away, or removed from the
expected set. Environment/setup failures remain explicit failures, not PASS.

Execution-continuity tests inject first/middle/last gate failures and bad bundles
at multiple positions, including inventory/binding failure. All15 steps/all7
bundle inspections run, failed verdicts persist and a failure artifact is written.
Workflow preflight adds negative tests for reintroducing the dependency and
removing always conditions. Existing browser27 tasks/416 cases, GUI9, core884,
fixed0.8 508/122 capabilities/130 IDs and all thresholds remain mandatory.

Local validation includes product793, editor38, DOM positive/negative regression,
execution-continuity positive/negative cases, workflow9 negatives/85 JS syntax,
existing evidence20 negatives, environment15 negatives, inventory and review
binding. Real-browser execution remains unavailable in this Work container due
to socket restrictions. The full new Actions evidence has not been collected;
the user instructed stopping after Push. No normal PASS or new HF is declared.
The previous product HF hash is historical only; this is a changed product
candidate requiring full revalidation. Fixed0.8 bytes/provenance and LANGUAGE,
AUDIT and public guides are unchanged. PR remains Draft; no merge/shared sync or
baseline switch is authorized.


## S20: headed window-focus fixture correction (2026-09-23)

Reviewed parent 527038e2995140f0c20bbe273829c72d5d577a2b. Push run 35803527118 and PR run 35803530159 both execute all eight jobs. Static, selftest and session/limits/schemas/extra succeed. UI has one failure: stage-gesture:window-blur-cleans-up. PR artifact 10726338710 records timeout at ui-stage-gesture.cjs:66, after downMouse, with no trusted window blur in the event trace; source and product file are unchanged and pageErrors is empty. Aggregate rejects the failed UI group and its absent success bundle; it must not be made green independently.

Classification: test environment/Framework failure to produce the prerequisite native window blur, before the product cleanup assertions. This evidence does not establish a product cleanup defect or establish its correctness. The previous product rendering and IME fixes now pass selftest in both runs. The native tab-switch test had relied on headless bringToFront behaving as a desktop tab activation after browser pinning. Use a headed Chromium for this suite, with xvfb-run -a on Linux and explicit xvfb/xauth installation. Playwright's Linux CI documentation requires Xvfb for headed execution (https://playwright.dev/docs/ci). The five existing case IDs, trusted-event requirement, timeout, coordinate/history/source assertions and independent validators are preserved; add document.hasFocus false assertion after blur. No synthetic blur fallback, retries, expectation replacement or product changes.

The guide runner remains assigned to extra, in the same always-executed group step, using sticky failure status for both commands. This removes non-applicable matrix step skips without removing guide coverage or skipping it after a group failure. Workflow preflight rejects missing headed dependencies and checks continued guide execution. Other setup-node post-step cache skips are action cleanup, not unexecuted product tests.

Akari.html remains 914546 bytes, 24362 lines, SHA-256 48b440829174256952ab3f12e13553c64cba95f392e30e8f79768ff7411c0acf. LANGUAGE/AUDIT, fixed 0.8 and expected case sets remain unchanged. Renew source review binding after this impact review; prior run evidence is tied to the parent snapshot and is not a PASS for the new HEAD. Local socket restrictions prevent a real headed browser trial. Source/workflow/negative validation can be checked locally, but actual native focus execution and new-head aggregate must remain unconfirmed at the user's required stop immediately after push. Phase 5 and new HF remain incomplete. Physical mobile, native Japanese IME, user study and learning effect remain unverified.

## S21: disable focus emulation on its owning session (2026-09-23)

Parent 4f008b90c23b9e4b205e5278290d53762e96fe22, push run 35805093556 and PR run 35805096720: all eight jobs ran. Six succeed; UI fails only stage-gesture:window-blur-cleans-up, and aggregate correctly rejects UI. Artifact 10728160022 records headed=true in the sense headless=false, focused=true before drag, no trusted window blur, timeout at line 69, no pageErrors and unchanged source. S20's assumption that headed execution alone addressed the cause was insufficient; its fix did not resolve the failure.

Root cause established in dependency source: Playwright 1.55.0 lib/server/chromium/crPage.js enables Emulation.setFocusEmulationEnabled on its main-frame session. The test instead sent false on a newly created CDPSession. Chromium 140.0.7339.16 InspectorEmulationAgent::setFocusEmulationEnabled returns immediately when enabled equals that agent's stored emulate_focus_ value; the new agent starts false. The owning agent remains enabled. The corresponding browser EmulationHandler also retains its own capture_handle. Exact sources reviewed:
- https://chromium.googlesource.com/chromium/src/+/refs/tags/140.0.7339.16/third_party/blink/renderer/core/inspector/inspector_emulation_agent.cc
- https://chromium.googlesource.com/chromium/src/+/refs/tags/140.0.7339.16/content/browser/devtools/protocol/emulation_handler.cc
- Installed npm playwright/core 1.55.0 crPage.js, inProcessFactory.js, server/page.js and crConnection.js.

Classification: Framework defect in focus-emulation ownership, before product cleanup assertions. Prior reports over-narrowed the diagnosis to headless without inspecting the owning session. The latest results do not establish a product cleanup failure. No product code changes in this correction.

The native-focus adapter sends false through the existing Playwright main-frame session. This uses a deliberately narrow internal API, locked to 1.55.0, with explicit local-connection/session shape assertions and propagated CDP errors. It changes only test environment focus emulation, not product functions or DOM events. Headed/Xvfb stays in place. Before drag, a real tab-switch must lose focus with trusted window blur and regain focus; evidence records the adapter, phase and events. Background waits use 50ms polling rather than rAF, retaining the 7000ms limit. The original five stable cases and all source/coordinate/history checks remain. No retries, synthetic blur, ID removal, threshold relaxation or candidate-derived expected outputs.

Independent browser-result validation now checks both adapter receipts, preflight loss/regain, pre-drag focus, actual post-switch loss and trusted blur during the gesture. Fourteen malformed focus evidence variants must be rejected in addition to the prior twenty negatives. Node regression reproduces the old wrong-session no-op with the two-agent early-return model, checks the owning session change, rejects version/shape failures and propagates a CDP exception. These are model/source checks, not a real-browser PASS.

Validation: 34 evidence negatives; CI click/context/environment regressions plus focus adapter positive and four invalid/error paths; all-15-step/all-7-bundle execution-continuity checks pass. Workflow preflight, syntax, inventory and renewed review binding are required after recording this review. The local Chromium 140.0.7339.16 launch was attempted and failed in process_singleton_posix.cc because socket() is denied. Cloud-browser APIs expose no owning CDP session and cannot substitute for this pinned runner. Therefore native browser execution of the correction remains unverified before the user-directed stop at Push. Do not claim new Actions success, new HF or Phase 5 completion. This limitation is not a removed CI obligation: all cases still execute on Actions and validators fail closed.

Akari.html remains 914546 bytes / 24362 lines / SHA-256 48b440829174256952ab3f12e13553c64cba95f392e30e8f79768ff7411c0acf. LANGUAGE/AUDIT, public guide documents, fixed-0.8 source/cases and product semantics are unchanged. Prior evidence is historical for its own HEAD. Physical mobile, native Japanese IME, user study and learning effect remain unverified. Draft/merge/sync/baseline authority boundaries remain unchanged.

## S22: separate hosted-runner interruption from product/framework defects (2026-09-23)

Examined commit e6d53e63476e15250acdc19717a6218e67281c53 on the actual public branch and both runs. Push 35810809191 attempt 1 has eight successful jobs. Its seven input bundles and aggregate were downloaded and independently revalidated: all 125 input hashes match the inspected public source, all 1793 enumerated evidence-file hashes match, each bundle validator result matches aggregate, MACHINE_PASS. ui-stage-gesture contains all five passing cases, a real trusted window blur, focus=false after switch, and verified preflight loss/regain. Previous S21's owner-session fix now has actual execution evidence.

PR run 35810812449 attempt 1 differs: job 107021779404 (extra) stopped during dependency installation, before environment probe or test runner execution. At 02:33:52 UTC its log explicitly reports "The runner has received a shutdown signal" and "The operation was canceled". It had run for about 26 seconds, far below the configured 40-minute timeout. Other jobs, including UI and selftest, succeed. Its absent extra artifact causes the independent aggregate to reject both the failed browser matrix and the incomplete artifact set. There is no product assertion, Framework test failure or evidence of the previous focus failure in this attempt. No workflow-wide cancellation or new overlapping candidate run was observed. The internal reason for the hosted machine's shutdown is not available; do not speculate about apt, resource exhaustion, manual cancellation or a provider outage.

This is an infrastructure interruption. always()/fail-fast:false cannot run checks after the machine dies; treating them as an absolute prevention of unexecuted tests would be a design/reporting error. The aggregate's missing-evidence rejection is correct. Do not modify working product behavior, swap browser versions, relax validations or accept a successful push as a substitute for the incomplete PR attempt.

Recovery: preserve attempt 1 and request one bounded rerun from root static job 107021727327. GitHub's job-rerun endpoint reruns that job and its dependents; the current DAG covers all eight jobs. This creates attempt 2 on the SAME commit, with fresh runners and all seven input artifacts in one attempt. Partial failed-job reruns would leave successful inputs bound to attempt 1, so they are unsuitable for this workflow's final verdict. No prior artifacts are copied, renamed or merged. No retry-until-green policy is added.

The public audit README now documents the three-way diagnosis, limitations of always(), whole-DAG recovery and independent same-attempt evidence requirements. Only audit documentation/review binding changes are planned; no product, suite, validator, workflow, expected IDs, fixed-0.8 baseline or acceptance thresholds change. Review binding is renewed because tracked documentation is still an execution input. Historical PASS at e6d53e6 does not certify the next documentation HEAD; user requires stopping immediately after Push. Phase 5/new HF final certification remains outside this repair result.

Recovery result: PR run 35810812449 attempt 2 completes with all eight jobs successful on unchanged e6d53e63476e15250acdc19717a6218e67281c53. Seven newly generated input bundles plus aggregate were downloaded; all independent validators pass, all 125 snapshot inputs equal the independently checked push snapshot, all 1793 enumerated evidence files have zero missing/hash mismatches, and aggregate is MACHINE_PASS. Its extra artifact is 10731115739 and aggregate artifact 10730827492. The first shutdown attempt remains historical evidence of an interrupted execution. This verifies recovery, not prevention of future hosted-runner shutdowns. No defect in the product or current audit implementation is established by this incident; avoid manufacturing a code fix to satisfy an assumed diagnosis.

Only audit/README.md, this review and phase4-reviewed-inputs.json change for the final Push. Product SHA-256 remains 48b440829174256952ab3f12e13553c64cba95f392e30e8f79768ff7411c0acf, 914546 bytes / 24362 lines. Document-only changes still renew source binding and trigger full Actions; the new HEAD's result is unconfirmed at the required post-Push stopping point. No Ready/merge/shared sync/baseline switch is performed. Physical mobile, native Japanese IME, user study and learning effect remain unverified.

## S23: completed 1.0.0 immutable comparison checkpoint (2026-09-23)

The explicit user instruction authorizes the post-completion checkpoint switch,
new work branches, non-force Push and Draft PRs. The source is the actual public
main merge commit 2f455619440f5abbfbb564927769c85341f25074, not an unfinished
candidate or floating ref. PR #2 is merged. Source run 35816378510/1 has all eight
jobs successful; all eight ZIP digests, 125 source hashes, seven bundles and
1793 evidence-file hashes were independently checked with the source validators
before any candidate edits. The aggregate digest and original IDs, source contracts,
capability/test mappings, core/language/editor/GUI/browser reports and bundle
manifests are archived with a separately recorded user completion decision.
Historical MACHINE_PASS alone is not interpreted as semantic release approval.

Change impact is audit-contract and audit-implementation scope: all current
machine jobs remain necessary. Product Akari.html, LANGUAGE.md, all current
assertion suites, finite language inputs, 38 resource limits and old 0.8 fixture
are unchanged from the source Git bytes. Frozen sources are extracted from exact
public Git objects. A pinned manifest digest and per-file bytes/hash/source blob
validation prevent candidate output or mutable main from replacing the checkpoint.
The source AUDIT.md inside the fixture records release-time provenance, while the
root contract describes current candidate acceptance. Product 1.0.0, design 2.1
and saved/executable format 3 are not conflated.

The gate adds frozen-product/frozen-core execution (884 exact IDs) to the existing
15 steps; old 0.8 still executes 508 assertions and checks 122 capabilities / 130
IDs. Current core IDs, 257 capability mappings, browser obligations and every case
tuple are checked against frozen authority. All current language 605, editor 38,
GUI 9, browser 27 tasks / 416 cases, 16 phases and 28 D09 guarantees remain.
Canonical language semantics now come from the completed 1.0.0 Git product; original
phase-1 acceptance measurements and the old manifest remain attributed to their
historical source. The 605-case Node precheck and frozen 884-case Chromium precheck
pass without modifying candidate assertions or adopting their output as goldens.
Independent literal expectations, role/evaluation order, original-source/state
preservation and boundary thresholds remain unchanged. Browser snapshot baseline
files are now the completed 1.0.0 product/contracts and are matched to independently
expected fixture hashes, not merely their self-reported metadata.

Negative coverage rejects invented/stale baseline commits, release/hash changes,
missing/duplicate/failed/skipped IDs, changed browser obligations and incorrect
execution environments. Workflow checks require the audit-branch push trigger,
completed checkpoint gate and job description. Static bundle validation independently
checks source completion provenance; selftest validates both products and final
aggregate validates the same candidate/run/attempt as all seven input bundles.
The policy's releaseComplete:true applies only to the fixed source release; the
aggregate's releaseComplete:false preserves the requirement for a current-candidate
semantic decision. No test deletion, skip, threshold relaxation or expected-set
reduction is part of this switch. Existing startup/focus recovery gates remain.

This review covers the source/contract changes; final committed candidate HEAD,
local results and new Actions results belong to the fresh execution artifacts
and PR report. They are not inferred from prechecks or source completion evidence.
Review binding is regenerated after this impact review. New tracked changes require
a new binding and applicable final-HEAD execution. Physical mobile devices, native
Japanese IME input, user studies and learning effectiveness remain unverified.

Local preflight found an existing portability defect in execution-continuity.mjs: its in-memory files were looked up by POSIX keys while the VM used Windows path.resolve/join. The VM now explicitly uses path.posix, retaining all first/middle/last failure scenarios and all seven aggregate inputs. This changes only the deterministic test filesystem. A separate sandbox restriction on Python dependency reads was resolved by running the same pinned PyYAML preflight with the authorized local execution permissions; it is not counted as a product assertion failure.
# Initial public release cleanup

The current candidate treats 1.0.0 as the initial public release. User-facing
compatibility disclaimers and development-release comments are removed. Current
AUDIT wording states the existing grammar, malformed-input, storage-consistency,
resource-limit and state-protection duties directly. Their guarantees are retained.

Source review compared the complete product with immutable completed commit
2f455619440f5abbfbb564927769c85341f25074: differences are the 232 recorded identifier
correspondences, matching dynamic color/mode ID construction, and four comment
edits. Error codes, color literals, Unicode escapes, application/language/runtime
1.0.0 values, format 3, project markers, limits, schemas and runtime behavior remain
unchanged. Dynamic DOM ID and dataset references were checked with the product's
actual DOM after an intermediate missing-selector startup failure was corrected.

The complete frozen external assertions are compared after the same recorded name
correspondence. Their literals and 884 stable IDs remain authoritative. Language
605, editor 38, GUI 9, all 257 capabilities, 28 D09 requirements, 16 phases and 27
browser tasks / 416 tuples remain required. The runtime/performance reference now
uses the completed 1.0.0 commit, including its version/format and diagnostic behavior.
The historical source is executed unchanged; only audit references are adapted.

All immutable fixtures and their hashes are unchanged. Execution evidence must
bind the final committed candidate and be independently verified. This review
does not claim physical mobile, native Japanese IME input, user research or
learning-effect verification. See ../LAUNCH.md for the maintained contract.

Final local preflight exposed two audit-host issues: import stripping assumed LF
while the Windows checkout uses CRLF, and several GUI runners still constructed
mode-control IDs with a development suffix. Import stripping now accepts both
line endings; the mode selectors now address the renamed real controls. All 16
execution-continuity steps, all seven aggregate bundles and all nine GUI cases
remain required. The original failed reports are retained separately; final
evidence is regenerated for the corrected committed HEAD.

## Initial new public repository repair (superseded)

The initial commit of the new public `Akari` repository, `abada1c732150a8ad7e55577567ecdd10ef36f9c`,
contains the same tracked tree as the completed `Akari2` public main, but no
earlier Git objects. Its first Actions run (35849183004) therefore could not
read the fixed completed-release public Git objects. Static and self-test jobs
failed on missing Git objects; all five browser groups passed. This is an
audit-host provenance failure, not evidence that the fixed baselines changed.

Repair `17171240bfbe3021d6b437322944e23fb74dec8e` used an isolated temporary clone
of the former public repository. Its Actions run 35852820483 passed all eight
jobs, but that mechanism required the former repository to remain available.
The user requires that repository to be removable, so the mechanism is superseded
by the self-contained source proofs below.

## Self-contained audit provenance

The archive contains 43 public source paths from the five already fixed source
commits, with their commit headers and only the tree paths needed to prove each
file's Git identity. Before recording it, every source byte and root tree was
checked against the pinned public Git objects; the five root tree hashes were
also confirmed through GitHub's commit API. No current candidate results supply
historical expectations. Existing 1.0.0 and 0.8 fixtures remain byte-for-byte intact.

The archive digest is fixed in `lib/historical-source.mjs`. Verification recomputes
Git commit/tree/blob hashes, validates path traversal and complete 0.8 directory
membership, checks SHA-256 and size, and bounds decompression. Missing or substituted
sources reject verification. The 31 completed-release source files and five 0.8
fixture files reuse their existing copies; seven additional historical sources
support the original guarantee quotations and phase-specific analysis tools.
Private sourceCommit metadata remains in the original 0.8 fixture. No private
repository is fetched or copied into this archive.

All historical Git reads now use this verified local archive. Current-candidate
HEAD and tracked-file operations still use the new repository's own Git database.
The workflow removes all old-repository clones and alternate object directories;
preflight rejects their reintroduction and requires the new provenance negative
gate. Twenty-one corrupt/missing/substituted proof cases and a child process with
Git unavailable exercise the verification boundary. Product/runtime behavior,
all existing assertion IDs, fixed hashes, thresholds and expected sets are retained.

The reviewed-input binding must be renewed after this source review. Final local
and Actions evidence belongs to the final committed HEAD. Historical phase-1
product-diff and language-inventory tools keep their original scopes; they do not
claim that the completed product equals a pre-release snapshot. Physical mobile,
native Japanese IME input, user studies and learning effectiveness remain unverified.

## Current autosave retirement review

The user-approved retirement is recorded in `autosave-retirement.json`. One capability changes from `save:autosave` to the explicit new `save:manual-only`; three other capability rows only update references to the two renamed browser cases. Two GUI IDs also receive new explicit identities. All other fixed capability fields, browser case tuples, GUI IDs, core/language/editor suites, browser obligations and execution groups remain exact. `completed-baseline.mjs` derives only these enumerated substitutions from the immutable completed fixture. The reviewed authorization, rationale, preserved guarantees and mapping record are digest-bound, with negative mutation checks.

The full static/selftest/five-browser-group/aggregate workflow and all fixed baseline sources, manifests, evidence and runners are unchanged. Local Node/static checks cannot establish real-browser acceptance; the exact public branch SHA must complete Actions before the PR is reported as verified. Remaining user-visible cost is loss of unsaved work and unregistered drafts across browser/OS termination; manuals now require explicit file saving. Old browser records are deliberately untouched and inaccessible to this product.
