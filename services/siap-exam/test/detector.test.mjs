import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const ctx=vm.createContext({});vm.runInContext(readFileSync(new URL('../public/card-detector.js',import.meta.url),'utf8'),ctx);
test('detector não dispara em fundo vazio e exige estabilidade entre quadros',()=>{
 const pixels=new Uint8ClampedArray(320*480*4).fill(255);const result=ctx.SiapCardDetector.inspect(pixels,320,480,20);
 assert.equal(result.ready,false);assert.equal(ctx.SiapCardDetector.motion(result.gray,result.gray),0);
 assert.ok(ctx.SiapCardDetector.motion(result.gray,new Uint8Array(result.gray.length))>4);
});
for(const count of [15,20,30])test(`detector reconhece cartão CEPI compacto com cinco alternativas e ${count} questões`,()=>{
 const width=320,height=480,pixels=new Uint8ClampedArray(width*height*4).fill(255);
 for(let block=0;block<3;block++)for(let row=0;row<Math.min(Math.ceil(count/3),count-block*Math.ceil(count/3));row++)for(let option=0;option<5;option++){
   const cx=25+block*100+option*15,cy=130+row*25;
   for(let degree=0;degree<360;degree++)for(const radius of [4,5,6]){
     const angle=degree*Math.PI/180,x=Math.round(cx+radius*Math.cos(angle)),y=Math.round(cy+radius*Math.sin(angle)),index=(y*width+x)*4;
     pixels[index]=pixels[index+1]=pixels[index+2]=0;
   }
 }
 const result=ctx.SiapCardDetector.inspect(pixels,width,height,count);
 assert.equal(result.ready,true);assert.equal(result.rows,count);
});
