# Correção de Provas — 0.28.4

Serviço: https://correcao.sistemacarometro.com.br · Worker `correcao-de-provas`.
Extensão de desenvolvimento: `extensions/assistente-siap`. Instalação local: `C:/Users/pcvaz/Documents/Codex/Assistente-SIAP-v0.22.0` (o nome histórico da pasta não indica a versão do manifesto).

## Fluxo atual

1. Abra a turma e a avaliação no SIAP; conecte o celular pelo QR. Com a tela de lançamento aberta, apenas nomes e identificadores necessários da chamada são sincronizados para a sessão temporária. Antes dessa tela, ainda é possível capturar o gabarito; a lista de alunos depende da abertura da avaliação.
2. Fotografe o gabarito. A foto é enviada ao fotografar. Confira alternativas, foto e intervalos por disciplina no próprio celular; confirme uma vez.
3. Escolha o aluno e a câmera abre. A seleção é obrigatória; a IA não lê nomes manuscritos. Um toque captura e envia. A barra azul indica processamento sem estimar porcentagem. Ao concluir a leitura, a barra fica cheia e a moldura azul; o professor avança para conferir o resultado.
4. O celular mostra nome, acertos totais e por disciplina. Confira foto e alternativas se necessário; confirme o resultado e passe ao próximo aluno. O vínculo usa exclusivamente o aluno escolhido pelo professor. Respostas incertas ficam pendentes.
5. O computador recebe os resultados conferidos. O botão Enviar identificados para o SIAP confirma o lote final, preenche presença e acertos. Sem foto nunca implica falta. O Assistente não clica em Salvar. O professor confere os campos e salva no próprio SIAP. Uma recarga pausa o lote e exige retomada explícita. Mudanças no gabarito ou nas capturas interrompem o restante do lote. Nada é salvo por uma ação do celular isoladamente.

## Isolamento e privacidade

- Planejamento, frequência, execução de conteúdo e PEI não foram reescritos. A extensão leitora de frequência é outro produto, não alterado.
- Licença existente validada na criação e heartbeat. Tokens de celular e computador separados e guardados como hash; QR no fragmento; chave OpenAI somente no segredo do Worker.
- Sessões novas 0.25.1 habilitam explicitamente conferência móvel. Sessões antigas mantêm suas capacidades anteriores: não ganham acesso a nomes/fotos/resultados. Reabrir o QR de uma sessão antiga não muda seu protocolo.
- O celular pareado recebe a lista mínima da turma e resultados temporários, jamais a credencial do computador. A lista não é enviada ao modelo de IA. Vinculação a outra turma é bloqueada; ações móveis validam aluno e gabarito atual e respeitam pausa.
- Expiração de duas horas, exclusão explícita ao encerrar, limpeza por alarme. Sem histórico escolar no serviço e sem registro de nomes/fotos em logs. `store:false` na API não promete retenção zero em todos os provedores.
- Até 120 capturas por sessão e cinco fotos ainda não enviadas na memória da aba. Não fechar/recarregar a aba com fotos pendentes.
- IA transcreve a foto; código determinístico compara respostas, divide disciplinas e conta acertos. O detector local identifica padrões circulares estáveis e inicia a captura; não interpreta alternativas. Ler agora é uma alternativa quando o detector não reconhecer o enquadramento. O modelo valida todas as questões. A detecção foi verificada em câmera sintética, cartão de 15 questões e trecho fotografado de Português; precisa de validação na câmera física Android.
- gpt-5.6-sol; até duas imagens por sessão em paralelo e três globais. Os limites da conta podem ser compartilhados com outras funções. Falhas não geram ciclos de cobrança automática: repetir a leitura exige ação explícita e tem limite.
- Duplicidades, total incompatível, marcações incertas, alunos indisponíveis e campos já preenchidos bloqueiam os respectivos lançamentos. Mudança de gabarito invalida conferências anteriores; se já houve preenchimento, exige conferir campos manualmente.

## Validação

52 testes passaram: inclui regressão existente, captura, conferência móvel, identidade escolhida antes da foto, atualização no painel, isolamento de tokens/turma, mudança de gabarito, paralelismo e salvamento com/sem pendências. Teste visual em viewport 390×844 com câmera e alunos fictícios confirmou gabarito → escolha do aluno → resultado → próximo aluno. A câmera física Android e o salvamento real no SIAP não foram executados pelo agente nesta atualização.

```powershell
node --test extensions/assistente-siap/tests/*.test.cjs services/siap-exam/test/*.test.mjs
node services/siap-exam/test/demo-server.mjs
```

O servidor de demonstração só escuta em 127.0.0.1:4399; `/camera-demo` é uma simulação e não faz chamadas de IA. O teste opt-in `test/live-vision.mjs` utiliza somente cartão fictício; sucesso sintético não garante precisão em provas manuscritas reais.

Publicação e atualização local foram autorizadas na conversa. Commit, push e publicação do serviço autorizados; sem publicação na Chrome Web Store. Não usar estudantes reais como teste de escrita.

## Alterações 0.26.0

