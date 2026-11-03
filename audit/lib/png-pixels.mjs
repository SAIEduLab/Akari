import zlib from 'node:zlib';
import assert from 'node:assert/strict';

// The pixels of a browser screenshot: 8-bit RGB or RGBA, not interlaced, as Chromium writes them. at(x, y) gives
// [r, g, b] in image pixels.
export function pngPixels(buffer){
  assert.ok(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'a PNG file');
  let at=8,width=0,height=0,type=-1;const data=[];
  while(at<buffer.length){
    const length=buffer.readUInt32BE(at),kind=buffer.toString('ascii',at+4,at+8),body=buffer.subarray(at+8,at+8+length);
    if(kind==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);assert.equal(body[8],8,'8-bit samples');type=body[9];assert.equal(body[12],0,'not interlaced');}
    if(kind==='IDAT')data.push(body);
    at+=12+length;
  }
  assert.ok(type===2||type===6,'RGB or RGBA');
  const bytes=type===6?4:3,raw=zlib.inflateSync(Buffer.concat(data)),stride=width*bytes,out=Buffer.alloc(height*stride);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1));
    for(let x=0;x<stride;x++){
      const a=x>=bytes?out[y*stride+x-bytes]:0,b=y?out[(y-1)*stride+x]:0,c=x>=bytes&&y?out[(y-1)*stride+x-bytes]:0;
      const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
      out[y*stride+x]=(line[x]+[0,a,b,(a+b)>>1,pa<=pb&&pa<=pc?a:pb<=pc?b:c][filter])&255;
    }
  }
  return {width,height,at:(x,y)=>[0,1,2].map(k=>out[y*stride+x*bytes+k])};
}

// WCAG 2.2 relative luminance and contrast ratio of two [r, g, b] colours.
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((sum,v,k)=>sum+v*[0.2126,0.7152,0.0722][k],0);
export function contrastRatio(a,b){const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+0.05)/(lo+0.05);}
