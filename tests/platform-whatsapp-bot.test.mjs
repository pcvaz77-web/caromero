import test from 'node:test';
import assert from 'node:assert/strict';
import {decideAction,linkMessage,menuMessage,selectedAction,validSettings} from '../supabase/functions/platform-whatsapp-webhook/bot.ts';

const settings={
  enabled:true,greeting:'Olá! Como podemos ajudar?',
  link1_label:'Planos',link1_url:'https://sistemacarometro.com.br/planos',
  link2_label:'Novidades',link2_url:'https://sistemacarometro.com.br/novidades',
  attendant_label:'Atendimento'
};

test('monta três opções e envia o link no botão escolhido',()=>{
  assert.equal(validSettings(settings),true);
  const menu=menuMessage(settings,'5561999999999');
  assert.deepEqual(menu.interactive.action.buttons.map(button=>button.reply.id),[
    'carometro_link1','carometro_link2','carometro_attendant'
  ]);
  assert.equal(selectedAction({interactive:{button_reply:{id:'carometro_link2'}}}),'link2');
  const reply=linkMessage(settings,'5561999999999','link2');
  assert.equal(reply.interactive.action.parameters.url,settings.link2_url);
  assert.equal(reply.interactive.action.parameters.display_text,'Novidades');
});

test('mantém saída e atendimento mesmo em resposta digitada',()=>{
  assert.equal(selectedAction({text:{body:' sair '}}),'optout');
  assert.equal(selectedAction({button:{payload:'carometro_attendant'}}),'attendant');
  assert.equal(selectedAction({button:{payload:'carometro_menu'}}),'menu');
  assert.equal(selectedAction({text:{body:'3'}}),'attendant');
  assert.equal(selectedAction({text:{body:'ATENDIMENTO'}}),'attendant');
});

test('recusa configuração insegura ou bot desativado',()=>{
  assert.equal(validSettings({...settings,link1_url:'http://example.com'}),false);
  assert.equal(validSettings({...settings,link2_url:'https://usuario:senha@example.com'}),false);
  assert.equal(validSettings({...settings,enabled:false}),false);
});

test('não repete o menu durante atendimento ou dentro de 24 horas',()=>{
  const now=Date.parse('2026-09-26T12:00:00Z');
  assert.equal(decideAction({text:{body:'Olá'}},null,now),'menu');
  assert.equal(decideAction({text:{body:'Olá'}},{last_menu_at:new Date(now-60_000).toISOString()},now),'ignored');
  assert.equal(decideAction({text:{body:'Dúvida'}},{handoff_until:new Date(now+60_000).toISOString()},now),'ignored');
  assert.equal(decideAction({interactive:{button_reply:{id:'carometro_link1'}}},
    {last_menu_at:new Date(now-60_000).toISOString()},now),'link1');
});
