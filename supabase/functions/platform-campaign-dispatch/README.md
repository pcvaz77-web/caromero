# Comunicações do Carômetro

## Estado desta versão

- A migration `149_platform_communications_foundation.sql` cria preferências por usuário, campanhas e registros de envio. O conteúdo é livre: novidades, avisos, tutoriais, convites ou outros comunicados do Carômetro. Texto e título são obrigatórios; imagem e link são opcionais.
- `platform-campaign-dispatch` exige sessão autenticada de proprietário e origem permitida. Faz prévia, lista contatos que aceitaram WhatsApp, registra pedidos de SAIR e envia e-mail.
- `platform-communication-unsubscribe` oferece uma página de confirmação antes de cancelar novidades por e-mail. Abrir o link não cancela automaticamente.
- O aplicativo WhatsApp Business é usado por abertura individual de conversa com texto preenchido. Abrir a conversa **não** comprova que o usuário enviou a mensagem.
- A API da Meta e disparos automáticos por WhatsApp ainda dependem da habilitação do número atual e de um modelo de mensagem aprovado. Nenhum token da Meta deve ficar no frontend.

## Configuração para e-mail

Os segredos da Edge Function são `ALLOWED_ORIGINS`, `BREVO_API_KEY` e `CAROMETRO_CAMPAIGN_SENDER_EMAIL`. O remetente precisa estar autorizado no Brevo. O e-mail inclui link individual para parar de receber novidades.

Na implantação, `platform-campaign-dispatch` deve exigir JWT. `platform-communication-unsubscribe` precisa ser implantada sem verificação de JWT, pois a pessoa abre o link recebido por e-mail sem estar conectada. A função pública apenas mostra a confirmação no GET; o cancelamento é feito no POST com token individual.

O painel mostra até 100 contatos de WhatsApp por campanha e permite submeter no máximo 100 e-mails por campanha nesta versão. Destinatários são contas ativas, com vínculo ativo a escola ativa e aceite registrado no canal específico. O mesmo usuário em mais de uma escola é contado uma vez. O histórico registra submissão ao Brevo, não a entrega final; não há webhook de entrega nesta versão.

## Ativação posterior da API da Meta

1. Verificar na conta Meta se o número atual é elegível para conectar o aplicativo Business à WhatsApp Business Platform.
2. Preparar o negócio, número, permissões e modelos aprovados adequados a cada finalidade de mensagem.
3. Guardar as credenciais somente nos segredos do backend.
4. Acrescentar envio em lotes, registro dos IDs de mensagem e webhook de status e respostas, incluindo SAIR.
5. Testar com um público pequeno antes de liberar uma campanha ampla.

Nenhuma dessas etapas ocorre automaticamente por aplicar a migration ou por publicar o frontend.
