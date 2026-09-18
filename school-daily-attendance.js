document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const STATUS = {
    frequent:{ label:'Frequente', className:'attendance-frequent' },
    absent:{ label:'Faltoso', className:'attendance-absent' },
    active_search:{ label:'Necessita de Busca Ativa', className:'attendance-active-search' }
  };
  const DEFAULT_THRESHOLDS = Object.freeze({ frequentMinimum:75, absentMinimum:60 });
  const selectedMonths = new Set();
  const dailyBadges = new Map();
  let thresholds = { ...DEFAULT_THRESHOLDS, customized:false };
  let collection = null;
  let schoolTerms = [];
  let reading = false;
  let saving = false;

  const cleanName = value => String(value || '').replace(/^\s*\d+\s*(?:[.\-)–—:]\s*)?/, '').replace(/\s*(?:[.\-(–—:]\s*)?\d+\s*\)?\s*$/, '').trim();
  const normalizeName = value => cleanName(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const normalizeClass = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[ºª°]/g, '').replace(/\b(?:turma|serie|ano)\b/gi, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const escapeHtml = value => { const node=document.createElement('span');node.textContent=String(value || '');return node.innerHTML; };
  const initials = value => cleanName(value).split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const classify = percentage => percentage >= thresholds.frequentMinimum ? 'frequent' : percentage >= thresholds.absentMinimum ? 'absent' : 'active_search';
  const isMobileDevice = () => matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent);
  const formatMonthList = months => new Intl.ListFormat('pt-BR',{style:'long',type:'conjunction'}).format(months);

  function parseReadDate(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(?:(\d{4})-(\d{2})-(\d{2})|(\d{2})\/(\d{2})\/(\d{4}))$/);
    if (!match) return null;
    const year = Number(match[1] || match[6]);
    const month = Number(match[2] || match[5]);
    const day = Number(match[3] || match[4]);
    const date = new Date(Date.UTC(year,month - 1,day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { iso:`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`, monthIndex:month - 1 };
  }

  function collectionPeriodLabel() {
    if (!collection) return '';
    const readDates = (collection.datesRead || []).map(parseReadDate).filter(Boolean);
    const readMonthIndexes = [...new Set(readDates.map(item => item.monthIndex))].sort((left,right)=>left-right);
    const fallbackMonthIndexes = [...new Set((collection.months || []).map(month => MONTHS.indexOf(month)).filter(index => index >= 0))].sort((left,right)=>left-right);
    const monthIndexes = readMonthIndexes.length ? readMonthIndexes : fallbackMonthIndexes;
    const monthNames = monthIndexes.map(index => MONTHS[index]);
    if (monthNames.length === 1) return monthNames[0];
    if (readDates.length && monthNames.length > 1) {
      const matchingTerms = schoolTerms.filter(term => term.starts_on && term.ends_on && readDates.every(item => item.iso >= term.starts_on && item.iso <= term.ends_on));
      if (matchingTerms.length === 1) return `${matchingTerms[0].bimester}º bimestre`;
    }
    return monthNames.length ? formatMonthList(monthNames) : 'Período lido';
  }

  async function loadSchoolTerms(year) {
    schoolTerms = [];
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId || !Number.isInteger(Number(year))) return;
    try {
      const { data, error } = await db.from('school_terms').select('bimester,starts_on,ends_on').eq('school_id',schoolId).eq('school_year',Number(year));
      if (!error) schoolTerms = data || [];
    } catch (_) {
      schoolTerms = [];
    }
  }

  const nav = document.querySelector('.nav');
  const anchor = document.getElementById('reportsNav') || document.getElementById('permissionsNav');
  if (!nav || !anchor) return;

  const button = document.createElement('button');
  button.id = 'schoolDailyAttendanceNav';
  button.type = 'button';
  button.className = 'hidden';
  button.innerHTML = '<span>▦ &nbsp; Frequência da Secretaria</span>';
  nav.insertBefore(button, anchor);

  const modal = document.createElement('div');
  modal.id = 'schoolDailyAttendanceModal';
  modal.className = 'modal-bg school-daily-attendance-modal hidden';
  modal.innerHTML = `<section class="modal school-daily-attendance-dialog"><div class="modal-head"><div><h3>Frequência Diária da Escola</h3><div class="meta sda-context" data-sda-context>Abra no SIAP uma turma verde ou vermelha.</div></div><button class="close" type="button" data-sda-close>×</button></div><div class="school-daily-attendance-body"><div class="sda-guide"><b>Leitura automática e somente leitura</b><span>No SIAP, abra Frequência diária e clique uma vez na turma desejada. Aqui, escolha os meses e inicie a leitura. Dias brancos, não letivos e exceções serão ignorados.</span></div><div class="sda-capture hidden" data-sda-capture role="status" aria-live="polite" aria-hidden="true"><span class="sda-capture-spinner" aria-hidden="true"></span><div><strong>Capturando frequência do SIAP…</strong><small>A extensão está percorrendo as datas. Aguarde a conclusão da leitura.</small></div></div><div class="sda-threshold" data-sda-threshold></div><fieldset class="sda-months"><legend>Meses do relatório</legend>${MONTHS.map((month,index)=>`<label><input type="checkbox" data-sda-month="${escapeHtml(month)}"><span>${String(index+1).padStart(2,'0')} · ${escapeHtml(month)}</span></label>`).join('')}</fieldset><div class="sda-actions"><button class="btn primary" type="button" data-sda-read>Ler turma aberta</button><button class="btn secondary hidden" type="button" data-sda-import>Importar para os cards</button><button class="btn secondary" type="button" data-sda-clear>Limpar leitura</button><a class="btn secondary" href="downloads/carometro-frequencia-leitura-0.7.0.zip" download>Baixar extensão</a></div><div class="sda-install-help">Depois de baixar, descompacte o arquivo e use <b>Carregar sem compactação</b> em <b>chrome://extensions</b>. Esta é a mesma extensão da Frequência Assistida, agora com os dois leitores isolados.</div><div class="meta" data-sda-status>Escolha pelo menos um mês para iniciar.</div><div data-sda-summary></div><div data-sda-students></div></div></section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `.school-daily-attendance-modal{z-index:365!important}.school-daily-attendance-dialog{width:min(980px,100%);max-height:94vh}.sda-context{margin-top:4px;font-size:15px!important;font-weight:850!important;color:var(--text)!important}.school-daily-attendance-body{padding:22px}.sda-guide{display:grid;gap:4px;padding:14px 16px;border:1px solid #b9ddcc;border-radius:12px;background:#f1fbf6}.sda-guide span,.sda-install-help{font-size:12px;color:var(--muted)}.sda-capture{display:flex;align-items:center;gap:14px;margin:14px 0 0;padding:16px 18px;border:2px solid #635bff;border-radius:12px;background:#f2f0ff;color:#28205f}.sda-capture.hidden{display:none}.sda-capture strong{display:block;font-size:20px;font-weight:900;line-height:1.2}.sda-capture small{display:block;margin-top:4px;font-size:13px;font-weight:650}.sda-capture-spinner{width:24px;height:24px;flex:0 0 24px;border:3px solid #c9c5ff;border-top-color:#5b50e6;border-radius:50%;animation:sda-spin .8s linear infinite}@keyframes sda-spin{to{transform:rotate(360deg)}}.sda-threshold{margin:14px 0 0;padding:10px 12px;border-radius:9px;background:#eef4ff;color:#23395d;font-size:13px}.sda-months{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0;padding:14px;border:1px solid var(--line);border-radius:12px}.sda-months legend{padding:0 6px;font-weight:800}.sda-months label{display:flex;align-items:center;gap:7px;padding:8px;border-radius:8px;background:#f7f9fc}.sda-months input{width:18px;height:18px}.sda-actions{display:flex;flex-wrap:wrap;gap:9px;margin:16px 0 7px}.sda-actions a{text-decoration:none}.sda-install-help{margin:0 0 16px}.sda-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:16px 0}.sda-summary div{padding:13px;border:1px solid var(--line);border-radius:11px;background:#fff}.sda-summary b{display:block;font-size:22px}.sda-table{display:grid;gap:7px;margin-top:16px}.sda-row{display:grid;grid-template-columns:minmax(260px,2fr) 90px minmax(120px,1fr) 210px;align-items:center;gap:12px;padding:9px 12px;border:1px solid var(--line);border-radius:10px}.sda-student{display:grid;grid-template-columns:54px minmax(0,1fr);align-items:center;gap:12px;min-width:0}.sda-photo{width:54px;height:54px;border-radius:50%;overflow:hidden;display:grid;place-items:center;background:#dce6ff;color:#315dbb;font-size:15px;font-weight:850}.sda-photo img{width:100%;height:100%;object-fit:cover}.sda-name{min-width:0}.sda-name b{overflow-wrap:anywhere}.sda-bar{height:9px;border-radius:99px;background:#e9edf5;overflow:hidden}.sda-bar i{display:block;height:100%;border-radius:inherit}.sda-bar-frequent{background:#16a36a}.sda-bar-absent{background:#e5a000}.sda-bar-active_search{background:#dc3545}.sda-unmatched{color:#b42318;font-size:12px}.sda-warning{margin-top:12px;padding:10px 12px;border-radius:9px;background:#fff7e8;color:#805200;font-size:12px}.attendance-source-detail{display:grid;gap:4px}.attendance-source-detail small{font-size:11px;font-weight:800;color:var(--muted)}@media(prefers-reduced-motion:reduce){.sda-capture-spinner{animation:none}}@media(max-width:700px){.sda-months{grid-template-columns:1fr 1fr}.sda-summary{grid-template-columns:1fr 1fr}.sda-row{grid-template-columns:1fr 70px}.sda-row .sda-bar,.sda-row .attendance-badge{grid-column:1/-1}.sda-student{grid-template-columns:48px minmax(0,1fr)}.sda-photo{width:48px;height:48px}}`;
  document.head.appendChild(style);

  const by = selector => modal.querySelector(selector);
  const hasAccess = () => permission?.role === 'admin' || (permission?.is_secretary === true && permission?.can_import_school_daily_attendance === true);
  let lastAllowed = null;
  const syncAccess = () => {
    const allowed = !isMobileDevice() && hasAccess();
    if (allowed === lastAllowed) return;
    lastAllowed = allowed;
    button.classList.toggle('hidden', !allowed);
    button.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };
  syncAccess();
  setInterval(syncAccess, 1000);
  addEventListener('resize', syncAccess);
  document.addEventListener('carometro:permission-refresh', syncAccess);
  document.addEventListener('carometro:data-loaded', syncAccess);

  async function loadThresholds() {
    const schoolId = window.getActiveSchoolId?.();
    thresholds = { ...DEFAULT_THRESHOLDS, customized:false };
    if (schoolId) {
      const { data, error } = await db.from('school_siap_attendance_settings').select('frequent_minimum,absent_minimum').eq('school_id',schoolId).maybeSingle();
      if (!error && data) thresholds = { frequentMinimum:Number(data.frequent_minimum), absentMinimum:Number(data.absent_minimum), customized:true };
    }
    by('[data-sda-threshold]').textContent = `Frequente: ${thresholds.frequentMinimum}% a 100%. Faltoso: ${thresholds.absentMinimum}% a ${thresholds.frequentMinimum - 1}%. Necessita de Busca Ativa: abaixo de ${thresholds.absentMinimum}%.`;
  }

  function aggregate() {
    if (!collection) return [];
    const people = new Map();
    collection.entries.filter(entry => !entry.blocked).forEach(entry => {
      const key = normalizeName(entry.name);
      if (!key) return;
      const person = people.get(key) || { key, name:cleanName(entry.name), presences:0, absences:0, dates:new Set(), sourceDuplicate:false };
      if (entry.absent) person.absences += 1; else person.presences += 1;
      person.dates.add(entry.date);
      person.sourceDuplicate ||= !!entry.duplicateName;
      people.set(key, person);
    });
    return [...people.values()].map(person => {
      const total = person.presences + person.absences;
      const percentage = Math.round(person.presences / Math.max(1,total) * 100);
      return { ...person, days:person.dates.size, percentage, status:classify(percentage) };
    }).sort((left,right)=>left.name.localeCompare(right.name,'pt-BR',{sensitivity:'base'}));
  }

  function matchStudents(rows) {
    const classKey = normalizeClass(collection?.context?.className);
    const sameClass = students.filter(student => normalizeClass(student.className) === classKey);
    return rows.map(row => {
      const localMatches = sameClass.filter(student => normalizeName(student.name) === row.key);
      const globalMatches = students.filter(student => normalizeName(student.name) === row.key);
      const matches = !row.sourceDuplicate && localMatches.length === 1 ? localMatches : !row.sourceDuplicate && localMatches.length === 0 && globalMatches.length === 1 ? globalMatches : [];
      return { ...row, matches, usedSchoolWideFallback:matches.length === 1 && localMatches.length === 0, ambiguous:row.sourceDuplicate || localMatches.length > 1 || globalMatches.length > 1 };
    });
  }

  function render(message='') {
    const rows = matchStudents(aggregate());
    const matched = rows.filter(row => row.matches.length === 1);
    const importedControl = by('[data-sda-import]');
    importedControl.classList.toggle('hidden', !collection);
    importedControl.disabled = !collection || saving || !matched.length;
    by('[data-sda-context]').textContent = collection ? `${collection.context.shift} · ${collection.context.className} · ${collectionPeriodLabel()}` : 'Abra no SIAP uma turma verde ou vermelha.';
    by('[data-sda-summary]').innerHTML = collection ? `<div class="sda-summary"><div><b>${collection.datesRead.length}</b><span>dias preenchidos</span></div><div><b>${rows.length}</b><span>alunos lidos</span></div><div><b>${rows.filter(row=>row.status==='absent').length}</b><span>faltosos</span></div><div><b>${rows.filter(row=>row.status==='active_search').length}</b><span>busca ativa</span></div></div>` : '';
    const skipped = collection ? collection.skipped : null;
    const warning = skipped ? `<div class="sda-warning">Ignorados com segurança: ${skipped.notFilled} dia(s) sem preenchimento, ${skipped.nonSchoolDay} não letivo(s), ${skipped.exception} exceção(ões) e ${skipped.future} data(s) futura(s).</div>` : '';
    by('[data-sda-students]').innerHTML = collection ? warning + `<div class="sda-table">${rows.map(row=>{const status=STATUS[row.status];const match=row.matches.length===1;const photoUrl=match?row.matches[0].photoUrl:'';const photo=photoUrl?`<img src="${escapeHtml(photoUrl)}" alt="">`:escapeHtml(initials(row.name));const note=match?(row.usedSchoolWideFallback?'<div class="sda-unmatched">Nome único localizado em outra grafia de turma</div>':''):`<div class="sda-unmatched">${row.ambiguous?'Nome duplicado; não será importado':'Não identificado no Carômetro'}</div>`;return `<div class="sda-row"><div class="sda-student"><span class="sda-photo">${photo}</span><div class="sda-name"><b>${escapeHtml(row.name)}</b>${note}</div></div><b>${row.percentage}%</b><div class="sda-bar"><i class="sda-bar-${row.status}" style="width:${row.percentage}%"></i></div><span class="attendance-badge ${status.className}">${status.label}</span></div>`;}).join('')}</div>` : '<div class="empty">Escolha os meses e inicie a leitura.</div>';
    if (message) by('[data-sda-status]').textContent = message;
    else if (!selectedMonths.size) by('[data-sda-status]').textContent = 'Escolha pelo menos um mês para iniciar.';
    else if (!collection) by('[data-sda-status]').textContent = 'Abra no SIAP uma turma verde ou vermelha e clique em Ler turma aberta.';
    else by('[data-sda-status]').textContent = `${matched.length} aluno(s) identificado(s) com segurança pelo nome completo.${collection.restoreWarning || ''}`;
  }

  function setCaptureActive(active) {
    reading = active;
    const capture = by('[data-sda-capture]');
    capture.classList.toggle('hidden', !active);
    capture.setAttribute('aria-hidden', String(!active));
  }

  function requestCollection() {
    return new Promise(resolve => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { window.removeEventListener('message', receive);resolve({ok:false,message:'A leitura demorou além do esperado. A extensão interrompeu a espera sem alterar o SIAP.'}); }, 30 * 60 * 1000);
      function receive(event) {
        const data = event.data;
        if (event.source !== window || event.origin !== location.origin || data?.source !== 'CAROMETRO_SCHOOL_DAILY_EXTENSION' || data?.type !== 'CAROMETRO_SCHOOL_DAILY_RESULT' || data.requestId !== requestId) return;
        clearTimeout(timer);window.removeEventListener('message',receive);resolve(data.response || {ok:false,message:'Resposta vazia da extensão.'});
      }
      window.addEventListener('message',receive);
      window.postMessage({source:'CAROMETRO_WEB',type:'CAROMETRO_SCHOOL_DAILY_REQUEST',requestId,months:[...selectedMonths]},location.origin);
    });
  }

  async function loadDailyBadges() {
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) return;
    const { data, error } = await db.from('siap_school_daily_attendance_current').select('student_id,status,percentage,updated_at').eq('school_id',schoolId).order('updated_at',{ascending:false});
    if (error) return;
    dailyBadges.clear();
    (data || []).forEach(item => {
      if (!dailyBadges.has(item.student_id)) dailyBadges.set(item.student_id, STATUS[item.status] ? item.status : classify(Number(item.percentage)));
    });
    window.render?.();
  }

  const teacherStatus = window.getSiapAttendanceStatus;
  window.getSchoolDailyAttendanceStatus = studentId => dailyBadges.get(studentId) || null;
  window.getTeacherAttendanceStatus = studentId => teacherStatus?.(studentId) || null;
  window.getStudentAttendanceDetails = studentId => [
    { source:'Secretaria', status:dailyBadges.get(studentId) || null },
    { source:'Professor', status:teacherStatus?.(studentId) || null }
  ].filter(item => STATUS[item.status]).map(item => ({ ...item, label:STATUS[item.status].label, className:STATUS[item.status].className }));
  window.getSiapAttendanceStatus = studentId => dailyBadges.get(studentId) || teacherStatus?.(studentId) || null;
  window.getSiapAttendanceBadge = studentId => {
    const key = dailyBadges.get(studentId) || teacherStatus?.(studentId);
    if (!key || key === 'frequent') return '';
    const status = STATUS[key];
    return `<span class="attendance-badge ${status.className}">${status.label}</span>`;
  };

  async function importCollection() {
    if (!collection || saving) return;
    saving = true;
    try {
      const schoolId = window.getActiveSchoolId?.();
      if (!schoolId) throw new Error('Selecione uma escola no Carômetro.');
      const rows = matchStudents(aggregate()).filter(row => row.matches.length === 1);
      if (!rows.length) throw new Error('Nenhum aluno foi identificado com segurança pelo nome completo.');
      const periodKey = ['school-daily',collection.context.year,collection.context.term,collection.context.classCode,collection.months.join(',')].join('|');
      const payload = rows.map(row => ({
        school_id:schoolId,
        student_id:row.matches[0].id,
        class_id:row.matches[0].classId,
        academic_year:Number(collection.context.year),
        term:collection.context.term,
        months:collection.months,
        school_day_count:row.days,
        presences:row.presences,
        absences:row.absences,
        percentage:row.percentage,
        status:row.status,
        period_key:periodKey,
        source_dates:collection.datesRead
      }));
      const { error } = await db.rpc('import_siap_school_daily_attendance',{p_rows:payload});
      if (error) throw error;
      await loadDailyBadges();
      render(`${payload.length} aluno(s) sincronizado(s). Nomes ausentes ou duplicados não foram alterados.`);
    } catch (error) {
      render(`A leitura foi concluída, mas ainda não foi gravada: ${error.message}`);
    } finally {
      saving = false;
      by('[data-sda-import]').disabled = !collection;
    }
  }

  by('[data-sda-close]').onclick = () => modal.classList.add('hidden');
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  button.onclick = async () => { if (isMobileDevice() || !hasAccess()) return;modal.classList.remove('hidden');await loadThresholds();await loadDailyBadges();render(); };
  modal.querySelectorAll('[data-sda-month]').forEach(input => input.addEventListener('change',()=>{input.checked?selectedMonths.add(input.dataset.sdaMonth):selectedMonths.delete(input.dataset.sdaMonth);collection=null;render();}));
  by('[data-sda-read]').onclick = async () => {
    if (reading) return;
    if (!selectedMonths.size) { render('Escolha pelo menos um mês antes de iniciar a leitura.');return; }
    setCaptureActive(true);const control=by('[data-sda-read]');control.disabled=true;render('Lendo as datas da turma no SIAP. Isso pode levar alguns minutos…');
    try {
      const response = await requestCollection();
      if (!response?.ok) { render(response?.message || 'Não foi possível concluir a leitura.');return; }
      collection = response.result;
      await loadSchoolTerms(collection.context.year);
      render(`Leitura concluída: ${collection.datesRead.length} dia(s) preenchido(s).${collection.restoreWarning || ''}`);
    } catch (error) {
      render(`A leitura foi interrompida com segurança: ${error.message}`);
    } finally {
      setCaptureActive(false);control.disabled=false;
    }
  };
  by('[data-sda-import]').onclick = importCollection;
  by('[data-sda-clear]').onclick = () => { collection=null;selectedMonths.clear();modal.querySelectorAll('[data-sda-month]').forEach(input=>{input.checked=false;});render(); };

  document.addEventListener('carometro:school-context-changed', async () => { dailyBadges.clear();collection=null;schoolTerms=[];await loadThresholds();await loadDailyBadges();render(); });
  setTimeout(loadDailyBadges, 1700);
});
