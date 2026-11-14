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
  const formatDate = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'2-digit' }) : '';
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
    const date = document.createElement('small');
    date.textContent = item.meta;
    content.append(date);
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
      const start = row.dataset.startsOn;
      const end = row.dataset.endsOn;
      const startTime = row.dataset.startTime?.slice(0, 5);
      const endTime = row.dataset.endTime?.slice(0, 5);
      const startLabel = `${formatDate(start)}${startTime ? ` às ${startTime}` : ''}`;
      const endLabel = `${formatDate(end)}${endTime ? ` às ${endTime}` : ''}`;
      return {
        key:`notice:${button?.dataset.homeNoticeOpen || title?.textContent}`,
        heading:'Lembrete da semana', title:title?.textContent.replace(/\s*↗\s*$/, '').trim() || '',
        detail:'Aviso da escola', meta:end ? `${startLabel} até ${endLabel}` : startLabel,
        seconds:Math.max(8, Math.min(45, Number(row.dataset.displaySeconds) || 15)),
        open:button ? () => button.click() : null
      };
    });
    const week = document.getElementById('homeOverviewWeekLabel')?.textContent || 'Resumo da semana';
    const rows = [...highlights.querySelectorAll(':scope > div')];
    const system = rows.map((row, index) => {
      const button = row.querySelector('.home-highlight-link');
      const value = button?.textContent || '';
      const occurrence = value.match(/^(.*?)\s*·\s*(\d+ ocorrências?)$/i);
      return {
        key:`system:${index}:${week}`, heading:'Resumo da semana', title:row.querySelector('span')?.textContent || '',
        detail:occurrence ? occurrence[1] : value, secondary:occurrence?.[2] || '', meta:week, seconds:15,
        open:button && !button.disabled ? () => button.click() : null,
        ready:button && !button.disabled || index === rows.length - 1
      };
    }).filter(item => item.ready && item.detail && item.detail !== 'Carregando…');
    const combined = [];
    const count = Math.max(school.length, system.length);
    for (let index = 0; index < count; index++) {
      if (school[index]) combined.push(school[index]);
      if (system[index]) combined.push(system[index]);
    }
    items = combined;
    if (!items.length) items = [{ key:'empty', heading:'Resumo da semana', title:'Informações da escola', detail:'Carregando resumo…', meta:'', seconds:15 }];
    const found = items.findIndex(item => item.key === selected);
    show(found >= 0 ? found : 0);
  }
  function queueRebuild() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; rebuild(); });
  }
  for (const source of [notices, highlights]) new MutationObserver(queueRebuild).observe(source, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['disabled'] });
  document.addEventListener('visibilitychange', next);
  rebuild();
});
