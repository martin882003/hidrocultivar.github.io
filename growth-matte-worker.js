/* Pixel cleanup stays off the scrolling/text thread. No network/media writes. */
'use strict';
importScripts('growth-matte.js?v=transparent-plant-v1');
let clean, previousWidth, previousHeight;
self.onmessage = ({ data }) => {
  try {
    const { pixels, width, height, frame } = data;
    if (width !== previousWidth || height !== previousHeight) {
      clean = self.CultivarGrowthMatte.createMatte(width, height);
      previousWidth = width; previousHeight = height;
    }
    clean(pixels);
    self.postMessage({ pixels, width, height, frame }, [pixels.buffer]);
  } catch { self.postMessage({ error: true }); }
};
