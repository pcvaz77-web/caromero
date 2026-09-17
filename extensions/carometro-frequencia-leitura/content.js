(() => {
  'use strict';

  // Muda a cada documento realmente carregado pelo navegador. Isso permite ao
  // service worker distinguir a nova página do estado intermediário em que um
  // <select> já mudou, mas o calendário ainda pertence ao mês anterior.
  globalThis.__carometroDocumentPageToken ||= `${performance.timeOrigin}:${crypto.randomUUID()}`;
  const PAGE_TOKEN = globalThis.__carometroDocumentPageToken;

  const FREQUENCY_PATH = '/FrequenciaAlunoEdicao.aspx';
  const DIARY_PATH = '/DiarioEscolarListagem.aspx';
  const SCHOOL_DAILY_PATH = '/FrequenciaDiaria.aspx';
  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
  const byId = id => document.getElementById(id);
  const fieldValue = id => normalize(byId(id)?.value);
  const isFrequencyPage = () => location.pathname.toLowerCase() === FREQUENCY_PATH.toLowerCase();
  const isDiaryPage = () => location.pathname.toLowerCase() === DIARY_PATH.toLowerCase();
  const isSchoolDailyPage = () => location.pathname.toLowerCase() === SCHOOL_DAILY_PATH.toLowerCase();

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

  // Leitor isolado da Frequência Diária usada pela Secretaria. Ele compartilha
  // apenas a ponte da extensão; os seletores e a navegação do Diário do
  // Professor acima permanecem independentes.
  const cleanStudentName = value => normalize(value)
    .replace(/^\d+\s*(?:[.\-)–—:]\s*)?/, '')
    .replace(/\s*(?:[.\-(–—:]\s*)?\d+\s*\)?$/, '')
    .trim();

  const normalizedStudentName = value => cleanStudentName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const detailValue = label => {
    const title = [...document.querySelectorAll('.tituloDetalhes')]
      .find(item => normalizedComparable(item.textContent) === normalizedComparable(label));
    return normalize(title?.parentElement?.querySelector('.conteudoDetalhes')?.textContent);
  };

  const selectedSchoolDailyDate = () => normalize(byId('h3TituloFuncionalidade')?.textContent).match(/\b\d{2}\/\d{2}\/\d{4}\b/)?.[0] || '';

  function schoolDailyClassStatus(card) {
    if (card.classList.contains('dentroPrazo')) return 'filled_on_time';
    if (card.classList.contains('foraPrazo')) return 'filled_late';
    if (card.classList.contains('diaNaoLetivo')) return 'non_school_day';
    if (card.classList.contains('existeExcecao')) return 'exception';
    return 'not_filled';
  }

  function schoolDailyClasses() {
    return [...document.querySelectorAll('.containerTurmaTurno')].flatMap(container => {
      const shift = normalize(container.querySelector('.tituloTurno')?.textContent);
      return [...container.querySelectorAll('.listaTurmas[data-codigoturma]')].map(card => {
        const text = normalize(card.textContent);
        const match = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
        return {
          code:normalize(card.dataset.codigoturma),
          className:normalize(match?.[1] || text),
          compositionCode:normalize(match?.[2]),
          shift,
          status:schoolDailyClassStatus(card)
        };
      });
    });
  }

  function schoolDailyContext() {
    if (!document.querySelector('.listaDeAlunos .item[data-matricula]')) return null;
    const composition = detailValue('Composição');
    const grade = detailValue('Série');
    const className = detailValue('Turma');
    const compositionCode = composition.match(/^\s*(\d+)/)?.[1] || '';
    const cards = schoolDailyClasses();
    const card = cards.find(item =>
      normalizedComparable(item.className) === normalizedComparable(className) &&
      (!compositionCode || item.compositionCode === compositionCode)
    );
    const periodText = normalize(document.querySelector('#FormularioPrincipal')?.textContent);
    const period = periodText.match(/Ano base\/Semestre:\s*(\d{4})\s*\/\s*([12])/i);
    const selectedDate = selectedSchoolDailyDate();
    return {
      year:period?.[1] || selectedDate.slice(-4),
      term:period?.[2] ? `${period[2]}º semestre` : '',
      composition,
      compositionCode,
      grade,
      className,
      shift:card?.shift || '',
      classCode:card?.code || '',
      classStatus:card?.status || '',
      subject:'Frequência diária da escola'
    };
  }

  function schoolDailyEntries() {
    const namesByRegistration = new Map(
      [...document.querySelectorAll('.listaDeAlunos .item[data-matricula]')]
        .map(item => {
          const registration = normalize(item.dataset.matricula);
          const name = cleanStudentName(item.dataset.nome || item.querySelector('.aluno')?.textContent || item.textContent);
          return [registration, name];
        })
        .filter(([registration, name]) => registration && normalizedStudentName(name))
    );
    const normalizedNameCounts = new Map();
    namesByRegistration.forEach(name => {
      const key = normalizedStudentName(name);
      normalizedNameCounts.set(key, (normalizedNameCounts.get(key) || 0) + 1);
    });
    const date = selectedSchoolDailyDate();
    const entries = [];
    document.querySelectorAll('.listaDeFrequencias .item[data-matricula]').forEach(item => {
      const name = namesByRegistration.get(normalize(item.dataset.matricula));
      if (!name) return;
      entries.push({
        date,
        name,
        absent:String(item.dataset.ausente).toLowerCase() === 'true',
        blocked:String(item.dataset.bloqueado).toLowerCase() === 'true',
        situation:normalize(item.dataset.situacao),
        duplicateName:normalizedNameCounts.get(normalizedStudentName(name)) > 1
      });
    });
    return entries;
  }

  globalThis.__carometroSchoolDailyNormalizeName = normalizedStudentName;

  globalThis.__carometroSchoolDailySnapshot = () => {
    if (!isSchoolDailyPage()) throw new Error('Abra no SIAP a página Frequência diária.');
    return {
      pageToken:PAGE_TOKEN,
      selectedDate:selectedSchoolDailyDate(),
      classes:schoolDailyClasses(),
      context:schoolDailyContext(),
      entries:schoolDailyEntries()
    };
  };

  globalThis.__carometroSchoolDailySelectDate = date => {
    if (!isSchoolDailyPage()) throw new Error('Abra no SIAP a página Frequência diária.');
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(date || ''))) throw new Error('Data inválida para leitura.');
    const control = byId('controleData') || byId('controleDataPreSelecao');
    if (!control) throw new Error('O controle de data do SIAP não foi encontrado.');
    control.setAttribute('onclick', `__doPostBack('ctl00$cphFuncionalidade$ControleFrequencia','${date}')`);
    control.click();
    return true;
  };

  globalThis.__carometroSchoolDailyOpenClass = classCode => {
    if (!isSchoolDailyPage()) throw new Error('Abra no SIAP a página Frequência diária.');
    const code = normalize(classCode);
    if (!/^\d+$/.test(code)) throw new Error('Código de turma inválido.');
    const card = [...document.querySelectorAll('.listaTurmas[data-codigoturma]')]
      .find(item => normalize(item.dataset.codigoturma) === code);
    if (!card) throw new Error('A turma escolhida não apareceu nesta data.');
    const status = schoolDailyClassStatus(card);
    if (!['filled_on_time', 'filled_late'].includes(status)) throw new Error('A frequência desta turma não está preenchida nesta data.');
    card.click();
    return true;
  };
})();
