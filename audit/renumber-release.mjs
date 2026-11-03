// Renumbers this checkout's product branch after it has taken in its base:
//   node audit/renumber-release.mjs [--base <ref>]     (the base defaults to origin/main)
// Resolve hand-written conflicts first; the product and the release record are rebuilt. Stage and commit the result.
import {renumberRelease} from './lib/release-renumber.mjs';

const args=process.argv.slice(2),at=args.indexOf('--base');
if(args.length!==(at<0?0:2)||at>0||at===0&&!args[1])throw new Error('usage: node audit/renumber-release.mjs [--base <ref>]');
const result=renumberRelease(process.cwd(),at<0?{}:{base:args[1]});
console.log('Release '+result.previous+' -> '+result.version+' (base '+result.baseVersion+' at '+result.base.slice(0,12)+(result.productChanged?', product or src/ changed':', product and src/ unchanged')+')');
for(const file of result.changed)console.log('  '+file);
if(!result.changed.length)console.log('  nothing to change');
