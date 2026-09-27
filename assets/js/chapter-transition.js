import { smoother } from './reader-motion.js';

// Fast scrolling can outrun the position spring. Keep those moving grains faint
// until their rendered position arrives, rather than lighting a warped outline.
export function chapterArrivalScale(dx, dy, grain, mobile) {
  const far = (mobile ? 18 : 24) * (.85 + grain * .3);
  return 1 - .96 * smoother(4, far * far, dx * dx + dy * dy);
}

// Transient offsets only. Chapter geometry and particle identities stay intact.
export function createChapterScatter(seeds, width, height) {
  const scatter = new Float32Array(seeds.length / 4 * 6);
  const extent = Math.min(width <= 700 ? 64 : 130, height * .16);
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4, k = i * 6;
    const a = seeds[q], b = seeds[q + 1], c = seeds[q + 2], d = seeds[q + 3];
    const angle = b * Math.PI * 2;
    const radius = extent * (.28 + .72 * Math.sqrt(c));
    scatter[k] = Math.cos(angle) * radius;
    scatter[k + 1] = Math.sin(angle) * radius;
    scatter[k + 2] = (d - .5) * extent * 1.1;
    scatter[k + 3] = (a - .5) * extent * 1.7;
    scatter[k + 4] = c * .14;
    scatter[k + 5] = d;
  }
  return scatter;
}

// Loosen in place first, carry individual grains second, then restore the exact
// destination. No outline is translated or bent as a single moving structure.
export function blendChapterTransition(from, to, scatter, index, progress, out) {
  if (progress <= 0 || progress >= 1) {
    const endpoint = progress <= 0 ? from : to;
    for (let j = 0; j < 5; j++) out[j] = endpoint[j];
    return;
  }
  const k = index * 6;
  const delay = scatter[k + 4], grain = scatter[k + 5];
  const diffuse = smoother(delay, .26 + delay, progress);
  const travel = smoother(.30 + delay, .80 + delay * .35, progress);
  const settle = smoother(.78 + delay * .55, 1, progress);
  const curve = 16 * travel * travel * (1 - travel) * (1 - travel);
  const sourceAlpha = from[3], sourceWarm = from[2], sourceSize = from[4];
  const looseX = from[0] + scatter[k] * diffuse;
  const looseY = from[1] + scatter[k + 1] * diffuse;
  out[0] = looseX + (to[0] - looseX) * travel + scatter[k + 2] * curve;
  out[1] = looseY + (to[1] - looseY) * travel + scatter[k + 3] * curve;
  const looseAlpha = sourceAlpha + (Math.min(sourceAlpha, .09 + grain * .05) - sourceAlpha) * diffuse;
  out[2] = sourceWarm * (1 - diffuse) * (1 - settle) + to[2] * settle;
  out[3] = looseAlpha + (to[3] - looseAlpha) * settle;
  const looseSize = sourceSize + (.55 + grain * .30 - sourceSize) * diffuse;
  out[4] = looseSize + (to[4] - looseSize) * settle;
}
