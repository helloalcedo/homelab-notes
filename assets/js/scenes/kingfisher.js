// Scene 00 and the dive into scene 01.
// A common kingfisher (Alcedo atthis), perched and facing left, is drawn from layered
// silhouette paths in a 1000×700 design box and sampled into coloured particles.

import { TAU, clamp01, mix, ease, smooth, smoother, randomGenerator } from '../morph.js';
import { COLOR, STRIDE, Stroke } from './shapes.js';

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
function designSamples() {
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

const rotateAbout = (x, y, cx, cy, angle, out) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  out[0] = cx + dx * cos - dy * sin;
  out[1] = cy + dx * sin + dy * cos;
  return out;
};

/** Where the bird, branch and water sit on this viewport. */
export function composition({ w, h, mobile }) {
  const birdWidth = mobile ? Math.min(w * 0.74, 330) : Math.min(Math.max(w * 0.32, 290), 560, h * 0.95);
  const scale = birdWidth / BIRD_WIDTH;
  const perchY = mobile ? h * 0.5 : h * 0.55;
  const centreX = mobile ? w * 0.6 : w * 0.62;
  const originX = centreX - BIRD_CENTRE_X * scale;
  const originY = perchY - PERCH_Y * scale;
  const waterY = perchY + (mobile ? h * 0.1 : h * 0.13);
  const toScreen = (x, y) => [originX + x * scale, originY + y * scale];
  const [billX, billY] = toScreen(...BILL_TIP);
  // Narrow screens drop the bird almost under itself so the dive never leaves the frame.
  const entry = { x: billX + (mobile ? w * 0.05 : -w * 0.06), y: waterY };
  return { scale, originX, originY, perchY, waterY, toScreen, bill: { x: billX, y: billY }, entry };
}

/**
 * Build scene 00 and the dive. `tree` comes from story.js and shares its root with the
 * dive's entry point, so the network grows exactly where the bird enters the water.
 */
