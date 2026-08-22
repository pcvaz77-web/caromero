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
8. **Antes de qualquer escrita no banco de produção — incluindo alteração
   temporária de usuário, papel, permissão ou outro dado real feita para
   fins de teste**: identificar todos os campos direta ou indiretamente
   afetados pela operação (incluindo efeitos de triggers, RPCs e lógica
   de limpeza automática — nunca apenas os campos diretamente testados),
   capturar um snapshot completo desse estado prévio, registrar o estado
   inicial, definir previamente como a mudança será revertida, só então
   executar a alteração autorizada, restaurar ao final, e fazer uma
   única comparação consolidada contra o snapshot para confirmar a
   restauração.

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

## Execução do trabalho — Claude Code principal como executor padrão

27. **O fluxo padrão — investigar → planejar internamente → implementar →
    revisar o próprio diff → executar testes seguros → apresentar
    resultado — é executado diretamente pelo Claude Code principal.**
    Isso vale inclusive para migrations e mudanças de banco: "investigar"
    e "planejar" não exigem, por si só, acionar um subagente.
28. **Não acionar um subagente automaticamente só porque ele existe**,
    nem recriar por hábito a sequência `carometro-auditor` →
    `carometro-arquiteto` → `carometro-implementador` →
    `carometro-revisor` → `carometro-testador`. Esses subagentes são
    segunda opinião especializada, não etapa obrigatória de produção.
    Usar um agente apenas quando houver ganho técnico real por
    complexidade ou risco excepcional — por exemplo: desenho relevante de
    arquitetura multi-escola, migration complexa, alteração estrutural de
    RLS/Auth/permissões, operação potencialmente destrutiva, ou
    diagnóstico realmente incerto em que uma segunda análise
    independente tenha valor real. Mesmo nesses casos, usar somente o
    agente necessário para aquele ponto específico — nunca a cadeia
    inteira por padrão.
29. **Operações somente leitura e testes seguros não são checkpoints de
    autorização.** Agrupe, na mesma rodada, sempre que fizerem parte da
    mesma tarefa: leitura de arquivos, grep/busca, `git status`/`diff`/
    `log`, consultas Supabase somente leitura, inspeção de schema,
    `node --check`, testes locais, navegador (DOM/Console/Network/
    screenshots/viewport), e revisão do próprio diff. Não pare depois de
    cada operação segura individual. Os checkpoints que continuam
    exigindo autorização explícita são exatamente os já definidos neste
    documento: SQL/migration de escrita, operação destrutiva, alteração
    irreversível ou de reversão incerta, mudança temporária não
    autorizada de dado real, alteração crítica de RLS/segurança,
    commit, push, deploy, force push/reset destrutivo, instalação ou
    configuração global de ferramentas, e qualquer decisão real de
    produto que só o usuário possa tomar.

## Navegador e testes automatizados

30. Quando disponível e tecnicamente funcional (ex.:
    `mcp__claude-in-chrome__*`), a automação de navegador integra o fluxo
    normal de teste do Carômetro: alterar código → abrir/reutilizar a
    página local → testar no navegador → inspecionar DOM/Console/Network
    quando necessário → testar viewport (desktop/tablet/mobile) →
    corrigir → repetir os testes afetados → apresentar resultado. Antes
    de pedir ao usuário para abrir F12, rodar comando no Console, tirar
    print, inspecionar elemento, clicar em botão ou trocar viewport,
    verificar primeiro se a automação de navegador disponível consegue
    fazer isso diretamente — nunca presumir ausência de acesso sem
    verificar.
31. **Login continua sendo humano.** Quando um teste exigir uma conta/
    papel específico: abrir ou reutilizar a página adequada, dizer qual
    conta/papel precisa estar autenticado, nunca pedir senha — o usuário
    faz o login manualmente e avisa quando está pronto; a partir daí, a
    automação retoma os testes. Preservar a sessão durante toda a
    bateria sempre que possível; usar contextos/perfis/janelas
    independentes da ferramenta quando isso reduzir trocas repetidas
    entre papéis (Admin/Coordenador/Professor).
32. **Automação de navegador nunca contorna as regras de segurança já
    existentes.** Navegação, leitura de DOM/Console/Network, screenshots,
    viewport e testes sem escrita podem ser feitos diretamente. Qualquer
    ação no navegador que altere dado real relevante (conceder/revogar
    permissão, marcar aluno, etc.) continua sujeita exatamente às mesmas
    regras de autorização que a escrita equivalente feita de qualquer
    outra forma — nunca um atalho para contornar RLS, permissões,
    proteção de produção ou os checkpoints de operação destrutiva já
    definidos neste documento.

## O que isso significa na prática

- As etapas abaixo são realizadas diretamente pelo Claude Code
  principal por padrão (regra 27) — subagentes só entram quando a regra
  28 se aplicar.
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
