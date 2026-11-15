// Ajuda contextual: o menu reproduz somente as opções visíveis ao usuário.
(() => {
  const help = {
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
    inviteNav: ['Convites', 'Convide usuários para a escola e acompanhe os acessos gerados.'],
    homeCommunicationButton: ['Comunicação', 'Publique lembretes para a escola e escolha quais informações automáticas aparecem no painel da página inicial.'],
    schoolYearNav: ['Preparar novo ano letivo', 'Use as etapas de preparação do novo ano letivo para revisar turmas e estudantes antes de concluir a transição.'],
    settingsNav: ['Configurações', 'Ajuste as opções da escola disponíveis para seu perfil e revise cada alteração antes de salvar.'],
    profileNav: ['Meu Perfil', 'Atualize seus dados pessoais e sua senha. Para trocar a senha, informe a senha atual.'],
    schoolSwitchNav: ['Escola ativa', 'Selecione a escola em que deseja trabalhar. Os registros mostrados passam a ser os dessa escola.'],
    contactNav: ['Suporte', 'Abra os canais de contato para pedir ajuda sobre o Carômetro.'],
    communicationPreferencesNav: ['Notificações', 'Escolha quais comunicações e notificações deseja receber.'],
    bulkSchoolImportNav: ['Importação de escolas', 'Importe os dados usando o formato solicitado na tela e confira a prévia antes de confirmar.'],
    familySchoolNav: ['Portal da Família', 'Consulte as opções do Portal da Família disponíveis para sua escola, como convites e registros de entrada.'],
    platformNav: ['Plataforma', 'Acesse o painel do proprietário para administrar escolas, planos, comunicações e tutoriais.']
  };
  window.carometroHowToCatalog = help;
  const validUrl = url => /^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(url || '');
  const validColor = color => /^#[0-9a-f]{6}$/i.test(color || '');
  let tutorials = {};
  let lastFocus = null;

  async function loadTutorials() {
    const result = await db.from('platform_tutorials').select('function_key,youtube_url,button_label,button_color');
    if (result.error) return result.error;
    tutorials = Object.fromEntries((result.data || []).map(row => [row.function_key, row]));
    return null;
  }

  function visibleEntries() {
    return [...document.querySelectorAll('#app .side .nav > button')]
      .filter(button => button.id !== 'howToNav' && help[button.id] && !button.hidden && !button.classList.contains('hidden') && button.getAttribute('aria-hidden') !== 'true' && getComputedStyle(button).display !== 'none')
      .map(button => [button.id, help[button.id]]);
  }

  function choose(key) {
    const modal = document.getElementById('howToModal');
    const entry = help[key];
    if (!modal || !entry) return;
    modal.querySelectorAll('[data-how-to-key]').forEach(button => {
      const selected = button.dataset.howToKey === key;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    modal.querySelector('#howToTitle').textContent = entry[0];
    modal.querySelector('#howToText').textContent = entry[1];
    const link = modal.querySelector('#howToVideo');
    const configured = tutorials[key];
    if (validUrl(configured?.youtube_url)) {
      link.href = configured.youtube_url;
      link.textContent = configured.button_label || 'Ver tutorial';
      link.style.backgroundColor = validColor(configured.button_color) ? configured.button_color : '#4169d6';
      link.hidden = false;
    } else {
      link.removeAttribute('href');
      link.hidden = true;
    }
    modal.querySelector('#howToVideoPending').hidden = !link.hidden;
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
    if (!modal.classList.contains('hidden') && selected) choose(selected);
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
      const label = makeField('Texto do botão', 'text', row.button_label || 'Ver tutorial');
      label.maxLength = 40;
      const color = makeField('Cor do botão', 'color', validColor(row.button_color) ? row.button_color : '#4169d6');
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
        const buttonLabel = label.value.trim() || 'Ver tutorial';
        if (buttonLabel.length > 40) { status.textContent = 'Máximo de 40 caracteres.'; return; }
        save.disabled = true;
        const result = await db.from('platform_tutorials').upsert({function_key:key, youtube_url:youtubeUrl || null, button_label:buttonLabel, button_color:color.value, updated_at:new Date().toISOString()});
        status.textContent = result.error ? result.error.message : 'Tutorial salvo.';
        save.disabled = false;
        if (!result.error) tutorials[key] = {youtube_url:youtubeUrl || null, button_label:buttonLabel, button_color:color.value};
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
    modal.innerHTML = '<div class="how-to-dialog"><header class="how-to-head"><div><h2 id="howToHeading">Como Usar</h2><p>Escolha uma função para ler as orientações.</p></div><button id="howToClose" type="button" aria-label="Fechar">×</button></header><div class="how-to-body"><nav id="howToList" aria-label="Funções disponíveis"></nav><article class="how-to-content"><h3 id="howToTitle"></h3><p id="howToText"></p><a id="howToVideo" target="_blank" rel="noopener noreferrer" hidden>Ver tutorial</a><p id="howToVideoPending" class="how-to-pending">O vídeo desta função ainda não foi cadastrado.</p></article></div></div>';
    document.body.append(modal);
    modal.querySelector('#howToClose').onclick = close;
    modal.onclick = event => { if (event.target === modal) close(); };
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  });
})();
