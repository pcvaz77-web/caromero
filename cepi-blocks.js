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

  function title({kind,stage,bimester,blockNumber,subjects=[]}) {
    const stageName = {fundamental_ii:'FUNDAMENTAL',medio:'MÉDIO'}[stage];
    const period = Number(bimester);
    if (!stageName || ![1,2,3,4].includes(period)) return null;
    const suffix = `${stageName} - ${period}º BIM`;
    if (kind === 'bloco') {
      const name = blockNames[stage]?.[Number(blockNumber)-1];
      return name ? `BLOCO ${Number(blockNumber)} - ${name} - ${suffix}` : null;
    }
    if (!['bimestral','simulado'].includes(kind)) return null;
    const subject = subjects.map(value => String(value).trim()).filter(Boolean).join(' / ').toLocaleUpperCase('pt-BR');
    return `${kind === 'bimestral' ? 'PROVA BIMESTRAL' : 'SIMULADO'}${subject ? ` - ${subject}` : ''} - ${suffix}`.slice(0,200);
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
    const relevant = tests.filter(t => t.kind === 'bloco' && t.status === 'applied' && t.academic_year === Number(academicYear) && t.bimester === Number(bimester) && t.stage === stage && (!blockNumber || t.block_number === Number(blockNumber)) && (!classId || t.class_ids?.includes(classId)));
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

  window.CepiBlocks = {plan,title,summarize,ranking,stageForClassName};
})();
