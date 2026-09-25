import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccessEmail,emailAccessLicense} from '../../../supabase/functions/generate-siap-ai-draft/email-access.mjs';

test('normaliza e valida o e-mail digitado',()=>{
  assert.equal(normalizeAccessEmail(' Professor@EXAMPLE.com '),'professor@example.com');
  assert.equal(normalizeAccessEmail('invalido'),null);
});

test('reconhece concessão, compra e teste grátis com usos restantes',()=>{
  const exam={active:false};
  for(const license of [
    {active:true,mode:'carometro',status:'manual'},
    {active:true,mode:'subscription',status:'subscribed'},
    {active:true,mode:'external',status:'free',freeUses:{planning:1,content:0,attendance:0,pei:0}}
  ]) {
    const result=emailAccessLicense(license,exam,'professor@example.com');
    assert.equal(result.active,true);
    assert.equal(result.accountEmail,'professor@example.com');
    assert.equal(result.mode,license.mode);
  }
});

test('nega conta sem licença, concessão encerrada e teste esgotado',()=>{
  for(const license of [
    {active:false,mode:'external',status:'free',freeUses:{planning:0}},
    {active:false,mode:'external',status:'grant_ended'},
    {active:false,mode:'subscription',status:'expired'}
  ]) assert.equal(emailAccessLicense(license,{active:false},'professor@example.com'),null);
});
