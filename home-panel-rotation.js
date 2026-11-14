document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('#app .home-overview');
  const notices = document.getElementById('homeCommunicationList');
  const reminders = document.getElementById('homeReminderList');
  const highlights = card?.querySelector('.home-overview-highlights');
  if (!card || !notices || !reminders || !highlights) return;

  const heading = card.querySelector('.home-overview-head > span');
  heading.textContent = 'Resumo da semana';
  const subtitle = document.createElement('small');
  subtitle.textContent = 'Avisos da escola e destaques do Carômetro';
  heading.append(subtitle);
  notices.classList.add('home-panel-source');
  reminders.classList.add('home-panel-source');
  highlights.classList.add('home-panel-source');

  const panel = document.createElement('section');
  panel.id = 'homePanelRotation';
  panel.className = 'home-panel-rotation';
  panel.setAttribute('aria-label', 'Avisos e resumo da semana');
  panel.innerHTML = `<div id="homePanelSlide" class="home-panel-slide" aria-live="off"></div>
    <div class="home-panel-progress" aria-hidden="true"><span id="homePanelProgressBar"></span></div>
    <div class="home-panel-controls"><button type="button" id="homePanelPrevious" class="btn secondary" aria-label="Informação anterior">‹</button>
    <button type="button" id="homePanelPause" class="btn secondary" aria-label="Pausar apresentação">Pausar</button>
    <span id="homePanelPosition"></span>
    <button type="button" id="homePanelNext" class="btn secondary" aria-label="Próxima informação">›</button></div>`;
  card.querySelector('.home-overview-head').after(panel);

  const by = id => document.getElementById(id);
  const viewport = by('homePanelSlide');
  const position = by('homePanelPosition');
  const progress = by('homePanelProgressBar');
  let slides = [];
  let active = 0;
  let timer = null;
  let paused = false;
  let scheduled = false;

  function stopTimer() { if (timer) clearTimeout(timer); timer = null; }
  function scheduleNext() {
    stopTimer();
    if (paused || document.hidden || slides.length < 2) return;
    timer = setTimeout(() => show((active + 1) % slides.length), slides[active].seconds * 1000);
  }
  function restartProgress() {
    progress.style.animation = 'none';
    if (slides.length < 2) { progress.style.width = '100%'; return; }
    progress.style.width = '';
    void progress.offsetWidth;
    progress.style.animation = `home-panel-progress ${slides[active].seconds}s linear forwards`;
    progress.style.animationPlayState = paused || document.hidden ? 'paused' : 'running';
  }
  function show(index) {
    if (!slides.length) {
      viewport.textContent = 'Nenhuma informação disponível.';
      position.textContent = '';
      stopTimer();
      return;
    }
    active = (index + slides.length) % slides.length;
    const slide = slides[active];
    const label = document.createElement('span');
    label.className = 'home-panel-category';
    label.textContent = slide.label;
    const content = slide.source.cloneNode(true);
    content.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
    if (content.id) content.removeAttribute('id');
    viewport.replaceChildren(label, content);
    position.textContent = `${active + 1} / ${slides.length}`;
    by('homePanelPrevious').disabled = slides.length < 2;
    by('homePanelNext').disabled = slides.length < 2;
    restartProgress();
    scheduleNext();
  }
  function rebuild() {
    const currentKey = slides[active]?.key;
    const schoolSlides = [...notices.querySelectorAll('.home-communication-row')].map(row => ({
      key:`notice:${row.querySelector('[data-home-notice-open]')?.dataset.homeNoticeOpen}`,
      label:'Aviso da escola', source:row,
      seconds:Math.max(8, Math.min(45, Number(row.dataset.displaySeconds) || 15))
    }));
    const personalSlides = [...reminders.querySelectorAll('.home-reminder')].map(row => ({
      key:`reminder:${row.dataset.reminderId}`, label:'Lembrete da semana', source:row, seconds:15
    }));
    const weekLabel = by('homeOverviewWeekLabel')?.textContent || 'Carômetro · resumo da semana';
    const systemSlides = [...highlights.querySelectorAll(':scope > div')].map((row, index) => ({
      key:`system:${index}:${weekLabel}`, label:weekLabel, source:row, seconds:15
    }));
    const manual = [...schoolSlides, ...personalSlides];
    const next = [];
    manual.forEach((slide, index) => {
      next.push(slide);
      next.push(systemSlides[index % systemSlides.length]);
    });
    if (!manual.length) next.push(...systemSlides);
    else if (manual.length === 1) next.push(systemSlides[1]);
    slides = next.filter(Boolean);
    const same = slides.findIndex(slide => slide.key === currentKey);
    show(same >= 0 ? same : 0);
  }
  function queueRebuild() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; rebuild(); });
  }
  for (const source of [notices, reminders, highlights]) {
    new MutationObserver(queueRebuild).observe(source, { childList:true, subtree:true, characterData:true });
  }
  viewport.onclick = event => {
    const slide = slides[active];
    if (!slide) return;
    const target = event.target.closest('button');
    if (target?.hasAttribute('data-home-notice-delete')) {
      slide.source.querySelector('[data-home-notice-delete]')?.click();
    } else if (target?.hasAttribute('data-reminder-delete')) {
      slide.source.querySelector('[data-reminder-delete]')?.click();
    } else if (target?.hasAttribute('data-home-notice-open') || slide.key.startsWith('notice:')) {
      slide.source.querySelector('[data-home-notice-open]')?.click();
    } else if (slide.key.startsWith('system:')) {
      slide.source.querySelector('.home-highlight-link')?.click();
    }
  };
  by('homePanelPrevious').onclick = () => show(active - 1);
  by('homePanelNext').onclick = () => show(active + 1);
  by('homePanelPause').onclick = () => {
    paused = !paused;
    by('homePanelPause').textContent = paused ? 'Continuar' : 'Pausar';
    by('homePanelPause').setAttribute('aria-label', paused ? 'Continuar apresentação' : 'Pausar apresentação');
    if (paused) progress.style.animationPlayState = 'paused';
    else restartProgress();
    scheduleNext();
  };
  document.addEventListener('visibilitychange', () => { if (slides.length) restartProgress(); scheduleNext(); });
  rebuild();
});
