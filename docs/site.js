(() => {
  'use strict';
  const features = {
    texto: { image: 'assets/transcricao.png', alt: 'Transcrição real com palavras e timestamps no editor Vox Corte.', caption: 'Transcrição por palavra, com processamento no computador.' },
    cortes: { image: 'assets/editor.png', alt: 'Frase excluída e intervalos de vídeo na linha do tempo real do Vox Corte.', caption: 'Vídeo e áudio vinculados. Cortes reversíveis, com prévia da montagem.' },
    projetos: { image: 'assets/projetos.png', alt: 'Biblioteca real de projetos locais do Vox Corte.', caption: 'Projetos locais para continuar de onde você parou.' },
  };
  const tabs = [...document.querySelectorAll('[data-feature]')];
  function activate(tab) {
    const feature = features[tab.dataset.feature];
    for (const item of tabs) {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
    }
    const image = document.getElementById('feature-image');
    image.src = feature.image;
    image.alt = feature.alt;
    document.getElementById('feature-caption').textContent = feature.caption;
    document.getElementById('painel-recurso').setAttribute('aria-labelledby', tab.id);
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', (event) => {
      const index = tabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      activate(tabs[next]);
      tabs[next].focus();
    });
  }
  document.getElementById('copy-hash').addEventListener('click', async () => {
    const feedback = document.getElementById('copy-feedback');
    try {
      await navigator.clipboard.writeText(document.getElementById('installer-hash').textContent.trim());
      feedback.textContent = 'Hash copiado.';
    } catch {
      feedback.textContent = 'Não foi possível copiar automaticamente. Selecione o hash acima ou baixe o arquivo de verificação.';
    }
  });
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  if (platform && !/win/i.test(platform)) {
    document.getElementById('platform-note').textContent = 'Você está acessando por outro sistema. O instalador disponível é somente para Windows x64.';
  }
})();
