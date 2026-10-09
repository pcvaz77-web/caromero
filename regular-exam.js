document.addEventListener('DOMContentLoaded', () => {
  'use strict';
  const nav = document.querySelector('.side .nav');
  const app = document.getElementById('app');
  if (!nav || !app || document.getElementById('regularExamNav')) return;

  const button = document.createElement('button');
  button.id = 'regularExamNav';
  button.type = 'button';
  button.className = 'hidden';
  button.textContent = 'Correção de provas';
  nav.insertBefore(button, document.getElementById('cepiNav') || document.getElementById('permissionsNav'));

  const modal = document.createElement('div');
  modal.id = 'regularExamModal';
  modal.className = 'modal-bg hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'regularExamTitle');
  modal.innerHTML = `<section class="modal regular-exam-dialog">
    <div class="modal-head"><div><span class="regular-exam-kicker">CARÔMETRO</span><h3 id="regularExamTitle">Correção de provas</h3><p class="meta">Provas regulares da escola</p></div><button class="close" type="button" aria-label="Fechar correção de provas" data-regular-exam-close>×</button></div>
    <div class="form regular-exam-body">
      <p>O corretor de provas está incluído no Carômetro. Use a mesma extensão para ler os cartões pelo celular e conferir os resultados antes de lançá-los.</p>
      <ol class="regular-exam-steps">
        <li><strong>Abra a avaliação no SIAP.</strong> Escolha a turma e a disciplina para que a extensão leia a lista de alunos e a quantidade de questões.</li>
        <li><strong>Conecte o celular.</strong> No painel “Correção de Provas” da extensão, gere o QR Code, leia o gabarito oficial e fotografe os cartões dos alunos.</li>
        <li><strong>Confira e lance.</strong> Revise nomes e respostas, envie os resultados e clique em Salvar no próprio SIAP.</li>
      </ol>
      <div class="regular-exam-actions"><button id="regularExamConnect" class="btn primary" type="button">Verificar e conectar extensão</button><button class="btn secondary" type="button" data-regular-exam-close>Fechar</button></div>
      <p id="regularExamStatus" class="regular-exam-status" role="status">Abra a avaliação na guia do SIAP que você já utiliza.</p>
      <p class="meta">As provas de bloco e os cartões do CEPI são corrigidos em Meu CEPI.</p>
    </div>
  </section>`;
  document.body.appendChild(modal);

  const install = document.createElement('a');
  install.id = 'regularExamInstall';
  install.className = 'btn secondary';
  install.href = window.CAROMETRO_RUNTIME_CONFIG?.siapAssistantStoreUrl || 'https://chromewebstore.google.com/detail/fgpjjlikinpcjpmmjehbgbfonnbfibnc';
  install.target = '_blank';
  install.rel = 'noopener noreferrer';
  install.textContent = 'Instalar extensão';
  modal.querySelector('.regular-exam-actions').prepend(install);

  const style = document.createElement('style');
  style.textContent = `#regularExamNav{border:1px solid #5876ae;background:#263c64;color:#fff}#regularExamNav:hover,#regularExamNav:focus{background:#38527e}.regular-exam-dialog{width:min(760px,100%)}.regular-exam-kicker{font-size:11px;font-weight:850;letter-spacing:.12em;color:var(--blue)}.regular-exam-body>p:first-child{margin-top:0;line-height:1.55}.regular-exam-steps{display:grid;gap:10px;padding:0;list-style:none;counter-reset:exam}.regular-exam-steps li{counter-increment:exam;position:relative;padding:14px 14px 14px 54px;border:1px solid #dbe4f3;border-radius:11px;background:#f8faff;line-height:1.5}.regular-exam-steps li::before{content:counter(exam);position:absolute;left:14px;top:14px;width:27px;height:27px;border-radius:9px;background:#e3ecff;color:#315dbb;display:grid;place-items:center;font-weight:850}.regular-exam-actions{display:flex;gap:9px;flex-wrap:wrap;margin:20px 0 12px}#regularExamInstall[hidden]{display:none}.regular-exam-status{padding:12px 14px;border-radius:10px;background:#f2f5fb;color:#344054;font-size:13px;line-height:1.5}.regular-exam-status[data-state=ok]{background:#eaf8f1;color:#08784b}.regular-exam-status[data-state=error]{background:#fff0ed;color:#a3251b}`;
  document.head.appendChild(style);

  const status = modal.querySelector('#regularExamStatus');
  const connect = modal.querySelector('#regularExamConnect');
  const close = () => { modal.classList.add('hidden'); button.focus(); };
  modal.querySelectorAll('[data-regular-exam-close]').forEach(item => { item.onclick = close; });
  modal.onclick = event => { if (event.target === modal) close(); };
  button.onclick = () => { modal.classList.remove('hidden'); connect.focus(); connect.click(); };
  connect.onclick = async () => {
    connect.disabled = true;
    status.dataset.state = '';
    status.textContent = 'Conectando a extensão à sua conta do Carômetro…';
    try {
      const result = await window.connectCarometroCorrectionExtension?.();
      if (!result?.ok) throw new Error('A extensão não respondeu. Confira se está instalada e atualizada neste navegador.');
      if (result.license?.examAccess?.active !== true) throw new Error('A extensão respondeu, mas não confirmou o acesso à correção para esta conta. Confira a conta conectada.');
      install.hidden = true;
      status.dataset.state = 'ok';
      status.textContent = 'Extensão conectada à sua conta. Abra a avaliação na guia do SIAP e use “Correção de Provas” no painel da extensão.';
    } catch (error) {
      install.hidden = false;
      status.dataset.state = 'error';
      status.textContent = `${error.message || 'Não foi possível conectar a extensão.'} Se acabou de instalar, recarregue o Carômetro e clique em “Verificar e conectar extensão”.`;
    } finally {
      connect.disabled = false;
    }
  };
  const sync = () => {
    const visible = !app.classList.contains('hidden') && Boolean(window.getActiveSchoolId?.());
    button.classList.toggle('hidden', !visible);
    if (!visible) modal.classList.add('hidden');
  };
  new MutationObserver(sync).observe(app, { attributes:true, attributeFilter:['class'] });
  document.addEventListener('carometro:school-context-ready', sync);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  sync();
});
