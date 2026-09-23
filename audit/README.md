# Shared audit implementation

This directory is the canonical location for machine-executable implementations of the audit contract in `../AUDIT.md`: validators, test runners, browser tests, fixtures, fixed baseline material, and evidence-generation helpers.

The audit contract itself remains `AUDIT.md`. Its execution classes are:

- **GA**: machine-verifiable checks that must run in public GitHub Actions when applicable.
  - **GA-STATIC**: deterministic structural checks such as SHA/diff/hash/AST/limits/manifests.
  - **GA-EXEC**: direct execution checks that run the actual Akari product, browser, runtime, and generated artifacts in a reproducible hosted environment.
- **SEMANTIC**: LLM/human judgment that must not be replaced by a green workflow.
- **HYBRID**: Actions must generate the required GA-STATIC / GA-EXEC evidence and LLM/human review must judge the semantic claim.

For runtime or user-visible behavior, direct GA-EXEC observation is preferred over LLM inference from source. For deterministic structural claims, GA-STATIC is preferred over manual counting or inspection. Machine-verifiable parts should be moved into GA rather than repeatedly rechecked by an LLM. If a workflow, runner, fixture, or dependency is broken, fix the audit infrastructure without weakening the contract and rerun the required checks on the new head. Do not make CI green by deleting, skipping, or loosening required checks.

File names, runner layout, CI workflow names, and tool choices in this directory are implementation details unless `AUDIT.md` explicitly makes a requirement normative.

Keep audit implementation, the product snapshot, and `AUDIT.md` bound to the same commit. Public GitHub Actions should execute every applicable GA check and preserve the resulting evidence for that snapshot. This README alone is not an executable audit implementation; missing required runners/tests remain `UNVERIFIED` until implemented and run. Fixed-baseline comparisons must use public, immutable fixtures with source-commit and hash provenance; public CI must not require access to the private repository.

Current core tests run externally against the unmodified product file:

```sh
# Install playwright@1.55.0; expose its node_modules through NODE_PATH.
node audit/tests/externalization-static.mjs
node audit/run-product-tests.mjs "$AKARI_BROWSER" Akari.html audit-evidence/current-selftest.json
node audit/lib/verify-test-results.mjs audit-evidence/current-selftest.json Akari.html
node audit/tests/harness-negative.mjs "$AKARI_BROWSER" audit-evidence/current-selftest.json
node audit/tests/node-product.mjs
node audit/tests/normal-product.mjs "$AKARI_BROWSER" Akari.html audit-evidence/normal-product.json
# Active completed 1.0.0 checkpoint uses its frozen external suites:
node audit/run-fixed-baseline.mjs "$AKARI_BROWSER" audit-evidence/completed-baseline-selftest.json
# Historical 0.8 keeps its original embedded supplementary path:
node --experimental-websocket audit/run-headless-selftest.mjs "$AKARI_BROWSER" audit/fixtures/0.8/Akari.html audit-evidence/baseline-selftest.json
```

The Node supplement executes eight pure suites (793 IDs); it does not replace the required browser execution of all twelve suites (884 IDs), including image decoding. All five full-browser groups remain required for product/audit implementation changes. Use the existing `browser/run-full-browser-audit.mjs` and its manifest with Playwright 1.55.0, Babel parser 7.28.4, Python/Pillow and ffmpeg. See `EXTERNALIZATION.md` for migration provenance, API classification and Windows checkout-byte distinctions.

Language surface additions have their own finite manifest and actual-product runner; see [LANGUAGE_FORMS.md](LANGUAGE_FORMS.md). Run `node audit/run-language-tests.mjs --node`, then `node audit/run-language-tests.mjs "$AKARI_BROWSER"`, `node audit/tests/language-harness-negative.mjs audit-evidence/phase3/language-browser.json` and `node audit/tests/language-boundaries.mjs`. The first formal 1.0.0 specification replaces the documented short-header rejection with eight acceptance cases; the retired core ID is never reused. Phase 3 implements the six deferred inline cases, with 605 total language assertions and no deferred acceptance. These tests add guarantees; they do not replace any existing core or browser obligation. The phase-1-only `product-diff.mjs` must not be used to claim the intentional language changes are invariant.

