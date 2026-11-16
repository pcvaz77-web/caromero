// Ajuda contextual: o menu reproduz somente as opções visíveis ao usuário.
(() => {
  const help = {
    classPanelButton: ['Painel da turma', 'Escolha uma turma no menu lateral e abra o Painel da turma. Selecione uma das ferramentas ao lado para ver como usá-la. As ferramentas disponíveis dependem do seu perfil.'],
    classroomMapAction: ['Editar mapeamento', 'Abra Editar mapeamento no Painel da turma. Organize os alunos nas carteiras, ajuste as fileiras se necessário e salve um rascunho. Quando estiver pronto, publique o mapeamento para os professores.'],
    viewPublishedClassroomMap: ['Ver mapeamento', 'Escolha uma turma e abra Ver mapeamento no Painel da turma para consultar as posições publicadas. Se não houver mapeamento publicado, peça a quem gerencia a turma que o prepare.'],
    openSiapGrades: ['Extrair notas do SIAP', 'No Painel da turma, abra Extrair notas do SIAP. Na página autenticada do SIAP, selecione a turma, a disciplina e o bimestre. Capture os dados, confira a prévia e confirme a importação para os cards dos alunos.'],
    openSiapAbsences: ['Extrair faltas do SIAP', 'No Painel da turma, abra Extrair faltas do SIAP. Capture a tela de notas da turma no SIAP, confira os nomes e as faltas na prévia e marque somente os alunos corretos antes de importar.'],
    classExamAction: ['Provas da turma', 'Abra Provas da turma para criar provas mensais ou bimestrais. Escolha o tipo, a disciplina e as questões; revise antes de finalizar. Depois, você pode imprimir a prova e o gabarito.'],
    openAttendanceSettings: ['Configurar frequência', 'Defina os limites percentuais usados para classificar os alunos como frequentes, faltosos ou em busca ativa. Confira os valores antes de salvar para a escola.'],
    openSiapImportManager: ['Gerenciar capturas do SIAP', 'Consulte as importações da turma por disciplina e bimestre. Ao limpar uma captura, os dados importados saem dos cards e das etiquetas; confira a seleção antes de confirmar.'],
    classroomInstallAction: ['Instalar extensão de frequência', 'Use o link no Painel da turma para instalar ou atualizar a extensão de leitura de frequência. Depois, abra o SIAP e siga o fluxo de captura da turma.'],
    regularExamNav: ['Correção de provas', 'Abra a avaliação no SIAP e escolha a turma e a disciplina. Na extensão, conecte o celular pelo QR Code, leia o gabarito e fotografe os cartões. Confira nomes e respostas antes de enviar os resultados e salvar no SIAP. As provas de bloco do CEPI ficam em Meu CEPI.'],
    cepiNav: ['Meu CEPI', 'Acesse os recursos do CEPI disponíveis para sua escola, como provas, acompanhamento e registros pedagógicos. As opções exibidas dependem das suas permissões.'],
    schoolCalendar2027Nav: ['Calendário Escolar', 'Consulte os meses do calendário escolar e passe o mouse ou toque em uma data para ver a indicação daquele dia.'],
    schoolDailyAttendanceNav: ['Frequência da Secretaria', 'Consulte os registros de frequência disponíveis para a secretaria. Selecione o período e a turma para acompanhar as informações.'],
    reportsNav: ['Relatórios', 'Abra os relatórios disponíveis, escolha os filtros necessários e confira os dados antes de imprimir ou exportar.'],
    occurrenceNav: ['Ocorrências', 'Para registrar, selecione a turma e o aluno, informe a data e descreva o fato. Você pode anexar foto ou PDF. Para consultar registros, use Buscar Ocorrência e filtre por período, turma ou nome.'],
    uniformNav: ['Controle de Itens', 'Acompanhe os itens registrados para os estudantes e use as opções disponíveis para registrar entregas ou consultar o histórico.'],
    counselorNav: ['Gerenciar Conselheiros', 'Consulte e organize os conselheiros das turmas. Verifique a turma selecionada antes de alterar uma atribuição.'],
    observationsNav: ['Gerenciar observações', 'Organize as observações usadas nos perfis dos estudantes e confira o efeito das alterações antes de salvar.'],
    permissionsNav: ['Permissões', 'Consulte os usuários da escola e defina os acessos de cada perfil. Revise as permissões antes de salvar, pois elas controlam as funções disponíveis.'],
    schoolInvitationsNav: ['Convites', 'Gere e acompanhe convites para usuários da escola. Confira o destinatário e o perfil antes de compartilhar o convite.'],
    homeCommunicationButton: ['Comunicação', 'Publique lembretes para a escola e escolha quais informações automáticas aparecem no painel da página inicial.'],
    schoolYearNav: ['Preparar novo ano letivo', 'Use as etapas de preparação do novo ano letivo para revisar turmas e estudantes antes de concluir a transição.'],
    profileNav: ['Meu Perfil', 'Atualize seus dados pessoais e sua senha. Para trocar a senha, informe a senha atual.'],
    familySchoolNav: ['Portal da Família', 'Consulte as opções do Portal da Família disponíveis para sua escola, como convites e registros de entrada.']
  };
  const panelTopics = [
    ['classroomMapAction', 'editClassroomMap', context => permission?.role === 'admin' || permission?.is_coordinator],
    ['viewPublishedClassroomMap', 'viewPublishedClassroomMap', context => !(permission?.role === 'admin' || permission?.is_coordinator)],
    ['openSiapAbsences', 'openSiapAbsences', context => !!window.getSiapAbsencePanelAction?.(context)],
    ['openSiapGrades', 'openSiapGrades', context => !!window.getSiapGradePanelAction?.(context)],
    ['openSiapImportManager', 'openSiapImportManager', context => !!window.getSiapImportManagerAction?.(context)],
    ['classExamAction', 'classExamAction', context => !!window.getClassExamPanelAction?.(context)],
    ['openAttendanceSettings', 'openAttendanceSettings', context => !!window.getAssistedAttendancePanelAction?.(context)],
    ['classroomInstallAction', 'classroomInstallAction', context => !!window.getAttendanceCaptureInstallPanelAction?.(context)]
  ];
  window.carometroHowToCatalog = help;
  const validUrl = url => /^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(url || '');
  let tutorials = {};
  let lastFocus = null;

  async function loadTutorials() {
    const result = await db.from('platform_tutorials').select('function_key,youtube_url');
    if (result.error) return result.error;
    tutorials = Object.fromEntries((result.data || []).map(row => [row.function_key, row]));
    return null;
  }

  function visibleEntries() {
    const entries = [...document.querySelectorAll('#app .side .nav > button')]
      .filter(button => button.id !== 'howToNav' && help[button.id] && !button.hidden && !button.classList.contains('hidden') && button.getAttribute('aria-hidden') !== 'true' && getComputedStyle(button).display !== 'none')
      .map(button => [button.id, help[button.id]]);
    const panelButton = document.getElementById('classPanelButton');
    const role = window.getActiveSchoolRole?.();
    const canSeePanel = panelButton && (!panelButton.classList.contains('hidden') || permission?.role === 'admin' || permission?.is_coordinator || permission?.can_view_class_summary || role === 'teacher' || role === 'school_admin');
    if (canSeePanel) entries.unshift(['classPanelButton', help.classPanelButton]);
    return entries;
  }

  function showTopic(key) {
    const modal = document.getElementById('howToModal');
    const entry = help[key];
    if (!modal || !entry) return;
    modal.querySelector('#howToTitle').textContent = entry[0];
    modal.querySelector('#howToText').textContent = entry[1];
    const link = modal.querySelector('#howToVideo');
    const configured = tutorials[key];
    if (validUrl(configured?.youtube_url)) {
      link.href = configured.youtube_url;
      link.textContent = 'Ver tutorial';
      link.hidden = false;
    } else {
      link.removeAttribute('href');
      link.hidden = true;
    }
    modal.querySelector('#howToVideoPending').hidden = !link.hidden;
  }

  function panelContext() {
    return { classId:selectedClassId || classes?.[0]?.id, permission };
  }

  function availablePanelTopics() {
    const classroomModal = document.getElementById('classroomMapModal');
    const sameContext = classroomModal?.dataset.helpUserId === user?.id && classroomModal?.dataset.helpClassId === String(selectedClassId);
    const actualPanel = sameContext && classroomModal.classList.contains('classroom-panel-mode')
      ? classroomModal.querySelector('#classroomMapContent .classroom-panel-actions') : null;
    if (actualPanel) {
      const actual = new Set([...actualPanel.querySelectorAll('button[id]')].map(button => button.id));
      if (document.querySelector('#classroomInstallAction a')) actual.add('classroomInstallAction');
      return panelTopics.filter(([, buttonId]) => actual.has(buttonId)).map(([key]) => key);
    }
    const context = panelContext();
    return panelTopics.filter(([, , available]) => available(context)).map(([key]) => key);
  }

  function choosePanelTopic(key) {
    const modal = document.getElementById('howToModal');
    modal.querySelectorAll('[data-how-to-topic]').forEach(button => {
      const selected = button.dataset.howToTopic === key;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    showTopic(key);
  }

  function choose(key) {
    const modal = document.getElementById('howToModal');
    if (!modal || !help[key]) return;
    modal.querySelectorAll('[data-how-to-key]').forEach(button => {
      const selected = button.dataset.howToKey === key;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    const panel = modal.querySelector('#howToPanelTopics');
    const panelMode = key === 'classPanelButton';
    modal.querySelector('.how-to-content').classList.toggle('panel-mode', panelMode);
    panel.hidden = !panelMode;
    panel.replaceChildren();
    if (panelMode) {
      availablePanelTopics().forEach(topic => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.howToTopic = topic;
        button.textContent = help[topic][0];
        button.onclick = () => choosePanelTopic(topic);
        panel.append(button);
      });
    }
    showTopic(key);
  }

  function close() {
    document.getElementById('howToModal')?.classList.add('hidden');
    lastFocus?.focus();
  }

  async function open() {
    const modal = document.getElementById('howToModal');
    if (!modal) return;
    lastFocus = document.activeElement;
    const entries = visibleEntries();
    const list = modal.querySelector('#howToList');
    list.replaceChildren();
    entries.forEach(([key, [label]]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.howToKey = key;
      button.textContent = label;
      button.onclick = () => choose(key);
      list.append(button);
    });
    modal.classList.remove('hidden');
    choose(entries[0]?.[0] || 'profileNav');
    list.querySelector('button')?.focus();
    await loadTutorials();
    const selected = list.querySelector('.active')?.dataset.howToKey;
    const selectedTopic = modal.querySelector('#howToPanelTopics .active')?.dataset.howToTopic;
    if (!modal.classList.contains('hidden') && selected) {
      choose(selected);
      if (selectedTopic) choosePanelTopic(selectedTopic);
    }
  }

  async function openOwner() {
    const root = document.getElementById('platformTutorialsRoot');
    if (!root) return;
    root.textContent = 'Carregando tutoriais…';
    const error = await loadTutorials();
    if (error) { root.textContent = `Não foi possível carregar os tutoriais: ${error.message}`; return; }
    root.replaceChildren();
    const intro = document.createElement('p');
    intro.textContent = 'Cadastre o vídeo de cada função. Sem link, a explicação escrita continua disponível e o botão de vídeo fica oculto.';
    root.append(intro);
    Object.entries(help).forEach(([key, [title]]) => {
      const row = tutorials[key] || {};
      const card = document.createElement('form');
      card.className = 'how-to-owner-card';
      const heading = document.createElement('h4');
      heading.textContent = title;
      const fields = document.createElement('div');
      fields.className = 'how-to-owner-fields';
      const makeField = (label, type, value) => {
        const wrapper = document.createElement('label');
        wrapper.textContent = label;
        const input = document.createElement('input');
        input.type = type;
        input.value = value;
        wrapper.append(input);
        fields.append(wrapper);
        return input;
      };
      const url = makeField('Link do YouTube', 'url', row.youtube_url || '');
      url.placeholder = 'https://www.youtube.com/watch?v=...';
      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn primary';
      save.textContent = 'Salvar tutorial';
      const status = document.createElement('span');
      status.setAttribute('role', 'status');
      card.append(heading, fields, save, status);
      card.onsubmit = async event => {
        event.preventDefault();
        const youtubeUrl = url.value.trim();
        if (youtubeUrl && !validUrl(youtubeUrl)) { status.textContent = 'Use um link do YouTube.'; return; }
        save.disabled = true;
        const result = await db.from('platform_tutorials').upsert({function_key:key, youtube_url:youtubeUrl || null, button_label:'Ver tutorial', button_color:'#356ae6', updated_at:new Date().toISOString()});
        status.textContent = result.error ? result.error.message : 'Tutorial salvo.';
        save.disabled = false;
        if (!result.error) tutorials[key] = {youtube_url:youtubeUrl || null};
      };
      root.append(card);
    });
  }
  window.openPlatformTutorials = openOwner;

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.querySelector('#app .side .nav');
    if (!nav) return;
    const opener = document.createElement('button');
    opener.id = 'howToNav';
    opener.type = 'button';
    opener.innerHTML = '<span class="navigation-vector navigation-vector-user" aria-hidden="true"></span><span class="navigation-label">Como Usar</span>';
    opener.setAttribute('aria-label', 'Como Usar');
    nav.insertBefore(opener, document.getElementById('profileNav') || null);
    opener.onclick = open;
    const modal = document.createElement('div');
    modal.id = 'howToModal';
    modal.className = 'modal-bg hidden';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'howToHeading');
    modal.innerHTML = '<div class="how-to-dialog"><header class="how-to-head"><div><h2 id="howToHeading">Como Usar</h2><p>Escolha uma função para ler as orientações.</p></div><button id="howToClose" type="button" aria-label="Fechar">×</button></header><div class="how-to-body"><nav id="howToList" aria-label="Funções disponíveis"></nav><article class="how-to-content"><nav id="howToPanelTopics" aria-label="Ferramentas do Painel da turma" hidden></nav><div class="how-to-detail"><h3 id="howToTitle"></h3><p id="howToText"></p><a id="howToVideo" target="_blank" rel="noopener noreferrer" hidden>Ver tutorial</a><p id="howToVideoPending" class="how-to-pending">O vídeo desta função ainda não foi cadastrado.</p></div></article></div></div>';
    document.body.append(modal);
    modal.querySelector('#howToClose').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  });
})();
