-- CARÔMETRO COMERCIAL — GERADOR DE TRANSPORTE DA PAULO FREIRE (PREPARAÇÃO)
--
-- ESTE ARQUIVO NÃO FOI EXECUTADO. Nenhuma escrita foi feita em nenhum dos
-- dois projetos. Fica registrado como artefato de preparação, pendente de
-- autorização explícita e separada para cada etapa de execução real.
--
-- MECANISMO: os dois projetos Supabase são bancos Postgres totalmente
-- separados (sem dblink/postgres_fdw). O transporte não é um único
-- comando cruzando bancos:
--   1) Rodar os SELECTs abaixo no LEGADO (ftigviorsuqucxwxqpua),
--      SOMENTE LEITURA — cada um usa format() para já produzir, como
--      RESULTADO da consulta, o texto pronto do INSERT correspondente.
--   2) Copiar o texto gerado e executá-lo no COMERCIAL
--      (ppkndfwmqdmomkjoemre) — essa é a única escrita real, feita
--      separadamente, com autorização própria por etapa.
-- O legado nunca recebe nenhum INSERT/UPDATE/DELETE neste processo.
--
-- DECISÕES DESTA RODADA (todas já refletidas abaixo):
--   1. Permissão de pcvaz77@gmail.com: can_register_occurrences = false
--      (user_permissions é a fonte viva). Por isso a seção 6 agora lê os
--      13 flags comuns diretamente de user_permissions, não mais de
--      school_member_permissions — corrige esse caso e qualquer outro
--      igual sem precisar de exceção manual.
--   2. report_generation_log, cancelled_logins e student_activity: NÃO
--      migrar (confirmado log técnico, não dado funcional).
--      user_notifications (511) e push_subscriptions (2): NÃO migrar —
--      feed de eventos derivado e credenciais de push por
--      origem/dispositivo (VAPID diferente no Comercial, inutilizáveis
--      copiadas). Regeneram sozinhos com o uso normal do site novo.
--      user_favorite_classes (73 linhas, só 2 usuários distintos): É
--      preferência real que 2 dos 4 usuários perceberiam perder — ENTRA
--      no transporte (seção 8A), mas só pode rodar depois que os 3 UUIDs
--      Auth pendentes existirem no Comercial (mesma dependência de
--      school_members).
--   3. Fotos: students entram com photo_path = NULL; mapa
--      student_id -> legacy_photo_path fica separado (seção 5A) até a
--      cópia física ser validada.
--   4. Owner: passosdigital77@gmail.com JÁ tem UUID conhecido no
--      Comercial (2a04cf8f-95f8-4f8d-a88f-310f871a5e46) — a seção 7 já
--      grava esse valor diretamente, sem placeholder. Só os 3 outros
--      usuários ficam como placeholder, pendentes do onboarding.
--   6. school_subscriptions: preparada em seção própria (9), mas com
--      plan/price deixados como placeholder — não invento valor
--      comercial.
--
-- ORDEM DE EXECUÇÃO NO DESTINO (ver também o relatório "ordem final"):
--   1. schools
--   2. classes
--   3. students (photo_path NULL)
--   4. Auth: convidar os 3 usuários pendentes (ainda NÃO enviar)
--   5. school_members (owner com UUID já conhecido; os 3 outros só
--      depois do aceite do convite)
--   6. school_member_permissions (fonte: user_permissions)
--   7. class_counselors
--   8. observation_options, school_terms, livro_revisa_deliveries
--   8A. user_favorite_classes (só depois do passo 4/5 completos)
--   9. school_subscriptions (valores pendentes de decisão explícita)
--  10. Cópia física das 858 fotos + UPDATE de students.photo_path
--  11. supabase-paulo-freire-post-migration-audit.sql no Comercial
--
-- MAPA DE USUÁRIOS (legacy auth.users.id -> comercial auth.users.id):
-- Confirmado por leitura direta em auth.users da origem.
--   passosdigital77@gmail.com : legado 372210ed-73fc-41d7-b138-cccbe53cae8e
--                                -> comercial JÁ CONHECIDO — 2a04cf8f-95f8-4f8d-a88f-310f871a5e46
--                                (reaproveitar; NÃO recriar; NÃO convidar)
--   priscilawebaula@gmail.com : legado 54a62610-341c-42b6-a0f6-36e0da71f305
--                                -> comercial: <PENDENTE — convite ainda
--                                não enviado>
--   eliane.concursos@gmail.com : legado 4ffb78f1-d4ad-4b46-a176-148b9d899012
--                                -> comercial: <PENDENTE>
--   pcvaz77@gmail.com          : legado 59bfff30-9d9a-4615-ab6e-7bdfecc3e8c4
--                                -> comercial: <PENDENTE>


