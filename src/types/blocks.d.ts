// The blocks (05-command-presentation.ts): the schema of each block, the tree a block is kept as, and what making or
// checking a block is given. Types only; the product holds none of this.
import type { Diagnostic, Symbols } from './compiled.d.ts';
import type { Project } from './project.d.ts';
import type { BlockTreeBodies, BlockTreeFields, BlockTreeInputs, Expression, Rule, Script, Statement, Target } from './syntax.d.ts';
import type { Readable, SourceSpan, Unit } from './syntax-base.d.ts';
import type { SentenceNode, SourceRanges } from './parse.d.ts';
import type { EditorContext } from './editor.d.ts';

// What a block is in the syntax tree, and the node of each.
export type SchemaCategory = 'script' | 'statement' | 'expression' | 'target' | 'rule';
export type NodeOfCategory<C extends SchemaCategory> = { script: Script; statement: Statement; expression: Expression; target: Target; rule: Rule }[C];
export type SyntaxNode = NodeOfCategory<SchemaCategory>;
// A field, an input, a body or an annotation of a block: its member in the node, its name for the child, what it holds
// and whether it must be there; a list input has its number of items, the names of the items and what joins them.
export interface SchemaItem {
  readonly key: string; readonly label: string; readonly type?: string; readonly required: boolean; readonly initial?: unknown;
  readonly multiple?: boolean; readonly minItems?: number; readonly maxItems?: number; readonly initialItems?: number;
  readonly labels?: readonly string[]; readonly variadic?: boolean; readonly separator?: string; readonly initialValues?: readonly Expression[];
  readonly choices?: readonly string[]; readonly callable?: boolean; readonly editable?: boolean; readonly multiline?: boolean;
  // A body that must hold a sentence (when: only while the node has that member), a field that offers みんな.
  readonly requiredExecutable?: boolean; readonly when?: string; readonly everyone?: boolean;
  // How many items the language contract counts for a made block's arguments, or a builtin's least and most.
  readonly semanticArity?: string; readonly semanticMin?: number; readonly semanticMax?: number;
}
// What making a block is given: a draft (holes where the child chooses), the names the editor offers for its values,
// and the place a new 決めたばしょへ行く starts at.
export interface CreateContext {
  draft?: boolean; allowHoles?: boolean;
  costume?: string; backdrop?: string; inputTarget?: string; textTarget?: string; partTarget?: string; spriteTarget?: string;
  designPosition?: { x: number; y: number } | null;
}
// What keeping a node as blocks is given: the category it is, the prefix of the ids, the names it was read with.
export interface EncodeContext { expected?: SchemaCategory; idPrefix?: string; symbols?: Symbols | null; allowHoles?: boolean }
// A block as it is kept: its id, its schema, and its members by the schema's keys (its annotations are memos: text);
// each member key has the type every schema gives it (syntax.d.ts, made from the schemas).
export interface BlockTree {
  id: string; schemaId: string; fields: BlockTreeFields; inputs: BlockTreeInputs; bodies: BlockTreeBodies; annotations: Record<string, string>;
}
// Where each block came from in the source (blockEncode's nodeMap): its path in the tree, its kind, its place.
export type BlockLocation = {
  path: (string | number)[]; kind: string;
  surface?: SourceRanges; sourceSpan?: SourceSpan; endLine?: number; raw?: string; source?: string;
};
// Where a block is in its tree (buildBlockIndex): in a body of its parent at a place, in an input of its parent (at a
// place when the input holds a list), or at the root; the blocks it is inside, and its path from the root.
export type BlockPlaceInTree = { ancestors: string[]; path: (string | number)[] } & (
  | { parentId: string; body: string; input: null; index: number }
  | { parentId: string; body: null; input: string; index: number | null }
  | { parentId: null; body: null; input: null; index: null });
// A block with where it is in its tree.
export type BlockIndexEntry = BlockPlaceInTree & { node: BlockTree };
// The walk of buildBlockIndex down a tree: from the root, into a body of a parent at a place, or into an input of a parent
// (at a place when the input holds a list); the blocks passed and the path go with it.
export interface IndexWalk {
  (node: BlockTree | undefined): void;
  (node: BlockTree | undefined, parentId: string, body: string, input: null, position: number, ancestors: string[], path: (string | number)[]): void;
  (node: BlockTree | undefined, parentId: string, body: null, input: string, position: number | null, ancestors: string[], path: (string | number)[]): void;
}
export interface EncodedBlocks { tree: BlockTree; nodeMap: Map<string, BlockLocation>; nodeIds: WeakMap<object, string> }
// Whether a block can be put in a body (blockAvailability): the source's context, the body as read, the work, and what
// the check found.
export interface AvailabilityContext extends EditorContext { ast?: Script; project?: Project }
export interface Availability { enabled: boolean; reason: string; diagnostics: Diagnostic[] }
// Where a block is to be put (blockInsertionAvailability): in a body at a place, or in an input (at a place of its list).
export type InsertLocation =
  | { parentId: string; body: string; index: number; input?: undefined }
  | { parentId: string; input: string; index?: number | null; body?: undefined };
