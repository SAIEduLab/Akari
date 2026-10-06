# Standard limits and derived profiles

The standard values below retain the existing editor and player behavior. A host registers and selects a profile before loading a project. A saved requirement identifies that selection; it cannot register a profile or grant permissions. The canonical meaning and saved-project contract are in [LANGUAGE.md](../LANGUAGE.md).

For adjustable policies, an omitted value or JavaScript `undefined` inherits the standard value, a positive finite value replaces it, and JSON `null` removes the software maximum. Zero is invalid. The effective runtime value for `null` is `Infinity`; serialized profile definitions retain `null`. Integer policies require positive safe integers. Only audio duration policies accept positive fractional numbers. Unlimited software policies remain subject to available memory, browser allocation and media capabilities.

The portable factory is [profiles.js](profiles.js). Register `{id, version, limits}`, then select that ID and version. `effective` is a stable read-only object with getters; `standard` is frozen. `requirement()` returns `null` for the standard profile or `{id, version, contentHash}`. `validateRequirement()` checks the installed content and selected host profile without changing the selection. SHA-256 covers the canonical ID, version and sorted explicit overrides. Unknown fields, duplicate ID/version pairs and overrides of fixed guards are rejected.

## Policy inventory

Hook names identify the paths that must use the same effective policy. They are product functions, independent of source line movement during release updates. All existing `LIMITS` names are included.

| Key | Standard value | Classification | Product hooks |
| --- | ---: | --- | --- |
| `fileBytes` | 25,165,824 bytes | Adjustable integer maximum | file picker preflight; `serializeProject`; `parseProjectFile` |
| `importFileBytes` | 12,582,912 bytes | Adjustable integer maximum | image/audio file pickers; `canonicalizeImage`; `canonicalizeAudio` |
| `assetRawTotal` | 16,777,216 bytes | Adjustable integer maximum | `decodeBase64`; serialized/executable asset validation; `validateProjectAssets`; autosave/history asset restoration |
| `assets` | 128 | Adjustable integer maximum | serialized/executable structure; asset aggregate validation; autosave/history |
| `imageAssets` | 64 | Adjustable integer maximum | serialized structure; asset aggregate validation |
| `audioAssets` | 64 | Adjustable integer maximum | serialized structure; asset aggregate validation |
| `imageBytes` | 4,194,304 bytes | Adjustable integer maximum | image canonicalization; serialized/executable assets; autosave/history |
| `audioBytes` | 6,291,456 bytes | Adjustable integer maximum | audio canonicalization; serialized/executable assets; autosave/history |
| `imageWidth` | 4,096 pixels | Adjustable integer maximum | `checkImageLimits`; image import and restored-image decode |
| `imageHeight` | 4,096 pixels | Adjustable integer maximum | `checkImageLimits`; image import and restored-image decode |
| `imagePixels` | 4,194,304 pixels | Adjustable integer maximum | `checkImageLimits`; image decode |
| `imagePixelsTotal` | 16,777,216 pixels | Adjustable integer maximum | `validateProjectAssets` |
| `audioDuration` | 60 seconds | Adjustable finite maximum | `checkAudioLimits`; imported/restored audio decode |
| `audioDurationTotal` | 120 seconds | Adjustable finite maximum | `validateProjectAssets` |
| `audioChannels` | 2 | Fixed codec support guard | `checkAudioContainerLimits`; saved audio metadata and actual decode |
| `audioSampleRateMin` | 8,000 Hz | Fixed codec support guard | `checkAudioContainerLimits`; audio import/restoration |
| `audioSampleRateMax` | 48,000 Hz | Fixed codec support guard | `checkAudioContainerLimits`; audio import/restoration |
| `activeAudioVoices` | 32 | Adjustable integer maximum | `AssetRuntimeCache.createHandle`; completion and stop cleanup |
| `backdrops` | 256 | Adjustable integer maximum | design validation; backdrop creation |
| `costumesPerSprite` | 256 | Adjustable integer maximum | design validation; costume creation |
| `sounds` | 256 | Adjustable integer maximum | design validation; saved sound-reference validation |
| `components` | 500 | Adjustable integer maximum | design/executable validation; creation and duplication controls |
| `clones` | 500 | Adjustable integer maximum | `RuntimeModel.createClone`; atomic multi-clone command |
| `scripts` | 1,000 | Adjustable integer maximum | design/document validation; compile; event creation; block slots; executable restoration |
| `sourceEach` | 100,000 code points | Adjustable integer maximum | design/parser validation; block AST count/slots; formatting; editor transactions; draft/autosave/history restoration |
| `sourceTotal` | 1,000,000 code points | Adjustable integer maximum | design validation; editor transactions; drafts/history restoration |
| `projectVars` | 1,000 | Adjustable integer maximum | project and component-local data validation |
| `projectLists` | 500 | Adjustable integer maximum | project and component-local data validation |
| `listItems` | 100,000 | Adjustable integer maximum | initial-value validation; expression evaluation; runtime assignment/list commands |
| `stringChars` | 100,000 code points | Adjustable integer maximum | source literals; runtime values; design text; filters; block fields; input/answer DOM limits |
| `callables` | 500 | Adjustable integer maximum | design/executable validation; definition editor transactions |
| `args` | 32 | Adjustable integer maximum | declaration validation; callable editing; call argument restoration |
| `callDepth` | 64 | Fixed recursive engine guard | synchronous function evaluator; action-call frames |
| `functionOps` | 100,000 | Adjustable integer maximum | expression/function operation accounting; cooperative execution retains stop responsiveness |
| `blockDepth` | 128 | Fixed recursive engine guard | parser; block codec; formatter; saved drafts/history |
| `expressionDepth` | 128 | Fixed recursive engine guard | expression parser; AST and block validation |
| `repeatCount` | 1,000,000 | Adjustable integer maximum | synchronous function repetition; scheduler repetition |
| `activeTasks` | 2,000 | Adjustable integer maximum | scheduler task creation; atomic clone receiver preflight; task-reference block slots |
| `executableBytes` | 67,108,864 bytes | Adjustable integer maximum | `generateStandaloneHtml` final encoded output |
| `logChars` | 100,000 UTF-16 code units | Adjustable integer maximum | editor output; standalone player output |
| `historyEntries` | 60 | Adjustable integer maximum | workspace history generation/restoration and asset aggregate retention; drawing/editor undo stacks use `max(1, floor(historyEntries / 2))`, color-tool history adds one current entry, preserving the standard 30/31 limits |
| `diagnosticsBytes` | 8,388,608 UTF-16 code units | Adjustable integer maximum | scheduler error snapshot retention; the latest complete snapshot remains available |

