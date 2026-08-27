[CmdletBinding()]
param(
  [switch]$ExpectBackendConfigured
)

$ErrorActionPreference = 'Stop'
$productionCommit = '453f922048fe7c3f4b02c10548f4d7931bd487af'
$productionProjectRef = 'ftigviorsuqucxwxqpua'
$commercialProjectRef = 'ppkndfwmqdmomkjoemre'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { $failures.Add($Message) }
}

$branch = (git branch --show-current).Trim()
$productionRef = (git rev-parse production).Trim()
Assert-True ($branch -eq 'comercial') "Branch ativa inesperada: $branch"
Assert-True ($productionRef -eq $productionCommit) "A referência local de production mudou: $productionRef"

$config = Get-Content -Raw -LiteralPath 'carometro-config.js'
if ($ExpectBackendConfigured) {
  Assert-True ($config -match "backendConfigured:\s*true") 'O backend comercial não está habilitado para homologação.'
} else {
  Assert-True ($config -match "backendConfigured:\s*false") 'O backend comercial não está bloqueado.'
}
Assert-True ($config -match [regex]::Escape($productionProjectRef)) 'A barreira explícita contra o projeto de produção não foi encontrada.'
Assert-True ($config -match ("supabaseProjectRef:\s*'" + [regex]::Escape($commercialProjectRef) + "'")) 'O project ref comercial aprovado não foi encontrado.'
Assert-True ($config -match [regex]::Escape("https://$commercialProjectRef.supabase.co")) 'A URL do projeto comercial aprovado não foi encontrada.'
Assert-True ($config -match "supabasePublishableKey:\s*'sb_publishable_[^']+'") 'A chave pública do projeto comercial não foi configurada.'
Assert-True ($config -notmatch 'sb_publishable_commercial_not_configured') 'A chave pública comercial ainda usa o marcador de bloqueio.'
Assert-True ($config -match "vapidPublicKey:\s*'B[^']{80,}'") 'A chave pública VAPID comercial não foi configurada.'
Assert-True ($commercialProjectRef -ne $productionProjectRef) 'O projeto comercial coincide com produção.'

$manifest = Get-Content -Raw -LiteralPath 'COMMERCIAL-APPLICATION-MANIFEST.md'
Assert-True ($manifest -match 'send_user_notification_push') 'O webhook comercial de Push não está documentado no manifesto.'
Assert-True ($manifest -match [regex]::Escape("https://$commercialProjectRef.supabase.co/functions/v1/send-web-push")) 'A URL comercial do webhook Push não está documentada.'
Assert-True ($manifest -notmatch 'WEBHOOK_SECRET\s*[:=]\s*[A-Za-z0-9_-]{20,}') 'Um possível segredo de webhook foi salvo no manifesto.'

$runbook = Get-Content -Raw -LiteralPath 'COMMERCIAL-HOMOLOGATION-RUNBOOK.md'
Assert-True ($runbook -match [regex]::Escape('supabase-commercial-table-privileges.sql')) 'O roteiro de homologação omite a camada obrigatória de privilégios de tabelas.'

$standaloneRecovery = Get-Content -Raw -LiteralPath 'reset-password.js'
Assert-True ($standaloneRecovery -match "event\s*===\s*'PASSWORD_RECOVERY'") 'A redefinição de senha não exige o evento de recuperação validado.'
Assert-True ($standaloneRecovery -match '!session\s*\|\|\s*!recoveryAuthorized') 'A redefinição de senha não exige simultaneamente sessão e recuperação validada.'
Assert-True ($standaloneRecovery -notmatch 'get\(''type''\)') 'A redefinição de senha confia em um parâmetro falsificável da URL.'
Assert-True ($standaloneRecovery -notmatch 'get\("type"\)') 'A redefinição de senha confia em um parâmetro falsificável da URL.'
Assert-True ($standaloneRecovery -match 'unlockRecoveryForm') 'A página isolada não mantém o formulário bloqueado até validar o evento de recuperação.'
Assert-True ($standaloneRecovery -match "event\s*===\s*'PASSWORD_RECOVERY'\)\s*unlockRecoveryForm") 'A página isolada não libera o formulário exclusivamente pelo evento de recuperação.'
$standaloneRecoveryHtml = Get-Content -Raw -LiteralPath 'reset-password.html'
Assert-True ($standaloneRecoveryHtml -match 'id="resetForm"\s+class="hidden"') 'O formulário isolado de redefinição não começa oculto.'
Assert-True ($standaloneRecoveryHtml -match 'reset-password\.js\?v=3') 'A página isolada não aponta para a versão protegida atual do script.'

