# Carômetro comercial — manifesto de aplicação

Este manifesto é exclusivamente para um futuro ambiente separado de
homologação/comercial. Ele não autoriza aplicação no projeto publicado
`ftigviorsuqucxwxqpua`.

## Estado local protegido

- Branch obrigatória: `comercial`.
- Referência de produção que deve permanecer intacta:
  `453f922048fe7c3f4b02c10548f4d7931bd487af`.
- Projeto separado confirmado para homologação:
  `carometro-comercial-dev` (`ppkndfwmqdmomkjoemre`), região
  `sa-east-1` (São Paulo), plano gratuito.
- `carometro-config.js` deve permanecer com `backendConfigured: false` até o
  novo projeto ser criado, preparado e validado.
- A migration `005_commercial_initial_data_migration.sql` é obsoleta e não
  entra no lote de aplicação.

## Lote de estrutura comercial

Aplicar, sempre no projeto separado, nesta ordem:

0. Executar `supabase-commercial-homologation-preflight.sql`, que é somente
   leitura, e prosseguir apenas se todas as dependências existirem.
1. `supabase/migrations/001_commercial_foundation.sql`
2. `supabase/migrations/002_commercial_school_data_scope.sql`
3. `supabase/migrations/003_commercial_school_features_scope.sql`
4. `supabase/migrations/004_commercial_platform_foundation.sql`
5. Executar a pré-validação somente leitura
   `supabase-commercial-data-migration-preflight.sql`
6. `supabase/migrations/006_commercial_initial_data_migration_fix.sql`
7. `supabase/migrations/007_platform_security_and_access_control.sql`
8. `supabase/migrations/008_fix_initial_school_subscription.sql`
9. `supabase/migrations/009_platform_owner_dashboard_views.sql`
10. `supabase/migrations/010_platform_school_student_count.sql`
11. `supabase/migrations/011_sync_paulo_freire_legacy_permissions.sql`
12. `supabase/migrations/012_user_notification_shifts_school_scope.sql`
13. `supabase/migrations/013_report_generation_log_school_scope.sql`
14. `supabase/migrations/014_observation_options_school_scope.sql`
15. `supabase/migrations/015_user_notifications_school_scope.sql`
16. `supabase/migrations/018_backfill_orphan_occurrence_school_id.sql`
17. `supabase/migrations/019_restrict_student_photos_select_to_school_members.sql`
18. `supabase/migrations/022_livro_revisa_foundation.sql`
19. `supabase/migrations/023_school_terms_batch_upsert.sql`
20. `supabase/migrations/025_fix_school_terms_batch_upsert.sql`
21. `supabase/migrations/026_livro_revisa_clear_status.sql`
22. `supabase/migrations/027_report_uniform_status.sql`
23. `supabase/migrations/028_school_scope_class_counselors_permissions.sql`
24. `supabase/migrations/029_derive_counselor_management_from_role.sql`
25. `supabase/migrations/030_derive_counselor_select_rls_from_role.sql`
26. `supabase/migrations/031_counselor_candidates_any_active_role.sql`

As migrations `017`, `020`, `021` e `024` não entram diretamente no lote
comercial limpo porque suas funções legadas são substituídas, respectivamente,
por `supabase-commercial-reports.sql`,
`supabase-school-invitation-preview.sql`,
`supabase-commercial-uniform-bulk.sql` e novamente
`supabase-commercial-reports.sql`. A migration local `016` também permanece
fora do lote. Depois das migrations acima, os complementos comerciais devem
sempre ser reaplicados na ordem seguinte para que a camada multi-escola seja a
definição final e autoritativa.

## Complementos comerciais

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

Depois do lote, executar
`supabase-commercial-post-application-audit.sql`. Todas as tabelas devem
existir com RLS, os totais de inconsistências devem ser zero e a consulta de
`SECURITY DEFINER` não deve retornar função comercial sem `search_path` vazio.

> Não executar `supabase db push` indiscriminadamente enquanto o arquivo
> `005_commercial_initial_data_migration.sql` estiver no diretório: ele é
> obsoleto e deve ser ignorado. A aplicação inicial deve seguir este manifesto
> arquivo por arquivo no ambiente separado.

## Edge Functions

- `supabase/functions/manage-user/index.ts`
- `supabase/functions/send-web-push/index.ts`

Segredos/configurações obrigatórios no projeto separado:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS`
- `WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

Nenhum valor real desses segredos deve ser salvo no repositório.

## Database Webhook de notificações Push

Depois de publicar `send-web-push` e configurar os segredos, instalar a
integração Database Webhooks (`pg_net`) no projeto separado e criar exatamente:

- nome: `send_user_notification_push`;
- tabela: `public.user_notifications`;
- evento: somente `INSERT`;
- método: `POST`;
- URL: `https://ppkndfwmqdmomkjoemre.supabase.co/functions/v1/send-web-push`;
- cabeçalhos: `Content-Type: application/json` e `x-webhook-secret` com o mesmo
  valor de `WEBHOOK_SECRET` da Edge Function.

O segredo não deve ser incluído em SQL, documentação, código-fonte ou histórico
do Git. A auditoria pós-aplicação confirma apenas a existência e o escopo do
gatilho; o teste funcional deve confirmar HTTP 200 sem cadastrar dispositivo
real.

## Liberação do frontend

Somente depois de todo o lote ser aplicado e testado:

1. preencher `supabaseProjectRef`, `supabaseUrl` e
   `supabasePublishableKey` em `carometro-config.js`;
2. confirmar que o project ref é diferente de `ftigviorsuqucxwxqpua`;
3. alterar `backendConfigured` para `true`;
4. executar `validate-commercial-readiness.ps1` novamente;
5. testar o domínio de homologação antes de qualquer migração de dados reais.

Os cenários funcionais obrigatórios continuam detalhados em
`COMMERCIAL-HOMOLOGATION-RUNBOOK.md`.
