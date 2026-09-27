import test from 'node:test';
import assert from 'node:assert/strict';
import {componentsFor,supported} from '../supabase/functions/platform-whatsapp-campaign/template.ts';

const template = {
  name:'carometro_novidade',language:'pt_BR',category:'MARKETING',status:'APPROVED',
  components:[
    {type:'HEADER',format:'IMAGE'},
    {type:'BODY',text:'Novidade do Carômetro: {{1}}'},
    {type:'BUTTONS',buttons:[
      {type:'URL',text:'Conhecer',url:'https://sistemacarometro.com.br/{{1}}'},
      {type:'PHONE_NUMBER',text:'Falar com atendente',phone_number:'+5511999999999'}
    ]}
  ]
};
const campaign = {
  id:'test',message_body:'Veja a novidade da frequência.',
  video_url:'https://sistemacarometro.com.br/planos',
  cover_url:'https://sistemacarometro.com.br/capa.png',
  target_roles:['teacher'],target_school_id:null,status:'draft'
};

test('monta imagem, texto e botão de link aprovado',()=>{
  assert.equal(supported(template),true);
  assert.deepEqual(componentsFor(template,campaign),[
    {type:'header',parameters:[{type:'image',image:{link:campaign.cover_url}}]},
    {type:'body',parameters:[{type:'text',text:campaign.message_body}]},
    {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:'planos'}]}
  ]);
});

test('recusa link fora do domínio aprovado e capa ausente',()=>{
  assert.throws(()=>componentsFor(template,{...campaign,video_url:'https://outro.example/planos'}),/link_does_not_match_template/);
  assert.throws(()=>componentsFor(template,{...campaign,cover_url:null}),/image_required/);
});

test('recusa variáveis de modelo que o painel não preenche',()=>{
  const incompatible={...template,components:[{type:'BODY',text:'Olá {{1}}, {{2}}'}]};
  assert.equal(supported(incompatible),false);
  assert.throws(()=>componentsFor(incompatible,campaign),/template_not_compatible/);
});

test('não ignora a capa escolhida quando o modelo não tem imagem',()=>{
  const textOnly={...template,components:template.components.filter(c=>c.type!=='HEADER')};
  assert.throws(()=>componentsFor(textOnly,campaign),/template_has_no_image_header/);
});

test('preenche destinos diferentes em dois botões de URL aprovados',()=>{
  const twoLinks={...template,components:template.components.map(component=>component.type==='BUTTONS'
    ?{...component,buttons:[
      {type:'URL',text:'Comprar',url:'https://sistemacarometro.com.br/{{1}}'},
      {type:'URL',text:'Tutorial',url:'https://sistemacarometro.com.br/ajuda/{{1}}'}
    ]}:component)};
  assert.equal(supported(twoLinks),true);
  const output=componentsFor(twoLinks,campaign,{
    0:'https://sistemacarometro.com.br/planos',
    1:'https://sistemacarometro.com.br/ajuda/frequencia'
  });
  assert.deepEqual(output.slice(-2),[
    {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:'planos'}]},
    {type:'button',sub_type:'url',index:'1',parameters:[{type:'text',text:'frequencia'}]}
  ]);
  assert.throws(()=>componentsFor(twoLinks,campaign,{1:'https://outro.example/tutorial'}),/link_does_not_match_template/);
});

test('botão de resposta da campanha encaminha para atendimento no mesmo número',()=>{
  const withHuman={...template,components:template.components.map(component=>component.type==='BUTTONS'
    ?{...component,buttons:[
      {type:'URL',text:'Conhecer',url:'https://sistemacarometro.com.br/{{1}}'},
      {type:'QUICK_REPLY',text:'Falar com atendente'}
    ]}:component)};
  assert.deepEqual(componentsFor(withHuman,campaign).at(-1),{
    type:'button',sub_type:'quick_reply',index:'1',
    parameters:[{type:'payload',payload:'carometro_attendant'}]
  });
});
