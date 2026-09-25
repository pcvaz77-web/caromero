import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source = readFileSync(new URL('../../../supabase/functions/generate-siap-ai-draft/index.ts',import.meta.url),'utf8')
  .replace(/^import .*\r?\n/gm,'');

function handlerFor(admin) {
  let handle;
  const env = {
    ALLOWED_ORIGINS:'chrome-extension://test',
    SUPABASE_URL:'https://test.supabase.co',
    SUPABASE_ANON_KEY:'anon-test',
    SUPABASE_SERVICE_ROLE_KEY:'service-test'
  };
  new Function('Deno','createClient','examAccessForUser','examBlockKey',stripTypeScriptTypes(source))(
    {env:{get:key=>env[key]},serve:fn=>handle=fn},
    (_url,key)=>key==='service-test'?admin:{},
    async()=>({active:false}),
    ()=>''
  );
  return body => handle(new Request('https://test.supabase.co/functions/v1/generate-siap-ai-draft',{
    method:'POST',headers:{Origin:'chrome-extension://test',Authorization:'Bearer anon-test',...(body.token?{'X-Assistant-Session':body.token}:{})},
    body:JSON.stringify(body.payload)
  }));
}

test('e-mail sozinho nunca emite sessão do Assistente',async()=>{
  const request=handlerFor({rpc:()=>{throw Error('conta não deve ser consultada');},from:()=>{throw Error('sessão não deve ser criada');}});
  const response=await request({payload:{action:'email_device_session',email:'paid@example.com'}});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{ok:false,code:'email_verification_required'});
});

test('Sair revoga o token no servidor antes de consultar licença',async()=>{
  const token='device-token-test';
  const device={id:'session-1',user_id:'user-1',expires_at:new Date(Date.now()+60000).toISOString(),revoked_at:null};
  let updatedId=null;
  const admin={from:table=>{
    assert.equal(table,'siap_assistant_device_sessions');
    return {
      select:()=>({eq:()=>({maybeSingle:async()=>({data:device})})}),
      update:values=>({eq:async(_field,id)=>{updatedId=id;device.revoked_at=values.revoked_at;return {error:null};}})
    };
  }};
  const request=handlerFor(admin);
  const response=await request({token,payload:{action:'revoke_device_session'}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{ok:true});
  assert.equal(updatedId,device.id);
  const after=await request({token,payload:{action:'license_status'}});
  assert.equal(after.status,401);
  assert.equal((await after.json()).code,'device_session_expired');
});
