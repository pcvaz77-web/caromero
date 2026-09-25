# generate-siap-ai-draft

Gera quatro campos pedagógicos para planejamento ou PEI usando a OpenAI.

## Garantias

- aceita a sessão autenticada da conta no site ou uma sessão do Assistente criada a partir dela;
- verifica a concessão individual do Carômetro, a assinatura paga ou os usos restantes do teste grátis;
- não cria sessão a partir de um endereço de e-mail sem autenticação;
- revoga no servidor a sessão persistente quando o usuário escolhe **Sair**;
- rejeita origens não configuradas;
- limita tamanho e quantidade de todos os campos;
- solicita saída estruturada com exatamente quatro textos;
- usa `store: false` e não registra o conteúdo pedagógico nos logs;
- nunca recebe nome, matrícula ou outro identificador do estudante pelo contrato da função.

## Segredos necessários

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (opcional; padrão `gpt-5.6-luna`)
- `ALLOWED_ORIGINS` com o domínio do Carômetro e a origem da extensão aprovada.

O segredo local em `.env.local` serve somente para preparação. A publicação da função e o cadastro do segredo no Supabase são etapas separadas e exigem autorização explícita.
