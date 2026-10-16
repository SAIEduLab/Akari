/* SPDX-License-Identifier: MIT */
// Builds the single-file product from src/. The committed Akari_<major>_<minor>_<patch>.html
// is this build's output; edit src/ and rebuild instead of editing the product directly.
//   node src/build.mjs          write the product next to the repository root
//   node src/build.mjs --check  fail unless the committed product equals the build
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const templatePath = 'src/akari.html';
// Directories whose every file must be included exactly once.
export const sourceDirectories = ['src/css', 'src/js'];

const includeLine = /^<!-- @include ([a-z0-9][a-z0-9/._-]*) -->$/;
const portableLine = /^\/\/ @portable (extensions\/[a-z0-9._-]+\.js)$/;
const releaseLine = /^ {2}const PRODUCT_RELEASE = '(\d+\.\d+\.\d+)';$/m;
const exportLine = /^if \(typeof (?:module|globalThis) !== 'undefined'.*;$/;

const readText = root => file => fs.readFileSync(path.join(root, file), 'utf8');
const listFiles = root => dir => fs.readdirSync(path.join(root, dir)).sort().map(name => dir + '/' + name);

function requireLines(text, file) {
  if (!text.endsWith('\n') || text.includes('\r')) throw Error(file + ': expected LF-terminated text');
}

// A portable extension source is embedded without its final module/global export line.
function portableSource(text, file) {
  requireLines(text, file);
  const body = text.slice(0, -1), cut = body.lastIndexOf('\n');
  if (!exportLine.test(body.slice(cut + 1))) throw Error(file + ': expected a final export line');
  return body.slice(0, cut + 1);
}

function expand(text, file, read, used, pattern, resolve) {
  requireLines(text, file);
  return text.slice(0, -1).split('\n').map(line => {
    const match = line.match(pattern);
    if (!match) {
      if (line.includes('@include ') || line.includes('@portable ')) throw Error(file + ': malformed directive: ' + line);
      return line + '\n';
    }
    const target = resolve(match[1]);
    if (used.has(target)) throw Error(file + ': included twice: ' + target);
    used.add(target);
    return target.endsWith('.js') && target.startsWith('extensions/')
      ? portableSource(read(target), target)
      : expand(read(target), target, read, used, portableLine, name => name);
  }).join('');
}

export function buildProduct({root = repositoryRoot, read = readText(root), list = listFiles(root)} = {}) {
  const used = new Set();
  const html = expand(read(templatePath), templatePath, read, used, includeLine, name => 'src/' + name);
  const unused = sourceDirectories.flatMap(list).filter(file => !used.has(file));
  if (unused.length) throw Error('source files not included: ' + unused.join(', '));
  const release = html.match(releaseLine);
  if (!release) throw Error('PRODUCT_RELEASE not found');
  return {file: 'Akari_' + release[1].replaceAll('.', '_') + '.html', html, sources: [templatePath, ...used]};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {file, html} = buildProduct();
  const target = path.join(repositoryRoot, file);
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    if (!current || !current.equals(Buffer.from(html, 'utf8'))) {
      console.error(file + ' does not match the build from src/');
      process.exitCode = 1;
    } else console.log(file + ' matches the build from src/');
  } else {
    fs.writeFileSync(target, html);
    console.log('Built ' + file);
  }
}
