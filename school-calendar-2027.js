document.addEventListener('DOMContentLoaded', () => {
  const data = window.CAROMETRO_SCHOOL_CALENDAR_2027;
  const nav = document.querySelector('#app .side .nav');
  if (!data || !nav) return;

  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const weekdays = ['D','S','T','Q','Q','S','S'];
  const schoolDays = new Set(data.underlinedSchoolDays);
  const holidays = {
    '01-01':'Ano Novo','02-09':'Carnaval','03-26':'Sexta-feira Santa','03-28':'Páscoa',
    '04-21':'Tiradentes','05-01':'Dia do Trabalho','05-27':'Corpus Christi',
    '09-07':'Independência do Brasil','10-12':'Nossa Senhora Aparecida',
    '10-28':'Dia do Servidor Público','11-02':'Finados',
    '11-15':'Proclamação da República','11-20':'Dia Nacional de Zumbi e da Consciência Negra',
    '12-25':'Natal'
  };
  // O PDF repete amarelo para quatro avaliações e roxo para dois marcos das aulas.
  // Datas amarelas ficam agrupadas; os dois marcos roxos são identificáveis pela posição no ano.
  const categories = {
    '#ff0000':['Feriado','#ff0000'], '#93cddd':['Férias','#93cddd'],
    '#c5605d':['Conselho de Classe / Encerramento do Bimestre','#c5605d'],
    '#99ff66':['Dia e Semana Nacional de Trânsito nas Escolas','#99ff66'],
    '#ffcc00':['Avaliação (modalidade não diferenciada no PDF)','#ffcc00'],
    '#92d050':['Recesso escolar','#92d050'], '#bfbfbf':['Trabalho Coletivo','#bfbfbf'],
    '#ff9900':['Culminância Eletiva','#ff9900'],
    '#004374':['Término das aulas / Conselho de Classe','#004374'],
    '#60497b':['Início ou retorno das aulas','#60497b'],
    '#cc00ff':['Comemoração do Dia do Professor','#cc00ff'],
    '#9999cc':['Dia Nacional de Segurança e de Saúde nas Escolas','#9999cc'],
    '#9966cc':['Comemoração à Lei Maria da Penha','#9966cc'],
    '#0000ff':['Dia do Estudante','#0000ff'],
    '#ff6600':['Dia Estadual da Família na Escola','#ff6600'],
    '#ccffff':['Dia Estadual da Paz na Escola','#ccffff'],
    '#ffcc99':['Blocos de Avaliações','#ffcc99'],
    '#a3a3a3':['Início do Ano Letivo e Trabalho Coletivo','#a3a3a3'],
    '#00ccff':['Dia do Estudante de Atitude','#00ccff']
  };
  const special = {
    '2027-01-19':'Início das aulas e acolhimento dos estudantes',
    '2027-08-03':'Retorno das aulas'
  };
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const labelFor = date => {
    const color = data.sourceColors[date];
    const name = date.slice(5);
    if (holidays[name]) return `Feriado: ${holidays[name]}`;
    if (special[date]) return special[date];
    if (color) return categories[color]?.[0] || 'Evento do calendário escolar';
    return schoolDays.has(date) ? 'Dia letivo' : 'Sem indicação no calendário';
  };

  const opener = document.createElement('button');
  opener.id = 'schoolCalendar2027Nav';
  opener.type = 'button';
  opener.textContent = 'Calendário Escolar';
  nav.insertBefore(opener, document.getElementById('reportsNav') || document.getElementById('permissionsNav'));

  const modal = document.createElement('div');
  modal.id = 'schoolCalendar2027Modal';
  modal.className = 'modal-bg school-calendar-2027-modal hidden';
  modal.innerHTML = `<section class="modal school-calendar-2027-dialog" role="dialog" aria-modal="true" aria-labelledby="schoolCalendar2027Title">
    <header class="school-calendar-2027-head"><div><span class="school-calendar-2027-eyebrow">CARÔMETRO · REDE ESTADUAL DE GOIÁS</span><h2 id="schoolCalendar2027Title">Calendário Escolar 2027</h2><p>Consulte as datas e passe o mouse ou toque em um dia para ver seu significado.</p></div><button type="button" class="school-calendar-2027-close" aria-label="Fechar calendário">×</button></header>
    <div class="school-calendar-2027-scroll"><div class="school-calendar-2027-summary"><div><strong>202</strong><span>dias letivos</span></div><div><strong>110</strong><span>1º semestre</span></div><div><strong>92</strong><span>2º semestre</span></div><p><b>Calendário em desenvolvimento.</b> Os dados refletem o PDF do SIAP gerado em 03/11/2026 e podem mudar.</p></div>
    <div class="school-calendar-2027-selected" role="status">Selecione uma data para ver os detalhes.</div>
    <div class="school-calendar-2027-grid"></div>
    <details class="school-calendar-2027-legend"><summary>Legenda das cores <span>Ver todas as situações</span></summary><div class="school-calendar-2027-legend-grid"></div><p>O documento usa a mesma cor amarela para avaliação externa, diagnóstica, formativa e fluência leitora. A modalidade de cada data não está identificada pelas cores.</p></details>
    </div></section>`;
  document.body.append(modal);
  const grid = modal.querySelector('.school-calendar-2027-grid');
  for (let month = 0; month < 12; month++) {
    const yearMonth = String(month + 1).padStart(2, '0');
    const offset = new Date(data.year, month, 1).getDay();
    const length = new Date(data.year, month + 1, 0).getDate();
    let cells = weekdays.map(day => `<span class="school-calendar-2027-weekday">${day}</span>`).join('');
    cells += '<span class="school-calendar-2027-empty"></span>'.repeat(offset);
    for (let day = 1; day <= length; day++) {
      const date = `${data.year}-${yearMonth}-${String(day).padStart(2, '0')}`;
      const color = data.sourceColors[date];
      const label = labelFor(date);
      const dayType = color ? ' event' : schoolDays.has(date) ? ' school-day' : '';
      cells += `<button type="button" class="school-calendar-2027-day${dayType}" data-date="${date}" data-tip="${escapeHtml(label)}" aria-label="${day} de ${monthNames[month]}: ${escapeHtml(label)}" style="${color ? `--source-color:${color}` : ''}">${day}</button>`;
    }
    grid.insertAdjacentHTML('beforeend', `<section class="school-calendar-2027-month"><div class="school-calendar-2027-month-head"><h3>${monthNames[month]}</h3><span>${data.schoolDaysByMonth[month]} dias letivos</span></div><div class="school-calendar-2027-days">${cells}</div></section>`);
  }
  const legend = modal.querySelector('.school-calendar-2027-legend-grid');
  legend.innerHTML = Object.values(categories).map(([label,color]) => `<div><i style="--source-color:${color}"></i><span>${escapeHtml(label)}</span></div>`).join('') + '<div><i class="school-calendar-2027-plain"></i><span>Dia letivo: número sublinhado</span></div><div><i class="school-calendar-2027-plain"></i><span>Evento não informado: sem indicação</span></div>';

  const close = () => modal.classList.add('hidden');
  opener.addEventListener('click', () => {
    modal.classList.remove('hidden');
    modal.querySelector('.school-calendar-2027-close').focus();
  });
  modal.querySelector('.school-calendar-2027-close').addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) { close(); return; }
    const day = event.target.closest('.school-calendar-2027-day');
    if (!day) return;
    modal.querySelector('.school-calendar-2027-day[aria-pressed="true"]')?.removeAttribute('aria-pressed');
    day.setAttribute('aria-pressed', 'true');
    const [year,month,date] = day.dataset.date.split('-');
    modal.querySelector('.school-calendar-2027-selected').textContent = `${date}/${month}/${year} · ${labelFor(day.dataset.date)}`;
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
});
