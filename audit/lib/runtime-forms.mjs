// The forms of the nodes an exported work's run reads (RUNTIME_FORMS, src/ts/01-runtime-restore.ts): what the block
// schemas say each block always has, and what src/types/syntax-base.d.ts says each form only 名人 text writes has.
// A part is key:type, where the type is e (a value), e[min,max] (a list of values), B (a list of sentences), L (the
// lanes of sentences done together), t (a variable or a list), s (text), n (a number), b (true or false), q (where a
// name is used, or not written: a name read with no place), a (who), d (a direction), u (a unit), r (the rule a part is picked by) or S (a list of texts). product-source checks the
// product's table against both (RUNTIME-FORMS).
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// The declarations of the forms only 名人 text writes.
export const meijinDeclarationsFile = 'src/types/syntax-base.d.ts';

// A field's type by its schema type (a comment, a heading and the names of a call's inputs are not read as parts: the
// export leaves the comments out, and restoreExecutable checks the others where they are).
const FIELD_TYPES = Object.freeze({name: 's', string: 's', reference: 's', number: 'n', boolean: 'b', qualifier: 'q', 'actor-ref': 'a', direction: 'd', unit: 'u'});

// The parts each block schema says its block always has, by the schema's id (a block being written and a target, which
// is written with no kind, have none).
export function schemaForms(schemas) {
  const forms = new Map();
  for (const schema of schemas) {
    if (schema.draftOnly || schema.kind === 'Hole' || schema.kind === 'TargetReference') continue;
    const parts = [];
    for (const f of schema.fields) if (f.required !== false && FIELD_TYPES[f.type]) parts.push(f.key + ':' + FIELD_TYPES[f.type]);
    for (const i of schema.inputs) if (i.required !== false) {
      const type = i.type === 'target' ? 't' : i.type === 'expression' ? 'e' : null;
      if (!type) throw Error(schema.id + '.' + i.key + ': an input of the type ' + i.type + ' that is always there');
      parts.push(i.key + ':' + type + (i.multiple ? '[' + i.minItems + ',' + i.maxItems + ']' : ''));
    }
    for (const b of schema.bodies) if (b.required !== false) parts.push(b.key + ':B');
    forms.set(schema.id, parts.join(' '));
  }
  return forms;
}

// The parts of a type the declaration file writes: a value, a list of them, sentences, lanes, a variable or a list, who,
// a rule, text (a choice of texts too), true or false, a number.
function partType(ts, node) {
  const text = node.getText();
  const types = {Expression: 'e', 'string[]': 'S', 'Expression[]': 'e[]', 'Statement[]': 'B', 'Statement[][]': 'L', TargetReference: 't', ActorRef: 'a', PartPickRule: 'r', string: 's', boolean: 'b', number: 'n'};
  if (Object.hasOwn(types, text)) return types[text];
  if (ts.isUnionTypeNode(node) && node.types.every(t => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))) return 's';
  throw Error('a part of the type ' + text + ' (syntax-base.d.ts) that has no type of the forms');
}

// The forms only 名人 text writes (SyntaxExtraStatement, SyntaxExtraExpression in syntax-base.d.ts), by the id a
// block of the same kind and op would have, with their parts that are always there (a list without its counts).
export function meijinForms(declarations) {
  const ts = require('typescript');
  const file = ts.createSourceFile('syntax-base.d.ts', declarations, ts.ScriptTarget.Latest, true), aliases = new Map();
  for (const statement of file.statements) if (ts.isTypeAliasDeclaration(statement)) aliases.set(statement.name.text, statement.type);
  const forms = new Map();
  for (const union of ['SyntaxExtraStatement', 'SyntaxExtraExpression']) {
    for (const member of aliases.get(union).types) {
      const literal = (ts.isIntersectionTypeNode(aliases.get(member.getText())) ? aliases.get(member.getText()).types : [aliases.get(member.getText())]).find(ts.isTypeLiteralNode);
      const values = key => { const m = literal.members.find(x => x.name?.getText() === key); if (!m) return [null];
        return (ts.isUnionTypeNode(m.type) ? m.type.types : [m.type]).map(t => t.literal.text); };
      const parts = literal.members.filter(m => !m.questionToken && !['kind', 'op', 'sensor', 'inlineComment'].includes(m.name.getText()))
        .map(m => m.name.getText() + ':' + partType(ts, m.type));
      for (const kind of values('kind')) for (const op of member.getText() === 'ExtensionValueRead' ? values('sensor') : values('op'))
        forms.set(kind + (op ? ':' + op : ''), parts.sort().join(' '));
    }
  }
  return forms;
}

// What differs between the product's table (an id and its parts, each [key, type]) and the forms the schemas and the
// declarations make: a form missing or extra, or a form with other parts. A 名人 form of a block's kind and op (a signal
// to some parts, MeijinBroadcast) has the block's parts: the run checks its own where they are (its targets).
export function runtimeFormMismatches(table, schemas, declarations) {
  const own = new Map([...table].map(([id, parts]) => [id, parts.map(([key, type]) => key + ':' + type).sort().join(' ')]));
  const blocks = schemaForms(schemas), meijin = meijinForms(declarations), out = [];
  const sorted = spec => spec.split(' ').filter(Boolean).sort().join(' ');
  for (const [id, spec] of blocks) if (!own.has(id)) out.push(id + ': a block form not in the table');
    else if (own.get(id) !== sorted(spec)) out.push(id + ': the table has ' + own.get(id) + ', the schema ' + sorted(spec));
  for (const [id, spec] of meijin) if (blocks.has(id)) continue;
    else if (!own.has(id)) out.push(id + ': a 名人 form not in the table');
    else if (own.get(id).replace(/\[\d+,\d+\]/g, '[]') !== spec) out.push(id + ': the table has ' + own.get(id) + ', syntax-base.d.ts ' + spec);
  for (const id of own.keys()) if (!blocks.has(id) && !meijin.has(id)) out.push(id + ': a form no schema and no declaration has');
  return out;
}
