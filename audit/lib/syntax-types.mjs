// The types of the syntax tree (src/types/syntax.d.ts), made from the product's block schemas (Akari.BLOCK_SCHEMAS):
// one type for each kind, a union of its forms where a discriminator (op, name, sensor, event, role) tells them apart.
// What the schemas do not describe (the heading of a script, the parts of a sentence that only 名人 text writes, an
// extension's operations, where a node is written) is written by hand in src/types/syntax-base.d.ts.
//   node audit/lib/syntax-types.mjs          fail unless src/types/syntax.d.ts is what the schemas make
//   node audit/lib/syntax-types.mjs --write  write it
// product-source checks it at each run (SYNTAX-TYPES).
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
export const syntaxTypesFile = 'src/types/syntax.d.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The type of a field, an input or an annotation by its schema type.
const VALUE_TYPES = Object.freeze({
  'boolean': 'boolean', 'string': 'string', 'number': 'number', 'name': 'string', 'comment': 'string', 'annotation': 'string',
  'reference': 'string', 'unit': 'Unit', 'qualifier': 'Qualifier', 'actor-ref': 'ActorRef', 'argument-names': 'string[]',
  'heading': 'Heading', 'expression': 'Expression', 'target': 'Target', 'rule': 'Rule', 'script': 'ScriptUnit', 'direction': 'string',
});
const CATEGORY_UNIONS = Object.freeze({statement: 'Statement', expression: 'Expression', rule: 'Rule', target: 'Target', script: 'Script'});
const literal = value => JSON.stringify(value);

function member(item, valueType) {
  const type = item.choices ? item.choices.map(literal).join(' | ') : VALUE_TYPES[valueType];
  if (!type) throw Error('a schema type with no type: ' + valueType);
  return {key: item.key, type: item.multiple ? (item.choices ? '(' + type + ')[]' : type + '[]') : type, optional: !item.required};
}

// The members of one schema: its discriminator, fields, inputs, bodies and annotations, in that order.
function members(schema) {
  const list = [];
  if (schema.discriminator && schema.kind !== 'Hole') list.push({key: schema.discriminator.key, type: literal(schema.discriminator.value), optional: false, discriminator: true});
  if (schema.kind === 'Hole') list.push({key: 'role', type: literal(schema.discriminator.value), optional: false, discriminator: true});
  for (const f of schema.fields || []) list.push(member(f, f.type));
  for (const i of schema.inputs || []) list.push(member(i, i.type));
  for (const b of schema.bodies || []) list.push({key: b.key, type: 'Statement[]', optional: !b.required});
  for (const a of schema.annotations || []) list.push(member(a, a.type));
  return list;
}

// The text of src/types/syntax.d.ts for the schemas.
export function syntaxTypes(schemas) {
  const byKind = new Map();
  for (const schema of schemas) {
    if (schema.kind === 'ExtensionCommand' || schema.kind === 'ExtensionCalculation') continue; // by the registered extensions: syntax-base.d.ts
    if (!byKind.has(schema.kind)) byKind.set(schema.kind, []);
    byKind.get(schema.kind).push(schema);
  }
  const lines = [
    '// Made by audit/lib/syntax-types.mjs from the block schemas (Akari.BLOCK_SCHEMAS): do not edit, run',
    '// `node audit/lib/syntax-types.mjs --write`. A form whose discriminator differs and whose members are the same is',
    '// one form with a union of discriminator values.',
    // (the module's name is built, so no audit scan reads this text as an import of the generator)
    'import type { ActorRef, BlockHeading, ExtensionCalculation, ExtensionCommand, Heading, NodeBase, Qualifier, Readable, ScriptBase, ScriptUnit, StatementBase, SyntaxExtraExpression, SyntaxExtraStatement, Unit } ' + 'from ' + "'./syntax-base.d.ts';",
    'import type { BlockTree } ' + 'from ' + "'./blocks.d.ts';",
  ];
  const categories = new Map(), add = (category, type) => categories.set(category, [...(categories.get(category) || []), type]);
  for (const [kind, list] of [...byKind].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    // Forms with the same members are one form (a Hole keeps one form for each role: its role is its category).
    const forms = new Map();
    for (const schema of list) {
      const all = members(schema), own = all.filter(m => !m.discriminator), discriminator = all.find(m => m.discriminator);
      const shape = JSON.stringify(own) + (kind === 'Hole' ? discriminator.type : '');
      const form = forms.get(shape) || {key: discriminator?.key, values: [], members: own};
      if (discriminator) form.values.push(discriminator.type);
      forms.set(shape, form);
    }
    // A target is written as a name, without a kind (syntaxSchema reads any target that is no Hole as TargetReference).
    const named = kind !== 'TargetReference', category = list[0].category;
    const text = [...forms.values()].map(form => '{ ' + [...(named ? [`kind: ${literal(kind)}`] : []), ...(form.key ? [`${form.key}: ${form.values.join(' | ')}`] : []),
      ...form.members.map(m => `${m.key}${m.optional ? '?' : ''}: ${m.type}`)].join('; ') + ' }');
    const base = !named ? '' : kind === 'Hole' ? 'NodeBase & ' : category === 'statement' || category === 'rule' ? 'StatementBase & ' : category === 'script' ? 'ScriptBase & ' : 'NodeBase & ';
    lines.push(`export type ${kind} = ${base}${text.length === 1 ? text[0] : '(' + text.join(' | ') + ')'};`);
    if (kind === 'Hole') for (const role of new Set(list.map(s => s.discriminator.value))) add(role, `(Hole & { role: ${literal(role)} })`);
    else if (list.some(s => s.category !== category)) throw Error(kind + ': schemas of more than one category');
    else add(category, kind);
  }
  for (const [category, union] of Object.entries(CATEGORY_UNIONS)) {
    if (category === 'script') continue;
    const extra = category === 'statement' ? ['ExtensionCommand', 'SyntaxExtraStatement'] : category === 'expression' ? ['ExtensionCalculation', 'SyntaxExtraExpression'] : [];
    // (each form readable for the others' members: syntax-base.d.ts, Readable)
    lines.push(`export type ${union} = Readable<${[...(categories.get(category) || []), ...extra].join(' | ')}>;`);
  }
  lines.push(...blockMemberTypes(schemas));
  return lines.join('\n') + '\n';
}

