/* Monotone time remapping: no inertia, reversed growth or overshooting a cut. */
(() => {
  'use strict';
  const stops = [[0,0],[.018,17],[.29,142],[.43,203],[.625,263],[.65,292],
    [.661,320],[.70,346],[.78,382],[.79,388],[.94,502],[.955,543],[1,573]];
  const widths = stops.slice(1).map((stop, i) => stop[0] - stops[i][0]);
  const slopes = stops.slice(1).map((stop, i) => (stop[1] - stops[i][1]) / widths[i]);
  // Weighted harmonic tangents keep the cubic curve monotonic, including
  // where a nearly idle handle is traversed faster than the growing leaves.
  const tangents = stops.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === stops.length - 1) return slopes.at(-1);
    const w1 = 2 * widths[i] + widths[i - 1];
    const w2 = widths[i] + 2 * widths[i - 1];
    return (w1 + w2) / (w1 / slopes[i - 1] + w2 / slopes[i]);
  });
  function frameAt(progress) {
    const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    const i = Math.min(stops.length - 2, stops.findIndex(stop => stop[0] > p) - 1);
    if (p === 1) return stops.at(-1)[1];
    const t = (p - stops[i][0]) / widths[i];
    const t2 = t * t, t3 = t2 * t;
    const frame = (2*t3 - 3*t2 + 1) * stops[i][1] + (t3 - 2*t2 + t) * widths[i] * tangents[i] +
      (-2*t3 + 3*t2) * stops[i+1][1] + (t3 - t2) * widths[i] * tangents[i+1];
    return Math.max(stops[i][1], Math.min(stops[i+1][1], frame));
  }
  const timing = Object.freeze({ frameAt, frameCount: 574 });
  if (typeof module !== 'undefined' && module.exports) module.exports = timing;
  else window.CultivarGrowthTiming = timing;
})();
