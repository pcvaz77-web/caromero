// Núcleo da interface comercial. Operações escolares ficam nos módulos
// especializados, que exigem a escola ativa e aplicam as permissões locais.
const db = window.createCarometroSupabaseClient();
const $ = id => document.getElementById(id);
let user;
const emptySchoolPermission = () => ({ role:'viewer', is_coordinator:false, can_add_students:false, can_edit_students:false, can_use_siap_assistant:false, can_import_siap_attendance:false });
let permission = emptySchoolPermission();
let students = [];
let classes = [];
let selectedClassId = null;
let selectedShift = null;
let detailStudentId = null;
let file = null;

const esc = value => {
  const element = document.createElement('div');
  element.textContent = value || '';
  return element.innerHTML;
};
const ini = value => (value || '').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const badge = value => value ? `<span class="pill ${value === 'Laudo' ? 'report' : value === 'Dificuldade leve' ? 'light' : 'severe'}">${esc(value)}</span>` : '';
const toast = message => {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 3200);
};
const close = id => $(id).classList.add('hidden');

(function preserveNotificationDeepLink() {
  try {
    const id = new URLSearchParams(location.search).get('notification');
    if (id) sessionStorage.setItem('carometroPendingNotification', id);
  } catch {}
})();

async function profile() {
  await db.from('profiles').upsert({ id:user.id, email:user.email }, { onConflict:'id' });
}

function classOptions(value = '') {
  return `<option value="" disabled ${!value ? 'selected' : ''}>Selecione a turma</option>`
    + classes.map(item => `<option value="${item.id}" ${item.id === value ? 'selected' : ''}>${esc(item.name)}</option>`).join('');
}

function render() {
  const query = $('search').value.toLowerCase();
  const shiftByClass = new Map(classes.map(item => [item.id, item.shift || 'Matutino']));
  const items = students
    .filter(student => (!selectedClassId || student.classId === selectedClassId)
      && (!selectedShift || shiftByClass.get(student.classId) === selectedShift)
      && student.name.toLowerCase().includes(query)
      && (typeof window.matchesQuickFilters !== 'function' || window.matchesQuickFilters(student)))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { numeric:true, sensitivity:'base' }));
  const selected = classes.find(item => item.id === selectedClassId);
  $('total').textContent = students.length;
  $('classesCount').textContent = classes.length;
  $('pageTitle').textContent = selected ? selected.name : 'CARÔMETRO';
  $('pageSubtitle').textContent = selected ? 'Alunos cadastrados nesta turma.' : 'Consulte os perfis dos estudantes.';
  $('listTitle').textContent = selected ? `Alunos — ${selected.name}` : 'Lista de alunos';
  $('deleteClass').classList.toggle('hidden', !selected || !permission.can_edit_students);
  $('classList').innerHTML = classes.length
    ? classes.map(item => `<button class="${item.id === selectedClassId ? 'active' : ''}" onclick="selectClass('${item.id}')">${esc(item.name)}</button>`).join('')
    : '<div class="meta" style="padding:0 10px">Nenhuma turma.</div>';
  $('classId').innerHTML = classOptions();
  const canEdit = permission.can_edit_students;
  const detail = students.find(student => student.id === detailStudentId);
  $('studentDetails').classList.toggle('hidden', !detail);
  $('studentDetails').innerHTML = detail
    ? `<div class="detail-head"><div class="avatar">${detail.photoUrl ? `<img src="${detail.photoUrl}" alt="">` : ini(detail.name)}</div><div><h3>${esc(detail.name)}</h3><div class="meta">Perfil do aluno</div></div></div><div class="detail-row"><b>Turma</b>${esc(detail.className)}</div>${detail.report ? `<div class="detail-row"><b>Informação</b>${esc(detail.report)}</div>` : ''}`
    : '<div class="empty">👈<br><br>Selecione um aluno para ver os detalhes.</div>';
  $('list').innerHTML = items.length
    ? items.map(student => `<article class="student clickable" onclick="showStudentDetails('${student.id}')"><div class="avatar">${student.photoUrl ? `<img src="${student.photoUrl}" alt="">` : ini(student.name)}</div><div><div class="name">${esc(student.name)}</div><div class="meta hidden"></div></div><div><div class="meta">Turma</div><div>${esc(student.className)}</div></div><div>${badge(student.report)}</div>${canEdit ? `<div class="actions-small"><button class="edit" onclick="editStudent('${student.id}')">Editar</button><button class="delete" onclick="deleteStudent('${student.id}')">Excluir</button></div>` : '<div></div>'}</article>`).join('')
    : `<div class="empty">👩‍🎓<br><br>${selected ? 'Nenhum aluno nesta turma.' : 'Nenhum aluno encontrado.'}</div>`;
}

