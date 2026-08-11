document.addEventListener('DOMContentLoaded', () => {
  // No celular o perfil selecionado fica acima da lista. Assim ele não cobre
  // fotos e nomes enquanto a pessoa navega pelos alunos.
  const detail = document.getElementById('studentDetails');
  const main = document.querySelector('.main');
  const stats = document.querySelector('.stats');
  if (detail && main && stats) main.insertBefore(detail, stats);

  const originalShowStudentDetails = window.showStudentDetails;
  window.showStudentDetails = id => {
    originalShowStudentDetails(id);
    if (!window.matchMedia('(max-width: 800px)').matches) return;
    requestAnimationFrame(() => {
      const headerHeight = document.querySelector('.side')?.getBoundingClientRect().height || 0;
      const target = detail.getBoundingClientRect().top + window.scrollY - headerHeight - 10;
      window.scrollTo({ top: Math.max(0, target), behavior:'smooth' });
    });
  };
});
