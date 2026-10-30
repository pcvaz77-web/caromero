# Portal da Família — cadastro pelo QR geral

Preparação local sobre `origin/comercial` em 29/10/2026. O convite individual por QR, celular e senha permanece disponível.

## Fluxo

1. Administração ou coordenação autorizada abre **Portal da Família → Convidar responsável → Cadastro pelo QR geral**.
2. Filtra turno e turma, seleciona de 1 a 10 alunos, informa nome completo e CPF válido do responsável e salva. O mesmo CPF pode reunir filhos de turmas diferentes. O cadastro não cria conta Auth nem envia mensagem.
3. A escola imprime o QR geral ou copia o link. O endereço contém apenas `escola=<school_id>`.
4. O responsável informa nome completo e CPF. Se não houver pré-cadastro ativo, vê: “Seu cadastro ainda não foi realizado pela escola. Procure a secretaria.” Se já houver conta, é orientado a entrar com CPF e senha.
5. O responsável confere os filhos, confirma o vínculo e cria senha de exatamente 8 caracteres. A nova conta usa um identificador interno derivado de HMAC do CPF; o CPF não entra no endereço, no QR nem no identificador Auth em texto puro. O login seguinte usa CPF e senha.
6. A escola pode excluir o vínculo de um filho ou o responsável da escola. A busca por CPF encontra registros mesmo após transferência. A exclusão desativa os vínculos e oculta o cadastro da escola, mas preserva a identidade interna para que um novo pré-cadastro do mesmo CPF reutilize a conta. O acesso a outra escola e os recibos/auditoria existentes são preservados. A mudança de matrícula ativa para transferida, concluída ou arquivada revoga os links.

## Arquivos e efeito da migração

- `supabase/migrations/203_family_cpf_self_registration.sql`: torna `family_links.phone_e164` opcional para links novos por CPF; cria `family_cpf_guardians`, `family_cpf_children` e `family_cpf_attempts`, índices, funções de cadastro/consulta/revogação e triggers. As tabelas novas têm RLS ativo e nenhum acesso direto para `anon` ou `authenticated`. A instalação não altera os links existentes; a revogação automática vale para mudanças futuras de matrícula.
- `supabase/functions/family-cpf-access/index.ts`: prévia, ativação e login por CPF, com limite de oito tentativas por IP e CPF em 15 minutos. Requer `FAMILY_CPF_AUTH_SECRET` aleatório com ao menos 32 caracteres, além das variáveis Supabase padrão. Não configurar ou publicar essa função antes da autorização de ativação.
- `family-school.js`, `familia.html`, `familia.css`, `familia.js`: telas da escola e família. `index.html` atualiza a versão do script; `supabase/config.toml` prepara a função pública.

## Limites e ativação

Nome e CPF são usados conforme a decisão do produto, sem prova adicional de posse de celular. O QR geral é público. O limite de tentativas reduz consultas repetidas, mas não transforma CPF em segredo.

Não houve migração aplicada, alteração de Auth, publicação de Edge Function, commit, push ou deploy nesta preparação. Antes de ativar com famílias, revisar o SQL exato, confirmar que o Auth aceita senha de oito caracteres, definir `FAMILY_CPF_AUTH_SECRET`, testar o fluxo completo com contas descartáveis e obter as autorizações separadas para migração e publicação.
