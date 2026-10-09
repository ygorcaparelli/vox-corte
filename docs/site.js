(() => {
  'use strict';
  const root = document.documentElement;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionButton = document.getElementById('motion-toggle');
  const reel = document.getElementById('hero-reel');
  const hero = document.querySelector('.hero');
  const lab = document.getElementById('experimente');
  const marquee = document.querySelector('.type-marquee');
  let userPaused = false;
  let heroVisible = true;
  let labVisible = false;
  let marqueeVisible = false;
  let manualExample = false;
  let hoveringExample = false;
  let exampleRunning = false;
  let exampleTimers = [];
  let imageAnimation;
  try { userPaused = localStorage.getItem('voxcorte-motion') === 'paused'; } catch { /* Storage is optional. */ }
  const motionAllowed = () => !userPaused && !reducedMotion.matches;

  const words = [...document.querySelectorAll('.sample-word')];
  const durations = [.64, .36, .54, .85, .75, .85, .4, .86, .35, .5, .9];
  const removed = new Set();
  const segments = words.map((word, index) => {
    const segment = document.createElement('div');
    segment.className = 'sample-segment';
    segment.classList.toggle('is-filler', word.hasAttribute('data-filler'));
    segment.style.setProperty('--duration', durations[index]);
    segment.append(document.createElement('span'));
    document.getElementById('sample-track').append(segment);
    return segment;
  });

  function renderExample(announce = false) {
    words.forEach((word, index) => {
      const isRemoved = removed.has(index);
      word.setAttribute('aria-pressed', String(isRemoved));
      word.setAttribute('aria-label', `${isRemoved ? 'Restaurar' : 'Excluir'} a palavra ${word.textContent} do exemplo`);
      segments[index].classList.toggle('is-removed', isRemoved);
    });
    const duration = durations.reduce((sum, value, index) => sum + (removed.has(index) ? 0 : value), 0);
    const format = (number) => number.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    document.getElementById('sample-duration').textContent = `${format(duration)} s`;
    document.getElementById('sample-saved').textContent = removed.size ? `${format(7 - duration)} s a menos` : 'Original preservado';
    if (announce) document.getElementById('sample-announcement').textContent = `${removed.size} palavra(s) removida(s). Duração do exemplo: ${format(duration)} segundos.`;
  }
  function stopExample() {
    exampleTimers.forEach(clearTimeout);
    exampleTimers = [];
    exampleRunning = false;
    lab.classList.remove('is-spotlight');
  }
  function startExample() {
    if (exampleRunning) return;
    exampleRunning = true;
    removed.clear();
    renderExample();
    const later = (callback, delay) => exampleTimers.push(setTimeout(callback, delay));
    later(() => lab.classList.add('is-spotlight'), 1400);
    later(() => { removed.add(3); removed.add(5); renderExample(); lab.classList.remove('is-spotlight'); }, 3000);
    later(() => { removed.clear(); renderExample(); }, 6500);
    later(() => { stopExample(); syncMotion(); }, 9000);
  }
  function syncMotion() {
    const allowed = motionAllowed();
    root.classList.toggle('motion-off', !allowed);
    const inactive = document.hidden || document.body.classList.contains('has-dialog');
    root.classList.toggle('page-inactive', inactive);
    motionButton.setAttribute('aria-pressed', String(!allowed));
    const label = reducedMotion.matches ? 'Animações desativadas pelo sistema' : allowed ? 'Pausar animações' : 'Ativar animações';
    motionButton.setAttribute('aria-label', label);
    motionButton.title = label;
    motionButton.disabled = reducedMotion.matches;
    imageAnimation?.cancel();
    const canPlayReel = allowed && heroVisible && !inactive;
    hero.classList.toggle('is-offscreen', !heroVisible);
    if (canPlayReel) {
      if (!reel.hasAttribute('src')) reel.src = reel.dataset.src;
      reel.play().then(() => {
        if (!motionAllowed() || !heroVisible || document.hidden || document.body.classList.contains('has-dialog')) reel.pause();
      }).catch(() => { /* The poster remains available when autoplay is blocked. */ });
    } else reel.pause();
    const canAnimateExample = allowed && labVisible && !inactive;
    lab.classList.toggle('is-playing', canAnimateExample);
    marquee.classList.toggle('is-playing', allowed && marqueeVisible && !inactive);
    if (canAnimateExample && !manualExample && !hoveringExample && !lab.contains(document.activeElement)) startExample();
    else stopExample();
  }
  motionButton.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('voxcorte-motion', userPaused ? 'paused' : 'running'); } catch { /* No persistence required. */ }
    syncMotion();
    updateScroll();
  });
  reducedMotion.addEventListener('change', () => { syncMotion(); updateScroll(); });
  document.addEventListener('visibilitychange', syncMotion);
  const takeControl = () => { manualExample = true; stopExample(); };
  words.forEach((word, index) => word.addEventListener('click', () => {
    takeControl();
    removed.has(index) ? removed.delete(index) : removed.add(index);
    renderExample(true);
  }));
  document.getElementById('sample-cut').addEventListener('click', () => {
    takeControl(); removed.add(3); removed.add(5); renderExample(true);
  });
  document.getElementById('sample-reset').addEventListener('click', () => {
    takeControl(); removed.clear(); renderExample(true);
  });
  lab.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') { hoveringExample = true; syncMotion(); } });
  lab.addEventListener('pointerleave', () => { hoveringExample = false; syncMotion(); });
  lab.addEventListener('focusin', syncMotion);
  lab.addEventListener('focusout', () => queueMicrotask(syncMotion));
  renderExample();
  syncMotion();
  root.classList.add('motion-ready');

  if ('IntersectionObserver' in window) {
    const motionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        if (entry.target === lab) labVisible = entry.isIntersecting;
        if (entry.target === marquee) marqueeVisible = entry.isIntersecting;
      });
      syncMotion();
    }, { threshold: 0, rootMargin: '-84px 0px 0px 0px' });
    [hero, lab, marquee].forEach((element) => motionObserver.observe(element));
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
      });
    }, { threshold: .08 });
    document.querySelectorAll('.section-heading, .lab-heading, .feature-layout, .secondary-features article, .demo-layout, .story > h2, .story > p, .story-byline, .download-intro, .install-info, .faq-section > div').forEach((element) => {
      element.classList.add('reveal');
      revealObserver.observe(element);
    });
  }

  const navigation = [...document.querySelectorAll('nav a')];
  const navSections = navigation.map((link) => document.querySelector(link.getAttribute('href')));
  let scrollQueued = false;
  function updateScroll() {
    scrollQueued = false;
    const total = root.scrollHeight - innerHeight;
    root.style.setProperty('--page-progress', total > 0 ? Math.min(1, Math.max(0, scrollY / total)) : 0);
    const offset = motionAllowed() ? Math.min(scrollY * .08, 36) : 0;
    hero.style.setProperty('--scene-offset', `${offset}px`);
    let active = -1;
    navSections.forEach((section, index) => { if (section.getBoundingClientRect().top < innerHeight * .45) active = index; });
    navigation.forEach((link, index) => { if (index === active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); });
  }
  function queueScroll() { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); } }
  addEventListener('scroll', queueScroll, { passive: true });
  addEventListener('resize', queueScroll);
  updateScroll();

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
    imageAnimation?.cancel();
    if (motionAllowed() && image.animate) {
      imageAnimation = image.animate([
        { opacity: .25, transform: 'translateY(12px) scale(.985)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    document.getElementById('feature-caption').textContent = feature.caption;
    document.getElementById('painel-recurso').setAttribute('aria-labelledby', tab.id);
  }
  const capture = document.getElementById('capture-dialog');
  const openCapture = document.querySelector('.capture-open');
  if (typeof capture.showModal === 'function') {
    openCapture.addEventListener('click', () => {
      const image = document.getElementById('feature-image');
      const enlarged = document.getElementById('capture-image');
      enlarged.src = image.src;
      enlarged.alt = image.alt;
      capture.showModal();
      document.body.classList.add('has-dialog');
      syncMotion();
    });
    document.getElementById('close-capture').addEventListener('click', () => capture.close());
    capture.addEventListener('click', (event) => { if (event.target === capture) capture.close(); });
    capture.addEventListener('close', () => { document.body.classList.remove('has-dialog'); openCapture.focus({ preventScroll: true }); syncMotion(); });
  } else {
    openCapture.addEventListener('click', () => { location.href = document.getElementById('feature-image').src; });
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
