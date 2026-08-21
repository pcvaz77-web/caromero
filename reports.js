document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  const permissionsNav = document.getElementById('permissionsNav');
  if (!nav || !permissionsNav) return;

  const reportsButton = document.createElement('button');
  reportsButton.id = 'reportsNav';
  reportsButton.type = 'button';
  reportsButton.className = 'hidden';
  reportsButton.innerHTML = '<span>▤ &nbsp; Relatórios</span>';
  nav.insertBefore(reportsButton, permissionsNav);

  const modal = document.createElement('div');
  modal.id = 'reportsModal';
  modal.className = 'modal-bg reports-modal hidden';
  modal.innerHTML = `<section class="modal reports-dialog"><div class="modal-head"><div><h3>Relatórios</h3><div class="meta">Gere relatórios em PDF a partir dos dados que você já pode acessar.</div></div><button class="close" id="closeReports" type="button" aria-label="Fechar">×</button></div><div class="form reports-form">
    <div class="reports-grid">
      <div class="field"><label for="reportShift">Turno</label><select id="reportShift"><option value="">Todos</option><option value="Matutino">Matutino</option><option value="Vespertino">Vespertino</option><option value="Noturno">Noturno</option></select></div>
      <div class="field"><label for="reportClass">Turma</label><select id="reportClass"><option value="">Todas</option></select></div>
      <div class="field"><label for="reportStudent">Aluno</label><select id="reportStudent"><option value="">Todos</option></select></div>
    </div>
    <div class="reports-grid reports-dates">
      <div class="field"><label for="reportStart">Data inicial</label><input id="reportStart" type="date"></div>
      <div class="field"><label for="reportEnd">Data final</label><input id="reportEnd" type="date"></div>
    </div>
    <div class="reports-hint">O período selecionado é aplicado às ocorrências. Observações e foto representam o cadastro atual do aluno.</div>
    <div class="reports-section">
      <span class="reports-section-title">Conteúdo do relatório</span>
      <div class="reports-checks">
        <label class="check"><input type="checkbox" id="reportContentOccurrences" checked> Ocorrências</label>
        <label class="check"><input type="checkbox" id="reportContentObservations" checked> Observações</label>
        <label class="check"><input type="checkbox" id="reportContentPhoto" checked> Foto do aluno</label>
      </div>
    </div>
    <div class="reports-section">
      <span class="reports-section-title">Incluir alunos</span>
      <div class="reports-checks">
        <label class="check"><input type="radio" name="reportInclude" id="reportIncludeAll" value="all" checked> Todos os alunos</label>
        <label class="check"><input type="radio" name="reportInclude" id="reportIncludeWithRecords" value="with_records"> Somente alunos com registros</label>
      </div>
    </div>
    <div class="reports-preview" id="reportsPreview">Selecione os filtros para ver a prévia.</div>
    <div class="reports-progress hidden" id="reportsProgress"><div class="reports-progress-bar"><div id="reportsProgressFill" class="reports-progress-fill"></div></div><div id="reportsProgressText" class="reports-progress-text"></div></div>
    <div class="actions reports-actions"><button class="btn secondary" id="closeReportsSecondary" type="button">Fechar</button><button class="btn primary" id="generateReport" type="button">Gerar PDF</button></div>
  </div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    .reports-dialog { width:min(720px,100%); }
    .reports-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
    .reports-dates { grid-template-columns:1fr 1fr; max-width:400px; }
    .reports-hint { margin-top:4px; margin-bottom:16px; font-size:12.5px; color:var(--muted); background:#f4f7ff; border-radius:8px; padding:9px 12px; }
    .reports-section { margin-bottom:16px; }
    .reports-section-title { display:block; margin-bottom:8px; font-size:11px; font-weight:850; letter-spacing:.05em; text-transform:uppercase; color:var(--muted); }
    .reports-checks { display:flex; flex-wrap:wrap; gap:14px 20px; }
    .reports-preview { padding:11px 14px; border-radius:9px; background:#f4f7ff; color:#315dbb; font-weight:750; font-size:13.5px; margin-bottom:14px; }
    .reports-progress { margin-bottom:14px; }
    .reports-progress-bar { height:8px; border-radius:99px; background:#edf0f4; overflow:hidden; }
    .reports-progress-fill { height:100%; width:0%; background:var(--blue); transition:width .15s ease; }
    .reports-progress-text { margin-top:6px; font-size:12.5px; color:var(--muted); }
    .reports-actions { justify-content:space-between; }
    @media(max-width:800px) {
      .reports-modal { padding:10px !important; align-items:center !important; }
      .reports-dialog { width:100%; max-height:calc(100dvh - 20px); }
      .reports-form { padding:16px; }
      .reports-grid, .reports-dates { grid-template-columns:1fr; }
      .reports-actions { display:grid; grid-template-columns:1fr; gap:8px; }
      .reports-actions .btn { width:100%; }
    }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const escape = value => { const node = document.createElement('span'); node.textContent = value || ''; return node.innerHTML; };
  const isAdmin = () => permission?.role === 'admin';
  const isCoordinator = () => !!permission?.is_coordinator;
  // Regra definitiva pedida: administrador e coordenador têm acesso
  // automático, sem nenhuma permissão granular nova. A proteção real (que
  // impede um professor de obter o dataset chamando a API diretamente)
  // está nas RPCs report_students/report_occurrences/log_report_generation
  // (supabase-reports.sql), não só nesta checagem de UI.
  const canAccessReports = () => isAdmin() || isCoordinator();

  let datasetStudents = [];
  let occurrencesByStudent = new Map();
  let datasetSignature = '';
  let occurrenceSignature = '';
  let fetchToken = 0;
  let datasetError = false;
  let occurrenceError = false;

  // Tamanho de LOTE por requisição — não é um teto de alunos/ocorrências. O
  // PostgREST/Supabase limita quantas linhas cada resposta pode conter
  // (por padrão 1000); sem paginação, qualquer escola com mais alunos do
  // que isso tinha o relatório truncado silenciosamente. fetchAllPages()
  // encadeia quantas páginas forem necessárias até uma página vir menor
  // que REPORT_PAGE_SIZE (sinal de que não há mais linhas), então funciona
  // igual para 1.312, 2.000, 5.000 ou qualquer volume futuro.
  const REPORT_PAGE_SIZE = 1000;

  // Busca todas as páginas de uma RPC que devolve uma tabela. Se qualquer
  // página falhar, interrompe imediatamente e descarta as páginas já
  // acumuladas — nunca devolve um conjunto parcial como se fosse completo.
  // Se uma busca mais nova for iniciada (token mudou) no meio da paginação,
  // aborta silenciosamente sem mexer em estado nenhum (a busca nova é quem
  // manda).
  async function fetchAllPages(rpcName, params, token) {
    const rows = [];
    let offset = 0;
    while (true) {
      if (token !== fetchToken) return { data: null, error: null, stale: true };
      const { data, error } = await db.rpc(rpcName, params).range(offset, offset + REPORT_PAGE_SIZE - 1);
      if (token !== fetchToken) return { data: null, error: null, stale: true };
      if (error) return { data: null, error, stale: false };
      const batch = data || [];
      rows.push(...batch);
      if (batch.length < REPORT_PAGE_SIZE) return { data: rows, error: null, stale: false };
      offset += REPORT_PAGE_SIZE;
    }
  }

  function fillShiftClasses() {
    const shiftValue = get('reportShift').value;
    const select = get('reportClass');
    const current = select.value;
    const pool = shiftValue ? classes.filter(item => (item.shift || 'Matutino') === shiftValue) : classes;
    select.innerHTML = '<option value="">Todas</option>' + pool.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric:true, sensitivity:'base' })).map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (pool.some(item => item.id === current)) select.value = current;
    else select.value = '';
  }

  function fillClassStudents() {
    const shiftValue = get('reportShift').value;
    const classValue = get('reportClass').value;
    const select = get('reportStudent');
    const current = select.value;
    const classIds = classValue
      ? [classValue]
      : classes.filter(item => !shiftValue || (item.shift || 'Matutino') === shiftValue).map(item => item.id);
    const pool = students.filter(item => classIds.includes(item.classId)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric:true, sensitivity:'base' }));
    select.innerHTML = '<option value="">Todos</option>' + pool.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if (pool.some(item => item.id === current)) select.value = current;
    else select.value = '';
  }

  function currentFilters() {
    return {
      shift: get('reportShift').value || null,
      classId: get('reportClass').value || null,
      studentId: get('reportStudent').value || null,
      start: get('reportStart').value || null,
      end: get('reportEnd').value || null,
      withOccurrences: get('reportContentOccurrences').checked,
      withObservations: get('reportContentObservations').checked,
      withPhoto: get('reportContentPhoto').checked,
      onlyWithRecords: get('reportIncludeWithRecords').checked
    };
  }

  async function fetchStudentsDataset(filters) {
    const signature = JSON.stringify([filters.shift, filters.classId, filters.studentId]);
    if (signature === datasetSignature) return;
    const token = ++fetchToken;
    const { data, error, stale } = await fetchAllPages('report_students', {
      p_shift: filters.shift,
      p_class_id: filters.classId,
      p_student_id: filters.studentId
    }, token);
    if (stale || token !== fetchToken) return;
    if (error) {
      datasetStudents = [];
      datasetSignature = '';
      datasetError = true;
      return;
    }
    datasetStudents = data;
    datasetSignature = signature;
    datasetError = false;
    occurrenceSignature = '';
  }

  async function fetchOccurrencesDataset(filters) {
    if (!filters.withOccurrences || !datasetStudents.length) {
      occurrencesByStudent = new Map();
      occurrenceError = false;
      occurrenceSignature = filters.withOccurrences ? occurrenceSignature : '';
      return;
    }
    const studentIds = datasetStudents.map(item => item.student_id).sort();
    const signature = JSON.stringify([studentIds, filters.start, filters.end]);
    if (signature === occurrenceSignature) return;
    const token = ++fetchToken;
    const { data, error, stale } = await fetchAllPages('report_occurrences', {
      p_student_ids: studentIds,
      p_start: filters.start,
      p_end: filters.end
    }, token);
    if (stale || token !== fetchToken) return;
    if (error) {
      occurrencesByStudent = new Map();
      occurrenceSignature = '';
      occurrenceError = true;
      return;
    }
    occurrencesByStudent = new Map();
    data.forEach(item => {
      if (!occurrencesByStudent.has(item.student_id)) occurrencesByStudent.set(item.student_id, []);
      occurrencesByStudent.get(item.student_id).push(item);
    });
    occurrenceSignature = signature;
    occurrenceError = false;
  }

  function studentHasRecord(student, filters) {
    let matched = false;
    if (filters.withOccurrences) matched = matched || (occurrencesByStudent.get(student.student_id)?.length > 0);
    if (filters.withObservations) matched = matched || (window.decodeObservationValues?.(student.has_report) || []).length > 0;
    return matched;
  }

  function selectedStudents(filters) {
    if (!filters.onlyWithRecords) return datasetStudents;
    return datasetStudents.filter(item => studentHasRecord(item, filters));
  }

  let refreshTimer;
  function scheduleRefresh() { clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshPreview, 200); }

  async function refreshPreview() {
    if (!canAccessReports()) return;
    const filters = currentFilters();
    const previewEl = get('reportsPreview');
    previewEl.textContent = 'Carregando prévia...';
    await fetchStudentsDataset(filters);
    if (datasetError) {
      previewEl.textContent = 'Não foi possível carregar os alunos. Verifique se o script supabase-reports.sql foi executado.';
      return;
    }
    await fetchOccurrencesDataset(filters);
    if (occurrenceError) {
      previewEl.textContent = 'Não foi possível carregar as ocorrências. Tente novamente.';
      return;
    }
    const total = datasetStudents.length;
    const withRecords = datasetStudents.filter(item => studentHasRecord(item, filters)).length;
    const included = selectedStudents(filters).length;
    previewEl.textContent = filters.onlyWithRecords
      ? `${included} aluno${included === 1 ? '' : 's'} selecionado${included === 1 ? '' : 's'} (somente com registros de ${total}).`
      : `${total} aluno${total === 1 ? '' : 's'} selecionado${total === 1 ? '' : 's'} · ${withRecords} possu${withRecords === 1 ? 'i' : 'em'} registros.`;
  }

  // ------------------------------------------------------------------
  // Geração do PDF
  // ------------------------------------------------------------------
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const A4_HEIGHT = 297, A4_WIDTH = 210, MARGIN_X = 15, BOTTOM_MARGIN = 24;

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat('pt-BR', { timeZone:'UTC' }).format(new Date(`${value}T00:00:00`)) : 'Sem data';
  }

  // Mesmo padrão de data/hora já usado na tela de Ocorrências
  // (occurrence-management.js) — created_at/updated_at são timestamptz reais,
  // por isso usam o fuso local do navegador, ao contrário de occurred_on
  // (formatDate acima), que é uma data pura tratada em UTC fixo.
  function formatDateTime(value) {
    return value ? `${new Intl.DateTimeFormat('pt-BR').format(new Date(value))} ${new Intl.DateTimeFormat('pt-BR', { hour:'2-digit', minute:'2-digit' }).format(new Date(value))}` : '';
  }

  async function loadPhotoDataUrl(photoPath) {
    if (!photoPath) return null;
    try {
      const { data, error } = await db.storage.from('student-photos').createSignedUrl(photoPath, 300);
      if (error || !data?.signedUrl) return null;
      const response = await fetch(data.signedUrl);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  function ensureSpace(doc, y, needed, continuationLabel) {
    if (y + needed <= A4_HEIGHT - BOTTOM_MARGIN) return y;
    doc.addPage();
    let top = 18;
    if (continuationLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(102, 112, 133);
      doc.text(continuationLabel, MARGIN_X, top);
      top += 7;
    }
    return top;
  }

  // doc.text(arrayDeLinhas, x, y) não pagina sozinho: linhas que passam do
  // rodapé da página ficam fora da área visível e somem do PDF. Um texto de
  // ocorrência (ou observação) mais longo que uma página inteira precisa
  // que cada linha seja verificada e, se necessário, empurrada para uma
  // nova página individualmente — nunca o bloco inteiro de uma vez.
  function printLines(doc, lines, x, y, lineHeight, continuationLabel) {
    lines.forEach(line => {
      y = ensureSpace(doc, y, lineHeight, continuationLabel);
      doc.text(line, x, y);
      y += lineHeight;
    });
    return y;
  }

  async function renderStudentPage(doc, student, filters, isFirst) {
    if (!isFirst) doc.addPage();
    let y = 18;

    doc.setTextColor(53, 106, 230);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('CARÔMETRO', MARGIN_X, y);
    doc.setTextColor(20, 32, 58);
    doc.setFontSize(16);
    y += 8;
    doc.text('RELATÓRIO DO ALUNO', MARGIN_X, y);
    y += 6;
    doc.setDrawColor(228, 231, 236);
    doc.line(MARGIN_X, y, A4_WIDTH - MARGIN_X, y);
    y += 8;

    let textX = MARGIN_X;
    const headStartY = y;
    if (filters.withPhoto && student.photoDataUrl) {
      try {
        const props = doc.getImageProperties(student.photoDataUrl);
        const maxW = 28, maxH = 34;
        const ratio = Math.min(maxW / props.width, maxH / props.height);
        const w = props.width * ratio, h = props.height * ratio;
        doc.addImage(student.photoDataUrl, props.fileType, MARGIN_X, y, w, h);
        textX = MARGIN_X + maxW + 8;
      } catch {}
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 32, 58);
    doc.text(student.full_name || 'Aluno', textX, headStartY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(102, 112, 133);
    doc.text(`Turma: ${student.class_name || 'Não informada'}`, textX, headStartY + 14);
    doc.text(`Turno: ${student.shift || 'Não informado'}`, textX, headStartY + 21);
    doc.setFontSize(9);
    doc.text(`Emitido em ${filters.emittedAtLabel}`, textX, headStartY + 28);

    y = headStartY + 42;

    if (filters.withObservations) {
      y = ensureSpace(doc, y, 14, `Continuação — ${student.full_name}`);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(20, 32, 58);
      doc.text('OBSERVAÇÕES', MARGIN_X, y);
      y += 7;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      const values = window.decodeObservationValues?.(student.has_report) || [];
      if (!values.length) {
        y = ensureSpace(doc, y, 6, `Continuação — ${student.full_name}`);
        doc.setTextColor(102, 112, 133);
        doc.text('Nenhuma observação registrada.', MARGIN_X, y);
        y += 9;
      } else {
        values.forEach(value => {
          const split = doc.splitTextToSize(`• ${value}`, A4_WIDTH - MARGIN_X * 2);
          doc.setTextColor(20, 32, 58);
          y = printLines(doc, split, MARGIN_X, y, 5.4, `Continuação — ${student.full_name}`);
          y += 2;
        });
      }
      y += 4;
    }

    if (filters.withOccurrences) {
      y = ensureSpace(doc, y, 14, `Continuação — ${student.full_name}`);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(20, 32, 58);
      doc.text('HISTÓRICO DE OCORRÊNCIAS', MARGIN_X, y);
      y += 8;
      const records = occurrencesByStudent.get(student.student_id) || [];
      if (!records.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(102, 112, 133);
        y = ensureSpace(doc, y, 6, `Continuação — ${student.full_name}`);
        doc.text('Nenhuma ocorrência no período selecionado.', MARGIN_X, y);
        y += 9;
      } else {
        records.forEach(record => {
          const continuationLabel = `Continuação — ${student.full_name}`;
          y = ensureSpace(doc, y, 12, continuationLabel);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(20, 32, 58);
          doc.text(`${formatDate(record.occurred_on)} — Responsável: ${record.created_by_name || 'Não informado'}`, MARGIN_X, y);
          y += 5;
          // Autoria/data de criação nunca são substituídas por uma edição —
          // esta linha reflete sempre o registro original (created_at real,
          // com hora, vindo do banco), independente de a ocorrência já ter
          // sido editada ou não.
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(102, 112, 133);
          y = ensureSpace(doc, y, 5, continuationLabel);
          doc.text(`Registrado em: ${formatDateTime(record.created_at)}`, MARGIN_X, y);
          y += 5;
          if (record.updated_at) {
            y = ensureSpace(doc, y, 5, continuationLabel);
            doc.text(`Última edição: ${record.updated_by_name || 'Não informado'} — ${formatDateTime(record.updated_at)}`, MARGIN_X, y);
            y += 5;
          }
          y += 1;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10.5);
          doc.setTextColor(52, 64, 84);
          const split = doc.splitTextToSize(record.occurrence_text || '', A4_WIDTH - MARGIN_X * 2);
          y = printLines(doc, split, MARGIN_X, y, 5.4, continuationLabel);
          y += 6;
        });
      }
      y = ensureSpace(doc, y, 8, `Continuação — ${student.full_name}`);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(20, 32, 58);
      doc.text(`Total de ocorrências no período: ${records.length}`, MARGIN_X, y);
    }
  }

  function applyFooters(doc, generatedByName, generatedAt) {
    const total = doc.getNumberOfPages();
    const dateStr = new Intl.DateTimeFormat('pt-BR', { dateStyle:'short' }).format(generatedAt);
    const timeStr = new Intl.DateTimeFormat('pt-BR', { timeStyle:'short' }).format(generatedAt);
    for (let page = 1; page <= total; page++) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(102, 112, 133);
      doc.text(`Documento gerado pelo Carômetro • ${dateStr} às ${timeStr} • Gerado por: ${generatedByName}`, MARGIN_X, A4_HEIGHT - 8);
      doc.text(`Página ${page} de ${total}`, A4_WIDTH - MARGIN_X, A4_HEIGHT - 8, { align:'right' });
    }
  }

  const slug = value => (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'relatorio';

  async function currentUserDisplayName() {
    const { data } = await db.from('profiles').select('full_name,email').eq('id', user.id).maybeSingle();
    return data?.full_name?.trim() || user.user_metadata?.full_name?.trim() || data?.email || user.email?.split('@')[0] || 'Usuário';
  }

  async function generateReport() {
    if (!canAccessReports()) { toast('Você não tem acesso a Relatórios.'); return; }
    if (!window.jspdf?.jsPDF) { toast('Não foi possível carregar o gerador de PDF. Verifique sua conexão.'); return; }
    const filters = currentFilters();
    // O PDF nunca pode sair com dados desatualizados do aluno (ex.: uma
    // observação removida segundos antes deste clique). Mesmo racional do
    // reset de occurrenceSignature logo abaixo: zerar a assinatura aqui,
    // de forma síncrona e imediatamente antes da busca, garante que a
    // checagem de cache dentro de fetchStudentsDataset() nunca reaproveite
    // um resultado antigo.
    datasetSignature = '';
    await fetchStudentsDataset(filters);
    if (datasetError) { toast('Não foi possível carregar os alunos. Verifique se o script supabase-reports.sql foi executado.'); return; }
    // O PDF nunca pode sair com ocorrências desatualizadas (ex.: uma excluída
    // segundos antes deste clique). Zerar a assinatura aqui, de forma síncrona
    // e imediatamente antes da busca, garante que a checagem de cache dentro
    // de fetchOccurrencesDataset() nunca reaproveite um resultado antigo — o
    // fetchToken já existente cuida de descartar qualquer resposta de uma
    // busca anterior que ainda estivesse em andamento.
    occurrenceSignature = '';
    await fetchOccurrencesDataset(filters);
    if (occurrenceError) { toast('Não foi possível carregar as ocorrências. Tente novamente.'); return; }
    const reportTargets = selectedStudents(filters);
    if (!reportTargets.length) { toast('Nenhum aluno encontrado para os filtros selecionados.'); return; }
    if (reportTargets.length > 40 && !confirm(`Isto vai gerar um relatório com ${reportTargets.length} alunos e pode demorar um pouco. Deseja continuar?`)) return;

    const generateButton = get('generateReport');
    generateButton.disabled = true;
    const progress = get('reportsProgress');
    const progressFill = get('reportsProgressFill');
    const progressText = get('reportsProgressText');
    progress.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressText.textContent = `Gerando relatório... 0 de ${reportTargets.length} alunos`;

    try {
      const generatedAt = new Date();
      const generatedByName = await currentUserDisplayName();
      const emittedAtLabel = new Intl.DateTimeFormat('pt-BR', { dateStyle:'short', timeStyle:'short' }).format(generatedAt);
      const renderFilters = { ...filters, emittedAtLabel };
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit:'mm', format:'a4' });

      for (let index = 0; index < reportTargets.length; index++) {
        const student = reportTargets[index];
        if (renderFilters.withPhoto) student.photoDataUrl = await loadPhotoDataUrl(student.photo_path);
        await renderStudentPage(doc, student, renderFilters, index === 0);
        progressFill.style.width = `${Math.round(((index + 1) / reportTargets.length) * 100)}%`;
        progressText.textContent = `Gerando relatório... ${index + 1} de ${reportTargets.length} alunos`;
        await tick();
      }

      applyFooters(doc, generatedByName, generatedAt);

      let scopeType = 'shift';
      let scopeId = null;
      let scopeLabel = filters.shift || 'Todos os turnos';
      let filenameBase = filters.shift || 'Todos_os_turnos';
      if (filters.studentId) {
        const one = reportTargets.find(item => item.student_id === filters.studentId) || reportTargets[0];
        scopeType = 'student'; scopeId = filters.studentId; scopeLabel = one.full_name; filenameBase = one.full_name;
      } else if (filters.classId) {
        const cls = classes.find(item => item.id === filters.classId);
        scopeType = 'class'; scopeId = filters.classId; scopeLabel = cls?.name || 'Turma'; filenameBase = cls?.name || 'Turma';
      }

      doc.save(`Relatorio_${slug(filenameBase)}.pdf`);

      const { error: logError } = await db.rpc('log_report_generation', {
        p_scope_type: scopeType,
        p_scope_id: scopeId,
        p_scope_label: scopeLabel,
        p_contents: { occurrences: filters.withOccurrences, observations: filters.withObservations, photo: filters.withPhoto },
        p_period_start: filters.withOccurrences ? filters.start : null,
        p_period_end: filters.withOccurrences ? filters.end : null,
        p_student_count: reportTargets.length
      });
      if (logError) toast('Relatório gerado, mas não foi possível registrar a auditoria. Verifique se supabase-reports.sql foi executado.');
      else toast('Relatório gerado com sucesso.');
    } catch (error) {
      toast('Não foi possível gerar o relatório agora.');
    } finally {
      generateButton.disabled = false;
      progress.classList.add('hidden');
    }
  }

  // ------------------------------------------------------------------
  // Navegação e ciclo de vida
  // ------------------------------------------------------------------
  const syncReportsNavigation = () => {
    const allowed = canAccessReports();
    reportsButton.classList.toggle('hidden', !allowed);
    reportsButton.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };

  async function open() {
    if (!canAccessReports()) { toast('Você não tem acesso a Relatórios.'); return; }
    modal.classList.remove('hidden');
    await load();
    fillShiftClasses();
    fillClassStudents();
    await refreshPreview();
  }
  window.openReports = open;

  const closeReports = () => modal.classList.add('hidden');
  reportsButton.onclick = open;
  get('closeReports').onclick = closeReports;
  get('closeReportsSecondary').onclick = closeReports;
  modal.onclick = event => { if (event.target === modal) closeReports(); };
  get('reportShift').onchange = () => { fillShiftClasses(); fillClassStudents(); scheduleRefresh(); };
  get('reportClass').onchange = () => { fillClassStudents(); scheduleRefresh(); };
  ['reportStudent', 'reportStart', 'reportEnd', 'reportContentOccurrences', 'reportContentObservations', 'reportContentPhoto', 'reportIncludeAll', 'reportIncludeWithRecords'].forEach(id => {
    get(id).addEventListener('change', scheduleRefresh);
  });
  get('generateReport').onclick = generateReport;

  document.addEventListener('carometro:permission-refresh', syncReportsNavigation);
  // Ocorrência criada/editada/excluída em qualquer lugar do app (evento já
  // disparado por realtime-sync.js) invalida o cache local de ocorrências
  // deste módulo. generateReport() também força esse mesmo reset por conta
  // própria antes de montar o PDF — este listener cobre além disso a prévia,
  // caso o modal de Relatórios fique aberto enquanto algo muda.
  document.addEventListener('carometro:occurrences-changed', () => { occurrenceSignature = ''; });
  new MutationObserver(syncReportsNavigation).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  setTimeout(syncReportsNavigation, 0);
});
