# Carômetro comercial — homologação segura

Este documento descreve a preparação futura de um ambiente separado. Nenhuma
etapa deve ser executada no projeto Supabase atualmente publicado.

## Barreiras obrigatórias

- Usar um projeto Supabase exclusivo para homologação/comercial.
- Confirmar que o `project ref` é diferente de `ftigviorsuqucxwxqpua`.
- Projeto separado já confirmado: `carometro-comercial-dev`, project ref
  `ppkndfwmqdmomkjoemre`, região São Paulo (`sa-east-1`).
- Manter `backendConfigured: false` até o novo projeto estar pronto.
- Fazer backup validado antes de qualquer futura migração de dados reais.
- Não usar os arquivos locais excluídos do escopo da auditoria/produção.

## Etapas

1. Obter uma cópia **somente estrutural** do schema-base atualmente usado pelo
   Carômetro. As tabelas centrais `profiles`, `user_permissions`, `classes`,
   `students`, notificações, assinaturas Push e auditoria de relatórios não são
   todas criadas pelas migrations comerciais deste repositório.
2. Restaurar essa estrutura somente no projeto separado de homologação.
3. Executar `supabase-commercial-homologation-preflight.sql`. Prosseguir apenas
   se todas as dependências forem confirmadas.
4. Aplicar as migrations `001` a `004` e executar
   `supabase-commercial-data-migration-preflight.sql`.
5. **Não executar a `005` obsoleta** e seguir exatamente o lote de migrations
   enumerado em `COMMERCIAL-APPLICATION-MANIFEST.md`. A `006` substitui a
   tentativa da `005` e desativa de modo transacional o gatilho de edição
   enquanto vincula os alunos já existentes. As migrations de dados da Paulo
   Freire (`006`, `008` e `011`) ainda exigem pré-validação contra a cópia de
   homologação antes de avançar. As migrations expressamente excluídas pelo
   manifesto não devem ser aplicadas isoladamente.
6. Aplicar os complementos comerciais nesta ordem:

   1. `supabase-commercial-account-access.sql`
   2. `supabase-commercial-profile-sync.sql`
   3. `supabase-commercial-effective-access.sql`
   4. `supabase-commercial-table-privileges.sql`
   5. `supabase-commercial-platform-rls.sql`
   6. `supabase-commercial-identity-rls.sql`
   7. `supabase-commercial-platform-audit.sql`
   8. `supabase-commercial-legacy-workflow-lockdown.sql`
   9. `supabase-commercial-counselor-rpcs.sql`
   10. `supabase-commercial-uniform-bulk.sql`
   11. `supabase-teacher-demote-permissions-cleanup.sql`
   12. `supabase-school-member-directory.sql`
   13. `supabase-commercial-member-management.sql`
   14. `supabase-school-invitation-preview.sql`
   15. `supabase-subscription-visibility.sql`
   16. `supabase-user-account-actions.sql`
   17. `supabase-occurrence-responsible.sql`
   18. `supabase-occurrence-edit-signature.sql`
   19. `supabase-commercial-auth-deletion-integrity.sql`
   20. `supabase-admin-account-status.sql`
   21. `supabase-platform-school-provisioning.sql`
   22. `supabase-platform-dashboard-optimized.sql`
   23. `supabase-commercial-photo-storage.sql`
   24. `supabase-commercial-reports.sql`
   25. `supabase-push-subscription-claim.sql`
   26. `supabase-student-update-notifications.sql`
   27. `supabase-commercial-notifications-hardening.sql`
   28. `supabase-commercial-function-execution-hardening.sql`

7. Executar `supabase-commercial-post-application-audit.sql` e arquivar o
   resultado da auditoria. Não avançar se faltar objeto, RLS, `search_path`
   protegido ou se qualquer contador de inconsistência for diferente de zero.

8. Publicar as Edge Functions no projeto separado e configurar seus segredos
   com os identificadores desse projeto. Na função `manage-user`, definir
   `ALLOWED_ORIGINS` com uma lista separada por vírgulas contendo somente os
   domínios comerciais/homologação autorizados, sem barra final.
   Instalar Database Webhooks (`pg_net`) e criar
   `send_user_notification_push` para o `INSERT` de
   `public.user_notifications`, usando HTTP POST para `send-web-push` e o
   cabeçalho privado `x-webhook-secret`. Não armazenar o segredo no repositório.
