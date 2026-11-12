import { AKARI_LICENSE, PRODUCT_RELEASE } from './00-prelude.ts';
import { createAkariProfiles } from '../../extensions/profiles.ts';
import { createAkariExtensionHost } from '../../extensions/foundation.ts';
import { createAkariRuntime } from './01-runtime.ts';
import { AKARI_RUNTIME, AkariError, AssetRuntimeCache, AssetStore, COLOR_NAMES, COMMAND_CATALOG, EVENT_BY_TYPE, EXTENSION_HOST, EventScheduler, GRAMMAR_REGISTRY, LANGUAGE_CONTRACT_ID, LIMITS, PRNG, PROJECT_FORMAT_ID, RuntimeModel, assertRuntimeValueLimit, availableHints, cloneDesignProject, collectRuntimeAssetRequirements, cpLen, decodeBase64, encodeBase64, evalExpression, hintCandidates, insertSource, insertionContext, isQuantity, normalizeSource, numberValue, quantity, resolveColor, runUserFunction, sha256, sha256Fallback, tailText, unitOf, validateName } from './02-language-contracts.ts';
import { DEFAULT_MASCOT_ASSET_ID, DEFAULT_MASCOT_SHA256, STANDARD_AKARI_MASCOT, makeDefaultAssetStore, makeDefaultProject, makeEmptyProject } from './03-default-assets-core.ts';
import { buildSymbols, makeSampleAssetStore, makeSampleProject, nameSource, sampleCatalog, validateDesignProject } from './03-default-assets.ts';
import { CONDITION_FORMS, SENTENCE_FORMS, formatCondition, parseCondition, parseExpression, parseSyntax } from './04-syntax-expressions.ts';
import { blockSource, parseScript } from './04-syntax-scripts.ts';
import { keptCharacters, localEditKept, mistakeAtClause, surfaceLineSlice, surfaceRow } from './04-syntax-sentences.ts';
import { meijinProjectDefinitions } from './04-meijin-syntax.ts';
import { BLOCK_SCHEMAS, BLOCK_SCHEMA_BY_ID, blockDecode, blockEncode, createBlock, syntaxSchema, validateSyntaxAst } from './05-command-presentation.ts';
import { formatExpression, formatScript } from './06-source-formatting.ts';
import { buildProjectReferenceGraph, collectSignalNames, resourceChangeImpact, scriptBySourceKey, scriptHeadingMetadata, scriptSourceKey, sourceReferences, sourceRegistry, updateScriptSource } from './07-semantic-analysis-core.ts';
import { analyzeAst, assetStateFingerprint, astEquivalent, canonicalizeAudio, canonicalizeImage, checkAudioContainerLimits, checkAudioLimits, checkImageLimits, collectReachableAssetIds, compileProject, decodeWorkspaceHistory, encodeWorkspaceHistory, parseDataFormInitial, parseProjectFile, prepareMeijinProcedureRename, prepareResourceRename, serializeProject, sniffAudio, sniffImage, stableJson, validateAssetReferences, validateEditorState, validateSerializedProjectStructure } from './07-semantic-analysis.ts';
import { createAkariStageView } from './08-stage-view.ts';
import { PORTABLE_FUNCTIONS, generateStandaloneHtml, packExecutable } from './08-stage-and-export.ts';
import { blockInsertionAvailability, builtinAssetRecords, blockPaletteGroup, blockShapeKind, blockShapePath, blockZoomCore, blockZoomScroll, buildBlockIndex, createEditorSession, prepareBlockEdit, refreshEditorSession, resolvedEditorMode, searchReading } from './09-editor-sessions.ts';
import { searchIntent } from './09-editor-search-core.ts';
import { assistCandidates, assistKeepsCondition, assistKeepsWritten, assistProposalKeepsSubject, assistSeeds, blockBodyRanges, blockPaletteSearchText, blockSearchCandidates, searchHintCandidates } from './09-editor-search.ts';
import { COLOR_PRESETS, DESIGN_RESIZE_DIRECTIONS, designResizeGeometry, designResizeMode, designResizePoint, pickerHex, pickerHexToHsv, pickerHsvToHex, pickerRgb, pickerWheelHS } from './10-block-view.ts';
import { app, initApp } from './11-application.ts';