$legacyRecovery = Get-Content -Raw -LiteralPath 'password-recovery-flow.js'
Assert-True ($legacyRecovery -match "event\s*===\s*'PASSWORD_RECOVERY'") 'O fluxo compatível de recuperação não exige o evento validado.'
Assert-True ($legacyRecovery -match '!session\s*\|\|\s*!recoveryActive') 'O fluxo compatível não exige simultaneamente sessão e recuperação validada.'
Assert-True ($legacyRecovery -notmatch 'get\(''type''\)') 'O fluxo compatível confia em um parâmetro falsificável da URL.'
Assert-True ($legacyRecovery -notmatch 'get\("type"\)') 'O fluxo compatível confia em um parâmetro falsificável da URL.'

$appCore = Get-Content -Raw -LiteralPath 'app-core.js'
Assert-True ($appCore -notmatch '\.auth\.signUp\s*\(') 'O núcleo do aplicativo ainda permite cadastro público fora do convite.'

$applicationFiles = @(
  'supabase-commercial-homologation-preflight.sql',
  'supabase/migrations/001_commercial_foundation.sql',
  'supabase/migrations/002_commercial_school_data_scope.sql',
  'supabase/migrations/003_commercial_school_features_scope.sql',
  'supabase/migrations/004_commercial_platform_foundation.sql',
  'supabase-commercial-data-migration-preflight.sql',
  'supabase/migrations/006_commercial_initial_data_migration_fix.sql',
  'supabase/migrations/007_platform_security_and_access_control.sql',
  'supabase/migrations/008_fix_initial_school_subscription.sql',
  'supabase/migrations/009_platform_owner_dashboard_views.sql',
  'supabase/migrations/010_platform_school_student_count.sql',
  'supabase/migrations/011_sync_paulo_freire_legacy_permissions.sql',
  'supabase/migrations/012_user_notification_shifts_school_scope.sql',
  'supabase/migrations/013_report_generation_log_school_scope.sql',
  'supabase/migrations/014_observation_options_school_scope.sql',
  'supabase/migrations/015_user_notifications_school_scope.sql',
  'supabase/migrations/018_backfill_orphan_occurrence_school_id.sql',
  'supabase/migrations/019_restrict_student_photos_select_to_school_members.sql',
  'supabase/migrations/022_livro_revisa_foundation.sql',
  'supabase/migrations/023_school_terms_batch_upsert.sql',
  'supabase/migrations/025_fix_school_terms_batch_upsert.sql',
  'supabase/migrations/026_livro_revisa_clear_status.sql',
  'supabase/migrations/027_report_uniform_status.sql',
  'supabase/migrations/028_school_scope_class_counselors_permissions.sql',
  'supabase/migrations/029_derive_counselor_management_from_role.sql',
  'supabase/migrations/030_derive_counselor_select_rls_from_role.sql',
  'supabase/migrations/031_counselor_candidates_any_active_role.sql',
  'supabase-commercial-account-access.sql',
  'supabase-commercial-profile-sync.sql',
  'supabase-commercial-effective-access.sql',
  'supabase-commercial-table-privileges.sql',
  'supabase-commercial-platform-rls.sql',
  'supabase-commercial-identity-rls.sql',
  'supabase-commercial-platform-audit.sql',
  'supabase-commercial-legacy-workflow-lockdown.sql',
  'supabase-commercial-counselor-rpcs.sql',
  'supabase-commercial-uniform-bulk.sql',
  'supabase-teacher-demote-permissions-cleanup.sql',
  'supabase-school-member-directory.sql',
  'supabase-commercial-member-management.sql',
  'supabase-school-invitation-preview.sql',
  'supabase-subscription-visibility.sql',
  'supabase-user-account-actions.sql',
  'supabase-occurrence-responsible.sql',
  'supabase-occurrence-edit-signature.sql',
  'supabase-commercial-auth-deletion-integrity.sql',
  'supabase-admin-account-status.sql',
  'supabase-platform-school-provisioning.sql',
  'supabase-platform-dashboard-optimized.sql',
  'supabase-commercial-photo-storage.sql',
  'supabase-commercial-reports.sql',
  'supabase-push-subscription-claim.sql',
  'supabase-student-update-notifications.sql',
  'supabase-commercial-notifications-hardening.sql',
  'supabase-commercial-function-execution-hardening.sql',
  'supabase-commercial-post-application-audit.sql'
)
foreach ($applicationFile in $applicationFiles) {
  Assert-True (Test-Path -LiteralPath $applicationFile -PathType Leaf) "Arquivo do lote ausente: $applicationFile"
  $applicationFileName = Split-Path -Leaf $applicationFile
  Assert-True ($manifest -match [regex]::Escape($applicationFileName)) "Arquivo do lote não documentado no manifesto: $applicationFileName"
}
Assert-True (-not ($applicationFiles -contains 'supabase/migrations/005_commercial_initial_data_migration.sql')) 'A migration 005 obsoleta entrou no lote.'

