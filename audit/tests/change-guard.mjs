// Pull-request entry: node audit/tests/change-guard.mjs <baseSha> <headSha> <report.json>
// Labels are read from the pull request event payload at GITHUB_EVENT_PATH.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {changeGuard,formatGuardReport} from '../lib/change-guard.mjs';
const [base,head,output]=process.argv.slice(2);
assert.ok(base&&head&&output,'usage: change-guard.mjs <baseSha> <headSha> <report.json>');
const repo=path.resolve(import.meta.dirname,'../..');
const report=await changeGuard({repo,base,head,eventPath:process.env.GITHUB_EVENT_PATH});
fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const summary=formatGuardReport(report);
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(report.status!=='PASS')process.exitCode=1;
