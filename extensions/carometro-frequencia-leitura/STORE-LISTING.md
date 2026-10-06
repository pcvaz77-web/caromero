# Chrome Web Store — Carômetro Frequência — Leitura

## Distribuição recomendada

- Visibilidade: não listado.
- Região: Brasil.
- Idioma principal: português (Brasil).
- Categoria: Produtividade.
- Publicação automática depois da aprovação.

## Descrição curta

Consulta frequências e notas finais bimestrais exibidas no SIAP.

## Descrição detalhada

Carômetro Frequência — Leitura conecta, no navegador do usuário, as telas de frequência e notas finais bimestrais do SIAP ao Carômetro.

A extensão oferece três fluxos de leitura:

- Frequência Assistida, para consultar chamadas já salvas no Diário do Professor.
- Frequência da Secretaria, para consultar turmas preenchidas na Frequência Diária.
- Notas finais bimestrais, para ler a coluna “Média Bimestral Final” ou “Notas Finais” da tela de Notas aberta pelo professor.

Na frequência, o usuário escolhe os meses e inicia a leitura. Nas notas, o professor conselheiro abre a turma, disciplina e bimestre no SIAP e solicita uma prévia no Carômetro. Na tela de modelo, a extensão confere o alinhamento das matrículas com a coluna final. Na tela clássica, lê o nome e a nota final da mesma linha. O Carômetro mostra as notas para revisão antes de qualquer importação.

Segurança e privacidade:

- funciona somente quando o usuário inicia a leitura;
- consulta apenas informações já exibidas no SIAP;
- não marca, salva, confirma, exclui ou altera registros no SIAP;
- não lê nem armazena login, senha, cookies ou tokens;
- não mantém nomes, frequências ou notas no armazenamento da extensão;
- transfere a prévia somente entre as abas abertas do SIAP e do Carômetro.

Para usar, é necessário possuir acesso autorizado ao SIAP e ao Carômetro.

## Finalidade única

Ler, mediante solicitação do usuário, frequências e notas finais bimestrais exibidas no SIAP e entregar uma prévia ao Carômetro.

## Justificativas de permissões

- `tabs`: localizar a aba do SIAP que o próprio usuário abriu e navegar entre as telas de consulta necessárias.
- `scripting`: executar o leitor somente nas páginas autorizadas do SIAP.
- `https://siap.educacao.go.gov.br/*`: consultar chamadas, frequências e notas finais já exibidas.
- `https://sistemacarometro.com.br/*`: receber a solicitação de leitura e devolver a prévia ao Carômetro.

## Declarações de dados

A extensão processa temporariamente nomes, matrículas para alinhamento de linhas, registros de frequência e notas finais para executar a função solicitada. A extensão não possui armazenamento persistente. Notas só são gravadas no Carômetro após revisão e confirmação do conselheiro, para exibição e relatórios autorizados. Os dados não são vendidos, usados para publicidade ou análise de crédito.

Política de privacidade: `https://sistemacarometro.com.br/frequencia-extensao-privacidade.html`

## Instruções de teste para a equipe da loja

1. Instale a extensão.
2. Abra `https://sistemacarometro.com.br/` e uma sessão autorizada em `https://siap.educacao.go.gov.br/`.
3. No Carômetro, abra Frequência Assistida, Frequência da Secretaria ou o Painel da turma de um professor conselheiro.
4. Para notas, abra a tela Notas do SIAP com turma, disciplina e bimestre selecionados e clique em “Extrair notas do SIAP” no Carômetro.
5. Confirme que a prévia da coluna final da tela de Notas aparece e que nenhum controle de salvar, confirmar ou excluir no SIAP é acionado.

O acesso aos dados reais depende de credenciais institucionais do SIAP e do Carômetro. A revisão de código demonstra que a extensão não coleta credenciais e não altera frequências.