O QR é gerado automaticamente apenas na tela de avaliação com a lista de alunos. Sessões novas incluem disciplina e total de questões; não começar na tela de filtros. A mesma capacidade temporária dá acesso à lista mínima e ao contexto, sem colocar nomes diretamente na imagem do QR.

A IA do gabarito extrai somente a disciplina selecionada e identifica os números impressos. `firstQuestion` preserva a origem: 21–40 e 31–50 têm índices internos 1–20, com validação explícita e rótulos originais no celular. Provas posteriores devem conter exatamente essa quantidade e numeração. Questões de outras disciplinas não são retornadas. A chamada de leitura do aluno reutiliza apenas estrutura, nunca respostas oficiais, e pede somente números/marcas e aviso de leitura. Teste fictício de 15 questões levou 4,7 s, com 15 marcas corretas; não é garantia de latência em produção.

A barra representa etapas (captura/envio/fila/leitura/concluída), sem estimativa temporal. Ela só completa após o retorno validado. Fundo e moldura azuis, nome/acertos visíveis e Enviar resultado e próximo aluno na câmera. Dúvidas abrem a revisão. O lançamento escolar final continua no computador, com as validações existentes.

A primeira detecção é apenas um sinal de enquadramento: não afirma que todas as questões foram lidas. A validação de sequência/total e a conferência do professor permanecem obrigatórias. A leitura de nomes manuscritos está desativada.

## Otimização adicional da leitura do aluno

A resposta da IA usa mapa compacto de número impresso para alternativa, validando todas as chaves esperadas. Mantidos modelo, resolução, revisão e tratamento de dúvidas. O alarme de entrada de prova do aluno foi antecipado de 1000 para 100 ms (o agendamento efetivo depende do serviço). Teste sintético único reconheceu 15/15 marcas em 3,6 s; não é medição de latência em Android. Os 12 testes do serviço passaram. Mudança só no servidor: não exige atualizar a extensão nem perder a sessão atual.

## Gabarito oficial e identidade Carômetro

Leitura oficial com disciplina conhecida retorna somente números impressos, marcas, alternativas e aviso; títulos e divisões já conhecidos são preenchidos pelo sistema. Mantidos modelo, imagem em alta resolução e validação de sequência/quantidade. Agendamento inicial em 100 ms para ambas as capturas. Teste sintético único: 15/15 marcas em 4,3 s; tempo real depende da foto, rede e fila. Os 52 testes passaram.

Página móvel com identidade Carômetro, azul/marinho, seletor nativo arredondado, nomes em destaque e foco visível. Conferida em viewport de 390×844. Alterações desta etapa são no serviço; extensão permanece 0.26.0.

## Concessão específica de Correção de Provas

Migration 140 cria acesso independente por conta, administrado exclusivamente pelo proprietário. A função de licença retorna examAccess; o serviço exige esse acesso para criar e renovar a sessão, recusando licença geral isolada. A sessão não ultrapassa a validade da concessão. Revogação detectada no heartbeat pausa a sessão (normalmente até 45 segundos). Não há concessões automáticas. Painel com conceder, renovar, cancelar, dias, data final e permanente; as escolas apenas agrupam os usuários.

83 testes passaram, incluindo checkout e regressões. SQL validado também em Postgres local com papéis autenticados, RLS, datas e auditoria. Aplicação autorizada pelo usuário em 21/09/2026.


## Correções locais 0.28.4 — 21/09/2026

Painel recebe novas provas mesmo com foco, preservando edição e cursor; conexão transitória é recuperada sem iniciar lote. Atualização mais frequente enquanto há leitura ou conferência pendente. Lotes exigem clique no computador, ficam pausados após recarregar e verificam a revisão das capturas antes de cada etapa. O professor salva no SIAP; não há clique automático em Salvar. É possível cancelar o restante de um lote preservando os campos já preenchidos.

Controle de preenchidos separado por chamada. Revisões antigas são recusadas pelo serviço quando conflitam com outra revisão ou gabarito; resultados já conferidos e inalterados no celular dispensam reenvio da revisão. Encerrar apaga todas as sessões temporárias conhecidas daquela aba e não afirma exclusão quando a operação falha.

Avisos de leitura na câmera encaminham à conferência detalhada. Mudança de gabarito durante a conferência exige reabri-la. Envio, espera na fila e processamento passam a ter duração exibida na lista móvel, sem logs de fotos ou nomes. Blocos de imagem são gravados/lidos em paralelo, mantendo bytes e limites. O modelo e a qualidade da imagem foram preservados; ganho de latência ainda precisa ser medido em câmera física.

Validação: 99 testes automatizados com dados fictícios; validação de sintaxe e empacotamento do Worker em dry-run. Não foi feito teste com câmera física nem escrita no SIAP real. Publicação e cópia local autorizadas explicitamente e concluídas em 21/09/2026. Worker: 4f1613d1-e5fd-49b1-854b-3976796218b5. capture.js, card-detector.js, exam-core.js e index.html conferidos no domínio oficial por HTTP 200 e SHA256 (quebras de linha normalizadas). Manifesto e exam-panel.js copiados para a instalação local e conferidos por SHA256, com backup em TEMP. Ativação no Chrome ainda depende de recarregar a extensão: a ferramenta de navegador não permite acessar chrome://extensions/. Sem commit ou push.
