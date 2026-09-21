(() => {
  'use strict';
  const Core = window.SiapExamCore, Dom = window.SiapExamDom;
  let host, state = null, snapshot, remote = null, timer, heartbeatAt = 0, loading = true, processing = false, applying = false;
  let message = '', blocked = false, rendered = '';
  const drafts = new Map();
  function keepEdits() {
    host?.querySelectorAll('textarea,select,input').forEach(el => {
      if (el.hasAttribute('data-exam-confirm')) return;
      const key = (el.closest('[data-exam-item]')?.dataset.examItem || '') + ':' + [...el.attributes].filter(a => a.name.startsWith('data-exam-')).map(a => a.name + '=' + a.value).join('|');
      if (key !== ':') drafts.set(key, el.type === 'checkbox' ? el.checked : el.value);
    });
  }
  function restoreEdits() {
    host?.querySelectorAll('textarea,select,input').forEach(el => {
      const key = (el.closest('[data-exam-item]')?.dataset.examItem || '') + ':' + [...el.attributes].filter(a => a.name.startsWith('data-exam-')).map(a => a.name + '=' + a.value).join('|');
      if (drafts.has(key)) { if (el.type === 'checkbox') el.checked = drafts.get(key); else el.value = drafts.get(key); }
    });
  }
  const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const send = data => chrome.runtime.sendMessage(data);
  const save = async () => { const result = await send({ type: 'SIAP_EXAM_STATE_PUT', value: state }); if (!result?.ok) throw new Error('Não foi possível preservar a sessão.'); };
  const api = async (action, body = {}) => {
    const result = await send({ type: 'SIAP_EXAM_API', action, room: state?.room.id, token: state?.room.desktop, body });
    if (!result?.ok) { if ([401, 410].includes(result?.status)) blocked = true; throw new Error(result?.error || 'Serviço de correção indisponível.'); }
    return result;
  };
  function current() { return Dom.snapshot(document, location.pathname); }
  function matches(now) { return state && (now.signature === state.signature || (now.mode === 'selection' && now.scope === state.scope && (!state.queue || state.queue.phase === 'done'))); }
  function canAdopt(now) { return state && now.mode === 'entry' && (now.base === state.base || (state.awaitingEvaluation && now.scope === state.scope)); }
  function assertContext() { const now = current(); if (!matches(now)) throw new Error('A turma ou avaliação mudou. Confira o contexto antes de continuar.'); return now; }
  function notify(text) { message = text; host?.querySelectorAll('[data-exam-message]').forEach(el => { el.textContent = text; }); }
  async function action(fn) {
    if (processing || applying) return;
    processing = true;
    try { await fn(); } catch (e) { notify(e.message); }
    finally { processing = false; draw(); }
  }
  function draw() {
    if (!host || loading) return;
    keepEdits();
    try { snapshot = current(); } catch (e) { host.textContent = e.message; return; }
    const changed = state && !matches(snapshot), selecting = snapshot.mode === 'selection';
    const rows = (remote?.items || []).filter(i => i.kind === 'student' && !i.discarded);
    const official = (remote?.items || []).filter(i => i.kind === 'official' && i.result && !i.discarded).at(-1);
    host.innerHTML = `<section class="cm-card"><h3>Correção de Provas</h3><p>${escape(snapshot.label)}<br><strong>${selecting ? 'Identificar disciplinas pelo gabarito' : `${escape(snapshot.context.subject)} · ${snapshot.context.total} questões`}</strong></p>
      <p data-exam-message role="status">${escape(message)}</p>
      ${!state ? '<p>Abra a avaliação com a disciplina e a lista de alunos. O celular receberá esses dados para a correção.</p><button class="cm-btn cm-primary" data-exam="start" type="button">Conectar celular por QR Code</button>' : `
      ${changed ? `<p>A página mudou. As capturas e o preenchimento estão pausados.</p>${canAdopt(snapshot) ? '<button class="cm-btn" type="button" data-exam="adopt">Conferi: vincular esta avaliação às capturas</button>' : '<p>Encerre esta sessão antes de iniciar outra turma ou avaliação.</p>'}` : ''}
      ${changed && canAdopt(snapshot) && official ? `<p>Confira abaixo as disciplinas e suas quantidades. Ajuste o gabarito somente se a leitura estiver errada; depois vincule a avaliação.</p>${keyForm(official)}` : ''}
      <details ${!remote?.key ? 'open' : ''}><summary>QR Code de conexão</summary><div data-exam-qr></div><p>Leia uma vez no celular. Expira em ${new Date(state.room.expires).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Não compartilhe este QR Code.</p></details>
      <button class="cm-btn" type="button" data-exam="close">Encerrar e apagar capturas</button>
      ${remote?.accessMode==='block' ? '<details><summary>Concluir crédito avulso</summary><p>Use somente depois de terminar este bloco em todas as turmas, incluindo segundas chamadas. Encerrar as capturas acima não encerra seu crédito.</p><label><input type="checkbox" data-finish-block-confirm> Terminei este bloco em todas as turmas.</label><button class="cm-btn" type="button" data-exam="finishBlock">Finalizar bloco em todas as turmas</button></details>' : ''}
      ${state.queue && state.queue.phase !== 'done' ? `<button class="cm-btn" type="button" data-exam="${state.queue.paused ? 'resume' : 'pauseBatch'}">${state.queue.paused ? 'Retomar lote após conferência' : 'Pausar preenchimento'}</button>` : ''}
      ${!changed && !blocked ? `<p>${remote?.key ? 'Gabarito confirmado. Fotografe os cartões dos alunos.' : 'Faça a leitura e confira o gabarito no celular. Os resultados aparecerão aqui para o lançamento final.'}</p>
      ${official ? `<details><summary>Gabarito e ajustes pelo computador</summary>${keyForm(official)}</details>` : ''}
      ${selecting && remote?.key ? selectionForm() : ''}
      ${(remote?.items || []).filter(i => !i.discarded && ['queued', 'processing', 'error'].includes(i.status)).map(i => `<p>${i.kind === 'official' ? 'Gabarito' : 'Prova'}: ${escape(i.error || (i.status === 'processing' ? 'lendo a foto…' : 'na fila'))} ${i.status === 'error' ? `<button type="button" class="cm-btn" data-exam-retry="${i.id}">Tentar ler novamente</button><button type="button" class="cm-btn" data-exam-discard="${i.id}">Descartar</button>` : ''}</p>`).join('')}
      ${selecting ? `<p>${rows.length} prova(s) recebida(s). Abra a avaliação para associar os alunos e conferir os acertos. As fotos continuam na mesma sessão.</p>` : rows.filter(i => i.result).map(studentForm).join('')}
      ${remote?.key && !selecting ? `<hr><label>Chamada <select data-exam-call><option value="1">1ª chamada</option><option value="2">2ª chamada</option></select></label>
      <details><summary>Alunos sem prova identificada — confirmar faltas</summary><p>Marque apenas quem faltou. Sem foto não significa falta.</p>${pendingStudents(rows).map(r => `<label class="cm-exam-absence"><input type="checkbox" data-exam-absent="${escape(r.id)}"> ${escape(r.name)}</label>`).join('')}</details>
      <p data-exam-summary role="status"></p>
      <p data-exam-ready role="status"></p><p data-exam-message role="status">${escape(message)}</p>
      <button type="button" class="cm-btn cm-primary" data-exam="prepare">Enviar identificados para o SIAP</button><button type="button" class="cm-btn" data-exam="whatsapp">Compartilhar resumo no WhatsApp</button>
      <p>Ao enviar, você confirma os resultados exibidos. O salvamento automático só ocorre quando não há exceções nem alunos sem resultado ou falta confirmada.</p>` : ''}` : ''}`}</section>`;
    if(selecting && !state){const start=host.querySelector('[data-exam=start]');if(start){start.disabled=true;start.textContent='Abra a avaliação com os alunos para conectar';}}
    host.querySelectorAll('[data-exam]').forEach(button => button.onclick = () => action(() => operations[button.dataset.exam]()));
    host.querySelectorAll('[data-exam-subject]').forEach(button => button.onclick = () => action(() => chooseSubject(button.dataset.examSubject)));
    host.querySelectorAll('[data-exam-retry]').forEach(b => b.onclick = () => action(async () => { await api('retry', { id: b.dataset.examRetry }); await refresh(); }));
    host.querySelectorAll('[data-exam-discard]').forEach(b => b.onclick = () => action(async () => { await api('discard', { id: b.dataset.examDiscard }); await refresh(); }));
    host.querySelectorAll('[data-exam-image]').forEach(b => b.onclick = async () => { try { const data = await api('image', { id: b.dataset.examImage }); const image = b.parentElement.querySelector('img'); image.src = data.image; image.hidden = false; } catch(e) { notify(e.message); } });
    if (state && window.qrcode) {
      const qr = qrcode(0, 'M');
      qr.addData(`${SiapExamConfig.origin}/#session=${state.room.id}&token=${state.room.mobile}`); qr.make();
      // Local QR generation; the pairing capability is never sent to a third-party QR service.
      host.querySelector('[data-exam-qr]').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    }
    restoreEdits(); updateAbsentOptions(); updateReadiness(); rendered = JSON.stringify(remote);
    host.querySelectorAll('[data-exam-confirm],[data-exam-absent]').forEach(el => el.onchange = updateReadiness);
    host.querySelectorAll('[data-exam-student]').forEach(el => el.onchange = updateAbsentOptions);
    host.querySelectorAll('[data-exam-answers]').forEach(el => el.oninput = () => {
      const output = el.closest('[data-exam-item]').querySelector('[data-exam-score]');
      try { output.textContent = Core.score(remote.key, el.value.toUpperCase().trim().split(/[\s,;]+/)).map(r => `${r.subject}: ${r.correct}/${r.total}`).join(' · '); }
      catch(e) { output.textContent = e.message; }
      updateReadiness();
    });
  }
  function selectionForm() {
    const ranges = remote.key.ranges;
    return `<p>${ranges.length === 1 ? 'Disciplina identificada. Confira a seleção no SIAP.' : 'Este gabarito tem várias disciplinas. Escolha qual lançar primeiro; as fotos servirão para todas.'}</p>${ranges.map(r => `<button class="cm-btn" type="button" data-exam-subject="${escape(r.subject)}">${escape(r.subject)} · questões ${r.from}–${r.to}</button>`).join('')}<p>Depois selecione o bimestre e abra a avaliação correspondente no SIAP. O Assistente conferirá a disciplina e a quantidade de questões antes do preenchimento.</p>`;
  }
  async function chooseSubject(subject) {
    const now = assertContext();
    if (now.mode !== 'selection') throw new Error('Abra a seleção de disciplinas.');
    const options = now.subjects.filter(o => Core.normalize(o.subject) === Core.normalize(subject));
    if (options.length !== 1) throw new Error('O nome da disciplina não corresponde a uma opção única do SIAP. Ajuste o nome no gabarito e confirme novamente.');
    await save(); // Persist pairing before the native Web Forms change/postback.
    const select = document.getElementById('cphFuncionalidade_cphCampos_ddlDisciplina');
    message = `Disciplina selecionada: ${options[0].subject}. Escolha o bimestre e abra a avaliação.`;
    if (select.value !== options[0].value) { select.value = options[0].value; select.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  function keyForm(item) {
    const key = remote.key || item.result;
    return `<section><p><strong>${remote.key ? 'Gabarito confirmado' : 'Confira o gabarito uma vez'}</strong> · ${key.answers.length} questões</p><p>${escape(key.ranges.map(r=>`${r.subject}: ${r.from}–${r.to}`).join(' · '))}</p><details><summary>Ver foto e ajustar leitura</summary><p>${escape(item.result.title)} ${escape(item.result.warning)}</p>
      <button class="cm-btn" type="button" data-exam-image="${item.id}">Ver foto</button><img class="cm-exam-photo" alt="Gabarito oficial fotografado" hidden>
      <label>Alternativas <select data-exam-alphabet><option ${key.alphabet === 'ABCD' ? 'selected' : ''}>ABCD</option><option ${key.alphabet === 'ABCDE' ? 'selected' : ''}>ABCDE</option></select></label>
      <label>Respostas, na ordem das questões<textarea data-exam-key>${escape(key.answers.join(' '))}</textarea></label>
      <label>Uma disciplina por linha: nome; início; fim<textarea data-exam-ranges>${escape(key.ranges.map(r => `${r.subject}; ${r.from}; ${r.to}`).join('\n'))}</textarea></label>
      </details><button class="cm-btn" type="button" data-exam="key">${remote.key ? 'Atualizar gabarito' : 'Usar este gabarito'}</button></section>`;
  }
  function studentForm(item) {
    const guessed = remote.mobileWorkflow ? {id:''} : Core.matchName(item.result.name, snapshot.roster);
    const selected = item.review?.studentId || item.selectedStudentId || guessed.id;
    const response = item.review?.answers || item.result.answers;
    let result = '';
    try { result = Core.score(remote.key, response).map(r => `${r.subject}: ${r.correct}/${r.total}`).join(' · '); } catch { result = 'Revise as respostas e a quantidade de questões.'; }
    const number = (remote.items || []).filter(i=>i.kind==='student' && !i.discarded).findIndex(i=>i.id===item.id)+1;
    const uncertain = response.flatMap((a,i)=>a==='?'?[i+1]:[]);
    return `<fieldset data-exam-item="${item.id}"><legend>Prova ${number} — ${escape(selected ? snapshot.roster.find(r=>r.id===selected)?.name : 'Nome ilegível / não identificado')}</legend><p data-exam-score>${escape(result)}</p>${uncertain.length ? `<p>Conferir questões: ${uncertain.join(', ')}.</p>` : ''}${!selected ? '<p>Fica pendente para identificação manual. Os demais podem seguir.</p>' : ''}<details><summary>Foto e ajustes manuais</summary><p>${escape(item.result.title)} ${escape(item.result.warning)}</p>
      <label>Aluno<select data-exam-student><option value="">Selecione o aluno correto</option>${snapshot.roster.filter(r => !r.unavailable).map(r => `<option value="${escape(r.id)}" ${r.id === selected ? 'selected' : ''}>${escape(r.name)}</option>`).join('')}</select></label>
      <details><summary>Foto e respostas reconhecidas</summary><button class="cm-btn" type="button" data-exam-image="${item.id}">Ver foto</button><img class="cm-exam-photo" alt="Cartão do aluno" hidden><label>Respostas em ordem<textarea data-exam-answers>${escape(response.join(' '))}</textarea></label><p>- branco · * múltipla · ? revisar</p></details>
      <button class="cm-btn" type="button" data-exam-discard="${item.id}">Descartar captura duplicada ou incorreta</button></details></fieldset>`;
  }
  function pendingStudents(items) {
    return snapshot.roster.filter(r => !r.unavailable);
  }
  function updateAbsentOptions() {
    const mapped = new Set([...host.querySelectorAll('[data-exam-student]')].map(el => el.value));
    host.querySelectorAll('[data-exam-absent]').forEach(el => {
      el.disabled = mapped.has(el.dataset.examAbsent); el.closest('label').hidden = el.disabled;
      if (el.disabled) el.checked = false;
    });
    updateReadiness();
  }
  function batchState(includeApplied = false) {
    const pending = [], ready = [], seen = new Map();
    const already = new Set(state?.applied?.[snapshot.signature] || []);
    for (const el of host.querySelectorAll('[data-exam-item]')) {
      const id = el.querySelector('[data-exam-student]').value;
      if(remote.mobileWorkflow && !remote.items.find(i=>i.id===el.dataset.examItem)?.review?.reviewed) {pending.push(el.dataset.examItem);continue;}
      if (!includeApplied && already.has(id)) continue;
      try {
        if (!id) throw new Error('Nome ilegível');
        const answers = Core.answers(el.querySelector('[data-exam-answers]').value, remote.key.answers.length, remote.key.alphabet);
        Core.score(remote.key, answers);
        const item = { id: el.dataset.examItem, studentId: id, answers, reviewed: true };
        ready.push(item); seen.set(id, (seen.get(id)||0)+1);
      } catch { pending.push(el.dataset.examItem); }
    }
    const unique = ready.filter(i=>seen.get(i.studentId)===1);
    pending.push(...ready.filter(i=>seen.get(i.studentId)>1).map(i=>i.id));
    pending.push(...(remote?.items||[]).filter(i=>i.kind==='student'&&!i.discarded&&i.status!=='ready').map(i=>i.id));
    return { ready: unique, pending };
  }
  function readiness() {
    if (!remote?.key || snapshot.mode !== 'entry') return '';
    if(state.appliedKeySignature && state.appliedKeySignature!==JSON.stringify(remote.key) && Object.values(state.applied||{}).some(ids=>ids.length)) return 'O gabarito mudou após um preenchimento. Confira e ajuste os campos já lançados manualmente antes de salvar.';
    const range = remote.key.ranges.find(r => Core.normalize(r.subject) === Core.normalize(snapshot.context.subject));
    if (!range) return `O gabarito não contém ${snapshot.context.subject}. Confira as disciplinas.`;
    const total = range.to-range.from+1;
    if (total !== snapshot.context.total) return `O gabarito tem ${total} questões, mas o SIAP tem ${snapshot.context.total}. Confira a avaliação e os intervalos.`;
    if (state.queue && state.queue.phase !== 'done') return 'Lançamento em andamento. Aguarde ou retome o lote pausado.';
    const batch = batchState();
    if (!batch.ready.length && !host.querySelector('[data-exam-absent]:checked')) return batch.pending.length ? 'Há somente exceções. Confira nomes e marcações duvidosas; os campos ficam para preenchimento manual.' : 'Aguardando provas dos alunos. Até agora há apenas o gabarito ou resultados já preenchidos.';
    return '';
  }
  function updateReadiness() {
    const button=host?.querySelector('[data-exam=prepare]'), hint=host?.querySelector('[data-exam-ready]');
    if(!button||!hint)return;
    const batch=batchState(), reason=readiness();
    button.disabled=!!reason; button.textContent=`Enviar ${batch.ready.length} identificado(s) para o SIAP`;
    host.querySelector('[data-exam-summary]').textContent=`${batch.ready.length} prova(s) pronta(s) · ${batch.pending.length} pendência(s) · ${(state?.applied?.[snapshot.signature] || []).length} aluno(s) preenchido(s).`;
    hint.textContent=reason || (batch.pending.length ? 'Os identificados serão preenchidos. As exceções permanecem manuais; não haverá salvamento automático.' : 'Confira os resultados acima e envie em um clique.');
  }
  const operations = {
    async finishBlock() {
      assertContext();
      if(!host.querySelector('[data-finish-block-confirm]')?.checked) throw new Error('Confirme que terminou o bloco em todas as turmas.');
      if(applying||(state?.queue?.phase && state.queue.phase!=='done')||remote?.items?.some(item=>!item.discarded&&['queued','processing'].includes(item.status))) throw new Error('Aguarde a leitura e o lançamento terminarem.');
      await api('finish-block'); blocked=true; message='Bloco finalizado em todas as turmas.';
    },
    async start() {
      snapshot = current();
      if(snapshot.mode!=='entry'||!snapshot.roster.some(r=>!r.unavailable)) throw new Error('Abra a avaliação com a lista de alunos antes de gerar o QR Code.');
      const room = await api('create', { block:snapshot.block, context: `${snapshot.label} · ${snapshot.context.subject} · ${snapshot.context.total} questões`, mobileWorkflow: true, assessment: {subject:snapshot.context.subject,total:snapshot.context.total} });
      state = { room, scope: snapshot.scope, awaitingEvaluation: snapshot.mode === 'selection', base: snapshot.base, signature: snapshot.signature, queue: null }; blocked = false; drafts.clear();
      await save(); heartbeatAt = 0; await refresh(); message = 'Leia o QR Code no celular para iniciar.';
    },
    async close() { try { await api('close'); } catch (e) { if (!blocked) throw e; } state = null; remote = null; blocked = false; drafts.clear(); host.replaceChildren(); await save(); message = 'Sessão encerrada. As capturas expiram automaticamente no serviço.'; },
    async pauseBatch() { if (state.queue) { state.queue.paused = true; await save(); message = 'Lote pausado. Confira os campos já preenchidos antes de retomar.'; } },
    async resume() { assertContext(); await api('heartbeat'); if (state.queue) { state.queue.paused = false; state.queue.attempts = 0; await save(); await advance(); } },
    async adopt() {
      const now = current(); if (!canAdopt(now)) throw new Error('Outra turma ou avaliação. Inicie uma nova sessão.');
      if (!remote?.key?.ranges.some(r => Core.normalize(r.subject) === Core.normalize(now.context.subject) && r.to - r.from + 1 === now.context.total)) throw new Error(`Esta avaliação exige ${now.context.total} questões de ${now.context.subject}. Gabarito: ${(remote?.key?.ranges || []).map(r => `${r.subject}: ${r.to-r.from+1} questões`).join('; ') || 'ainda não confirmado'}. Confira o gabarito abaixo ou abra a avaliação correspondente.`);
      state.signature = now.signature; state.base = now.base; state.awaitingEvaluation = false; state.queue = null; await save(); await api('pause', { paused: false }); blocked = false; await refresh(); message = 'Resultados associados à disciplina aberta.';
    },
    async key() {
      const now = current(); if (!matches(now) && !canAdopt(now)) throw new Error('Outra turma ou avaliação. Inicie uma nova sessão.');
      const values = host.querySelector('[data-exam-key]').value.trim().toUpperCase().split(/[\s,;]+/);
      const ranges = host.querySelector('[data-exam-ranges]').value.trim().split('\n').map(line => { const [subject, from, to, extra] = line.split(';'); if (extra !== undefined) throw new Error('Use nome; início; fim.'); return { subject, from: Number(from), to: Number(to) }; });
      const key = Core.validateKey({ ...(remote.key?.firstQuestion!==undefined?{firstQuestion:remote.key.firstQuestion}:{}), alphabet: host.querySelector('[data-exam-alphabet]').value, answers: values, ranges });
      await api('key', { key }); await refresh(); message = 'Gabarito confirmado. O celular já pode enviar as provas.';
      if (!matches(now) && canAdopt(now)) await operations.adopt();
      if (current().mode === 'selection' && key.ranges.length === 1) await chooseSubject(key.ranges[0].subject);
    },
    async whatsapp() {
      const now=assertContext(), batch=batchState(true);
      const entries=Core.batch(remote.key,batch.ready,now.roster,now.context.subject,now.context.total);
      const summary=[`Correção de Provas — ${now.label} — ${now.context.subject}`, ...entries.map(e=>`${now.roster.find(r=>r.id===e.id)?.name}: ${e.correct}/${now.context.total}`), `${batch.pending.length} pendência(s); confira antes de compartilhar.`].join('\n');
      window.open('https://wa.me/?text='+encodeURIComponent(summary),'_blank','noopener,noreferrer');
    },
    async prepare() {
      const now = assertContext();
      if (now.mode !== 'entry') throw new Error('Abra a avaliação antes de preencher.');
      const reason = readiness(); if (reason) throw new Error(reason);
      const batch = batchState(), items = batch.ready;
      const entries = Core.batch(remote.key, items, now.roster, now.context.subject, now.context.total);
      for (const el of host.querySelectorAll('[data-exam-absent]:checked')) {
        if (entries.some(e => e.id === el.dataset.examAbsent)) throw new Error('Um aluno com prova também foi marcado como ausente.');
        entries.push({ id: el.dataset.examAbsent, present: false });
      }
      const call = Number(host.querySelector('[data-exam-call]').value);
      Dom.preflight(now, entries, call);
      await api('heartbeat');
      for (const item of items) await api('review', item);
      const covered = new Set([...(state.applied?.[now.signature] || []), ...entries.map(e=>e.id)]);
      const autoSave = !batch.pending.length && now.roster.filter(r=>!r.unavailable).every(r=>covered.has(r.id));
      state.queue = { entries, call, index: 0, phase: 'presence', attempts: 0, paused: false, signature: now.signature, autoSave, keySignature: JSON.stringify(remote.key), itemIds: (remote.items||[]).filter(i=>!i.discarded).map(i=>i.id) };
      await save(); message = 'Preenchendo o lote revisado…'; await advance();
    }
  };
  async function refresh() {
    if (!state) return;
    const previous=remote; remote = await api('status');
    for(const item of remote.items||[]) if(JSON.stringify(previous?.items?.find(i=>i.id===item.id)?.review)!==JSON.stringify(item.review)) {
      for(const k of drafts.keys()) if(k.startsWith(item.id+':')) drafts.delete(k);
      host?.querySelector(`[data-exam-item="${item.id}"]`)?.querySelectorAll('[data-exam-student],[data-exam-answers]').forEach(el=>{if(item.review)el.value=el.hasAttribute('data-exam-student')?item.review.studentId:item.review.answers.join(' ');});
    }
    const now=current();
    if(remote.mobileWorkflow && now.mode==='entry' && matches(now)) {
      const roster=now.roster.filter(r=>!r.unavailable).map(r=>({id:r.id,name:r.name}));
      if(JSON.stringify(remote.roster)!==JSON.stringify(roster)) {
        await api('roster',{roster,binding:now.base}); remote.roster=roster;
      }
    }
  }
  async function advance() {
    const q = state?.queue;
    if (applying || !q || q.paused || q.phase === 'done') return;
    applying = true;
    try {
      const now = assertContext();
      if (now.mode !== 'entry') throw new Error('Retorne à avaliação para continuar o lote.');
      if (q.signature !== now.signature || blocked) throw new Error('Lote pausado por mudança de contexto ou acesso.');
      const entry = q.entries[q.index];
      if (!entry) {
        await refresh();
        const incoming = (remote.items||[]).filter(i=>!i.discarded);
        const unchanged = JSON.stringify(remote.key)===q.keySignature && incoming.length===q.itemIds.length && incoming.every(i=>q.itemIds.includes(i.id));
        q.phase='done';
        draw();
        const button=document.getElementById('cphFuncionalidade_btnAlterar');
        if(q.autoSave && unchanged && button && !button.disabled) {
          q.saveRequested=true; await save();
          notify('Campos preenchidos. Salvamento solicitado ao SIAP; confira a confirmação na página.');
          button.click();
        } else { await save(); notify('Identificados preenchidos. Há pendências ou alunos sem resultado: complete manualmente e depois use Salvar no SIAP.'); }
        return;
      }
      const c = Dom.controls(now, entry.id, q.call);
      const wanted = entry.present ? c.present : c.absent, other = entry.present ? c.absent : c.present;
      if (q.phase === 'presence') {
        if (c.field?.value.trim()) throw new Error('Um resultado foi preenchido enquanto o lote estava em andamento. Confira antes de continuar.');
        q.phase = 'wait'; q.attempts = 0; await save();
        if (!wanted.checked) wanted.click();
        return;
      }
      if (!wanted.checked || other.checked || (entry.present && (!c.field || c.field.disabled))) {
        q.attempts++; if (q.attempts > 8) throw new Error('O SIAP não liberou os campos esperados. Lote pausado para conferência.'); await save(); return;
      }
      if (entry.present) {
        if (q.phase === 'wait') {
          if (c.field.value.trim() && Number(c.field.value) !== entry.correct) throw new Error('Há outro resultado neste campo. O Assistente não irá sobrescrever.');
          // Persist before events: Web Forms may navigate in response to a change.
          q.phase = 'verify'; await save();
          c.field.value = String(entry.correct); c.field.dispatchEvent(new Event('input', { bubbles: true })); c.field.dispatchEvent(new Event('change', { bubbles: true })); return;
        }
        if (c.field.value.trim() === '' || Number(c.field.value) !== entry.correct) throw new Error('O SIAP não manteve o valor preenchido. Confira este aluno.');
      }
      state.appliedKeySignature ||= JSON.stringify(remote.key);
      state.applied ||= {}; state.applied[now.signature] ||= []; if (!state.applied[now.signature].includes(entry.id)) state.applied[now.signature].push(entry.id);
      q.index++; q.phase = 'presence'; q.attempts = 0; await save();
      notify(`Preenchidos ${q.index} de ${q.entries.length}. Aguarde antes de salvar.`);
    } catch (e) { q.paused = true; await save(); notify(e.message + ' Os campos já preenchidos foram mantidos; confira e salve no SIAP.'); }
    finally { applying = false; }
  }
  async function tick() {
    clearTimeout(timer);
    if (!host?.isConnected) return;
    try {
      if (state && !processing && !applying) {
        const now = current();
        if (!matches(now)) {
          if (!blocked) { await api('pause', { paused: true }); blocked = true; draw(); }
        } else if (!blocked) {
          if (Date.now() - heartbeatAt > 45000 || remote?.scanRequested && !remote?.activated) { await api('heartbeat'); heartbeatAt = Date.now(); }
          if (state.queue && state.queue.phase !== 'done' && !state.queue.paused) await advance();
          else {
            await refresh();
            // Do not erase teacher edits when polling or the SIAP observer rerenders.
            if (rendered !== JSON.stringify(remote) && !host.contains(document.activeElement)) draw();
          }
        }
      }
    } catch (e) { notify(e.message); }
    timer = setTimeout(tick, state?.queue && state.queue.phase !== 'done' && !state.queue.paused ? 1000 : 3500);
  }
  window.SiapExamPanel = {
    isBusy() { return processing || applying; },
    resetAccount() {
      clearTimeout(timer); blocked=true;
      if (state?.room) api('pause',{paused:true}).catch(()=>{});
      state=null;remote=null;host=null;loading=true;drafts.clear();rendered='';
    },
    mount(container) {
      if (host?.isConnected && host.parentElement === container) return;
      host = document.createElement('div'); host.className = 'cm-exam'; container.replaceChildren(host);
      host.textContent = 'Preparando a correção…';
      if (loading) send({ type: 'SIAP_EXAM_STATE_GET' }).then(async result => {
        state = result?.value || null;
        if (state?.room.expires <= Date.now()) { state = null; save(); }
        if (state) {
          try { await refresh(); if (matches(current())) await api('pause', { paused: false }); }
          catch(e) { message = e.message; }
        }
        loading = false; draw(); if(!state && current().mode==='entry') await action(()=>operations.start()); tick();
      }); else { draw(); tick(); }
    }
  };
})();
