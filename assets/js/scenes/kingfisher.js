// Scene 00 (the Alcedo title over a small pond) and the companion kingfisher that dives,
// resurfaces and follows the reader through every chapter.
// A common kingfisher (Alcedo atthis), perched and facing left, is drawn from layered
// silhouette paths in a 1000×700 design box and sampled into coloured particles.

import { TAU, clamp01, mix, ease, smooth, smoother, randomGenerator } from '../morph.js';
import { COLOR } from './shapes.js';
import { makeScene } from './story.js';

const PATHS = {
  body: 'M70 250 L292 224 C318 190 360 160 425 155 C480 152 520 180 540 225 C565 280 610 350 660 430 L700 480 L775 598 C770 610 760 614 750 610 L668 530 C640 548 600 556 560 552 C500 548 440 512 400 450 C372 405 350 350 332 300 C322 280 310 268 300 263 Z',
  head: 'M292 224 C318 190 360 160 425 155 C480 152 520 180 540 225 C548 245 552 262 548 280 C500 290 420 300 330 290 C318 276 306 266 300 263 Z',
  back: 'M538 238 C565 290 610 360 660 432 L698 478 L684 486 L646 440 C600 372 556 304 526 250 Z',
  wing: 'M500 300 C560 310 620 370 668 440 L700 500 C650 520 590 520 540 500 C500 470 480 400 480 340 C482 322 490 308 500 300 Z',
  tail: 'M690 470 L775 598 C770 610 760 614 750 610 L668 530 C680 510 688 490 690 470 Z',
  lores: 'M308 246 C318 236 338 234 350 244 C344 258 324 262 310 258 Z',
  ear: 'M382 250 C410 240 450 240 482 252 C472 272 422 282 386 272 Z',
  neck: 'M487 250 C506 244 526 254 532 272 C516 286 496 286 484 270 Z',
  moustache: 'M304 266 C360 276 420 282 476 284 L470 300 C420 301 360 295 318 286 Z',
  throat: 'M318 287 C360 297 420 303 468 301 C442 332 402 348 362 344 C346 327 332 306 318 287 Z',
  billTop: 'M70 250 L292 224 L300 246 C220 248 140 250 70 250 Z',
  billLow: 'M70 250 C140 250 220 250 300 246 L300 263 Z',
  footA: 'M572 548 C580 552 586 560 584 572 L576 572 C576 562 572 556 566 552 Z',
  footB: 'M600 546 C608 552 612 560 610 572 L602 572 C602 562 598 556 594 550 Z',
};

// Topmost layer first: the first layer containing a sample decides its colour and region.
const LAYERS = [
  ['bill', 'billLow', [0.235, 0.27, 0.294]],
  ['bill', 'billTop', [0.34, 0.385, 0.416]],
  ['feet', 'footA', [0.878, 0.314, 0.227]],
  ['feet', 'footB', [0.878, 0.314, 0.227]],
  ['face', 'throat', [0.953, 0.933, 0.894]],
  ['face', 'neck', [0.953, 0.933, 0.894]],
  ['face', 'moustache', [0.114, 0.435, 0.776]],
  ['face', 'ear', [0.937, 0.478, 0.22]],
  ['face', 'lores', [0.941, 0.518, 0.247]],
  ['tail', 'tail', [0.086, 0.31, 0.588]],
  ['back', 'back', [0.322, 0.847, 0.933]],
  ['wing', 'wing', [0.106, 0.392, 0.69]],
  ['head', 'head', [0.122, 0.47, 0.82]],
  ['body', 'body', [0.933, 0.467, 0.212]],
];

export const REGION = Object.freeze({ body: 0, head: 1, back: 2, wing: 3, tail: 4, face: 5, bill: 6, feet: 7, eye: 8 });
const HEADISH = new Set([REGION.head, REGION.face, REGION.bill, REGION.eye]);
const BILL_TIP = [70, 250];
const TAIL_TIP = [768, 604];
const NECK = [505, 270];
const TAIL_BASE = [690, 480];
const FEET = [590, 562];
const EYE = [366, 238];
const BIRD_CENTRE_X = 422;
const PERCH_Y = 572;
const BIRD_WIDTH = 705;

let silhouette = null;
/** Sample the silhouette once in design space: x, y, r, g, b, region per point. */
export function designSamples() {
  if (silhouette) return silhouette;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const context = canvas.getContext('2d');
  const paths = Object.fromEntries(Object.entries(PATHS).map(([name, d]) => [name, new Path2D(d)]));
  const random = randomGenerator(8101);
  const points = [];
  const spacing = 2.6;
  for (let y = 150; y < 616; y += spacing) {
    for (let x = 66; x < 780; x += spacing) {
      const px = x + (random() - 0.5) * spacing * 0.9;
      const py = y + (random() - 0.5) * spacing * 0.9;
      if (!context.isPointInPath(paths.body, px, py) && !context.isPointInPath(paths.footA, px, py) && !context.isPointInPath(paths.footB, px, py)) continue;
      const eye = Math.hypot(px - EYE[0], py - EYE[1]);
      let region = REGION.body;
      let colour = LAYERS.at(-1)[2];
      if (eye < 15) {
        region = REGION.eye;
        colour = eye < 4.2 && px < EYE[0] && py < EYE[1] ? [0.97, 0.97, 0.95] : [0.043, 0.047, 0.055];
      } else {
        for (const [name, key, rgb] of LAYERS) {
          if (context.isPointInPath(paths[key], px, py)) {
            region = REGION[name];
            colour = rgb;
            break;
          }
        }
        if (region === REGION.body && px < 304) {
          region = REGION.bill;
          colour = LAYERS[0][2];
        }
      }
      let [r, g, b] = colour;
      // Light from above-left, darker belly and tail: gives the flat layers volume.
      const light = 1.12 - ((py - 150) / 470) * 0.26 - Math.max(0, (px - 560) / 900) * 0.1;
      if (region === REGION.head) {
        // Pale azure barring across the crown.
        const bar = Math.sin(px * 0.36 + py * 0.08) * Math.sin(py * 0.42);
        if (bar > 0.55 && py < 250) [r, g, b] = [0.3, 0.74, 0.93];
      } else if (region === REGION.wing) {
        // Turquoise spots on the wing coverts.
        const cell = Math.sin(px * 0.21) * Math.sin(py * 0.19 + px * 0.05);
        if (cell > 0.78 && py < 430) [r, g, b] = [0.26, 0.76, 0.87];
      } else if (region === REGION.body) {
        const depth = clamp01((py - 330) / 230);
        r = mix(0.95, 0.86, depth);
        g = mix(0.55, 0.38, depth);
        b = mix(0.27, 0.16, depth);
      }
      if (region !== REGION.eye) {
        r = Math.min(1, r * light);
        g = Math.min(1, g * light);
        b = Math.min(1, b * light);
      }
      points.push(px, py, r, g, b, region);
    }
  }
  silhouette = new Float32Array(points);
  return silhouette;
}

/** Anatomy shared with the small kingfisher marks on the static pages. */
export const ANATOMY = Object.freeze({ billTip: BILL_TIP, tailTip: TAIL_TIP, neck: NECK, tailBase: TAIL_BASE, feet: FEET, perchY: PERCH_Y, width: BIRD_WIDTH, centreX: BIRD_CENTRE_X });

const rotateAbout = (x, y, cx, cy, angle, out) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  out[0] = cx + dx * cos - dy * sin;
  out[1] = cy + dx * sin + dy * cos;
  return out;
};


const SHOULDER = [505, 305];
const CENTRE = [470, 400];
const AXIS_LENGTH = Math.hypot(TAIL_TIP[0] - BILL_TIP[0], TAIL_TIP[1] - BILL_TIP[1]);
const AXIS_X = (TAIL_TIP[0] - BILL_TIP[0]) / AXIS_LENGTH;
const AXIS_Y = (TAIL_TIP[1] - BILL_TIP[1]) / AXIS_LENGTH;
const CROSS_X = -AXIS_Y;
const CROSS_Y = AXIS_X;
/** Pitch that levels the perched bird's tail-down body axis (about 27°) for flight. */
const LEVEL = -Math.atan2(AXIS_Y, AXIS_X);
/** The folded wing's long axis (shoulder → tip) and its normal, in design space. */
const WING_U = [Math.SQRT1_2, Math.SQRT1_2];
const WING_V = [-Math.SQRT1_2, Math.SQRT1_2];
const WING_BOX = [470, 290, 240, 240];
/** Wing samples that stay on the body, filling the flank and rump a raised wing uncovers. */
const FLANK = 9;

/**
 * Wing poses as [stroke elevation, backward sweep, span, chord]. Elevation is the side-view
 * wingbeat angle (+ up); a wing spread towards the viewer foreshortens to a stub.
 */
