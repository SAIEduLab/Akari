import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {snapshot,sha} from './product-test-host.mjs';
import {currentProductFile} from './product-path.cjs';
import {browserEnvironment} from './browser-environment.mjs';

// Fixed C-SoundCommand inputs and independent acoustic expectations. The probe
// records the browser's rendered PCM at the final gain output, before the device.
// It is not a decoder test, an OS loopback capture, or a human listening result.
export const audioOutputCases=[
 {id:'TONE',source:'440Hzの音を0.2秒鳴らし始める。\n「通過」と言う。',seconds:0.8,frequencies:[440],durations:[.2],wait:false},
 {id:'TONE_WAIT',source:'440Hzの音を0.2秒鳴らす。\n「通過」と言う。',seconds:0.8,frequencies:[440],durations:[.2],wait:true},
 {id:'SET_VOLUME',source:'440Hzの音を0.2秒鳴らす。\n音量を50％にする。\n440Hzの音を0.2秒鳴らす。\n「通過」と言う。',seconds:1.1,frequencies:[440,440],durations:[.2,.2],wait:true},
 {id:'PITCH_UP',source:'音の高さを1段階上げる。\n440Hzの音を0.2秒鳴らす。\n「通過」と言う。',seconds:.8,frequencies:[466.1637615],durations:[.2],wait:true},
 {id:'PITCH_DOWN',source:'音の高さを1段階下げる。\n440Hzの音を0.2秒鳴らす。\n「通過」と言う。',seconds:.8,frequencies:[415.3046976],durations:[.2],wait:true},
 {id:'STOP_ALL',source:'440Hzの音を5秒鳴らし始める。\n0.3秒待つ。\nすべての音を止める。\n「通過」と言う。',other:'660Hzの音を5秒鳴らす。\n「解放」と言う。',seconds:1.2,frequencies:[440,660],durations:[.3,.3]},
 {id:'SAMPLE',source:'音「ベル」を鳴らし始める。\n「通過」と言う。',seconds:1,frequencies:[440],durations:[.4],wait:false},
 {id:'SAMPLE_WAIT',source:'音「ベル」を鳴らす。\n「通過」と言う。',other:'音「長い音」を鳴らす。\n「別音終了」と言う。',seconds:1.6,frequencies:[440,660],durations:[.4,1],wait:true},
];
export function wave(samples,rate=48000){
 const out=Buffer.alloc(44+samples.length*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);samples.forEach((v,i)=>out.writeInt16LE(Math.round(Math.max(-1,Math.min(1,v))*32767),44+i*2));return out;
}
export function fixtureWave(seconds,frequency){return wave(Array.from({length:Math.round(48000*seconds)},(_,i)=>.2*Math.sin(2*Math.PI*frequency*i/48000)));}
export function measureWave(bytes){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,16),'WAVEfmt ');assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt16LE(34),16);assert.equal(bytes.readUInt32LE(40),bytes.length-44);
 const rate=bytes.readUInt32LE(24),samples=Array.from({length:(bytes.length-44)/2},(_,i)=>bytes.readInt16LE(44+i*2)/32767),active=[];
 samples.forEach((v,i)=>{if(Math.abs(v)>.001)active.push(i);});assert.ok(active.length>100,'recorded output must contain real nonzero PCM');const first=active[0],last=active.at(-1),trim=Math.ceil(rate*.015),start=first+trim,end=last-trim;assert.ok(end>start);
 let energy=0,crossings=[];for(let i=start;i<=end;i++){energy+=samples[i]**2;if(samples[i-1]<=0&&samples[i]>0)crossings.push(i-1+(-samples[i-1])/(samples[i]-samples[i-1]));}
 assert.ok(crossings.length>=15);
 // A render-quantum discontinuity contributes an extra crossing and biases a
 // whole-window crossing count. Measure the typical individual period instead;
 // retain the old mean and the interquartile span so transients stay visible.
 const periods=crossings.slice(1).map((v,i)=>rate/(v-crossings[i])).sort((a,b)=>a-b),middle=Math.floor(periods.length/2),frequency=periods.length%2?periods[middle]:(periods[middle-1]+periods[middle])/2;
 const meanFrequency=(crossings.length-1)*rate/(crossings.at(-1)-crossings[0]),periodIqr=periods[Math.floor(periods.length*.75)]-periods[Math.floor(periods.length*.25)];
 return {rate,frames:samples.length,first:first/rate,last:last/rate,duration:(last-first+1)/rate,frequency,meanFrequency,periodIqr,rms:Math.sqrt(energy/(end-start+1)),silentTail:(samples.length-1-last)/rate};
}
export function verifyAudioOutput(report,baseDir){
 assert.equal(report.schema,'akari-audio-output-browser-v1');assert.equal(report.status,'PASS');assert.equal(report.uxAcceptance,false);assert.equal(report.observation,'WebAudio final output PCM; original destination connection retained');assert.deepEqual(report.snapshot,snapshot(currentProductFile()));assert.deepEqual(report.environment,{browser:browserEnvironment.version,playwright:browserEnvironment.playwright});assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.networkRequests,[]);assert.ok(!report.hostFailure);
 assert.deepEqual(report.results.map(r=>r.id),audioOutputCases.map(c=>c.id));
 for(const [i,row]of report.results.entries()){
  const c=audioOutputCases[i],o=row.observed;assert.equal(row.status,'PASS');assert.equal(row.error,undefined);assert.equal(o.source,c.source);assert.equal(o.other,c.other||'');assert.equal(o.designUnchanged,true);assert.equal(o.voices.length,c.frequencies.length);assert.equal(o.marker.text,'通過');assert.ok(Number.isFinite(o.marker.time));
  for(const [j,v]of o.voices.entries()){
   assert.match(v.file,/^audio-output-browser\.artifacts\/[A-Z_]+-\d+\.wav$/);assert.match(v.sha256,/^[0-9a-f]{64}$/);assert.ok(Number.isFinite(v.endTime));const m=v.measurement;
   if(baseDir){const bytes=fs.readFileSync(path.join(baseDir,v.file));assert.equal(sha(bytes),v.sha256);assert.deepEqual(measureWave(bytes),m);}
   for(const value of Object.values(m))assert.ok(Number.isFinite(value));assert.ok(m.rate>=8000&&m.rate<=48000);assert.ok(Number.isFinite(m.periodIqr)&&m.periodIqr>=0&&m.periodIqr<2);assert.ok(Math.abs(m.frequency-c.frequencies[j])<2);assert.ok(Math.abs(m.duration-c.durations[j])<.09);assert.ok(m.rms>.015&&m.rms<.2);assert.ok(m.silentTail>=.15);
  }
  if(c.wait===true)assert.ok(o.marker.time>=o.voices[0].endTime,'speech cannot precede the awaited end event');
  if(c.wait===false)assert.ok(o.marker.time<o.voices[0].endTime-.05,'nonwaiting speech must precede the sound end');
  if(c.id==='SET_VOLUME'){assert.ok(o.voices[1].connectedAt>=o.voices[0].endTime);assert.ok(Math.abs(o.voices[1].measurement.rms/o.voices[0].measurement.rms-.5)<.025);assert.ok(o.marker.time>=o.voices[1].endTime);}
  if(c.id==='SAMPLE_WAIT'){assert.ok(o.marker.time<o.voices[1].endTime-.2);assert.equal(o.otherMarker.text,'別音終了');assert.ok(o.otherMarker.time>=o.voices[1].endTime);}
  if(c.id==='STOP_ALL'){assert.equal(o.otherMarker.text,'解放');assert.ok(Math.abs(o.otherMarker.time-o.marker.time)<.1);for(const v of o.voices){assert.ok(v.endTime-v.connectedAt<.55);assert.ok(v.measurement.silentTail>=.5);}}
 }
 return report.results.length;
}
