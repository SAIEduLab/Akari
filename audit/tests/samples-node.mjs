import fs from 'node:fs';
import {loadApi} from '../browser/cases/audit-lib.cjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifySampleCatalog,verifySampleRuntime} from '../lib/samples-node-checks.mjs';
const file=process.argv[2]||currentProductFile(),source=fs.readFileSync(file,'utf8'),A=loadApi(source);
verifySampleCatalog(A,source);console.log('PASS SAMPLES-CATALOG (Node)');
verifySampleRuntime(A);console.log('PASS SAMPLES-RUNTIME (Node)');
console.log('Browser UI, offline downloads and native audio output are not certified by this Node-only check.');
