# Assistente SIAP — Correção de Provas 0.28.0

O fluxo de correção agora concentra gabarito, escolha do aluno, leitura e conferência no celular. O painel do SIAP faz o lançamento final dos resultados confirmados. Veja `../../services/siap-exam/README.md` para os limites e validação atuais. A pasta local foi atualizada; o Chrome requer recarregar a extensão. Nenhuma publicação na Web Store.

As mudanças nos arquivos originais estão limitadas a:

- `src/core.js`: reconhecimento das rotas de seleção e lançamento de avaliação.
- `src/content.js`: rótulo, abertura automática nessa rota e montagem do novo módulo no painel existente.
- `src/service-worker.js`: carregamento do transportador separado de correção.
- `manifest.json`: versão piloto, scripts/estilo novos e permissão para o domínio de correção proposto.
- `tests/device-session.test.cjs`: harness suporta importScripts e vários listeners, executando os testes existentes de licença sem ignorar o módulo novo.

Não foram reescritos os fluxos de planejamento, frequência, conteúdo ou PEI. A extensão de leitura de frequência do Carômetro é outro produto e não foi modificada.

O serviço e os limites de validação estão documentados em `../../services/siap-exam/README.md`. O pacote local não deve ser tratado como publicação na Chrome Web Store nem como piloto já validado com dados reais.

`src/vendor/qrcode.js` é qrcode-generator 2.0.4 (Kazuhiko Arase, licença MIT indicada no cabeçalho), obtido do pacote oficial npm. O QR é produzido localmente.

## 0.26.1

Minimizar prevalece sobre a abertura automática da correção em novos carregamentos do SIAP. O usuário reabre pelo botão flutuante ou pela extensão. Ícone flutuante centralizado com dimensões explícitas e estilos isolados da página. 53 testes passaram, incluindo recarregamentos sucessivos após minimizar.

## 0.26.2

A tela de lançamento aplica `img { margin: 2px 2px 3px !important }`. Neutralizada essa margem apenas na imagem do botão flutuante; a medição anterior mostrava deslocamento de 2 px nos dois eixos.

## 0.27.0

Correção de Provas exige concessão específica por conta, com prazo próprio no painel do proprietário. A licença geral continua governando planejamento, frequência, conteúdo e PEI. Conta somente com correção também pode conectar uma sessão da extensão. Atualize em conjunto com a função de licença e serviço de correção.

## 0.28.0

Compras pela Hotmart: crédito avulso vinculado ao bloco no primeiro acesso pelo celular, reutilizável nas turmas até finalização explícita; planos com correção válidos durante a vigência. Ofertas dependem de ativação do catálogo no servidor. Concessões gratuitas continuam válidas. Esta pasta/pacote não comprova publicação na Chrome Web Store.
