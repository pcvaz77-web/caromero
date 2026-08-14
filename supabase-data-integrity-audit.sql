-- Auditoria somente de leitura: não altera nem remove dados.
-- Execute no Supabase > SQL Editor e guarde os resultados.

-- 1) Turmas repetidas no mesmo turno (precisam ser consolidadas antes de
-- criar a trava definitiva de unicidade).
select
  lower(trim(c.name)) as turma_normalizada,
  coalesce(c.shift, 'Matutino') as turno,
  count(*) as turmas_repetidas,
  array_agg(c.id order by c.id) as ids_das_turmas,
  array_agg(c.name order by c.name) as nomes
from public.classes c
group by lower(trim(c.name)), coalesce(c.shift, 'Matutino')
having count(*) > 1
order by turno, turma_normalizada;

-- 2) Alunos sem turma válida. O resultado esperado é zero linhas.
select s.id, s.full_name, s.class_id, s.class_name
from public.students s
left join public.classes c on c.id = s.class_id
where c.id is null;

-- 3) Possíveis nomes repetidos dentro da mesma turma. Esta consulta não
-- remove nada: homônimos podem ser estudantes diferentes.
select c.name as turma, coalesce(c.shift, 'Matutino') as turno,
       lower(trim(s.full_name)) as aluno_normalizado, count(*) as quantidade
from public.students s
join public.classes c on c.id = s.class_id
group by c.name, c.shift, lower(trim(s.full_name))
having count(*) > 1
order by turma, aluno_normalizado;

-- 4) Uniforme: somente uniform_pending é uma pendência de uniforme ou tênis
-- registrada. Os valores booleanos antigos não entram nesta auditoria.
select
  count(*) filter (where uniform_pending = 'uniform') as sem_uniforme,
  count(*) filter (where uniform_pending = 'shoes') as sem_tenis,
  count(*) filter (where uniform_pending = 'both') as sem_os_dois,
  count(*) filter (where material_received = false) as sem_material
from public.students;
