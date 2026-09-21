// Explicit, manual smoke test only. Never run as part of npm test.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { recognize } from '../worker.mjs';
let key=process.env.OPENAI_API_KEY || '';
for (const file of ['../../../.env.local','../../../.env']) {
  const path=new URL(file,import.meta.url);
  if (!key && existsSync(path)) {
    const text=readFileSync(path,'utf8');
    key=text.match(/^\s*OPENAI_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim() || '';
  }
}
if (!key) { console.log('Chave indisponivel para teste local; nenhum pedido enviado.'); process.exitCode=1; }
else {
  const start=Date.now();
  try {
    const image='data:image/jpeg;base64,'+readFileSync(new URL('./synthetic-card.jpg',import.meta.url)).toString('base64');
    const fast=process.argv.includes('--student');
    const result=await recognize(image,{OPENAI_API_KEY:key,OPENAI_MODEL:process.env.OPENAI_MODEL || 'gpt-5.6-sol'},fast?{alphabet:'ABCD',answers:Array(15).fill('A'),ranges:[{subject:'Ciências',from:1,to:15}]}:null,process.argv.includes('--official')?{subject:'Ciências da Natureza',total:15}:null);
    const expected='DCDDCACCCDBAADB'.split('');
    const report={synthetic:true,seconds:Math.round((Date.now()-start)/100)/10,recognized:result.answers.length,exact:JSON.stringify(result.answers)===JSON.stringify(expected),studentMode:fast,nameEmpty:result.name==='',warning:result.warning};
    writeFileSync(new URL('./live-vision-result.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
    if (!report.exact) process.exitCode=1;
  } catch { console.log('A API nao concluiu o teste. Nenhum dado real foi enviado; detalhes sensiveis omitidos.'); process.exitCode=1; }
}
