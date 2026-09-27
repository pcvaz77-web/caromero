import test from 'node:test';
import assert from 'node:assert/strict';
import {whatsappTransport} from '../supabase/functions/_shared/platform-whatsapp-transport.ts';
import {validOverrideKey} from '../supabase/functions/platform-whatsapp-webhook/auth.ts';

const config={META_WHATSAPP_GRAPH_VERSION:'v25.0',META_WHATSAPP_ACCESS_TOKEN:'meta-test',DUALHOOK_API_KEY:'dualhook-test'};
const env=values=>name=>values[name];

test('usa endpoint oficial por padrão e troca somente para o provedor configurado',()=>{
  assert.deepEqual(whatsappTransport(env(config)),{
    baseUrl:'https://graph.facebook.com/v25.0',token:'meta-test',provider:'meta'
  });
  assert.deepEqual(whatsappTransport(env({...config,WHATSAPP_API_PROVIDER:'dualhook'})),{
    baseUrl:'https://api.dualhook.com/v25.0',token:'dualhook-test',provider:'dualhook'
  });
  assert.equal(whatsappTransport(env({...config,WHATSAPP_API_PROVIDER:'unknown'})),null);
  assert.equal(whatsappTransport(env({...config,WHATSAPP_API_PROVIDER:'dualhook',DUALHOOK_API_KEY:''})),null);
});

test('override do parceiro exige chave longa e exata na URL',()=>{
  const key='a'.repeat(32)+'b';
  assert.equal(validOverrideKey(`https://example.com/webhook?key=${key}`,key),true);
  assert.equal(validOverrideKey('https://example.com/webhook?key=errado',key),false);
  assert.equal(validOverrideKey('https://example.com/webhook?key=curta','curta'),false);
});