// The members of a block (BlockTree) by their keys, from the product's schemas (an extension's block is made with the
// keys args and actorRef, which they have): a field has the types its schemas give it (a block's heading is the
// heading a block keeps, BlockHeading), and an input is one block or a list of blocks in every schema that has it
// (else the schemas make no such type).
function blockMemberTypes(schemas) {
  const fields = new Map(), inputs = new Map(), bodies = new Set();
  for (const schema of schemas) {
    for (const f of schema.fields || []) { const type = f.type === 'heading' ? 'BlockHeading' : member(f, f.type).type; fields.set(f.key, new Set([...(fields.get(f.key) || []), ...type.split(' | ')])); }
    for (const i of schema.inputs || []) {
      const type = i.multiple ? 'BlockTree[]' : 'BlockTree';
      if (inputs.has(i.key) && inputs.get(i.key) !== type) throw Error('the input ' + i.key + ' is one block in a schema and a list in another');
      inputs.set(i.key, type);
    }
    for (const b of schema.bodies || []) bodies.add(b.key);
  }
  const sorted = map => [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  return [
    '// The members of a block (BlockTree, blocks.d.ts) by their keys, as every schema that has a key keeps it (an input is',
    '// one block or a list of blocks in all of them). An input its schema may leave out is not there (undefined); every',
    '// body of a block\'s schema is written. A key given as a value (node.bodies[key]) is taken from the block\'s own schema.',
    // (a key of text in one schema is text: its choices in another add nothing)
    'export type BlockTreeFields = { ' + sorted(fields).map(([key, types]) => `${key}?: ${[...types].filter(t => !(types.has('string') && t.startsWith('"'))).sort().join(' | ')}`).join('; ') + ' } & { [key: string]: unknown };',
    'export type BlockTreeInputs = { ' + sorted(inputs).map(([key, type]) => `${key}?: ${type}`).join('; ') + ' } & { [key: string]: BlockTree | BlockTree[] | undefined };',
    'export type BlockTreeBodies = { ' + [...bodies].sort().map(key => `${key}?: BlockTree[]`).join('; ') + ' } & { [key: string]: BlockTree[] };',
  ];
}

// The block schemas of the product (no extension registered).
export function productSchemas(productFile) {
  const {loadApi} = require('../browser/cases/audit-lib.cjs');
  return loadApi(fs.readFileSync(productFile, 'utf8')).BLOCK_SCHEMAS;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {currentProductFile} = require('./product-path.cjs');
  const text = syntaxTypes(productSchemas(currentProductFile())), file = path.join(root, syntaxTypesFile);
  if (process.argv.includes('--write')) { fs.writeFileSync(file, text); console.log('Wrote ' + syntaxTypesFile); }
  else if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) { console.error(syntaxTypesFile + ' is not what the block schemas make: run node audit/lib/syntax-types.mjs --write'); process.exitCode = 1; }
  else console.log(syntaxTypesFile + ': as the block schemas make it');
}