// ────────────────────────────────────────────────────────────────────────
// 12 — Public diagnostic API and browser bootstrap
// ────────────────────────────────────────────────────────────────────────
const Akari = {
  // Narrow references for diagnostics; no fixtures, test dispatch or mutable app state.
  diagnostics: Object.freeze({
    AKARI_LICENSE,
    AkariError,
    COLOR_NAMES,
    DEFAULT_MASCOT_ASSET_ID,
    DEFAULT_MASCOT_SHA256,
    DESIGN_RESIZE_DIRECTIONS,
    STANDARD_AKARI_MASCOT,
    assetStateFingerprint,
    assertRuntimeValueLimit,
    assistKeepsCondition,
    assistKeepsWritten,
    blockBodyRanges,
    blockInsertionAvailability,
    blockPaletteGroup,
    blockShapeKind,
    blockShapePath,
    blockZoomCore,
    blockZoomScroll,
    buildBlockIndex,
    checkAudioContainerLimits,
    checkAudioLimits,
    checkImageLimits,
    cloneDesignProject,
    cpLen,
    keptCharacters,
    localEditKept,
    pickerRgb,
    resolveColor,
    resolvedEditorMode,
    runUserFunction,
    stableJson,
    mistakeAtClause,
    surfaceLineSlice,
    surfaceRow,
    tailText,
    validateAssetReferences,
    validateName,
    validateSerializedProjectStructure,
  }),
  COLOR_PRESETS,
  pickerHex,
  pickerHsvToHex,
  pickerHexToHsv,
  pickerWheelHS,
  designResizeMode,
  designResizePoint,
  designResizeGeometry,
  createEditorSession,
  scriptSourceKey,
  scriptBySourceKey,
  scriptHeadingMetadata,
  updateScriptSource,
  sourceRegistry,
  sourceReferences,
  buildProjectReferenceGraph,
  resourceChangeImpact,
  prepareResourceRename,
  prepareMeijinProcedureRename,
  meijinProjectDefinitions,
  refreshEditorSession,
  prepareBlockEdit,
  parseSyntax,
  analyzeAst,
  astEquivalent,
  BLOCK_SCHEMAS,
  BLOCK_SCHEMA_BY_ID,
  syntaxSchema,
  validateSyntaxAst,
  blockEncode,
  blockDecode,
  createBlock,
  blockInsertionAvailability,
  createAkariProfiles,
  createAkariExtensionHost,
  extensions: EXTENSION_HOST,
  profiles: AKARI_RUNTIME.profiles,
  createAkariRuntime,
  createAkariStageView,
  // The functions an exported player embeds (their text alone makes its runtime, stage view and player).
  PORTABLE_FUNCTIONS,
  packExecutable,
  generateStandaloneHtml,
  restoreExecutable: AKARI_RUNTIME.restoreExecutable,
  EXECUTABLE_CONTRACT: AKARI_RUNTIME.EXECUTABLE_CONTRACT,
  get app() {
    return app;
  },
  PRODUCT_RELEASE,
  LANGUAGE_CONTRACT_ID,
  PROJECT_FORMAT_ID,
  LIMITS,
  GRAMMAR_REGISTRY,
  SENTENCE_FORMS,
  CONDITION_FORMS,
  EVENT_BY_TYPE,
  COMMAND_CATALOG,
  blockSource,
  availableHints,
  hintCandidates,
  searchHintCandidates,
  blockSearchCandidates,
  blockPaletteSearchText,
  searchReading,
  searchIntent,
  assistSeeds,
  assistCandidates,
  assistProposalKeepsSubject,
  collectSignalNames,
  insertionContext,
  insertSource,
  nameSource,
  makeDefaultProject,
  makeEmptyProject,
  sampleCatalog,
  makeSampleProject,
  makeSampleAssetStore,
  makeDefaultAssetStore,
  validateProject: validateDesignProject,
  validateDesignProject,
  buildSymbols,
  normalizeSource,
  parseExpression,
  parseCondition,
  parseScript,
  formatExpression,
  formatCondition,
  quantity,
  isQuantity,
  numberValue,
  unitOf,
  formatScript,
  compileProject,
  RuntimeModel,
  EventScheduler,
  PRNG,
  evalExpression,
  AssetStore,
  AssetRuntimeCache,
  collectReachableAssetIds,
  collectRuntimeAssetRequirements,
  sniffImage,
  sniffAudio,
  canonicalizeImage,
  canonicalizeAudio,
  encodeBase64,
  decodeBase64,
  sha256,
  sha256Fallback,
  serializeProject,
  validateEditorState,
  parseDataFormInitial,
  encodeWorkspaceHistory,
  // (a kept history may hold every picture built into the product without its bytes, as the page keeps it)
  decodeWorkspaceHistory: (saved: Parameters<typeof decodeWorkspaceHistory>[0], builtins: Parameters<typeof decodeWorkspaceHistory>[1] = builtinAssetRecords()) => decodeWorkspaceHistory(saved, builtins),
  parseProjectFile,
};
// (the page's global object takes the public API by name: no type of the library has it)
if (typeof globalThis !== 'undefined') (globalThis as { Akari?: unknown }).Akari = Akari;
if (typeof document !== 'undefined') {
  initApp();
}