The historical diagnostic field name `diagnosticsBytes` retains its original storage measure: JSON string length in UTF-16 code units. It does not describe UTF-8 encoded bytes. Text policies marked code points count supplementary Unicode characters as one character; DOM limits must preserve that definition.

## Remaining fixed constraints

These constraints are not profile resources. Fixed software bounds are listed honestly; they are not claimed as browser maxima.

| Constraint | Existing value | Reason and product hooks |
| --- | --- | --- |
| Names | 1–32 code points, restricted characters | Language/name grammar; `validateName`, named arguments, generated-name collision handling |
| Project, stage, component and resource labels | 1–80 code points | Existing label/serialization grammar; design and resource-name validation, duplication names and filename generation |
| Callable phrases and editor identifiers | phrase 80; owner key 150; loaded key 80 | Existing name/key encoding contracts; editor-state and workspace-history validation |
| Callable baseline record | `sourceEach × 4 + 30,000` UTF-16 code units | Encoded source and declaration metadata; workspace-history validation inherits the selected source policy |
| IDs | lowercase leading letter, up to 64 ASCII characters | Identifier grammar and references; `safeId`, unique-ID registries |
| Stage geometry | width 200–1,200; height 150–800 | Existing editor/renderer geometry contract; design/executable validation and stage settings |
| Component geometry | width/height 8–1,200 | Existing component rendering/resize contract; validation, transform and resize controls |
| Font size | 8–200 | Existing text-rendering contract; component validation and editing |
| Scale | 1–1,000 percent | Existing transform contract; runtime command, static diagnostics, validation and editor controls |
| Volume | 0–100 percent | Audio meaning and valid range; runtime sound commands |
| Pen width | positive, up to 200 | Existing drawing contract; runtime pen command |
| Synthesized tone | 30–5,000 Hz; 0.01–60 seconds | Existing command domain; runtime tone command |
| Media decode deadline | 10 seconds | Implementation timeout and rollback; asset decode wrapper and runtime preparation |
| Scheduling slice | 200 turns and 8 ms | Cooperative execution/stop guarantee; `EventScheduler.loop` |
| Internal stack unwinding | 1,000 steps per slice | Scheduling implementation guard; enlarged work yields before resuming rather than becoming a project resource |
| Continuous motion trace | newest 1,000 records | Internal observation retention; scheduler continuous-motion bookkeeping |
| Diagnostic count | newest 20 records | Existing diagnostic UI/retention contract; scheduler failure capture |
| Value previews | 80/160 code points; first 40 list entries | Presentation thresholds only; complete runtime values remain available through full-value controls |
| Browser representation | implementation-dependent | Available JS stack/memory, typed-array/string allocation, Canvas size and supported codecs/sample rates |
| Repeat-count integer representation | safe integers from 0 through `Number.MAX_SAFE_INTEGER` | Fixed numeric invariant even when `repeatCount` is unlimited; unsafe integers cannot reliably increment or decrement |
| Structure, types and references | exact keys; valid scalar/list/quantity values; valid unique IDs and complete references | Integrity guarantees in design, AST, executable and saved-project validators; never disabled by unlimited resources |

The fixed recursive guards describe the current recursive implementation. Raising them would require a different parser/evaluator/formatter design and new acceptance tests. Codec support guards describe the supported decode contract, independent of file or duration capacity. Profile selection is applied before schemas, UI input limits and import preflight are created so captured bounds cannot remain at standard values accidentally.

## Conformance coverage

Existing standard boundary tests remain in `audit/suites/runLimitBoundaryTests.js` and the browser design/runtime/asset/media limit cases. Extension-foundation tests exercise standard rejection, finite derivative values, inheritance and `null` through registration, selected-host validation, saving/restoration and independently exported players. A finite fixture above a standard maximum demonstrates software-unlimited behavior; it does not prove unlimited browser resources. Integrity rejection and responsive stop are checked separately.
