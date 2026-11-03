/* SPDX-License-Identifier: MIT */
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

const marker = '  function configureAkariFoundation() { return { extensions: [], profiles: [], profile: null, allowedCapabilities: [] }; }';
const json = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));

/** Bundle author-controlled zero-closure factories into a standalone derived editor. */
export async function buildDerivedProduct({product,output,extensions=[],profiles=[],profile=null,allowedCapabilities=[]}) {
  const html = await fs.readFile(product,'utf8');
  if (html.split(marker).length!==2) throw Error('Expected one unmodified foundation bootstrap in the product');
  const portable = await fs.readFile(new URL('./foundation.js',import.meta.url),'utf8');
  const scope = vm.createContext({TextEncoder,DataView,AbortController});
  vm.runInContext(portable,scope);
  vm.runInContext(await fs.readFile(new URL('./profiles.js',import.meta.url),'utf8'),scope);
  const standard=html.match(/const STANDARD_LIMITS = (\{[\s\S]*?\});/),
    retention=html.match(/createAkariProfiles\(STANDARD_LIMITS, (\{[\s\S]*?\})\);/);
  if(!standard||!retention) throw Error('Product profile defaults are missing');
  const policies=vm.runInContext(`createAkariProfiles((${standard[1]}),(${retention[1]}))`,scope);
  for(const definition of profiles) policies.register(vm.runInContext('('+json(definition)+')',scope));
  if(profile) policies.select(profile.id,profile.version);
  // Cross-realm JSON manifests become realm-local records through canonical JSON.
  const host = scope.createAkariExtensionHost({allowedCapabilities});
  const definitions=[];
  for (const {manifest,factory} of extensions) {
    const realmManifest = vm.runInContext('('+json(manifest)+')',scope);
    host.register(realmManifest,factory);
    const source=Function.prototype.toString.call(factory);
    if (/<\/script/i.test(source)||/\[native code\]/.test(source)) throw Error('Factory cannot be embedded as inline code');
    definitions.push(`{manifest:${json(manifest)},factory:(${source})}`);
  }
  const configuration=`{extensions:[${definitions.join(',')}],profiles:${json(profiles)},profile:${json(profile)},allowedCapabilities:${json(allowedCapabilities)}}`;
  const result=html.replace(marker,`  function configureAkariFoundation() { return ${configuration}; }`);
  await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
  await fs.writeFile(output,result,'utf8');
  return path.resolve(output);
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const [product,configuration,output]=process.argv.slice(2);
  if (!product||!configuration||!output) throw Error('Usage: node extensions/build.mjs product.html configuration.mjs output.html');
  const config=await import(pathToFileURL(path.resolve(configuration)).href);
  console.log(await buildDerivedProduct({product,output,...config.default}));
}
