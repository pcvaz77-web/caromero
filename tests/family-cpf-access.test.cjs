const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { transformSync } = require('../services/siap-exam/node_modules/esbuild');

test('função pública pré-visualiza, ativa e entra por CPF sem celular', async () => {
  const schoolId='11111111-1111-4111-8111-111111111111';
  const userId='22222222-2222-4222-8222-222222222222';
  const profile={id:'33333333-3333-4333-8333-333333333333',school_id:schoolId,
    guardian_name:'Maria da Silva',guardian_user_id:null};
  const calls=[];
  let createdEmail=null;
  let handler;
  const fakeQuery=table=>{
    const query={
      select:()=>query,eq:()=>query,in:()=>query,
      maybeSingle:async()=>({data:table==='schools'?{id:schoolId}:null,error:null}),
      then:(resolve,reject)=>Promise.resolve({data:table==='family_cpf_guardians'?[profile]
        :table==='family_cpf_children'?[{student_id:'student'}]
        :table==='students'?[{id:'student',full_name:'Ana',class_name:'1A'}]:[],error:null}).then(resolve,reject),
    };
    return query;
  };
  const admin={
    from:fakeQuery,
    rpc:async (name,args)=>{
      calls.push({name,args});
      if (name==='family_cpf_claim') profile.guardian_user_id=userId;
      return {data:name==='family_cpf_limit'?true:1,error:null};
    },
    auth:{admin:{
      createUser:async ({email,password})=>{
        createdEmail=email;assert.equal(password,'abcd1234');
        return {data:{user:{id:userId}},error:null};
      },
      getUserById:async()=>({data:{user:{id:userId,email:createdEmail}},error:null}),
    }},
  };
  const auth={auth:{signInWithPassword:async ({email,password})=>{
    calls.push({name:'signIn',email});
    if (!createdEmail || email!==createdEmail || password!=='abcd1234')
      return {data:null,error:{message:'invalid'}};
    return {data:{user:{id:userId,app_metadata:{family_portal:true}},
      session:{access_token:'access',refresh_token:'refresh'}},error:null};
  }}};
  const source=readFileSync(path.join(__dirname,'..','supabase/functions/family-cpf-access/index.ts'),'utf8');
  const compiled=transformSync(source,{loader:'ts',format:'cjs'}).code;
  vm.runInNewContext(compiled,{
    require:()=>({createClient:(_url,key)=>key==='service'?admin:auth}),
    Deno:{env:{get:name=>({
      SUPABASE_URL:'https://backend.test',SUPABASE_SERVICE_ROLE_KEY:'service',
      SUPABASE_ANON_KEY:'anon',FAMILY_CPF_AUTH_SECRET:'s'.repeat(40),
    })[name]},serve:fn=>{handler=fn;}},
    Request,Response,TextEncoder,crypto:webcrypto,console,
  });
  const send=async body=>{
    const response=await handler(new Request('https://backend.test/functions/v1/family-cpf-access',{
      method:'POST',headers:{'x-forwarded-for':'192.0.2.1'},body:JSON.stringify(body),
    }));
    return {status:response.status,body:await response.json()};
  };
  const preview=await send({action:'preview',schoolId,name:'Maria da Silva',cpf:'529.982.247-25'});
  assert.equal(preview.status,200);
  assert.equal(preview.body.students[0].name,'Ana');
  const activated=await send({action:'activate',schoolId,name:'Maria da Silva',
    cpf:'52998224725',password:'abcd1234'});
  assert.equal(activated.status,200);
  assert.equal(activated.body.access_token,'access');
  assert.equal(calls.some(call=>call.name==='family_cpf_claim'),true);
  assert.equal(createdEmail.includes('52998224725'),false);
  const duplicate=await send({action:'preview',schoolId,name:'Maria da Silva',cpf:'52998224725'});
  assert.equal(duplicate.body.existing,true);
  const unknown=await send({action:'preview',schoolId,name:'Outra Pessoa',cpf:'52998224725'});
  assert.equal(unknown.status,404);
  assert.equal(unknown.body.error,'Seu cadastro ainda não foi realizado pela escola. Procure a secretaria.');
  const login=await send({action:'login',cpf:'52998224725',password:'abcd1234'});
  assert.equal(login.status,200);
  assert.equal(login.body.refresh_token,'refresh');
  assert.equal(calls.some(call=>call.name==='signIn' && call.email===createdEmail),true);
  const denied=await send({action:'login',cpf:'52998224725',password:'errada'});
  assert.equal(denied.status,400);
});
