# Initial public release: 1.0.0

Akari's initial public release is 1.0.0. The current candidate is product 1.0.1;
language and runtime remain 1.0.0. Project and executable format 3 are independent
data-structure identifiers; their values and validation remain unchanged.

The product's implementation identifiers, DOM IDs, CSS classes and data
attributes use names without development-version suffixes. The corresponding
browser selectors and external test references use the same names. The current
product exposes `Akari`; it does not install an alias for a development version.

`records/launch-identifier-map.json` records the one-to-one name correspondence
from the immutable completed release. The audit helper applies that correspondence
to frozen assertion source and compares the full result with current assertion
source. Stable test IDs, literal expectations, case sets, capabilities, resource
limits, and thresholds are retained. Audit suite filenames and stable IDs remain
historical identities, not product version declarations.

The frozen product executes unchanged. The headless audit adapter changes only
its exported property references after execution; the browser fixed-release
runner uses its own frozen bindings and suites. No adapter is shipped in the
product. `completed-runtime-contract.mjs` now compares the entire runtime exactly with
the verified 1.0.1 checkpoint, which already includes the authorized names and
product appVersion change. The 1.0.0 source remains an immutable historical
checkpoint with its own supplementary core replay.
`release-101-contract.mjs` records three exact version expectations in two
current suites. The full frozen assertions are otherwise preserved, and the
frozen suites still execute unchanged against the frozen product. Fifteen new
real-browser feature cases execute from frozen 1.0.1 source as well as against
the current candidate. Independent validators reject missing, changed, skipped
or failing IDs and mismatched source, suite, product or snapshot hashes.

The immutable fixtures, completion evidence, source commit and hashes described
in [BASELINE.md](BASELINE.md) remain intact. Historical quotations and provenance
records describe those archived inputs. Current acceptance is defined by root
AUDIT.md, LANGUAGE.md and the actual candidate tests.

Changing names still affects real DOM interactions. The current candidate must
pass the complete product-impact gate, including browser save/reload/export,
offline execution, editor focus/history, resource boundaries and all required
browser case tuples. Source equivalence alone does not discharge those tests.
