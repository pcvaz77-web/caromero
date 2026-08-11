document.addEventListener('DOMContentLoaded', () => {
  const detail = document.getElementById('studentDetails');
  if (!detail) return;

  function addCloseButton() {
    if (detail.classList.contains('hidden') || detail.querySelector('.student-detail-close')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'student-detail-close';
    button.setAttribute('aria-label', 'Fechar perfil do aluno');
    button.textContent = '×';
    button.onclick = event => {
      event.stopPropagation();
      detailStudentId = null;
      render();
    };
    detail.prepend(button);
  }

  new MutationObserver(addCloseButton).observe(detail, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  addCloseButton();
});
