// A work as it is read (compileProject, 07-semantic-analysis.ts): its names, the syntax tree of each source and the
// mistakes and notes the check finds. Types only; the product holds none of this.
import type { ActionDefinitionData, ComponentType, EventFilter, EventName, FunctionDefinitionData, ListData, Project, RunnableProject, VariableData } from './project.d.ts';
import type { Proposal } from './runtime.d.ts';
import type { ContinuousRule, Expression, Rule, Script, Statement } from './syntax.d.ts';
import type { ActorRef, Readable, SourceSpan } from './syntax-base.d.ts';
import type { ParseContext } from './parse.d.ts';

// A procedure made in the text of a 名人 script (meijinDefinitions, 04-meijin-syntax.ts).
export interface MeijinDefinition {
  id: string; ownerId: 'stage'; name: string; args: string[]; source: string; meijin: true; scriptId: string; line: number; headLine: number;
}
export type ActionDefinition = ActionDefinitionData | MeijinDefinition;
// What an executable keeps of one (packExecutable writes no text of it, nor its heading line).
export type RunnableMeijinDefinition = Omit<MeijinDefinition, 'source' | 'headLine' | 'meijin'>;
// The names of a work (buildSymbols, 03-default-assets.ts).
export interface Symbols {
  project: Project;
  projectVars: Map<string, VariableData>; projectLists: Map<string, ListData>;
  actions: Map<string, ActionDefinition>; functions: Map<string, FunctionDefinitionData>;
  actionCallPhrases: Map<string, ActionDefinitionData>;
  individualNames: Set<string>;
  individualByTargetId: Map<string, { variables: Map<string, VariableData>; lists: Map<string, ListData> }>;
  allDataNames: Set<string>;
}
// Where a source is read: whose it is, when it starts, and for a made block its kind and its arguments.
export interface SourceContext {
  id?: string; scriptId?: string; unitIds?: string[]; documentKey?: string;
  ownerId: string; targetId: string | null; targetType: ComponentType | 'stage' | null;
  event: EventName | null; filter?: EventFilter | null; args: string[];
  definition: Readable<ActionDefinition | FunctionDefinitionData> | null; definitionKind: 'action' | 'function' | null; meijin?: boolean;
}
// One source as read: a script unit, or a made block's body.
export interface SyntaxItem extends SourceContext { key: string; ast: Script; source: string; localVarNames: string[]; localListNames: string[] }
// A mistake or a note of the check: its code, the words, where (line and column from 1, line 0 when the place is not known; the key of its source).
// notice: a note that never stops a run, a save or an export (projectNotes).
export interface Diagnostic {
  code: string; message: string; line: number; column: number; where?: string; notice?: boolean;
  detail?: string; proposals?: Proposal[]; draftRole?: { kind?: string; missing?: string[]; actorRef?: ActorRef; target?: string };
}
// What the words of a mistake are made from (childDiagnosticText, diagnosticDetailText): a mistake of the check, an
// error of a run, or words only; where it is (the key of its source, its line and column) and the details for a teacher.
export interface DiagnosticLike { code?: string; message?: string; where?: string; key?: string; line?: number; column?: number; detail?: string }
// A continuous rule of a script, with the id the runtime keeps it by and the part it is written for.
export type CompiledRule = ContinuousRule & { id: string; targetId: string | null };
export interface CompiledProject {
  symbols: Symbols | null; items: SyntaxItem[]; errors: Diagnostic[]; rules?: CompiledRule[];
  astByKey: Map<string, Script>; notes?: Diagnostic[];
}
// A work whose sources are read (parseProjectSyntax): its names are known, and the rules of its scripts are listed.
export type ParsedProject = CompiledProject & { symbols: Symbols; rules: CompiledRule[] };
// What a run reads of a source (RunnableProgram): its key, owner, tree, part and event, and what an executable may keep
// of the rest (restoreExecutable keeps no text, names made in it, nor the kind of its part).
export type RunnableItem = Pick<SyntaxItem, 'key' | 'ownerId' | 'ast' | 'targetId' | 'event'> &
  Partial<Pick<SyntaxItem, 'id' | 'scriptId' | 'unitIds' | 'documentKey' | 'filter' | 'meijin'>> & { definition?: SyntaxItem['definition'] | RunnableMeijinDefinition };
