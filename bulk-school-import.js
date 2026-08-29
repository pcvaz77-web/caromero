// Importação em massa de turmas e alunos para escolas novas, colando
// dados do Excel/Google Sheets. A prévia é só informativa (compara com o
// que já está carregado no cliente); a garantia definitiva de
// autorização e deduplicação é sempre feita pela RPC
// bulk_import_classes_and_students, contra o estado real do banco.
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    #bulkSchoolImportModal .modal{width:min(720px,100%)}
    #bulkImportTextarea{min-height:220px;font-family:ui-monospace,Consolas,monospace;font-size:13px}
    .bulk-import-summary{display:grid;gap:6px;margin:16px 0;padding:14px;border:1px solid var(--line);border-radius:9px;background:#f8faff}
    .bulk-import-summary div{display:flex;justify-content:space-between;font-size:14px}
    .bulk-import-errors{margin-top:12px;max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:9px}
    .bulk-import-errors div{padding:8px 12px;border-bottom:1px solid var(--line);font-size:13px}
    .bulk-import-errors div:last-child{border-bottom:0}
    .bulk-import-errors b{color:var(--danger)}
  `;
  document.head.appendChild(style);

  const button = document.createElement('button');
  button.id = 'bulkSchoolImportNav';
  button.type = 'button';
  button.className = 'btn secondary hidden';
  button.textContent = 'Importar turmas e alunos';
  document.querySelector('.top-actions')?.prepend(button);

  const modal = document.createElement('div');
  modal.id = 'bulkSchoolImportModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3>Importar turmas e alunos</h3><div class="meta">Cole os dados do Excel/Google Sheets — uma linha por aluno: Turma; Turno; Nome (o turno pode ser omitido se a turma já existir e não tiver ambiguidade).</div></div><button class="close" type="button" data-bulk-import-close>×</button></div><div class="form"><textarea id="bulkImportTextarea" placeholder="6º A; Matutino; Ana Beatriz da Silva&#10;6º A; Matutino; Bruno Alves&#10;7º B; Vespertino; Carla Souza"></textarea><div style="display:flex;gap:8px;margin-top:12px"><button id="bulkImportAnalyze" class="btn secondary" type="button">Analisar</button><button id="bulkImportConfirm" class="btn primary" type="button" disabled>Confirmar importação</button></div><div id="bulkImportResult" class="hidden"></div></div></div>`;
  document.body.appendChild(modal);

  const byId = id => document.getElementById(id);
  const VALID_SHIFTS = { matutino: 'Matutino', vespertino: 'Vespertino', noturno: 'Noturno' };
  const MAX_LINES = 1000;
  const normalize = value => (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

  // Mesma permissão que já controla "Colar lista"/"+ Adicionar aluno" na
  // fonte comercial (school_admin ou can_add_students via RLS/has_school_permission) —
  // a importação nunca aparece para quem não teria acesso ao cadastro manual.
  const canImport = () => window.getActiveSchoolRole?.() === 'school_admin' || !!permission?.can_add_students;

  function refreshVisibility() {
    button.classList.toggle('hidden', !canImport());
    if (!canImport()) modal.classList.add('hidden');
  }

  let lastAnalysis = null; // { validRows, invalidLines }

  function parseInput(text) {
    const existingClassShifts = new Map(); // nome normalizado -> Set(turno)
    (classes || []).forEach(item => {
      const key = normalize(item.name);
      if (!existingClassShifts.has(key)) existingClassShifts.set(key, new Set());
      existingClassShifts.get(key).add(item.shift || 'Matutino');
    });

    const validRows = [];
    const invalidLines = [];

    text.split(/\r?\n/).forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;
      const parts = (line.includes('\t') ? line.split('\t') : line.split(';')).map(part => part.trim());
      if (parts.length < 2 || parts.length > 3) {
        invalidLines.push({ line, reason: 'Formato não reconhecido (use Turma; Turno; Nome ou Turma; Nome).' });
        return;
      }
      const className = parts[0];
      const studentName = parts.length === 3 ? parts[2] : parts[1];
      const shiftRaw = parts.length === 3 ? parts[1] : '';

      if (!className) { invalidLines.push({ line, reason: 'Turma não informada.' }); return; }
      if (!studentName || studentName.length < 3) { invalidLines.push({ line, reason: 'Nome do aluno inválido.' }); return; }

      let shift = VALID_SHIFTS[normalize(shiftRaw)] || null;
      if (!shift) {
        if (shiftRaw) { invalidLines.push({ line, reason: 'Turno inválido: use Matutino, Vespertino ou Noturno.' }); return; }
        const shifts = existingClassShifts.get(normalize(className));
        if (!shifts || shifts.size === 0) { invalidLines.push({ line, reason: `Turma nova sem turno informado: ${className}.` }); return; }
        if (shifts.size > 1) { invalidLines.push({ line, reason: `A turma ${className} existe em mais de um turno — informe o turno.` }); return; }
        shift = [...shifts][0];
      }
      validRows.push({ class_name: className, shift, student_name: studentName });
    });

    return { validRows, invalidLines };
  }

  // Só para exibição — a contagem definitiva vem sempre da RPC.
  function buildPreviewCounts(validRows) {
    const existingClassKeys = new Set((classes || []).map(item => `${normalize(item.name)}|${item.shift || 'Matutino'}`));
    const involvedClassKeys = new Set(validRows.map(row => `${normalize(row.class_name)}|${row.shift}`));
    const newClassKeys = [...involvedClassKeys].filter(key => !existingClassKeys.has(key));
    const existingInvolvedCount = involvedClassKeys.size - newClassKeys.length;
    const newClassNames = new Map();
    validRows.forEach(row => {
      const key = `${normalize(row.class_name)}|${row.shift}`;
      if (newClassKeys.includes(key) && !newClassNames.has(key)) newClassNames.set(key, `${row.class_name} (${row.shift})`);
    });

    const existingStudentKeys = new Set((students || []).map(student => `${student.classId}|${normalize(student.name)}`));
    const classIdByKey = new Map((classes || []).map(item => [`${normalize(item.name)}|${item.shift || 'Matutino'}`, item.id]));
    const seenPayloadKeys = new Set();
    let studentsToAdd = 0, duplicates = 0;
    validRows.forEach(row => {
      const classKey = `${normalize(row.class_name)}|${row.shift}`;
      const dedupKey = `${classKey}|${normalize(row.student_name)}`;
      if (seenPayloadKeys.has(dedupKey)) { duplicates++; return; }
      seenPayloadKeys.add(dedupKey);
      const classId = classIdByKey.get(classKey);
      if (classId && existingStudentKeys.has(`${classId}|${normalize(row.student_name)}`)) { duplicates++; return; }
      studentsToAdd++;
    });

    return { existingClasses: existingInvolvedCount, newClasses: newClassKeys.length, newClassNames: [...newClassNames.values()], studentsToAdd, duplicates };
  }

  function renderResult({ preview, invalidLines }) {
    const result = byId('bulkImportResult');
    result.classList.remove('hidden');
    const summary = `<div class="bulk-import-summary">
      <div><span>Turmas já existentes envolvidas</span><b>${preview.existingClasses}</b></div>
      <div><span>Turmas novas que serão criadas</span><b>${preview.newClasses}</b></div>
      <div><span>Alunos que serão adicionados</span><b>${preview.studentsToAdd}</b></div>
      <div><span>Duplicados (não serão gravados)</span><b>${preview.duplicates}</b></div>
      <div><span>Linhas inválidas</span><b>${invalidLines.length}</b></div>
    </div>${preview.newClassNames.length ? `<div class="meta">Novas turmas: ${preview.newClassNames.map(esc).join(', ')}</div>` : ''}`;
    const errors = invalidLines.length
      ? `<div class="bulk-import-errors">${invalidLines.map(item => `<div><b>${esc(item.reason)}</b><br>${esc(item.line)}</div>`).join('')}</div>`
      : '';
    result.innerHTML = summary + errors;
  }

  byId('bulkImportAnalyze').onclick = () => {
    const text = byId('bulkImportTextarea').value;
    const nonEmptyLines = text.split(/\r?\n/).filter(line => line.trim());
    if (!nonEmptyLines.length) { toast('Cole ao menos uma linha.'); return; }
    if (nonEmptyLines.length > MAX_LINES) {
      toast(`Cole até ${MAX_LINES} linhas por importação. Divida em mais de uma colagem.`);
      byId('bulkImportConfirm').disabled = true;
      lastAnalysis = null;
      return;
    }
    const { validRows, invalidLines } = parseInput(text);
    const preview = buildPreviewCounts(validRows);
    renderResult({ preview, invalidLines });
    lastAnalysis = { validRows, invalidLines };
    byId('bulkImportConfirm').disabled = invalidLines.length > 0 || preview.studentsToAdd === 0;
  };

  byId('bulkImportTextarea').oninput = () => {
    lastAnalysis = null;
    byId('bulkImportConfirm').disabled = true;
    byId('bulkImportResult').classList.add('hidden');
  };

  byId('bulkImportConfirm').onclick = async () => {
    if (!lastAnalysis || lastAnalysis.invalidLines.length > 0 || !lastAnalysis.validRows.length) return;
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !canImport()) { toast('Você não possui permissão para importar nesta escola.'); return; }
    byId('bulkImportConfirm').disabled = true;
    byId('bulkImportAnalyze').disabled = true;
    try {
      const { data, error } = await db.rpc('bulk_import_classes_and_students', {
        target_school_id: schoolId,
        rows: lastAnalysis.validRows,
      });
      if (error) throw error;
      modal.classList.add('hidden');
      await load();
      const classesPart = data.classes_created ? ` em ${data.classes_created} turma${data.classes_created === 1 ? '' : 's'} nova${data.classes_created === 1 ? '' : 's'}` : '';
      toast(`${data.students_created} aluno${data.students_created === 1 ? '' : 's'} adicionado${data.students_created === 1 ? '' : 's'}${classesPart}. ${data.duplicates_skipped} duplicado${data.duplicates_skipped === 1 ? '' : 's'} ignorado${data.duplicates_skipped === 1 ? '' : 's'}.`);
    } catch (error) {
      toast(error.message || 'Não foi possível concluir a importação.');
    } finally {
      byId('bulkImportAnalyze').disabled = false;
    }
  };

  button.onclick = () => {
    if (!canImport()) return;
    byId('bulkImportTextarea').value = '';
    byId('bulkImportResult').classList.add('hidden');
    byId('bulkImportConfirm').disabled = true;
    lastAnalysis = null;
    modal.classList.remove('hidden');
  };
  modal.querySelector('[data-bulk-import-close]').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };

  document.addEventListener('carometro:school-context-ready', refreshVisibility);
  document.addEventListener('carometro:permission-refresh', refreshVisibility);
});
