(() => {
  'use strict';

  const story = document.querySelector('.growth-story');
  const stage = document.querySelector('.growth-stage');
  const header = document.querySelector('.story-header');
  const canvas = document.querySelector('.plant-canvas');
  const sheet = document.querySelector('.plant-fallback img');
  const content = document.querySelector('.story-content');
  const panels = [...document.querySelectorAll('.story-panel')];
  const chapterLinks = [...document.querySelectorAll('.chapter-nav a')];
  const progressBar = document.querySelector('.journey-progress');
  const progressFill = progressBar.querySelector('span');
  const progressLabel = document.querySelector('.progress-label');
  const status = document.querySelector('.asset-status');
  const figure = document.querySelector('.plant-scene');
  const caption = document.querySelector('.plant-caption');
  const video = document.createElement('video');
  video.className = 'plant-video-source';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  figure.querySelector('.plant-viewport').append(video);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-height: 580px)');
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const captions = ['Las primeras raíces.', 'Agua que nutre.', 'Hoja a hoja.', 'Con su raíz. Con vida.'];
  const glowColors = [[22, 46, 37], [25, 55, 49], [44, 61, 31], [57, 60, 30]];
  // The narrative keeps its original coordinate system; the video is now a
  // shorter editorial cut using only existing footage, without image fades.
  const frameCount = 8;
  const videoFps = 24;
  const timing = window.CultivarGrowthTiming;

  let context;
  let matte;
  let asyncMatte;
  let loaded = false;
  let videoReady = false;
  let videoStarted = false;
  let videoFailed = false;
  let loadTimer = 0;
  let seekTimer = 0;
  let requestedTime = 0;
  let lastDecodedTime = -1;
  let enabled = false;
  let visible = true;
  let raf = 0;
  let activeChapter = -1;
  let lastProgress = -1;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let start = 0;
  let distance = 1;
  let chapterStride = 1;
  let contentHeight = 1;
  let panelHeights = [];
  let panelVisibility = [];
  let panelControls = [];
  let journeyState = 'idle';
  let destinationChapter = -1;

  const scrollAssist = window.CultivarStoryScroll?.create({
    getGeometry: () => ({ start, stride: chapterStride, count: panels.length }),
    isEnabled: () => enabled && !reduced.matches && !compact.matches,
    onStateChange: (state, destination = -1) => {
      story.dataset.scrollState = state;
      journeyState = state;
      destinationChapter = destination;
      renderNavigationState();
    },
    onProgress: () => paint(clamp((scrollY - start) / distance)),
    onArrive: (index, explicit) => {
      paint(clamp((scrollY - start) / distance));
      if (explicit) focusChapter(index);
    }
  });

  document.querySelector('#year').textContent = new Date().getFullYear();

  function measure() {
    const headerHeight = header.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
    if (!enabled) return;
    panelHeights = panels.map(panel => panel.offsetHeight);
    if (innerWidth <= 600) {
      story.style.setProperty('--copy-height', `${Math.max(...panelHeights) + 16}px`);
    } else story.style.removeProperty('--copy-height');
    contentHeight = content.clientHeight;
    chapterStride = Math.max(contentHeight, ...panelHeights.map(height => height + 16));
    panelControls = panels.map(panel => [...panel.querySelectorAll('a[href], button')].map(node => ({
      node, top: node.offsetTop, height: node.offsetHeight
    })));
    distance = chapterStride * (panels.length - 1);
    story.style.setProperty('--chapter-stride', `${chapterStride}px`);
    story.style.setProperty('--story-distance', `${distance}px`);
    start = story.getBoundingClientRect().top + scrollY - headerHeight;
    const bounds = canvas.getBoundingClientRect();
    canvasWidth = bounds.width;
    canvasHeight = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(canvasWidth * ratio));
    const pixelHeight = Math.max(1, Math.round(canvasHeight * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    lastProgress = -1;
  }

  function setChapter(index) {
    if (index === activeChapter) return;
    activeChapter = index;
    panels.forEach((panel, i) => panel.classList.toggle('is-active', i === index));
    chapterLinks.forEach((link, i) => {
      if (i === index) link.setAttribute('aria-current', 'step');
      else link.removeAttribute('aria-current');
    });
    renderNavigationState();
    caption.textContent = captions[index];
    figure.setAttribute('aria-label', `Visualización generada del crecimiento de una lechuga. ${captions[index]}`);
    story.dataset.stage = String(index + 1);
  }

  function renderNavigationState() {
    const traveling = journeyState !== 'idle' && destinationChapter >= 0;
    chapterLinks.forEach((link, index) => link.classList.toggle('is-destination', traveling && index === destinationChapter));
    const index = traveling ? destinationChapter : Math.max(0, activeChapter);
    progressLabel.innerHTML = `${String(index + 1).padStart(2, '0')} <span>${traveling ? 'Avanzando…' : '/ 04'}</span>`;
  }

  function moveNarrative(progress) {
    const scrollOffset = progress * distance;
    const trackOffset = -scrollOffset + (contentHeight - chapterStride) / 2;
    story.style.setProperty('--story-offset', `${trackOffset.toFixed(3)}px`);
    panels.forEach((panel, index) => {
      const top = index * chapterStride - scrollOffset + (contentHeight - panelHeights[index]) / 2;
      const inView = top < contentHeight && top + panelHeights[index] > 0;
      if (panelVisibility[index] !== inView) {
        panelVisibility[index] = inView;
        panel.setAttribute('aria-hidden', String(!inView));
        panel.inert = !inView;
      }
      panelControls[index].forEach(({ node, top: controlTop, height }) => {
        node.inert = !(inView && top + controlTop >= 0 && top + controlTop + height <= contentHeight);
      });
    });
  }

  function failVideo() {
    if (videoFailed) return;
    videoFailed = true;
    videoReady = false;
    clearTimeout(loadTimer);
    clearTimeout(seekTimer);
    seekTimer = 0;
    video.pause();
    syncMode();
    showStatus('El video no está disponible. Podés leer el recorrido y ver las fotos reales más abajo.');
  }

  function presentVideo(source, time, cleaned) {
    if (!enabled || !videoReady || !visible || document.hidden) return;
    try {
      const scale = Math.min(canvasWidth * .98 / video.videoWidth, canvasHeight * .98 / video.videoHeight);
      const width = video.videoWidth * scale;
      const height = video.videoHeight * scale;
      canvas.classList.toggle('has-clean-matte', cleaned);
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      context.drawImage(source, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
      canvas.dataset.media = 'video';
      canvas.dataset.renderedTime = time.toFixed(4);
      story.classList.add('video-ready');
    } catch { failVideo(); }
  }

  function drawVideo() {
    if (!enabled || !videoReady || video.readyState < 2) return;
    if (asyncMatte) {
      try { asyncMatte.draw(video, video.currentTime); return; }
      catch { asyncMatte.stop(); asyncMatte = null; }
    }
    try {
      let source = video;
      if (matte) {
        try { source = matte.draw(video, video.currentTime); }
        catch { matte = null; }
      }
      presentVideo(source, video.currentTime, Boolean(matte));
    } catch { failVideo(); }
  }

  function watchSeek() {
    if (!seekTimer) seekTimer = setTimeout(() => {
      seekTimer = 0;
      if (enabled && visible && !document.hidden) failVideo();
    }, 8000);
  }

  function flushSeek() {
    if (!enabled || !videoReady || !visible || document.hidden) return;
    if (video.seeking) { watchSeek(); return; }
    if (Math.abs(video.currentTime - requestedTime) <= .5 / videoFps) {
      drawVideo();
      return;
    }
    // One outstanding decode at a time. Fast wheel/touch input replaces the
    // desired position instead of queuing stale frames or blocking the text.
    try {
      video.currentTime = requestedTime;
      watchSeek();
    } catch { failVideo(); }
  }

  function seekVideo(progress) {
    const frames = Math.round(video.duration * videoFps);
    const targetFrame = timing?.frameCount === frames ? timing.frameAt(progress) : progress * (frames - 1);
    requestedTime = Math.round(targetFrame) / videoFps;
    canvas.dataset.targetTime = requestedTime.toFixed(4);
    // Keep the previous decoded frame while seeking. Redrawing it on every
    // scroll event only adds work and cannot make the new frame arrive sooner.
    flushSeek();
  }

  function startVideo() {
    if (videoStarted || videoFailed || !loaded || reduced.matches || compact.matches) return;
    videoStarted = true;
    const mobile = innerWidth <= 600 || navigator.connection?.saveData;
    video.src = mobile ? 'assets/growth/video/lettuce-growth-polished-v2-mobile.mp4' : 'assets/growth/video/lettuce-growth-polished-v2-hd.mp4';
    loadTimer = setTimeout(failVideo, 20000);
    video.load();
  }

  function paint(progress) {
    if (!enabled || Math.abs(lastProgress - progress) < .00001) return;
    try {
      const position = progress * (frameCount - 1);
      if (videoReady) seekVideo(progress);
      if (!enabled) return;
      canvas.dataset.frame = position.toFixed(4);
      lastProgress = progress;
      moveNarrative(progress);
      setChapter(Math.round(progress * (panels.length - 1)));
      const percent = Math.round(progress * 100);
      progressBar.setAttribute('aria-valuenow', String(percent));
      progressFill.style.transform = `scaleX(${progress})`;
      story.style.setProperty('--water-opacity', (.3 + progress * .65).toFixed(3));
      story.style.setProperty('--water-scale', (.7 + progress * .3).toFixed(3));
      const tone = progress * (glowColors.length - 1);
      const a = Math.floor(tone);
      const b = Math.min(a + 1, glowColors.length - 1);
      const color = glowColors[a].map((value, i) => Math.round(value + (glowColors[b][i] - value) * (tone - a)));
      story.style.setProperty('--glow-color', color.join(' '));
    } catch {
      loaded = false;
      syncMode();
      showStatus('No se pudo activar la animación. El recorrido sigue disponible para leer.');
    }
  }

  function update() {
    raf = 0;
    if (enabled && visible && !document.hidden) paint(clamp((scrollY - start) / distance));
  }

  function queue() {
    if (enabled && visible && !raf) raf = requestAnimationFrame(update);
  }

  function showStatus(message) {
    status.textContent = message;
    status.hidden = false;
  }

  function syncMode() {
    startVideo();
    // Reserve the final layout while media loads, with a matching seedling
    // poster. Reading and chapter navigation never depend on video download.
    const next = loaded && !videoFailed && !reduced.matches && !compact.matches;
    const previousChapter = Math.max(0, activeChapter);
    const previousMode = enabled;
    enabled = next;
    if (!enabled || next !== previousMode) scrollAssist?.cancel();
    story.classList.toggle('story-ready', enabled);
    story.classList.toggle('video-ready', videoReady && canvas.dataset.media === 'video');
    story.dataset.mode = enabled ? (videoReady ? 'animated' : 'loading') : 'static';
    progressBar.hidden = !enabled;
    activeChapter = -1;
    lastProgress = -1;
    panelVisibility = [];
    if (enabled) {
      measure();
      paint(clamp((scrollY - start) / distance));
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      clearTimeout(seekTimer);
      seekTimer = 0;
      video.pause();
      panels.forEach(panel => {
        panel.removeAttribute('aria-hidden');
        panel.inert = false;
        panel.querySelectorAll('a[href], button').forEach(node => { node.inert = false; });
      });
      setChapter(previousChapter);
      figure.setAttribute('aria-label', 'Visualización generada de una lechuga madura con sus raíces hidropónicas expuestas.');
      caption.textContent = 'La planta entera, con su raíz.';
      // Switching modes must not leave the reader stranded after the tall scene.
      if (previousMode && visible) panels[previousChapter].scrollIntoView({ behavior: 'instant', block: 'start' });
    }
    if (next !== previousMode && next) queue();
  }

  function onResize() {
    scrollAssist?.cancel();
    measure();
    queue();
  }

  function alignLinkedChapter() {
    const index = panels.findIndex(panel => `#${panel.id}` === location.hash);
    if (!enabled || index < 0) return;
    scrollAssist?.cancel();
    measure();
    const progress = index / (panels.length - 1);
    scrollTo({ top: start + distance * progress, behavior: 'instant' });
    paint(progress);
  }

  function focusChapter(index) {
    panels[index].tabIndex = -1;
    panels[index].focus({ preventScroll: true });
    panels[index].addEventListener('blur', () => panels[index].removeAttribute('tabindex'), { once: true });
  }

  document.querySelectorAll('[data-story-jump]').forEach(link => {
    link.addEventListener('click', event => {
      if (!enabled || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const index = Number(link.dataset.storyJump);
      const progress = index / (panels.length - 1);
      measure();
      if (scrollAssist) { scrollAssist.goTo(index); return; }
      scrollTo({ top: start + distance * progress, behavior: 'instant' });
      paint(progress);
      focusChapter(index);
    });
  });

  reduced.addEventListener('change', syncMode);
  compact.addEventListener('change', syncMode);
  addEventListener('resize', onResize);
  addEventListener('scroll', queue, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(alignLinkedChapter));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastProgress = -1;
      queue();
    }
  });
  video.addEventListener('loadeddata', () => {
    if (videoFailed || videoReady) return;
    if (!Number.isFinite(video.duration) || !video.videoWidth || video.duration < 1) return failVideo();
    clearTimeout(loadTimer);
    videoReady = true;
    syncMode();
    alignLinkedChapter();
  });
  video.addEventListener('seeked', () => {
    // A server without byte-range support can report seeked without advancing.
    // Do not keep resetting the watchdog when decoding makes no progress.
    if (Math.abs(video.currentTime - lastDecodedTime) > .5 / videoFps ||
        Math.abs(video.currentTime - requestedTime) <= .5 / videoFps) {
      clearTimeout(seekTimer);
      seekTimer = 0;
      lastDecodedTime = video.currentTime;
    }
    if (!visible || document.hidden) return;
    drawVideo();
    flushSeek();
  });
  video.addEventListener('error', failVideo);
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(header);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        lastProgress = -1;
        queue();
      }
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }).observe(story);
  }

  async function initialize() {
    measure();
    story.dataset.mode = 'static';
    try {
      context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      try { matte = window.CultivarGrowthMatte?.createRenderer(); } catch { matte = null; }
      try {
        asyncMatte = window.CultivarGrowthMatte?.createAsyncRenderer(
          (source, time) => presentVideo(source, time, true),
          () => { asyncMatte = null; if (!video.seeking) drawVideo(); }
        );
      } catch { asyncMatte = null; }
      document.querySelectorAll('.plant-fallback img, .plant-loading').forEach(image => {
        window.CultivarGrowthMatte?.enhancePoster(image);
      });
      await sheet.decode();
      if (!sheet.naturalWidth || !sheet.naturalHeight) throw new Error('Sequence unavailable');
      loaded = true;
      syncMode();
      // Native fragment scrolling must finish before centering a chapter in
      // the transformed narrative. Font loading can also change its geometry.
      alignLinkedChapter();
      const pageLoaded = document.readyState === 'complete' ? Promise.resolve() :
        new Promise(resolve => addEventListener('load', resolve, { once: true }));
      Promise.all([pageLoaded, document.fonts?.ready]).then(() => requestAnimationFrame(alignLinkedChapter));
    } catch {
      loaded = false;
      syncMode();
      if (!sheet.complete || !sheet.naturalWidth) {
        figure.hidden = true;
        story.classList.add('asset-error');
      }
      showStatus('La experiencia animada no está disponible. Podés leer el recorrido y ver las fotos reales más abajo.');
    }
  }

  initialize();
  if (document.fonts) document.fonts.ready.then(onResize);
})();
