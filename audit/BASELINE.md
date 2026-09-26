# Completed 1.0.2 comparison checkpoint

The active fixed source is public `SAIEduLab/Akari` commit
`1207f8a44b783afbb2274e794759de4c58edb450` (product 1.0.2).
It was merged and all ten jobs of Actions `36235604048`, attempt 1, succeeded.
The user explicitly authorized promotion to the completed comparison checkpoint.
Language/runtime remain 1.0.0; project/program formats remain 3.

## Immutable source and evidence

- `fixtures/1.0.2/manifest.json`: 59 exact source files and retained execution reports.
- `fixtures/1.0.2/git-provenance.json`: original commit bytes, required Git tree
  objects and exact blob hashes, independently verifiable without Git or network.
- `fixtures/1.0.2/completion.json`: user-authorized `releaseComplete: true` for
  that fixed commit, ten successful jobs and original artifact identities/digests.
- The original aggregate and its `releaseComplete: false` machine-only result
  are preserved exactly. Completion is a separate decision, never a rewritten result.

Capture verified ten ZIP SHA-256 digests, all 334 executed input hashes against
the committed Git blobs, and all 3,322 sealed evidence-file hashes in nine bundles.
The original aggregate, bundle manifests, browser reports, core/language/editor/GUI
reports and both platform audio reports are retained. Binary audio is hashed as
exact bytes; canonical Git text is UTF-8/LF. The active verifier pins manifest,
completion and archive hashes and checks the full historical provenance chain.

## Required fresh execution

- Current candidate core: 884 real-browser IDs, with 793 Node supplements.
- Fixed 1.0.2 core: its exact frozen suite, all 884 IDs.
- Current and fixed 1.0.2 duplication/drawing: all 15 cases each.
- Current and fixed 1.0.2 audio: all 18 IDs on both Linux and Windows, using the
  pinned AAC-LC-capable browser. Import, save/reload and offline playback remain required.
- Current language: 605 IDs in Node and browser; editor: 38 in both environments;
  GUI: 9; browser: 27 tasks / 416 tuples; performance: 90 boundary measurements.
- Historical 1.0.1 core 884 and feature 15 replays remain required.
- Historical 1.0.0 core 884 and 0.8 self-tests 508 remain required.

Language goldens, runtime equality and browser snapshot baseline inputs use the
fixed 1.0.2 source. Current runtime must match it in full. Core assertions retain
the independently verified older provenance and explicit version transitions.
Audio assertions and fixtures also match the frozen 1.0.2 source in full.
No missing, duplicate, skipped, failing or stale report becomes PASS.

## Completion and candidate boundaries

`manifests/quality-1.0.2.json` has `releaseComplete: true` and a hash-bound
`completionRecord` with `scope: fixed-source-only`. This certifies the completed
source named above. A changed candidate must pass all applicable fresh checks.
Aggregate records the verified `completedRelease`, the candidate machine verdict,
and `candidateApproved: false`. Machine evidence never grants Ready/merge approval
or substitutes for semantic review. Feature freeze and reviewed-input hashes must
be renewed before candidate Push after impact review.

## Historical checkpoints

1.0.1 remains exactly `62359484a646651dd81806ef97a6cfef87f85d4b`, with its original
eight-job/seven-bundle evidence from `36017186869/1` and checkpoint-only decision.
Its verification lives in `historical-checkpoint-101.mjs` and
`checkpoint-101-source.mjs`; both fixed replays remain in the current gate.
1.0.0 remains `2f455619440f5abbfbb564927769c85341f25074` with its original completion
and source proofs. The original 0.8 fixture and its 122 capability / 130 required-ID
mapping remain intact. No historical fixture or original result is relabeled.
