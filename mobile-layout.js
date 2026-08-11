document.addEventListener('DOMContentLoaded', () => {
  // No celular o perfil selecionado fica acima da lista. Assim ele não cobre
  // fotos e nomes enquanto a pessoa navega pelos alunos.
  const detail = document.getElementById('studentDetails');
  const main = document.querySelector('.main');
  const stats = document.querySelector('.stats');
  if (detail && main && stats) main.insertBefore(detail, stats);
});