// What a run takes of a read work (CompiledProject, or an executable restored by restoreExecutable): the sources as
// read, the rules, and the made blocks by name.
export interface RunnableProgram {
  items: RunnableItem[]; rules?: CompiledRule[]; astByKey: Map<string, Script>; errors: Diagnostic[];
  // (the made blocks as a run reads them: an executable restored keeps no text of them)
  symbols: { actions: Map<string, RunnableProject['actions'][number] | RunnableMeijinDefinition>; functions: Map<string, RunnableProject['functions'][number]> } | null;
}
// What a message is put at: a node (its place may be missing), or a line and column made for it.
export type DiagnosticPlace = { sourceSpan?: Partial<SourceSpan> };
// The node a message of the check is put at: a sentence, a rule, or the first line of a source that has no sentence.
export type AnalyzedNode = Statement | Rule | { sourceSpan: { startLine: number; startColumn: number }; kind?: never };
// Where the check reads a node (analyzeProject, 07-semantic-analysis-core.ts): the source's own context, the names made
// in it so far, whether it is 名人 text and the 名人 procedure being called from it, the node the words are about, the
// part the sentences started with, and a part's own data read as その部品の… (the part's name and the read).
export interface AnalyzeContext {
  event: EventName | null; filter?: EventFilter | null; targetType: ComponentType | 'stage' | null; targetId: string | null;
  definition: ActionDefinition | FunctionDefinitionData | null; definitionKind: 'action' | 'function' | null;
  args: string[]; localVarNames: string[]; localListNames: string[]; binders: string[]; availableLocalNames: Set<string>;
  meijin?: boolean; meijinCall?: { node: Statement; where: string; name: string; given: string } | null;
  node?: AnalyzedNode; selfContext?: { targetId: string | null; targetType: ComponentType | 'stage' | null };
  qualifiedName?: string; qualifiedRead?: Expression; valueActor?: boolean;
}
// One editable source of a work (sourceRegistry): its key, whose it is, its kind, the text, the title shown and the
// context it is read in. A draft of the editor (incomplete: an input not yet decided) and a 名人 procedure (lineOffset:
// where its lines are in the script; pathPrefix: the path of its tree) are read as sources too (buildProjectReferenceGraph).
export interface SourceRecord {
  key: string; ownerId: string; id?: string; scriptId?: string; kind: 'script' | 'action' | 'function';
  event?: EventName | null; filter?: EventFilter | null; source: string; title: string; context: SourceContext;
  incomplete?: boolean; lineOffset?: number; pathPrefix?: (string | number)[];
}
// A source being written in the editor, read with the work's own (the drafts of buildProjectReferenceGraph): its key, the
// part it is written for (none for a made block's), whether it is a body or a made block's, its text and title, the
// context the editor reads it in, and whether an input is still to be decided.
export type DraftRecord = Omit<SourceRecord, 'ownerId' | 'kind' | 'context'> & { ownerId: string | null; kind: 'script' | 'draft'; context: ParseContext };
// A thing of the work that a source may name (projectResourceNodes): a part, a look, data, a backdrop, a sound or a
// made block, with the part it belongs to ('stage' for the work's own).
export type ResourceKind = 'component' | 'costume' | 'data' | 'backdrop' | 'sound' | 'action' | 'function';
export interface ResourceNode { key: string; kind: ResourceKind; id: string; name: string; ownerId: string }
// Where in a source a use is: the source, whose it is (none for a made block's draft), the title shown and the line.
export interface SourcePlace { sourceKey: string; ownerId: string | null; title: string; line: number }
// A use of a thing: the name written and how (a name, a name in 「 」, the subject, ふれたとき's partner in the heading or
// kept in the work), the path of its node in the tree and its place in the text.
export interface ResourceReference extends SourcePlace {
  resourceKey: string; name: string; binding: 'name' | 'literal' | 'actor' | 'touch' | 'filter';
  nodePath: (string | number)[] | undefined; range?: { start: number; end: number };
}
// A place whose uses cannot all be found: the kind of thing it may name (null: any), the part whose things it may name,
// and why.
export interface UncertainReference extends SourcePlace { kind: ResourceKind | null; targetOwnerId?: string | null; reason: string }
// A source read for the editor's checks and kept (editorProjectSyntax): its text, what it was read with, and what was read.
export interface EditorSyntaxRecord { source: string; signature: string; parsed: { ast: Script | null; syntaxDiagnostics: Diagnostic[] } }
export interface ReferenceGraph { version: 1; resources: ResourceNode[]; references: ResourceReference[]; uncertain: UncertainReference[] }
// What a name is to the check (targetExists): where it is made (the part's own, the work's, an argument, a local, a
// binder…) and what it holds: one value, a list, or either (what it holds is known only when it runs).
export type DataInfo = { scope: string; kind: 'scalar' | 'list' | 'dynamic' };
