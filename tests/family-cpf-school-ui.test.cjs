const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('../services/siap-exam/node_modules/jsdom');

test('escola alterna convite individual e QR geral e pré-cadastra sem celular', async () => {
  const schoolId='11111111-1111-4111-8111-111111111111';
  const classId='22222222-2222-4222-8222-222222222222';
  const studentId='33333333-3333-4333-8333-333333333333';
  const dom=new JSDOM('<section id="app"><aside class="side"><div class="nav"></div></aside></section>',{
    url:'https://carometro.example/index.html',runScripts:'outside-only',
  });
  const { window }=dom;
  const calls=[];
  window.getActiveSchoolId=()=>schoolId;
  window.getActiveSchoolRole=()=>'school_admin';
  window.canManageFamilyPortal=()=>true;
  window.qrcode=()=>({ addData:()=>{},make:()=>{},createSvgTag:()=>'<svg></svg>' });
  window.db={
    rpc:async (name,args)=>{
      calls.push({ name,args });
      if (name==='family_school_manager') return { data:true,error:null };
      if (name==='family_cpf_school_roster' || name==='family_school_overview') return { data:[],error:null };
      if (name==='family_cpf_register_bundle') return { data:'guardian-id',error:null };
      return { data:null,error:null };
    },
    from:table=>{
      const query={
        select:()=>query,eq:()=>query,is:()=>query,order:()=>query,
        range:async()=>({ data:table==='students'
          ? [{ id:studentId,full_name:'Ana',class_id:classId,class_name:'1A' }] : [],error:null }),
        then:(resolve,reject)=>Promise.resolve({ data:table==='classes'
          ? [{ id:classId,name:'1A',shift:'Matutino' }] : [],error:null }).then(resolve,reject),
      };
      return query;
    },
  };
  try {
    window.eval(readFileSync(path.join(__dirname,'..','family-school.js'),'utf8'));
    await new Promise(resolve=>window.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
    const el=id=>window.document.getElementById(id);
    window.document.querySelector('.side .nav button').click();
    await new Promise(setImmediate);
    assert.match(el('familyGeneralUrl').value,new RegExp('escola='+schoolId));
    el('familyModeGeneral').click();
    assert.equal(el('familyInviteIdentity').classList.contains('hidden'),true);
    assert.equal(el('familyPhone').required,false);
    assert.equal(el('familyCpfSection').classList.contains('hidden'),false);
    el('familyInviteShift').value='Matutino';
    el('familyInviteShift').onchange();
    el('familyInviteClass').value=classId;
    await el('familyInviteClass').onchange();
    const checkbox=el('familyStudentChoices').querySelector('input[type=checkbox]');
    assert.ok(checkbox);
    checkbox.checked=true;
    checkbox.dispatchEvent(new window.Event('change',{ bubbles:true }));
    el('familyCpfNameSchool').value='Maria da Silva';
    el('familyCpf').value='529.982.247-25';
    el('familySaveCpf').click();
    await new Promise(setImmediate);
    const registration=calls.find(call=>call.name==='family_cpf_register_bundle');
    assert.deepEqual(JSON.parse(JSON.stringify(registration.args)),{
      p_school_id:schoolId,p_student_ids:[studentId],p_name:'Maria da Silva',p_cpf:'52998224725',
    });
    assert.match(el('familyCpfStatus').textContent,/pré-cadastrado/);
    el('familyModeIndividual').click();
    assert.equal(el('familyPhone').required,true);
    assert.equal(el('familyCpfSection').classList.contains('hidden'),true);
  } finally { window.close(); }
});
