# generate-siap-ai-draft

Gera quatro campos pedagógicos para planejamento ou PEI usando a OpenAI.

## Garantias

- exige sessão autenticada do Carômetro;
- exige vínculo escolar ativo e `can_use_siap_assistant`, salvo administrador da escola;
- rejeita origens não configuradas;
- limita tamanho e quantidade de todos os campos;
- solicita saída estruturada com exatamente quatro textos;
- usa `store: false` e não registra o conteúdo pedagógico nos logs;
- nunca recebe nome, matrícula ou outro identificador do estudante pelo contrato da função.

## Segredos necessários

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (opcional; padrão `gpt-5.6-terra`)
- `ALLOWED_ORIGINS` com o domínio do Carômetro e a origem da extensão aprovada.

O segredo local em `.env.local` serve somente para preparação. A publicação da função e o cadastro do segredo no Supabase são etapas separadas e exigem autorização explícita.
