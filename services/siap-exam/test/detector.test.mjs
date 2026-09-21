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
