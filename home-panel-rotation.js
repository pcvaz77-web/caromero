document.addEventListener('DOMContentLoaded', () => {
  const card = document.querySelector('#app .home-overview');
  const notices = document.getElementById('homeCommunicationList');
  const highlights = card?.querySelector('.home-overview-highlights');
  if (!card || !notices || !highlights) return;
  notices.classList.add('home-panel-source');
  highlights.classList.add('home-panel-source');
  document.getElementById('homeReminderList')?.classList.add('home-panel-source');

  const heading = card.querySelector('.home-overview-head > span');
  const slide = document.createElement('div');
  slide.id = 'homePanelSlide';
  slide.className = 'home-reference-slide';
  slide.setAttribute('aria-live', 'polite');
  card.querySelector('.home-overview-head').after(slide);

  let items = [];
  let active = 0;
  let timer;
  let queued = false;
  const stop = () => { clearTimeout(timer); timer = null; };
  function next() {
    stop();
    if (!document.hidden && items.length > 1) timer = setTimeout(() => show((active + 1) % items.length), items[active].seconds * 1000);
  }
  function show(index) {
    if (!items.length) return;
    active = index;
    const item = items[active];
    heading.textContent = item.heading;
    card.classList.toggle('home-overview-notice', item.heading === 'Lembrete da semana');
    const content = document.createElement(item.open ? 'button' : 'div');
    content.className = 'home-reference-slide-content';
    if (item.open) { content.type = 'button'; content.onclick = item.open; }
    const name = document.createElement('strong');
    name.textContent = item.title;
    const detail = document.createElement('span');
    detail.textContent = item.detail;
    if (item.secondary) {
      const secondary = document.createElement('span');
      secondary.className = 'home-reference-slide-secondary';
      secondary.textContent = item.secondary;
      content.append(name, detail, secondary);
    } else content.append(name, detail);
    if (item.meta) {
      const date = document.createElement('small');
      date.textContent = item.meta;
      content.append(date);
    }
    slide.replaceChildren(content);
    slide.classList.remove('home-reference-slide-enter');
    void slide.offsetWidth;
    slide.classList.add('home-reference-slide-enter');
    next();
  }
  function rebuild() {
    const selected = items[active]?.key;
    const school = [...notices.querySelectorAll('.home-communication-row')].map(row => {
      const title = row.querySelector('.home-communication-title');
      const button = row.querySelector('[data-home-notice-open]');
      return {
        key:`notice:${button?.dataset.homeNoticeOpen || title?.textContent}`,
        heading:'Lembrete da semana', title:title?.textContent.replace(/\s*↗\s*$/, '').trim() || '',
        detail:'Aviso da escola', meta:'',
        seconds:Math.max(5, Math.min(45, Number(row.dataset.displaySeconds) || 15)),
        open:button ? () => button.click() : null
      };
    });
    const week = document.getElementById('homeOverviewWeekLabel')?.textContent || 'Resumo da semana';
    const defaultKeys = ['student_occurrences', 'class_occurrences', 'praise_student', 'siap_student_absences', 'school_data'];
    const selectedKeys = new Set(window.carometroHomeSummaryKeys || defaultKeys);
    const rows = [...highlights.querySelectorAll(':scope > div[data-metric-key]')].filter(row => selectedKeys.has(row.dataset.metricKey));
    const automaticSeconds = Math.max(5, Math.min(45, Number(window.carometroHomeSummarySeconds) || 15));
    const system = rows.map((row, index) => {
      const button = row.querySelector('.home-highlight-link');
      const value = button?.textContent || '';
      const occurrence = value.match(/^(.*?)\s*·\s*(\d+ ocorrências?)$/i);
      return {
        key:`system:${index}:${week}`, heading:'Resumo da semana', title:row.querySelector('span')?.textContent || '',
        detail:occurrence ? occurrence[1] : value, secondary:row.dataset.secondary || occurrence?.[2] || '', meta:week, seconds:automaticSeconds,
        open:button && !button.disabled ? () => button.click() : null,
        ready:row.dataset.ready === 'true'
      };
    }).filter(item => item.ready && item.detail && item.detail !== 'Carregando…');
    const combined = [];
    const count = Math.max(school.length, system.length);
    for (let index = 0; index < count; index++) {
      if (school[index]) combined.push(school[index]);
      if (system[index]) combined.push(system[index]);
    }
    items = combined;
    if (!items.length) items = [{ key:'empty', heading:'Resumo da semana', title:'Informações da escola', detail:selectedKeys.size ? (highlights.dataset.loaded === 'true' ? 'Nenhum dado para esta semana.' : 'Carregando resumo…') : 'Nenhuma informação automática selecionada.', meta:'', seconds:automaticSeconds }];
    const found = items.findIndex(item => item.key === selected);
    show(found >= 0 ? found : 0);
  }
  function queueRebuild() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; rebuild(); });
  }
  for (const source of [notices, highlights]) new MutationObserver(queueRebuild).observe(source, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['disabled', 'data-ready', 'data-secondary', 'data-loaded'] });
  document.addEventListener('carometro:home-summary-preferences', queueRebuild);
  document.addEventListener('visibilitychange', next);
  rebuild();
});
