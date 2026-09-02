document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const uniformButton = document.createElement('button');
  uniformButton.id = 'uniformNav';
  uniformButton.type = 'button';
  uniformButton.innerHTML = '<span>▣ &nbsp; Controle de Itens</span>';
  nav.insertBefore(uniformButton, document.getElementById('profileNav') || null);

  const modal = document.createElement('div');
  modal.id = 'uniformModal';
  modal.className = 'modal-bg uniform-modal hidden';
  modal.innerHTML = `<section class="modal uniform-dialog">
    <div class="modal-head uniform-modern-head"><span class="uniform-icon uniform-icon-bag" aria-hidden="true"></span><div><h3>Controle de Itens</h3><div class="meta">Consulte a situação por turno, turma ou aluno.</div></div><button class="close" type="button" id="closeUniform" aria-label="Fechar">×</button></div>
    <div class="uniform-mode-toggle" role="tablist"><button type="button" id="uniformModeItems" class="uniform-mode-btn active" role="tab" aria-pressed="true"><span class="uniform-icon uniform-icon-cart" aria-hidden="true"></span>Itens</button><button type="button" id="uniformModeLivroRevisa" class="uniform-mode-btn" role="tab" aria-pressed="false"><span class="uniform-icon uniform-icon-book" aria-hidden="true"></span>Livro/Revisa</button></div>
    <div id="uniformItemsPanel"><div class="uniform-summary"><div class="uniform-summary-uniform"><span class="uniform-icon uniform-icon-shirt" aria-hidden="true"></span><span>Sem uniforme</span><b id="pendingUniform">0</b></div><div class="uniform-summary-shoes"><span class="uniform-icon uniform-icon-shoe" aria-hidden="true"></span><span>Sem tênis</span><b id="pendingShoes">0</b></div><div class="uniform-summary-both"><span class="uniform-icon-pair" aria-hidden="true"><span class="uniform-icon uniform-icon-shirt"></span><i>/</i><span class="uniform-icon uniform-icon-shoe"></span></span><span>Sem os dois</span><b id="pendingBoth">0</b></div><div class="uniform-summary-material"><span class="uniform-icon uniform-icon-backpack" aria-hidden="true"></span><span>Sem material</span><b id="pendingMaterial">0</b></div></div>
      <section class="uniform-shift-section" aria-label="Contagem por turno"><span class="uniform-shift-title"><span class="uniform-icon uniform-icon-chart" aria-hidden="true"></span>Contagem por turno</span><div id="uniformShiftSummary" class="uniform-shift-summary"></div></section>
      <div class="uniform-bulk-action"><button id="markAllUniformReceived" class="btn secondary" type="button"><span class="uniform-icon uniform-icon-check" aria-hidden="true"></span>Marcar todos como receberam</button></div>
      <div class="uniform-controls"><label class="uniform-control-field"><span class="uniform-icon uniform-icon-calendar" aria-hidden="true"></span><select id="uniformShift"><option value="">Todos os turnos</option><option value="Matutino">Matutino</option><option value="Vespertino">Vespertino</option><option value="Noturno">Noturno</option></select></label><label class="uniform-control-field"><span class="uniform-icon uniform-icon-users" aria-hidden="true"></span><select id="uniformClass"><option value="">Todas as turmas</option></select></label><label class="uniform-control-field"><span class="uniform-icon uniform-icon-user" aria-hidden="true"></span><select id="uniformView"><option value="all">Todos os alunos</option><option value="pending">Somente alunos pendentes</option><option value="uniform">Somente sem uniforme</option><option value="shoes">Somente sem tênis</option><option value="both">Sem os dois</option><option value="material">Somente sem material</option></select></label><label class="uniform-control-field"><span class="uniform-icon uniform-icon-search" aria-hidden="true"></span><input id="uniformSearch" placeholder="Buscar aluno"></label></div>
      <div id="uniformActiveFilter" class="uniform-active-filter hidden" role="status" aria-live="polite"></div><div class="uniform-columns"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="uniformList" class="uniform-list"></div></div>
    <div id="livroRevisaPanel" class="livro-revisa-panel hidden"><div class="livro-revisa-controls"><select id="livroRevisaClass"><option value="">Selecione a turma</option></select><input id="livroRevisaYear" type="number" min="2000" max="2100" placeholder="Ano letivo"><select id="livroRevisaBimester"><option value="">Bimestre</option><option value="1">1º bimestre</option><option value="2">2º bimestre</option><option value="3">3º bimestre</option><option value="4">4º bimestre</option></select></div><div id="livroRevisaNotice" class="livro-revisa-notice hidden"></div><div id="livroRevisaColumns" class="uniform-columns livro-revisa-columns hidden"><span>Aluno</span><span>Situação</span><span>Registrar</span></div><div id="livroRevisaList" class="livro-revisa-list"></div><div class="livro-revisa-actions"><button id="finalizeLivroRevisa" class="btn secondary" type="button" disabled>Finalizar conferência</button></div></div>
  </section>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    #uniformNav { border:0; background:#2b3c5d; color:#fff; } #uniformNav:hover { background:#38527e; } #toast { z-index:220!important; }
    .uniform-modal { z-index:110; padding:12px 20px; overscroll-behavior:none; }.uniform-dialog { width:min(1040px,100%); height:min(960px,calc(100dvh - 24px)); max-height:calc(100dvh - 24px); min-height:0; display:flex; flex-direction:column; overflow:hidden; }.uniform-dialog .modal-head { position:relative!important; top:auto!important; flex:none; }
    .uniform-mode-toggle { flex:none; display:flex; gap:8px; padding:9px 22px 0; }.uniform-mode-btn { min-height:32px; padding:6px 16px; border:1px solid #d9e2f4; border-radius:99px; background:#fff; color:var(--muted); font-weight:750; font-size:13px; cursor:pointer; }.uniform-mode-btn.active { background:#2b3c5d; border-color:#2b3c5d; color:#fff; }
    #uniformItemsPanel { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
    .livro-revisa-panel { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding:0 22px 22px; }.livro-revisa-controls { flex:none; display:grid; grid-template-columns:1.3fr .8fr 1fr; gap:10px; padding:15px 0; }.livro-revisa-controls input,.livro-revisa-controls select { min-width:0; min-height:42px; padding:8px 10px; }.livro-revisa-notice { flex:none; margin-bottom:12px; padding:10px 12px; border-radius:8px; background:#fff4e5; color:#8a5a00; font-size:13px; font-weight:650; }.livro-revisa-columns { flex:none; padding:0 0 9px; }.livro-revisa-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; }.livro-revisa-actions { flex:none; display:flex; justify-content:flex-end; padding-top:14px; }.livro-revisa-toggle { display:flex; gap:6px; }.livro-revisa-check,.livro-revisa-cross { min-width:40px; min-height:40px; border-radius:8px; border:1px solid #d9e2f4; background:#fff; font-size:16px; font-weight:800; cursor:pointer; color:var(--muted); }.livro-revisa-check.active { background:#dcfae6; border-color:#087443; color:#087443; }.livro-revisa-cross.active { background:#fee4e2; border-color:#b42318; color:#b42318; }
    .uniform-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; padding:6px 22px; border-bottom:1px solid var(--line); background:#f8faff; }.uniform-summary div { padding:4px 8px; border:1px solid #dbe4f5; border-radius:9px; background:#fff; }.uniform-summary span { display:block; color:var(--muted); font-size:10.5px; font-weight:700; }.uniform-summary b { font-size:16px; color:#b42318; }
    .uniform-shift-section { padding:5px 22px; border-bottom:1px solid var(--line); background:#fff; }.uniform-shift-title { display:block; margin-bottom:3px; color:var(--muted); font-size:10px; font-weight:850; letter-spacing:.05em; text-transform:uppercase; }.uniform-shift-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }.uniform-shift-card { border:1px solid #dbe4f5; border-radius:9px; padding:5px 6px; background:#f8faff; }.uniform-shift-card b { display:block; font-size:12px; margin-bottom:2px; }.uniform-shift-values { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }.uniform-shift-values span { color:var(--muted); font-size:10px; line-height:1.1; }.uniform-shift-values strong { display:block; margin-top:1px; color:#b42318; font-size:14px; }.uniform-shift-cell { all:unset; box-sizing:border-box; display:block; width:100%; font:inherit; color:var(--muted); text-align:left; cursor:pointer; -webkit-tap-highlight-color:transparent; border-radius:6px; }.uniform-shift-cell:hover:not(:disabled) { background:#eef3ff; }.uniform-shift-cell[aria-pressed="true"] { background:#dbe7ff; border:1px solid #8fa8e0; }.uniform-shift-cell:disabled { opacity:.55; cursor:default; }.uniform-shift-cell:focus-visible { outline:2px solid #2b3c5d; outline-offset:2px; }
    .uniform-summary,.uniform-shift-section,.uniform-bulk-action,.uniform-controls,.uniform-active-filter,.uniform-columns { flex:none; }.uniform-bulk-action { display:flex; justify-content:flex-end; padding:6px 22px 0; }.uniform-bulk-action .btn { min-height:30px; font-size:13px; }.uniform-controls { display:grid; grid-template-columns:.85fr .85fr 1.15fr .9fr; gap:8px; padding:8px 22px; }.uniform-controls input,.uniform-controls select { min-width:0; min-height:36px; padding:6px 9px; }.uniform-active-filter { margin:0 22px 6px; padding:6px 10px; border-radius:8px; background:#eef3ff; color:#2b3c5d; font-size:12.5px; font-weight:700; }.uniform-columns { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; padding:0 22px 6px; color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }.uniform-list { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; -webkit-overflow-scrolling:touch; padding:0 22px 22px; }
    .uniform-row { display:grid; grid-template-columns:minmax(210px,1fr) minmax(160px,.7fr) minmax(190px,.8fr); gap:12px; align-items:center; padding:13px 0; border-bottom:1px solid var(--line); min-width:0; }.uniform-student { display:flex; align-items:center; gap:10px; min-width:0; }.uniform-student .avatar { width:40px; height:40px; font-size:13px; flex:none; }.uniform-student b { display:block; }.uniform-student .meta { margin-top:4px; }.uniform-statuses { display:flex; flex-wrap:wrap; gap:5px; }.uniform-status { display:inline-flex; max-width:100%; padding:6px 9px; border-radius:14px; font-size:12px; font-weight:800; white-space:normal; word-break:break-word; line-height:1.3; }.uniform-status.received { background:#dcfae6; color:#087443; }.uniform-status.pending { background:#fee4e2; color:#b42318; }.uniform-action { display:grid; gap:6px; min-width:0; }.uniform-action select { min-height:37px; padding:6px 8px; font-size:13px; }.uniform-save { min-height:37px; padding:7px 10px; font-size:13px; }.uniform-card-label { margin-left:0; max-width:100%; white-space:normal; line-height:1.25; }.uniform-card-label.uniform-pending { background:#fee4e2; color:#b42318; }.uniform-empty { padding:40px 15px; text-align:center; color:var(--muted); }
    @media(max-width:800px) { .side .nav #uniformNav { flex:1 1 0!important; min-width:0; }.uniform-modal { padding:6px; align-items:center; }.uniform-dialog { width:100%; height:calc(100dvh - 12px); max-height:none; }.uniform-dialog .modal-head { padding:9px 14px; }.uniform-dialog .modal-head h3 { font-size:17px; }.uniform-dialog .modal-head .meta { font-size:12px; }.uniform-mode-toggle { padding:6px 12px 0; gap:6px; }.uniform-mode-btn { min-height:28px; padding:5px 14px; font-size:12.5px; }.uniform-summary { grid-template-columns:repeat(4,1fr); padding:5px 12px; gap:4px; }.uniform-summary div { padding:4px 5px; }.uniform-summary span { font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.uniform-summary b { font-size:15px; }
      /* Contagem por turno: os 3 cards (Matutino/Vespertino/Noturno) viram
         uma tabela compacta de 3 linhas × 5 colunas (turno + os 4 valores),
         em vez de 3 blocos empilhados cada um com o turno numa linha e os 4
         valores em outra — é isso que devolve a maior parte da altura para
         a lista de resultados. display:contents faz .uniform-shift-card e
         .uniform-shift-values "desaparecerem" da árvore de caixas mantendo
         os filhos (mesmo DOM/onclick/aria-label de sempre) participando
         direto do grid do pai — nenhuma mudança de HTML/JS foi necessária. */
      .uniform-shift-section { padding:5px 12px; }.uniform-shift-title { margin-bottom:4px; font-size:9.5px; }
      .uniform-shift-summary { display:grid; grid-template-columns:50px repeat(4,1fr); gap:3px 4px; }
      .uniform-shift-card { display:contents; }
      .uniform-shift-card b { display:flex; align-items:center; margin:0; font-size:9.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .uniform-shift-values { display:contents; }
      .uniform-shift-cell { min-width:0; display:flex!important; flex-direction:row; align-items:center; justify-content:center; gap:3px; padding:6px 2px; min-height:34px; }
      .uniform-shift-values span { font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .uniform-shift-values strong { font-size:13px; margin:0; }
      .uniform-bulk-action { padding:5px 12px 0; }.uniform-bulk-action .btn { width:100%; min-height:32px; }.uniform-controls { grid-template-columns:1fr 1fr; padding:7px 12px; gap:6px; }.uniform-controls input,.uniform-controls select { min-height:36px; padding:6px 8px; font-size:13px; }.uniform-active-filter { margin:0 12px 6px; font-size:11.5px; padding:6px 10px; }.uniform-columns { display:none; }.uniform-list { min-height:0; padding:0 12px 12px; }
      /* Linha de resultado: situação ao lado do aluno (não embaixo), e os
         dois seletores de registro lado a lado (não empilhados) — reduz a
         altura de cada linha bastante sem remover nenhuma informação nem
         controle; mesmo HTML/onclick de sempre. */
      .uniform-row { display:grid; grid-template-columns:1fr auto; align-items:center; gap:3px 8px; padding:7px 0; }
      .uniform-row > div:nth-child(2) { justify-self:end; align-self:center; }
      .uniform-row > .uniform-action, .uniform-row > .meta:last-child { grid-column:1 / -1; }
      .uniform-action { grid-template-columns:1fr 1fr; }
      .uniform-action select, .material-select { min-height:34px; }
      .uniform-student { gap:8px; }
      .uniform-student .avatar { width:32px; height:32px; font-size:11px; }
      .uniform-student b { display:inline; font-size:13px; }
      .uniform-student .meta { display:inline; margin:0 0 0 5px; font-size:11.5px; }
      .uniform-card-label { font-size:11px; }.livro-revisa-panel { padding:0 12px 12px; }.livro-revisa-controls { grid-template-columns:1fr; gap:6px; padding:9px 0; }.livro-revisa-controls input,.livro-revisa-controls select { min-height:38px; padding:7px 8px; font-size:13px; }.livro-revisa-columns { display:none; } }

    /* Identidade moderna do Controle de Itens — os ícones são vetoriais e
       acompanham a cor do componente sem depender de emojis ou imagens. */
    .uniform-icon { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='black'/%3E%3C/svg%3E"); width:21px; height:21px; display:inline-block; flex:none; background:currentColor; -webkit-mask:var(--uniform-icon) center/contain no-repeat; mask:var(--uniform-icon) center/contain no-repeat; }
    .uniform-icon-bag { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='7' width='18' height='14' rx='2'/%3E%3Cpath d='M8 7V5a4 4 0 0 1 8 0v2M9 12h6'/%3E%3C/svg%3E"); }
    .uniform-icon-cart { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='9' cy='20' r='1'/%3E%3Ccircle cx='19' cy='20' r='1'/%3E%3Cpath d='M3 4h2l2.5 11h11l2-7H7'/%3E%3C/svg%3E"); }
    .uniform-icon-book { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 19.5A2.5 2.5 0 0 1 6.5 17H11V5H6.5A2.5 2.5 0 0 0 4 7.5zM20 19.5a2.5 2.5 0 0 0-2.5-2.5H13V5h4.5A2.5 2.5 0 0 1 20 7.5z'/%3E%3C/svg%3E"); }
    .uniform-icon-shirt { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='m8 4 4 2 4-2 5 3-3 5-2-1v9H8v-9l-2 1-3-5z'/%3E%3C/svg%3E"); }
    .uniform-icon-shoe { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 14c4 0 5-3 7-7 1 3 3 5 8 6 2 .4 2 4 0 5H6c-3 0-4-3-2-4zM8 13l2 2m1-4 2 2'/%3E%3C/svg%3E"); }
    .uniform-icon-users { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='9' cy='8' r='3'/%3E%3Ccircle cx='17' cy='10' r='2.5'/%3E%3Cpath d='M3 20c0-4 2-6 6-6s6 2 6 6M15 15c4 0 6 1.5 6 5'/%3E%3C/svg%3E"); }
    .uniform-icon-backpack { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 7V5a4 4 0 0 1 8 0v2M6 21h12a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2zM8 12h8M9 16h6'/%3E%3C/svg%3E"); }
    .uniform-icon-chart { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round'%3E%3Cpath d='M5 20V10M12 20V4M19 20v-7'/%3E%3C/svg%3E"); }
    .uniform-icon-check { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='m8 12 3 3 5-6'/%3E%3C/svg%3E"); }
    .uniform-icon-calendar { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4m8-4v4M3 10h18'/%3E%3C/svg%3E"); }
    .uniform-icon-user { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 21c0-5 3-7 8-7s8 2 8 7'/%3E%3C/svg%3E"); }
    .uniform-icon-search { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-4-4'/%3E%3C/svg%3E"); }
    .uniform-icon-sun { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='4'/%3E%3Cpath d='M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'/%3E%3C/svg%3E"); }
    .uniform-icon-cloud-sun { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M8 7a4 4 0 0 1 7.5 2M16 3v2m4 2-1.5 1.5M9 19h9a3 3 0 0 0 0-6 5 5 0 0 0-9.5-1.5A4 4 0 0 0 9 19z'/%3E%3C/svg%3E"); }
    .uniform-icon-moon { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5z'/%3E%3C/svg%3E"); }
    .uniform-icon-clipboard { --uniform-icon:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='4' width='14' height='17' rx='2'/%3E%3Cpath d='M9 4a3 3 0 0 1 6 0v2H9zM9 12l2 2 4-4m-6 8h6'/%3E%3C/svg%3E"); }

    .uniform-dialog { border-radius:24px; background:#fff; box-shadow:0 28px 70px rgba(16,24,40,.28); }
    .uniform-dialog #uniformItemsPanel { overflow-y:auto; scrollbar-width:thin; scrollbar-color:#c8d3e7 transparent; }
    .uniform-dialog .uniform-modern-head { min-height:96px; padding:20px 28px; gap:17px; border:0; color:#fff; background:linear-gradient(120deg,#174f9b 0%,#284eb6 55%,#4937c9 100%)!important; }
    .uniform-modern-head > .uniform-icon { width:50px; height:50px; padding:13px; border-radius:16px; color:#fff; background-color:#fff; filter:drop-shadow(0 7px 13px rgba(27,38,113,.3)); }
    .uniform-modern-head > div { flex:1; }.uniform-modern-head h3 { color:#fff; font-size:24px; letter-spacing:-.5px; }.uniform-modern-head .meta { color:rgba(255,255,255,.78); font-size:14px; }
    .uniform-modern-head #closeUniform { width:42px; height:42px; display:grid; place-items:center; border-radius:13px; color:#fff; background:rgba(255,255,255,.12); font-size:28px; }
    .uniform-modern-head #closeUniform:hover { background:rgba(255,255,255,.22); }
    .uniform-mode-toggle { width:max-content; margin:18px 28px 10px; padding:4px; gap:0; border-radius:16px; background:#f2f4f8; }
    .uniform-mode-btn { min-width:180px; min-height:46px; display:flex; align-items:center; justify-content:center; gap:10px; padding:9px 22px; border:0; border-radius:13px; background:transparent; font-size:14px; }
    .uniform-mode-btn.active { color:#fff; border:0; background:linear-gradient(110deg,#2d6bed,#7438e8); box-shadow:0 8px 18px rgba(80,71,220,.22); }
    .uniform-summary { gap:14px; padding:12px 28px 18px; border:0; background:#fff; }
    .uniform-summary > div { min-height:112px; display:grid; grid-template-columns:46px 1fr; grid-template-rows:auto auto; align-content:center; column-gap:12px; padding:16px; border-radius:16px; box-shadow:0 5px 16px rgba(37,54,90,.06); }
    .uniform-summary > div > .uniform-icon { grid-row:1 / 3; align-self:center; width:42px; height:42px; padding:10px; border-radius:13px; }
    .uniform-summary span:not(.uniform-icon) { align-self:end; font-size:13px; }.uniform-summary b { align-self:start; font-size:25px; }
    .uniform-summary-uniform { border-color:#cfe5f9!important; background:#f5fbff!important; }.uniform-summary-uniform .uniform-icon,.uniform-summary-uniform b { color:#2584e8; }
    .uniform-summary-shoes { border-color:#ccefdc!important; background:#f5fdf8!important; }.uniform-summary-shoes .uniform-icon,.uniform-summary-shoes b { color:#12a66a; }
    .uniform-summary-both { border-color:#f5dfc7!important; background:#fffaf3!important; }.uniform-summary-both .uniform-icon,.uniform-summary-both b { color:#e57e18; }
    .uniform-icon-pair { grid-row:1 / 3; align-self:center; display:flex!important; align-items:center; gap:2px; color:#e57e18!important; }
    .uniform-icon-pair .uniform-icon { width:19px; height:19px; }.uniform-icon-pair i { color:#d3914c; font-size:14px; font-style:normal; font-weight:850; }
    .uniform-summary-material { border-color:#e5d7f8!important; background:#fbf8ff!important; }.uniform-summary-material .uniform-icon,.uniform-summary-material b { color:#8249d8; }
    .uniform-shift-section { margin:0 28px; padding:18px; border:1px solid #e6eaf2; border-radius:18px; background:#fff; }
    .uniform-shift-title { display:flex; align-items:center; gap:9px; margin-bottom:13px; color:#24324a; font-size:13px; }
    .uniform-shift-card { padding:12px; border-color:#e7ebf3; border-radius:14px; background:#fbfcfe; }.uniform-shift-card > b { display:flex; align-items:center; gap:8px; margin-bottom:9px; font-size:13px; }.uniform-shift-card > b .uniform-icon { width:25px; height:25px; padding:5px; border-radius:9px; color:#3b78dc; }
    .uniform-shift-values strong { color:#286fd2; }.uniform-shift-cell { padding:5px; }.uniform-shift-cell:hover:not(:disabled) { background:#eef5ff; }
    .uniform-bulk-action { padding:16px 28px 4px; }.uniform-bulk-action .btn { width:100%; min-height:48px; gap:10px; border:0; border-radius:13px; color:#fff; background:linear-gradient(110deg,#2f6eea,#713de1); box-shadow:0 8px 20px rgba(69,77,209,.18); }
    .uniform-controls { gap:12px; padding:14px 28px; }.uniform-control-field { position:relative; margin:0; font-weight:400; }.uniform-control-field > .uniform-icon { position:absolute; left:13px; top:50%; z-index:1; width:19px; height:19px; color:#536178; transform:translateY(-50%); pointer-events:none; }.uniform-controls .uniform-control-field input,.uniform-controls .uniform-control-field select { width:100%; min-height:46px; padding:8px 12px 8px 42px; border-color:#dfe4ed; border-radius:12px; background:#fff; }
    .uniform-empty-modern { min-height:210px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; margin:0 28px 20px; border:1px solid #edf0f5; border-radius:16px; background:#fff; }.uniform-empty-modern .uniform-empty-illustration { width:82px; height:82px; display:grid; place-items:center; margin-bottom:7px; border-radius:50%; color:#3687e8; background:#eef7ff; }.uniform-empty-modern .uniform-empty-illustration .uniform-icon { width:46px; height:46px; }.uniform-empty-modern b { color:#202c40; font-size:16px; }.uniform-empty-modern > span:last-child { font-size:14px; }

    @media(max-width:800px) {
      #uniformModal.uniform-modal { inset:0!important; padding:0!important; align-items:stretch!important; }.uniform-dialog { width:100vw; height:100dvh; max-height:100dvh; border-radius:0; }
      .uniform-dialog .uniform-modern-head { min-height:82px; padding:12px 16px; }.uniform-modern-head > .uniform-icon { width:38px; height:38px; }.uniform-modern-head h3 { font-size:19px; }.uniform-modern-head .meta { font-size:11.5px; }.uniform-modern-head #closeUniform { width:36px; height:36px; }
      .uniform-mode-toggle { width:calc(100% - 24px); margin:10px 12px 7px; }.uniform-mode-btn { min-width:0; flex:1; min-height:36px; padding:6px 10px; font-size:12.5px; }.uniform-mode-btn .uniform-icon { width:17px; height:17px; }
      .uniform-summary { grid-template-columns:repeat(4,1fr); gap:5px; padding:5px 12px 8px; }.uniform-summary > div { position:relative; min-height:56px; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; gap:2px; padding:6px 5px 18px; text-align:center; }.uniform-summary > div > .uniform-icon { width:21px; height:21px; margin-inline:auto; }.uniform-summary span:not(.uniform-icon):not(.uniform-icon-pair) { width:100%; max-width:100%; font-size:8px; line-height:1.05; text-align:center; white-space:normal; overflow:visible; }.uniform-summary b { position:absolute; left:7px; bottom:5px; font-size:15px; line-height:1; }.uniform-summary .uniform-icon-pair { min-height:21px; align-self:center; justify-content:center; margin-inline:auto; }.uniform-summary .uniform-icon-pair .uniform-icon { width:14px; height:14px; }.uniform-summary .uniform-icon-pair i { font-size:10px; }
      .uniform-shift-section { margin:0 12px; padding:8px; }.uniform-shift-title { margin-bottom:5px; font-size:10px; }.uniform-shift-summary { display:grid; grid-template-columns:1fr; gap:5px; }.uniform-shift-card { display:grid; grid-template-columns:92px minmax(0,1fr); align-items:center; gap:5px; padding:5px 7px; }.uniform-shift-card > b { display:flex; margin:0; font-size:11px; }.uniform-shift-card > b .uniform-icon { width:21px; height:21px; }.uniform-shift-values { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:3px; }.uniform-shift-cell { display:flex!important; flex-direction:column; gap:0; min-height:35px; padding:3px 1px!important; }.uniform-shift-values span { max-width:100%; font-size:7.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }.uniform-shift-values strong { font-size:13px; }
      .uniform-bulk-action { padding:8px 12px 2px; }.uniform-bulk-action .btn { min-height:38px; font-size:12px; }
      .uniform-controls { grid-template-columns:1fr 1fr; gap:6px; padding:8px 12px; }.uniform-controls .uniform-control-field input,.uniform-controls .uniform-control-field select { min-height:39px; padding-left:37px; font-size:11.5px; }.uniform-control-field > .uniform-icon { left:11px; width:17px; height:17px; }
      .uniform-active-filter { margin:0 12px 5px; padding:5px 9px; font-size:10.5px; }.uniform-empty-modern { min-height:145px; margin:0 12px 12px; }.uniform-list { min-height:52dvh; padding:0 12px max(34px,env(safe-area-inset-bottom)); }
      #uniformItemsPanel.uniform-results-active .uniform-list { height:58dvh; min-height:58dvh; max-height:58dvh; overflow-y:auto; overscroll-behavior:contain; }
      #uniformItemsPanel.uniform-results-active .uniform-row { padding-top:8px; padding-bottom:8px; }
      #uniformItemsPanel.uniform-results-active .uniform-action select { min-height:32px; font-size:11.5px; }
    }
    @media(min-width:801px) {
      .uniform-dialog .uniform-modern-head { min-height:62px; padding:8px 22px; }
      .uniform-modern-head > .uniform-icon { width:34px; height:34px; }
      .uniform-modern-head h3 { font-size:19px; }.uniform-modern-head .meta { font-size:11.5px; }
      .uniform-modern-head #closeUniform { width:34px; height:34px; border-radius:10px; font-size:23px; }
      .uniform-mode-toggle { margin:5px 22px 3px; padding:2px; }.uniform-mode-btn { min-height:29px; min-width:150px; padding:4px 15px; font-size:12.5px; }.uniform-mode-btn .uniform-icon { width:17px; height:17px; }
      .uniform-summary { gap:8px; padding:5px 22px 6px; }.uniform-summary > div { min-height:50px; grid-template-columns:25px 1fr; column-gap:7px; padding:5px 10px; border-radius:12px; }.uniform-summary > div > .uniform-icon { width:24px; height:24px; }.uniform-summary span:not(.uniform-icon) { font-size:10px; }.uniform-summary b { font-size:16px; line-height:1; }
      .uniform-shift-section { margin:0 22px; padding:5px 9px; border-radius:14px; }.uniform-shift-title { margin-bottom:3px; font-size:10px; }.uniform-shift-title .uniform-icon { width:15px; height:15px; }.uniform-shift-card { padding:4px 6px; border-radius:10px; }.uniform-shift-card > b { margin-bottom:1px; font-size:10.5px; }.uniform-shift-card > b .uniform-icon { width:17px; height:17px; }.uniform-shift-cell { padding:2px 3px; }.uniform-shift-values span { font-size:8px; }.uniform-shift-values strong { font-size:12px; }
      .uniform-bulk-action { padding:5px 22px 1px; }.uniform-bulk-action .btn { min-height:31px; font-size:12px; }
      .uniform-controls { padding:6px 22px; }.uniform-controls .uniform-control-field input,.uniform-controls .uniform-control-field select { min-height:36px; font-size:12.5px; }
      .uniform-columns { padding-bottom:3px; }.uniform-empty-modern { min-height:130px; }
    }

    /* Contadores com zero são apenas informativos; os que possuem alunos
       se apresentam como controles interativos e o filtro ativo fica claro. */
    .uniform-shift-cell:not(:disabled) { padding:4px 5px; border:1px solid #cbdcf7; background:#f3f7ff; box-shadow:0 2px 7px rgba(45,92,169,.08); transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease; }
    .uniform-shift-cell:not(:disabled) strong { color:#1f67cf; font-weight:850; }
    .uniform-shift-cell:not(:disabled):hover { transform:translateY(-1px); border-color:#7ba5eb; background:#e8f1ff; box-shadow:0 5px 12px rgba(45,92,169,.15); }
    .uniform-shift-cell:disabled { opacity:.36; filter:grayscale(.75); cursor:default; box-shadow:none; }
    .uniform-shift-cell[aria-pressed="true"] { border-color:#496ee8; color:#fff; background:linear-gradient(120deg,#3677e9,#6548df); box-shadow:0 5px 13px rgba(74,77,210,.22); }
    .uniform-shift-cell[aria-pressed="true"] span,.uniform-shift-cell[aria-pressed="true"] strong { color:#fff; }
    .uniform-active-filter { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .uniform-active-filter > span { min-width:0; }
    .uniform-clear-filter { flex:none; padding:5px 8px; border-radius:8px; color:#285fc4; background:#fff; border:1px solid #c8d8f4; font-size:11px; font-weight:800; }
    .uniform-clear-filter:hover { background:#f4f8ff; }
  `;
  document.head.appendChild(style);

  const get = id => document.getElementById(id);
  const isAdmin = () => permission?.role === 'admin';
  const isCoordinator = () => !!permission?.is_coordinator;
  // Fonte de autorização de Uniforme: school_members + school_member_permissions,
  // a mesma fonte usada pela RLS/RPC real — não mais user_permissions (que não
  // tem nenhum efeito sobre essa RLS/RPC). Mantidos atualizados por carga
  // inicial + eventos do app (carometro:data-loaded, carometro:permission-refresh)
  // + Realtime nas duas tabelas — sem polling.
  let uniformMembership = null;
  let uniformCommercialPermission = { can_view_uniform:false, can_edit_uniform:false, can_mark_all_uniform_received:false, can_edit_all:false };
  // Um par de canais Realtime por member_id atualmente carregado — nunca mais
  // de um par vivo ao mesmo tempo (ver ensureUniformChannels/teardown abaixo).
  let uniformPermissionChannel = null;
  let uniformMembershipChannel = null;
  let uniformChannelMemberId = null;
  const emptyUniformPermission = () => ({ can_view_uniform:false, can_edit_uniform:false, can_mark_all_uniform_received:false, can_edit_all:false });
  async function teardownUniformChannels() {
    if (uniformPermissionChannel) { await db.removeChannel(uniformPermissionChannel); uniformPermissionChannel = null; }
    if (uniformMembershipChannel) { await db.removeChannel(uniformMembershipChannel); uniformMembershipChannel = null; }
    uniformChannelMemberId = null;
  }
  // Garante exatamente um par de canais vivo, sempre referente ao member_id
  // atual — se o vínculo mudar (ex.: troca de conta), o par anterior é
  // removido antes de assinar o novo, evitando canais duplicados/vazados.
  async function ensureUniformChannels(memberId) {
    if (uniformChannelMemberId === memberId && uniformPermissionChannel && uniformMembershipChannel) return;
    await teardownUniformChannels();
    if (!db.channel) return;
    uniformChannelMemberId = memberId;
    const onRemoteChange = () => { refreshUniformMembership().then(() => { syncUniformNavigation(); if (!modal.classList.contains('hidden')) render(); }); };
    // Flags de uniforme (can_view/edit_uniform, can_mark_all_uniform_received, can_edit_all).
    uniformPermissionChannel = db.channel(`uniform-permission-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_member_permissions', filter:`member_id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
    // Papel/status do próprio vínculo (ex.: promoção/remoção de coordenador).
    // Filtro restrito ao id do próprio membro — nunca amplia o escopo de dados.
    uniformMembershipChannel = db.channel(`uniform-membership-${memberId}`).on(
      'postgres_changes',
      { event:'UPDATE', schema:'public', table:'school_members', filter:`id=eq.${memberId}` },
      onRemoteChange
    ).subscribe();
  }
  async function refreshUniformMembership() {
    const { data: { user: signedInUser } } = await db.auth.getUser();
    if (!signedInUser) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    // Vínculo da escola ATIVA da sessão (school-context.js) — nunca mais
    // "a primeira membership ativa" retornada pelo banco. Uma conta com
    // vínculo em mais de uma escola precisa das permissões da escola que
    // está de fato selecionada, não de uma escola arbitrária.
    const activeSchoolId = window.getActiveSchoolId?.() || null;
    if (!activeSchoolId) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    const { data: membership } = await db.from('school_members').select('id,school_id,role').eq('user_id', signedInUser.id).eq('school_id', activeSchoolId).eq('status', 'active').maybeSingle();
    if (!membership) { uniformMembership = null; uniformCommercialPermission = emptyUniformPermission(); await teardownUniformChannels(); return; }
    uniformMembership = membership;
    const { data: perms } = await db.from('school_member_permissions').select('can_view_uniform,can_edit_uniform,can_mark_all_uniform_received,can_edit_all').eq('member_id', membership.id).maybeSingle();
    uniformCommercialPermission = perms || emptyUniformPermission();
    await ensureUniformChannels(membership.id);
  }
  const canAccessUniform = () => isAdmin() || (isCoordinator() && !!(uniformCommercialPermission.can_edit_all || uniformCommercialPermission.can_view_uniform || uniformCommercialPermission.can_edit_uniform || uniformCommercialPermission.can_mark_all_uniform_received));
  window.canAccessUniformNav = canAccessUniform;
  const canRegisterUniform = student => {
    if (isAdmin()) return true;
    return isCoordinator() && !!(uniformCommercialPermission.can_edit_all || uniformCommercialPermission.can_edit_uniform);
  };
  const bulkUniformAccess = () => {
    const classId = get('uniformClass').value || null;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = classId ? selectedClassName(classes.find(item => item.id === classId)?.name) : '';
    const ids = classId
      ? students.filter(item => item.classId === classId || selectedClassName(item.className) === selectedTargetName).map(item => item.id)
      : null;
    if (isAdmin()) return { allowed:true, classId, ids };
    return { allowed:isCoordinator() && !!uniformCommercialPermission.can_mark_all_uniform_received, classId, ids };
  };
  const escape = value => { const el = document.createElement('span'); el.textContent = value || ''; return el.innerHTML; };
  // Avatar da lista — mesmo padrão de carregamento preguiçoso já usado na
  // tela principal (student-edit-improvements.js): nunca assina todas as
  // fotos de uma vez (isso seria N+1 e tornaria a abertura mais lenta).
  // Reaproveita student.photoUrl se já tiver sido carregado em qualquer
  // lugar do app (a mesma lista `students` é compartilhada); só assina sob
  // demanda, um por vez, quando a linha realmente aparece na tela.
  const avatarHtml = item => `<div class="avatar" data-avatar-id="${item.id}">${item.photoUrl ? `<img src="${item.photoUrl}" alt="">` : ini(item.name)}</div>`;
  let uniformPhotoObserver = null;
  async function loadUniformRowPhoto(studentId) {
    const student = students.find(item => item.id === studentId);
    if (!student?.photoPath || student.photoUrl || student.loadingUniformPhoto) return;
    student.loadingUniformPhoto = true;
    const { data } = await db.storage.from('student-photos').createSignedUrl(student.photoPath, 3600);
    student.loadingUniformPhoto = false;
    if (!data?.signedUrl) return;
    student.photoUrl = data.signedUrl;
    // Atualiza só o avatar já em tela — nunca re-renderiza a lista inteira
    // por causa de uma foto (evitaria piscar as outras linhas já prontas).
    modal.querySelectorAll(`[data-avatar-id="${studentId}"]`).forEach(avatar => {
      avatar.innerHTML = `<img src="${student.photoUrl}" alt="">`;
    });
  }
  function observeUniformPhotos(listElement) {
    if (uniformPhotoObserver) uniformPhotoObserver.disconnect();
    const rows = listElement.querySelectorAll('[data-avatar-id]');
    if (!('IntersectionObserver' in window)) { rows.forEach(el => loadUniformRowPhoto(el.dataset.avatarId)); return; }
    uniformPhotoObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      uniformPhotoObserver.unobserve(entry.target);
      loadUniformRowPhoto(entry.target.dataset.avatarId);
    }), { root:listElement, rootMargin:'160px 0px' });
    rows.forEach(el => uniformPhotoObserver.observe(el));
  }
  const labels = { uniform:'Não recebeu uniforme', shoes:'Não recebeu tênis', both:'Não recebeu uniforme e tênis', material:'Não recebeu material' };
  const shifts = ['Matutino', 'Vespertino', 'Noturno'];
  const shiftForClass = classId => classes.find(item => item.id === classId)?.shift || 'Matutino';
  const shiftForStudent = student => {
    const className = String(student?.className || '').trim().toLocaleLowerCase('pt-BR');
    const schoolClass = classes.find(item => item.id === student?.classId || (className && String(item.name || '').trim().toLocaleLowerCase('pt-BR') === className));
    return schoolClass?.shift || 'Matutino';
  };
  // Funções puras (sem depender de canonicalUniformState/students): mesma
  // regra exata já usada pela tela, extraída para poder ser reaproveitada
  // por outra tela (Relatórios) sem duplicar lógica que possa divergir.
  function deriveUniformPendingState(source) {
    const explicit = String(source?.uniform_pending || '').trim().toLocaleLowerCase('pt-BR');
    if (['uniform', 'shoes', 'both'].includes(explicit)) return explicit;

    // Quando a coluna existe, uma pendência só vale se estiver registrada nela.
    // As versões iniciais criavam os dois booleanos como false para alunos já
    // existentes, o que não representa uma escolha feita por um usuário.
    if (Object.prototype.hasOwnProperty.call(source || {}, 'uniform_pending')) return '';

    // Compatibilidade apenas com bancos muito antigos, sem a coluna de status.
    const needsUniform = source?.uniform_received === false || source?.uniform_received === 'false';
    const needsShoes = source?.shoes_received === false || source?.shoes_received === 'false';
    if (needsUniform && needsShoes) return 'both';
    if (needsUniform) return 'uniform';
    if (needsShoes) return 'shoes';
    return '';
  }
  window.deriveUniformPendingState = deriveUniformPendingState;

  function isUniformMaterialPending(source) {
    return source?.material_received === false || source?.material_received === 'false';
  }
  window.isUniformMaterialPending = isUniformMaterialPending;

  const pending = student => {
    // Toda a tela consulta primeiro o último estado confirmado do aluno.
    // Isso protege a contagem contra uma carga antiga que termine depois de
    // o usuário alterar o seletor.
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    return deriveUniformPendingState(source);
  };
  const materialPending = student => {
    const stored = student?.id ? canonicalUniformState.get(student.id) : null;
    const source = stored ? { ...student, ...stored } : student;
    return isUniformMaterialPending(source);
  };
  const statusesFor = student => {
    const status = pending(student);
    return [...(status ? [status] : []), ...(materialPending(student) ? ['material'] : [])];
  };
  const studentId = card => card.dataset.studentId || card.getAttribute('onclick')?.match(/showStudentDetails\('([^']+)'\)/)?.[1];
  let classStudents = null;
  let classStudentsRequest = 0;
  let uniformRecords = [];
  let canonicalUniformState = new Map();
  let locallyUpdatedUniformIds = new Set();
  let uniformStateRequest = 0;
  let uniformStateErrorShown = false;

  // Os três totais não dependem da turma, dos filtros nem da lista visível.
  // Mantê-los em uma função própria evita que uma falha ao montar a lista
  // deixe os números em zero, apesar de os dados já terem sido carregados.
  function updateUniformSummary(records = uniformRecords) {
    // A lista principal sempre representa todos os alunos que o usuário pode
    // visualizar. A resposta exclusiva de Uniforme pode chegar incompleta ou
    // antes de uma alteração recente; use-a apenas antes da carga principal.
    const source = students.length ? students : records;
    const totals = { uniform:0, shoes:0, both:0, material:0 };
    source.forEach(student => {
      const status = pending(student);
      if (status) totals[status] += 1;
      if (materialPending(student)) totals.material += 1;
    });
    get('pendingUniform').textContent = totals.uniform;
    get('pendingShoes').textContent = totals.shoes;
    get('pendingBoth').textContent = totals.both;
    get('pendingMaterial').textContent = totals.material;
    const activeShift = get('uniformShift').value, activeView = get('uniformView').value;
    const shiftCategories = [
      { key:'uniform', label:'Uniforme' },
      { key:'shoes', label:'Tênis' },
      { key:'both', label:'Os dois' },
      { key:'material', label:'Material' }
    ];
    get('uniformShiftSummary').innerHTML = shifts.map(shift => {
      const shiftTotals = { uniform:0, shoes:0, both:0, material:0 };
      source.forEach(student => {
        if (shiftForStudent(student) !== shift) return;
        const status = pending(student);
        if (status) shiftTotals[status] += 1;
        if (materialPending(student)) shiftTotals.material += 1;
      });
      const cellsHtml = shiftCategories.map(category => {
        const count = shiftTotals[category.key];
        const isActive = activeShift === shift && activeView === category.key;
        const disabled = count === 0 && !isActive;
        const ariaLabel = `${labels[category.key]} — turno ${shift} (${count} aluno${count === 1 ? '' : 's'})`;
        return `<button type="button" class="uniform-shift-cell" data-shift="${escape(shift)}" data-view="${category.key}" aria-pressed="${isActive}" aria-label="${escape(ariaLabel)}" ${disabled ? 'disabled' : ''}><span>${category.label}</span><strong>${count}</strong></button>`;
      }).join('');
      const shiftIcon = shift === 'Matutino' ? 'sun' : shift === 'Vespertino' ? 'cloud-sun' : 'moon';
      return `<article class="uniform-shift-card"><b><span class="uniform-icon uniform-icon-${shiftIcon}" aria-hidden="true"></span>${shift}</b><div class="uniform-shift-values">${cellsHtml}</div></article>`;
    }).join('');
  }

  function syncUniformState(records, { preserveLocal = false } = {}) {
    uniformRecords = records || [];
    const stateByStudent = new Map(uniformRecords.map(item => [item.id, item]));
    stateByStudent.forEach((state, id) => {
      if (preserveLocal && locallyUpdatedUniformIds.has(id)) return;
      canonicalUniformState.set(id, { id, ...state });
      if (!preserveLocal) locallyUpdatedUniformIds.delete(id);
    });
    // Exponha a fonte canônica por aluno para a lista e o card principal.
    // Dessa forma uma etiqueta nunca usa uma cópia antiga do objeto do aluno.
    window.uniformStateByStudent = new Map(canonicalUniformState);
    students.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    updateUniformSummary();
    classStudents?.forEach(student => {
      const state = canonicalUniformState.get(student.id) || stateByStudent.get(student.id);
      if (!state) return;
      student.uniform_pending = state.uniform_pending || '';
      student.uniform_received = state.uniform_received;
      student.shoes_received = state.shoes_received;
      student.material_received = state.material_received;
    });
    // Recrie a lista e o card com o estado de Uniforme que acabou de chegar.
    // Isso evita que uma renderização anterior (sem esses campos) deixe de
    // mostrar as etiquetas, mesmo quando os contadores já estão corretos.
    // A lista principal já usa estes dados em memória. Não a redesenhe a
    // cada resposta de Uniforme: isso evitou a piscada da tela inteira.
  }
  async function fetchEveryUniformState() {
    const pageSize = 1000;
    const records = [];
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) return { data:records, error:null };
    for (let from = 0; ; from += pageSize) {
      let query = db.from('students')
        .select('id,uniform_pending,uniform_received,shoes_received,material_received')
        .order('created_at', { ascending:false })
        .order('id', { ascending:false });
      query = query.eq('school_id', schoolId);
      const result = await query.range(from, from + pageSize - 1);
      if (result.error) return result;
      records.push(...(result.data || []));
      if ((result.data || []).length < pageSize) return { data:records, error:null };
    }
  }

  async function refreshUniformState({ renderWhenOpen = true } = {}) {
    const requestId = ++uniformStateRequest;
    const { data, error } = await fetchEveryUniformState();
    if (requestId !== uniformStateRequest) return false;
    if (error) {
      // Sem a coluna no banco, não há como calcular nem mostrar a situação.
      // Avise de forma explícita, em vez de deixar contadores silenciosamente em zero.
      if (!uniformStateErrorShown) {
        uniformStateErrorShown = true;
        toast(error.message.includes('material_received')
          ? 'Execute o novo script supabase-uniform-material.sql no Supabase para ativar o controle de material.'
          : error.message.includes('uniform_pending')
          ? 'O controle de Uniforme ainda não foi instalado no banco. Execute o arquivo supabase-uniform-management.sql.'
          : `Não foi possível atualizar o Uniforme: ${error.message}`);
      }
      updateUniformSummary(students);
      return false;
    }
    uniformStateErrorShown = false;
    syncUniformState(data || []);
    if (renderWhenOpen && !modal.classList.contains('hidden')) render();
    return true;
  }

  function uniformStatusFor(studentId) {
    // O retorno específico de Uniforme é a fonte autoritativa. A lista
    // principal pode terminar de carregar depois dele e conter estado antigo.
    const source = uniformRecords.find(item => item.id === studentId)
      || students.find(item => item.id === studentId)
      || classStudents?.find(item => item.id === studentId);
    return pending(source);
  }

  // As etiquetas de situação ficam exclusivamente dentro desta tela.
  // A lista de alunos e o card de detalhes mantêm suas informações próprias.
  function paintStudentCards() {}

  function classOptions() {
    const select = get('uniformClass'); const current = select.value;
    const selectedShift = get('uniformShift').value;
    const available = classes.filter(item => !selectedShift || (item.shift || 'Matutino') === selectedShift);
    select.innerHTML = '<option value="">Todas as turmas</option>' + available.map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }
  const uniformViewLabels = { uniform:'Sem uniforme', shoes:'Sem tênis', both:'Sem os dois', material:'Sem material', pending:'Pendentes' };
  function updateActiveFilterIndicator({ shift, classId, view, query, matchedByView, visibleCount }) {
    const indicator = get('uniformActiveFilter');
    const parts = [];
    if (shift) parts.push(`Turno ${shift}`);
    if (classId) { const cls = classes.find(item => item.id === classId); if (cls) parts.push(`Turma ${cls.name}`); }
    if (view !== 'all') parts.push(uniformViewLabels[view] || view);
    // Sem nenhum filtro específico e sem busca: nada de específico para
    // mostrar — não cria informação visual redundante ("mostrando tudo").
    if (!parts.length && !query) {
      indicator.classList.add('hidden');
      indicator.replaceChildren();
      return;
    }
    indicator.classList.remove('hidden');
    const base = parts.length ? parts.join(' • ') : 'Busca';
    const countLabel = `${matchedByView} aluno${matchedByView === 1 ? '' : 's'}`;
    const searchSuffix = query && visibleCount !== matchedByView ? ` • mostrando ${visibleCount} com a busca atual` : '';
    const description = document.createElement('span');
    description.textContent = `${base} — ${countLabel}${searchSuffix}`;
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'uniform-clear-filter';
    clear.textContent = 'Limpar filtro';
    indicator.replaceChildren(description, clear);
  }
  function render() {
    classOptions();
    const bulkAccess = bulkUniformAccess();
    get('markAllUniformReceived').classList.toggle('hidden', !bulkAccess.allowed);
    // Os contadores são sempre gerais; os filtros abaixo servem apenas para
    // definir quais alunos aparecem na lista.
    updateUniformSummary();
    const shift = get('uniformShift').value, classId = get('uniformClass').value, view = get('uniformView').value, query = get('uniformSearch').value.trim().toLocaleLowerCase('pt-BR');
    get('uniformItemsPanel').classList.toggle('uniform-results-active', !!shift || !!classId);
    if (!shift && !classId) {
      get('uniformActiveFilter').classList.add('hidden');
      get('uniformList').innerHTML = '<div class="uniform-empty uniform-empty-modern"><span class="uniform-empty-illustration"><span class="uniform-icon uniform-icon-clipboard" aria-hidden="true"></span></span><b>Escolha um turno ou uma turma</b><span>para ver os alunos.</span></div>';
      return;
    }
    if (classStudents === null) {
      get('uniformActiveFilter').classList.add('hidden');
      get('uniformList').innerHTML = '<div class="uniform-empty">Carregando alunos da turma…</div>';
      return;
    }
    // A tela de Uniforme deve manter todos os alunos da turma juntos e em
    // ordem alfabética, independentemente da data em que foram cadastrados.
    const matchedByView = classStudents.filter(item => {
      const type = pending(item);
      const missingMaterial = materialPending(item);
      if (view === 'all') return true;
      if (view === 'pending') return !!type || missingMaterial;
      if (view === 'material') return missingMaterial;
      return type === view;
    });
    const visible = matchedByView.filter(item => !query || item.name.toLocaleLowerCase('pt-BR').includes(query))
      .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));
    updateActiveFilterIndicator({ shift, classId, view, query, matchedByView:matchedByView.length, visibleCount:visible.length });
    get('uniformList').innerHTML = visible.length ? visible.map(item => {
      const type = pending(item), missingMaterial = materialPending(item), statuses = statusesFor(item);
      const statusHtml = statuses.length ? `<div class="uniform-statuses">${statuses.map(status => `<span class="uniform-status pending">${labels[status]}</span>`).join('')}</div>` : '<span class="uniform-status received">✓ Recebeu</span>';
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student">${avatarHtml(item)}<div><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div></div><div>${statusHtml}</div>${canRegisterUniform(item) ? `<div class="uniform-action"><select class="uniform-select" aria-label="Registrar situação de uniforme e tênis"><option value="" ${!type ? 'selected' : ''}>Uniforme e tênis: recebeu</option><option value="uniform" ${type === 'uniform' ? 'selected' : ''}>Não recebeu uniforme</option><option value="shoes" ${type === 'shoes' ? 'selected' : ''}>Não recebeu tênis</option><option value="both" ${type === 'both' ? 'selected' : ''}>Não recebeu uniforme e tênis</option></select><select class="material-select" aria-label="Registrar situação de material"><option value="" ${!missingMaterial ? 'selected' : ''}>Material: recebeu</option><option value="material" ${missingMaterial ? 'selected' : ''}>Não recebeu material</option></select></div>` : '<div class="meta">Consulta disponível.</div>'}</article>`;
    }).join('') : `<div class="uniform-empty">Nenhum aluno corresponde a este filtro.<br><br>${view !== 'all' ? 'Use “Todos os alunos da turma” para ver cada aluno e registrar a situação.' : 'Esta turma ainda não possui alunos cadastrados.'}</div>`;
    observeUniformPhotos(get('uniformList'));
    setTimeout(paintStudentCards, 0);
  }
  async function loadClassStudents() {
    const classId = get('uniformClass').value;
    const shift = get('uniformShift').value;
    const requestId = ++classStudentsRequest;
    const selectedClassName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');
    const selectedTargetName = selectedClassName(classes.find(item => item.id === classId)?.name);
    if (!classId && !shift) {
      classStudents = [];
      render();
      return;
    }
    // A lista principal já contém todos os alunos. Reaproveitá-la evita uma
    // segunda consulta completa que desmontava a janela e causava piscadas.
    classStudents = students
      .filter(item => (!classId || item.classId === classId || selectedClassName(item.className) === selectedTargetName) && (!shift || shiftForStudent(item) === shift))
      .map(item => ({ ...item }));
    if (requestId === classStudentsRequest) render();
  }
  let uniformOpenRefreshPromise = null;
  function open() {
    if (!canAccessUniform()) { toast('O administrador precisa liberar o acesso ao Controle de Itens para este coordenador.'); return; }
    // NUNCA chame window.load?.() aqui: é a carga completa da tela principal
    // (todos os alunos, todas as turmas, e — em student-edit-improvements.js —
    // zera photoUrl de todo mundo antes de recarregar sob demanda), então
    // reexecutá-la só para abrir esta janela recarrega a página inteira por
    // trás (fotos da lista principal somem e voltam) e atrasa a abertura em
    // segundos, sem necessidade: students/classes já são mantidos
    // atualizados pelo ciclo de vida normal do app. Só o estado específico de
    // Uniforme (colunas próprias, leves) precisa ser garantido fresco aqui.
    // Abra primeiro com o estado já sincronizado pelo evento data-loaded.
    // A leitura fresca acontece depois, sem bloquear a resposta ao clique.
    classOptions();
    setUniformMode('items');
    modal.classList.remove('hidden');
    if (get('uniformClass').value || get('uniformShift').value) loadClassStudents();
    else { classStudents = []; render(); }
    if (!uniformOpenRefreshPromise) {
      uniformOpenRefreshPromise = refreshUniformState({ renderWhenOpen:true })
        .catch(error => console.error('Não foi possível atualizar o Controle de Itens em segundo plano:', error))
        .finally(() => { uniformOpenRefreshPromise = null; });
    }
  }
  const syncUniformNavigation = () => {
    const allowed = canAccessUniform();
    uniformButton.classList.toggle('hidden', !allowed);
    uniformButton.hidden = !allowed;
    if (!allowed) modal.classList.add('hidden');
  };
  uniformButton.onclick = open; get('closeUniform').onclick = () => modal.classList.add('hidden'); modal.onclick = event => { if (event.target === modal) modal.classList.add('hidden'); };
  get('uniformShift').onchange = () => { classOptions(); loadClassStudents(); };
  get('uniformClass').onchange = loadClassStudents;
  get('uniformView').onchange = render;
  get('uniformSearch').oninput = render;
  get('uniformActiveFilter').onclick = event => {
    if (!event.target.closest('.uniform-clear-filter')) return;
    get('uniformShift').value = '';
    get('uniformClass').value = '';
    get('uniformView').value = 'all';
    get('uniformSearch').value = '';
    classOptions();
    loadClassStudents();
  };
  get('uniformShiftSummary').onclick = event => {
    const button = event.target.closest('button.uniform-shift-cell');
    if (!button || button.disabled) return;
    const shift = button.dataset.shift, view = button.dataset.view;
    const alreadyActive = get('uniformShift').value === shift && get('uniformView').value === view;
    const nextShift = alreadyActive ? '' : shift;
    get('uniformShift').value = nextShift;
    get('uniformView').value = alreadyActive ? 'all' : view;
    // Busca nunca é limpa automaticamente. Turma é preservada só quando ainda
    // compatível com o turno resultante; ao desativar o filtro (toggle-off,
    // nextShift vazio), a turma já escolhida também é preservada.
    const currentClassId = get('uniformClass').value;
    if (currentClassId && nextShift && shiftForClass(currentClassId) !== nextShift) {
      get('uniformClass').value = '';
    }
    classOptions();
    loadClassStudents();
  };
  get('uniformList').onchange = async event => {
    const select = event.target.closest('.uniform-select, .material-select'); if (!select) return;
    const row = select.closest('.uniform-row'); const student = classStudents?.find(item => item.id === row.dataset.id) || students.find(item => item.id === row.dataset.id);
    if (!canRegisterUniform(student)) return;
    const isMaterial = select.classList.contains('material-select');
    const type = select.value;
    select.disabled = true;
    const nextState = isMaterial
      ? { material_received:type !== 'material' }
      : {
          uniform_pending: type || null,
          uniform_received: type !== 'uniform' && type !== 'both',
          shoes_received: type !== 'shoes' && type !== 'both'
        };
    let updateQuery = db.from('students').update(nextState).eq('id', row.dataset.id);
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) { toast('Selecione uma escola antes de atualizar o uniforme.'); select.disabled = false; return; }
    updateQuery = updateQuery.eq('school_id', schoolId);
    const { error } = await updateQuery;
    if (error) { toast(error.message.includes('material_received') ? 'Execute o script supabase-uniform-material.sql no Supabase.' : error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message); select.disabled = false; return; }
    // Atualização imediata: contadores, lista e etiqueta não dependem de uma
    // nova abertura da janela nem de uma atualização posterior da página.
    const updateLocalStatus = item => {
      if (item?.id !== row.dataset.id) return;
      Object.assign(item, nextState);
      if (!isMaterial) item.uniform_pending = type || '';
    };
    students.forEach(updateLocalStatus);
    classStudents?.forEach(updateLocalStatus);
    uniformRecords.forEach(updateLocalStatus);
    // Invalida qualquer consulta iniciada antes desta alteração. Ela não pode
    // mais voltar e desfazer apenas o contador deste aluno.
    uniformStateRequest += 1;
    locallyUpdatedUniformIds.add(row.dataset.id);
    canonicalUniformState.set(row.dataset.id, { id:row.dataset.id, ...(canonicalUniformState.get(row.dataset.id) || {}), ...nextState, ...(!isMaterial ? { uniform_pending:type || '' } : {}) });
    window.uniformStateByStudent ||= new Map();
    window.uniformStateByStudent.set(row.dataset.id, canonicalUniformState.get(row.dataset.id));
    updateUniformSummary();
    render();
    toast(type ? 'Pendência registrada.' : 'Aluno marcado como recebeu.');
  };
  get('markAllUniformReceived').onclick = async () => {
    const access = bulkUniformAccess();
    if (!access.allowed) return;
    if (!access.classId) { toast('Selecione uma turma para usar esta ação.'); return; }
    if (!access.ids.length) { toast('Selecione uma turma com alunos para usar esta ação.'); return; }
    if (!confirm('Marcar todos os alunos desta turma como receberam uniforme, tênis e material?')) return;
    const button = get('markAllUniformReceived');
    button.disabled = true;
    const nextState = { uniform_pending:null, uniform_received:true, shoes_received:true, material_received:true };
    const schoolId = window.getActiveSchoolId?.();
    if (!schoolId) { button.disabled = false; toast('Selecione uma escola antes de atualizar o uniforme.'); return; }
    const { error } = await db.rpc('mark_all_uniform_received', {
      target_school_id:schoolId,
      target_class_id:access.classId || null
    });
    if (error) {
      button.disabled = false;
      toast(error.message.includes('uniform_pending') ? 'Execute novamente o script SQL do Uniforme no Supabase.' : error.message);
      return;
    }
    const markReceived = item => {
      if (!item) return;
      item.uniform_pending = '';
      item.uniform_received = true;
      item.shoes_received = true;
      item.material_received = true;
    };
    const affectedIds = new Set(access.ids);
    const markAffectedReceived = item => { if (affectedIds.has(item?.id)) markReceived(item); };
    students.forEach(markAffectedReceived);
    uniformRecords.forEach(markAffectedReceived);
    classStudents?.forEach(markAffectedReceived);
    uniformStateRequest += 1;
    students.forEach(item => {
      if (affectedIds.has(item?.id)) {
        locallyUpdatedUniformIds.add(item.id);
        canonicalUniformState.set(item.id, { id:item.id, ...nextState });
      }
    });
    window.uniformStateByStudent = new Map(canonicalUniformState);
    // Atualização visual imediata: não espere uma consulta, evento em tempo
    // real ou troca de turma para refletir a alteração concluída.
    updateUniformSummary();
    render();
    button.disabled = false;
    toast('Todos os alunos da turma foram marcados como receberam.');
  };
  // ------------------------------------------------------------------
  // Livro/Revisa — núcleo funcional (área própria dentro de Uniforme,
  // não misturada aos contadores/filtros de uniforme/tênis/material).
  // Mesmas permissões já corrigidas: can_view_uniform (ver a aba) e
  // can_edit_uniform (registrar/corrigir/finalizar) — sem flag nova.
  // ------------------------------------------------------------------
  let livroRevisaTerms = new Map(); // chave `${ano}_${bimestre}` -> {starts_on, ends_on}
  let livroRevisaDeliveries = new Map(); // chave `${student_id}_${ano}_${bimestre}` -> linha real
  let livroRevisaClassStudents = [];

  const formatLivroRevisaDate = value => value ? new Intl.DateTimeFormat('pt-BR').format(new Date(value)) : '';

  // Ausência de linha NUNCA significa "não recebido" — só os dois primeiros
  // estados abaixo têm linha real; os outros três são sempre derivados na
  // leitura, comparando com o calendário (school_terms).
  function deriveLivroRevisaState(row, term) {
    if (!term) return 'sem_calendario';
    if (row) return row.status;
    const todayIso = new Date().toISOString().slice(0, 10);
    if (term.starts_on > todayIso) return 'nao_iniciado';
    return 'sem_informacao';
  }
  window.deriveLivroRevisaState = deriveLivroRevisaState;

  const livroRevisaStateLabel = (state, row) => {
    if (state === 'recebido') return `Recebido em ${formatLivroRevisaDate(row?.delivered_at)}`;
    if (state === 'nao_recebido') return 'Não recebido.';
    if (state === 'nao_iniciado') return 'Bimestre não iniciado.';
    if (state === 'sem_calendario') return 'Calendário letivo não configurado para este período.';
    return 'Não há informação neste período.';
  };
  window.livroRevisaStateLabel = livroRevisaStateLabel;

  const livroRevisaTermFor = (year, bimester) => livroRevisaTerms.get(`${year}_${bimester}`) || null;

  const currentLivroRevisaSelection = () => ({
    classId: get('livroRevisaClass').value || null,
    year: Number(get('livroRevisaYear').value) || null,
    bimester: Number(get('livroRevisaBimester').value) || null
  });

  function livroRevisaClassOptions() {
    const select = get('livroRevisaClass');
    const current = select.value;
    select.innerHTML = '<option value="">Selecione a turma</option>' + classes.slice()
      .sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }))
      .map(item => `<option value="${item.id}">${escape(item.name)}</option>`).join('');
    if ([...select.options].some(item => item.value === current)) select.value = current;
  }

  async function refreshLivroRevisaTerms() {
    livroRevisaTerms = new Map();
    if (!uniformMembership) return;
    const { data, error } = await db.from('school_terms').select('school_year,bimester,starts_on,ends_on').eq('school_id', uniformMembership.school_id);
    if (error) return;
    (data || []).forEach(term => { livroRevisaTerms.set(`${term.school_year}_${term.bimester}`, term); });
  }

  async function loadLivroRevisaDeliveries(studentIds) {
    livroRevisaDeliveries = new Map();
    if (!studentIds.length) return;
    const { data, error } = await db.rpc('report_livro_revisa', { p_student_ids: studentIds });
    if (error) { toast(error.message); return; }
    (data || []).forEach(row => { livroRevisaDeliveries.set(`${row.student_id}_${row.school_year}_${row.bimester}`, row); });
  }

  function renderLivroRevisaPanel() {
    const { classId, year, bimester } = currentLivroRevisaSelection();
    const notice = get('livroRevisaNotice');
    const columns = get('livroRevisaColumns');
    const list = get('livroRevisaList');
    const finalizeButton = get('finalizeLivroRevisa');

    if (!classId || !year || !bimester) {
      columns.classList.add('hidden');
      notice.classList.add('hidden');
      finalizeButton.disabled = true;
      finalizeButton.title = 'Escolha turma, ano letivo e bimestre antes de finalizar a conferência.';
      list.innerHTML = '<div class="uniform-empty">Escolha turma, ano letivo e bimestre para ver os alunos.</div>';
      return;
    }

    const term = livroRevisaTermFor(year, bimester);
    // O mesmo bloqueio que a RPC já aplica no banco (bimestre precisa existir
    // E já ter começado) tem que valer aqui — nunca deixar ✓/✕/Finalizar
    // habilitados para um período que a escrita real recusaria. O calendário
    // é pré-requisito legítimo, não uma falha — mas o botão desabilitado
    // sozinho parece quebrado, então o motivo exato fica sempre visível no
    // aviso acima da lista E no title do próprio botão (funciona mesmo se o
    // aviso ficar fora da viewport em telas pequenas).
    const termStarted = !!term && term.starts_on <= new Date().toISOString().slice(0, 10);
    notice.classList.toggle('hidden', termStarted);
    if (!termStarted) notice.textContent = term ? 'Bimestre ainda não iniciado — aguarde a data de início configurada.' : 'Calendário letivo não configurado para este período. Configure em Permissões → Permissões avançadas → Calendário letivo.';

    livroRevisaClassStudents = students.filter(item => item.classId === classId)
      .slice().sort((first, second) => String(first.name || '').localeCompare(String(second.name || ''), 'pt-BR', { numeric:true, sensitivity:'base' }));

    columns.classList.toggle('hidden', livroRevisaClassStudents.length === 0);
    const canRegisterHere = canRegisterUniform() && termStarted;
    finalizeButton.disabled = !canRegisterUniform() || !termStarted;
    finalizeButton.title = !canRegisterUniform()
      ? 'Sem permissão para finalizar a conferência.'
      : !termStarted
        ? (term ? 'Bimestre ainda não iniciado — aguarde a data de início configurada.' : 'Calendário letivo não configurado para este período. Configure em Permissões → Permissões avançadas → Calendário letivo.')
        : 'Notifica administradores e coordenadores sobre os alunos ainda marcados como não recebido nesta turma/bimestre.';

    list.innerHTML = livroRevisaClassStudents.length ? livroRevisaClassStudents.map(item => {
      const row = livroRevisaDeliveries.get(`${item.id}_${year}_${bimester}`) || null;
      const state = deriveLivroRevisaState(row, term);
      const isReceived = state === 'recebido', isNotReceived = state === 'nao_recebido';
      const statusClass = isReceived ? 'received' : 'pending';
      const statusHtml = `<span class="uniform-status ${statusClass}">${escape(livroRevisaStateLabel(state, row))}</span>`;
      const actionsHtml = canRegisterHere
        ? `<div class="livro-revisa-toggle"><button type="button" class="livro-revisa-check ${isReceived ? 'active' : ''}" data-student-id="${item.id}" data-status="recebido" aria-pressed="${isReceived}" aria-label="Marcar ${escape(item.name)} como recebido">✓</button><button type="button" class="livro-revisa-cross ${isNotReceived ? 'active' : ''}" data-student-id="${item.id}" data-status="nao_recebido" aria-pressed="${isNotReceived}" aria-label="Marcar ${escape(item.name)} como não recebido">✕</button></div>`
        : '<div class="meta">Consulta disponível.</div>';
      return `<article class="uniform-row" data-id="${item.id}"><div class="uniform-student">${avatarHtml(item)}<div><b>${escape(item.name)}</b><div class="meta">Turma ${escape(item.className)}</div></div></div><div>${statusHtml}</div>${actionsHtml}</article>`;
    }).join('') : '<div class="uniform-empty">Esta turma ainda não possui alunos cadastrados.</div>';
    observeUniformPhotos(list);
  }

  async function refreshLivroRevisaForClass() {
    const { classId } = currentLivroRevisaSelection();
    livroRevisaDeliveries = new Map();
    if (classId) {
      const ids = students.filter(item => item.classId === classId).map(item => item.id);
      await loadLivroRevisaDeliveries(ids);
    }
    renderLivroRevisaPanel();
  }

  function setUniformMode(mode) {
    const isItems = mode !== 'livro_revisa';
    get('uniformModeItems').classList.toggle('active', isItems);
    get('uniformModeItems').setAttribute('aria-pressed', String(isItems));
    get('uniformModeLivroRevisa').classList.toggle('active', !isItems);
    get('uniformModeLivroRevisa').setAttribute('aria-pressed', String(!isItems));
    get('uniformItemsPanel').classList.toggle('hidden', !isItems);
    get('livroRevisaPanel').classList.toggle('hidden', isItems);
    if (!isItems) {
      if (!get('livroRevisaYear').value) get('livroRevisaYear').value = String(new Date().getFullYear());
      livroRevisaClassOptions();
      refreshLivroRevisaTerms().then(() => refreshLivroRevisaForClass());
    }
  }

  get('uniformModeItems').onclick = () => setUniformMode('items');
  get('uniformModeLivroRevisa').onclick = () => setUniformMode('livro_revisa');
  get('livroRevisaClass').onchange = refreshLivroRevisaForClass;
  get('livroRevisaYear').onchange = renderLivroRevisaPanel;
  get('livroRevisaBimester').onchange = renderLivroRevisaPanel;
  get('livroRevisaList').onclick = async event => {
    const button = event.target.closest('.livro-revisa-check, .livro-revisa-cross');
    if (!button || button.disabled) return;
    const { classId, year, bimester } = currentLivroRevisaSelection();
    if (!classId || !year || !bimester || !canRegisterUniform()) return;
    const studentId = button.dataset.studentId, status = button.dataset.status;
    // Desfazer ✕: só quando o próprio botão ✕ já está ativo (estado atual real
    // é nao_recebido, pintado no último render). O ✓ nunca entra neste caminho
    // — continua chamando set_livro_revisa_status em qualquer estado, como hoje.
    const isUndoCross = button.classList.contains('livro-revisa-cross') && button.classList.contains('active');
    button.disabled = true;
    const { error } = isUndoCross
      ? await db.rpc('clear_livro_revisa_status', { target_student_id:studentId, p_school_year:year, p_bimester:bimester })
      : await db.rpc('set_livro_revisa_status', { target_student_id:studentId, p_school_year:year, p_bimester:bimester, p_status:status });
    if (error) { toast(error.message); button.disabled = false; return; }
    await loadLivroRevisaDeliveries(livroRevisaClassStudents.map(item => item.id));
    renderLivroRevisaPanel();
    toast(isUndoCross ? 'Marcação removida.' : (status === 'recebido' ? 'Aluno marcado como recebido.' : 'Pendência registrada.'));
  };
  get('finalizeLivroRevisa').onclick = async () => {
    const { classId, year, bimester } = currentLivroRevisaSelection();
    if (!classId || !year || !bimester || !canRegisterUniform()) return;
    const button = get('finalizeLivroRevisa');
    button.disabled = true;
    const { error } = await db.rpc('notify_livro_revisa_pending', { target_class_id:classId, p_school_year:year, p_bimester:bimester });
    button.disabled = false;
    if (error) { toast(error.message); return; }
    toast('Conferência finalizada.');
  };

  document.addEventListener('carometro:data-loaded', async () => {
    // O carregamento principal já trouxe os campos de Uniforme. Reutilize-o
    // em vez de iniciar uma segunda consulta que possa chegar fora de ordem.
    syncUniformState(students.map(student => ({
      id:student.id,
      uniform_pending:student.uniform_pending,
      uniform_received:student.uniform_received,
      shoes_received:student.shoes_received,
      material_received:student.material_received
    })), { preserveLocal:true });
    await refreshUniformMembership();
    syncUniformNavigation();
    if (!modal.classList.contains('hidden')) { classOptions(); loadClassStudents(); }
    if (!modal.classList.contains('hidden') && !get('livroRevisaPanel').classList.contains('hidden')) { await refreshLivroRevisaTerms(); await refreshLivroRevisaForClass(); }
  });
  document.addEventListener('carometro:permission-refresh', async () => {
    await refreshUniformMembership();
    syncUniformNavigation();
    if (!modal.classList.contains('hidden')) render();
    if (!modal.classList.contains('hidden') && !get('livroRevisaPanel').classList.contains('hidden')) renderLivroRevisaPanel();
  });
  new MutationObserver(syncUniformNavigation).observe(get('app'), { attributes:true, attributeFilter:['class'] });
  setTimeout(syncUniformNavigation, 0);

});