9. Configurar Site URL e Redirect URLs do domínio de homologação, incluindo
   `/accept-invite.html` e `/reset-password.html`.
10. Somente então atualizar `carometro-config.js` com o novo projeto e marcar
   `backendConfigured: true`. Preencher conjuntamente `supabaseProjectRef`,
   `supabaseUrl` e `supabasePublishableKey`; a URL deve pertencer exatamente ao
   `project ref` comercial aprovado.
11. Testar ao menos proprietário, administrador escolar, coordenador e professor
    em duas escolas diferentes, incluindo tentativas cruzadas de acesso.

## Configuração obrigatória de autenticação

- Manter confirmação de e-mail habilitada para novos cadastros.
- Não habilitar login anônimo.
- Cadastrar somente os domínios comercial e de homologação em Site URL e na
  lista de redirecionamentos; não incluir o domínio atualmente publicado.
- Validar cadastro comum, cadastro por convite, confirmação em nova aba,
  recuperação de senha comum e recuperação iniciada dentro de um convite.
- Confirmar que `accept_school_invitation()` rejeita uma conta ainda não
  confirmada mesmo se a configuração externa for alterada por engano.
- Confirmar que o token do convite sai da barra de endereço e permanece apenas
  na sessão da aba durante a conclusão do fluxo.
- Alterar o e-mail de uma conta em homologação, confirmar o novo endereço e
  verificar que `profiles.email` acompanha o Auth sem apagar `full_name`.
- Simular uma gratuidade vencida, confirmar que o painel mostra “Expirada” e
  que a reativação explícita restaura o acesso sem alterar dados escolares.

## Testes obrigatórios de convites

- Disparar simultaneamente duas criações para o mesmo e-mail e escola;
  confirmar que apenas um convite pendente existe e que a segunda chamada
  recebe uma mensagem clara.
- Criar novo convite depois do vencimento do anterior e confirmar que o antigo
  fica expirado e o novo link funciona.
- Confirmar que o mesmo e-mail pode possuir convites independentes para duas
  escolas diferentes.
- Confirmar que usuário autenticado comum não consegue executar
  `expire_school_invitations()` nem alterar diretamente a tabela de convites.
- Aceitar o mesmo link simultaneamente em duas abas e confirmar que apenas uma
  cria o vínculo e consome o convite.
- Antes de criar conta, entrar ou solicitar recuperação pela página do convite,
  informar outro e-mail e confirmar que nenhuma dessas três operações chega ao
  Supabase Auth. Repetir com diferenças apenas de maiúsculas e espaços e
  confirmar que o e-mail convidado continua válido.
- Com o backend comercial deliberadamente desativado, abrir a página inicial,
  o aceite de convite e a redefinição de senha e confirmar que nenhuma delas
  carrega o cliente Supabase nem tenta acessar um projeto remoto.

## Funcionalidade legada isolada

As tabelas `student_alerts`, `student_followups` e `student_activity` pertencem
ao workflow antigo e ainda não possuem `school_id`. Nenhum arquivo JavaScript
do frontend comercial atual consulta ou grava essas tabelas diretamente. Elas
ficam inacessíveis aos clientes por
`supabase-commercial-legacy-workflow-lockdown.sql`, sem exclusão de registros e
sem desativar os gatilhos internos. Antes de reativar esse workflow na interface,
é obrigatório migrá-lo para escopo escolar e criar RLS baseada na escola ativa.

## Critério para avanço

A homologação só pode receber uma cópia de dados reais depois de os testes sem
dados reais comprovarem isolamento, convites, autenticação, fotos, relatórios,
notificações, suspensão e recuperação de senha. A publicação atual permanece
independente durante todo o processo.

O procedimento preparatório e os critérios de reconciliação da futura Paulo
Freire estão em `PAULO-FREIRE-MIGRATION-READINESS.md`. Antes de qualquer cópia,
gerar o inventário somente leitura com
`supabase-paulo-freire-migration-inventory.sql`.

## Testes obrigatórios de fotos

- Enviar, visualizar, substituir e remover uma foto na escola A.
- Confirmar que um membro somente da escola B não consegue assinar nem abrir a
  foto da escola A, mesmo conhecendo o caminho completo do objeto.
- Com uma conta vinculada às duas escolas, confirmar que um caminho iniciado
  pelo identificador da escola A não pode ser associado a um aluno da escola B.
