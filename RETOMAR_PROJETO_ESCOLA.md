# RETOMAR PROJETO ESCOLA

Quando o usuário escrever **RETOMAR PROJETO ESCOLA**, continuar a partir deste plano.

## Objetivo

Transformar o CARÔMETRO em uma plataforma com várias escolas separadas, acessadas pelo mesmo link. Cada escola terá seus próprios alunos, turmas, fotos e usuários, sem acesso aos dados das demais.

## Decisões já tomadas

- O usuário atual é o **administrador principal** da plataforma.
- Um novo assinante receberá uma escola própria, inicialmente vazia, e será o **administrador secundário** somente daquela escola.
- O administrador secundário poderá liberar permissões apenas para os usuários da própria escola.
- O administrador principal poderá suspender escolas, usuários e assinaturas, corrigir nome de escola e definir recursos disponíveis.
- O novo assinante informará o nome da escola antes da compra/cadastro.
- O administrador secundário não poderá mudar o nome da escola. O administrador principal poderá corrigir ou mudar esse nome quando necessário.
- Se o administrador principal mudar de escola, poderá atualizar o nome da sua própria escola sem perder turmas, alunos, fotos ou usuários.
- As turmas, alunos, laudos, fotos e permissões atuais devem ser migrados para uma primeira escola principal, sem apagar ou exigir novo cadastro.
- Usuários convidados para a escola atual não recebem uma escola nova: eles acessam somente os dados da escola à qual foram vinculados.
- Todos continuam usando o mesmo link de acesso ao CARÔMETRO; a separação será feita após o login.

## Fluxo de compra desejado

1. Pessoa cria a conta com nome, e-mail e senha.
2. Informa e confirma o nome da escola.
3. Clica para assinar.
4. O pagamento deve ficar associado à conta autenticada, e não apenas a um link genérico.
5. Após confirmação do pagamento, o sistema cria/libera a escola vazia e concede o papel de administrador secundário.
6. Renovação aprovada mantém acesso; cancelamento ou falha de pagamento pode suspender o acesso.

Enquanto o Mercado Pago estiver usando um link genérico, a identificação e liberação do comprador será manual. Para automação será necessário checkout associado ao usuário e notificações/webhooks de pagamento.

## Estrutura técnica recomendada

- Criar tabela de escolas/organizações.
- Criar vínculo de membros por escola, com papéis de administrador principal, administrador secundário e usuários comuns.
- Adicionar `school_id` a turmas, alunos, permissões e fotos.
- Atualizar as regras RLS do Supabase para que cada consulta, foto e alteração seja limitada à escola do usuário.
- Manter as fotos protegidas e vinculadas à escola; avaliar URLs assinadas/controles de acesso antes de comercializar, pois há fotos de alunos.
- Criar painel global para o administrador principal e painel local para o administrador secundário.
- Criar tela inicial de configuração da escola após compra.
- Fazer backup e validação de contagens antes da migração dos dados atuais.

## Hospedagem e escala

- Não criar um Supabase separado por escola. Usar um projeto central com separação por escola.
- Os limites atuais do Supabase Free são compartilhados por todas as escolas; fotos serão o principal limite.
- Antes de comercializar, mover o front-end do GitHub Pages para hospedagem adequada a um serviço comercial/SaaS.
- Quando houver escolas pagantes e fotos em volume, avaliar Supabase Pro e backups regulares.

## Próximo passo ao retomar

1. Confirmar o nome da escola principal atual.
2. Preparar a migração multi-escola com backup e validação.
3. Implementar a estrutura de escolas, papéis, isolamento de dados e painel secundário.
4. Adaptar compra/assinatura para associar pagamento ao usuário e criar escola vazia.