The active checkpoint is completed 1.0.0 at `2f455619440f5abbfbb564927769c85341f25074`. See [the checkpoint record](BASELINE.md) for immutable product/contract hashes, completion evidence and the comparison coverage. `manifests/quality-1.0.0.json` records that source release as complete and retains all 884 origin guarantees and 257 capabilities. This does not approve a new candidate. Historical 0.8 content, provenance and supplementary execution remain intact. Version/save and browser replacements are recorded in records/phase3-guarantee-transition.json, retaining malformed-data validation and unsaved-state protection.

Editor and GUI validation additionally requires:

```sh
node audit/run-editor-surface-tests.mjs --node audit-evidence/phase3/editor-node.json
node audit/run-editor-surface-tests.mjs "$AKARI_BROWSER" audit-evidence/phase3/editor-browser.json
node audit/tests/phase3-browser.mjs "$AKARI_BROWSER" audit-evidence/phase3/gui.json
```

Use a fresh evidence directory per candidate/run; the full-browser runner refuses existing output directories. Editing ranges are transient, while runtime source locations remain diagnostic metadata. All final reports must bind the committed candidate, product, audit contract, suites, runners and fixtures.

## Current complete gate

Use `node audit/run-local-gate.mjs "$AKARI_BROWSER" <fresh-evidence-directory>` for the same self-test gate as Actions: browser core 884, Node supplement 793, fixed 1.0.0 core 884 with all 257 capability mappings, plus historical 0.8 508 and 122/130 mapping, language 605 in both environments, editor 38 in both environments, GUI 9, 90 performance samples, and validator negatives. `tests/static-contract.py` and `tests/workflow-preflight.py` reproduce static preflight (PyYAML 6.0.3). Full-browser groups retain all 27 runners and independently checked case tuples. Do not overwrite earlier evidence.

The workflow runs on main, `fix/**`, `audit/**` and `Akari_1_0_0`, forces full scope for the release branch and new branches, seals each job artifact, and independently verifies all seven artifacts in `aggregate`. Default retention is three days. `verify-evidence.mjs` rejects missing, failing, stale or changed artifacts; `MACHINE_PASS` does not assert a completed release. Current review and inventory are in `records/phase4-semantic-review.md` and `records/phase4-audit-inventory.json`.

## Diagnose and recover an interrupted Actions runner

Start with the current commit's push **and** pull-request runs, each job's steps,
raw failure log and artifacts. A red aggregate is a verdict about the required
evidence; it does not by itself identify a product defect.

- A product assertion or page error requires investigation against the product.
- A runner/fixture error requires investigation against the audit implementation.
- An explicit runner shutdown before the test command starts is an interrupted
  execution environment. Keep it failed/unverified; do not invent a product
  fix or describe the infrastructure's undisclosed shutdown cause as known.

`always()` and `fail-fast: false` keep independent checks running while a runner
is alive. They cannot execute code or upload artifacts after that runner stops.
Do not weaken the aggregate's rejection of missing evidence to hide this case.

For a confirmed runner interruption, preserve the original attempt's logs and
metadata, then rerun **all jobs** on the same commit, on fresh hosted runners.
The workflow's root `GA-STATIC contract and snapshot` job is also a supported
rerun entry point: GitHub reruns that job and its dependent jobs, which currently
cover selftest, all five browser groups and aggregate. Verify that all eight
jobs actually have records in the new attempt; do not infer completion merely
from the accepted rerun request. See the [GitHub job rerun API](https://docs.github.com/en/rest/actions/workflow-runs#re-run-a-job-from-a-workflow-run).

Do not use "Re-run failed jobs" alone for this workflow's complete verdict.
Artifacts are named and bound to a single run ID **and attempt**. Successful
artifacts from an earlier attempt cannot fill gaps in a later attempt. Never
rename, copy, merge or relax provenance checks to make a partial rerun pass.
A complete recovery requires all eight successful jobs, seven fresh input
bundles and the aggregate from the same attempt, with independent validator,
input-hash, artifact-hash and expected-ID checks.

A bounded infrastructure recovery is not a retry policy for failing tests.
If the new attempt has a test failure, investigate it; if it loses another
runner, retain the infrastructure limitation. Do not rerun until green or claim
that a repository change can guarantee hosted-runner availability. Any later
tracked-file change creates a new snapshot requiring its own execution evidence.
