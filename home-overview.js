document.addEventListener('DOMContentLoaded', () => {
  const stats = document.querySelector('#app .stats');
  const studentCard = stats?.querySelector('.stat');
  const classCard = stats?.querySelectorAll('.stat')[1];
  const actions = document.querySelector('#app .top-actions');
  if (!stats || !studentCard || !classCard || !actions) return;

  // Os contadores conservam os IDs usados pelos módulos de turma e frequência.
  studentCard.classList.add('home-counts');
  const studentCount = document.createElement('div');
  studentCount.className = 'home-student-count';
  studentCount.append(studentCard.querySelector('span'), studentCard.querySelector('#total'));
  const studentCaption = document.createElement('small');
  studentCaption.textContent = 'Total de alunos cadastrados';
  studentCount.append(studentCaption);
  studentCard.append(studentCount);
  const classCount = classCard.querySelector('#classesCount');
  const classCountItem = document.createElement('div');
  classCountItem.className = 'home-class-count';
  classCountItem.innerHTML = '<span>Turmas</span>';
  classCountItem.append(classCount);
  const classCaption = document.createElement('small');
  classCaption.textContent = 'Total de turmas cadastradas';
  classCountItem.append(classCaption);
  studentCard.append(classCountItem);
  classCard.remove();

  const overview = document.createElement('section');
  overview.className = 'stat home-overview';
  overview.setAttribute('aria-label', 'Lembretes e destaques da escola');
  overview.innerHTML = `
    <div class="home-overview-head"><span>Lembrete da semana</span></div>
    <div id="homeReminderList" class="home-overview-list"></div>
    <div class="home-overview-highlights">
      <span id="homeOverviewWeekLabel">Atualizações automáticas do Carômetro</span>
      <div data-metric-key="student_occurrences"><span>Aluno com mais ocorrências na semana</span><button type="button" id="homeOccurrenceLeaders" class="home-highlight-link">Carregando…</button></div>
      <div data-metric-key="class_occurrences"><span>Turma com mais ocorrências na semana</span><button type="button" id="homeClassOccurrenceLeader" class="home-highlight-link">Carregando…</button></div>
      <div data-metric-key="praise_student"><span>Aluno que recebeu elogio</span><button type="button" id="homePraiseStudent" class="home-highlight-link">Carregando…</button></div>
      <div data-metric-key="siap_student_absences"><span>Mais faltas da última extração do SIAP</span><button type="button" id="homeAbsenceLeaders" class="home-highlight-link">Carregando…</button></div>
      <div data-metric-key="school_data"><span>Dados da escola</span><button type="button" id="homeSchoolSummary" class="home-highlight-link" disabled>Carregando…</button></div>
      <div data-metric-key="new_students"><span>Alunos cadastrados na semana</span><button type="button" id="homeNewStudents" class="home-highlight-link" disabled>Carregando…</button></div>
      <div data-metric-key="classes_without_occurrences"><span>Turmas sem ocorrências na semana</span><button type="button" id="homeClassesWithoutOccurrences" class="home-highlight-link" disabled>Carregando…</button></div>
      <div data-metric-key="class_fewest_occurrences"><span>Turma com menos ocorrências registradas</span><button type="button" id="homeClassFewestOccurrences" class="home-highlight-link" disabled>Carregando…</button></div>
      <div data-metric-key="siap_class_low_absences"><span>Turma com menor média de faltas no SIAP</span><button type="button" id="homeClassLowAbsences" class="home-highlight-link" disabled>Carregando…</button></div>
      <div data-metric-key="siap_class_high_absences"><span>Turma com maior média de faltas no SIAP</span><button type="button" id="homeClassHighAbsences" class="home-highlight-link" disabled>Carregando…</button></div>
    </div>`;
  stats.append(overview);

  const modal = document.createElement('div');
  modal.id = 'homeReminderModal';
  modal.className = 'modal-bg hidden';
  modal.innerHTML = `<div class="modal small" role="dialog" aria-modal="true" aria-labelledby="homeReminderTitle">
    <div class="modal-head"><h3 id="homeReminderTitle">Adicionar lembrete</h3><button type="button" class="close" data-home-close aria-label="Fechar">×</button></div>
    <form id="homeReminderForm" class="form"><div class="field"><label for="homeReminderText">Lembrete</label><input id="homeReminderText" required maxlength="120" autocomplete="off"></div>
    <div class="field"><label for="homeReminderDate">Data (opcional)</label><input id="homeReminderDate" type="date"></div>
    <div class="actions"><button type="button" class="btn secondary" data-home-close>Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form></div>`;
  document.body.append(modal);
  const by = id => document.getElementById(id);
  const safe = value => { const node = document.createElement('span'); node.textContent = String(value ?? ''); return node.innerHTML; };
  const schoolId = () => window.getActiveSchoolId?.();
  const current = scope => scope.school === schoolId() && scope.user === user?.id
    && scope.request === request && !by('app').classList.contains('hidden');
  let request = 0;
  let reminders = [];
  let occurrenceLeaderId = null;
  let classOccurrenceLeaderId = null;
  let classFewestOccurrenceId = null;
  let praiseStudentId = null;
  let absenceLeaderId = null;
  let classLowAbsenceId = null;
  let classHighAbsenceId = null;
  const markReady = (id, ready, secondary = '') => {
    const row = by(id).closest('[data-metric-key]');
    row.dataset.ready = ready ? 'true' : 'false';
    row.dataset.secondary = secondary;
  };

  function weekBounds() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6);
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return [dateKey(first), dateKey(last)];
  }
  function completedWeek() {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const first = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
    const last = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1);
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const short = date => date.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
    return { start:dateKey(first), end:dateKey(last), cutoff:monday.toISOString(), label:`${short(first)} a ${short(last)}` };
  }
  function renderReminders() {
    const [start, end] = weekBounds();
    const visible = reminders.filter(item => !item.reminder_date || (item.reminder_date >= start && item.reminder_date <= end));
    by('homeReminderList').innerHTML = visible.length
      ? visible.map(item => `<div class="home-reminder" data-reminder-id="${safe(item.id)}"><span>${safe(item.title)}${item.reminder_date ? `<small>${new Date(`${item.reminder_date}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' })}</small>` : ''}</span><button type="button" data-reminder-delete="${safe(item.id)}" aria-label="Excluir lembrete">×</button></div>`).join('')
      : '<p>Nenhum lembrete para esta semana.</p>';
  }
  async function loadReminders(scope) {
    const { data, error } = await db.from('home_reminders').select('id,title,reminder_date,created_at')
      .eq('school_id', scope.school).eq('user_id', scope.user).order('reminder_date', { ascending:true, nullsFirst:true }).order('created_at', { ascending:false }).limit(100);
    if (!current(scope)) return;
    reminders = error ? [] : (data || []);
    by('homeReminderList').innerHTML = error ? '<p>Não foi possível carregar os lembretes.</p>' : '';
    if (!error) renderReminders();
  }
  async function loadOccurrences(scope, start, end) {
    const counts = new Map();
    const classCounts = new Map();
    let praise = null;
    for (let offset = 0; offset < 5000; offset += 1000) {
      const { data, error } = await db.from('student_occurrences').select('student_id,class_id,occurrence_text')
        .eq('school_id', scope.school).gte('occurred_on', start).lte('occurred_on', end).range(offset, offset + 999);
      if (error) { if (current(scope)) by('homeOccurrenceLeaders').textContent = 'Sem acesso às ocorrências.'; return; }
      (data || []).forEach(row => {
        counts.set(row.student_id, (counts.get(row.student_id) || 0) + 1);
        if (row.class_id) classCounts.set(row.class_id, (classCounts.get(row.class_id) || 0) + 1);
        if (!praise && /\belogi(?:o|ado|ada|ar)\b/i.test(row.occurrence_text || '')) praise = row.student_id;
      });
      if ((data || []).length < 1000) break;
    }
    if (!current(scope)) return;
    const names = new Map(students.map(item => [item.id, item.name]));
    const leaders = [...counts].filter(([id]) => names.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    occurrenceLeaderId = leaders[0]?.[0] || null;
    by('homeOccurrenceLeaders').disabled = !occurrenceLeaderId;
    markReady('homeOccurrenceLeaders', !!occurrenceLeaderId);
    by('homeOccurrenceLeaders').textContent = leaders.length ? `${names.get(leaders[0][0])} · ${leaders[0][1]} ocorrência${leaders[0][1] === 1 ? '' : 's'}` : 'Nenhuma ocorrência na semana do resumo.';
    const classNames = new Map(classes.map(item => [item.id, item.name]));
    const classLeader = [...classCounts].filter(([id]) => classNames.has(id)).sort((a, b) => b[1] - a[1])[0];
    classOccurrenceLeaderId = classLeader?.[0] || null;
    by('homeClassOccurrenceLeader').disabled = !classLeader;
    markReady('homeClassOccurrenceLeader', !!classLeader);
    by('homeClassOccurrenceLeader').textContent = classLeader ? `${classNames.get(classLeader[0])} · ${classLeader[1]} ocorrência${classLeader[1] === 1 ? '' : 's'}` : 'Nenhuma turma com ocorrência na semana.';
    const withoutOccurrences = classes.filter(item => !classCounts.has(item.id));
    by('homeClassesWithoutOccurrences').textContent = `${withoutOccurrences.length} turma${withoutOccurrences.length === 1 ? '' : 's'} sem ocorrências`;
    markReady('homeClassesWithoutOccurrences', withoutOccurrences.length > 0, withoutOccurrences.slice(0, 3).map(item => item.name).join(' · '));
    const fewest = [...classCounts].filter(([id]) => classNames.has(id)).sort((a, b) => a[1] - b[1])[0];
    classFewestOccurrenceId = fewest?.[0] || null;
    by('homeClassFewestOccurrences').disabled = !fewest;
    by('homeClassFewestOccurrences').textContent = fewest ? `${classNames.get(fewest[0])} · ${fewest[1]} ocorrência${fewest[1] === 1 ? '' : 's'}` : 'Nenhuma turma com ocorrência na semana.';
    markReady('homeClassFewestOccurrences', !!fewest);
    praiseStudentId = praise && names.has(praise) ? praise : null;
    by('homePraiseStudent').disabled = !praiseStudentId;
    markReady('homePraiseStudent', !!praiseStudentId);
    by('homePraiseStudent').textContent = praiseStudentId ? names.get(praiseStudentId) : 'Nenhum elogio registrado na semana.';
  }
  async function loadAbsences(scope, cutoff) {
    const latestResult = await db.from('siap_bimester_absences')
      .select('imported_at,academic_year,bimester').eq('school_id', scope.school)
      .lt('imported_at', cutoff).order('imported_at', { ascending:false }).limit(1).maybeSingle();
    if (!current(scope)) return;
    if (latestResult.error) { by('homeAbsenceLeaders').textContent = 'Faltas indisponíveis.'; return; }
    const latest = latestResult.data;
    if (!latest) { by('homeAbsenceLeaders').textContent = 'Nenhuma extração do SIAP registrada.'; return; }
    const rows = [];
    for (let offset = 0; offset < 5000; offset += 1000) {
      const { data, error } = await db.from('siap_bimester_absences')
        .select('student_id,absences')
        .eq('school_id', scope.school).eq('imported_at', latest.imported_at)
        .range(offset, offset + 999);
      if (error) { if (current(scope)) by('homeAbsenceLeaders').textContent = 'Faltas indisponíveis.'; return; }
      rows.push(...(data || []));
      if ((data || []).length < 1000) break;
    }
    if (!current(scope)) return;
    const totals = new Map();
    rows.forEach(row => totals.set(row.student_id, (totals.get(row.student_id) || 0) + row.absences));
    const names = new Map(students.map(item => [item.id, item.name]));
    const leaders = [...totals].filter(([id]) => names.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    absenceLeaderId = leaders[0]?.[0] || null;
    by('homeAbsenceLeaders').disabled = !absenceLeaderId;
    markReady('homeAbsenceLeaders', !!absenceLeaderId);
    by('homeAbsenceLeaders').textContent = leaders.length
      ? `${leaders.map(([id, count]) => `${names.get(id)} (${count})`).join(' · ')} · ${latest.bimester}º bim/${latest.academic_year}`
      : 'Nenhum aluno da escola atual na extração.';
    const studentClasses = new Map(students.map(item => [item.id, item.classId]));
    const classNames = new Map(classes.map(item => [item.id, item.name]));
    const classTotals = new Map();
    for (const [studentId, count] of totals) {
      const classId = studentClasses.get(studentId);
      if (!classId || !classNames.has(classId)) continue;
      const current = classTotals.get(classId) || { absences:0, students:0 };
      current.absences += count; current.students += 1;
      classTotals.set(classId, current);
    }
    const averages = [...classTotals].map(([id, value]) => ({ id, average:value.absences / value.students, students:value.students }));
    averages.sort((a, b) => a.average - b.average);
    const lowest = averages[0];
    const highest = averages[averages.length - 1];
    classLowAbsenceId = lowest?.id || null;
    classHighAbsenceId = highest?.id || null;
    for (const [id, item] of [['homeClassLowAbsences', lowest], ['homeClassHighAbsences', highest]]) {
      by(id).disabled = !item;
      by(id).textContent = item ? classNames.get(item.id) : 'Nenhuma turma disponível na extração.';
      markReady(id, !!item, item ? `${item.average.toFixed(1).replace('.', ',')} falta${item.average === 1 ? '' : 's'} por aluno · ${item.students} aluno${item.students === 1 ? '' : 's'}` : '');
    }
  }
  async function loadNewStudents(scope, start, end) {
    const from = new Date(`${start}T00:00:00`).toISOString();
    const until = new Date(`${end}T00:00:00`);
    until.setDate(until.getDate() + 1);
    const { data, count, error } = await db.from('students')
      .select('full_name,class_id', { count:'exact' }).eq('school_id', scope.school)
      .gte('created_at', from).lt('created_at', until.toISOString())
      .order('created_at', { ascending:false }).limit(1);
    if (!current(scope)) return;
    by('homeNewStudents').textContent = error ? 'Cadastros indisponíveis.' : `${count || 0} aluno${count === 1 ? '' : 's'} cadastrado${count === 1 ? '' : 's'}`;
    markReady('homeNewStudents', !error && count > 0, data?.[0]?.full_name ? `Mais recente: ${data[0].full_name}` : '');
  }
  async function refresh() {
    const scope = { school:schoolId(), user:user?.id, request:++request };
    const highlights = by('homeSchoolSummary').closest('.home-overview-highlights');
    highlights.dataset.loaded = 'false';
    occurrenceLeaderId = null; absenceLeaderId = null;
    classOccurrenceLeaderId = null; classFewestOccurrenceId = null; praiseStudentId = null;
    classLowAbsenceId = null; classHighAbsenceId = null;
    for (const row of highlights.querySelectorAll('[data-metric-key]')) {
      row.dataset.ready = 'false'; row.dataset.secondary = '';
    }
    by('homeOccurrenceLeaders').disabled = true;
    by('homeClassOccurrenceLeader').disabled = true;
    by('homePraiseStudent').disabled = true;
    by('homeAbsenceLeaders').disabled = true;
    by('homeClassFewestOccurrences').disabled = true;
    by('homeClassLowAbsences').disabled = true;
    by('homeClassHighAbsences').disabled = true;
    if (!scope.school || !scope.user || by('app').classList.contains('hidden')) {
      reminders = []; renderReminders();
      occurrenceLeaderId = null; absenceLeaderId = null;
      by('homeOccurrenceLeaders').textContent = '—'; by('homeAbsenceLeaders').textContent = '—';
      return;
    }
    const week = completedWeek();
    by('homeOverviewWeekLabel').textContent = `Carômetro · semana de ${week.label}`;
    by('homeSchoolSummary').textContent = `${students.length} alunos · ${classes.length} turmas cadastradas`;
    markReady('homeSchoolSummary', true);
    await Promise.allSettled([loadReminders(scope), loadOccurrences(scope, week.start, week.end), loadAbsences(scope, week.cutoff), loadNewStudents(scope, week.start, week.end)]);
    if (current(scope)) highlights.dataset.loaded = 'true';
  }

  // Lembretes novos são publicados em Comunicação, no menu da escola.
  modal.querySelectorAll('[data-home-close]').forEach(button => button.onclick = () => modal.classList.add('hidden'));
  modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  by('homeReminderForm').onsubmit = async event => {
    event.preventDefault();
    const scope = { school:schoolId(), user:user?.id };
    if (!scope.school || !scope.user) return;
    const title = by('homeReminderText').value.trim();
    if (!title) return;
    const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
    const { error } = await db.from('home_reminders').insert({ school_id:scope.school, user_id:scope.user, title, reminder_date:by('homeReminderDate').value || null });
    button.disabled = false;
    if (error) { toast('Não foi possível salvar o lembrete.'); return; }
    modal.classList.add('hidden'); refresh();
  };
  by('homeReminderList').onclick = async event => {
    const button = event.target.closest('[data-reminder-delete]');
    if (!button) return;
    const scope = { school:schoolId(), user:user?.id };
    button.disabled = true;
    const { error } = await db.from('home_reminders').delete().eq('id', button.dataset.reminderDelete).eq('school_id', scope.school).eq('user_id', scope.user);
    if (error) { button.disabled = false; toast('Não foi possível excluir o lembrete.'); return; }
    refresh();
  };
  by('homeOccurrenceLeaders').onclick = () => {
    if (occurrenceLeaderId && typeof window.openOccurrenceRecord === 'function') {
      const student = students.find(item => item.id === occurrenceLeaderId);
      window.openOccurrenceRecord({ studentId:occurrenceLeaderId, classId:student?.classId });
    } else by('occurrenceNav')?.click();
  };
  by('homeClassOccurrenceLeader').onclick = () => {
    if (classOccurrenceLeaderId) window.selectClass?.(classOccurrenceLeaderId);
  };
  by('homeClassFewestOccurrences').onclick = () => {
    if (classFewestOccurrenceId) window.selectClass?.(classFewestOccurrenceId);
  };
  by('homeClassLowAbsences').onclick = () => {
    if (classLowAbsenceId) window.selectClass?.(classLowAbsenceId);
  };
  by('homeClassHighAbsences').onclick = () => {
    if (classHighAbsenceId) window.selectClass?.(classHighAbsenceId);
  };
  by('homePraiseStudent').onclick = () => {
    if (!praiseStudentId) return;
    const student = students.find(item => item.id === praiseStudentId);
    if (typeof window.openOccurrenceRecord === 'function') window.openOccurrenceRecord({ studentId:praiseStudentId, classId:student?.classId });
  };
  by('homeAbsenceLeaders').onclick = () => {
    if (absenceLeaderId) {
      const student = students.find(item => item.id === absenceLeaderId);
      if (student) { window.selectClass?.(student.classId); window.showStudentDetails?.(student.id); }
    }
  };
  document.addEventListener('carometro:data-loaded', refresh);
  document.addEventListener('carometro:school-context-ready', refresh);
  new MutationObserver(() => {
    if (!by('app').classList.contains('hidden')) refresh();
  }).observe(by('app'), { attributes:true, attributeFilter:['class'] });
  document.addEventListener('carometro:occurrences-changed', refresh);
  document.addEventListener('carometro:siap-absences-imported', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  function scheduleMondayRefresh() {
    const now = new Date();
    const days = 7 - ((now.getDay() + 6) % 7);
    const nextMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    window.setTimeout(() => { refresh(); scheduleMondayRefresh(); }, nextMonday.getTime() - now.getTime() + 1000);
  }
  scheduleMondayRefresh();
  refresh();
});
