// A small particle kingfisher for the static pages: it perches on the footer rule (or on
// its own waterline), breathes, glances toward the pointer and ruffles when touched.
// Canvas 2D only, paused off-screen, and drawn once for reduced motion.
import { ANATOMY, REGION, designSamples } from './scenes/kingfisher.js';

const TAU = Math.PI * 2;
const HEAD = new Set([REGION.head, REGION.face, REGION.bill, REGION.eye]);

export function mountKingfisher(container, { count = 1500, water = false, birdWidth = 0.52, perch = 0.8 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);
  const context = canvas.getContext('2d');
  if (!context) { canvas.remove(); return null; }
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const design = designSamples();
  const total = design.length / 6;
  const n = Math.min(count, total);
  const points = new Float32Array(n * 8); // design x, y, r, g, b, region, vx, vy
  const offsets = new Float32Array(n * 4);
  // A seeded shuffle, not a stride: striding the scanline samples leaves visible stripes.
  const order = Array.from({ length: total }, (_, k) => k);
  let seed = 20260927;
  for (let k = total - 1; k > 0; k -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (k + 1);
    [order[k], order[j]] = [order[j], order[k]];
  }
  for (let k = 0; k < n; k += 1) {
    const source = order[k] * 6;
    points.set(design.subarray(source, source + 6), k * 8);
  }
  let width = 0;
  let height = 0;
  let dpr = 1;
  let scale = 1;
  let originX = 0;
  let originY = 0;
  let raf = 0;
  let visible = false;
  let last = performance.now();
  let time = 0;
  const pointer = { x: -9999, y: -9999 };
  const ripples = [];

  const layout = () => {
    const box = container.getBoundingClientRect();
    width = Math.max(1, box.width);
    height = Math.max(1, box.height);
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    scale = (width * birdWidth) / ANATOMY.width;
    originX = width * 0.94 - 775 * scale;
    originY = height * perch - ANATOMY.perchY * scale;
  };

  const draw = () => {
    const ink = document.documentElement.dataset.theme !== 'paper';
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    const [neckX, neckY] = [originX + ANATOMY.neck[0] * scale, originY + ANATOMY.neck[1] * scale];
    const [feetX, feetY] = [originX + ANATOMY.feet[0] * scale, originY + ANATOMY.feet[1] * scale];
    const look = pointer.x > -9000 ? Math.max(-1, Math.min(1, (pointer.y - neckY) / (height * 1.5))) : 0;
    const tilt = Math.sin(time * 0.00055) * 0.05 + look * 0.14;
    const breath = 1 + Math.sin(time * 0.0016) * 0.01;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const perchY = height * perch;
    for (let k = 0; k < n; k += 1) {
      const o = k * 8;
      let x = originX + points[o] * scale;
      let y = originY + points[o + 1] * scale;
      x = feetX + (x - feetX) * breath;
      y = feetY + (y - feetY) * breath;
      if (HEAD.has(points[o + 5])) {
        const dx = x - neckX;
        const dy = y - neckY;
        x = neckX + dx * cos - dy * sin;
        y = neckY + dx * sin + dy * cos;
      }
      const q = k * 4;
      x += offsets[q];
      y += offsets[q + 1];
      const size = points[o + 5] === REGION.eye ? 1.6 : 1.25;
      context.fillStyle = `rgba(${points[o + 2] * 255 | 0},${points[o + 3] * 255 | 0},${points[o + 4] * 255 | 0},0.92)`;
      context.fillRect(x - size / 2, y - size / 2, size, size);
      if (water && y < perchY) {
        const d = perchY - y;
        const ry = perchY + d * 0.9 + 2;
        const alpha = 0.22 * (1 - Math.min(1, d / (height * 0.6)));
        if (alpha > 0.01) {
          context.fillStyle = `rgba(${points[o + 2] * 255 | 0},${points[o + 3] * 255 | 0},${points[o + 4] * 255 | 0},${alpha})`;
          context.fillRect(x + Math.sin(ry * 0.14 + time * 0.0026) * 1.2 - 0.6, ry, 1.2, 1.2);
        }
      }
    }
    if (water) {
      // Waterline: a shimmering row of particles with ripples from clicks.
      const colour = ink ? '232,230,220' : '36,36,32';
      for (let x = width * 0.04; x < width * 0.98; x += 1.6) {
        let y = perchY + Math.sin(x * 0.05 + time * 0.0014) * 0.6;
        for (const ripple of ripples) {
          const age = (time - ripple.start) / 1000;
          const dx = Math.abs(x - ripple.x);
          y += Math.sin(dx * 0.12 - age * 14) * 2.2 * Math.exp(-age * 2.6) * Math.exp(-dx / 60);
        }
        const edge = Math.min(1, (x - width * 0.04) / 40, (width * 0.98 - x) / 40);
        context.fillStyle = `rgba(${colour},${0.5 * edge})`;
        context.fillRect(x, y, 1.2, 1.2);
      }
    }
  };

  const frame = now => {
    raf = 0;
    const delta = Math.min(2, Math.max(0.25, (now - last) / 16.667));
    last = now;
    time += delta * 16.667;
    for (let k = 0; k < n; k += 1) {
      const o = k * 8;
      const q = k * 4;
      const x = originX + points[o] * scale + offsets[q];
      const y = originY + points[o + 1] * scale + offsets[q + 1];
      const dx = x - pointer.x;
      const dy = y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 26 && distance > 0.1) {
        const force = (1 - distance / 26) * 0.9;
        offsets[q + 2] += (dx / distance) * force;
        offsets[q + 3] += (dy / distance) * force;
      }
      offsets[q + 2] = (offsets[q + 2] - offsets[q] * 0.07 * delta) * Math.pow(0.8, delta);
      offsets[q + 3] = (offsets[q + 3] - offsets[q + 1] * 0.07 * delta) * Math.pow(0.8, delta);
      offsets[q] += offsets[q + 2] * delta;
      offsets[q + 1] += offsets[q + 3] * delta;
    }
    while (ripples.length && time - ripples[0].start > 2400) ripples.shift();
    draw();
    schedule();
  };
  const schedule = () => {
    if (!raf && visible && !motion.matches && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };

  layout();
  draw();
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (visible) schedule();
  });
  observer.observe(container);
  addEventListener('resize', () => { layout(); draw(); }, { passive: true });
  addEventListener('pointermove', event => {
    const box = canvas.getBoundingClientRect();
    pointer.x = event.clientX - box.left;
    pointer.y = event.clientY - box.top;
  }, { passive: true });
  container.addEventListener('pointerdown', event => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    ripples.push({ x, start: time });
    for (let k = 0; k < n; k += 1) {
      const q = k * 4;
      const angle = ((k * 2.39996) % TAU);
      offsets[q + 2] += Math.cos(angle) * 1.6;
      offsets[q + 3] += Math.sin(angle) * 1.6 - 1.2;
    }
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('themechange', draw);
  if (motion.addEventListener) motion.addEventListener('change', () => { draw(); schedule(); });
  return { canvas, draw };
}

const pagePerch = document.querySelector('.page-perch[data-kingfisher]');
document.querySelectorAll('[data-kingfisher]').forEach(container => {
  // One bird per page: a page's own perch replaces the footer's.
  if (pagePerch && container !== pagePerch) return;
  const water = container.dataset.kingfisher === 'water';
  mountKingfisher(container, {
    water,
    count: water ? 2600 : 1500,
    birdWidth: water ? 0.46 : 0.5,
    perch: water ? 0.66 : 0.8,
  });
});
