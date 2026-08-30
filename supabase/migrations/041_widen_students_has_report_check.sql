-- CARÔMETRO COMERCIAL
-- Amplia o limite de tamanho da constraint legada students_has_report_check.
--
-- Causa raiz (diagnosticada em auditoria somente-leitura, comprovada com
-- os labels reais da Escola teste 1): has_report guarda um array JSON com
-- o texto completo de cada observação marcada
-- (student-edit-improvements.js: encodeObservationValues == JSON.stringify
-- dos valores selecionados). O limite de 80 caracteres é herdado do
-- desenho original da coluna, de quando ela guardava um único valor curto
-- e fixo (Sim/Não/Laudo/Dificuldade leve/grave — ver normalizeObservation
-- no mesmo arquivo). A funcionalidade de observações múltiplas,
-- customizáveis por escola via observation_options (migration 014), foi
-- construída depois, reaproveitando a mesma coluna sem revisar essa
-- constraint. Não há relação com quantidade de observações nem com laudo
-- especificamente — é puramente o comprimento total do JSON resultante
-- (comprovado: duas combinações de 4 itens deram 74 e 90 caracteres,
-- dependendo só de quais labels entram).
--
-- Esta migration só amplia o número — não altera o modelo de dados
-- (continua texto/JSON na mesma coluna), não cria tabela nova, não altera
-- nenhuma outra constraint/trigger/coluna, e não toca em nenhum registro
-- existente. Confirmado antes de escrever: nenhum dos 1.337 alunos em
-- todas as escolas do Comercial tem has_report acima de 2000 caracteres
-- (o maior valor real hoje é 74) — a mudança é puramente aditiva.

begin;

alter table public.students
  drop constraint students_has_report_check;

alter table public.students
  add constraint students_has_report_check
  check ((has_report is null) or (char_length(has_report) <= 2000));

commit;
