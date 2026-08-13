# Atualização de dados do CARÔMETRO

Para evitar falhas quando novos alunos ou novas funções forem adicionados:

- A carga principal de alunos e turmas é feita somente por `window.load` em `student-edit-improvements.js`.
- Nenhuma nova função deve substituir ou envolver `window.load`.
- Depois de atualizar alunos e turmas, a carga central dispara `carometro:data-loaded`.
- Recursos que dependem dos dados (Uniforme, Ocorrência e futuros recursos) devem ouvir esse evento e atualizar apenas a própria interface.
- Alterações locais devem atualizar o estado do recurso imediatamente e invalidar consultas antigas quando necessário.

Exemplo para uma nova função:

```js
document.addEventListener('carometro:data-loaded', () => {
  // Atualize somente os elementos da nova função.
});
```

Essa regra evita que uma resposta lenta ou uma funcionalidade nova substitua dados mais recentes de alunos, turmas ou contadores.
