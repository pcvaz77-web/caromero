// CARÔMETRO COMERCIAL
// Painel do proprietário da plataforma

(() => {

  function createPlatformNavigation() {

    const nav = document.querySelector('.nav');

    if (!nav) {
      return;
    }

    if (document.getElementById('platformNav')) {
      return;
    }

    const button = document.createElement('button');

    button.id = 'platformNav';
    button.innerHTML = '👑 &nbsp; Plataforma';
    button.className = 'hidden';

    nav.insertBefore(
      button,
      nav.firstChild
    );

    button.onclick = () => {
      alert('Painel da Plataforma em desenvolvimento.');
    };

  }


  async function checkPlatformOwner() {

    const button =
      document.getElementById('platformNav');

    if (!button) {
      return;
    }


    const {
      data: { user }
    } = await db.auth.getUser();


    if (!user) {
      button.classList.add('hidden');
      return;
    }


    const { data, error } = await db
      .from('platform_admins')
      .select('role,status')
      .eq('user_id', user.id)
      .maybeSingle();


    if (error || !data) {
      button.classList.add('hidden');
      return;
    }


    const owner =
      data.role === 'owner' &&
      data.status === 'active';


    button.classList.toggle(
      'hidden',
      !owner
    );

  }


  function start() {

    createPlatformNavigation();

    setTimeout(
      checkPlatformOwner,
      1000
    );

  }


  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      start
    );

  } else {

    start();

  }


})();