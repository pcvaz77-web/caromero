# Portal da Família — preparação de implantação

## Escopo implementado no código local

- O administrador ou coordenador da escola seleciona um responsável e **somente os filhos conferidos pela escola**. Um QR Code de convite presencial vale 15 minutos e pode ser aceito uma vez. O QR do convite não vai na carteirinha.
- O responsável abre `familia.html` no celular, informa o número autorizado, confere os nomes e turmas dos filhos previamente selecionados pela escola, cria senha e vê apenas esses vínculos. Ocorrências internas não aparecem automaticamente; a escola escolhe e redige o que publicar.
- A escola seleciona uma turma e gera carteirinhas com dados já existentes no Carômetro. São oito por folha A4, com frente e verso espelhado para impressão em borda longa. O QR do verso contém um token aleatório e **não contém nome, turma ou telefone**.
- O coordenador ou administrador lê a carteirinha pela câmera, confere nome e foto, registra a hora de entrada e pode publicar um aviso no histórico do Portal da Família. Leituras repetidas em cinco minutos reutilizam o registro.
- O registro de entrada e a publicação são ações separadas. **Publicar no portal não envia uma notificação push ao aparelho**; o responsável vê o aviso quando abre o portal. Push exige implementação e teste próprios antes de prometer alerta imediato.
- A integração paga de WhatsApp não faz parte desta etapa. O convite foi pensado para atendimento presencial na escola.

## Arquivos e dependências

- `supabase/migrations/151_family_portal_foundation.sql`: estrutura de vínculos, mensagens e recibos. Em 2026-10-09 foi confirmado por consulta somente leitura no projeto comercial que `family_links`, `family_school_manager(uuid)` e o registro da versão 151 existem.
- `supabase/migrations/167_family_cards_and_entry.sql`: convite para vários filhos definidos pela escola, permissão de coordenador, carteirinhas, entradas e avisos de entrada. Instalar a função não cria convites, carteirinhas, entradas nem mensagens.
- `supabase/functions/family-activate/index.ts`: primeiro acesso com celular e senha. O painel comercial mostrou o provedor Phone desativado; por isso a função cria uma conta Auth com um identificador técnico de e-mail derivado do celular, confirmado pelo servidor. A família não informa nem recebe e-mail. Nenhuma configuração global de Auth ou provedor SMS foi alterada.
- `family-school.js`, `family-gate.js`, `family-card-print.js`, `vendor/jsQR.js`, `familia.html`, `familia.css`, `familia.js`, `familia.webmanifest` e `sw.js`: interfaces e leitura. A licença do leitor está em `vendor/jsQR-LICENSE.txt`.

## Segurança e operação

- A escola deve conferir presencialmente a identidade do responsável antes de mostrar o QR e selecionar os filhos. O número digitado **não recebe uma prova independente por SMS** nesta etapa. Um QR fotografado por terceiros durante os 15 minutos pode ser usado indevidamente; não o compartilhe nem o coloque na carteirinha. A conta técnica usa o domínio da plataforma só como identificador interno; não é uma caixa postal.
- O QR da carteirinha é um identificador revogável, não é uma autenticação do aluno. A equipe deve conferir foto e nome antes de confirmar a entrada. Em caso de perda, a equipe seleciona o aluno em “Substituir QR da carteirinha”, revoga o cartão anterior e imprime a nova versão.
- Dados de escolas e estudantes são consultados por `school_id` nas funções. Tabelas de família e de entradas não têm leitura direta para familiares ou usuários comuns; o acesso ocorre por RPC com verificação de papel ou vínculo.
- O nome e o telefone do responsável foram incluídos na frente da carteirinha conforme o pedido. Conferir com a escola a necessidade de expor o telefone em um cartão que pode ser perdido antes da impressão real.
- A página familiar não guarda o URL do convite no cache do service worker.

## Antes de disponibilizar para famílias

1. A versão 151 e as colunas de alunos/turmas usadas por 167 foram verificadas no Supabase comercial por consultas somente leitura em 2026-10-09.
2. O SQL exato da versão 167 foi apresentado e autorizado separadamente. Em 2026-10-09, foi executado no editor SQL do projeto `ppkndfwmqdmomkjoemre` e retornou `Success. No rows returned`. A versão 167 foi registrada em `supabase_migrations.schema_migrations` e o registro também retornou sucesso.
3. A consulta posterior confirmou `registered=1`, as tabelas `family_student_cards` e `family_student_entries` e as funções novas presentes, RLS ativo em ambas as tabelas, `cards=0`, `entries=0` e `links=0`. Implantar `family-activate` somente após autorização de publicação própria.
4. Testar com escola, responsável e alunos **descartáveis**: convite presencial com um e com vários filhos, telefone incorreto, convite vencido, revogação, foto, impressão de oito cartões, câmera, registro duplicado, escola errada e aviso publicado. Remover os dados descartáveis ao final conforme plano de reversão.
5. Só então publicar o frontend, com autorizações de commit, push e deploy cabíveis. Não anunciar notificação automática no celular enquanto push não estiver implementado.

Em 2026-10-09, a primeira tentativa de transferir o arquivo local ao editor foi bloqueada pelo navegador. O usuário então colou o SQL no editor. Antes da execução, a cópia foi comparada ao arquivo local: SHA-256 `E666E81C53ED517E0525E9C9C7FBCCB4F6AF3EA2E798456D7E1CDFBB406D672E`, após normalizar quebras de linha e a ausência da quebra final. Uma consulta antiga que antecedia o SQL colado foi removida. A confirmação de execução e registro foi recebida no momento da ação. A migração foi aplicada e verificada conforme os itens acima.

## Estado anterior à migração 167 e reversão

Consulta somente leitura de 2026-10-09 no projeto comercial `ppkndfwmqdmomkjoemre`: `family_links=0`, `family_messages=0`, `family_receipts=0`, `family_audit=0`, `family_deliveries=0`, tabela `family_student_cards` ausente, versão 167 ausente. Hashes MD5 das definições existentes: `family_school_manager=0db648ebd3f6b204f894e97792b4af9b`, `family_accept_invitation=b6ab4a8b637fab3a20f83921d2413165`, `family_my_students=07803d628d47d6f440f4e9e884945694`, `family_feed=e5c82e3b70e79131ed4eb5ea938a13f6`, `family_record_receipt=53e0c91e9f9e922b834ef26696b75344`. As definições originais estão em `151_family_portal_foundation.sql`.

Se a instalação de 167 falhar, o `BEGIN/COMMIT` deixa o banco no estado anterior. Se for preciso revertê-la **antes de qualquer uso**, conferir primeiro que não foram criados vínculos, cartões, entradas ou mensagens; restaurar as cinco funções originais de 151 com `CREATE OR REPLACE`; remover as funções novas de 167; remover `family_messages.entry_event_id`, as tabelas `family_student_entries` e `family_student_cards`, `family_links.invitation_batch_id`; restaurar o check original de categorias e retirar o registro 167 do histórico de migrações. Reconsultar os cinco hashes, os contadores e a ausência das tabelas/colunas novas em uma única comparação. Após uso real, não apagar cartões ou entradas para reverter: preservar os registros e planejar uma migração corretiva específica.
