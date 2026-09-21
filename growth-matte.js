/* Remove the existing black plate at render time; never alter source media. */
(function (root) {
  'use strict';

  function createMatte(width, height) {
    const count = width * height;
    const mask = new Uint8Array(count);
    const queue = new Uint32Array(count);
    const scale = width / 1200;
    const smallArea = Math.max(3, Math.round(28 * scale * scale));
    const shortSpan = Math.max(3, Math.round(14 * scale));

    return function clean(data) {
      // A soft black key retains antialiased edges. Do not erode/dilate the
      // silhouette: those operations can destroy single-pixel root strands.
      for (let p = 0, i = 0; p < count; p++, i += 4) {
        mask[p] = Math.max(data[i], data[i + 1], data[i + 2]) > 12 ? 1 : 0;
      }
      let removed = 0;
      for (let p = 0; p < count; p++) {
        if (mask[p] !== 1) continue;
        let head = 0, tail = 1;
        queue[0] = p;
        mask[p] = 2;
        let left = p % width, right = left;
        let top = Math.floor(p / width), bottom = top;
        while (head < tail) {
          const at = queue[head++], x = at % width, y = Math.floor(at / width);
          left = Math.min(left, x); right = Math.max(right, x);
          top = Math.min(top, y); bottom = Math.max(bottom, y);
          if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
            // The plant is inset from the frame. Avoid eight repeated bounds
            // checks in its dense interior while retaining diagonal roots.
            let next = at - width - 1;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next++;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next++;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next = at - 1;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next = at + 1;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next = at + width - 1;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next++;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
            next++;
            if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
          } else {
            for (let dy = -1; dy <= 1; dy++) {
              if (y + dy < 0 || y + dy >= height) continue;
              for (let dx = -1; dx <= 1; dx++) {
                if (x + dx < 0 || x + dx >= width) continue;
                const next = at + dy * width + dx;
                if (mask[next] === 1) { mask[next] = 2; queue[tail++] = next; }
              }
            }
          }
        }
        // Only discard compact, isolated flecks. Long disconnected root
        // filaments survive even when their total area is very small.
        if (tail < smallArea && Math.max(right - left + 1, bottom - top + 1) < shortSpan) {
          removed += tail;
          for (let i = 0; i < tail; i++) mask[queue[i]] = 0;
        }
      }
      for (let p = 0, i = 0; p < count; p++, i += 4) {
        if (!mask[p]) {
          data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
          continue;
        }
        const peak = Math.max(data[i], data[i + 1], data[i + 2]);
        const t = Math.min(1, (peak - 12) / 24);
        const alpha = t * t * (3 - 2 * t);
        // The source edge was already composited against black. Remove that
        // contribution before normal alpha blending, avoiding a dark fringe.
        const gain = 1 / Math.max(alpha, peak / 255);
        data[i] *= gain; data[i + 1] *= gain; data[i + 2] *= gain;
        data[i + 3] = Math.round(255 * alpha);
      }
      return { removed };
    };
  }

  function createRenderer() {
    const buffer = document.createElement('canvas');
    const context = buffer.getContext('2d', { willReadFrequently: true });
    if (!context) throw Error('Matte canvas unavailable');
    let clean, previousSource, previousFrame;
    return {
      draw(source, frame) {
        if (source === previousSource && frame === previousFrame) return buffer;
        const width = source.videoWidth || source.naturalWidth;
        const height = source.videoHeight || source.naturalHeight;
        if (!width || !height) throw Error('Matte source unavailable');
        if (buffer.width !== width || buffer.height !== height) {
          buffer.width = width; buffer.height = height;
          clean = createMatte(width, height);
        }
        context.drawImage(source, 0, 0);
        const pixels = context.getImageData(0, 0, width, height);
        clean(pixels.data);
        context.putImageData(pixels, 0, 0);
        previousSource = source; previousFrame = frame;
        return buffer;
      }
    };
  }

  async function enhancePoster(image) {
    try {
      await image.decode();
      const canvas = createRenderer().draw(image, 0);
      canvas.className = 'plant-poster-clean';
      canvas.setAttribute('aria-hidden', 'true');
      image.after(canvas);
      image.classList.add('has-clean-poster');
      if (image.classList.contains('plant-loading')) canvas.classList.add('plant-loading-clean');
      else image.parentElement.classList.add('has-clean-matte');
    } catch { /* Keep the original accessible image if cleanup is unavailable. */ }
  }

  function createAsyncRenderer(onFrame, onError) {
    if (typeof Worker !== 'function') return null;
    const worker = new Worker('growth-matte-worker.js?v=transparent-plant-v1');
    const capture = document.createElement('canvas');
    const input = capture.getContext('2d', { willReadFrequently: true });
    const output = document.createElement('canvas');
    const context = output.getContext('2d');
    let busy = false, queued = null, stopped = false, timer = 0;
    let submitted = -1, rendered = -1;
    if (!input || !context) { worker.terminate(); throw Error('Matte canvas unavailable'); }
    const stop = () => { stopped = true; queued = null; clearTimeout(timer); worker.terminate(); };
    const fail = () => { if (stopped) return; stop(); onError(); };
    const send = job => {
      busy = true;
      timer = setTimeout(fail, 3000);
      try { worker.postMessage(job, [job.pixels.buffer]); } catch { fail(); }
    };
    worker.onerror = event => { event.preventDefault(); fail(); };
    worker.onmessageerror = fail;
    worker.onmessage = ({ data }) => {
      if (stopped) return;
      clearTimeout(timer);
      if (data.error) { fail(); return; }
      try {
        if (output.width !== data.width || output.height !== data.height) {
          output.width = data.width; output.height = data.height;
        }
        context.putImageData(new ImageData(data.pixels, data.width, data.height), 0, 0);
        rendered = data.frame;
        busy = false;
        onFrame(output, rendered);
        // One job in flight, one latest decoded frame waiting. Intermediate
        // requests never form a growing queue during rapid scroll/reversal.
        if (queued) { const next = queued; queued = null; send(next); }
      } catch { fail(); }
    };
    return {
      stop,
      draw(source, frame) {
        if (stopped) return;
        if (frame === submitted) {
          if (frame === rendered) onFrame(output, rendered);
          return;
        }
        const width = source.videoWidth, height = source.videoHeight;
        if (capture.width !== width || capture.height !== height) {
          capture.width = width; capture.height = height;
        }
        input.drawImage(source, 0, 0);
        const pixels = input.getImageData(0, 0, width, height).data;
        submitted = frame;
        const job = { pixels, width, height, frame };
        if (busy) queued = job;
        else send(job);
      }
    };
  }

  const api = { createMatte, createRenderer, createAsyncRenderer, enhancePoster };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CultivarGrowthMatte = api;
})(typeof window === 'object' ? window : globalThis);
