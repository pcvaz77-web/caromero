(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CepiSiapDom=api;})(globalThis,function(){
  'use strict';
  const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,' ').trim().toUpperCase();
  function supports(doc){
    const table=doc.getElementById('cphFuncionalidade_cphCampos_gdvLista');
    return !!table&&[...table.rows].some(row=>row.cells?.[0]?.textContent?.trim()==='Aluno'&&[...row.cells].some(cell=>cell.textContent.trim()==='1'));
  }
  function snapshot(doc,meta,key){
    if(!supports(doc))throw new Error('Abra no SIAP a avaliação de acertos por questão.');
    const p='cphFuncionalidade_cphCampos_',value=name=>String((doc.getElementById(p+name)||doc.getElementById(name))?.value||'').trim();
    const table=doc.getElementById(p+'gdvLista');
    const context={grade:value('txtSerie'),term:value('txtBimestre'),className:value('txtTurma'),subject:value('txtDisciplina'),stage:value('txtComposicao'),assessment:value('avaliacao'),total:Number(value('txtTotaldeQuestoes'))};
    const heading=doc.getElementById('h3TituloFuncionalidade');
    const before=doc.body?.textContent?.split(heading?.textContent||'\uffff')[0]||'';
    const year=before.match(/20\d{2}/)?.[0];
    const schoolWords=norm(meta?.schoolName).split(' ').filter(word=>word.length>1&&!['CEPI','ESCOLA','ESTADUAL','COLEGIO','EDU','CAMPO','DE','DA','DO','DOS','DAS'].includes(word));
    const siapHeader=norm(before);
    if(schoolWords.length<2||schoolWords.some(word=>!siapHeader.split(' ').includes(word)))throw new Error('A escola do SIAP não coincide com o cabeçalho salvo no Carômetro. Confira antes de lançar.');
    const subject=(meta?.subjectMap||[]).find(item=>norm(item.subject)===norm(context.subject));
    const numbers=subject?.numbers;
    if(!year||year!==String(meta?.academicYear)||!norm(context.className)||norm(context.className)!==norm(meta?.className)||norm(context.stage)!==norm(meta?.stage==='medio'?'Ensino Médio':'Ensino Fundamental')&&!(meta?.stage==='fundamental_ii'&&/FUNDAMENTAL/.test(norm(context.stage)))||!new RegExp('\\b'+Number(meta?.bimester)+'\\s*[ºO]?\\s*BIMESTRE','i').test(norm(context.term))||!new RegExp('\\bBLOCO\\s*'+Number(meta?.blockNumber)+'\\b','i').test(norm(context.assessment)))throw new Error('Ano, etapa, bimestre, turma ou bloco do SIAP não coincide com a prova selecionada no Carômetro.');
    if(!Array.isArray(numbers)||!numbers.length||context.total!==numbers.length||new Set(numbers).size!==numbers.length||numbers.some(n=>!Number.isInteger(n)||n<1||n>key?.answers?.length))throw new Error('A disciplina ou a quantidade de questões do SIAP não coincide com a divisão salva no Carômetro.');
    const header=[...table.rows].find(row=>row.cells?.[0]?.textContent?.trim()==='Aluno'&&row.cells.length>5);
    if(!header||[...header.cells].slice(5,5+context.total).some((cell,i)=>Number(cell.textContent.trim())!==i+1))throw new Error('Numeração das questões no SIAP inesperada.');
    const roster=[...table.rows].filter(row=>/^\d+\s*-/.test(row.cells?.[0]?.textContent?.trim()||'')).map(row=>{
      const label=row.cells[0].textContent.replace(/\s+/g,' ').trim(),boxes=[...row.querySelectorAll('input[type="checkbox"]')];
      if(boxes.length!==4+context.total||boxes.some(box=>!box.id))throw new Error('A estrutura dos campos de acertos do SIAP mudou.');
      const unavailable=[...row.querySelectorAll('img')].some(img=>/transfer|inativ|aband|cancel|falec|deixou/i.test([img.title,img.alt].join(' ')))||boxes.every(box=>box.disabled);
      return {name:label.replace(/^\d+\s*-\s*/,''),unavailable,boxes,row};
    });
    if(!roster.length||new Set(roster.map(row=>norm(row.name))).size!==roster.length)throw new Error('A lista do SIAP está vazia ou contém nomes repetidos.');
    return {context,numbers,roster,signature:JSON.stringify([year,context.stage,context.grade,context.term,context.className,context.subject,context.assessment,context.total,roster.map(row=>norm(row.name))])};
  }
  function plan(snapshot,status,key){
    const byName=new Map(snapshot.roster.map(row=>[norm(row.name),row]));
    const registered=new Map((status.roster||[]).map(student=>[student.id,student]));
    if(registered.size!==(status.roster||[]).length||new Set((status.roster||[]).map(student=>norm(student.name))).size!==(status.roster||[]).length)throw new Error('Há nomes repetidos na turma do Carômetro. Identifique os alunos antes de lançar no SIAP.');
    const seen=new Set(),entries=[];
    for(const item of status.items||[]){
      if(item.kind!=='student'||item.discarded||item.status!=='ready'||!item.review?.reviewed)continue;
      const student=registered.get(item.review.studentId),row=byName.get(norm(student?.name));
      if(!student||!row||row.unavailable||seen.has(norm(student.name)))throw new Error('Aluno do cartão ausente, repetido ou indisponível nesta turma do SIAP. Confira os nomes.');
      seen.add(norm(student.name));
      const answers=item.review.answers;
      if(!Array.isArray(answers)||answers.length!==key.answers.length||answers.some(answer=>![...key.alphabet,'-'].includes(answer)))throw new Error('Cartão com respostas incompletas ou ambíguas. Revise no celular.');
      const marks=snapshot.numbers.map(number=>answers[number-1]===key.answers[number-1]);
      entries.push({name:student.name,row,marks,captureId:item.id});
    }
    return entries;
  }
  function preflight(entry,call){
    if(![1,2].includes(call))throw new Error('Selecione a chamada.');
    const [p1,a1,p2,a2]=entry.row.boxes;
    const present=call===1?p1:p2,absent=call===1?a1:a2,other=call===1?p2:p1;
    if(entry.row.unavailable||present.disabled||absent.disabled||absent.checked||other.checked||entry.row.boxes.slice(4).some(box=>box.disabled))throw new Error(`Confira presença e bloqueios de ${entry.name} no SIAP antes de lançar.`);
    if(entry.marks.length!==entry.row.boxes.length-4)throw new Error('Quantidade de campos do SIAP diferente da prova.');
    return {present,questions:entry.row.boxes.slice(4)};
  }
  function apply(entry,call){
    const {present,questions}=preflight(entry,call);
    if(!present.checked)present.click();
    if(!present.checked)throw new Error(`O SIAP não confirmou a presença de ${entry.name}.`);
    questions.forEach((box,i)=>{if(box.checked!==entry.marks[i])box.click();if(box.checked!==entry.marks[i])throw new Error(`O SIAP não confirmou a questão ${i+1} de ${entry.name}.`);});
  }
  return Object.freeze({supports,snapshot,plan,preflight,apply,norm});
});