$teacherDemotionHardening = Get-Content -Raw -LiteralPath 'supabase-teacher-demote-permissions-cleanup.sql'
Assert-True ($teacherDemotionHardening -notmatch 'set\s+search_path\s*=\s*public') 'A correção de rebaixamento ainda usa search_path público.'
Assert-True ([regex]::Matches($teacherDemotionHardening, "set\s+search_path\s*=\s*''").Count -eq 2) 'As duas RPCs de rebaixamento/permissão precisam de search_path vazio.'

$memberManagement = Get-Content -Raw -LiteralPath 'supabase-commercial-member-management.sql'
Assert-True ($memberManagement -match 'ensure_school_member_permissions') 'O pacote comercial não garante permissões para todo novo vínculo escolar.'
Assert-True ($memberManagement -match 'left\s+join\s+public\.school_member_permissions') 'O pacote comercial não corrige vínculos existentes sem permissões.'

$effectiveAccess = Get-Content -Raw -LiteralPath 'supabase-commercial-effective-access.sql'
Assert-True ($effectiveAccess -match "session_user\s+in\s+\('postgres',\s*'supabase_admin'\)") 'O lote comercial não permite backfill interno de permissões sem abrir bypass para clientes.'

$postApplicationAudit = Get-Content -Raw -LiteralPath 'supabase-commercial-post-application-audit.sql'
foreach ($privilegedFunction in @('notify_student_updated', 'set_occurrence_responsible', 'lock_occurrence_identity', 'ensure_school_member_permissions')) {
  Assert-True ($postApplicationAudit -match [regex]::Escape($privilegedFunction)) "A auditoria final não cobre a função privilegiada: $privilegedFunction"
}

Assert-True (Test-Path -LiteralPath 'PAULO-FREIRE-MIGRATION-READINESS.md') 'O plano preparatório da futura migração da Paulo Freire não foi encontrado.'
Assert-True (Test-Path -LiteralPath 'supabase-paulo-freire-migration-inventory.sql') 'O inventário somente leitura da futura migração da Paulo Freire não foi encontrado.'
Assert-True (Test-Path -LiteralPath 'supabase-paulo-freire-post-migration-audit.sql') 'A auditoria pós-migração da Paulo Freire não foi encontrada.'
$migrationInventory = Get-Content -Raw -LiteralPath 'supabase-paulo-freire-migration-inventory.sql'
Assert-True ($migrationInventory -notmatch '(?im)^\s*(insert|update|delete|upsert|truncate|drop|alter|create|grant|revoke)\b') 'O inventário da Paulo Freire contém comando de escrita.'
foreach ($inventoryArea in @('auth.users', 'public.students', 'public.student_occurrences', 'public.class_counselors', 'storage.objects')) {
  Assert-True ($migrationInventory -match [regex]::Escape($inventoryArea)) "O inventário da Paulo Freire não cobre: $inventoryArea"
}
$postMigrationAudit = Get-Content -Raw -LiteralPath 'supabase-paulo-freire-post-migration-audit.sql'
Assert-True ($postMigrationAudit -notmatch '(?im)^\s*(insert|update|delete|upsert|truncate|drop|alter|create|grant|revoke)\b') 'A auditoria pós-migração da Paulo Freire contém comando de escrita.'
foreach ($postMigrationArea in @('school_members', 'school_member_permissions', 'students', 'student_occurrences', 'class_counselors', 'storage.objects')) {
  Assert-True ($postMigrationAudit -match [regex]::Escape($postMigrationArea)) "A auditoria pós-migração da Paulo Freire não cobre: $postMigrationArea"
}

