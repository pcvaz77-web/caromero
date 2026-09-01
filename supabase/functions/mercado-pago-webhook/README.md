# mercado-pago-webhook

Secrets necessários: `MERCADO_PAGO_ACCESS_TOKEN`,
`MERCADO_PAGO_WEBHOOK_SECRET`, `PUBLIC_SITE_URL`.

Configure no Mercado Pago os eventos `subscription_preapproval`,
`subscription_authorized_payment` e `payment`. A função valida
`x-signature` antes de consultar a API ou gravar o evento.
