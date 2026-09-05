document.addEventListener('DOMContentLoaded', () => {
  const modal = document.createElement('div');
  modal.id = 'siapIntegrationModal';
  modal.className = 'modal-bg siap-integration-modal hidden';
  modal.innerHTML = `<div class="modal"><div class="modal-head"><div><h3 id="siapIntegrationTitle">Assistente SIAP</h3><div id="siapIntegrationMeta" class="meta"></div></div><button class="close" type="button" data-siap-close>×</button></div><div id="siapIntegrationContent" class="siap-integration-content"></div></div>`;
  document.body.appendChild(modal);

  const style = document.createElement('style');
  style.textContent = `
    .siap-integration-modal { z-index:140; }
    .siap-integration-modal .modal { width:min(760px,100%); }
    .siap-integration-content { padding:24px; }
    .siap-brand-card { display:grid; grid-template-columns:58px 1fr; gap:15px; align-items:center; padding:18px; border:1px solid #cbd9f6; border-radius:16px; background:linear-gradient(145deg,#f8faff,#edf3ff); }
    .siap-brand-mark { width:58px; height:58px; border-radius:17px; display:grid; place-items:center; background:#17233a; color:#82aeff; font-size:30px; font-weight:900; }
    .siap-brand-card h4 { margin:0 0 5px; font-size:18px; }
    .siap-brand-card p { margin:0; color:var(--muted); font-size:13px; line-height:1.5; }
    .siap-feature-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:14px; }
    .siap-feature { padding:15px; border:1px solid var(--line); border-radius:13px; background:#fff; }
    .siap-feature strong { display:block; margin-bottom:4px; }
    .siap-feature span { color:var(--muted); font-size:12px; line-height:1.45; }
    .siap-integration-actions { display:flex; gap:9px; flex-wrap:wrap; margin-top:18px; }
    .siap-integration-note { margin-top:14px; padding:12px 14px; border-radius:11px; background:#fff8e8; color:#7a5313; font-size:12px; line-height:1.5; }
    .siap-preview-steps { margin:15px 0 0; padding-left:20px; color:#40516f; font-size:13px; line-height:1.65; }
    @media(max-width:640px) { .siap-feature-grid { grid-template-columns:1fr; } .siap-integration-actions .btn { width:100%; } }
  `;
  document.head.appendChild(style);

  const closeModal = () => modal.classList.add('hidden');
  modal.querySelector('[data-siap-close]').onclick = closeModal;
  modal.onclick = event => { if (event.target === modal) closeModal(); };

  const assistantInstallUrl = () => String(window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantInstallUrl || '').trim();
  const openModal = (title, className, content) => {
    document.getElementById('siapIntegrationTitle').textContent = title;
    document.getElementById('siapIntegrationMeta').textContent = className || 'Turma selecionada';
    document.getElementById('siapIntegrationContent').innerHTML = content;
    modal.classList.remove('hidden');
  };

  window.getSiapPanelActions = ({ permission: rights, canManageClass }) => {
    const admin = rights?.role === 'admin';
    const canUseAssistant = admin || !!rights?.can_use_siap_assistant;
    const canImportAttendance = (admin || !!rights?.can_import_siap_attendance) && !!canManageClass;
    return [
      canUseAssistant ? '<button id="openSiapAssistant" type="button" class="btn secondary">Assistente SIAP</button>' : '',
      canImportAttendance ? '<button id="openSiapAttendance" type="button" class="btn secondary">Frequência SIAP</button>' : ''
    ].join('');
  };

  window.bindSiapPanelActions = ({ classId, className }) => {
    const assistant = document.getElementById('openSiapAssistant');
    const attendance = document.getElementById('openSiapAttendance');
    if (assistant) assistant.onclick = () => {
      const installUrl = assistantInstallUrl();
      openModal('Assistente SIAP', className, `
        <section class="siap-brand-card"><div class="siap-brand-mark">✦</div><div><h4>Assistente SIAP do Professor</h4><p>Planejamento, conteúdo, frequência e PEI com revisão do professor e sem captura de credenciais.</p></div></section>
        <div class="siap-feature-grid"><div class="siap-feature"><strong>Instalação controlada</strong><span>O acesso aparece somente para usuários autorizados nesta escola.</span></div><div class="siap-feature"><strong>Privacidade</strong><span>Login e senha do SIAP nunca passam pelo Carômetro.</span></div></div>
        <div class="siap-integration-actions">${installUrl ? `<a class="btn primary" href="${esc(installUrl)}" target="_blank" rel="noopener noreferrer">Instalar extensão</a>` : '<button class="btn primary" type="button" disabled>Link de instalação em preparação</button>'}<button id="closeSiapAssistant" class="btn secondary" type="button">Voltar</button></div>
        ${installUrl ? '' : '<div class="siap-integration-note">A interface está pronta. O botão de instalação será ativado quando a extensão possuir um endereço oficial de distribuição.</div>'}`);
      document.getElementById('closeSiapAssistant').onclick = closeModal;
    };
    if (attendance) attendance.onclick = () => {
      openModal('Frequência SIAP', className, `
        <section class="siap-brand-card"><div class="siap-brand-mark">%</div><div><h4>Importação assistida de frequência</h4><p>Estrutura preparada para receber uma prévia do SIAP e calcular indicadores desta turma após conferência.</p></div></section>
        <ol class="siap-preview-steps"><li>A extensão lê somente a frequência autorizada na sessão já aberta do SIAP.</li><li>O professor confere período, turma e correspondência por matrícula.</li><li>O Carômetro mostra a prévia sem gravar.</li><li>A confirmação da importação será uma etapa separada e auditável.</li></ol>
        <div class="siap-feature-grid"><div class="siap-feature"><strong>Indicadores previstos</strong><span>Presença, faltas, infrequência e estudante sem comparecimento.</span></div><div class="siap-feature"><strong>Situação escolar</strong><span>Transferência somente quando o SIAP fornecer esse estado de forma verificável.</span></div></div>
        <div class="siap-integration-note">Nesta etapa nenhum dado de frequência é lido, transmitido ou armazenado. O conector com a extensão e as regras de classificação ainda serão homologados.</div>
        <div class="siap-integration-actions"><button class="btn primary" type="button" disabled>Conectar ao SIAP — próxima etapa</button><button id="closeSiapAttendance" class="btn secondary" type="button">Voltar</button></div>`);
      document.getElementById('closeSiapAttendance').onclick = closeModal;
    };
  };
});
