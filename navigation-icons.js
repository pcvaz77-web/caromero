document.addEventListener('DOMContentLoaded', () => {
  const items = {
    platformNav: ['home', 'Plataforma'],
    reportsNav: ['chart', 'Relatórios'],
    permissionsNav: ['lock', 'Permissões'],
    inviteNav: ['mail', 'Convites'],
    schoolInvitationsNav: ['mail', 'Convites'],
    counselorNav: ['users', 'Gerenciar Conselheiros'],
    uniformNav: ['box', 'Controle de Itens'],
    occurrenceNav: ['warning', 'Ocorrência'],
    observationsNav: ['tag', 'Gerenciar observações'],
    profileNav: ['user', 'Meu Perfil'],
    settingsNav: ['settings', 'Configurações']
  };

  Object.entries(items).forEach(([id, [icon, label]]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.innerHTML = `<span class="navigation-vector navigation-vector-${icon}" aria-hidden="true"></span><span class="navigation-label">${label}</span>`;
    button.setAttribute('aria-label', label);
  });
});
