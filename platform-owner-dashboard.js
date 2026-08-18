// CARÔMETRO COMERCIAL
// Painel do proprietário da plataforma
// Módulo inicial
//
// Objetivo:
// Criar a entrada segura do painel da plataforma.
// Não altera permissões existentes.

(() => {

  const createPlatformNavigation = () => {
    const nav = document.querySelector('.nav');

    if (!nav) return;

    if (document.getElementById('platformNav')) return;

    const button = document.createElement('button');

    button.id = 'platformNav';
    button.className = 'hidden';
    button.innerHTML = '👑 &nbsp; Plataforma';

    const permissions = document.getElementById('permissionsNav');

    if (permissions) {
      nav.insertBefore(button, permissions);
    } else {
      nav.appendChild(button);
    }

    button.onclick = () => {
      alert('Painel da Plataforma em desenvolvimento.');
    };
  };


  const checkPlatformOwner = async () => {

    try {

      const user = await signedIn();

      if (!user) return;


      const { data, error } = await db
        .from('platform_admins')
        .select('role,status')
        .eq('user_id', user.id)
        .single();


      if (error || !data) {
        document
          .getElementById('platformNav')
          ?.classList.add('hidden');

        return;
      }


      const isOwner =
        data.role === 'owner' &&
        data.status === 'active';


      document
        .getElementById('platformNav')
        ?.classList.toggle(
          'hidden',
          !isOwner
        );


    } catch (error) {

      console.error(
        'Erro ao verificar proprietário:',
        error
      );

    }

  };


  document.addEventListener('DOMContentLoaded', () => {

  createPlatformNavigation();

  setTimeout(
    checkPlatformOwner,
    500
  );

});


document.addEventListener(
  'carometro:permission-refresh',
  checkPlatformOwner
);