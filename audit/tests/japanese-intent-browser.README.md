# Independent Japanese intent browser audit

Run from the repository root with the pinned audit environment:

```bash
NODE_PATH=/workspace/akari-environment/deps/node_modules \
node audit/tests/japanese-intent-browser.mjs \
  /workspace/akari-environment/browser/chrome-linux64/chrome \
  /tmp/akari-intent-new-report.json
```

The output path and its `.artifacts` directory must be new. Required versions are Chrome for Testing 140.0.7339.207 and Playwright 1.55.0. All editor and generated-player pages use `file://`, in offline browser contexts. The runner copies the current product to an immutable candidate before launch and records its SHA256. A changing integration working copy does not change the tested snapshot.

An optional final argument selects IDs containing a substring for diagnosis. A filtered report is always `INCOMPLETE`, even if all selected checks pass:

```bash
NODE_PATH=/workspace/akari-environment/deps/node_modules \
node audit/tests/japanese-intent-browser.mjs "$AKARI_BROWSER" \
  /tmp/akari-intent-ci14-new.json CI-14
```

## Oracle and coverage

The unchanged 20-case `docs/1.0.2/child-intent-corpus.json` is hash pinned to the approved design snapshot. Its provenance is adult-authored hypotheses, not real-child observations. Original prose and meaning contracts are included verbatim in every report.

`japanese-intent-oracles.mjs` explicitly structures each intent using the fixed specification. This is distinct from claiming that all narrative prose is executable. All 20 originals have editor preservation checks. Nineteen structured cases independently check actual scheduler results from source and from block encode/decode/generated source. CI-20 uses real image/audio import, execution, save/reload, and generated-player execution. Parser/core and block/core failures are reported separately.

The full runner currently contains 89 independently registered checks. Expected locations, directions, expression values, order, branch boundaries, argument mapping, clone counts, event filtering, waits, and timestamps are authored from the contracts. The harness uses the real `RuntimeModel`, `EventScheduler`, parser, compiler, and block codecs. It controls the monotonic clock and suppresses only RAF scheduling in core tests. Observers call the original methods. It contains no alternative statement evaluator and does not manufacture a candidate AST to satisfy expectations.

Additional checks cover all advanced math families and postfix builtins; finite numerical precedence; quantities and mismatches; typed Boolean values; quotes and escaped delimiters; Unicode source columns; named argument evaluation order; owner and branch scope; 30/60/120 Hz continuous movement; real keyboard repeat suppression; question responses and cancellation; quantity edits and shared undo; and ambiguous-intent choices with non-execution and cancellation preservation.

Ambiguity UI checks require at least two distinct concrete alternatives through `[data-intent-choice]` and one `[data-intent-cancel]`. Missing controls are failures. No fallback test clicks an arbitrary interpretation or changes the original source.

### Original-prose pending transaction

The 20 `CI-xx/original-prose-ui` IDs cover all 23 unchanged original作文候補 texts. Each now requires a code pending transaction with the exact original text and owner, a disabled blocks button, no change to the valid source/project/history/redo/dirty state, rejected execution with no scheduler start or effects, and explicit editor cancellation restoring the prior valid source. Every case must satisfy every assertion; there is no conditional acceptance path. The seven ambiguity-choice checks remain separate and unchanged.

Each check records the actual valid, pending, after-Run and cancelled snapshots, their owner keys, and execution observations. The aggregate validator can independently compare source/project/history/redo/dirty/state and owner preservation instead of relying only on success flags.

The earlier preservation harness unconditionally clicked the blocks button, although it explicitly did not claim that narrative prose was executable. That interaction conflicted with the syntax-error disabled-button guarantee and the pending-edit contract in specification section11 and design section9. Specification AppendixD also states that the corpus is not a declaration that every original prose variant parses. The correction preserves all 20 IDs, all original corpus bytes, and all semantic oracles while replacing the inconsistent interaction with stricter pending/non-execution/cancellation observations. `audit/fixtures/intent-original-prose-pending-migration.json` records both routes, hashes, originals, and their guarantees. Product behavior is not relaxed for this audit correction.

## Evidence and limitations

The report contains candidate, browser, executable, oracle, and audit-input hashes; every result; all 20 coverage rows; original sources; primitive runtime traces; and generated artifacts. Selected UI failures also save screenshots. `FAIL`, `PENDING`, `INCOMPLETE`, and `NOT_RUN` are never converted into PASS. Browser startup failure blocks execution and remains explicit.

The manual runner intentionally does not alter existing tests, manifests, baseline fixtures, or the six protected design documents. It is a new execution gate; CI registration remains an integration responsibility. Its original-prose checks establish preservation and non-execution, not a claim of universal natural-language understanding. A final full run against the final product hash is required after integration fixes; earlier snapshots remain earlier evidence.