const FOLDED = Object.freeze([-Math.PI / 4, Math.SQRT1_2, 1, 1]);
const SWEPT = Object.freeze([0.3, 1, 1.28, 1]);
const TUCKED = Object.freeze([-0.36, 1, 1.2, 0.84]);
const FLARE = Object.freeze([1.05, -0.18, 1.3, 1]);
/** Wingbeats: quick in the air; underwater a slow scull at rest and fuller strokes to swim. */
const FLAP = Object.freeze({ beat: 240, up: 1.2, down: -0.8, sweep: 0.32, spread: 1.36, chord: 1.08 });
const SCULL = Object.freeze({ beat: 1150, up: 0.5, down: -0.32, sweep: 0.64, spread: 1.14, chord: 0.96 });
const STROKE = Object.freeze({ beat: 540, up: 0.95, down: -0.72, sweep: 0.46, spread: 1.3, chord: 1.02 });
/** The streamlined dive pose at the moment the bill breaks the surface. */
const PLUNGE = Object.freeze({ stretch: 1.34, narrow: 0.8, head: 0.3, tail: -0.62 });
/** Swimming posture at full speed. */
const SWIM = Object.freeze({ pitch: 0.12, stretch: 1.12, narrow: 0.88, head: 0.14, tail: -0.52 });

/** Scene-00 timeline shared by the pond (splash, descent) and the bird (dive and swim). */
export const DIVE = Object.freeze({ focus: 0.08, crouch: 0.18, launch: 0.27, apex: 0.36, entry: 0.47, level: 0.6, arrive: 1 });
/** Chapter swims start here, in the local progress of the chapter being left. */
const DEPART = 0.72;
/** Fraction of the last swim spent rising above the search pill before the dive. */
const PILL_APEX = 0.62;

/**
 * How far the reader has sunk with the bird in scene 00: from the hover over the pond the
 * surface world (title, branch, waterline) slides up until the waterline leaves the top.
 */
export function descent(local, surface, h) {
  return (surface.waterY + h * 0.08) * ease(clamp01((local - DIVE.apex) / 0.46));
}

const shuffled = (length, seed) => {
  const order = Array.from({ length }, (_, k) => k);
  const random = randomGenerator(seed);
  for (let k = length - 1; k > 0; k -= 1) {
    const j = Math.floor(random() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  return order;
};

/** Monotone cubic keyframes [[t, value], …]: smooth, flat at holds, never overshooting. */
function track(keys) {
  const n = keys.length;
  const slopes = [];
  for (let k = 0; k < n - 1; k += 1) slopes.push((keys[k + 1][1] - keys[k][1]) / (keys[k + 1][0] - keys[k][0]));
  const tangents = keys.map((key, k) => {
    if (k === 0 || k === n - 1) return 0;
    const a = slopes[k - 1];
    const b = slopes[k];
    if (a * b <= 0) return 0;
    const before = key[0] - keys[k - 1][0];
    const after = keys[k + 1][0] - key[0];
    const wa = 2 * after + before;
    const wb = after + 2 * before;
    return (wa + wb) / (wa / a + wb / b);
  });
  return t => {
    if (t <= keys[0][0]) return keys[0][1];
    if (t >= keys[n - 1][0]) return keys[n - 1][1];
    let k = 0;
    while (t > keys[k + 1][0]) k += 1;
    const span = keys[k + 1][0] - keys[k][0];
    const u = (t - keys[k][0]) / span;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * keys[k][1] + (u3 - 2 * u2 + u) * span * tangents[k] + (3 * u2 - 2 * u3) * keys[k + 1][1] + (u3 - u2) * span * tangents[k + 1];
  };
}

/** Cubic Hermite point and velocity (per unit u) from p0 (tangent m0) to p1 (tangent m1). */
function hermite(p0, m0, p1, m1, u, out) {
  const u2 = u * u;
  const u3 = u2 * u;
  const a = 2 * u3 - 3 * u2 + 1;
  const b = u3 - 2 * u2 + u;
  const c = 3 * u2 - 2 * u3;
  const d = u3 - u2;
  out.x = a * p0.x + b * m0.x + c * p1.x + d * m1.x;
  out.y = a * p0.y + b * m0.y + c * p1.y + d * m1.y;
  const da = 6 * u2 - 6 * u;
  const db = 3 * u2 - 4 * u + 1;
  const dd = 3 * u2 - 2 * u;
  out.vx = da * p0.x + db * m0.x - da * p1.x + dd * m1.x;
  out.vy = da * p0.y + db * m0.y - da * p1.y + dd * m1.y;
  return out;
}

/** Cubic Bézier point and velocity (per unit u). */
function bezier(p0, p1, p2, p3, u, out) {
  const v = 1 - u;
  out.x = v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x;
  out.y = v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y;
  out.vx = 3 * v * v * (p1.x - p0.x) + 6 * v * u * (p2.x - p1.x) + 3 * u * u * (p3.x - p2.x);
  out.vy = 3 * v * v * (p1.y - p0.y) + 6 * v * u * (p2.y - p1.y) + 3 * u * u * (p3.y - p2.y);
  return out;
}

/**
 * A smooth route through waypoints (centripetal Catmull–Rom, so it never loops or cusps),
 * sampled by arc length so the bird can swim it at an even, eased pace.
 */
function pathThrough(points, perSegment = 24) {
  const first = points[0];
  const last = points[points.length - 1];
  const pts = [
    { x: 2 * first.x - points[1].x, y: 2 * first.y - points[1].y },
    ...points,
    { x: 2 * last.x - points[points.length - 2].x, y: 2 * last.y - points[points.length - 2].y },
  ];
  const knot = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  const xs = [];
  const ys = [];
  for (let seg = 1; seg < pts.length - 2; seg += 1) {
    const [p0, p1, p2, p3] = [pts[seg - 1], pts[seg], pts[seg + 1], pts[seg + 2]];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let k = 0; k < perSegment; k += 1) {
      const u = mix(t1, t2, k / perSegment);
      const a1x = mix(p0.x, p1.x, u / t1);
      const a1y = mix(p0.y, p1.y, u / t1);
      const a2x = mix(p1.x, p2.x, (u - t1) / (t2 - t1));
      const a2y = mix(p1.y, p2.y, (u - t1) / (t2 - t1));
      const a3x = mix(p2.x, p3.x, (u - t2) / (t3 - t2));
      const a3y = mix(p2.y, p3.y, (u - t2) / (t3 - t2));
      const b1x = mix(a1x, a2x, u / t2);
      const b1y = mix(a1y, a2y, u / t2);
      const b2x = mix(a2x, a3x, (u - t1) / (t3 - t1));
      const b2y = mix(a2y, a3y, (u - t1) / (t3 - t1));
      xs.push(mix(b1x, b2x, (u - t1) / (t2 - t1)));
      ys.push(mix(b1y, b2y, (u - t1) / (t2 - t1)));
    }
  }
  xs.push(last.x);
  ys.push(last.y);
  const n = xs.length;
  const lengths = new Float32Array(n);
  for (let k = 1; k < n; k += 1) lengths[k] = lengths[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  const total = lengths[n - 1] || 1;
  return {
    total,
    /** Position and unit heading at arc fraction s. */
    at(s, out) {
      const target = clamp01(s) * total;
      let lo = 0;
      let hi = n - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lengths[mid] <= target) lo = mid;
        else hi = mid;
      }
      const f = (target - lengths[lo]) / (lengths[hi] - lengths[lo] || 1);
      out.x = mix(xs[lo], xs[hi], f);
      out.y = mix(ys[lo], ys[hi], f);
      const dx = xs[hi] - xs[lo];
      const dy = ys[hi] - ys[lo];
      const length = Math.hypot(dx, dy) || 1;
      out.vx = dx / length;
      out.vy = dy / length;
      return out;
    },
  };
}

let wingMask = null;
/** The folded wing rasterised once, so the flank can tell which of it is still covered. */
function wingCoverage() {
  if (wingMask) return wingMask;
  const [x0, y0, bw, bh] = WING_BOX;
  wingMask = new Uint8Array(bw * bh);
  const canvas = document.createElement('canvas');
  canvas.width = bw;
  canvas.height = bh;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return wingMask;
  context.translate(-x0, -y0);
  context.lineWidth = 3;
  const path = new Path2D(PATHS.wing);
  context.fill(path);
  context.stroke(path);
  const data = context.getImageData(0, 0, bw, bh).data;
  for (let k = 0; k < bw * bh; k += 1) wingMask[k] = data[k * 4 + 3] > 96 ? 1 : 0;
  return wingMask;
}

/** Flank colour under the wing: the cyan rump towards the back, the orange flank below. */
function flankColour(x, y, target, offset) {
  const light = 1.12 - ((y - 150) / 470) * 0.26 - Math.max(0, (x - 560) / 900) * 0.1;
  const depth = clamp01((y - 330) / 230);
  const across = (x - CENTRE[0]) * CROSS_X + (y - CENTRE[1]) * CROSS_Y;
  const rump = 1 - smooth(-64, -34, across);
  target[offset] = Math.min(1, mix(mix(0.95, 0.86, depth), 0.322, rump) * light);
  target[offset + 1] = Math.min(1, mix(mix(0.55, 0.38, depth), 0.847, rump) * light);
  target[offset + 2] = Math.min(1, mix(mix(0.27, 0.16, depth), 0.933, rump) * light);
}