- Confirmar que fotos históricas continuam visíveis apenas enquanto estiverem
  referenciadas por alunos acessíveis e que editar outros dados desses alunos
  não exige migrar ou substituir a foto antiga.
- Excluir aluno e turma com fotos novas e confirmar que falha na limpeza do
  arquivo nunca desfaz nem oculta o resultado confirmado pelo banco.

## Testes obrigatórios de notificações

- Inserir uma notificação sintética sem assinatura Push cadastrada e confirmar
  na resposta do `pg_net` HTTP 200 com `{"delivered":0}`; isso valida o caminho
  banco → webhook → Edge Function sem enviar aviso para dispositivo real.
- Confirmar que o gatilho `send_user_notification_push` observa somente
  `INSERT` em `public.user_notifications` e aponta para o projeto comercial.
- Gerar uma notificação na escola A e confirmar que somente o destinatário com
  acesso efetivo consegue consultá-la, marcá-la como lida e ocultá-la.
- Suspender separadamente a conta, o vínculo, a escola e a assinatura; em cada
  caso, confirmar que o histórico fica preservado no banco, deixa de ser
  consultável e nenhum novo aviso interno ou push é enviado.
- Reativar o acesso e confirmar que o histórico preservado volta a aparecer.
- Manter uma preferência antiga de turma e de turno, remover o vínculo escolar
  e confirmar que ela não produz novos avisos.
- Em conta vinculada a duas escolas, confirmar que a suspensão da escola A não
  interrompe as notificações legítimas da escola B.
- Confirmar que a Edge Function `send-web-push` responde como ignorada quando o
  destinatário perdeu o acesso entre a criação da notificação e o webhook.

## Testes obrigatórios da trilha administrativa

- Criar uma escola de teste e confirmar o evento `school_provisioned`, com o
  proprietário autenticado, a escola e a conta administradora corretos.
- Suspender e reativar separadamente escola, assinatura e conta; confirmar que
  cada evento registra os estados anterior e posterior sem alterar alunos,
  fotos, vínculos ou qualquer outro dado escolar.
- Alternar a exibição pública da assinatura e confirmar o evento correspondente.
- Cancelar um login e excluir permanentemente uma conta sem vínculos de teste;
  confirmar que o histórico preserva o e-mail de destino mesmo após a remoção
  do usuário no Auth.
- Repetir cancelamento e exclusão com uma conta recém-criada que ainda não
  possui linha em `profiles`; a identificação deve vir do Auth e a ação não
  pode depender de a pessoa já ter aberto o aplicativo.
- Confirmar que usuário comum e administrador escolar não conseguem consultar
  `platform_audit_log`, chamar `platform_list_audit()` nem gravar eventos.
- Confirmar que falha na gravação da auditoria desfaz a própria ação
  administrativa na mesma transação, evitando decisões sem histórico.
- Antes de cancelar ou excluir uma conta que já criou convites, ocorrências ou
  registros do workflow legado, confirmar que os históricos permanecem e que
  apenas a referência ao usuário removido fica nula.
- Confirmar que cancelar/excluir uma conta que enviou fotos não move, renomeia
  nem remove os objetos; as fotos continuam acessíveis pela escola enquanto
  estiverem associadas aos alunos.

## Testes obrigatórios de papel e permissões

- Promover um professor a coordenador com várias permissões e confirmar que o
  papel e todas as flags são aplicados juntos.
- Forçar uma permissão inválida no mesmo lote e confirmar que nenhuma flag nem
  o papel do membro é alterado.
- Rebaixar um coordenador e confirmar, na mesma operação, a remoção das
  permissões avançadas e a manutenção apenas dos padrões definidos para
  professor.
- Executar as mesmas tentativas com coordenador, professor e membro de outra
  escola; confirmar que as validações já existentes impedem autoalteração,
  escalada e mudança de vínculo externo.
- Suspender um professor na escola A e confirmar que ele continua visível no
  diretório administrativo como suspenso, sem acesso aos dados daquela escola.
- Confirmar que o mesmo usuário mantém normalmente um vínculo independente na
  escola B e que a reativação pela escola A não altera papel nem permissões.
- Confirmar que o administrador não consegue suspender a si próprio, outro
  administrador ou um vínculo pertencente a outra escola.
