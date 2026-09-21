# Correção de Provas — revisão da cobrança

Estado em 21/09/2026: migração 141 aplicada no projeto comercial após autorização; concessões e pagamentos anteriores comparados e preservados. Funções de cobrança/licença e Worker publicados. Não foram feitas compras reais.

## Regras aprovadas

- Todas as compras usam a Hotmart, com os meios de pagamento permitidos pelo checkout. Não há mais restrição exclusiva a Pix.
- R$ 20 compra um crédito genérico; R$ 80 compra quatro.
- O crédito vincula-se à avaliação/bloco no primeiro acesso pelo QR no celular, após validação pelo computador. Gerar QR não consome crédito.
- O mesmo bloco inclui todas as turmas do professor e suas disciplinas. O professor encerra explicitamente após terminar todas as turmas.
- Mensal com correção: preço base + R$ 35. Trimestral e futuro semestral: preço base + R$ 45, pela vigência contratada.
- Concessões gratuitas do proprietário permanecem independentes.

## SQL exato e impacto

Arquivo: `../../supabase/migrations/141_siap_exam_commerce.sql`.

Cria quatro tabelas: catálogo de ofertas, pedidos, compras confirmadas e créditos. Os pedidos registram conta, e-mail, aceite e condições de preço no momento da compra. Não armazena alunos, fotos nem turmas.

O catálogo é público para leitura; pedidos, compras e créditos ficam protegidos por RLS e acessíveis somente ao backend. Duas funções de serviço controlam pagamento, estorno, vínculo e encerramento do crédito. As operações são serializadas por conta e transação, evitando concessões duplicadas.

Preserva cópias das funções atuais de acesso e visibilidade do Assistente e acrescenta a consulta aos planos com correção. Não altera usuários, escolas, concessões gratuitas nem pagamentos antigos. As ofertas novas nascem INATIVAS e sem checkout, portanto aplicar este SQL sozinho não abre vendas.

Antes de aplicar: confirmar projeto comercial `ppkndfwmqdmomkjoemre`, ausência da migration 141 e capturar definições atuais das duas funções substituídas. Aplicar somente este arquivo, após aprovação específica. Não usar atualização ampla de migrations.

Reversão operacional: desativar as ofertas novas e restaurar as definições anteriores das funções e do código. Preservar tabelas e registros financeiros; não apagar compras para reverter a versão.

## Verificações executadas

93 testes passaram: serviço da câmera, correção e lançamento, extensão, checkout, migração em PostgreSQL local (PGlite), isolamento por conta, pagamento repetido, estorno, crédito por bloco, planos e concessões. Pix e cartão aprovados são aceitos; eventos pendentes não concedem crédito. O teste de encaminhamento confirma que novas ofertas não tocam os pagamentos antigos. Sintaxe JavaScript e diff verificados.

Hotmart: 16 eventos sintéticos do teste oficial retornaram HTTP 200. Isso valida autenticação/transporte, não representa compra paga. Checkouts mensal (R$114,90 recorrente) e trimestral (R$174,90, uma cobrança) conferidos no navegador.

## Pendências antes de vender

- Produto Hotmart 8564903 enviado para análise após aceite explicitamente autorizado. Ofertas: `mnco65nl` (R$ 20) e `3v1poeoz` (R$ 80). Página externa, guia e extensão 0.28.0 enviados.
- Planos criados no produto 8470115: `bnd4hbqa` (mensal com correção) e `llwwo259` (trimestral com correção). Os preços anteriores permanecem intactos.
- Webhook existente atende todos os produtos; ofertas novas e transações de correção são encaminhadas ao serviço separado antes da conciliação antiga.
- Publicar site/extensão e ativar somente ofertas com checkout disponível. O semestral continua indisponível.
- Validar confirmação de pagamento em ambiente de teste da plataforma; não foi realizado pagamento real.

Limitação atual: a chave de avaliação reconhece os padrões Ciclo + LGG/MAT/CNT/CHSA/CHS/CH; formatos desconhecidos são recusados para evitar gastar crédito no bloco errado. Ampliação requer exemplos reais adicionais.

Achado preexistente fora desta alteração: o catálogo trimestral antigo aponta para a oferta `2xaozivg`, exibida na Hotmart como semestral recorrente; a oferta antiga `zjuarjpk` aparece como trimestral recorrente. Não foram alteradas essas ofertas, seus clientes ou seu mapeamento. Revisar separadamente antes de promover novamente o plano trimestral sem correção como pagamento único.
