(() => {
  'use strict';

  // Muda a cada documento realmente carregado pelo navegador. Isso permite ao
  // service worker distinguir a nova página do estado intermediário em que um
  // <select> já mudou, mas o calendário ainda pertence ao mês anterior.
  globalThis.__carometroDocumentPageToken ||= `${performance.timeOrigin}:${crypto.randomUUID()}`;
  const PAGE_TOKEN = globalThis.__carometroDocumentPageToken;

  const FREQUENCY_PATH = '/FrequenciaAlunoEdicao.aspx';
  const DIARY_PATH = '/DiarioEscolarListagem.aspx';
  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const byId = id => document.getElementById(id);
  const fieldValue = id => normalize(byId(id)?.value);
  const isFrequencyPage = () => location.pathname.toLowerCase() === FREQUENCY_PATH.toLowerCase();
  const isDiaryPage = () => location.pathname.toLowerCase() === DIARY_PATH.toLowerCase();

  function readContext() {
    return {
      year: fieldValue('cphFuncionalidade_cphCampos_txtAnoLetivo'),
      composition: fieldValue('cphFuncionalidade_cphCampos_txtComposicao'),
      subject: fieldValue('cphFuncionalidade_cphCampos_txtDisciplina'),
      grade: fieldValue('cphFuncionalidade_cphCampos_txtSerie'),
      shift: fieldValue('cphFuncionalidade_cphCampos_txtTurno'),
      className: fieldValue('cphFuncionalidade_cphCampos_txtTurma'),
      term: fieldValue('cphFuncionalidade_cphCampos_txtBimestre')
    };
  }

  const normalizedComparable = value => normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function contextMatches(request, context) {
    const fields = ['className', 'shift', 'subject', 'term'];
    return fields.every(field => !request[field] || normalizedComparable(context[field]).includes(normalizedComparable(request[field])));
  }

  function selectByText(id, wanted) {
    const select = byId(id);
    if (!select) throw new Error(`Filtro não encontrado: ${id}`);
    const expected = normalizedComparable(wanted);
    const option = [...select.options].find(item => {
      const label = normalizedComparable(item.textContent);
      return label === expected || label.includes(expected) || expected.includes(label);
    });
    if (!option) throw new Error(`O SIAP não ofereceu a opção "${wanted}".`);
    select.value = option.value;
    return normalize(option.textContent);
  }

  function selectedMonth(select) {
    return normalize(select?.selectedOptions?.[0]?.textContent || select?.value);
  }

  function isSavedAttendanceCell(cell) {
    return cell?.classList.contains('dialog') &&
      cell.classList.contains('letivo') &&
      normalizedComparable(cell.getAttribute('data-executado')) === 'true' &&
      normalizedComparable(cell.getAttribute('data-lancamento-frequencia')) === 'true';
  }

  function selectMonthOption(select, month) {
    const expected = normalizedComparable(month);
    const index = [...select.options].findIndex(option => normalizedComparable(option.textContent) === expected);
    if (index < 0) throw new Error(`O SIAP não ofereceu o mês "${month}".`);
    // As opções do SIAP não possuem atributo value e seu valor real inclui
    // a indentação do HTML. selectedIndex preserva esse valor e dispara o
    // controlador nativo do calendário; atribuir "Agosto" a value não o faz.
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change', { bubbles:true }));
  }

  function diaryRows() {
    return [...document.querySelectorAll('#cphFuncionalidade_gdvListagem tr')].slice(1).map((row, index) => {
      const cells = [...row.cells].map(cell => normalize(cell.textContent));
      return {
        index,
        year:cells[0] || '',
        term:cells[2] || '',
        composition:cells[3] || '',
        grade:cells[4] || '',
        shift:cells[5] || '',
        subject:cells[6] || '',
        className:cells[7] || '',
        selected:/background-color\s*:\s*(?:#ffff99|rgb\(255,\s*255,\s*153\))/i.test(row.getAttribute('style') || '')
      };
    });
  }

  globalThis.__carometroDiarySnapshot = () => {
    if (!isDiaryPage()) throw new Error('O SIAP não está no Diário do Professor.');
    const optionTexts = id => [...(byId(id)?.options || [])].map(option => normalize(option.textContent));
    return {
      pageToken:PAGE_TOKEN,
      composition:normalize(byId('cphFuncionalidade_cphCampos_ddlComposicao')?.selectedOptions?.[0]?.textContent),
      grade:normalize(byId('cphFuncionalidade_cphCampos_ddlSerie')?.selectedOptions?.[0]?.textContent),
      term:normalize(byId('cphFuncionalidade_cphCampos_ddlBimestre')?.selectedOptions?.[0]?.textContent),
      shift:normalize(byId('cphFuncionalidade_cphCampos_ddlTurno')?.selectedOptions?.[0]?.textContent),
      subject:normalize(byId('cphFuncionalidade_cphCampos_ddlDisciplina')?.selectedOptions?.[0]?.textContent),
      compositions:optionTexts('cphFuncionalidade_cphCampos_ddlComposicao'),
      grades:optionTexts('cphFuncionalidade_cphCampos_ddlSerie'),
      rows:diaryRows()
    };
  };

  globalThis.__carometroSelectComposition = composition => {
    if (!isDiaryPage()) throw new Error('O SIAP não está no Diário do Professor.');
    const chosen = selectByText('cphFuncionalidade_cphCampos_ddlComposicao', composition);
    byId('cphFuncionalidade_cphCampos_ddlComposicao').dispatchEvent(new Event('change', { bubbles:true }));
    return chosen;
  };

  globalThis.__carometroListDiary = request => {
    if (!isDiaryPage()) throw new Error('O SIAP não está no Diário do Professor.');
    selectByText('cphFuncionalidade_cphCampos_ddlSerie', request.grade);
    selectByText('cphFuncionalidade_cphCampos_ddlBimestre', request.term);
    selectByText('cphFuncionalidade_cphCampos_ddlTurno', request.shift);
    selectByText('cphFuncionalidade_cphCampos_ddlDisciplina', request.subject);
    byId('cphFuncionalidade_btnListar').click();
    return true;
  };

  globalThis.__carometroSelectDiaryRow = className => {
    const expected = normalizedComparable(className);
    const rows = diaryRows();
    const match = rows.find(row => normalizedComparable(row.className) === expected);
    if (!match) throw new Error(`A turma "${className}" não apareceu na listagem do SIAP.`);
    document.querySelectorAll('#cphFuncionalidade_gdvListagem tr')[match.index + 1].click();
    return true;
  };

  globalThis.__carometroOpenFrequency = () => {
    if (!diaryRows().some(row => row.selected)) throw new Error('O SIAP não confirmou a seleção da turma.');
    byId('cphFuncionalidade_btnAuxiliar2').click();
    return true;
  };

  function readVisibleAttendance(target) {
    const studentNames = new Map(
      [...document.querySelectorAll('.listaDeAlunos .item[data-matricula], .listaAlunos .item[data-matricula]')]
        .map(item => [normalize(item.dataset.matricula), normalize(item.dataset.nome || item.textContent).replace(/^\d+\.\s*/, '')])
        .filter(([registration]) => registration)
    );
    document.querySelectorAll('.listaDeFrequencias').forEach(list => {
      const date = normalize(list.dataset.data);
      const lesson = normalize(list.dataset.numeroaula) || '1';
      list.querySelectorAll('.item[data-matricula]').forEach(item => {
        const registration = normalize(item.dataset.matricula);
        if (!registration) return;
        const name = studentNames.get(registration) || `Matrícula final ${registration.slice(-4)}`;
        const key = `${date}|${lesson}|${registration}`;
        target.set(key, {
          date, lesson, registration, name,
          absent:String(item.dataset.ausente).toLowerCase() === 'true',
          blocked:String(item.dataset.bloqueado).toLowerCase() === 'true',
          situation:normalize(item.dataset.situacao)
        });
      });
    });
  }

  globalThis.__carometroAttendanceSnapshot = request => {
    if (!isFrequencyPage()) throw new Error('Abra no SIAP a página Frequência da turma escolhida.');
    const context = readContext();
    if (!contextMatches(request || {}, context)) throw new Error('A turma aberta no SIAP não corresponde à seleção do Carômetro.');
    const select = byId('selectMesCalendarioMensal');
    if (!select) throw new Error('O seletor de meses do SIAP não foi encontrado.');
    const calendar = byId('cphFuncionalidade_cphCampos_CalendarioMensal');
    const selectedDate = fieldValue('cphFuncionalidade_cphCampos_txtDataSelecionada');
    const month = selectedMonth(select);
    const registeredDays = [...new Set([...(calendar?.querySelectorAll('td') || [])]
      .filter(isSavedAttendanceCell)
      .map(cell => Number.parseInt(normalize(cell.textContent), 10))
      .filter(day => Number.isInteger(day)))]
      .sort((a, b) => a - b);
    const entries = new Map();
    readVisibleAttendance(entries);
    return {
      pageToken:PAGE_TOKEN,
      context,
      month,
      monthNumber:MONTHS.indexOf(month) + 1,
      registeredDays,
      selectedDate,
      entries:[...entries.values()]
    };
  };

  globalThis.__carometroAttendancePosition = request => {
    if (!isFrequencyPage()) throw new Error('Abra no SIAP a página Frequência da turma escolhida.');
    const context = readContext();
    if (!contextMatches(request || {}, context)) throw new Error('A turma aberta no SIAP não corresponde à seleção do Carômetro.');
    const select = byId('selectMesCalendarioMensal');
    return {
      pageToken:PAGE_TOKEN,
      month:selectedMonth(select),
      selectedDate:fieldValue('cphFuncionalidade_cphCampos_txtDataSelecionada')
    };
  };

  globalThis.__carometroPageToken = () => PAGE_TOKEN;

  globalThis.__carometroSelectMonth = month => {
    if (!MONTHS.includes(month)) throw new Error(`Mês inválido: ${month}`);
    const select = byId('selectMesCalendarioMensal');
    if (!select) throw new Error('O seletor de meses do SIAP não foi encontrado.');
    selectMonthOption(select, month);
    return true;
  };

  globalThis.__carometroSelectRegisteredDay = day => {
    const calendar = byId('cphFuncionalidade_cphCampos_CalendarioMensal');
    const cell = [...(calendar?.querySelectorAll('td') || [])].filter(isSavedAttendanceCell).find(candidate =>
      Number.parseInt(normalize(candidate.textContent), 10) === day
    );
    if (!cell) throw new Error(`A chamada verde do dia ${day} não foi encontrada.`);
    cell.click();
    return true;
  };
})();