$executionHardening = Get-Content -Raw -LiteralPath 'supabase-commercial-function-execution-hardening.sql'
$inheritedDefinerFunctions = @(
  'enforce_student_school_scope', 'limit_student_field_updates',
  'enforce_occurrence_school_scope', 'enforce_counselor_school_scope',
  'validate_commercial_favorite_class_access',
  'resolve_authorized_observation_school', 'expire_school_invitations',
  'is_platform_admin', 'platform_list_schools',
  'platform_school_student_count', 'platform_school_user_count',
  'provision_school', 'set_school_member_status',
  'has_workflow_permission', 'is_carometro_admin', 'is_report_manager',
  'log_student_change', 'log_workflow_change',
  'set_school_member_permission', 'set_school_member_role'
)
foreach ($privilegedFunction in $inheritedDefinerFunctions) {
  Assert-True ($executionHardening -match ("alter\s+function\s+public\." + [regex]::Escape($privilegedFunction) + "[\s\S]*?set\s+search_path\s+to\s+''")) "O hardening não fixa o search_path de: $privilegedFunction"
  Assert-True ($postApplicationAudit -match [regex]::Escape($privilegedFunction)) "A auditoria final não cobre o search_path de: $privilegedFunction"
}

foreach ($triggerOnlyFunction in @(
  'enforce_student_school_scope', 'limit_student_field_updates',
  'enforce_occurrence_school_scope', 'enforce_counselor_school_scope',
  'validate_commercial_favorite_class_access',
  'set_occurrence_responsible', 'lock_occurrence_identity'
)) {
  $escapedFunction = [regex]::Escape($triggerOnlyFunction)
  Assert-True ($executionHardening -match ("revoke\s+all\s+on\s+function\s+public\." + $escapedFunction + "\(\)[\s\S]*?from\s+public,\s*anon,\s*authenticated")) "O hardening não bloqueia a chamada direta da função de trigger: $triggerOnlyFunction"
}

$notificationHardening = Get-Content -Raw -LiteralPath 'supabase-commercial-notifications-hardening.sql'
Assert-True ($notificationHardening -match 'user_notifications_recipient_visible_idx') 'O pacote comercial não cria o índice da central de notificações.'

$notificationSchoolScope = Get-Content -Raw -LiteralPath 'supabase/migrations/015_user_notifications_school_scope.sql'
Assert-True ($notificationSchoolScope -notmatch 'set\s+search_path\s*=\s*public') 'As funções privilegiadas da migration 015 ainda usam search_path público.'
Assert-True ([regex]::Matches($notificationSchoolScope, "set\s+search_path\s*=\s*''").Count -eq 3) 'As três funções de notificação da migration 015 precisam de search_path vazio.'

$studentNotificationTrigger = Get-Content -Raw -LiteralPath 'supabase-student-update-notifications.sql'
Assert-True ($studentNotificationTrigger -notmatch 'set\s+search_path\s*=\s*public') 'O trigger privilegiado de atualização de aluno ainda usa search_path público.'

foreach ($occurrenceIdentityFile in @('supabase-occurrence-responsible.sql', 'supabase-occurrence-edit-signature.sql')) {
  $occurrenceIdentitySql = Get-Content -Raw -LiteralPath $occurrenceIdentityFile
  Assert-True ($occurrenceIdentitySql -notmatch 'set\s+search_path\s*=\s*public') "Função privilegiada de ocorrência ainda usa search_path público: $occurrenceIdentityFile"
}

$counselorRoleMigration = Get-Content -Raw -LiteralPath 'supabase/migrations/029_derive_counselor_management_from_role.sql'
Assert-True ($counselorRoleMigration -match 'v_email_confirmed_at\s+timestamptz') 'O aceite de convite da migration 029 não verifica confirmação de e-mail.'
Assert-True ($counselorRoleMigration -match 'if\s+v_email_confirmed_at\s+is\s+null') 'O aceite de convite da migration 029 não bloqueia e-mail não confirmado.'
Assert-True ($counselorRoleMigration -notmatch "set\s+search_path\s+to\s+'public',\s*'auth'") 'A migration 029 ainda expõe search_path mutável no aceite de convite.'
$commerciallySupersededMigrations = @(
  'supabase/migrations/017_report_occurrences_author_edit_columns.sql',
  'supabase/migrations/020_invitation_preview_email_has_account.sql',
  'supabase/migrations/021_harden_mark_all_uniform_received.sql',
  'supabase/migrations/024_scope_reports_by_active_school.sql'
)

