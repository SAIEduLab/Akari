# Independent Japanese intent browser audit

Run from the repository root with Node.js 24 and Python 3. Required versions are Chrome for Testing 140.0.7339.207 and Playwright 1.55.0. Choose a writable environment directory; no service-specific workspace layout is required. This POSIX-shell setup example targets Linux:

```bash
export AKARI_AUDIT_ENV="${AKARI_AUDIT_ENV:-$HOME/.cache/akari-audit}"
npm install --prefix "$AKARI_AUDIT_ENV/deps" --no-package-lock --no-audit --no-fund \
  playwright@1.55.0 @babel/parser@7.28.4
export NODE_PATH="$AKARI_AUDIT_ENV/deps/node_modules"

# Install Linux browser system dependencies if they are not already available.
"$AKARI_AUDIT_ENV/deps/node_modules/.bin/playwright" install-deps chromium
export AKARI_BROWSER="$(python3 audit/install-codec-browser.py "$AKARI_AUDIT_ENV/browser-140.0.7339.207")"
"$AKARI_BROWSER" --version
node -p "require('playwright/package.json').version"

export AKARI_REPORT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/akari-intent.XXXXXX")"
node audit/tests/japanese-intent-browser.mjs \
  "$AKARI_BROWSER" "$AKARI_REPORT_DIR/report.json"
```

Dependency installation needs network access, and Linux system dependencies may require administrator approval. The repository installer downloads the pinned official Chrome for Testing; Playwright's bundled Chromium is not a substitute. If reusing an environment, confirm the displayed versions match the required versions before running. On Windows, install the same package versions, use the installer's Windows executable path, and set `NODE_PATH`, `AKARI_BROWSER`, and a new `AKARI_REPORT_DIR` using the shell's environment-variable syntax.

The output path and its `.artifacts` directory must be new for every run. All editor and generated-player pages use `file://`, in offline browser contexts. The runner copies the current product to an immutable candidate before launch and records its SHA256. A changing integration working copy does not change the tested snapshot.

An optional final argument selects IDs containing a substring for diagnosis. A filtered report is always `INCOMPLETE`, even if all selected checks pass:

```bash
node audit/tests/japanese-intent-browser.mjs "$AKARI_BROWSER" \
  "$AKARI_REPORT_DIR/ci14-new.json" CI-14
```

## Oracle and coverage

The unchanged 20-case `audit/fixtures/japanese-intent/child-intent-corpus.json` is hash pinned to the approved design snapshot. Its provenance is adult-authored hypotheses, not real-child observations. Original prose and meaning contracts are included verbatim in every report.

`japanese-intent-oracles.mjs` explicitly structures each intent using the fixed specification. This is distinct from claiming that all narrative prose is executable. All 20 originals have editor preservation checks. Nineteen structured cases independently check actual scheduler results from source and from block encode/decode/generated source. CI-20 uses real image/audio import, execution, save/reload, and generated-player execution. Parser/core and block/core failures are reported separately.

The full runner currently contains 89 independently registered checks. Expected locations, directions, expression values, order, branch boundaries, argument mapping, clone counts, event filtering, waits, and timestamps are authored from the contracts. The harness uses the real `RuntimeModel`, `EventScheduler`, parser, compiler, and block codecs. It controls the monotonic clock and suppresses only RAF scheduling in core tests. Observers call the original methods. It contains no alternative statement evaluator and does not manufacture a candidate AST to satisfy expectations.

Additional checks cover all advanced math families and postfix builtins; finite numerical precedence; quantities and mismatches; typed Boolean values; quotes and escaped delimiters; Unicode source columns; named argument evaluation order; owner and branch scope; 30/60/120 Hz continuous movement; real keyboard repeat suppression; question responses and cancellation; quantity edits and shared undo; and ambiguous-intent choices with non-execution and cancellation preservation.

Ambiguity UI checks require at least two distinct concrete alternatives through `[data-intent-choice]` and one `[data-intent-cancel]`. Missing controls are failures. No fallback test clicks an arbitrary interpretation or changes the original source.

### Original-prose pending transaction

The 20 `CI-xx/original-prose-ui` IDs cover all 23 unchanged original作文候補 texts. Each now requires a code pending transaction with the exact original text and owner, a disabled blocks button, no change to the valid source/project/history/redo/dirty state, rejected execution with no scheduler start or effects, and explicit editor cancellation restoring the prior valid source. Every case must satisfy every assertion; there is no conditional acceptance path. The seven ambiguity-choice checks remain separate and unchanged.

Each check records the actual valid, pending, after-Run and cancelled snapshots, their owner keys, and execution observations. The aggregate validator can independently compare source/project/history/redo/dirty/state and owner preservation instead of relying only on success flags.

The earlier preservation harness unconditionally clicked the blocks button, although it explicitly did not claim that narrative prose was executable. That interaction conflicted with the syntax-error disabled-button guarantee and the pending-edit contract in the historical specification section11 and design section9, now consolidated in LANGUAGE and PUBLIC_SEMANTIC_UX_SPEC. The historical acceptance policy also states that the corpus is not a declaration that every original prose variant parses. The correction preserves all 20 IDs, all original corpus bytes, and all semantic oracles while replacing the inconsistent interaction with stricter pending/non-execution/cancellation observations. `audit/fixtures/intent-original-prose-pending-migration.json` records both routes, hashes, originals, and their guarantees. Product behavior is not relaxed for this audit correction.

## Evidence and limitations

The report contains candidate, browser, executable, oracle, and audit-input hashes; every result; all 20 coverage rows; original sources; primitive runtime traces; and generated artifacts. Selected UI failures also save screenshots. `FAIL`, `PENDING`, `INCOMPLETE`, and `NOT_RUN` are never converted into PASS. Browser startup failure blocks execution and remains explicit.

The manual runner intentionally does not alter existing tests, manifests, baseline fixtures, or the fixed baseline/intent oracle. It is a new execution gate; CI registration remains an integration responsibility. Its original-prose checks establish preservation and non-execution, not a claim of universal natural-language understanding. A final full run against the final product hash is required after integration fixes; earlier snapshots remain earlier evidence.

## Permanent source routing

The six historical document hashes remain pinned in the unchanged baseline fixture. Their current meaning, historical NOT_RUN mappings, section destinations and approved semantic revisions are checked through `audit/manifests/capability-traceability.json` and `audit/fixtures/design-doc-migration-map.json`. The corpus JSON/Markdown moved byte-identically to `audit/fixtures/japanese-intent/`; historical paths inside those originals are provenance. Basic-intents and composition-acceptance remain separate independent sources. Documentation completion is not product execution or child-outcome PASS.
