# Carômetro Frequência — Leitura

Extensão Chrome Manifest V3 para solicitar no Carômetro uma prévia temporária das chamadas já salvas no SIAP.

## Limites desta versão

- Não marca presença ou falta.
- Não aciona `Salvar`, `Confirmar`, exclusão ou cancelamento de registros.
- Não lê login, senha, cookies ou tokens.
- Não persiste nomes ou frequência de estudantes.
- Transfere a prévia apenas entre as abas abertas do SIAP e do Carômetro, na memória do navegador.

## Funções

- Oferece o modo **Frequência Assistida**: o professor abre uma chamada verde e a extensão captura somente a data visível.
- Oferece o modo **Frequência Diária da Escola**: a Secretaria abre uma turma verde ou vermelha e a extensão percorre os meses escolhidos.
- Identifica estudantes pelo nome completo; número de chamada e ordem das listas não são usados pelo Carômetro.
- Não injeta mais o painel antigo no Carômetro e não exibe controles dentro do SIAP.
- Funciona silenciosamente como ponte do botão nativo **Frequência Assistida**.
- Trabalha silenciosamente na aba do SIAP usando a seleção feita no Carômetro.
- Recebe do painel do Carômetro composição/curso, série, turma, turno, disciplina, bimestre e meses.
- Localiza a turma no Diário do Professor e abre a frequência automaticamente.
- Percorre somente datas verdes, aguarda cada postback confirmado e restaura a data originalmente aberta.
- Repete automaticamente até quatro vezes as navegações que o SIAP ignorar, sem marcar nem salvar chamadas.
- Interrompe a consulta com uma orientação específica quando a sessão do SIAP expira.
- Calcula presença, faltas e percentual por estudante.
- Exibe gráficos temporários no próprio Carômetro, sem gravar no banco.
- Na Frequência Diária, conta somente turmas preenchidas no prazo ou fora do prazo; dias brancos, não letivos e exceções são ignorados.
- Identifica alunos pelo nome completo normalizado, sem considerar numeração antes/depois do nome, caixa ou acentuação.

## Instalação pela Chrome Web Store

A versão de distribuição deve ser instalada pelo link exibido no Carômetro. A Chrome Web Store cuida da instalação e das atualizações automáticas, sem exigir descompactação ou Modo do desenvolvedor.

Enquanto a primeira versão aguarda análise da loja, o pacote local anterior continua disponível para não interromper as escolas.

## Instalação local para desenvolvimento

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione esta pasta.
5. Entre normalmente no SIAP e abra o Diário do Professor.

Este procedimento é apenas para desenvolvimento e testes. Usuários finais devem usar a Chrome Web Store.
