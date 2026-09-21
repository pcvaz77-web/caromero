import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccessEmail,emailAccessLicense} from '../../../supabase/functions/generate-siap-ai-draft/email-access.mjs';
const now=Date.parse('2026-09-21T12:00:00Z');const mail='professor@example.com';
test('normaliza email sem aceitar entradas invalidas',()=>{assert.equal(normalizeAccessEmail(' Professor@Example.com '),mail);for(const input of ['',null,'x','x@a','a b@a.com']) assert.equal(normalizeAccessEmail(input),null);});
test('email existente sem direito e trial gratuito nao liberam sessao persistente',()=>{assert.equal(emailAccessLicense({active:true,mode:'external',freeUses:{planning:2}},{active:false},mail,now),null);assert.equal(emailAccessLicense({active:false,mode:'subscription'},{active:false},mail,now),null);});
test('concessao e assinatura ativas liberam as funcoes gerais',()=>{for(const mode of ['carometro','subscription']) assert.equal(emailAccessLicense({active:true,mode},{active:false},mail,now).active,true);});
test('credito ou concessao de provas nao libera planejamento',()=>{for(const status of ['credits','granted']) {const access=emailAccessLicense({active:true,mode:'external',freeUses:{planning:2}},{active:true,status},mail,now);assert.equal(access.active,false);assert.equal(access.examAccess.active,true);assert.equal(access.freeUses,null);}});
test('combo valido libera geral, vencido nao',()=>{assert.equal(emailAccessLicense({active:false},{active:true,generalUntil:'2026-10-01T00:00:00Z'},mail,now).active,true);assert.equal(emailAccessLicense({active:false},{active:false,generalUntil:'2026-09-01T00:00:00Z'},mail,now),null);});