-- ============================================================
-- 1) ESCOLA — 1 linha
-- ============================================================
select format(
  $ins$insert into public.schools (id, name, slug, status, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  id, name, slug, status, created_at, updated_at
) as generated_sql
from public.schools
where slug = 'colegio-estadual-paulo-freire';


-- ============================================================
-- 2) TURMAS — 36 linhas esperadas — EXECUTADA E VALIDADA (36/36, UUIDs
-- e demais campos conferidos 1:1 origem × Comercial).
--
-- DECISÃO DE TRANSFORMAÇÃO REGISTRADA (aplicada na execução real, não
-- prevista na versão original deste gerador): a origem
-- (ftigviorsuqucxwxqpua) não tem coluna updated_at em public.classes,
-- só created_at. O destino exige updated_at NOT NULL (default now()).
-- Decisão: updated_at = created_at (não now()), para não fabricar um
-- horário de modificação que nunca existiu na origem. A query abaixo já
-- reflete essa decisão (c.created_at repetido na posição de updated_at).
-- ============================================================
select format(
  $ins$insert into public.classes (id, name, shift, school_id, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  c.id, c.name, c.shift, c.school_id, c.created_at, c.created_at
) as generated_sql
from public.classes c
join public.schools s on s.id = c.school_id
where s.slug = 'colegio-estadual-paulo-freire'
order by c.name;


-- ============================================================
-- 3) ALUNOS — 1301 linhas esperadas — photo_path SEMPRE NULL aqui
--
-- DECISÃO DE TRANSFORMAÇÃO REGISTRADA (mesmo critério já aprovado e
-- aplicado em classes, seção 2): a origem (ftigviorsuqucxwxqpua) não
-- tem coluna updated_at em public.students, só created_at. O destino
-- exige updated_at NOT NULL (default now()). Decisão: updated_at =
-- created_at (não now()), para não fabricar um horário de modificação
-- que nunca existiu na origem. A query abaixo já reflete essa decisão
-- (st.created_at repetido na posição de updated_at).
-- ============================================================
select format(
  $ins$insert into public.students (id, full_name, class_id, class_name, school_id, has_report, photo_path, uniform_received, shoes_received, material_received, uniform_size, shoe_size, uniform_received_at, uniform_notes, uniform_pending, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L, NULL, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  st.id, st.full_name, st.class_id, st.class_name, st.school_id, st.has_report,
  st.uniform_received, st.shoes_received, st.material_received, st.uniform_size, st.shoe_size,
  st.uniform_received_at, st.uniform_notes, st.uniform_pending, st.created_at, st.created_at
) as generated_sql
from public.students st
join public.schools s on s.id = st.school_id
where s.slug = 'colegio-estadual-paulo-freire'
order by st.full_name;


-- ============================================================
-- 3A) MAPA student_id -> legacy_photo_path — 858 linhas esperadas
-- Guardar este resultado à parte (fora do banco, ex.: neste próprio
-- arquivo de preparação ou um CSV local) até a cópia física ser feita e
-- validada. Usado só para gerar os UPDATEs da etapa 10 depois.
-- ============================================================
select st.id as student_id, st.full_name, st.photo_path as legacy_photo_path
from public.students st
join public.schools s on s.id = st.school_id
where s.slug = 'colegio-estadual-paulo-freire'
  and st.photo_path is not null
order by st.full_name;


