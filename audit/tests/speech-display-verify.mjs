import fs from 'node:fs';
import assert from 'node:assert/strict';
import {snapshot} from '../lib/product-test-host.mjs';
import {currentProductFile} from '../lib/product-path.cjs';
import {verifyDisplay,rejectionIds} from '../lib/speech-display-contract.mjs';
const [input,output]=process.argv.slice(2),report=JSON.parse(fs.readFileSync(input)),inputs=snapshot(currentProductFile());
const result=verifyDisplay(report,inputs,input+'.artifacts'),group=(r,id)=>r.results.find(x=>x.id===id).observed;
const controls=[
 r=>r.results.pop(),r=>r.results.push(r.results[0]),r=>r.results[0].status='FAIL',r=>r.snapshot.productSha256='0'.repeat(64),r=>r.browser='unverified',r=>r.networkRequests.push('https://example.invalid'),r=>r.pageErrors.push('exception'),
 r=>group(r,'DISPLAY-BUBBLES')[0].geometry.bubbles[0].headingVisible=true,
 r=>group(r,'DISPLAY-BUBBLES')[0].geometry.bubbles[0].ink.right+=1000,
 r=>group(r,'DISPLAY-PERSISTENCE')[0].loaded=true,
 r=>group(r,'DISPLAY-OBJECT-NAMES')[0].geometry.name='マ…',
 r=>group(r,'DISPLAY-NATIVE-ZOOM')[0].actual=1,
 r=>r.artifacts[0].sha256='0'.repeat(64),
 r=>group(r,'DISPLAY-SETTINGS').rows[0].preview.editorVisible=true,
 r=>group(r,'DISPLAY-SETTINGS').rows[0].preview.inspector.opened=false,
 r=>{const o=group(r,'DISPLAY-SETTINGS').rows[2].paletteFold;o.folded.listHeight=o.opened.listHeight;},
];
assert.equal(controls.length,rejectionIds.length);for(const [i,mutate]of controls.entries()){const r=structuredClone(report);mutate(r);assert.throws(()=>verifyDisplay(r,inputs,input+'.artifacts'),rejectionIds[i]);}
const proof={...result,snapshot:inputs,negativeControls:rejectionIds.map(id=>({id,status:'PASS'}))};if(output)fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n');console.log(`Display audit: ${result.groups} groups, ${result.bubbleCases} speech layouts, ${result.objectCases} object layouts, ${result.zoomCases} native zooms; ${controls.length} rejection controls PASS`);
