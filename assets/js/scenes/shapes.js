// Geometry primitives that are sampled into evenly spaced particle targets.
// Every primitive reports its length first, so a group can spend exactly the
// particle budget it is given and the stroke density stays uniform.

import { TAU } from '../morph.js';

export const COLOR = Object.freeze({ fg: 0, accent: 1, flash: 2, muted: 3, faint: 4, bark: 5 });
export const STRIDE = 5; // x, y, color, alpha, size

const segmentLength = primitive => {
  switch (primitive.type) {
    case 'line': return Math.hypot(primitive.x2 - primitive.x1, primitive.y2 - primitive.y1);
    case 'arc': return Math.abs(primitive.a1 - primitive.a0) * primitive.r;
    case 'disc': return (Math.PI * primitive.r * primitive.r) / (primitive.fill || 2.2);
    case 'curve': {
      let length = 0;
      let [px, py] = primitive.at(0);
      for (let i = 1; i <= 24; i += 1) {
        const [x, y] = primitive.at(i / 24);
        length += Math.hypot(x - px, y - py);
        px = x;
        py = y;
      }
      return length;
    }
    default: return 0;
  }
};

/** Collects primitives, then samples them into a fixed number of targets. */
export class Stroke {
  constructor() {
    this.primitives = [];
  }

  line(x1, y1, x2, y2, style = {}) {
    this.primitives.push({ type: 'line', x1, y1, x2, y2, ...style });
    return this;
  }

  arc(cx, cy, r, a0, a1, style = {}) {
    this.primitives.push({ type: 'arc', cx, cy, r, a0, a1, ...style });
    return this;
  }

  circle(cx, cy, r, style = {}) {
    return this.arc(cx, cy, r, 0, TAU, style);
  }

  /** Filled disc using a sunflower pattern; `fill` is the approximate area per target. */
  disc(cx, cy, r, style = {}) {
    this.primitives.push({ type: 'disc', cx, cy, r, ...style });
    return this;
  }

  curve(at, style = {}) {
    this.primitives.push({ type: 'curve', at, ...style });
    return this;
  }

  polyline(points, style = {}, closed = false) {
    for (let i = 0; i < points.length - 1; i += 1) this.line(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], style);
    if (closed && points.length > 2) this.line(points.at(-1)[0], points.at(-1)[1], points[0][0], points[0][1], style);
    return this;
  }

  roundRect(rect, radius, style = {}) {
    if (!rect) return this;
    const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
    const { x, y, width: w, height: h } = rect;
    this.line(x + r, y, x + w - r, y, style);
    if (r) this.arc(x + w - r, y + r, r, -Math.PI / 2, 0, style);
    this.line(x + w, y + r, x + w, y + h - r, style);
    if (r) this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2, style);
    this.line(x + w - r, y + h, x + r, y + h, style);
    if (r) this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, style);
    this.line(x, y + h - r, x, y + r, style);
    if (r) this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, style);
    return this;
  }

  get length() {
    let total = 0;
    for (const primitive of this.primitives) total += segmentLength(primitive) * (primitive.weight ?? 1);
    return total;
  }

  /** Sample into `count` targets spread proportionally to (weighted) length. */
  sample(count) {
    const data = new Float32Array(Math.max(1, count) * STRIDE);
    const total = this.length;
    if (!count || !total) return { data, count: 0 };
    let written = 0;
    let carry = 0;
    for (const primitive of this.primitives) {
      const exact = (segmentLength(primitive) * (primitive.weight ?? 1) * count) / total + carry;
      let n = Math.floor(exact);
      carry = exact - n;
      if (primitive === this.primitives.at(-1)) n = count - written;
      for (let k = 0; k < n && written < count; k += 1) {
        const t = n <= 1 ? 0.5 : k / (primitive.type === 'arc' && Math.abs(primitive.a1 - primitive.a0) >= TAU - 1e-6 ? n : n - 1);
        let x;
        let y;
        if (primitive.type === 'line') {
          x = primitive.x1 + (primitive.x2 - primitive.x1) * t;
          y = primitive.y1 + (primitive.y2 - primitive.y1) * t;
        } else if (primitive.type === 'arc') {
          const angle = primitive.a0 + (primitive.a1 - primitive.a0) * t;
          x = primitive.cx + Math.cos(angle) * primitive.r;
          y = primitive.cy + Math.sin(angle) * primitive.r;
        } else if (primitive.type === 'disc') {
          const radius = primitive.r * Math.sqrt((k + 0.5) / n);
          const angle = k * 2.399963229728653;
          x = primitive.cx + Math.cos(angle) * radius;
          y = primitive.cy + Math.sin(angle) * radius;
        } else {
          [x, y] = primitive.at(t);
        }
        const offset = written * STRIDE;
        data[offset] = x;
        data[offset + 1] = y;
        data[offset + 2] = primitive.color ?? COLOR.fg;
        data[offset + 3] = primitive.alpha ?? 0.72;
        data[offset + 4] = primitive.size ?? 1;
        written += 1;
      }
    }
    return { data, count: written };
  }
}

/** Convert a DOMRect-like object into canvas space. */
export function localRect(rect, origin) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return { x: (rect.x ?? rect.left) - origin.left, y: (rect.y ?? rect.top) - origin.top, width: rect.width, height: rect.height };
}
