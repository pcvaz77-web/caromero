# Contrato da integração de frequência SIAP — estrutura inicial

## Estado desta etapa

O Carômetro exibe a entrada da integração apenas para usuários autorizados. Nenhum dado de frequência é lido, enviado ou gravado nesta etapa.

## Autorizações obrigatórias

- O usuário deve possuir vínculo ativo na escola selecionada.
- `can_import_siap_attendance` deve estar habilitada pelo administrador da escola.
- Para a turma selecionada, o usuário também deve ser administrador, coordenador ou conselheiro reconhecido pela regra existente de edição do Painel da Turma.
- A sessão do SIAP é sempre iniciada manualmente pelo professor. O Carômetro e a extensão não recebem login, senha, cookie ou token do SIAP.

## Fluxo previsto para a próxima etapa

1. A extensão lê a tela de frequência já aberta e autenticada no SIAP.
2. Antes de transmitir, apresenta escola, turma, período e quantidade de registros.
3. A correspondência de estudantes usa matrícula. Nome nunca é a chave automática definitiva.
4. O Carômetro recebe uma prévia temporária e aponta registros correspondentes, ausentes ou conflitantes.
5. O professor revisa a prévia. Analisar não grava.
6. Uma confirmação separada autoriza a gravação idempotente por escola, turma, estudante, data e origem.
7. O resultado registra autor, horário e período da importação, sem guardar HTML, credenciais ou dados de sessão do SIAP.

## Indicadores ainda dependentes de decisão pedagógica

- Percentual de presença e faltas pode ser calculado diretamente a partir das aulas válidas do período.
- “Aluno que nunca veio” exige zero presenças dentro do período explicitamente exibido.
- “Faltoso” e “infrequente” precisam de limites oficiais ou configuráveis antes da implementação.
- “Transferido” só pode ser aceito quando o SIAP fornecer um estado explícito e verificável; nunca será inferido apenas por faltas.

## Requisitos de armazenamento futuro

- Todas as linhas deverão possuir `school_id` e políticas RLS por escola.
- A importação deverá ser idempotente e manter a origem e o período de referência.
- O payload deve ser mínimo: identificador de correspondência, situação por data e eventual situação escolar explícita.
- Dados brutos e prévias temporárias devem expirar; logs não devem conter nomes, matrículas completas, cookies, tokens ou HTML.