window.selectClass = id => { selectedClassId = id; selectedShift = null; detailStudentId = null; render(); };
window.showStudentDetails = id => { detailStudentId = id; render(); };
window.resetCarometroSchoolState = () => {
  permission = emptySchoolPermission();
  students = [];
  classes = [];
  selectedClassId = null;
  selectedShift = null;
  detailStudentId = null;
  $('permissionsNav')?.classList.add('hidden');
  $('newStudent')?.classList.add('hidden');
  $('newBulk')?.classList.add('hidden');
  $('newClass')?.classList.add('hidden');
  $('deleteClass')?.classList.add('hidden');
  if ($('roleLabel')) $('roleLabel').textContent = 'Sem escola ativa';
  render();
  document.dispatchEvent(new CustomEvent('carometro:permission-refresh'));
};
window.prepareCarometroSignOut = () => {
  // Esconde o app antes de qualquer await: os salvadores de navegação ligados
  // ao clique/pagehide não conseguem regravar estado da conta anterior.
  $('app')?.classList.add('hidden');
  try {
    sessionStorage.removeItem('carometro:mobile-screen');
    sessionStorage.removeItem('carometroPendingNotification');
  } catch {}
};

async function showApp() {
  if (window.isCarometroPasswordRecovery?.()) { window.openCarometroPasswordReset?.(); return; }
  const { data:{ user:signedInUser } } = await db.auth.getUser();
  user = signedInUser;
  if (!user) return;
  await profile();
  await window.resolveActiveSchoolContext?.();
  await window.refreshCarometroSchoolPermission?.();
  await window.startCarometroRealtime?.(user);
  $('login').classList.add('hidden');
  $('app').classList.remove('hidden');
  await window.load?.();
  await consumePendingNotification();
}

$('loginForm').onsubmit = async event => {
  event.preventDefault();
  const { error } = await db.auth.signInWithPassword({ email:$('email').value.trim(), password:$('password').value });
  $('loginError').textContent = error?.message || '';
  $('loginError').classList.toggle('hidden', !error);
  if (!error) showApp();
};
$('openRecovery').onclick = () => $('recoveryModal').classList.remove('hidden');
$('recoveryForm').onsubmit = async event => {
  event.preventDefault();
  const recoveryUrl = new URL('reset-password.html', location.href).href;
  const { error } = await db.auth.resetPasswordForEmail($('recoveryEmail').value.trim(), { redirectTo:recoveryUrl });
  if (error) toast(error.message); else { close('recoveryModal'); toast('Link de recuperação enviado.'); }
};
$('signOut').onclick = async () => {
  window.prepareCarometroSignOut?.();
  await window.disableCarometroPush?.();
  await window.clearCarometroNotificationChannel?.();
  window.clearActiveSchoolContext?.();
  await db.auth.signOut();
  window.resetCarometroSchoolState?.();
  user = null;
  $('login').classList.remove('hidden');
};
$('newBulk').onclick = () => {
  if (!classes.length) { toast('Cadastre uma turma antes de cadastrar alunos.'); $('classModal').classList.remove('hidden'); return; }
  $('bulkForm').reset();
  $('bulkClassId').innerHTML = classOptions(selectedClassId || '');
  $('bulkModal').classList.remove('hidden');
};
$('search').oninput = render;
document.querySelectorAll('[data-close]').forEach(element => { element.onclick = () => close(element.dataset.close); });
document.querySelectorAll('.modal-bg').forEach(modal => { modal.onclick = event => { if (event.target === modal) close(modal.id); }; });
document.addEventListener('click', event => {
  if (detailStudentId && !event.target.closest('#studentDetails,.student')) { detailStudentId = null; render(); }
});

document.addEventListener('DOMContentLoaded', () => {
  db.auth.getSession().then(({ data }) => { if (data.session) showApp(); });
});

async function consumePendingNotification() {
  let id;
  try { id = sessionStorage.getItem('carometroPendingNotification'); } catch { id = null; }
  if (!id || !window.openNotificationById) return;
  try { sessionStorage.removeItem('carometroPendingNotification'); } catch {}
  try {
    const url = new URL(location.href);
    url.searchParams.delete('notification');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {}
  await window.openNotificationById(id);
}
