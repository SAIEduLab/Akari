// Valid local media fixtures, generated independently of Akari's validators.
const zlib=require('zlib');
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc=b=>{let n=0xffffffff;for(const x of b)n=table[(n^x)&255]^(n>>>8);return(n^0xffffffff)>>>0;};
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function png(width,height,seed=1){
 const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const at=y*(width*4+1)+1+x*4;raw[at]=seed&255;raw[at+1]=(seed>>>8)&255;raw[at+2]=(seed*31)&255;raw[at+3]=255;}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function padPNG(bytes,total){
 if(total<bytes.length+14)throw Error('PNG padding needs a complete ancillary chunk');const parts=[bytes.subarray(0,-12)];let left=total-bytes.length;
 while(left){let size=Math.min(left,1024*1024);if(left-size>0&&left-size<14)size-=14;const data=Buffer.alloc(size-12,120);data[0]=107;data[1]=0;parts.push(chunk('tEXt',data));left-=size;}
 parts.push(bytes.subarray(-12));return Buffer.concat(parts);
}
function wav({channels=1,sampleRate=8000,seconds=0.05,frames=Math.round(seconds*sampleRate),bits=16,seed=1}={}){
 const align=channels*bits/8,length=frames*align,out=Buffer.alloc(44+length+(length&1));out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(channels,22);out.writeUInt32LE(sampleRate,24);out.writeUInt32LE(sampleRate*align,28);out.writeUInt16LE(align,32);out.writeUInt16LE(bits,34);out.write('data',36);out.writeUInt32LE(length,40);if(bits===8)out.fill(128,44,44+length);if(length)out[44]=seed&255;return out;
}
function stripMP3(bytes){let start=0,end=bytes.length;if(bytes.subarray(0,3).toString()==='ID3'){start=10+((bytes[6]&127)<<21)+((bytes[7]&127)<<14)+((bytes[8]&127)<<7)+(bytes[9]&127);if(bytes[5]&16)start+=10;}if(bytes.subarray(-128,-125).toString()==='TAG')end-=128;return bytes.subarray(start,end);}
function padMP3(bytes,total){bytes=stripMP3(bytes);const length=total-bytes.length-10;if(length<0||length>=2**28)throw Error('ID3 padding range');const tag=Buffer.alloc(length+10);tag.write('ID3');tag[3]=3;for(let i=0;i<4;i++)tag[6+i]=(length>>((3-i)*7))&127;return Buffer.concat([tag,bytes]);}
module.exports={png,padPNG,wav,stripMP3,padMP3};
