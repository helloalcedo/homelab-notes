import { smoother } from './reader-motion.js';

export const CHAPTER_MOTION = Object.freeze({ start: .55, end: 1.16 });

// One presentation clock for HTML and particles. Even a history/keyboard jump
// traverses the visible material path. Native scrolling remains native.
export function stepChapterProgress(current, destination, elapsedMs) {
  const dt = Math.min(40, Math.max(0, elapsedMs));
  const distance = destination - current;
  if (Math.abs(distance) < .0001) return destination;
  const step = distance * (1 - Math.exp(-dt / 65));
  const limit = dt * .0032;
  return current + Math.max(-limit, Math.min(limit, step));
}

// Cache field coefficients, not endpoints: the original scenes remain alive.
// The shared current changes direction with the material in each chapter.
export function createChapterFlow(seeds, width, height, from, to, chapter) {
  const count = seeds.length / 4;
  const field = new Float32Array(count * 8);
  const span = Math.min(width, height);
  for (let i = 0; i < count; i++) {
    const q = i * 4, k = i * 8, p = i * 5;
    const x = from[p] / width, y = from[p + 1] / height;
    const dx = to[p] - from[p], dy = to[p + 1] - from[p + 1];
    const length = Math.max(1, Math.hypot(dx, dy));
    const b = seeds[q + 1], c = seeds[q + 2], d = seeds[q + 3];
    const direction = chapter === 2 ? -1 : chapter === 3 ? 1 : Math.sin((x + y * .45) * Math.PI);
    const bend = Math.min(span * .17, length * .32 + span * .055) * direction;
    field[k] = -dy / length * bend;
    field[k + 1] = dx / length * bend;
    // Individual eddies separate adjacent grains before transporting them.
    const angle = b * Math.PI * 2;
    const radius = span * (.010 + .030 * Math.sqrt(c));
    field[k + 2] = Math.cos(angle) * radius;
    field[k + 3] = Math.sin(angle) * radius;
    const front = chapter === 2 ? 1 - y : chapter === 3 ? y : x;
    field[k + 4] = .12 * Math.max(0, Math.min(1, front)) + d * .16;
    field[k + 5] = .72;
    field[k + 6] = Math.sin(y * 5 + chapter) * span * .035;
    field[k + 7] = Math.cos(x * 4 + chapter) * span * .035;
  }
  return field;
}

// Reversible, zero endpoint velocity/acceleration. Alpha and grain size only
// interpolate the original materials. There is no mid-flight fade mask.
export function blendChapterTransition(from, to, field, index, progress, out) {
  const k = index * 8;
  const delay = field[k + 4];
  const t = smoother(delay, delay + field[k + 5], progress);
  const loose = smoother(0, .28, progress) * (1 - smoother(.68, 1, progress));
  const arch = 16 * t * t * (1 - t) * (1 - t);
  const current = arch * (1 - 2 * t);
  const x = from[0], y = from[1];
  out[0] = x + (to[0] - x) * t + field[k] * arch + field[k + 2] * loose + field[k + 6] * current;
  out[1] = y + (to[1] - y) * t + field[k + 1] * arch + field[k + 3] * loose + field[k + 7] * current;
  for (let j = 2; j < 5; j++) out[j] = from[j] + (to[j] - from[j]) * t;
}
