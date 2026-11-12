/* SPDX-License-Identifier: MIT */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
// The portable factories are TypeScript modules: Node.js erases their types on import (22.18 or later).
if (!process.features.typescript) throw Error('extensions/build.mjs reads TypeScript modules: run it with Node.js 22.18 or later, which erases their types on import');
const {createAkariExtensionHost} = await import('./foundation.ts');
const {createAkariProfiles} = await import('./profiles.ts');

const marker = '  function configureAkariFoundation() { return { extensions: [], profiles: [], profile: null, allowedCapabilities: [] }; }';
const json = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));

/** Bundle author-controlled zero-closure factories into a standalone derived editor. */
export async function buildDerivedProduct({product,output,extensions=[],profiles=[],profile=null,allowedCapabilities=[]}) {
  const html = await fs.readFile(product,'utf8');
  if (html.split(marker).length!==2) throw Error('Expected one unmodified foundation bootstrap in the product');
  // The host and the profiles are made from their text alone in a realm of their own, as the derived product's player
  // makes them; the factories are registered there and checked, not run (they run when the derived product starts).
  const scope = vm.createContext({TextEncoder,DataView,AbortController});
  vm.runInContext(Function.prototype.toString.call(createAkariExtensionHost)+'\n'+Function.prototype.toString.call(createAkariProfiles),scope);
  const standard=html.match(/const STANDARD_LIMITS = (\{[\s\S]*?\});/),
    retention=html.match(/createAkariProfiles\(STANDARD_LIMITS, (\{[\s\S]*?\})\);/),
    builtins=html.match(/const BUILTIN_DEFINITIONS = (Object\.freeze\(\[[\s\S]*?\]\));/),
    contract=html.match(/const EXECUTABLE_CONTRACT = (Object\.freeze\(\{[\s\S]*?\}\));/);
  if(!standard||!retention) throw Error('Product profile defaults are missing');
  if(!builtins||!contract) throw Error('Product built-in calculations or contract are missing');
  // The host checks a definition as the product's host does when the derived product starts: the names of the product's
  // built-in calculations are reserved, and its Standard is the product's contract.
  const hostOptions={...JSON.parse(vm.runInContext(`JSON.stringify({standard:(c=>({languageContractId:c.languageContractId,runtimeContractId:c.runtimeContractId}))(${contract[1]}),
    reservedNames:(${builtins[1]}).map(definition=>definition.name)})`,scope)),allowedCapabilities};
  // The definitions as they are written go through the same checks in this realm first: written as JSON below, a ceiling
  // or a state of NaN or Infinity would become null (no ceiling), and an entry of undefined would be left out.
  const written=createAkariProfiles(vm.runInContext(`(${standard[1]})`,scope),vm.runInContext(`(${retention[1]})`,scope)),
    writtenHost=createAkariExtensionHost(hostOptions);
  for(const definition of profiles) written.register(definition);
  if(profile) written.select(profile.id,profile.version);
  const policies=vm.runInContext(`createAkariProfiles((${standard[1]}),(${retention[1]}))`,scope);
  for(const definition of profiles) policies.register(vm.runInContext('('+json(definition)+')',scope));
  if(profile) policies.select(profile.id,profile.version);
  // Cross-realm JSON manifests become realm-local records through canonical JSON.
  const host = vm.runInContext(`createAkariExtensionHost(${json(hostOptions)})`,scope);
  const definitions=[];
  for (const {manifest,factory} of extensions) {
    writtenHost.register(manifest,factory);
    const realmManifest = vm.runInContext('('+json(manifest)+')',scope);
    host.register(realmManifest,factory);
    // (register above refused, as E701, a factory that cannot be embedded as inline code)
    const source=Function.prototype.toString.call(factory);
    definitions.push(`{manifest:${json(manifest)},factory:(${source})}`);
  }
  const configuration=`{extensions:[${definitions.join(',')}],profiles:${json(profiles)},profile:${json(profile)},allowedCapabilities:${json(allowedCapabilities)}}`;
  // A function gives the text as it is: a string would read $' $& $$ in a factory as replacement patterns.
  const result=html.replace(marker,()=>`  function configureAkariFoundation() { return ${configuration}; }`);
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(output,result,'utf8');
  return path.resolve(output);
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [product,configuration,output]=process.argv.slice(2);
  if (!product||!configuration||!output) throw Error('Usage: node extensions/build.mjs product.html configuration.ts output.html');
  const config=await import(pathToFileURL(path.resolve(configuration)).href);
  console.log(await buildDerivedProduct({product,output,...config.default}));
}
