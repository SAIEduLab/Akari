# Completed 1.0.0 comparison checkpoint

The active non-regression source is public `SAIEduLab/Akari` commit
`2f455619440f5abbfbb564927769c85341f25074` (the merged 1.0.0 release).
It is immutable. Neither a floating branch nor the current candidate supplies
expected values. Product version 1.0.0, internal design document version 2.1,
and project/program format 3 describe different things.

| Canonical Git UTF-8/LF source | SHA-256 |
|---|---|
| Akari.html (914,546 bytes) | `48b440829174256952ab3f12e13553c64cba95f392e30e8f79768ff7411c0acf` |
| AUDIT.md at the completed source | `e5d1bb9fb2be077747f19c8904190622276cd4ea985935ca458c46db936679a2` |
| LANGUAGE.md at the completed source | `67f5b4c85f8f3469f583adea8af839d8e2ff45df19d097fd11427cbae4920aca` |
| fixtures/1.0.0/manifest.json | `db939bbcde1c86ae51c39189d05357d27635e405511d667d6b7588b79f74bd63` |

The source product, contracts, external assertions, finite language inputs,
capability/test mappings and historical guarantee ledger are retained under
`fixtures/1.0.0/source/`. The current root AUDIT.md governs candidate acceptance;
the frozen contract records the completed source and is never substituted for
the current contract. Windows checkout CRLF conversion is allowed only as that
exact text conversion for immutable fixture hashes; execution snapshots record
the actual bytes used. Source provenance is also checked against the public Git
objects at the exact commit.

## Completion evidence and its limits

The user authorized this switch after the release completion decision and merge
of [PR #2](https://github.com/SAIEduLab/Akari/pull/2). The merge commit itself has
[Actions run 35816378510, attempt 1](https://github.com/SAIEduLab/Akari/actions/runs/35816378510):
all eight jobs succeeded. Before freezing the checkpoint, all eight downloaded
ZIP digests, 125 source input hashes, seven sealed bundles, 1,793 evidence-file
hashes, independent validators and aggregate results were checked. The aggregate
SHA-256 is `f99b3ea9449ba2f79a858f4de64eea656d2de5b4c335392c9a417025c4caf507`.

`fixtures/1.0.0/completion.json` retains job and artifact identities/digests,
independent verification and the approval boundary. Exact selected reports,
all bundle manifests and the aggregate are retained under `evidence/`; every
selected report is matched to the original bundle hash. Full logs/screenshots
are not all vendored and the original Actions artifacts expire after three days.
The retained reports are historical evidence for this source only, never proof
that a future candidate executed successfully. The frozen semantic review and
explicit completion authorization remain distinct from MACHINE_PASS.

## Required comparison

The gate executes the frozen product with its frozen external core assertions
(884 IDs), executes the candidate independently and compares complete ID sets.
Candidate language comparisons derive canonical semantics from the frozen
completed Git product, retaining all 605 IDs and independent literal oracles.
The 38 editor IDs, nine real GUI IDs, all 257 capability mappings, 42 JPF groups,
16 phases, 28 D09 requirements, 26 browser obligations and 27 browser tasks / 416
case tuples are preserved. The candidate still executes all required browser,
save/restore, generated/offline, invalid-input, resource and state-protection
checks. Frozen browser completion reports record the source's results; fresh
candidate browser results and exact mapping/expected sets are mandatory.

The local gate and Actions share the same runner graph. Missing/duplicate IDs,
wrong source/hash/environment, skipped or failing results and stale execution
snapshots fail verification. The workflow's aggregate verifies every required
bundle against one candidate commit/run/attempt. `quality-1.0.0.json` has
`releaseComplete: true` for the **fixed source release**; aggregate retains
`releaseComplete: false` because it cannot grant semantic acceptance or release
approval to the **current candidate**. Its `completedBaseline` field identifies
the independently validated fixed comparison source.

## Historical 0.8

`fixtures/0.8/` remains byte-for-byte the original Git fixture, with sourceCommit
`ec43018d5ba546d5aa9df9c2799b18260a3ab2d7`, original hashes and history.
Its original embedded runner still runs 508 checks, and the 122 capabilities /
130 required IDs remain checked against the candidate as supplementary regression.
It is not renamed or described as 1.0.0. Its AUDIT.md and LANGUAGE.md describe
that historical source; the same-named root documents describe current 1.0.0.

Physical mobile devices, native Japanese IME input, user studies and learning
effectiveness remain unverified. Browser viewport/composition automation does
not establish those claims.