export function buildKingfisher({ w, h, mobile, particles, tree, sceneOne }) {
  const layout = composition({ w, h, mobile });
  const { scale, waterY, toScreen, entry } = layout;
  const design = designSamples();
  const designCount = design.length / 6;

  // Budget: bird, branch, waterline, water texture, sparkles, droplet.
  const shares = { bird: 0.66, branch: 0.07, line: 0.09, texture: 0.1, sparkle: 0.05, drop: 0.03 };
  const counts = {};
  let assigned = 0;
  for (const [name, share] of Object.entries(shares)) {
    counts[name] = Math.max(1, Math.round(particles * share));
    assigned += counts[name];
  }
  counts.bird += particles - assigned;
  const starts = {};
  let cursor = 0;
  for (const name of Object.keys(shares)) {
    starts[name] = cursor / particles;
    cursor += counts[name];
  }
  const spanOf = name => counts[name] / particles;

  // Bird: resample the design points to the particle budget.
  const bird = new Float32Array(counts.bird * 8); // x, y, r, g, b, region, d, v
  const pick = randomGenerator(4113);
  const order = Array.from({ length: designCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(pick() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  for (let k = 0; k < counts.bird; k += 1) {
    const source = order[k % designCount] * 6;
    const [x, y] = toScreen(design[source], design[source + 1]);
    const o = k * 8;
    bird[o] = x + (k >= designCount ? (pick() - 0.5) * 1.2 : 0);
    bird[o + 1] = y + (k >= designCount ? (pick() - 0.5) * 1.2 : 0);
    bird[o + 2] = design[source + 2];
    bird[o + 3] = design[source + 3];
    bird[o + 4] = design[source + 4];
    bird[o + 5] = design[source + 5];
  }
  const [neckX, neckY] = toScreen(...NECK);
  const [tailX, tailY] = toScreen(...TAIL_BASE);
  const [feetX, feetY] = toScreen(...FEET);
  const [tipX, tipY] = toScreen(...TAIL_TIP);

  // Crouched pose (end of anticipation), used as the start of the dive.
  const crouchScale = 0.95;
  const lean = -0.08;
  const tailLift = -0.12;
  const scratch = [0, 0];
  const crouch = (x, y, region, amount, out) => {
    let px = x;
    let py = y;
    if (region === REGION.tail) {
      rotateAbout(px, py, tailX, tailY, tailLift * amount, scratch);
      px = scratch[0];
      py = scratch[1];
    }
    py = feetY + (py - feetY) * mix(1, crouchScale, amount);
    rotateAbout(px, py, feetX, feetY, lean * amount, scratch);
    out[0] = scratch[0];
    out[1] = scratch[1];
    return out;
  };
  const billCrouched = crouch(layout.bill.x, layout.bill.y, REGION.bill, 1, [0, 0]);
  const tailCrouched = crouch(tipX, tipY, REGION.tail, 1, [0, 0]);
  const axisX = tailCrouched[0] - billCrouched[0];
  const axisY = tailCrouched[1] - billCrouched[1];
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const ux = axisX / axisLength; // towards the tail
  const uy = axisY / axisLength;
  const tx = -ux; // direction of travel
  const ty = -uy;
  const nx = -ty; // travel normal
  const ny = tx;
  const crouched = [0, 0];
  for (let k = 0; k < counts.bird; k += 1) {
    const o = k * 8;
    crouch(bird[o], bird[o + 1], bird[o + 5], 1, crouched);
    const rx = crouched[0] - billCrouched[0];
    const ry = crouched[1] - billCrouched[1];
    bird[o + 6] = Math.max(0, rx * ux + ry * uy); // distance behind the bill
    bird[o + 7] = rx * nx + ry * ny; // lateral offset
  }

  // Dive: in the air the bird is a rigid body that pitches nose-down about its centre of
  // mass while that centre follows a short hop-and-fall arc; the bill arrives at the entry
  // point pointing along the plunge. Below the surface the particles become a stream that
  // runs straight to the network's root (world space; the camera follows).
  const cameraDepth = h * 0.55;
  const P3 = { x: entry.x, y: entry.y };
  const root = { x: tree.root.x, y: tree.root.y + cameraDepth };
  const L2 = Math.hypot(root.x - P3.x, root.y - P3.y);
  const plungeX = (root.x - P3.x) / (L2 || 1);
  const plungeY = (root.y - P3.y) / (L2 || 1);
  const P0 = { x: billCrouched[0], y: billCrouched[1] };
  let centreD = 0;
  let centreV = 0;
  for (let k = 0; k < counts.bird; k += 1) {
    centreD += bird[k * 8 + 6];
    centreV += bird[k * 8 + 7];
  }
  centreD /= counts.bird || 1;
  centreV /= counts.bird || 1;
  const C0 = { x: P0.x + ux * centreD + nx * centreV, y: P0.y + uy * centreD + ny * centreV };
  let pitch = Math.atan2(plungeY, plungeX) - Math.atan2(ty, tx);
  while (pitch > 0) pitch -= TAU;
  while (pitch <= -TAU) pitch += TAU;
  const hop = { x: tx * h * (mobile ? 0.015 : 0.05), y: -h * 0.045 };
  // Timing length of the air phase (the bill's travel), used to pace the whole dive.
  const L1 = Math.hypot(P3.x - P0.x, P3.y - P0.y) + h * 0.08;
  const rigid = { x: 0, y: 0, cos: 1, sin: 0 };
  /** Centre and rotation of the rigid bird at air-phase fraction tau. */
  const airPose = (tau, away, streamline) => {
    const angle = pitch * ease(tau);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Where the centre must end so the bill lands on the entry point.
    const bx = ux * centreD * away + nx * centreV * away * streamline;
    const by = uy * centreD * away + ny * centreV * away * streamline;
    const endCos = Math.cos(pitch);
    const endSin = Math.sin(pitch);
    const endX = P3.x + bx * endCos - by * endSin;
    const endY = P3.y + bx * endSin + by * endCos;
    const t = ease(tau);
    const controlX = C0.x + hop.x;
    const controlY = C0.y + hop.y;
    rigid.x = (1 - t) * (1 - t) * C0.x + 2 * (1 - t) * t * controlX + t * t * endX;
    rigid.y = (1 - t) * (1 - t) * C0.y + 2 * (1 - t) * t * controlY + t * t * endY;
    rigid.cos = cos;
    rigid.sin = sin;
    return rigid;
  };

  // Assign bird particles to tree slots: the leading bill flows furthest, the tail stays near
  // the root. Non-bird particles take the interleaved remainder and fade in at the end.
  const treeSlots = new Float32Array(particles);
  const slotDistance = new Float32Array(particles);
  const locateSlot = fraction => {
    const inner = sceneOne.edgeFraction(fraction);
    if (inner < 0) return null;
    return tree.locate(inner);
  };
  for (let k = 0; k < particles; k += 1) {
    treeSlots[k] = (k + 0.5) / particles;
    const slot = locateSlot(treeSlots[k]);
    slotDistance[k] = slot ? tree.edges[slot.edge].offset + slot.amount * tree.edges[slot.edge].length : tree.deepest * 0.5;
  }
  const slotOrder = Array.from({ length: particles }, (_, k) => k).sort((a, b) => slotDistance[a] - slotDistance[b]);
  const birdSlots = [];
  const otherSlots = [];
  const ratio = counts.bird / particles;
  let credit = 0;
  for (const slot of slotOrder) {
    credit += ratio;
    if (credit >= 1 && birdSlots.length < counts.bird) {
      credit -= 1;
      birdSlots.push(slot);
    } else otherSlots.push(slot);
  }
  while (birdSlots.length < counts.bird) birdSlots.push(otherSlots.pop());
  birdSlots.reverse(); // farthest first
  const birdByDistance = Array.from({ length: counts.bird }, (_, k) => k).sort((a, b) => bird[a * 8 + 6] - bird[b * 8 + 6]);
  const birdTarget = new Float32Array(counts.bird);
  const birdEdge = new Int32Array(counts.bird);
  const birdBase = new Float32Array(counts.bird);
  birdByDistance.forEach((k, rank) => { birdTarget[k] = treeSlots[birdSlots[rank]]; });
  const SHRINK = 0.6;
  const spreadSum = [];
  for (let k = 0; k < counts.bird; k += 1) {
    const slot = locateSlot(birdTarget[k]);
    birdEdge[k] = slot ? slot.edge : -1;
    birdBase[k] = slot ? slot.amount : 0;
    const distance = slot ? tree.edges[slot.edge].offset + slot.amount * tree.edges[slot.edge].length : 0;
    spreadSum.push(distance + bird[k * 8 + 6] * SHRINK);
  }
  spreadSum.sort((a, b) => a - b);
  const spreadCentre = spreadSum[Math.floor(spreadSum.length / 2)] || 0;
  const headTotal = L1 + L2 + spreadCentre;
  // Local progress at which the bill reaches the water.
  let impactQ = 0;
  for (let q = 0; q <= 1; q += 0.002) {
    if (headTotal * ease(q) >= L1) { impactQ = q; break; }
  }
  const DIVE_START = 0.45;
  const DIVE_SPAN = 1 - DIVE_START;
  const impact = DIVE_START + impactQ * DIVE_SPAN;
  const rootQ = (() => { for (let q = impactQ; q <= 1; q += 0.002) if (headTotal * ease(q) >= L1 + L2) return q; return 0.8; })();
  const camera = local => {
    const u = clamp01((local - impact + 0.01) / (1 - impact + 0.01));
    return cameraDepth * ease(1 - (1 - u) * (1 - u));
  };

  // Branch: a tapering bough that enters from the right edge; the perch end is thinnest.
  const [branchTipX] = toScreen(128, PERCH_Y);
  const branchRight = w * (mobile ? 1.04 : 0.99);
  const perch = layout.perchY + 6 * scale;
  const branchAt = t => [mix(branchTipX, branchRight, t), perch + Math.sin(t * Math.PI) * 5 * scale - t * 10 * scale];
  const twigStart = branchAt(0.62);
  const twigAt = t => [twigStart[0] + t * 74 * scale, twigStart[1] - t * 62 * scale - Math.sin(t * Math.PI) * 10 * scale];
  const branchPoints = { data: new Float32Array(counts.branch * STRIDE), count: counts.branch };
  {
    const bark = randomGenerator(2718);
    const twigCount = Math.floor(counts.branch * 0.1);
    for (let k = 0; k < counts.branch; k += 1) {
      const o = k * STRIDE;
      const twig = k >= counts.branch - twigCount;
      const t = bark();
      const [x, y] = twig ? twigAt(t) : branchAt(t);
      const width = twig ? mix(3.2, 1.2, t) * Math.max(0.8, scale * 1.3) : mix(2.4, 12, t ** 0.8) * Math.max(0.75, scale * 1.35);
      const across = (bark() - 0.5) * width;
      const top = across < 0 ? 1 : 0.62;
      branchPoints.data[o] = x + (bark() - 0.5) * 1.4;
      branchPoints.data[o + 1] = y + across;
      branchPoints.data[o + 2] = COLOR.bark;
      branchPoints.data[o + 3] = (0.36 + 0.5 * Math.sqrt(1 - Math.min(1, Math.abs(across) / (width / 2 + 0.01)))) * top;
      branchPoints.data[o + 4] = 1;
    }
  }

  const lineLeft = w * 0.06;
  const lineRight = w * 0.94;
  const drop = (time, out) => {
    const period = 4600;
    const phase = (time % period) / period;
    out.phase = phase;
    out.x = layout.bill.x - 2 * scale;
    out.impactX = out.x;
    return out;
  };
  const dropState = { phase: 0, x: 0, impactX: 0 };

  const waterRipple = (x, time, local) => {
    let y = Math.sin(x * 0.018 + time * 0.0012) * 0.75 + Math.sin(x * 0.051 - time * 0.0019) * 0.4;
    const since = dropState.phase - 0.22;
    if (since > 0 && since < 0.6) {
      const dx = Math.abs(x - dropState.impactX);
      y += Math.sin(dx * 0.09 - since * 22) * 2.4 * Math.exp(-since * 5) * Math.exp(-dx / (w * 0.08));
    }
    const splash = local - impact;
    if (splash > -0.005 && splash < 0.2) {
      const dx = Math.abs(x - entry.x);
      const phase = clamp01(splash / 0.2);
      y += Math.sin(dx * 0.05 - phase * 26) * 7 * (1 - phase) * Math.exp(-dx / (w * 0.22));
    }
    return y;
  };

  const palette = ctx => ctx.palette;

  const sceneZero = {
    prepare(ctx) {
      drop(ctx.time, dropState);
    },
    pose(f, i, local, ctx, out, rest = false) {
      const s = ctx.seed;
      const q = i * 4;
      const time = rest ? 0 : ctx.time;
      const idle = rest ? 0 : 1 - smooth(0.26, 0.45, local);
      const anticipation = smoother(0.3, 0.45, local);
      if (f < starts.branch) {
        const k = Math.min(counts.bird - 1, Math.floor((f / spanOf('bird')) * counts.bird));
        const o = k * 8;
        const region = bird[o + 5];
        let x = bird[o];
        let y = bird[o + 1];
        if (idle > 0) {
          const breath = 1 + Math.sin(time * 0.0016) * 0.008 * idle;
          x = feetX + (x - feetX) * breath;
          y = feetY + (y - feetY) * breath;
          if (HEADISH.has(region)) {
            const lookY = ctx.pointer.x > -1000 ? clamp01((ctx.pointer.y - neckY) / (h * 0.8) + 0.5) - 0.5 : 0;
            const tilt = (Math.sin(time * 0.00055) * 0.045 + lookY * 0.12) * idle;
            rotateAbout(x, y, neckX, neckY, tilt, scratch);
            x = scratch[0];
            y = scratch[1];
          } else if (region === REGION.tail) {
            rotateAbout(x, y, tailX, tailY, Math.sin(time * 0.0021 + 0.7) * 0.04 * idle, scratch);
            x = scratch[0];
            y = scratch[1];
          }
          x += Math.sin(time * 0.0017 + s[q] * TAU) * 0.28 * idle;
          y += Math.cos(time * 0.0014 + s[q + 1] * TAU) * 0.28 * idle;
        }
        if (anticipation > 0) {
          crouch(x, y, region, anticipation, scratch);
          x = scratch[0];
          y = scratch[1];
        }
        out[0] = x;
        out[1] = y;
        out[2] = region === REGION.eye ? 1.35 : 1.05 + s[q + 3] * 0.55;
        out[3] = bird[o + 2];
        out[4] = bird[o + 3];
        out[5] = bird[o + 4];
        out[6] = region === REGION.eye ? 1 : 0.8 + s[q + 2] * 0.2;
        return;
      }
      if (f < starts.line) {
        const n = branchPoints.count;
        const k = Math.min(n - 1, Math.floor(((f - starts.branch) / spanOf('branch')) * n)) * STRIDE;
        let y = branchPoints.data[k + 1];
        const x = branchPoints.data[k];
        const launch = local - DIVE_START;
        if (!rest && launch > 0 && launch < 0.3) {
          const reach = 1 - clamp01((x - feetX) / (w * 0.5));
          y += Math.sin(launch * 60) * Math.exp(-launch * 14) * 7 * scale * reach;
        }
        out[0] = x + (rest ? 0 : (s[q] - 0.5) * 0.6);
        out[1] = y + (rest ? 0 : (s[q + 1] - 0.5) * 0.6);
        out[2] = 1 + s[q + 3] * 0.5;
        const colour = palette(ctx)[COLOR.bark];
        out[3] = colour[0];
        out[4] = colour[1];
        out[5] = colour[2];
        out[6] = branchPoints.data[k + 3] * (0.7 + s[q + 2] * 0.3);
        return;
      }
      const splash = rest ? -1 : local - impact;
      if (f < starts.texture) {
        const t = (f - starts.line) / spanOf('line');
        const x = mix(lineLeft, lineRight, t);
        const edge = smooth(0, 0.14, t) * smooth(1, 0.86, t);
        out[0] = x + (rest ? 0 : (s[q] - 0.5) * 1.2);
        out[1] = waterY + (rest ? 0 : waterRipple(x, time, local));
        if (splash > 0 && splash < 0.14) {
          const dx = x - entry.x;
          const reach = Math.max(0, 1 - Math.abs(dx) / (w * 0.07)) ** 1.5;
          const phase = splash / 0.14;
          out[1] -= Math.sin(Math.PI * phase) * h * 0.075 * reach * (0.45 + s[q + 2] * 0.55);
          out[0] += Math.sign(dx) * phase * 26 * reach;
        }
        out[2] = 0.85 + s[q + 3] * 0.5;
        const colour = palette(ctx)[COLOR.fg];
        out[3] = colour[0];
        out[4] = colour[1];
        out[5] = colour[2];
        out[6] = (0.36 + s[q + 2] * 0.3) * edge;
        return;
      }
      if (f < starts.sparkle) {
        const t = (f - starts.texture) / spanOf('texture');
        const depth = (s[q + 1] ** 1.8) * h * (mobile ? 0.2 : 0.17);
        const drift = rest ? 0 : time * 0.004 * (0.3 + s[q + 2]);
        const x = lineLeft + ((((t * 7.31 + s[q]) % 1) * (lineRight - lineLeft) + drift) % (lineRight - lineLeft));
        const dash = (s[q + 3] - 0.5) * 7;
        out[0] = x + dash;
        out[1] = waterY + 3 + depth + (rest ? 0 : Math.sin(time * 0.001 + t * 40) * 0.8);
        out[2] = 0.7 + s[q + 3] * 0.4;
        const colour = palette(ctx)[COLOR.fg];
        out[3] = colour[0];
        out[4] = colour[1];
        out[5] = colour[2];
        const fade = 1 - depth / (h * 0.2);
        const edge = smooth(lineLeft, lineLeft + w * 0.12, x) * smooth(lineRight, lineRight - w * 0.12, x);
        out[6] = (0.05 + 0.13 * fade) * edge * (rest ? 1 : 0.75 + 0.25 * Math.sin(time * 0.002 + t * 90));
        return;
      }
      if (f < starts.drop) {
        const t = (f - starts.sparkle) / spanOf('sparkle');
        const x = mix(lineLeft + w * 0.08, lineRight - w * 0.08, (t * 13.7 + s[q]) % 1);
        out[0] = x;
        out[1] = waterY + (s[q + 1] - 0.5) * 4 + (rest ? 0 : waterRipple(x, time, local));
        out[2] = 1 + s[q + 3] * 0.8;
        const colour = palette(ctx)[s[q + 2] > 0.78 ? COLOR.flash : COLOR.fg];
        out[3] = colour[0];
        out[4] = colour[1];
        out[5] = colour[2];
        const glint = rest ? 0.4 : Math.max(0, Math.sin(time * 0.0019 * (0.6 + s[q + 3]) + s[q] * TAU)) ** 12;
        out[6] = 0.12 + glint * 0.78;
        return;
      }
      // Droplet from the bill tip, then an elliptical ripple on the surface.
      const t = (f - starts.drop) / spanOf('drop');
      const phase = rest ? 0.9 : dropState.phase;
      const colour = palette(ctx)[COLOR.fg];
      out[3] = colour[0];
      out[4] = colour[1];
      out[5] = colour[2];
      const billY = layout.bill.y + 2 * scale;
      if (phase < 0.22) {
        const fall = clamp01((phase - 0.08) / 0.14);
        out[0] = dropState.x + (s[q] - 0.5) * 2.2;
        out[1] = mix(billY, waterY, fall * fall) + (s[q + 1] - 0.5) * 2.2;
        out[2] = 0.9;
        out[6] = smooth(0, 0.08, phase) * 0.8 * idle;
      } else {
        const spread = ease(clamp01((phase - 0.22) / 0.5));
        const angle = t * TAU;
        const radius = mix(2, w * (mobile ? 0.08 : 0.045), spread) * (0.94 + s[q + 2] * 0.12);
        out[0] = dropState.impactX + Math.cos(angle) * radius;
        out[1] = waterY + Math.sin(angle) * radius * 0.17;
        out[2] = 0.85;
        out[6] = (1 - smooth(0.25, 0.75, phase)) * 0.55 * idle;
      }
    },
  };

  const treePoint = [0, 0];
  const BLUE = new Set([REGION.head, REGION.back, REGION.wing, REGION.tail, REGION.face]);

  /**
   * Dive pose for one particle. `a` is its scene-00 pose, `b` its scene-01 pose; both are
   * already evaluated by the engine. In the air the bird is a rigid arrow aligned with its
   * direction of travel; past the entry point each particle becomes part of a stream that
   * narrows to the root and then runs along its own branch.
   */
  const dive = (f0, i, local, ctx, a, b, out) => {
    const depth = camera(local);
    if (f0 >= starts.branch) {
      // Branch, water and sparkles stay at the surface and leave with the camera.
      if (local < 0.9) {
        out[0] = a[0];
        out[1] = a[1] - depth;
        out[2] = a[2];
        out[3] = a[3];
        out[4] = a[4];
        out[5] = a[5];
        const exit = smooth(-h * 0.02, h * 0.1, out[1]);
        out[6] = a[6] * exit * (1 - smooth(impact + 0.06, 0.9, local));
      } else {
        for (let k = 0; k < 6; k += 1) out[k] = b[k];
        out[6] = b[6] * smooth(0.9, 1, local);
      }
      return;
    }
    if (local <= DIVE_START) {
      for (let k = 0; k < 7; k += 1) out[k] = a[k];
      return;
    }
    const k = Math.min(counts.bird - 1, Math.floor((f0 / spanOf('bird')) * counts.bird));
    const o = k * 8;
    const q = clamp01((local - DIVE_START) / DIVE_SPAN);
    const away = mix(1, SHRINK, smoother(0, 0.3, q));
    const behind = bird[o + 6] * away;
    const streamline = mix(1, 0.72, smoother(0, 0.3, q));
    const lateral = bird[o + 7] * away * streamline;
    const head = headTotal * ease(q);
    const e = birdEdge[k];
    const slotDistanceLive = e >= 0 ? tree.edges[e].offset + tree.flowAmount(birdBase[k], ctx.seed[i * 4 + 2], ctx.time) * tree.edges[e].length : 0;
    const spread = smoother(rootQ - 0.08, 1, q);
    const distance = head - behind + spread * (slotDistanceLive + bird[o + 6] * SHRINK - spreadCentre);
    let x;
    let y;
    if (distance < L1) {
      if (head <= L1) {
        // Rigid body: body coordinates about the centre of mass, pitched and carried.
        const pose = airPose(head / L1, away, streamline);
        const along = behind - centreD * away;
        const across = lateral - centreV * away * streamline;
        const rx = ux * along + nx * across;
        const ry = uy * along + ny * across;
        x = pose.x + rx * pose.cos - ry * pose.sin;
        y = pose.y + rx * pose.sin + ry * pose.cos;
      } else {
        // The bill is under water: the body above the surface stands vertically over the entry.
        x = P3.x - lateral;
        y = P3.y - (L1 - distance);
      }
    } else if (distance <= L1 + L2) {
      const t = (distance - L1) / (L2 || 1);
      const narrowing = 1 - smoother(0.3, 1, t);
      x = mix(P3.x, root.x, t) - plungeY * lateral * narrowing;
      y = mix(P3.y, root.y, t) + plungeX * lateral * narrowing;
    } else {
      if (e >= 0) tree.along(e, Math.min(slotDistanceLive, distance - L1 - L2), treePoint);
      else { treePoint[0] = tree.root.x; treePoint[1] = tree.root.y; }
      x = treePoint[0];
      y = treePoint[1] + cameraDepth;
    }
    y -= depth;
    const landing = smoother(0.84, 1, q);
    out[0] = mix(x, b[0], landing);
    out[1] = mix(y, b[1], landing);
    const water = smoother(L1 + L2 * 0.25, L1 + L2 * 0.95, distance);
    // Below the surface the feathers cool and dim, as if seen through water.
    const submerged = smooth(-2, 10, y - (waterY - depth)) * (1 - landing);
    const flash = BLUE.has(bird[o + 5]) ? smooth(0.06, 0.26, q) * (1 - water) * 0.5 : Math.max(0, submerged * 0.3);
    const flashColour = ctx.palette[COLOR.flash];
    out[2] = mix(a[2], b[2], water);
    out[3] = mix(mix(a[3], flashColour[0], flash), b[3], water);
    out[4] = mix(mix(a[4], flashColour[1], flash), b[4], water);
    out[5] = mix(mix(a[5], flashColour[2], flash), b[5], water);
    out[6] = mix(a[6] * (1 - submerged * 0.3), b[6], water);
  };

  return {
    layout,
    scene: sceneZero,
    dive,
    impact,
    cameraDepth,
    camera,
    starts,
    counts,
    birdSpan: spanOf('bird'),
    /** Scene-01 slot for every scene-00 slot fraction; used by the engine's slot chain. */
    targetFor(f0, otherIndex) {
      if (f0 < starts.branch) {
        const k = Math.min(counts.bird - 1, Math.floor((f0 / spanOf('bird')) * counts.bird));
        return birdTarget[k];
      }
      return treeSlots[otherSlots[otherIndex % otherSlots.length]];
    },
    reflection(local) {
      return { waterY: waterY - camera(local), alpha: 1 - smooth(impact - 0.08, impact + 0.02, local) };
    },
  };
}
