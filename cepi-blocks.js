(() => {
  'use strict';

  const templates = Object.freeze({
    fundamental_ii: [
      [['Língua Portuguesa', 15]],
      [['Ciências', 15]],
      [['Matemática', 15]],
      [['Língua Inglesa', 5], ['Arte', 5], ['Educação Física', 5]],
      [['História', 15]],
      [['Geografia', 15]]
    ],
    medio: [
      [['Língua Portuguesa', 20]],
      [['Geografia', 15], ['História', 15]],
      [['Matemática', 20]],
      [['Língua Inglesa', 10], ['Arte', 10], ['Educação Física', 10]],
      [['Física', 15], ['Química', 15]],
      [['Biologia', 15], ['Sociologia', 8], ['Filosofia', 7]]
    ]
  });

  function plan(stage, number) {
    const entries = templates[stage]?.[Number(number) - 1];
    return entries ? entries.map(([subject, count]) => ({subject, count})) : null;
  }

  function subjectCapacity(test, questions, subject, editingId = null) {
    if (test?.kind !== 'bloco') return null;
    const distribution = Array.isArray(test.subject_plan) && test.subject_plan.length
      ? test.subject_plan : plan(test.stage, test.block_number);
    const entry = distribution?.find(item => item.subject === subject);
    if (!entry) return null;
    const rows = questions.filter(item => item.test_id === test.id && item.subject === subject);
    const used = rows.filter(item => item.id !== editingId).length;
    const limit = Number(entry.count);
    return {limit, used, full:used >= limit, lastNumber:Math.max(0,...rows.map(item => Number(item.number) || 0))};
  }

  function stageForClassName(name) {
    const normalized = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const grade = normalized.match(/^(?:ENSINO\s+MEDIO\s+)?([1-9])(?=\D|$)/);
    if (!grade) return null;
    const number = Number(grade[1]);
    if (number >= 6 && number <= 9) return 'fundamental_ii';
    if (number <= 3 && !/FUNDAMENTAL/.test(normalized) && (!/\bANO\b/.test(normalized) || /MEDIO/.test(normalized))) return 'medio';
    return null;
  }

  const blockNames = {
    fundamental_ii: ['PORTUGUÊS','CIÊNCIAS','MATEMÁTICA','ING ART EFI','HISTÓRIA','GEOGRAFIA'],
    medio: ['PORTUGUÊS','GEO HIS','MATEMÁTICA','ING ART EFI','FIS QUI','BIO SOC FIL']
  };
  const defaultInstructionTail = 'Leia atentamente cada questão, assinale a única alternativa correta e, em seguida, transcreva suas respostas para o cartão-resposta. Boa prova!';

  // Distribuições dos modelos de simulado para a 3ª série.
  const enemTemplates = Object.freeze({
    caderno_1: [['Química',8],['Física',7],['Biologia',8],['História',6],['Geografia',6],['Filosofia',5],['Sociologia',5]],
    caderno_2: [['Inglês',10],['Língua Portuguesa',5],['Arte',4],['Educação Física',4],['Matemática',22]],
    simuladao: [['Língua Portuguesa',15],['Matemática',15],['Arte',3],['Educação Física',2],['Sociologia',4],['Filosofia',4],['Inglês',2],['Espanhol',1],['Biologia',8],['Física',8],['Química',8],['História',10],['Geografia',10]]
  });
  function enemPlan(model) {
    return enemTemplates[model]?.map(([subject,count])=>({subject,count})) || null;
  }
  const displayTitle=value=>String(value||'').replace(/^SIMULA - ENEM - CADERNO ([12]) - (\dº BIM)$/i,'SIMULADO ENEM - CADERNO $1 - $2');
  function enemModel(test) {
    if (test?.kind !== 'simulado' || test.stage !== 'medio') return null;
    const name=String(test.title||'').toLocaleUpperCase('pt-BR');
    const model=/^(?:SIMULA - ENEM|SIMULADO ENEM) - CADERNO 1 - \dº BIM$/.test(name)?'caderno_1'
      :/^(?:SIMULA - ENEM|SIMULADO ENEM) - CADERNO 2 - \dº BIM$/.test(name)?'caderno_2'
      :/^SIMULADÃO ENEM \d{4}$/.test(name)?'simuladao':null;
    if(!model)return null;
    const distribution=enemPlan(model);
    return distribution.reduce((sum,item)=>sum+item.count,0)===Number(test.question_count)?model:null;
  }
  function examPlan(test) {
    if(test?.kind==='bloco') return Array.isArray(test.subject_plan)&&test.subject_plan.length?test.subject_plan:plan(test.stage,test.block_number);
    return enemPlan(enemModel(test));
  }
  function subjectRange(test, subject) {
    const distribution=examPlan(test);
    if(!distribution)return null;
    let start=1;
    for(const entry of distribution){
      const end=start+Number(entry.count)-1;
      if(entry.subject===subject)return {start,end};
      start=end+1;
    }
    return null;
  }
  function nextSubjectNumber(test, questions, subject) {
    const range=subjectRange(test,subject);
    if(!range)return null;
    const occupied=new Set(questions.filter(item=>item.test_id===test.id).map(item=>Number(item.number)));
    for(let number=range.start;number<=range.end;number++)if(!occupied.has(number))return number;
    return null;
  }
  function subjectForNumber(test, number) {
    if(!examPlan(test)||!Number.isInteger(Number(number))||Number(number)<1)return null;
    let last=0;
    for(const entry of examPlan(test)){
      last+=entry.count;
      if(Number(number)<=last)return entry.subject;
    }
    return null;
  }

  function title({kind,stage,bimester,blockNumber,subjects=[],enemModel:chosenEnemModel,academicYear}) {
    const stageName = {fundamental_ii:'FUNDAMENTAL',medio:'MÉDIO'}[stage];
    const period = Number(bimester);
    if (!stageName || ![1,2,3,4].includes(period)) return null;
    const suffix = `${stageName} - ${period}º BIM`;
    if (kind === 'bloco') {
      const name = blockNames[stage]?.[Number(blockNumber)-1];
      return name ? `BLOCO ${Number(blockNumber)} - ${name} - ${suffix}` : null;
    }
    if(kind==='simulado' && chosenEnemModel && stage==='medio') {
      if(!enemPlan(chosenEnemModel))return null;
      if(chosenEnemModel==='simuladao')return Number.isInteger(Number(academicYear))&&Number(academicYear)>=2000&&Number(academicYear)<=2100?`SIMULADÃO ENEM ${Number(academicYear)}`:null;
      return `SIMULADO ENEM - CADERNO ${chosenEnemModel==='caderno_1'?1:2} - ${period}º BIM`;
    }
    if (!['bimestral','simulado'].includes(kind)) return null;
    const subject = subjects.map(value => String(value).trim()).filter(Boolean).join(' / ').toLocaleUpperCase('pt-BR');
    return `${kind === 'bimestral' ? 'PROVA BIMESTRAL' : 'SIMULADO'}${subject ? ` - ${subject}` : ''} - ${suffix}`.slice(0,200);
  }

  function instructions(test, questions = [], tail = defaultInstructionTail) {
    const total = Number(test?.question_count);
    if (!Number.isInteger(total) || total < 1) return '';
    let distribution = [];
    const configuredPlan=examPlan(test);
    if (configuredPlan) {
      distribution = configuredPlan;
    } else {
      const rows = questions.filter(item => item.test_id === test.id);
      if (rows.length === total && rows.every(item => String(item.subject || '').trim())) {
        const counts = new Map();
        rows.forEach(item => {
          const subject = String(item.subject).trim();
          counts.set(subject, (counts.get(subject) || 0) + 1);
        });
        distribution = [...counts].map(([subject,count]) => ({subject,count}));
      } else if (Array.isArray(test.subjects) && test.subjects.length === 1 && String(test.subjects[0]).trim()) {
        distribution = [{subject:String(test.subjects[0]).trim(),count:total}];
      }
    }
    const valid = distribution.length && distribution.every(item =>
      String(item.subject || '').trim() && Number.isInteger(Number(item.count)) && Number(item.count) > 0
    ) && distribution.reduce((sum,item) => sum + Number(item.count),0) === total;
    const prefix = `Esta avaliação é composta por ${total} ${total === 1 ? 'questão' : 'questões'}`;
    const parts = valid ? distribution.map(item => `${item.count} ${Number(item.count) === 1 ? 'questão' : 'questões'} de ${String(item.subject).trim()}`) : [];
    const list = parts.length > 1 ? `${parts.slice(0,-1).join(', ')} e ${parts.at(-1)}` : parts[0];
    const ending = String(tail ?? defaultInstructionTail).trim();
    return `${prefix}${list ? `, assim ${total === 1 ? 'distribuída' : 'distribuídas'}: ${list}` : ''}.${ending ? ` ${ending}` : ''}`;
  }

  function summarize(test, questions, answers) {
    const rows = questions.filter(q => q.test_id === test.id).sort((a,b) => a.number - b.number);
    if (rows.length !== test.question_count || !Array.isArray(answers) || answers.length !== rows.length || rows.some((q,i) => q.number !== i + 1)) return null;
    const bySubject = {};
    for (const q of rows) {
      const bucket = bySubject[q.subject] ||= {correct:0,total:0};
      bucket.total++;
      if (String(answers[q.number - 1] || '').toUpperCase() === q.correct_answer) bucket.correct++;
    }
    return {correct:Object.values(bySubject).reduce((n,s) => n + s.correct,0),total:rows.length,bySubject};
  }

  function ranking({tests,questions,results,students,academicYear,bimester,stage,classId,blockNumber}) {
    const relevant = tests.filter(t => t.kind === 'bloco' && ['ready','applied'].includes(t.status) && t.academic_year === Number(academicYear) && t.bimester === Number(bimester) && t.stage === stage && (!blockNumber || t.block_number === Number(blockNumber)) && (!classId || t.class_ids?.includes(classId)));
    const subjects = [...new Set(relevant.flatMap(t => (t.subject_plan || []).map(item => item.subject)))];
    const rows = students.filter(s => s.enrollment_status === 'active' && (!classId || s.class_id === classId) && relevant.some(t => t.class_ids?.includes(s.class_id))).map(student => {
      const assigned = relevant.filter(t => t.class_ids?.includes(student.class_id));
      let correct=0,total=0,covered=0;
      const bySubject={};
      for (const test of assigned) {
        const attempts=results.filter(r => r.test_id === test.id && r.student_id === student.id && r.reviewed_at).sort((a,b) => b.call_number-a.call_number || String(b.reviewed_at).localeCompare(String(a.reviewed_at)));
        const score=attempts.length ? summarize(test,questions,attempts[0].answers) : null;
        if (!score) continue;
        covered++;correct+=score.correct;total+=score.total;
        for (const [subject,item] of Object.entries(score.bySubject)) {
          const bucket=bySubject[subject] ||= {correct:0,total:0};
          bucket.correct+=item.correct;bucket.total+=item.total;
        }
      }
      return {student,correct,total,covered,expected:assigned.length,complete:assigned.length>0&&covered===assigned.length,percent:total?correct/total*100:null,bySubject};
    });
    rows.sort((a,b) => Number(b.complete)-Number(a.complete) || (b.percent ?? -1)-(a.percent ?? -1) || a.student.full_name.localeCompare(b.student.full_name,'pt-BR'));
    let rank=0;
    rows.forEach((row,index) => {if(row.complete) {if(index===0 || row.percent!==rows[index-1].percent) rank=index+1;row.rank=rank;} else row.rank=null;});
    return {tests:relevant,subjects,rows};
  }

  window.CepiBlocks = {plan,enemPlan,enemModel,examPlan,subjectForNumber,subjectRange,nextSubjectNumber,subjectCapacity,title,displayTitle,instructions,defaultInstructionTail,summarize,ranking,stageForClassName};
})();