/** Where the small perched bird, its branch and the pond sit on this viewport. */
export function surfaceLayout({ w, h, mobile }) {
  // Small beside the title, and never tall enough on a short screen to reach the header.
  const width = Math.min(h * 0.26, mobile ? w * 0.27 : Math.min(165, Math.max(118, w * 0.095)));
  const scale = width / BIRD_WIDTH;
  const feet = mobile ? { x: w * 0.8, y: h * 0.72 } : { x: w * 0.855, y: h * 0.745 };
  const waterY = mobile ? h * 0.87 : h * 0.9;
  const bill = { x: feet.x - (FEET[0] - BILL_TIP[0]) * scale, y: feet.y - (FEET[1] - BILL_TIP[1]) * scale };
  // The bird hops out past the bill and enters there.
  const entry = { x: feet.x - width * 0.9, y: waterY };
  return { width, scale, feet, waterY, bill, entry, lineLeft: mobile ? w * 0.3 : w * 0.58, lineRight: w * 0.99 };
}

/** Rasterise the Alcedo title like the original landing and keep a shuffled subset. */
function sampleTitle(text, { w, h, mobile }, count) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const data = new Float32Array(Math.max(1, count) * 2);
  if (!context) {
    for (let k = 0; k < count; k += 1) { data[k * 2] = w / 2; data[k * 2 + 1] = h / 2; }
    return data;
  }
  const size = mobile ? w * 0.225 : w * 0.0958;
  context.font = `italic ${size}px Instrument, serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#fff';
  context.fillText(text, w / 2, h / 2);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const points = [];
  const top = Math.max(0, Math.floor(h / 2 - size));
  const bottom = Math.min(canvas.height, Math.ceil(h / 2 + size));
  for (let y = top; y < bottom; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) if (pixels[(y * canvas.width + x) * 4 + 3] > 70) points.push(x, y);
  }
  const total = points.length / 2;
  if (!total) {
    for (let k = 0; k < count; k += 1) { data[k * 2] = w / 2; data[k * 2 + 1] = h / 2; }
    return data;
  }
  // A seeded shuffle, not a stride: striding scanline samples leaves visible stripes.
  const order = shuffled(total, 1307);
  const random = randomGenerator(911);
  for (let k = 0; k < count; k += 1) {
    const p = order[k % total] * 2;
    const extra = k >= total ? 0.9 : 0;
    data[k * 2] = points[p] + (random() - 0.5) * extra;
    data[k * 2 + 1] = points[p + 1] + (random() - 0.5) * extra;
  }
  return data;
}

/**
 * Scene 00 without the bird: the Alcedo title in the centre, and at the bottom right a
 * branch over a short waterline with sparkles, light shafts below the surface, a dripping
 * bill and the splash of the dive. After the dive the whole surface world slides up and
 * away (see `descent`), so the reader sinks with the bird.
 */
export function buildSurface({ w, h, mobile, particles, surface }) {
  const { waterY, lineLeft, lineRight, feet, bill, entry, scale, width } = surface;
  const drop = { phase: 0 };
  const camera = local => descent(local, surface, h);
  const ripple = (x, time, local) => {
    let y = Math.sin(x * 0.018 + time * 0.0012) * 0.7 + Math.sin(x * 0.051 - time * 0.0019) * 0.35;
    const since = drop.phase - 0.22;
    if (since > 0 && since < 0.6) {
      const dx = Math.abs(x - bill.x);
      y += Math.sin(dx * 0.1 - since * 22) * 2 * Math.exp(-since * 5) * Math.exp(-dx / 60);
    }
    const phase = (local - DIVE.entry) / 0.18;
    if (phase > 0 && phase < 1) {
      const dx = Math.abs(x - entry.x);
      y += Math.sin(dx * 0.07 - phase * 24) * 7 * (1 - phase) * Math.exp(-dx / (w * 0.12));
    }
    return y;
  };
  // A crown rather than a cone: the water rises in a ring around the hole the bird makes.
  const crown = (x, local) => {
    const phase = (local - DIVE.entry) / 0.09;
    if (phase <= 0 || phase >= 1) return 0;
    const ring = (Math.abs(x - entry.x) - width * 0.12) / (width * 0.13);
    return Math.sin(Math.PI * phase) * width * 0.3 * Math.exp(-ring * ring);
  };
  const colour = (out, rgb, alpha) => { out[3] = rgb[0]; out[4] = rgb[1]; out[5] = rgb[2]; out[6] = alpha; };
  const branchTip = feet.x - width * 0.42;
  const branchAt = t => [mix(branchTip, w * 1.02, t), feet.y + 3 + Math.sin(t * Math.PI) * 4 - t * 8];
  const scene = makeScene([
    {
      weight: 0.76,
      build(count) {
        const points = sampleTitle('Alcedo', { w, h, mobile }, count);
        return (f, i, local, ctx, out, rest) => {
          const k = Math.min(count - 1, Math.floor(f * count));
          const s = ctx.seed;
          const q = i * 4;
          out[0] = points[k * 2] + (rest ? 0 : Math.sin(ctx.time * 0.0005 + s[q + 1] * TAU) * 0.55);
          out[1] = points[k * 2 + 1] + (rest ? 0 : Math.cos(ctx.time * 0.0006 + s[q + 2] * TAU) * 0.55) - camera(local);
          out[2] = 0.72 + s[q + 3] * 0.5;
          colour(out, ctx.palette[COLOR.fg], 0.62 + s[q + 3] * 0.38);
        };
      },
    },
    {
      weight: 0.05,
      build(count) {
        const bark = randomGenerator(2718);
        const data = new Float32Array(count * 3);
        for (let k = 0; k < count; k += 1) {
          const twig = k >= count * 0.88;
          const t = bark();
          let x;
          let y;
          let thickness;
          if (twig) {
            const [bx, by] = branchAt(0.5);
            x = bx + t * 44 * (scale / 0.19);
            y = by - t * 36 * (scale / 0.19) - Math.sin(t * Math.PI) * 5;
            thickness = mix(2.2, 0.8, t);
          } else {
            [x, y] = branchAt(t);
            thickness = mix(1.6, 6.5, t ** 0.8) * Math.max(0.8, scale / 0.19);
          }
          const across = (bark() - 0.5) * thickness;
          data[k * 3] = x + (bark() - 0.5) * 1.2;
          data[k * 3 + 1] = y + across;
          data[k * 3 + 2] = (0.36 + 0.5 * Math.sqrt(1 - Math.min(1, Math.abs(across) / (thickness / 2 + 0.01)))) * (across < 0 ? 1 : 0.62);
        }
        return (f, i, local, ctx, out, rest) => {
          const k = Math.min(count - 1, Math.floor(f * count)) * 3;
          const x = data[k];
          let y = data[k + 1];
          // The branch dips as the bird crouches, then springs back when it pushes off.
          const reach = 1 - clamp01((x - branchTip) / (w * 0.14));
          const load = smooth(DIVE.crouch, DIVE.launch, local) * (1 - smooth(DIVE.launch, DIVE.launch + 0.02, local));
          y += load * 2.2 * reach;
          const launch = local - DIVE.launch;
          if (!rest && launch > 0 && launch < 0.25) y -= Math.sin(launch * 70) * Math.exp(-launch * 16) * 5 * reach;
          out[0] = x;
          out[1] = y - camera(local);
          out[2] = 0.95 + ctx.seed[i * 4 + 3] * 0.45;
          colour(out, ctx.palette[COLOR.bark], data[k + 2]);
        };
      },
    },
    {
      weight: 0.08,
      build() {
        return (f, i, local, ctx, out, rest) => {
          const x = mix(lineLeft, lineRight, f);
          const edge = smooth(0, 0.22, f) * smooth(1, 0.96, f);
          const s = ctx.seed;
          const q = i * 4;
          out[0] = x + (rest ? 0 : (s[q] - 0.5) * 1.1);
          out[1] = waterY - camera(local) + (rest ? 0 : ripple(x, ctx.time, local) - crown(x, local) * (0.35 + s[q + 2] * 0.65));
          out[2] = 0.85 + s[q + 3] * 0.45;
          colour(out, ctx.palette[COLOR.fg], (0.34 + s[q + 2] * 0.28) * edge);
        };
      },
    },
    {
      // Below the surface: faint shafts of light slanting down from the waterline.
      weight: 0.05,
      build() {
        const SHAFTS = 6;
        return (f, i, local, ctx, out, rest) => {
          const s = ctx.seed;
          const q = i * 4;
          const shaft = Math.min(SHAFTS - 1, Math.floor(f * SHAFTS));
          const along = s[q + 1] ** 0.75;
          const reach = h * 0.95;
          const origin = mix(lineLeft - w * 0.04, lineRight - w * 0.02, (shaft + 0.5) / SHAFTS) + Math.sin(shaft * 7.1) * w * 0.02;
          const breadth = (14 + (shaft % 3) * 12) * (1 + along * 1.8);
          out[0] = origin - along * reach * 0.3 + (s[q] - 0.5) * breadth;
          out[1] = waterY + 3 + along * reach - camera(local);
          out[2] = 0.7 + s[q + 3] * 0.4;
          const shimmer = rest ? 0.5 : 0.5 + 0.5 * Math.sin(ctx.time * 0.0007 * (0.7 + (shaft % 3) * 0.2) + shaft * 2.1 + along * 3);
          colour(out, ctx.palette[COLOR.fg], (0.03 + 0.1 * shimmer) * (1 - along) ** 1.3 * (0.4 + 0.6 * (1 - Math.abs(s[q] - 0.5) * 2)));
        };
      },
    },
    {
      weight: 0.03,
      build() {
        return (f, i, local, ctx, out, rest) => {
          const s = ctx.seed;
          const q = i * 4;
          const x = mix(lineLeft + (lineRight - lineLeft) * 0.18, lineRight - 8, (f * 13.7 + s[q]) % 1);
          out[0] = x;
          out[1] = waterY - camera(local) + (s[q + 1] - 0.5) * 3 + (rest ? 0 : ripple(x, ctx.time, local));
          out[2] = 0.95 + s[q + 3] * 0.7;
          const glint = rest ? 0.4 : Math.max(0, Math.sin(ctx.time * 0.0019 * (0.6 + s[q + 3]) + s[q] * TAU)) ** 12;
          colour(out, ctx.palette[s[q + 2] > 0.78 ? COLOR.flash : COLOR.fg], 0.1 + glint * 0.75);
        };
      },
    },
    {
      // Spray: the entry throws a crown of droplets out from the rim of the hole.
      weight: 0.03,
      build() {
        return (f, i, local, ctx, out, rest) => {
          const s = ctx.seed;
          const q = i * 4;
          const start = DIVE.entry + 0.004 + s[q + 2] * 0.03;
          const t = rest ? -1 : (local - start) / 0.08;
          const side = s[q] < 0.5 ? -1 : 1;
          const spread = Math.abs(s[q] - 0.5) * 2;
          const surfaceY = waterY - camera(local);
          out[0] = entry.x + side * width * 0.12;
          out[1] = surfaceY;
          out[2] = 0.65 + s[q + 3] * 0.55;
          colour(out, ctx.palette[COLOR.fg], 0);
          if (t <= 0 || t >= 1) return;
          const angle = 0.2 + 0.6 * spread;
          const height = (0.3 + 0.7 * s[q + 1] ** 1.3) * width * 0.75 * Math.cos(angle);
          out[0] += side * Math.min(width * 1.8, 4 * height * Math.tan(angle)) * t;
          out[1] = surfaceY - height * 4 * t * (1 - t);
          const tint = ctx.palette[s[q + 3] > 0.7 ? COLOR.flash : COLOR.fg];
          colour(out, tint, (0.45 + 0.45 * s[q + 3]) * smooth(0, 0.08, t) * (1 - smooth(0.75, 1, t)));
        };
      },
    },
    {
      weight: 0.02,
      build() {
        return (f, i, local, ctx, out, rest) => {
          const s = ctx.seed;
          const q = i * 4;
          const phase = rest ? 0.9 : drop.phase;
          const idle = 1 - smooth(DIVE.crouch - 0.08, DIVE.crouch, local);
          colour(out, ctx.palette[COLOR.fg], 0);
          if (phase < 0.22) {
            const fall = clamp01((phase - 0.08) / 0.14);
            out[0] = bill.x + (s[q] - 0.5) * 1.6;
            out[1] = mix(bill.y + 1, waterY, fall * fall) + (s[q + 1] - 0.5) * 1.6 - camera(local);
            out[2] = 0.8;
            out[6] = smooth(0, 0.08, phase) * 0.8 * idle;
          } else {
            const spread = ease(clamp01((phase - 0.22) / 0.5));
            const angle = f * TAU;
            const radius = mix(1.5, width * 0.4, spread) * (0.94 + s[q + 2] * 0.12);
            out[0] = bill.x + Math.cos(angle) * radius;
            out[1] = waterY + Math.sin(angle) * radius * 0.17 - camera(local);
            out[2] = 0.8;
            out[6] = (1 - smooth(0.25, 0.75, phase)) * 0.5 * idle;
          }
        };
      },
    },
  ], particles);
  scene.prepare = ctx => { drop.phase = (ctx.time % 4600) / 4600; };
  return scene;
}

/**
 * The companion: a small rigged kingfisher made of its own particles. It dives into the
 * pond and takes the reader down with it. Underwater, like a diving bird holding itself
 * down against its buoyancy, it grips something in each chapter: a knot of the network,
 * the top of a card it peeks over, a note's edge, a node of the flow. Between spots it
 * swims routes that go around what is on screen, trailing bubbles, and at the end it dives
 * into the search pill and dissolves along its outline. Everything is a function of the rendered progress
 * (so scrolling back rewinds it) plus time for breathing, wingbeats and bubbles, so a
 * reader who stops mid-swim finds the bird sculling in place rather than frozen.
 */
export function buildCompanion({ w, h, mobile, count, surface, perches, pill }) {
  const design = designSamples();
  const mask = wingCoverage();
  const total = design.length / 6;
  const order = shuffled(total, 6070);
  const random = randomGenerator(4441);
  const STRIDE = 10; // design x, y, r, g, b, region, axial, flank r, g, b
  const points = new Float32Array(count * STRIDE);
  for (let k = 0; k < count; k += 1) {
    const source = order[k % total] * 6;
    const extra = k >= total ? 1.8 : 0;
    const x = design[source] + (random() - 0.5) * extra;
    const y = design[source + 1] + (random() - 0.5) * extra;
    const o = k * STRIDE;
    let region = design[source + 5];
    points[o] = x;
    points[o + 1] = y;
    for (let c = 0; c < 3; c += 1) {
      points[o + 2 + c] = design[source + 2 + c];
      points[o + 7 + c] = design[source + 2 + c];
    }
    if (region === REGION.wing && random() < 0.42) {
      region = FLANK;
      flankColour(x, y, points, o + 7);
    }
    points[o + 5] = region;
    points[o + 6] = clamp01(((x - BILL_TIP[0]) * AXIS_X + (y - BILL_TIP[1]) * AXIS_Y) / AXIS_LENGTH);
  }
  const scale = surface.scale;
  const W = surface.width;
  const D = DIVE;
  const centreOf = perch => ({ x: perch.feet.x + (CENTRE[0] - FEET[0]) * scale * perch.facing, y: perch.feet.y + (CENTRE[1] - FEET[1]) * scale });
  const rests = perches.map(centreOf);
  // Routes stay inside the screen, below the header and clear of the side rail (desktop) or
  // the bottom rail (mobile).
  const safe = { left: W * 0.62, right: w - W * 0.62 - (mobile ? 0 : 56), top: 64 + W * 0.45, bottom: h - W * 0.62 - (mobile ? 96 : 0) };
  const keep = p => ({ x: Math.max(safe.left, Math.min(safe.right, p.x)), y: Math.max(safe.top, Math.min(safe.bottom, p.y)) });
  const forwardOf = facing => (facing >= 0 ? -1 : 1);
  const scratch = [0, 0];
  const place = [0, 0];
  const outline = [0, 0, 0, 0];
  const poseA = [0, 0, 0, 0];
  const poseB = [0, 0, 0, 0];
  const poseC = [0, 0, 0, 0];
  const poseD = [0, 0, 0, 0];
  const path = { x: 0, y: 0, vx: 0, vy: 0 };
  const DEFAULT = Object.freeze({
    x: 0, y: 0, facing: 1, pitch: 0, stretch: 1, narrow: 1, wing: 0, wingLength: 1, chord: 1,
    head: 0, tail: 0, crouch: 0, feet: 1, alpha: 1, clipY: Infinity, idle: 1, blink: 0, occluder: null,
  });
  const CAMERA = descent(1, surface, h);
  const cameraAt = p => (p >= 1 ? CAMERA : descent(Math.max(0, p), surface, h));

  /** Design point → screen: streamline along the body axis, pitch about the centre, face. */
  const toScreen = (x, y, rig, breath, out) => {
    const dx = x - CENTRE[0];
    const dy = y - CENTRE[1];
    let a = dx * AXIS_X + dy * AXIS_Y;
    a *= (a < 0 ? rig.stretch : 1) * breath;
    const b = (dx * CROSS_X + dy * CROSS_Y) * rig.narrow * breath;
    const lx = AXIS_X * a + CROSS_X * b;
    const ly = AXIS_Y * a + CROSS_Y * b;
    const cos = Math.cos(rig.pitch);
    const sin = Math.sin(rig.pitch);
    out[0] = rig.x + (lx * cos - ly * sin) * scale * rig.facing;
    out[1] = rig.y + (lx * sin + ly * cos) * scale;
    return out;
  };
  /** Where the bill tip sits relative to the rig centre for a streamlined pose. */
  const billOffset = (pitch, facing) => {
    const probe = { ...DEFAULT, pitch, facing, stretch: PLUNGE.stretch, narrow: PLUNGE.narrow };
    rotateAbout(BILL_TIP[0], BILL_TIP[1], NECK[0], NECK[1], PLUNGE.head, scratch);
    return toScreen(scratch[0], scratch[1], probe, 1, [0, 0]);
  };

  const perched = (rig, stage) => {
    Object.assign(rig, DEFAULT);
    rig.x = rests[stage].x;
    rig.y = rests[stage].y;
    rig.facing = perches[stage].facing;
    return rig;
  };
  /** The side-view wing from [elevation, sweep, span, chord]. */
  const setWing = (rig, pose) => {
    const vy = -Math.sin(pose[0]);
    rig.wing = Math.atan2(vy, pose[1]) - Math.PI / 4;
    rig.wingLength = Math.hypot(pose[1], vy) * pose[2];
    rig.chord = pose[3];
  };
  const blend = (a, b, t, out) => {
    for (let c = 0; c < 4; c += 1) out[c] = mix(a[c], b[c], t);
    return out;
  };
  /** 0 with the wings up, 1 at the bottom of the power stroke (the quicker 42% of a beat). */
  const stroke = (time, beat) => {
    const p = ((time / beat) % 1 + 1) % 1;
    const d = p < 0.42 ? p / 0.42 : 1 - (p - 0.42) / 0.58;
    return d * d * (3 - 2 * d);
  };
  /** The wing of a stroke style at this moment; returns the stroke phase for the body bob. */
  const strokePose = (style, time, out) => {
    const s = stroke(time, style.beat);
    out[0] = mix(style.up, style.down, s);
    out[1] = style.sweep;
    out[2] = style.spread;
    out[3] = style.chord;
    return s;
  };
  /** Blend folded → pose by `poseWeight`, then towards the wingbeat of `style`. */
  const wingBlend = (rig, time, beatWeight, pose, poseWeight, style = FLAP, bob = 0.035) => {
    blend(FOLDED, pose, poseWeight, poseA);
    const s = strokePose(style, time, poseB);
    setWing(rig, blend(poseA, poseB, beatWeight, poseC));
    // The body rides up on each downstroke.
    rig.y += (0.5 - s) * W * bob * beatWeight;
  };
  /** Underwater posture: sculling in place at travel 0, full swimming strokes at travel 1. */
  const swimPose = (rig, travel, time, vx, vy) => {
    const facing = rig.facing >= 0 ? 1 : -1;
    // Like a diving bird underwater the body stays long and low; it only leans into the climb.
    const heading = Math.max(-0.32, Math.min(0.32, Math.atan2(-vy, -facing * vx) * 0.55));
    rig.pitch = LEVEL + SWIM.pitch + mix(Math.sin(time * 0.0009) * 0.06, heading, travel);
    const a = strokePose(SCULL, time, poseA);
    const b = strokePose(STROKE, time, poseB);
    setWing(rig, blend(poseA, poseB, travel, poseC));
    rig.y += mix((0.5 - a) * 0.02, (0.5 - b) * 0.04, travel) * W;
    rig.stretch = mix(1.03, SWIM.stretch, travel);
    rig.narrow = mix(0.97, SWIM.narrow, travel);
    rig.head = mix(0.08, SWIM.head, travel);
    rig.tail = mix(-0.42 + Math.sin(time * 0.0017) * 0.08, SWIM.tail, travel);
    rig.feet = 0;
    rig.crouch = 0;
    rig.idle = 0.55 * (1 - travel);
  };
  /** Resting: looks down at what it holds, nods now and then, and glances at the pointer. */
  const curious = (stage, time, look) => {
    const c = ((time / 5200 + stage * 0.37) % 1 + 1) % 1;
    const down = Math.sin(Math.PI * smooth(0.16, 0.5, c)) ** 2;
    const nods = c > 0.6 && c < 0.72 ? Math.sin(((c - 0.6) / 0.12) * TAU) * 0.13 : 0;
    return mix(look * 0.4, look - 0.1, down) + nods;
  };
  const blinking = (stage, time) => {
    const b = ((time / 3400 + stage * 0.29) % 1 + 1) % 1;
    return b < 0.045 ? Math.sin((b / 0.045) * Math.PI) : 0;
  };
  /** Underwater a bird floats up unless it holds on: it grips its spot, swaying in the current. */
  const gripping = (rig, stage, time) => {
    const perch = perches[stage];
    Object.assign(rig, DEFAULT);
    rig.x = rests[stage].x;
    rig.y = rests[stage].y;
    rig.facing = perch.facing;
    rig.occluder = perch.occluder || null;
    rig.pitch = (perch.lean || 0) + Math.sin(time * 0.0008 + stage) * 0.025;
    rig.head = curious(stage, time, perch.look || 0);
    rig.blink = blinking(stage, time);
    return rig;
  };
  const pushOff = track([[0, 0], [0.05, 1], [0.1, 0]]);
  const settle = track([[0.95, 0], [0.98, 0.45], [1, 0]]);
  /**
   * Swimming a route at normalised time t: push off from the spot, stroke along the route,
   * brake with the wings forward and the feet reaching out, then grip and fold the wings.
   */
  const legPose = (rig, t, time, vx, vy, from, to, { depart = true, arrive = true } = {}) => {
    const away = depart ? smooth(0.02, 0.12, t) : 1;
    const brake = arrive ? smooth(0.8, 0.9, t) : 0;
    const hold = arrive ? smooth(0.93, 1, t) : 0;
    swimPose(rig, away * (1 - brake), time, vx, vy);
    const flare = brake * (1 - hold);
    const fold = Math.max(1 - away, hold);
    blend(poseC, FLARE, flare, poseD);
    setWing(rig, blend(poseD, FOLDED, fold, poseD));
    const spot = t < 0.5 ? from : to;
    rig.pitch = mix(rig.pitch + flare * 0.32, spot.lean || 0, fold);
    rig.stretch = mix(rig.stretch, 1, fold);
    rig.narrow = mix(rig.narrow, 1, fold);
    rig.head = mix(rig.head, (spot.look || 0) * 0.4, fold);
    rig.tail = mix(rig.tail + flare * 0.3, 0, fold);
    rig.feet = Math.max(fold, arrive ? smooth(0.84, 0.92, t) : 0);
    rig.crouch = (depart ? pushOff(t) : 0) + (arrive ? settle(t) : 0);
    rig.idle = fold;
  };
  /**
   * Plunge posture at normalised dive time k: the bird noses over ahead of its path, lines
   * its body up with the fall, and sweeps its wings back until it is an arrow at entry.
   */
  const divePose = (rig, k, time, vx, vy, start, style = FLAP) => {
    const facing = rig.facing >= 0 ? 1 : -1;
    const aligned = LEVEL + Math.atan2(-vy, -facing * vx);
    const lead = -0.28 * Math.sin(Math.PI * smooth(0, 0.7, k));
    rig.pitch = mix(start.pitch, aligned + lead, smooth(0, 0.35, k));
    rig.stretch = mix(start.stretch, PLUNGE.stretch, smooth(0.1, 0.9, k));
    rig.narrow = mix(start.narrow, PLUNGE.narrow, smooth(0.1, 0.85, k));
    rig.head = mix(start.head, PLUNGE.head, smooth(0.15, 0.85, k));
    rig.tail = mix(start.tail, PLUNGE.tail, smooth(0, 0.8, k));
    rig.crouch = 0;
    rig.feet = 0;
    rig.idle = 0;
    wingBlend(rig, time, 1 - smooth(0, 0.3, k), blend(SWEPT, TUCKED, smooth(0.35, 0.95, k), poseD), 1, style, style === FLAP ? 0.035 : 0.04);
  };

  // ---- 00: the dive into the pond, and down with the reader ----
  const f0 = perches[0].facing;
  const ahead = forwardOf(f0);
  const rest0 = rests[0];
  const ENTRY_ANGLE = 1.4; // radians below the horizon, about 80°
  const apex0 = { x: rest0.x + ahead * W * 0.42, y: rest0.y - W * 0.52 };
  const entryDir = { x: ahead * Math.cos(ENTRY_ANGLE), y: Math.sin(ENTRY_ANGLE) };
  const bill0 = billOffset(LEVEL - ENTRY_ANGLE, f0);
  // The surface is already sliding up when the bill reaches it.
  const entry0 = { x: surface.entry.x - bill0[0], y: surface.waterY - descent(D.entry, surface, h) + 1 - bill0[1] };
  const T1 = D.apex - D.launch;
  const T2 = D.entry - D.apex;
  const T3 = D.level - D.entry;
  const T4 = D.arrive - D.level;
  const push = { x: ahead * W * 0.3, y: -W * 0.8 };
  const hover1 = { x: ahead * W * 0.4, y: 0 };
  const hover2 = { x: hover1.x * T2 / T1, y: 0 };
  const speed0 = Math.hypot(entry0.x - apex0.x, entry0.y - apex0.y) * 2.6;
  const plunge0 = { x: entryDir.x * speed0, y: entryDir.y * speed0 };
  const hoverPose = { pitch: LEVEL + 0.35, head: -0.15, stretch: 1, narrow: 1, tail: -0.5 };
  const lift = {
    crouch: track([[D.crouch, 0], [D.launch - 0.012, 1], [D.launch + 0.02, 0]]),
    head: track([[D.focus, 0], [D.crouch, -0.28], [D.launch, -0.2], [D.launch + 0.03, -0.05], [D.apex, hoverPose.head]]),
    tail: track([[D.focus, 0], [D.crouch - 0.03, -0.22], [D.crouch + 0.02, 0.06], [D.launch, -0.3], [D.launch + 0.03, hoverPose.tail]]),
    lean: track([[D.focus, 0], [D.crouch, -0.08], [D.launch, -0.24]]),
    flap: track([[D.launch - 0.01, 0], [D.launch + 0.02, 1]]),
    feet: track([[D.launch, 1], [D.launch + 0.04, 0]]),
  };
  // Momentum carries it deep, low on the screen, before it pulls out and swims on.
  const deep0 = { x: surface.entry.x + ahead * W, y: safe.bottom };
  const pullOut = { x: plunge0.x * T3 / T2, y: plunge0.y * T3 / T2 };
  const glide = { x: ahead * W * 0.5, y: 0 };
  /** Keep going through the surface, slowing in the water. */
  const underwater = (from, dir, speed, tau, out) => {
    const d = speed * (tau - (0.5 * tau * tau) / 0.24);
    out.x = from.x + dir.x * d;
    out.y = from.y + dir.y * d;
    return out;
  };

  // ---- 04 → 05: up above the search pill, then down into it ----
  const pillEntry = pill ? { x: pill.x + pill.width * 0.46, y: pill.y } : { x: w / 2, y: h * 0.5 };
  const PILL_ANGLE = 1.45;
  const pillFacing = 1;
  const pillAhead = forwardOf(pillFacing);
  const pillApex = { x: pillEntry.x - pillAhead * W * 0.5, y: pillEntry.y - Math.max(W * 1.3, h * 0.26) };
  const pillDir = { x: pillAhead * Math.cos(PILL_ANGLE), y: Math.sin(PILL_ANGLE) };
  const billP = billOffset(LEVEL - PILL_ANGLE, pillFacing);
  const entryP = { x: pillEntry.x - billP[0], y: pillEntry.y + 1 - billP[1] };
  const rest4 = rests[4];
  const rise4 = { x: (pillApex.x - rest4.x) * 0.2, y: -h * 0.2 };
  const cruise = { x: pillAhead * W * 1.3, y: 0 };
  const cruiseDive = { x: cruise.x * (1 - PILL_APEX) / (PILL_APEX - 0.03), y: 0 };
  const speedP = Math.hypot(entryP.x - pillApex.x, entryP.y - pillApex.y) * 2.6;
  const plungeP = { x: pillDir.x * speedP, y: pillDir.y * speedP };
  const pillSpeed = speedP / ((1 - PILL_APEX) * (1 - DEPART));
  const swimStart = { pitch: LEVEL + SWIM.pitch, head: SWIM.head, stretch: SWIM.stretch, narrow: SWIM.narrow, tail: SWIM.tail };
  const pillPerimeter = pill ? 2 * (pill.width - pill.height) + Math.PI * pill.height : 1;
  /** A point on the rounded pill outline (x, y and outward normal), measured from the entry. */
  const pillPoint = (distance, out) => {
    if (!pill) { out[0] = pillEntry.x; out[1] = pillEntry.y; out[2] = 0; out[3] = -1; return out; }
    const r = pill.height / 2;
    const straight = pill.width - pill.height;
    const startOffset = pillEntry.x - (pill.x + r);
    let s = (((distance + startOffset) % pillPerimeter) + pillPerimeter) % pillPerimeter;
    let cx;
    let a;
    if (s < straight) { out[0] = pill.x + r + s; out[1] = pill.y; out[2] = 0; out[3] = -1; return out; }
    s -= straight;
    if (s < Math.PI * r) {
      cx = pill.x + pill.width - r;
      a = -Math.PI / 2 + s / r;
    } else {
      s -= Math.PI * r;
      if (s < straight) { out[0] = pill.x + pill.width - r - s; out[1] = pill.y + pill.height; out[2] = 0; out[3] = 1; return out; }
      s -= straight;
      cx = pill.x + r;
      a = Math.PI / 2 + s / r;
    }
    out[2] = Math.cos(a);
    out[3] = Math.sin(a);
    out[0] = cx + out[2] * r;
    out[1] = pill.y + r + out[3] * r;
    return out;
  };

  // ---- routes between the spots, shaped around what is on screen ----
  const behind = stage => -forwardOf(perches[stage].facing);
  const card = perches[2].occluder || null;
  const cardTop = card ? card.y : rests[2].y;
  const legs = [
    // 00 → 01: glide on from the dive, curve up and swoop onto the knot from below and behind.
    pathThrough([deep0, keep({ x: deep0.x + ahead * W * 0.5, y: deep0.y }), keep({ x: rests[1].x + behind(1) * W * 0.55, y: rests[1].y + W * 0.85 }), rests[1]]),
    // 01 → 02: up over the network, on past the card and down behind it to peek over the top.
    pathThrough([rests[1], keep({ x: rests[1].x + Math.sign(rests[2].x - rests[1].x || 1) * W * 0.9, y: rests[1].y - W * 0.7 }), keep({ x: rests[2].x + behind(2) * W * 0.8, y: cardTop - W }), rests[2]]),
    // 02 → 03: rise out from behind the card, swim on past the note and circle back onto it.
    pathThrough([rests[2], keep({ x: rests[2].x - behind(2) * W * 0.1, y: cardTop - W * 1.1 }), keep({ x: rests[3].x + behind(3) * W * 0.9, y: rests[3].y - W * 0.7 }), rests[3]]),
    // 03 → 04: a little hop up and over onto the node.
    pathThrough([rests[3], keep({ x: mix(rests[3].x, rests[4].x, 0.3), y: Math.min(rests[3].y, rests[4].y) - W * 0.6 }), keep({ x: mix(rests[3].x, rests[4].x, 0.8) + behind(4) * W * 0.2, y: rests[4].y - W * 0.5 }), rests[4]]),
  ];
  const look = { x: 0, y: 0, vx: 0, vy: 0 };
  // Which way the bird faces along each route: it keeps its facing through climbs and dives
  // and turns only where it really swims back the other way, quickly, through a front view.
  const FACING_SAMPLES = 96;
  const facings = legs.map((leg, index) => {
    const raw = new Float32Array(FACING_SAMPLES + 1);
    let current = perches[index].facing >= 0 ? 1 : -1;
    for (let k = 0; k <= FACING_SAMPLES; k += 1) {
      leg.at(k / FACING_SAMPLES, look);
      if (Math.abs(look.vx) > 0.35) current = look.vx < 0 ? 1 : -1;
      raw[k] = current;
    }
    const smoothed = new Float32Array(FACING_SAMPLES + 1);
    const reach = 3;
    for (let k = 0; k <= FACING_SAMPLES; k += 1) {
      let sum = 0;
      for (let j = -reach; j <= reach; j += 1) sum += raw[Math.max(0, Math.min(FACING_SAMPLES, k + j))];
      smoothed[k] = sum / (reach * 2 + 1);
    }
    return s => {
      const position = clamp01(s) * FACING_SAMPLES;
      const k = Math.min(FACING_SAMPLES - 1, Math.floor(position));
      return mix(smoothed[k], smoothed[k + 1], position - k);
    };
  });
  /** Swim route `index` (spot `index` → spot `index + 1`) at normalised time t. */
  const route = (rig, index, t, time) => {
    const from = perches[index];
    const to = perches[index + 1];
    const leg = legs[index];
    const fromRest = index > 0;
    Object.assign(rig, DEFAULT);
    let s;
    if (fromRest) s = ease(clamp01((t - 0.05) / 0.9));
    else {
      // Carry on at the speed the bird pulled out of the dive with, then slow to land.
      const u = clamp01(t / 0.95);
      const m0 = Math.min(2.5, (Math.hypot(glide.x, glide.y) / T3) * T4 / leg.total);
      s = 3 * u * u - 2 * u * u * u + (u * u * u - 2 * u * u + u) * m0;
    }
    leg.at(s, path);
    rig.x = path.x;
    rig.y = path.y;
    rig.facing = mix(mix(from.facing, facings[index](s), smooth(0.03, 0.12, t)), to.facing, smooth(0.9, 0.98, t));
    if ((index === 1 && t > 0.6) || (index === 2 && t < 0.35)) rig.occluder = card;
    legPose(rig, t, time, path.vx, path.vy, from, to, { depart: fromRest });
    return rig;
  };

  /** The rig at progress p. */
  const rigAt = (p, time, rig) => {
    const stage = Math.min(5, Math.floor(p));
    const l = p - stage;
    if (stage === 0) {
      if (l < D.launch) {
        perched(rig, 0);
        rig.crouch = lift.crouch(l);
        rig.head = lift.head(l);
        rig.tail = lift.tail(l);
        rig.pitch = lift.lean(l);
        rig.idle = 1 - smooth(D.focus, D.crouch, l) * 0.7;
        return rig;
      }
      if (l < D.apex) {
        // Push off up and out over the water into a brief hover, wings beating.
        perched(rig, 0);
        hermite(rest0, push, apex0, hover1, (l - D.launch) / T1, path);
        rig.x = path.x;
        rig.y = path.y;
        rig.idle = 0;
        rig.crouch = lift.crouch(l);
        rig.head = lift.head(l);
        rig.tail = lift.tail(l);
        rig.feet = lift.feet(l);
        const climb = Math.atan2(-path.vy, path.vx * ahead);
        rig.pitch = mix(lift.lean(l), hoverPose.pitch + Math.max(-0.4, Math.min(0.4, climb)) * 0.3 * (1 - smooth(D.apex - 0.03, D.apex, l)), smooth(D.launch, D.launch + 0.035, l));
        wingBlend(rig, time, lift.flap(l), FOLDED, 0);
        return rig;
      }
      if (l < D.entry) {
        perched(rig, 0);
        hermite(apex0, hover2, entry0, plunge0, (l - D.apex) / T2, path);
        rig.x = path.x;
        rig.y = path.y;
        divePose(rig, (l - D.apex) / T2, time, path.vx, path.vy, hoverPose);
        return rig;
      }
      if (l < D.level) {
        // Through the surface and on down; it pulls out of the dive and opens its wings.
        perched(rig, 0);
        const k = (l - D.entry) / T3;
        hermite(entry0, pullOut, deep0, glide, k, path);
        rig.x = path.x;
        rig.y = path.y;
        rig.idle = 0;
        rig.feet = 0;
        const aligned = LEVEL + Math.atan2(-path.vy, path.vx * ahead);
        rig.pitch = mix(aligned, LEVEL + SWIM.pitch + Math.max(-0.32, Math.min(0.32, (aligned - LEVEL) * 0.55)), smooth(0.55, 1, k));
        const open = smooth(0.3, 0.85, k);
        rig.stretch = mix(PLUNGE.stretch, SWIM.stretch, open);
        rig.narrow = mix(PLUNGE.narrow, SWIM.narrow, open);
        rig.head = mix(PLUNGE.head, SWIM.head, open);
        rig.tail = mix(PLUNGE.tail, SWIM.tail, open);
        wingBlend(rig, time, open, TUCKED, 1, STROKE, 0.04);
        return rig;
      }
      // Swim on through the depth to the network and take hold of it.
      return route(rig, 0, (l - D.level) / T4, time);
    }
    if (stage <= 3) {
      if (l < DEPART) return gripping(rig, stage, time);
      return route(rig, stage, (l - DEPART) / (1 - DEPART), time);
    }
    if (stage === 4) {
      if (l < DEPART) return gripping(rig, 4, time);
      const t = (l - DEPART) / (1 - DEPART);
      perched(rig, 4);
      if (t < PILL_APEX) {
        // Let go of the node and swim up over the search pill.
        const v = clamp01((t - 0.03) / (PILL_APEX - 0.03));
        const u = v * v * (2 - v);
        const du = (v * (4 - 3 * v)) / (PILL_APEX - 0.03);
        hermite(rest4, rise4, pillApex, cruise, u, path);
        rig.x = path.x;
        rig.y = path.y;
        const heading = Math.abs(pillApex.x - rest4.x) < W * 0.3 ? perches[4].facing : pillApex.x > rest4.x ? -1 : 1;
        rig.facing = mix(mix(perches[4].facing, heading, smooth(0.03, 0.12, t)), pillFacing, smooth(0.45, PILL_APEX, t));
        legPose(rig, t, time, path.vx * du, path.vy * du, perches[4], perches[4], { arrive: false });
        return rig;
      }
      const k = (t - PILL_APEX) / (1 - PILL_APEX);
      hermite(pillApex, cruiseDive, entryP, plungeP, k, path);
      rig.x = path.x;
      rig.y = path.y;
      rig.facing = pillFacing;
      divePose(rig, k, time, path.vx, path.vy, swimStart, STROKE);
      return rig;
    }
    // 05: gone into the pill.
    perched(rig, 4);
    rig.facing = pillFacing;
    divePose(rig, 1, time, pillDir.x, pillDir.y, swimStart, STROKE);
    underwater(entryP, pillDir, pillSpeed, Math.min(l, 0.07), path);
    rig.x = path.x;
    rig.y = path.y;
    rig.clipY = pillEntry.y + 1;
    rig.alpha = 1 - smooth(0.05, 0.07, l);
    return rig;
  };

  /** Is this body point still covered by the posed wing? */
  const underWing = (x, y, rig) => {
    if (Math.abs(rig.wing) < 0.02 && Math.abs(rig.wingLength - 1) < 0.02 && Math.abs(rig.chord - 1) < 0.02) return true;
    const cos = Math.cos(-rig.wing);
    const sin = Math.sin(-rig.wing);
    const dx = x - SHOULDER[0];
    const dy = y - SHOULDER[1];
    const px = dx * cos - dy * sin;
    const py = dx * sin + dy * cos;
    const along = (px * WING_U[0] + py * WING_U[1]) / Math.max(0.05, rig.wingLength);
    const across = (px * WING_V[0] + py * WING_V[1]) / Math.max(0.05, rig.chord);
    const mx = Math.round(SHOULDER[0] + along * WING_U[0] + across * WING_V[0]) - WING_BOX[0];
    const my = Math.round(SHOULDER[1] + along * WING_U[1] + across * WING_V[1]) - WING_BOX[1];
    return mx >= 0 && my >= 0 && mx < WING_BOX[2] && my < WING_BOX[3] && mask[my * WING_BOX[2] + mx] === 1;
  };

  /** One design sample through the rig: articulate the region, then place it on screen. */
  const bodyPoint = (o, region, rig, ctx, s, q, out) => {
    const time = ctx.time;
    let x = points[o];
    let y = points[o + 1];
    let colour = o + 2;
    if (region === REGION.wing) {
      const dx = x - SHOULDER[0];
      const dy = y - SHOULDER[1];
      const along = (dx * WING_U[0] + dy * WING_U[1]) * rig.wingLength;
      const across = (dx * WING_V[0] + dy * WING_V[1]) * rig.chord;
      rotateAbout(SHOULDER[0] + along * WING_U[0] + across * WING_V[0], SHOULDER[1] + along * WING_U[1] + across * WING_V[1], SHOULDER[0], SHOULDER[1], rig.wing, scratch);
      x = scratch[0];
      y = scratch[1];
    } else if (region === FLANK) {
      if (!underWing(x, y, rig)) colour = o + 7;
    } else if (HEADISH.has(region)) {
      if (region === REGION.eye && rig.blink > 0) y = EYE[1] + (y - EYE[1]) * (1 - 0.85 * rig.blink);
      const idleTilt = rig.idle * (Math.sin(time * 0.00055) * 0.05 + (ctx.pointer.x > -1000 ? Math.max(-1, Math.min(1, (ctx.pointer.y - rig.y) / (h * 0.8))) * 0.1 : 0));
      rotateAbout(x, y, NECK[0], NECK[1], rig.head + idleTilt, scratch);
      x = scratch[0];
      y = scratch[1];
    } else if (region === REGION.tail) {
      rotateAbout(x, y, TAIL_BASE[0], TAIL_BASE[1], rig.tail + rig.idle * Math.sin(time * 0.0021 + 0.7) * 0.05, scratch);
      x = scratch[0];
      y = scratch[1];
    } else if (region === REGION.feet) {
      y -= (1 - rig.feet) * 18;
    }
    if (rig.crouch > 0) {
      y = FEET[1] + (y - FEET[1]) * (1 - 0.07 * rig.crouch);
      rotateAbout(x, y, FEET[0], FEET[1], -0.1 * rig.crouch, scratch);
      x = scratch[0];
      y = scratch[1];
    }
    toScreen(x, y, rig, 1 + rig.idle * Math.sin(time * 0.0016) * 0.012, out);
    out[0] += rig.idle * Math.sin(time * 0.0017 + s[q] * TAU) * 0.22;
    out[1] += rig.idle * Math.cos(time * 0.0014 + s[q + 1] * TAU) * 0.22;
    return colour;
  };

  const LEVELS = 5;
  const rigs = Array.from({ length: LEVELS }, () => ({ ...DEFAULT }));
  // Where the bird was a little earlier, in world space: bubbles rise from along this trail.
  const TRAIL = 8;
  const trail = new Float32Array(TRAIL * 2);
  const probe = { ...DEFAULT };
  const isBubble = k => k % 16 === 5;
  let streak = 0;
  let rippleT = 0;
  let splash = null;
  let bubbling = 0;
  let camera = 0;
  let waterline = -Infinity;
  return {
    /** Once per frame: the rig at a few lag levels (motion streaks), the bubble trail, splashes. */
    prepare(progress, time) {
      const stage = Math.min(5, Math.floor(progress));
      const l = progress - stage;
      const diving = (stage === 0 && l > D.apex + 0.02 && l < D.entry + 0.05) || (stage === 4 && l > DEPART + (1 - DEPART) * PILL_APEX) || (stage === 5 && l < 0.07);
      streak = diving ? 1 : 0;
      rippleT = stage === 5 && pill ? clamp01((l - 0.012) / 0.22) : 0;
      splash = stage === 5 && l < 0.2 ? { x: pillEntry.x, y: pillEntry.y, since: l } : null;
      bubbling = stage === 0 ? smooth(D.entry - 0.005, D.entry + 0.04, l) : stage === 5 ? 1 - smooth(0, 0.12, l) : 1;
      camera = cameraAt(progress);
      waterline = stage === 0 ? surface.waterY - camera : -Infinity;
      for (let level = 0; level < LEVELS; level += 1) rigAt(Math.max(0, progress - level * 0.0016 * streak), time, rigs[level]);
      if (bubbling > 0) {
        for (let j = 0; j < TRAIL; j += 1) {
          const earlier = Math.max(0, progress - j * 0.012);
          rigAt(earlier, time, probe);
          trail[j * 2] = probe.x;
          trail[j * 2 + 1] = probe.y + cameraAt(earlier);
        }
      }
    },
    pose(k, i, ctx, out) {
      const o = k * STRIDE;
      const axial = points[o + 6];
      // Motion streak: the rear of a diving bird trails along its path, blended between
      // lag levels so the body smears smoothly instead of splitting into bands.
      const level = streak ? axial * (LEVELS - 1) : 0;
      const low = Math.floor(level);
      const rig = rigs[low];
      const region = points[o + 5];
      const s = ctx.seed;
      const q = i * 4;
      const colour = bodyPoint(o, region, rig, ctx, s, q, place);
      if (level > low + 0.001) {
        const x = place[0];
        const y = place[1];
        bodyPoint(o, region, rigs[low + 1], ctx, s, q, place);
        place[0] = mix(x, place[0], level - low);
        place[1] = mix(y, place[1], level - low);
      }
      let alpha = (region === REGION.eye ? 1 : 0.84 + s[q + 2] * 0.16) * rig.alpha * (region === REGION.feet ? rig.feet : 1);
      out[0] = place[0];
      out[1] = place[1];
      out[2] = region === REGION.eye ? 1.05 : 0.8 + s[q + 3] * 0.4;
      out[3] = points[colour];
      out[4] = points[colour + 1];
      out[5] = points[colour + 2];
      if (region === REGION.eye && rig.blink > 0) {
        out[3] = mix(out[3], 0.13, rig.blink);
        out[4] = mix(out[4], 0.5, rig.blink);
        out[5] = mix(out[5], 0.87, rig.blink);
      }
      // Behind a card only what shows above its top edge is visible.
      const cover = rig.occluder;
      if (cover && out[0] > cover.x - 1 && out[0] < cover.x + cover.width + 1) alpha *= 1 - smooth(cover.y + 0.5, cover.y + 3, out[1]);
      // Below the surface the warm colours fade first: a cooler, slightly dimmer bird.
      const wet = waterline === -Infinity ? 1 : smooth(waterline - 1, waterline + 4, out[1]);
      if (wet > 0) {
        out[3] *= 1 - 0.2 * wet;
        out[4] *= 1 - 0.06 * wet;
        out[5] = Math.min(1, out[5] + 0.05 * wet);
        alpha *= 1 - 0.08 * wet;
      }
      const submerged = out[1] > rig.clipY;
      if (submerged) alpha *= 1 - smooth(0, 3, out[1] - rig.clipY);
      const fg = ctx.palette[COLOR.fg];
      const flash = ctx.palette[COLOR.flash];
      // Into the pill: about a third of what goes under comes back up as bubbles.
      if (splash && s[q + 2] > 0.66 && (submerged || rig.alpha < 1)) {
        const tau = clamp01((splash.since - axial * 0.035) / 0.12);
        const side = k & 1 ? 1 : -1;
        out[0] = splash.x + side * (0.04 + 0.55 * s[q]) * W * Math.sqrt(tau) + Math.sin(tau * 9 + s[q + 3] * 6) * W * 0.04;
        out[1] = splash.y - (0.3 + 0.95 * s[q + 1]) * W * tau;
        out[2] = 0.6 + tau * 1.1 + s[q + 3] * 0.3;
        out[3] = mix(fg[0], flash[0], 0.55);
        out[4] = mix(fg[1], flash[1], 0.55);
        out[5] = mix(fg[2], flash[2], 0.55);
        out[6] = tau > 0 ? 0.7 * (1 - smooth(0.55, 1, tau)) : 0;
        return;
      }
      // Underwater a stream of bubbles rises from the bird and from where it has just been.
      if (isBubble(k)) {
        if (bubbling > 0) {
          const period = 1500 + 1300 * s[q + 1];
          const phase = ((ctx.time / period + s[q]) % 1 + 1) % 1;
          const back = phase * (TRAIL - 1);
          const j = Math.min(TRAIL - 2, Math.floor(back));
          const f = back - j;
          const lead = rigs[0];
          const x = mix(trail[j * 2], trail[j * 2 + 2], f) - lead.facing * W * 0.15 + (s[q + 2] - 0.5) * W * 0.12 + Math.sin(phase * 7 + s[q + 3] * 6) * W * 0.05 * phase;
          const y = mix(trail[j * 2 + 1], trail[j * 2 + 3], f) - camera - W * 0.23 - phase ** 0.85 * (0.8 + 0.7 * s[q + 2]) * W * 1.3;
          out[0] = mix(out[0], x, bubbling);
          out[1] = mix(out[1], y, bubbling);
          out[2] = mix(out[2], 0.7 + phase * 1.1 + s[q + 3] * 0.4, bubbling);
          out[3] = mix(out[3], mix(fg[0], flash[0], 0.55), bubbling);
          out[4] = mix(out[4], mix(fg[1], flash[1], 0.55), bubbling);
          out[5] = mix(out[5], mix(fg[2], flash[2], 0.55), bubbling);
          let glow = 0.5 * smooth(0, 0.08, phase) * (1 - smooth(0.55, 1, phase)) * mix(1, 0.6, lead.idle);
          const card = lead.occluder;
          if (card && x > card.x - 1 && x < card.x + card.width + 1) glow *= 1 - smooth(card.y + 0.5, card.y + 3, y);
          alpha = mix(alpha, glow, bubbling);
        }
        out[6] = alpha;
        return;
      }
      // In the pill the bird's particles become a ripple of light: it runs both ways round
      // the outline from where the bird went in, spreading outwards, and meets at the bottom.
      if (rippleT > 0) {
        const absorb = smooth(0, 0.12 + axial * 0.1, rippleT);
        if (absorb > 0) {
          const direction = k & 1 ? 1 : -1;
          const run = ease(clamp01(rippleT / 0.8)) * pillPerimeter * 0.5;
          pillPoint(direction * run * (0.72 + 0.28 * s[q + 3]), outline);
          const spread = 2.5 + rippleT * 9 * s[q] + (s[q + 1] - 0.5) * 1.5;
          out[0] = mix(out[0], outline[0] + outline[2] * spread, absorb);
          out[1] = mix(out[1], outline[1] + outline[3] * spread, absorb);
          alpha = mix(alpha, (0.6 + 0.4 * s[q + 3]) * (1 - smooth(0.62, 1, rippleT)) * (1 - 0.5 * s[q]), absorb);
          out[2] = mix(out[2], 1 + s[q + 3] * 0.6, absorb);
          out[3] = mix(out[3], flash[0], absorb);
          out[4] = mix(out[4], flash[1], absorb);
          out[5] = mix(out[5], flash[2], absorb);
        }
      }
      out[6] = alpha;
    },
  };
}