-- ============================================================
-- 4) MEMBROS — 4 linhas esperadas
-- O owner já grava o UUID comercial conhecido diretamente. Os outros 3
-- continuam como placeholder até existirem de verdade no Comercial.
-- ============================================================
select format(
  $ins$insert into public.school_members (id, school_id, user_id, role, status, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  sm.id, sm.school_id,
  case
    when u.email = 'passosdigital77@gmail.com' then '2a04cf8f-95f8-4f8d-a88f-310f871a5e46'
    else format('<SUBSTITUIR_PELO_UUID_COMERCIAL_DE:%s>', u.email)
  end,
  sm.role, sm.status, sm.created_at, sm.updated_at
) as generated_sql
from public.school_members sm
join auth.users u on u.id = sm.user_id
join public.schools s on s.id = sm.school_id
where s.slug = 'colegio-estadual-paulo-freire'
order by u.email;


-- ============================================================
-- 5) PERMISSÕES DOS MEMBROS — 4 linhas esperadas
-- Fonte dos 13 flags comuns: user_permissions (fonte viva, decisão desta
-- rodada — corrige a divergência de pcvaz77@gmail.com automaticamente).
-- member_id = school_members.id, já preservado no passo 4.
-- ============================================================
select format(
  $ins$insert into public.school_member_permissions (member_id, can_add_students, can_edit_students, can_delete_students, can_edit_all, can_edit_photo, can_edit_name, can_edit_class, can_edit_report, can_view_occurrences, can_register_occurrences, can_edit_occurrences, can_delete_occurrences, can_manage_counselors, updated_at)
values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
on conflict (member_id) do nothing;$ins$,
  sm.id, up.can_add_students, up.can_edit_students, up.can_delete_students, up.can_edit_all,
  up.can_edit_photo, up.can_edit_name, up.can_edit_class, up.can_edit_report,
  up.can_view_occurrences, up.can_register_occurrences, up.can_edit_occurrences, up.can_delete_occurrences,
  up.can_manage_counselors, now()
) as generated_sql
from public.school_members sm
join auth.users u on u.id = sm.user_id
join public.schools s on s.id = sm.school_id
join public.user_permissions up on up.user_id = sm.user_id
where s.slug = 'colegio-estadual-paulo-freire'
order by u.email;


-- ============================================================
-- 6) CONSELHEIROS — 1 linha esperada
-- ============================================================
select format(
  $ins$insert into public.class_counselors (id, class_id, counselor_user_id, school_id, created_at)
values (%L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  cc.id, cc.class_id,
  case
    when u.email = 'passosdigital77@gmail.com' then '2a04cf8f-95f8-4f8d-a88f-310f871a5e46'
    else format('<SUBSTITUIR_PELO_UUID_COMERCIAL_DE:%s>', u.email)
  end,
  cc.school_id, cc.created_at
) as generated_sql
from public.class_counselors cc
join auth.users u on u.id = cc.counselor_user_id
join public.schools s on s.id = cc.school_id
where s.slug = 'colegio-estadual-paulo-freire';


-- ============================================================
-- 7) OPÇÕES DE OBSERVAÇÃO — 10 linhas esperadas
-- ============================================================
select format(
  $ins$insert into public.observation_options (id, label, display_order, school_id, created_at)
values (%L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  oo.id, oo.label, oo.display_order, oo.school_id, oo.created_at
) as generated_sql
from public.observation_options oo
join public.schools s on s.id = oo.school_id
where s.slug = 'colegio-estadual-paulo-freire'
order by oo.display_order;


-- ============================================================
-- 8) PERÍODOS LETIVOS (school_terms) — 4 linhas esperadas
-- ============================================================
select format(
  $ins$insert into public.school_terms (id, school_id, school_year, bimester, starts_on, ends_on, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  t.id, t.school_id, t.school_year, t.bimester, t.starts_on, t.ends_on, t.created_at, t.updated_at
) as generated_sql
from public.school_terms t
join public.schools s on s.id = t.school_id
where s.slug = 'colegio-estadual-paulo-freire'
order by t.school_year, t.bimester;


-- ============================================================
-- 9) LIVRO/REVISA — 6 linhas esperadas
-- ============================================================
select format(
  $ins$insert into public.livro_revisa_deliveries (id, school_id, student_id, school_year, bimester, status, delivered_at, recorded_by, corrected_at, corrected_by, created_at, updated_at)
values (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)
on conflict (id) do nothing;$ins$,
  d.id, d.school_id, d.student_id, d.school_year, d.bimester, d.status, d.delivered_at,
  case when ur.email = 'passosdigital77@gmail.com' then '2a04cf8f-95f8-4f8d-a88f-310f871a5e46'
       when ur.email is not null then format('<SUBSTITUIR_PELO_UUID_COMERCIAL_DE:%s>', ur.email)
       else null end,
  d.corrected_at,
  case when uc.email = 'passosdigital77@gmail.com' then '2a04cf8f-95f8-4f8d-a88f-310f871a5e46'
       when uc.email is not null then format('<SUBSTITUIR_PELO_UUID_COMERCIAL_DE:%s>', uc.email)
       else null end,
  d.created_at, d.updated_at
) as generated_sql
from public.livro_revisa_deliveries d
join public.schools s on s.id = d.school_id
left join auth.users ur on ur.id = d.recorded_by
left join auth.users uc on uc.id = d.corrected_by
where s.slug = 'colegio-estadual-paulo-freire';


