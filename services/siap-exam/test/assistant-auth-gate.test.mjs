import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {normalizeAccessEmail,emailAccessLicense} from '../../../supabase/functions/generate-siap-ai-draft/email-access.mjs';
import {consumeDeviceFreeUse} from '../../../supabase/functions/generate-siap-ai-draft/device-free-use.mjs';

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
  new Function('Deno','createClient','examAccessForUser','examBlockKey','normalizeAccessEmail','emailAccessLicense','consumeDeviceFreeUse',stripTypeScriptTypes(source))(
    {env:{get:key=>env[key]},serve:fn=>handle=fn},
    (_url,key)=>key==='service-test'?admin:{},
    async()=>({active:false}),
    ()=>' ',normalizeAccessEmail,emailAccessLicense,consumeDeviceFreeUse
  );
  return body => handle(new Request('https://test.supabase.co/functions/v1/generate-siap-ai-draft',{
    method:'POST',headers:{Origin:'chrome-extension://test',Authorization:'Bearer anon-test',...(body.token?{'X-Assistant-Session':body.token}:{})},
    body:JSON.stringify(body.payload)
  }));
}

test('e-mail inexistente não emite sessão do Assistente',async()=>{
  const request=handlerFor({rpc:async()=>({data:null,error:null}),from:()=>{throw Error('sessão não deve ser criada');}});
  const response=await request({payload:{action:'email_device_session',email:'unknown@example.com'}});
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{ok:false,code:'no_active_access'});
});

test('e-mail com concessão vigente recebe sessão sem confirmação adicional',async()=>{
  let inserted=null;
  const admin={
    rpc:async(name,args)=>{assert.equal(name,'siap_assistant_resolve_access_email');assert.equal(args.p_email,'teacher@example.com');return {data:'user-1',error:null};},
    from:table=>{
      if(table==='siap_assistant_access_grants') return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{revoked_at:null,expires_at:null}})})})};
      if(table==='siap_assistant_device_sessions') return {insert:async value=>{inserted=value;return {error:null};}};
      throw Error(`consulta inesperada: ${table}`);
    }
  };
  const response=await handlerFor(admin)({payload:{action:'email_device_session',email:' Teacher@Example.com '}});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.ok,true);
  assert.equal(body.license.mode,'carometro');
  assert.equal(body.license.accountEmail,'teacher@example.com');
  assert.equal(inserted.user_id,'user-1');
  assert.ok(inserted.token_hash);
  assert.notEqual(body.deviceToken,inserted.token_hash);
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