$initialDataMigration = Get-Content -Raw -LiteralPath 'supabase/migrations/006_commercial_initial_data_migration_fix.sql'
Assert-True ([regex]::Matches($initialDataMigration, "lower\(trim\([^\)]*email[^\)]*\)\)\s*=\s*'passosdigital77@gmail\.com'").Count -eq 3) 'A migration 006 não normaliza as três buscas da conta proprietária.'
Assert-True ([regex]::Matches($initialDataMigration, 'email_confirmed_at\s+is\s+not\s+null').Count -eq 3) 'A migration 006 não exige conta proprietária confirmada em todas as etapas.'
Assert-True ([regex]::Matches($initialDataMigration, 'deleted_at\s+is\s+null').Count -eq 3) 'A migration 006 não exclui conta proprietária removida em todas as etapas.'
foreach ($supersededMigration in $commerciallySupersededMigrations) {
  Assert-True (-not ($applicationFiles -contains $supersededMigration)) "Migration legada entrou no lote comercial: $supersededMigration"
}

$forbiddenRuntimeFiles = Get-ChildItem -File -Recurse -Include *.js,*.html,*.ts |
  Where-Object { $_.FullName -notmatch '[\\/]tmp[\\/]' -and $_.Name -ne 'carometro-config.js' } |
  Where-Object { Select-String -Quiet -LiteralPath $_.FullName -SimpleMatch $productionProjectRef }
Assert-True (-not $forbiddenRuntimeFiles) ('Referência de produção fora da barreira: ' + (($forbiddenRuntimeFiles.Name) -join ', '))

$javascriptFiles = Get-ChildItem -File -Filter '*.js'
foreach ($file in $javascriptFiles) {
  & node --check $file.FullName
  Assert-True ($LASTEXITCODE -eq 0) "JavaScript inválido: $($file.Name)"
}

foreach ($file in @('supabase/functions/manage-user/index.ts', 'supabase/functions/send-web-push/index.ts')) {
  & node --check $file
  Assert-True ($LASTEXITCODE -eq 0) "TypeScript inválido: $file"
}

foreach ($htmlFile in @('index.html', 'accept-invite.html', 'reset-password.html')) {
  $html = Get-Content -Raw -LiteralPath $htmlFile
  $scripts = [regex]::Matches($html, '<script(?![^>]*src=)[^>]*>([\s\S]*?)</script>')
  $index = 0
  foreach ($script in $scripts) {
    $index++
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ("carometro-inline-{0}-{1}.js" -f ([IO.Path]::GetFileNameWithoutExtension($htmlFile)), $index)
    [IO.File]::WriteAllText($temporary, $script.Groups[1].Value)
    try {
      & node --check $temporary
      Assert-True ($LASTEXITCODE -eq 0) "Script interno inválido: $htmlFile (#$index)"
    } finally {
      Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
  }
}

$rpcNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($file in $javascriptFiles) {
  $source = Get-Content -Raw -LiteralPath $file.FullName
  foreach ($match in [regex]::Matches($source, '\.rpc\(\s*[''"]([^''"]+)')) {
    [void]$rpcNames.Add($match.Groups[1].Value)
  }
}
$sqlSource = ((Get-ChildItem -File -Filter '*.sql') + (Get-ChildItem -File 'supabase/migrations' -Filter '*.sql') |
  ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join "`n"
Assert-True ($sqlSource -notmatch '(?i)\bjsonb_object_length\s*\(') 'SQL usa jsonb_object_length(), que não existe no PostgreSQL.'
foreach ($rpcName in $rpcNames) {
  Assert-True ($sqlSource -match ("(?i)function\s+public\." + [regex]::Escape($rpcName) + "\s*\(")) "RPC sem definição SQL local: $rpcName"
}

& git diff --check
Assert-True ($LASTEXITCODE -eq 0) 'git diff --check encontrou inconsistências.'

if ($failures.Count) {
  Write-Host "VALIDAÇÃO COMERCIAL: REPROVADA" -ForegroundColor Red
  $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
  exit 1
}

Write-Host "VALIDAÇÃO COMERCIAL: APROVADA" -ForegroundColor Green
Write-Host "Branch: $branch"
Write-Host "Production preservada: $productionRef"
Write-Host "Projeto comercial separado: $commercialProjectRef"
Write-Host "JavaScript verificado: $($javascriptFiles.Count) arquivos"
Write-Host "RPCs verificadas: $($rpcNames.Count)"
Write-Host "Arquivos do lote: $($applicationFiles.Count)"
if ($ExpectBackendConfigured) {
  Write-Host 'Backend comercial: habilitado exclusivamente para homologação'
} else {
  Write-Host 'Backend comercial: bloqueado até homologação'
}
