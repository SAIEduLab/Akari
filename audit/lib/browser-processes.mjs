import cp from 'node:child_process';

// How many browser processes are running on the machine: printed before each audit step, so that a step whose page never
// finishes loading shows whether browsers of earlier steps were still running (a stall seen in CI). The count after a
// step is the count before the next.
export function browserProcesses(){
  try{
    if(process.platform==='win32')return cp.execFileSync('tasklist',['/FI','IMAGENAME eq chrome.exe','/FO','CSV','/NH'],{encoding:'utf8'}).split('\n').filter(line=>line.startsWith('"chrome.exe"')).length;
    return cp.execFileSync('ps',['-A','-o','comm='],{encoding:'utf8'}).split('\n').filter(name=>/chrom/i.test(name)).length;
  }catch(error){return 'unknown: '+error.message.split('\n')[0];}
}
