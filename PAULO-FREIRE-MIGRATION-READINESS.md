# Preparação da futura migração da Paulo Freire

Este documento prepara a migração, mas não a autoriza. Até o corte futuro, o
Carômetro publicado e o projeto `ftigviorsuqucxwxqpua` permanecem intocados.

## Estratégia aprovada

1. Tratar o projeto comercial atual como homologação, nunca como fonte dos
   dados reais da Paulo Freire.
2. No momento autorizado, criar uma cópia integral e verificável do banco de
   origem, incluindo o schema `auth`, para preservar contas e hashes de senha.
3. Restaurar a cópia em ambiente separado, bloquear integrações externas e só
   então aplicar o manifesto comercial completo.
4. Copiar separadamente os objetos do Storage; backup/restauração do banco não
   transfere os arquivos das fotos.
5. Comparar inventários de origem e destino antes de liberar qualquer acesso.
6. Fazer ensaio completo e manter o Carômetro atual como retorno até a
   homologação da Paulo Freire no comercial.

Referências oficiais:

- https://supabase.com/docs/guides/platform/migrating-within-supabase
- https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
- https://supabase.com/docs/guides/platform/clone-project

## Barreiras antes do ensaio

- A validação `validate-commercial-readiness.ps1 -ExpectBackendConfigured`
  precisa estar aprovada.
- A auditoria pós-aplicação precisa retornar zero inconsistências.
- Convites, recuperação de senha, fotos, permissões e isolamento entre duas
  escolas precisam estar homologados com dados sintéticos.
- O inventário de origem deve ser obtido somente por leitura usando
  `supabase-paulo-freire-migration-inventory.sql`.
- Deve existir backup do banco e cópia dos objetos do bucket `student-photos`.
- Webhooks, Edge Functions e qualquer envio externo devem permanecer
  desativados durante restauração e transformação.

## Preservação de identidade

- A cópia do schema `auth` preserva usuários e hashes de senha; não criar
  novamente as contas pelo painel.
- Tokens de sessão do projeto antigo não devem ser reaproveitados. No corte,
  todos entram novamente no novo endereço para receber tokens do projeto
  comercial.
- IDs UUID dos usuários devem permanecer iguais para preservar todas as chaves
  estrangeiras e autoria histórica.
- O proprietário e todos os demais usuários devem ser reconciliados por UUID e
  e-mail antes da liberação.

## Preservação de fotos

- Registrar separadamente referências em `students.photo_path` e objetos reais
  em `storage.objects`/bucket.
- Copiar os binários sem renomear caminhos históricos.
- Não remover objetos órfãos durante a migração; apenas registrá-los para
  análise posterior.
- Após a cópia, cada referência deve localizar exatamente o mesmo objeto no
  destino.

## Ensaio e reconciliação

1. Congelar uma cópia, nunca a origem em funcionamento.
2. Restaurar banco e Auth no destino de ensaio.
3. Copiar Storage e conferir quantidade e caminhos.
4. Aplicar `COMMERCIAL-APPLICATION-MANIFEST.md` na ordem indicada.
5. Executar `supabase-commercial-post-application-audit.sql`.
6. Executar `supabase-paulo-freire-post-migration-audit.sql` e comparar
   contagens, UUIDs e amostras entre origem e destino.
7. Testar os quatro papéis, fotos, relatórios, ocorrências, notificações,
   convites e recuperação de senha.
8. Registrar duração, falhas e procedimento de retorno.

## Critério de prontidão para o corte futuro

- Todas as contagens conciliadas ou diferenças formalmente explicadas.
- Zero vínculo, aluno, ocorrência, conselheiro ou foto perdido.
- Usuários existentes entram com a senha atual após novo login.
- Paulo Freire aparece como uma escola isolada na plataforma comercial.
- Nenhuma escola de teste fica misturada aos dados reais.
- O endereço antigo permanece disponível para retorno até a aceitação final.
