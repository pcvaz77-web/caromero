# CLAUDE.md — Carômetro

Este arquivo contém regras permanentes para qualquer trabalho neste
repositório. Elas têm prioridade sobre conveniência, velocidade ou
preferência de estilo. Em caso de dúvida, pare e pergunte antes de agir.

## Contexto do projeto

- **Carômetro**: sistema de gestão escolar (alunos, turmas, ocorrências,
  uniforme, relatórios), com uma arquitetura comercial/multi-escola em
  construção sobre uma base que já está em produção real.
- **Branch de produção**: `production`. O GitHub Pages publica
  automaticamente a partir dela — todo push nessa branch é, na prática,
  um deploy.
- **Banco**: Supabase (projeto `ftigviorsuqucxwxqpua`), Postgres com RLS,
  Supabase Auth, Storage e Edge Functions (`supabase/functions/`).
- **Frontend**: HTML/JS estático (sem build step, sem framework),
  arquivos na raiz do repositório.
- **Migrations**: `supabase/migrations/`, numeradas sequencialmente.

## Regras obrigatórias — produção e dados

1. **Produção nunca pode ser alterada sem autorização explícita do
   usuário.** Isso vale para código, banco, RLS, Auth, Storage,
   permissões, convites e qualquer dado real.
2. **Nenhuma migration pode ser executada automaticamente.** Toda
   migration é primeiro auditada e apresentada (SQL exato + impacto) e só
   é aplicada depois de autorização explícita, separada da autorização de
   escrever o arquivo.
3. **Nunca usar force push.** Push é sempre fast-forward; qualquer
   divergência com o remoto é motivo para parar e reportar, nunca para
   forçar.
4. **Toda mudança precisa preservar o Carômetro atual em produção e o
   trabalho já feito na versão comercial.** Nunca misturar ou regredir um
   pelo outro.
5. **Nunca alterar banco, SQL, RLS, Auth, usuários, escolas ou produção
   fora do escopo estritamente autorizado na tarefa em questão** — mesmo
   que a alteração pareça pequena, correta ou relacionada.
6. **Nunca apagar, recriar, mover, renomear ou modificar dados reais para
   "corrigir" uma inconsistência sem autorização explícita** para essa
   correção específica.
7. **Operações destrutivas ou potencialmente irreversíveis exigem
   autorização específica**, mesmo que outra alteração relacionada já
   tenha sido autorizada antes.
8. **Antes de qualquer escrita no banco de produção**, capturar, quando
   aplicável, um estado prévio suficiente para permitir validação
   posterior e definir como a mudança pode ser revertida.

## Regras obrigatórias — arquitetura multi-escola

9. **Toda funcionalidade que lida com dados de aluno/turma/ocorrência
   precisa respeitar `school_id`.** Nenhuma consulta, RPC ou policy pode
   vazar dados entre escolas.
10. **Uma mesma conta (`auth.users.id`) pode pertencer a várias
    escolas.** Vínculos ficam em `school_members`, um por escola
    (`UNIQUE(school_id, user_id)`) — nunca modelar como se um usuário só
    pudesse ter uma escola.
11. **Convites são individuais**: vinculados a um e-mail específico, uma
    escola específica e um papel específico (`school_invitations`). Nunca
    um convite genérico ou reutilizável.

## Regras obrigatórias — permissões

12. **Nenhuma mudança pode ampliar permissões** além do que já existe e
    foi explicitamente pedido. Em caso de dúvida entre uma versão mais
    permissiva e uma mais restrita, escolher a mais restrita e perguntar.
13. **Um coordenador nunca pode conceder a si mesmo ou a outro membro uma
    permissão superior à sua própria.**
14. **RLS e permissões devem ser revisadas em toda mudança que envolva
    dados** — mesmo quando a mudança parece ser "só" de frontend, se ela
    lê ou grava algo protegido por RLS.

## Fluxo de trabalho obrigatório

15. **Antes de alterar código: auditar.** Ler e entender o comportamento
    atual (código, RLS, dados reais relevantes) antes de propor qualquer
    mudança.
16. **Depois de alterar: testar.** Validação de sintaxe sempre; teste
    funcional real quando praticável, com dados descartáveis claramente
    identificados e limpos ao final — nunca com dados reais de terceiros.
17. **Antes de commit: revisar o diff completo.** Nunca commitar sem
    mostrar exatamente o que está sendo staged.
18. **Antes de push: confirmar branch atual, HEAD exato e ausência de
    divergência com o remoto** (fast-forward limpo) antes de empurrar
    qualquer coisa.
19. **Arquivos não relacionados à tarefa nunca entram em um commit.**
    Sempre `git add` de arquivos nomeados explicitamente — nunca `git add
    -A`/`.`.

## Evidência e honestidade técnica

20. **Nunca afirmar que algo foi testado, validado, executado ou
    confirmado se isso não tiver sido realmente observado.** Diferenciar
    claramente, em qualquer relato: prova por leitura/análise de código
    ou dados (raciocínio, sem execução ao vivo) versus teste funcional
    realmente executado e observado. Quando uma lacuna de teste existir
    (ex.: falta de acesso a algo necessário), registrar essa lacuna
    explicitamente em vez de presumir ou inventar um resultado.

## Agentes e automações

21. **Todos os subagentes, agentes, hooks, scripts, GitHub Actions e
    demais automações deste projeto estão sujeitos integralmente às
    regras deste CLAUDE.md.**
22. **Agentes de auditoria, arquitetura, segurança e revisão devem
    operar em modo somente leitura**, salvo autorização explícita para
    outra ação.
23. **Nenhum agente ou automação pode**: executar migration em produção,
    alterar RLS/Auth/Storage, fazer push para `production`, fazer deploy
    manual, usar force push, ou executar qualquer operação destrutiva —
    sem autorização humana explícita para aquela etapa específica.
24. **Delegar uma tarefa a outro agente não transfere nem amplia
    permissões.**
25. **Um agente não pode interpretar autorização dada a outro agente, ou
    a uma etapa anterior, como autorização para uma etapa posterior.**
    Especificamente:
    - Autorização para **implementar** não significa autorização para
      **commit**.
    - Autorização para **commit** não significa autorização para
      **push**.
    - Autorização para **push** não significa autorização para executar
      **migration** ou qualquer outra alteração no Supabase.
26. **Se um agente encontrar algo importante fora do escopo da tarefa em
    andamento, deve registrar e reportar — nunca corrigir
    automaticamente.**

## O que isso significa na prática

- Migrations: escrever o arquivo → mostrar o SQL exato e o impacto →
  aguardar autorização → aplicar → validar por leitura → só então
  considerar liberado para versionar/commitar.
- Código: auditar → propor a menor mudança suficiente → implementar
  localmente → validar sintaxe/testar → mostrar diff → aguardar
  autorização de commit → confirmar staged exato → commit → aguardar
  autorização de push → confirmar branch/HEAD/divergência → push →
  acompanhar deploy.
- Nunca pular etapas desse fluxo mesmo que o pedido pareça simples ou
  urgente, e nunca presumir que uma autorização cobre uma etapa além da
  que foi explicitamente concedida.
