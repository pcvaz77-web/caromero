document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('list');
  if (!list) return;

  // Impede que o toque nos botões de ação também acione o clique do cartão do aluno.
  function protectActionButtons() {
    list.querySelectorAll('.actions-small .edit, .actions-small .delete').forEach(button => {
      if (button.dataset.stopsCard === 'true') return;
      button.dataset.stopsCard = 'true';
      button.addEventListener('click', event => event.stopPropagation());
    });
  }
  new MutationObserver(protectActionButtons).observe(list, { childList:true, subtree:true });
  protectActionButtons();
});