// Whether a block from the list can be put there (blockInsertionAvailability): the answer and why not, what the check
// found (a check that could not be made gives its code and words only), the block that would be put there, and whether
// it would be a draft with a hole.
export interface InsertionAvailability {
  enabled: boolean; reason: string; diagnostics: (Pick<Diagnostic, 'code' | 'message'> & Partial<Diagnostic>)[];
  node?: BlockTree; draftOnly?: boolean;
}
// An input holds a node of its category; a list input (multiple) has the number of its items.
export type InputItem = SchemaItem & { readonly type: SchemaCategory } & (
  | { readonly multiple: false } | { readonly multiple: true; readonly minItems: number; readonly maxItems: number });
// What an input is made with beside its key, name and category: a list input gives its number of items.
export type InputExtra = Omit<Partial<SchemaItem>, 'type' | 'multiple' | 'minItems' | 'maxItems'> & ({ multiple?: false } | { multiple: true; minItems: number; maxItems: number });
// The schema without its calls (what makes, keeps and checks its blocks), as it is built before they are set.
export type SchemaData = Omit<BlockSchema, 'create' | 'encode' | 'decode' | 'availability'>;
export interface BlockSchema {
  readonly id: string; readonly kind: string; readonly discriminator: { readonly key: string; readonly value: string } | null;
  readonly category: SchemaCategory; readonly palette: string; readonly label: string;
  readonly fields: readonly SchemaItem[]; readonly inputs: readonly InputItem[]; readonly bodies: readonly SchemaItem[]; readonly annotations: readonly SchemaItem[];
  // What the block can do that the language contract names, the roles of its members, a block only for drafts.
  readonly capability?: string; readonly semanticRoles?: readonly string[]; readonly draftOnly?: boolean;
  create(context?: CreateContext): SyntaxNode;
  encode(node: SyntaxNode, context?: EncodeContext): EncodedBlocks;
  decode(tree: unknown, context?: EncodeContext): SyntaxNode;
  availability(context?: AvailabilityContext): Availability;
}
// How a command block is shown and written (COMMAND_PRESENTATION): its group, and for each op its label, the names of
// its inputs, and its sentence (arg writes an input, in a unit when one is given).
// (arg writes the input at the index, as a quantity of the unit when one is given)
export type ArgWriter = (index: number, unit?: Unit) => string;
export interface CommandPresentation {
  readonly label: string; readonly inputs: readonly string[];
  format(arg: ArgWriter, node: SentenceNode): string;
}
export interface CommandGroup { readonly palette: string; readonly operations: { readonly [op: string]: CommandPresentation | undefined } }
// A change the block editor asks of a source (prepareBlockEdit): a value of a block, the そうでなければ of a もし, memo
// lines, a block put in, copied, put round the blocks below it, moved (alone or with those below it), taken out or
// replaced, a value block put in, its operator changed, an optional value taken out, a value moved (another put in its
// place), an item of a list of values put in, taken out or moved, several changes at once, or none.
export type BlockOperation = Readable<
  | { type: 'batch'; operations: BlockOperation[] } | { type: 'cancel' } | { type: 'noop' }
  | { type: 'field' | 'annotation'; id: string; key: string; value: unknown }
  | { type: 'else'; id: string; enabled: boolean }
  | { type: 'comment-lines'; id: string; lines: string[] }
  | { type: 'insert'; parentId: string; body: string; index: number; node: BlockTree }
  | { type: 'duplicate'; id: string; parentId: string; body: string; index: number }
  | { type: 'wrap'; parentId: string; body: string; index: number; id?: string; node?: BlockTree }
  | { type: 'move' | 'move-run'; id: string; parentId: string; body: string; index: number }
  | { type: 'remove'; id: string }
  | { type: 'replace'; id: string; node: BlockTree }
  | { type: 'expression'; parentId: string; input: string; index?: number | null; node: BlockTree }
  | { type: 'operator'; id: string; schemaId: string }
  | { type: 'optional-input-remove'; parentId: string; input: string }
  | { type: 'expression-move'; id: string; parentId: string; input: string; index?: number | null; replacement?: BlockTree }
  | { type: 'variadic-insert'; parentId: string; input: string; index: number; node: BlockTree }
  | { type: 'variadic-remove'; parentId: string; input: string; index: number }
  | { type: 'variadic-move'; parentId: string; input: string; index: number; toIndex: number }>;
