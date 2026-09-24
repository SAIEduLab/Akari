# Verified 1.0.1 comparison checkpoint

The active fixed source is public `SAIEduLab/Akari` commit
`62359484a646651dd81806ef97a6cfef87f85d4b` (product 1.0.1).
The user explicitly authorized this audit checkpoint after the implementation
passed all eight jobs in Actions run `36017186869`, attempt 1. The same commit
also passed all eight jobs in PR run `36018691411`, attempt 1.
Language/runtime remain 1.0.0 and project/program formats remain 3.

| Canonical Git UTF-8/LF source | SHA-256 |
|---|---|
| Akari.html (915,962 bytes) | `4827785ffa8818edacd66aef30e22c2b74156a5779872e27dfdec70f50d12387` |
| AUDIT.md at the fixed source | `0a651a5df4bf0b1b8c3be473b8d1af207a691130d806d3a8b86248b0dde8fedb` |
| LANGUAGE.md at the fixed source | `4b398dd031409d0807c4068bf6bd19c0601539716eb8ca1d9f3af267c9c0415d` |
| fixtures/1.0.1/manifest.json | `c6097c4d34dce97146563c12213d82737a1691545523060569d6b63c18d91fc5` |
| fixtures/1.0.1/git-provenance.json | `2f47734530e2e0032b5d5a105cfb4c9026909269b568b2fae2eaa29be32caa38` |

## Immutable source and evidence

`fixtures/1.0.1/source/` retains 34 exact source files from that commit: product,
contracts, frozen core/language/editor/feature assertions, finite language inputs,
capability and browser mappings, inventory and source review. The current root
AUDIT.md governs candidate acceptance. Frozen documents describe the archived
source; their historical baseline references do not override the current contract.

`checkpoint-source.mjs` verifies the pinned archive, original Git commit header,
required tree paths and every selected blob. It needs no remote repository,
old refs or Git object database. Fixture hashes permit only exact CRLF-to-LF
checkout normalization; fresh execution snapshots record actual input bytes.

During capture, all eight original artifact ZIP digests, 221 executed input
hashes against Git source, seven complete sealed file sets and 2,485 evidence-file
hashes were verified. Original selected reports, every bundle manifest and the
MACHINE_PASS aggregate are stored unchanged under `fixtures/1.0.1/evidence/`.
`checkpoint.json` records the jobs, artifact identities/digests, verification and
user authorization. Each retained report is checked against its original sealed
bundle hash. Full logs and screenshots are not all vendored; GitHub artifacts
expire after three days. Offline verification uses retained records and proofs.

## Required comparison

The same 20-step runner graph is used locally and in Actions. It executes:

- The fixed 1.0.1 product with its own frozen core assertions: 884 IDs.
- The fixed 1.0.1 product with its own frozen duplication/drawing suite: 15 IDs.
- The current product with complete core and feature assertions, independently.
- Both language environments (605 IDs each), editor environments (38 each),
  nine GUI IDs, invalid-report/policy checks and 90 boundary measurements.
- Historical 1.0.0 core (884) and historical 0.8 self-tests (508).

The fixed feature loader changes only import locations, target product path and
screenshot directory, each exactly once. Assertions and observed results remain
unchanged. Fixed receipts bind source commit, manifest, assertion suite and actual
product bytes. Missing, duplicate, skipped, failed or substituted results fail
independent validation. The candidate's feature/core sets must equal the fixed
sets. Frozen suites and the current assertion sources are compared in full.

Language goldens and runtime source equality now use the fixed 1.0.1 product.
Browser snapshot copies and independent hash validation also use 1.0.1. The
257 capability mappings, 42 JPF groups, 16 phases, 28 D09 requirements, 26 browser
obligations and 27 browser tasks / 416 case tuples remain mandatory. Fresh
candidate browser, save/restore, offline export, resource and state-protection
evidence is required. The aggregate validates every required bundle against one
current commit/run/attempt; archived success does not replace fresh execution.

## Authorization boundary and history

`manifests/quality-1.0.1.json` records `checkpointApproved: true` and
`releaseComplete: false`. This is an explicitly authorized verified checkpoint.
Ready for review, merge and release publication require their own authorization.
The aggregate continues to report `releaseComplete: false`. The retained
`completedBaseline` API/receipt field identifies the fixed comparison source;
it does not grant release approval to the current candidate.

The completed 1.0.0 fixture at
`2f455619440f5abbfbb564927769c85341f25074`, manifest digest
`db939bbcde1c86ae51c39189d05357d27635e405511d667d6b7588b79f74bd63`,
and its original completion evidence are unchanged. The historical verifier
still checks the 1.0.0 release and the original five-commit/43-source offline
archive. Its frozen product and core assertions still execute independently.

`fixtures/0.8/` retains original commit
`ec43018d5ba546d5aa9df9c2799b18260a3ab2d7`, hashes and content. Its 508 checks
and 122 capabilities / 130 required IDs remain supplementary obligations.
Neither historical fixture is relabeled or rewritten as 1.0.1.

Physical devices, native Japanese IME, user studies and learning effectiveness
are not established by browser viewport/composition automation.
