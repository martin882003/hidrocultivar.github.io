/* One complete chapter per gesture; ordinary scrolling outside the story. */
(() => {
  'use strict';

  function nextChapter({ y, start, stride, count, direction }) {
    if (![y, start, stride, count, direction].every(Number.isFinite) ||
        stride <= 0 || count < 2 || !direction) return null;
    const position = (y - start) / stride;
    const tolerance = 2 / stride;
    if (position < -tolerance || position > count - 1 + tolerance) return null;
    const index = direction > 0 ? Math.floor(position + tolerance) + 1 :
      Math.ceil(position - tolerance) - 1;
    return index >= 0 && index < count ? { index, target: start + index * stride } : null;
  }

  function ease(value) {
    const t = Math.max(0, Math.min(1, value));
    // Wheel input needs an immediate visible response, followed by a gradual
    // stop. A zero-speed start felt unresponsive, particularly on small screens.
    return t === 1 ? 1 : t * (1.4 + t * (.2 - .6 * t));
  }

  function create({ getGeometry, isEnabled, onArrive, onStateChange, onProgress }) {
    let animation = 0;
    let moving = false;
    let expectedY = scrollY;
    let wheelTimer = 0;
    let wheelConsumed = false;
    let wheelTotal = 0;
    let wheelDirection = 0;
    let heldKey = '';
    let touch = null;
    let entryTimer = 0;
    let nativeEntry = false;
    const canMove = () => isEnabled() && !document.hidden;
    const editable = node => node instanceof Element &&
      node.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]');
    const selected = () => document.getSelection()?.isCollapsed === false;

    function inside(y = scrollY) {
      const { start, stride, count } = getGeometry();
      return y >= start - 2 && y <= start + stride * (count - 1) + 2;
    }

    function resetWheel() {
      clearTimeout(wheelTimer);
      wheelTimer = 0;
      wheelConsumed = false;
      wheelTotal = wheelDirection = 0;
    }

    function wheelActivity() {
      clearTimeout(wheelTimer);
      // A stream of trackpad momentum remains the same gesture, even after
      // the animation finishes. No queued destinations or trailing stages.
      wheelTimer = setTimeout(resetWheel, 260);
    }

    function cancel() {
      cancelAnimationFrame(animation);
      clearTimeout(entryTimer);
      animation = entryTimer = 0;
      moving = nativeEntry = false;
      heldKey = '';
      touch = null;
      resetWheel();
      onStateChange('idle');
    }

    function travel(index, target, explicit = false) {
      cancelAnimationFrame(animation);
      clearTimeout(entryTimer);
      nativeEntry = false;
      if (!canMove()) { cancel(); return; }
      const from = scrollY;
      const to = Math.max(0, Math.min(target, document.documentElement.scrollHeight - innerHeight));
      const span = to - from;
      const { stride } = getGeometry();
      const duration = Math.max(700, Math.min(1500, 1050 * Math.sqrt(Math.abs(span) / stride)));
      // Cancel any native smooth anchor travel before starting a new trip.
      scrollTo({ top: from, behavior: 'instant' });
      expectedY = scrollY;
      const begun = performance.now();
      moving = true;
      onStateChange(explicit ? 'navigating' : 'transitioning', index);
      function step(now) {
        if (!canMove()) { cancel(); return; }
        const p = Math.min(1, (now - begun) / duration);
        scrollTo({ top: from + span * ease(p), behavior: 'instant' });
        expectedY = scrollY;
        onProgress?.();
        if (p < 1 && Math.abs(span) >= 1) animation = requestAnimationFrame(step);
        else {
          animation = 0;
          moving = false;
          onStateChange('idle');
          onArrive(index, explicit);
        }
      }
      animation = requestAnimationFrame(step);
    }

    function nestedScroll(target, direction) {
      for (let node = target; node instanceof Element && node !== document.body; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (!/^(auto|scroll)$/.test(style.overflowY) || node.scrollHeight <= node.clientHeight + 1) continue;
        if (direction > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0) return true;
      }
      return false;
    }

    addEventListener('wheel', event => {
      if (!canMove() || event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey ||
          event.altKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
          editable(event.target) || selected() || nestedScroll(event.target, Math.sign(event.deltaY))) {
        if (moving) cancel();
        return;
      }
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
      const direction = Math.sign(delta);
      let target = nextChapter({ y: scrollY, ...getGeometry(), direction });
      if (!inside()) {
        if (moving) cancel();
        const { start, stride, count } = getGeometry();
        const end = start + stride * (count - 1);
        if (scrollY > end && scrollY + delta <= end) target = { index: count - 1, target: end };
        else if (scrollY < start && scrollY + delta >= start) target = { index: 0, target: start };
        else { resetWheel(); return; }
      }
      // Fresh outward gestures at either endpoint keep their native behavior.
      if (!moving && !wheelConsumed && !target) { resetWheel(); return; }
      event.preventDefault();
      wheelActivity();
      if (moving || wheelConsumed) { wheelConsumed = true; return; }
      if (direction !== wheelDirection) wheelTotal = 0;
      wheelDirection = direction;
      wheelTotal += Math.abs(delta);
      if (wheelTotal < 8) return;
      wheelConsumed = true;
      travel(target.index, target.target);
    }, { passive: false });

    addEventListener('keydown', event => {
      const direction = ['ArrowDown', 'PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey) ? 1 :
        ['ArrowUp', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey) ? -1 : 0;
      const controlSpace = event.key === ' ' && event.target instanceof Element &&
        event.target.closest('button, a[href], [role="button"]');
      if (!direction || !canMove() || !inside() || event.defaultPrevented || event.ctrlKey || event.metaKey ||
          event.altKey || editable(event.target) || controlSpace || nestedScroll(event.target, direction)) {
        cancel();
        return;
      }
      const target = nextChapter({ y: scrollY, ...getGeometry(), direction });
      if (!moving && !heldKey && !target) return;
      event.preventDefault();
      if (moving || heldKey || event.repeat) { heldKey = event.key; return; }
      heldKey = event.key;
      travel(target.index, target.target);
    });
    addEventListener('keyup', event => { if (heldKey === event.key) heldKey = ''; });

    addEventListener('touchstart', event => {
      if (event.touches.length !== 1 || !canMove() || editable(event.target) || selected()) { cancel(); return; }
      clearTimeout(entryTimer);
      const point = event.touches[0];
      touch = { x: point.clientX, y: point.clientY, origin: scrollY, native: !inside(), consumed: moving };
      nativeEntry = touch.native;
    }, { passive: true });
    addEventListener('touchmove', event => {
      if (!touch || event.touches.length !== 1) return;
      const point = event.touches[0];
      const dx = point.clientX - touch.x, dy = touch.y - point.clientY;
      if (touch.native) return;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) { touch.native = true; return; }
      if (Math.abs(dy) < 8) return;
      if (!event.cancelable || nestedScroll(event.target, Math.sign(dy))) {
        touch.native = true;
        nativeEntry = true;
        return;
      }
      const target = nextChapter({ y: touch.origin, ...getGeometry(), direction: Math.sign(dy) });
      if (!touch.consumed && !moving && !target) {
        touch.native = true;
        return;
      }
      event.preventDefault();
      if (touch.consumed || moving) { touch.consumed = true; return; }
      if (Math.abs(dy) < 30) return;
      touch.consumed = true;
      travel(target.index, target.target);
    }, { passive: false });

    function settleEntry() {
      clearTimeout(entryTimer);
      if (!nativeEntry || touch || moving) return;
      entryTimer = setTimeout(() => {
        nativeEntry = false;
        if (!canMove() || !inside() || selected()) return;
        const { start, stride, count } = getGeometry();
        const index = Math.max(0, Math.min(count - 1, Math.round((scrollY - start) / stride)));
        if (Math.abs(scrollY - start - index * stride) > 2) travel(index, start + index * stride);
      }, 200);
    }
    addEventListener('touchend', event => {
      if (event.touches.length) return;
      touch = null;
      settleEntry();
    }, { passive: true });
    addEventListener('touchcancel', () => { touch = null; settleEntry(); }, { passive: true });
    addEventListener('pointerdown', event => { if (event.pointerType !== 'touch') cancel(); }, { passive: true });
    addEventListener('click', event => {
      // A resting finger can synthesize a click on empty content. Only actual
      // controls should interrupt a chapter; otherwise it stops mid-sentence.
      if (event.target instanceof Element && event.target.closest(
        'a[href], button, input, textarea, select, summary, [role="button"], [role="link"], [contenteditable]'
      )) cancel();
    }, { capture: true });
    // The host checks whether the narrative geometry actually changed. Mobile
    // browser bars can resize the viewport without changing chapter positions.
    addEventListener('blur', cancel);
    addEventListener('pagehide', cancel);
    document.addEventListener('visibilitychange', cancel);
    addEventListener('scroll', () => {
      // Scrollbar drags, focus changes, find and browser history stay in charge.
      if (moving && Math.abs(scrollY - expectedY) > 2) cancel();
      if (nativeEntry) settleEntry();
    }, { passive: true });

    return Object.freeze({
      cancel,
      goTo(index) {
        cancel();
        const { start, stride, count } = getGeometry();
        if (Number.isInteger(index) && index >= 0 && index < count) travel(index, start + stride * index, true);
      }
    });
  }

  const api = Object.freeze({ nextChapter, ease, create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.CultivarStoryScroll = api;
})();
