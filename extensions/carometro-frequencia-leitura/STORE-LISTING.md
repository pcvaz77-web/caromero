# Chrome Web Store — Carômetro Frequência — Leitura

## Distribuição recomendada

- Visibilidade: não listado.
- Região: Brasil.
- Idioma principal: português (Brasil).
- Categoria: Produtividade.
- Publicação automática depois da aprovação.

## Descrição curta

Consulta frequências já salvas no Diário do Professor e na Frequência Diária do SIAP.

## Descrição detalhada

Carômetro Frequência — Leitura conecta, no navegador do usuário, as telas de frequência do SIAP aos relatórios temporários do Carômetro.

A extensão oferece dois fluxos relacionados ao mesmo objetivo:

- Frequência Assistida, para consultar chamadas já salvas no Diário do Professor.
- Frequência da Secretaria, para consultar turmas preenchidas na Frequência Diária.

O usuário escolhe os meses no Carômetro e inicia a leitura. A extensão identifica os estudantes pelo nome completo, ignora numeração e diferenças entre letras maiúsculas, minúsculas e acentos, e devolve uma prévia com presenças, faltas e percentuais.

Segurança e privacidade:

- funciona somente quando o usuário inicia a leitura;
- consulta apenas frequências que já foram preenchidas no SIAP;
- não marca, salva, confirma, exclui ou altera frequências;
- não lê nem armazena login, senha, cookies ou tokens;
- não mantém nomes ou frequências no armazenamento da extensão;
- transfere a prévia somente entre as abas abertas do SIAP e do Carômetro.

Para usar, é necessário possuir acesso autorizado ao SIAP e ao Carômetro.

## Finalidade única

Ler, mediante solicitação do usuário, frequências escolares já registradas no SIAP e entregar uma prévia temporária ao Carômetro.

## Justificativas de permissões

- `tabs`: localizar a aba do SIAP que o próprio usuário abriu e navegar entre as telas de consulta necessárias.
- `scripting`: executar o leitor somente nas páginas autorizadas do SIAP.
- `https://siap.educacao.go.gov.br/*`: consultar as chamadas e frequências já preenchidas.
- `https://sistemacarometro.com.br/*`: receber a solicitação de leitura e devolver a prévia ao Carômetro.

## Declarações de dados

A extensão processa temporariamente nomes de estudantes e registros de frequência para executar a função solicitada. Esses dados não são vendidos, usados para publicidade, análise de crédito ou finalidade alheia à leitura de frequência. A extensão não possui armazenamento persistente nem envia os dados a serviços de terceiros.

Política de privacidade: `https://sistemacarometro.com.br/frequencia-extensao-privacidade.html`

## Instruções de teste para a equipe da loja

1. Instale a extensão.
2. Abra `https://sistemacarometro.com.br/` e uma sessão autorizada em `https://siap.educacao.go.gov.br/`.
3. No Carômetro, abra Frequência Assistida ou Frequência da Secretaria.
4. Selecione os meses e inicie a leitura com uma chamada/turma já preenchida no SIAP.
5. Confirme que a prévia aparece no Carômetro e que nenhum controle de salvar, confirmar ou excluir frequência é acionado.

O acesso aos dados reais depende de credenciais institucionais do SIAP e do Carômetro. A revisão de código demonstra que a extensão não coleta credenciais e não altera frequências.
