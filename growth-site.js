/* Page navigation and the real-photo gallery stay independent of the growth experience. */
(() => {
  'use strict';
  const backToTop = document.querySelector('.back-to-top');
  if (backToTop) {
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = () => {
      frame = 0;
      backToTop.hidden = scrollY < Math.max(240, innerHeight * .6);
      const story = document.querySelector('.growth-story.story-ready');
      backToTop.classList.toggle('is-over-story', Boolean(story && story.getBoundingClientRect().bottom >= innerHeight));
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue, { passive: true });
    addEventListener('pageshow', queue);
    backToTop.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      document.querySelector('.brand')?.focus({ preventScroll: true });
      history.replaceState(history.state, '', '#inicio');
      scrollTo({ top: 0, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
    update();
  }
  const links = [...document.querySelectorAll('[data-gallery-photo]')];
  const track = document.querySelector('.gallery-track');
  const controls = document.querySelector('.carousel-controls');
  if (track && controls && links.length) {
    const previous = controls.querySelector('[data-carousel-prev]');
    const next = controls.querySelector('[data-carousel-next]');
    const counter = controls.querySelector('[data-carousel-count]');
    const progress = controls.querySelector('.carousel-progress');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const slides = links.map(link => link.closest('figure'));
    let requested = null, settleTimer, frame;
    const maximum = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const stops = () => {
      const left = track.getBoundingClientRect().left;
      return [...new Set(slides.map(slide => Math.round(Math.max(0, Math.min(maximum(),
        slide.getBoundingClientRect().left - left + track.scrollLeft)))))];
    };
    function update() {
      frame = null;
      const bounds = track.getBoundingClientRect();
      const visible = slides.map((slide, index) => {
        const r = slide.getBoundingClientRect();
        return Math.min(r.right, bounds.right) - Math.max(r.left, bounds.left) > r.width * .4 ? index + 1 : null;
      }).filter(Boolean);
      counter.textContent = visible.length > 1
        ? String(visible[0]).padStart(2, '0') + '–' + String(visible.at(-1)).padStart(2, '0')
        : String(visible[0] || 1).padStart(2, '0');
      previous.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= maximum() - 2;
      progress.style.setProperty('--carousel-progress', Math.min(100,
        (track.scrollLeft + track.clientWidth) / track.scrollWidth * 100) + '%');
    }
    function go(direction) {
      const positions = stops();
      const from = requested ?? track.scrollLeft;
      requested = direction === 'first' ? 0 : direction === 'last' ? maximum()
        : direction > 0 ? positions.find(x => x > from + 2) ?? maximum()
        : positions.findLast(x => x < from - 2) ?? 0;
      track.scrollTo({ left: requested, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    previous.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    track.addEventListener('keydown', event => {
      const direction = { ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last' }[event.key];
      if (direction === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      go(direction);
    });
    track.addEventListener('scroll', () => {
      if (!frame) frame = requestAnimationFrame(update);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { requested = null; }, 160);
    }, { passive: true });
    // Native touch/trackpad scrolling always takes over from button navigation.
    for (const type of ['pointerdown', 'wheel']) track.addEventListener(type, () => { requested = null; }, { passive: true });
    const resize = () => { requested = null; update(); };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(track);
    else window.addEventListener('resize', resize, { passive: true });
    controls.hidden = false;
    update();
  }
  const dialog = document.querySelector('.photo-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const photo = dialog.querySelector('.gallery-full');
  const caption = dialog.querySelector('.gallery-caption');
  const count = dialog.querySelector('.gallery-count');
  const status = dialog.querySelector('.gallery-status');
  const close = dialog.querySelector('[data-gallery-close]');
  const original = dialog.querySelector('.gallery-original');
  let index = 0, request = 0, opener, previousOverflow, previousPadding;

  async function display(next) {
    index = (next + links.length) % links.length;
    const link = links[index], thumbnail = link.querySelector('img');
    const version = ++request;
    count.textContent = `${String(index + 1).padStart(2, '0')} / ${String(links.length).padStart(2, '0')}`;
    caption.textContent = link.closest('figure').querySelector('figcaption > span').textContent;
    original.href = link.href;
    status.textContent = 'Cargando foto…';
    dialog.dataset.loading = 'true';
    const image = new Image();
    image.src = link.href;
    try {
      await image.decode();
      if (version !== request || !dialog.open) return;
      photo.src = image.src;
      photo.alt = thumbnail.alt;
      status.textContent = '';
    } catch {
      if (version !== request || !dialog.open) return;
      photo.src = thumbnail.currentSrc || thumbnail.src;
      photo.alt = thumbnail.alt;
      status.textContent = 'No se pudo cargar la versión grande. Mostramos la vista previa; podés seguir recorriendo las fotos.';
    }
    dialog.dataset.loading = 'false';
  }

  links.forEach((link, i) => link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
    event.preventDefault();
    opener = link;
    previousOverflow = document.body.style.overflow;
    previousPadding = document.body.style.paddingRight;
    const gutter = innerWidth - document.documentElement.clientWidth;
    if (gutter) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    close.focus({ preventScroll: true });
    display(i);
  }));
  close.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-gallery-prev]').addEventListener('click', () => display(index - 1));
  dialog.querySelector('[data-gallery-next]').addEventListener('click', () => display(index + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      display(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    request++;
    document.body.style.overflow = previousOverflow;
    document.body.style.paddingRight = previousPadding;
    opener?.focus({ preventScroll: true });
  });
  let touch;
  photo.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
  }, { passive: true });
  photo.addEventListener('touchmove', event => { if (event.touches.length !== 1) touch = null; }, { passive: true });
  photo.addEventListener('touchend', event => {
    if (!touch || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) display(index + (dx < 0 ? 1 : -1));
    touch = null;
  }, { passive: true });
  photo.addEventListener('touchcancel', () => { touch = null; }, { passive: true });
})();
