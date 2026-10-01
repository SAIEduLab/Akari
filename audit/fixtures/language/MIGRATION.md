# 1.0.2 language audit migration

The 605 stable test IDs, 256 finite inputs, 42 JPF capability groups, 95 reference ASTs, and 153 baseline schema IDs remain covered. Original inputs and expectations from public commit `d961dd346e5b104e09e7f0dd342beb5c16174a36` are preserved byte for byte under `audit/fixtures/legacy-1.0.1/`.

`audit/fixtures/language-surface-v2-migration.json` records each stable ID's original and migrated input, expected meaning, AST and runtime values where applicable. Changes follow the approved specification: explicit Boolean values, noun-value speech, closed condition inflections, exact-name delimiters, visible role units, explicit function calls, and start-only versus waiting sound verbs. Suspended operations now record their explicit owning actor. Their timing, condition, handle, results, and evaluation traces stay intact. Newly accepted destination particles and separated same-line statements have explicitly malformed replacements in the corresponding rejection tests.

`forms.mjs` contains the final finite input literals. The runner sends those exact sources to the actual parser; it does not rewrite them. Expected ASTs derive from the old ASTs with quantity wrappers. Runtime expectations retain the original primitive values, order, binding and PRNG traces, timing, and waiting state. Candidate output is never used to regenerate the oracle.

The regression project fixture preserves the original initial actor/data state independently of the product's simpler new-project screen. Additive schemas are permitted while every original schema ID and its ordering remain required.

```sh
node audit/tests/language-migration-static.mjs
node audit/run-language-tests.mjs --node /tmp/language-node-new.json
node audit/run-language-tests.mjs "$AKARI_BROWSER" /tmp/language-browser-new.json
node audit/tests/language-harness-negative.mjs /tmp/language-browser-new.json
```

Each report path must be new. The browser route uses the established real-browser `file://` host and records its exact version, product snapshot, and all migration/fixture input hashes. Node results do not fulfill the browser obligation.
