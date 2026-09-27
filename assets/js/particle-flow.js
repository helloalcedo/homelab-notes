import { smoother } from './reader-motion.js';

// Open, volumetric grain beds rather than particles stacked on a perimeter.
// Geometry is prepared only on layout changes; the persistent pool stays intact.
export function createFolioField(rectangles, seeds, width, height) {
  const field = new Float32Array(seeds.length / 4 * 5);
  const mobile = width <= 700;
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4, k = i * 5;
    const a = seeds[q], b = seeds[q + 1], c = seeds[q + 2], d = seeds[q + 3];
    const lane = Math.min(rectangles.length - 1, Math.floor(a * rectangles.length));
    const rect = rectangles[lane];
    const u = a * rectangles.length - lane;
    const band = mobile ? (height <= 800 ? 12 : 20) : Math.min(86, rect.width * .19);
    const spread = band * (.42 + .58 * Math.sin(u * Math.PI));
    const baseY = Math.min(rect.y + rect.height + (mobile ? 0 : 12), height * (mobile ? .90 : .87) - band * .5);
    field[k] = rect.x + rect.width * (u * 1.12 - .06) + (d - .5) * 12;
    field[k + 1] = baseY + Math.sin(u * Math.PI * 1.6 - .7) * band * .65 + (b - .5) * spread * 1.8;
    field[k + 2] = d > .92 ? .5 : 0;
    field[k + 3] = c < .36 ? (.17 + d * .39) * Math.pow(Math.sin(u * Math.PI), .45) * (.12 + .88 * Math.pow(Math.sin(b * Math.PI), .65)) : 0;
    field[k + 4] = .50 + d * .55;
  }
  return field;
}

export function createFolioPaths(from, to, seeds, width) {
  const paths = new Float32Array(seeds.length);
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4, k = i * 5;
    const b = seeds[q + 1], c = seeds[q + 2], d = seeds[q + 3];
    const dx = to[k] - from[k], dy = to[k + 1] - from[k + 1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const bend = (d < .5 ? -1 : 1) * (width <= 700 ? 24 + b * 58 : 45 + b * 115);
    // A secondary tangent component separates neighbours into broad currents.
    const slip = (c - .5) * (width <= 700 ? 48 : 120);
    paths[q] = -dy / length * bend + dx / length * slip;
    paths[q + 1] = dx / length * bend + dy / length * slip;
    paths[q + 2] = .38 + b * .15;
    paths[q + 3] = .93 + c * .07;
  }
  return paths;
}

// Pure progress-driven transport: reverse scrolling follows the same currents.
// The polynomial envelope has zero slope at release and arrival.
export function blendFolioParticle(from, to, paths, index, progress, seed, out) {
  const q = index * 4;
  const t = smoother(paths[q + 2], paths[q + 3], progress);
  const envelope = 16 * t * t * (1 - t) * (1 - t);
  for (let j = 0; j < 5; j++) out[j] = from[j] + (to[j] - from[j]) * t;
  out[0] += paths[q] * envelope;
  out[1] += paths[q + 1] * envelope;
  out[3] += seed < .58 ? envelope * .16 : 0;
}
