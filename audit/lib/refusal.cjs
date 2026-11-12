// The reason a check refuses a wrong input with. A negative assertion passes only when the checked code refused that
// input for the reason written down for it; a crash (TypeError, ReferenceError, SyntaxError, …), a missing file, a
// refusal by another assertion, a refusal with another code or message, or a thrown value that is not an error never
// counts as the refusal.
//   refusedWith({name, code, message}): the error has this class name, this code and this message (a string is the
//     whole message, a RegExp is tested on it); at least one of code and message is given.
//   refusedAs(site): the next changed input of a site (a loop over changed copies). Its reason is the one written down
//     for that site and row in audit/fixtures/refusal-reasons.json: the error's class name, code, first message line,
//     the audit file whose code threw it, and, where the message shows what differs, that line of it (detail).
const path = require('node:path');
// (read when a site asks for its reason: the change guard loads this module and runs no fixture of the tree it judges)
let reasons = null;
const crashes = new Set(['TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'URIError', 'EvalError', 'InternalError']);
const root = path.resolve(__dirname, '../..');
const self = path.relative(root, __filename).split(path.sep).join('/');
const isError = error => error instanceof Error || Object.prototype.toString.call(error) === '[object Error]';
// The audit file nearest to the throw: where the refusing check is written.
function thrownAt(error) {
  for (const line of String(error.stack ?? '').split('\n').slice(1)) {
    const m = /\(?(?:file:\/\/\/)?([^()\s]+?\.(?:mjs|cjs|js)):\d+:\d+\)?\s*$/.exec(line.trim());
    if (!m) continue;
    const file = path.relative(root, path.resolve(decodeURIComponent(m[1]))).split(path.sep).join('/');
    if (file.startsWith('audit/') && file !== self) return file;
  }
  return null;
}
function reasonOf(error) {
  if (!isError(error)) return null;
  return {name: String(error.name), code: error.code ?? null, line: String(error.message ?? '').split('\n')[0], at: thrownAt(error)};
}
function refusedWith(expected) {
  if (!expected || typeof expected !== 'object' || (expected.code === undefined && expected.message === undefined)) throw new Error('refusedWith needs the code or the message of the refusal');
  if (crashes.has(expected.name)) throw new Error('a crash is not a refusal: ' + expected.name);
  return error => isError(error) && !crashes.has(error.name)
    && (expected.name === undefined || error.name === expected.name)
    && (expected.code === undefined || error.code === expected.code)
    && (expected.message === undefined || (expected.message instanceof RegExp ? expected.message.test(String(error.message)) : error.message === expected.message));
}
const rows = new Map();
function refusedAs(site) {
  const row = rows.get(site) ?? 0;
  rows.set(site, row + 1);
  reasons ??= require('../fixtures/refusal-reasons.json');
  const expected = reasons[site]?.[row];
  const check = error => {
    const got = reasonOf(error);
    return !!expected && !!got && !crashes.has(got.name) && got.name === expected.name && got.code === expected.code && got.line === expected.line && got.at === expected.at
      && (expected.detail === undefined || String(error.message).split('\n').some(line => line.trim() === expected.detail));
  };
  check.site = site; check.row = row;
  return check;
}
module.exports = {refusedWith, refusedAs, reasonOf};
