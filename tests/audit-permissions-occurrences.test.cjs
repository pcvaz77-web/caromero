const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {element,deferred,flush}=require('./helpers/browser-harness.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const between=(source,start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));

test('coordenador recebe quatro checkboxes e so concede flags que possui',()=>{
  const source=read('permissions-and-details.js');
  const context={user:{id:'actor'}};vm.createContext(context);
  vm.runInContext(between(source,'  const teacherPermissionOptions =','  let permissionOpenRequest'),context);
  context.item={user_id:'teacher',member_status:'active'};
  context.rights={can_add_students:true,can_edit_students:true,can_edit_guardian_contact:true,can_view_class_summary:true};
  const render=()=>vm.runInContext('delegatedTeacherChecks(item,rights)',context);
  assert.equal((render().match(/type="checkbox"/g)||[]).length,4);
  assert.doesNotMatch(render(),/disabled/);
  context.rights={can_edit_all:true};assert.equal((render().match(/disabled/g)||[]).length,4);
  context.item.can_add_students=true;assert.equal((render().match(/disabled/g)||[]).length,3);
  context.item.member_status='suspended';assert.equal((render().match(/disabled/g)||[]).length,4);
  assert.match(source,/permission-basic.*delegatedTeacherChecks\(item, actorRights\)/);
});

test('tela do coordenador usa o proprio vinculo quando diretorio retorna apenas professores',async()=>{
  const source=read('permissions-and-details.js'),nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const rights={can_manage_member_permissions:true,can_add_students:true,can_edit_students:true,can_edit_guardian_contact:true,can_view_class_summary:true};
  const membership={id:'actor-member',user_id:'actor',school_id:'school',role:'coordinator',school_member_permissions:rights};
  const teacher={user_id:'teacher',member_id:'teacher-member',member_status:'active',role:'viewer',can_view_class_summary:true,profiles:{full_name:'Professor de teste'}};
  const context={user:{id:'actor'},permission:{role:'viewer',is_coordinator:true,can_manage_member_permissions:true},
    window:{getActiveSchoolId:()=> 'school',canAccessPermissionsNav:()=>true},document:{getElementById:get},esc:value=>String(value||''),
    currentSchoolMembershipOrWarn:async()=>membership,loadSchoolPermissions:async()=>new Map([['teacher',teacher]]),bindMemberAccountActions(){}};
  vm.createContext(context);
  vm.runInContext(between(source,'  const permissionFromMembership =','  // Consulta o vínculo'),context);
  vm.runInContext(between(source,'  const teacherPermissionOptions =','  // can_manage_counselors nunca entra'),context);
  await context.openPermissions();
  let html=get('permissionsList').innerHTML;
  assert.equal((html.match(/type="checkbox"/g)||[]).length,4);
  assert.doesNotMatch(html,/disabled/);
  assert.equal((html.match(/ checked /g)||[]).length,1);
  teacher.can_view_class_summary=false;await context.openPermissions();
  assert.doesNotMatch(get('permissionsList').innerHTML,/disabled/,'depois de desmarcar, o coordenador ainda pode remarcar');
  membership.school_member_permissions=[{...rights,can_add_students:false}];await context.openPermissions();
  assert.equal((get('permissionsList').innerHTML.match(/disabled/g)||[]).length,1,'permissao ausente no proprio vinculo continua bloqueada');
});

test('professor ganha botao de ocorrencias quando permissoes carregam depois da abertura do app',async()=>{
  const source=read('occurrence-management.js'),nodes=new Map(),events=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  let rights={can_view_occurrences:true,can_register_occurrences:true};
  const context={user:{id:'teacher'},window:{getActiveSchoolId:()=> 'school'},document:{getElementById:get,addEventListener:(name,fn)=>events.set(name,fn)},
    occurrenceButton:element(),modal:element(),historyRecords:new Map(),syncSaveAction(){},refreshLabelState:async()=>{},
    db:{auth:{getUser:async()=>({data:{user:{id:'teacher'}}})},removeChannel:async()=>{},from:table=>{
      const query={select(){return this;},eq(){return this;},maybeSingle:async()=>({data:table==='school_members'?{id:'member',school_id:'school',role:'teacher'}:rights})};return query;
    }}};
  context.modal.classList.add('hidden');get('app').classList.add('hidden');vm.createContext(context);
  vm.runInContext(between(source,'  const get =','  const escape ='),context);
  vm.runInContext(between(source,'  const syncOccurrenceNavigation =','  occurrenceButton.onclick'),context);
  vm.runInContext(between(source,"  document.addEventListener('carometro:data-loaded'",'  new MutationObserver(syncOccurrenceNavigation)'),context);
  await context.refreshOccurrenceMembership();vm.runInContext('syncOccurrenceNavigation()',context);
  assert.equal(context.occurrenceButton.hidden,true);
  get('app').classList.remove('hidden');await events.get('carometro:data-loaded')();
  assert.equal(context.occurrenceButton.hidden,false);
  assert.equal(context.occurrenceButton.classList.contains('hidden'),false);
  rights={can_view_occurrences:false};await events.get('carometro:data-loaded')();
  assert.equal(context.occurrenceButton.hidden,true,'revogacao continua ocultando o botao');
});

function occurrenceContext(queryResult){
  const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const messages=[],deletedFiles=[];
  const context={get,user:{id:'actor'},window:{getActiveSchoolId:()=>context.school},school:'school-a',
    occurrenceMembership:{school_id:'school-a'},editingOccurrence:{id:'occ-1',created_by:'actor',attachment_path:'old-file'},pendingAttachment:null,removeAttachment:false,savingOccurrence:false,
    selectedClass:()=> 'class-a',selectedStudent:()=> 'student-a',classes:[{id:'class-a',name:'A'}],
    canEditOccurrence:()=>true,canRegisterOccurrence:()=>true,canDeleteOccurrence:()=>true,canViewOccurrences:()=>true,
    occurrenceStudentIds:new Set(),occurrenceCounts:new Map(),historyRecords:new Map(),historyRequest:0,labelRequest:0,
    focusedHistoryStudentId:null,students:[],escape:value=>value,formatDate:value=>value,formatDateTime:value=>value,
    crypto:{randomUUID:()=> 'new-id'},OCCURRENCE_ATTACHMENT_BUCKET:'occurrence-attachments',
    toast:value=>messages.push(value),paintStudentCards(){},publishOccurrenceLabelState(){},syncSaveAction(){},resetOccurrenceScreen(){},renderAttachmentState(){},refreshHistory:async()=>{},confirmOccurrenceDeletion:async()=>true,
    db:{from:()=>{const builder={};for(const method of ['select','update','insert','delete','eq','order','in','gte','lte','range','maybeSingle'])builder[method]=()=>builder;builder.then=(resolve,reject)=>Promise.resolve(typeof queryResult==='function'?queryResult():queryResult).then(resolve,reject);return builder;},storage:{from:()=>({remove:async paths=>{deletedFiles.push(...paths);return {error:null};}})}}
  };
  get('occurrenceDate').value='2026-09-21';get('occurrenceText').value='Descrição de teste';
  vm.createContext(context);
  vm.runInContext(between(read('occurrence-management.js'),'  const occurrenceScope =','  const isSchoolAdmin'),context);
  return {context,get,messages,deletedFiles};
}
test('edicao sem linha afetada nao anuncia sucesso nem remove anexo antigo',async()=>{
  const h=occurrenceContext({data:null,error:null});
  vm.runInContext(between(read('occurrence-management.js'),'  async function save()','  function editOccurrence'),h.context);
  await h.context.save();
  assert.match(h.messages.at(-1),/não foi alterada/);
  assert.equal(h.deletedFiles.length,0);assert.equal(h.context.savingOccurrence,false);
  assert.equal(h.get('occurrenceText').value,'Descrição de teste');
});
test('exclusao sem linha afetada preserva arquivo e indicadores',async()=>{
  const h=occurrenceContext({data:null,error:null});
  vm.runInContext(between(read('occurrence-management.js'),'  async function deleteOccurrence','  const syncOccurrenceNavigation'),h.context);
  await h.context.deleteOccurrence({id:'one',attachment_path:'old-file'});
  assert.equal(h.deletedFiles.length,0);assert.match(h.messages.at(-1),/Nenhuma ocorrência foi excluída/);
});
test('salvamento duplo e falha de rede nao duplicam escrita nem prendem botao',async()=>{
  const pending=deferred();let writes=0;const h=occurrenceContext(()=>{writes++;return pending.promise;});
  vm.runInContext(between(read('occurrence-management.js'),'  async function save()','  function editOccurrence'),h.context);
  const first=h.context.save();await flush();await h.context.save();
  assert.equal(writes,1);pending.reject(new Error('offline'));await first;
  assert.equal(h.context.savingOccurrence,false);assert.match(h.messages.at(-1),/Consulte o histórico/);
});
test('historico descarta resposta do filtro anterior e pagina alem de mil ocorrencias',async()=>{
  const old=deferred();let calls=0;
  const h=occurrenceContext(()=>{calls++;return calls===1?old.promise:{data:[{id:'new',occurred_on:'2026-09-21',occurrence_text:'Novo filtro'}],error:null};});
  h.get('occurrenceSearchClass').value='class-a';
  vm.runInContext(between(read('occurrence-management.js'),'  async function readOccurrencePages','  async function open()'),h.context);
  const first=h.context.refreshHistory();await flush();await h.context.refreshHistory();
  old.resolve({data:[{id:'old',occurrence_text:'Filtro anterior'}],error:null});await first;
  assert.match(h.get('occurrenceHistoryList').innerHTML,/Novo filtro/);
  assert.doesNotMatch(h.get('occurrenceHistoryList').innerHTML,/Filtro anterior/);
  const ranges=[];const result=await h.context.readOccurrencePages(()=>({range:async(from,to)=>{ranges.push([from,to]);return {data:Array(from===0?1000:1).fill({id:'row'}),error:null};}}));
  assert.equal(result.data.length,1001);assert.deepEqual(ranges,[[0,999],[1000,1999]]);
});
test('lista principal separa ativos do historico e rejeita escola antiga',async()=>{
  const pending=deferred();let delay=false;
  const context={window:{getActiveSchoolId:()=>context.school},user:{id:'a'},school:'school-a',classes:[],students:[],selectedClassId:null,detailStudentId:null,
    loadObservationOptions:async()=>{},cachedPhotoUrl:()=>'',render(){},toast(){},CustomEvent:class{},document:{dispatchEvent(){}},
    db:{from:table=>{const query={};for(const method of ['select','order','eq'])query[method]=()=>query;query.range=async()=>delay?pending.promise:{data:[{id:'active',enrollment_status:'active'},{id:'old',enrollment_status:'concluded'}],error:null};query.then=resolve=>Promise.resolve({data:[{id:'new',archived_at:null},{id:'old-class',archived_at:'2025-12-31'}],error:null}).then(resolve);return query;}}
  };vm.createContext(context);
  vm.runInContext(between(read('student-edit-improvements.js'),'  let latestLoadRequest =','  const controls ='),context);
  await context.window.load();assert.equal(context.students.length,1);assert.equal(context.classes.length,1);
  assert.equal(context.window.getSchoolHistoryData().students.length,2);
  delay=true;const loading=context.window.load();await flush();context.user={id:'b'};context.school='school-b';context.students=[];
  pending.resolve({data:[{id:'late',enrollment_status:'active'}],error:null});await loading;
  assert.equal(context.students.length,0);assert.equal(context.window.getSchoolHistoryData().students.length,0);
});