-- ============================================================
-- 8A) FAVORITOS DE TURMA (user_favorite_classes) — só rodar DEPOIS que
-- os 3 usuários pendentes existirem de verdade no Comercial (etapa 4/5
-- da ordem de execução). 73 linhas esperadas na origem, só 2 usuários
-- distintos. class_id já preservado; troque só os placeholders de e-mail
-- pelos UUIDs reais antes de rodar.
-- ============================================================
select format(
  $ins$insert into public.user_favorite_classes (user_id, class_id, notifications_enabled, created_at)
values (%L, %L, %L, %L)
on conflict (user_id, class_id) do nothing;$ins$,
  case
    when u.email = 'passosdigital77@gmail.com' then '2a04cf8f-95f8-4f8d-a88f-310f871a5e46'
    else format('<SUBSTITUIR_PELO_UUID_COMERCIAL_DE:%s>', u.email)
  end,
  ufc.class_id, ufc.notifications_enabled, ufc.created_at
) as generated_sql
from public.user_favorite_classes ufc
join auth.users u on u.id = ufc.user_id
join public.classes c on c.id = ufc.class_id
join public.schools s on s.id = c.school_id
where s.slug = 'colegio-estadual-paulo-freire';


-- ============================================================
-- 9B) ASSINATURA DA ESCOLA (school_subscriptions) — NÃO GERAR AINDA.
-- Primeira escola real do Comercial: plan/billing_type/price dependem de
-- decisão comercial explícita, não de inferência. Estrutura de referência
-- (não execute sem preencher <DECISÃO_COMERCIAL>):
--
-- insert into public.school_subscriptions
--   (school_id, plan, billing_type, status, price, granted_by, grant_reason)
-- values
--   ('<schools.id preservado da seção 1>', '<DECISÃO_COMERCIAL:plan>',
--    '<DECISÃO_COMERCIAL:billing_type>', 'active',
--    <DECISÃO_COMERCIAL:price>, '2a04cf8f-95f8-4f8d-a88f-310f871a5e46',
--    'Migração da Paulo Freire — primeira escola real do Comercial');
-- ============================================================


-- ============================================================
-- 10) FOTOS — procedimento (não é SQL puro, precisa de Storage API):
--   a) Ler a lista da seção 3A (student_id -> legacy_photo_path).
--   b) Para cada linha: baixar o objeto do bucket 'student-photos' do
--      legado (leitura, nunca apaga/move).
--   c) Enviar para o bucket 'student-photos' do Comercial, no caminho
--      novo exigido pela policy multi-escola já aplicada lá:
--      <school_id>/<uploader_user_id>/<arquivo original>
--      — uploader_user_id = UUID comercial do owner (2a04cf8f-...), já
--      que a autoria original do upload não é preservável entre
--      projetos e o owner é quem está conduzindo a migração.
--   d) Validar: contagem de objetos copiados = 858, e cada caminho novo
--      realmente existe no bucket do Comercial antes de qualquer UPDATE.
--   e) Só então rodar, por aluno, um UPDATE isolado:
--      update public.students set photo_path = '<caminho novo>'
--      where id = '<student_id>';
--      (nunca em lote antes de (d) confirmar 858/858)
-- Script efetivo (download+upload) ainda não escrito — depende de decidir
-- se roda como script Node local, Edge Function ou outro mecanismo; não
-- é possível fazer via SQL puro porque envolve os dois Storage distintos.
-- ============================================================


-- ============================================================
-- CONFIRMADO NÃO MIGRAR (decisão desta rodada + rodada anterior):
--   user_notifications (511) — feed de eventos derivado, regenera sozinho.
--   report_generation_log (53) — log técnico.
--   cancelled_logins (22) — histórico administrativo do modelo antigo.
--   push_subscriptions (2) — credenciais de push por origem/dispositivo,
--     inutilizáveis fora do domínio/VAPID onde foram criadas.
--   student_activity (2940) — log técnico de CRUD, não histórico
--     pedagógico (confirmado, não é equivalente a student_occurrences).
--   backup_students_20260817 / backup_classes_20260817 /
--     backup_user_permissions_20260817 / backup_profiles_20260817 —
--     cópias de segurança históricas, não dados funcionais vivos.
--   student_occurrences (0) — tabela vazia na origem, nada a migrar.
-- ============================================================
