// Scenes 01–05: every visual is a weighted group of particle targets.
// A particle's slot fraction chooses the group and its place in it; the particle's
// own seeds only add jitter and life, so a slot fully defines the rest position.

import { COLOR, STRIDE, Stroke } from './shapes.js';
import { TAU, clamp01, mix, smooth, smoother, randomGenerator } from '../morph.js';

const sstep = t => t * t * (3 - 2 * t);

export class Scene {
  constructor(groups) {
    this.groups = groups;
  }

  pose(fraction, index, local, ctx, out, rest = false) {
    const groups = this.groups;
    let group = groups[groups.length - 1];
    for (let k = 0; k < groups.length; k += 1) {
      if (fraction < groups[k].start + groups[k].span) {
        group = groups[k];
        break;
      }
    }
    const inner = group.span > 0 ? clamp01((fraction - group.start) / group.span) : 0;
    group.pose(inner, index, local, ctx, out, rest);
  }
}

/** Normalise group weights, give each group its share of particles, and build it. */
export function makeScene(descriptors, particles) {
  const total = descriptors.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || 1;
  let start = 0;
  const groups = descriptors.map(item => {
    const span = Math.max(0, item.weight) / total;
    const pose = item.build(Math.max(1, Math.round(span * particles)));
    const group = { start, span, pose };
    start += span;
    return group;
  });
  return new Scene(groups);
}

function writeColor(out, color, alpha) {
  out[3] = color[0];
  out[4] = color[1];
  out[5] = color[2];
  out[6] = alpha;
}

/** Static strokes with jitter, slow shimmer and optional twinkle. */
function strokeGroup(stroke, { density = 1, jitter = 0.32, shimmer = 0.16, size = 0.95 } = {}) {
  return {
    weight: stroke.length * density,
    build(count) {
      const { data, count: n } = stroke.sample(count);
      return (f, i, local, ctx, out, rest) => {
        const k = Math.min(n - 1, Math.floor(f * n));
        const o = k * STRIDE;
        const s = ctx.seed;
        const q = i * 4;
        let x = data[o];
        let y = data[o + 1];
        if (!rest) {
          x += (s[q] - 0.5) * jitter * 2 + Math.sin(ctx.time * 0.0011 + s[q + 1] * TAU) * shimmer;
          y += (s[q + 2] - 0.5) * jitter * 2 + Math.cos(ctx.time * 0.0013 + s[q + 3] * TAU) * shimmer;
        }
        out[0] = x;
        out[1] = y;
        out[2] = (size + s[q + 3] * 0.55) * data[o + 4];
        writeColor(out, ctx.palette[data[o + 2]], data[o + 3] * (0.74 + s[q + 1] * 0.26));
      };
    },
  };
}

const fallbackRect = (rect, x, y, width, height) => rect || { x, y, width, height };
const centre = rect => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

// ---------------------------------------------------------------- 01 network

export function buildTree({ w, h, mobile }) {
  const random = randomGenerator(5501);
  const edges = [];
  const nodes = [];
  const startX = mobile ? w * 0.1 : w * 0.455;
  const endX = w * 0.91;
  const centerY = mobile ? h * 0.66 : h * 0.515;
  const spread = mobile ? h * 0.2 : h * 0.325;
  const root = { x: startX, y: centerY, depth: 0, parentEdge: -1 };
  nodes.push(root);
  const walk = (node, depth, min, max, chosen) => {
    if (depth === 4) return;
    const branches = depth === 0 ? 3 : 2;
    for (let j = 0; j < branches; j += 1) {
      const low = min + ((max - min) * j) / branches;
      const high = min + ((max - min) * (j + 1)) / branches;
      const destination = {
        x: mix(startX, endX, (depth + 1) / 4) + (depth === 3 ? 0 : (random() - 0.5) * w * 0.02),
        y: centerY + ((low + high) / 2) * spread + (random() - 0.5) * spread * 0.045,
        depth: depth + 1,
      };
      const selected = chosen && j === (depth === 0 || depth === 1 ? 1 : 0);
      edges.push({ a: node, b: destination, depth, selected, parent: node.parentEdge });
      destination.parentEdge = edges.length - 1;
      nodes.push(destination);
      walk(destination, depth + 1, low, high, selected);
    }
  };
  walk(root, 0, -1.05, 1.05, true);
  let total = 0;
  for (const edge of edges) {
    let length = 0;
    let px = edge.a.x;
    let py = edge.a.y;
    for (let k = 1; k <= 16; k += 1) {
      const t = k / 16;
      const x = mix(edge.a.x, edge.b.x, t);
      const y = mix(edge.a.y, edge.b.y, sstep(t));
      length += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    edge.length = length;
    edge.cumulative = total;
    total += length;
  }
  for (const edge of edges) {
    let offset = 0;
    for (let parent = edge.parent; parent >= 0; parent = edges[parent].parent) offset += edges[parent].length;
    edge.offset = offset;
  }
  const selectedPath = edges.filter(edge => edge.selected).sort((a, b) => a.depth - b.depth);
  const deepest = edges.reduce((max, edge) => Math.max(max, edge.offset + edge.length), 0);
  const tree = {
    edges, nodes, root, startX, endX, centerY, total, selectedPath, deepest,
    /** Slow flow of particles along an edge; shared by the scene and the dive. */
    flowAmount(base, seed, time) {
      return (base + time * 0.00003 * (0.4 + seed)) % 1;
    },
    selectedLength: selectedPath.reduce((sum, edge) => sum + edge.length, 0),
    /** Map a fraction of total stroke length to an edge and an amount along it. */
    locate(fraction) {
      const target = clamp01(fraction) * total;
      let low = 0;
      let high = edges.length - 1;
      while (low < high) {
        const mid = (low + high + 1) >> 1;
        if (edges[mid].cumulative <= target) low = mid;
        else high = mid - 1;
      }
      const edge = edges[low];
      return { edge: low, amount: clamp01((target - edge.cumulative) / (edge.length || 1)) };
    },
    point(edgeIndex, amount, out) {
      const edge = edges[edgeIndex];
      out[0] = mix(edge.a.x, edge.b.x, amount);
      out[1] = mix(edge.a.y, edge.b.y, sstep(amount));
      return out;
    },
    /** Point at distance `distance` from the root along the chain that ends at edgeIndex. */
    along(edgeIndex, distance, out) {
      let edge = edgeIndex;
      while (edges[edge].parent >= 0 && distance < edges[edge].offset) edge = edges[edge].parent;
      const current = edges[edge];
      return tree.point(edge, clamp01((distance - current.offset) / (current.length || 1)), out);
    },
  };
  return tree;
}

function treeScene(tree, { mobile }) {
  const edgesGroup = {
    weight: tree.total * 1.05,
    build() {
      return (f, i, local, ctx, out, rest) => {
        const s = ctx.seed;
        const q = i * 4;
        const { edge: e, amount: base } = tree.locate(f);
        const edge = tree.edges[e];
        const amount = rest ? base : tree.flowAmount(base, s[q + 2], ctx.time);
        tree.point(e, amount, out);
        if (!rest) {
          const spread = 0.35 + s[q + 2] * 1.35;
          out[0] += Math.sin(s[q + 3] * TAU + ctx.time * 0.001) * spread;
          out[1] += Math.cos(s[q + 2] * TAU + ctx.time * 0.001) * spread;
        }
        const chosen = edge.selected && (edge.depth + amount) / 4 < smooth(0.22, 0.72, local) * 1.15;
        const settle = smooth(0.5, 0.8, local);
        const alpha = mix(0.72, edge.selected ? 0.9 : 0.34, settle) * (0.42 + s[q + 3] * 0.58);
        out[2] = 0.7 + s[q + 3] * 0.65;
        writeColor(out, chosen ? ctx.palette[COLOR.accent] : ctx.palette[COLOR.fg], alpha);
      };
    },
  };
  const rings = new Stroke();
  for (const node of tree.nodes) {
    if (node === tree.root) rings.circle(node.x, node.y, mobile ? 4.2 : 5.5, { color: COLOR.accent, alpha: 0.9 });
    else if (node.depth === 4) rings.circle(node.x, node.y, mobile ? 1.9 : 2.5, { alpha: 0.6 });
    else rings.circle(node.x, node.y, mobile ? 2.4 : 3.1, { alpha: 0.82 });
  }
  const pulse = {
    weight: tree.total * 0.045,
    build() {
      return (f, i, local, ctx, out, rest) => {
        const s = ctx.seed;
        const q = i * 4;
        const head = rest ? 0.35 : (ctx.time * 0.00011) % 1.25;
        const distance = clamp01(head - f * 0.16) * tree.selectedLength;
        const last = tree.selectedPath.length ? tree.edges.indexOf(tree.selectedPath.at(-1)) : 0;
        tree.along(last, distance, out);
        out[0] += (s[q] - 0.5) * 1.6;
        out[1] += (s[q + 1] - 0.5) * 1.6;
        const glow = smooth(0.18, 0.4, local) * (1 - f) * (head > 1.02 ? 1 - smooth(1.02, 1.25, head) : 1);
        out[2] = 1.1 + (1 - f) * 0.7;
        writeColor(out, ctx.palette[COLOR.accent], 0.18 + glow * 0.8);
      };
    },
  };
  return [edgesGroup, strokeGroup(rings, { density: 1.7, jitter: 0.15, shimmer: 0.06 }), pulse];
}

// ---------------------------------------------------------------- 02 project widget

function widgetScene(layout, { w, h, mobile }) {
  const widget = fallbackRect(layout.widget, w * 0.7, h * 0.3, w * 0.22, h * 0.4);
  const code = fallbackRect(layout.code, w * 0.42, h * 0.38, w * 0.2, h * 0.24);
  const stroke = new Stroke();
  stroke.roundRect(widget, mobile ? 12 : 15, { alpha: 0.86 });
  const ruleY = layout.rule ? layout.rule.y + layout.rule.height + (mobile ? 6 : 9) : widget.y + 40;
  stroke.line(widget.x + 12, ruleY, widget.x + widget.width - 12, ruleY, { alpha: 0.62 });
  for (const chip of layout.chips || []) stroke.roundRect(chip, chip.height / 2, { alpha: 0.5, weight: 0.9 });
  for (const button of layout.buttons || []) stroke.roundRect(button, button.height / 2, { alpha: 0.78 });
  const steps = (layout.steps || []).map(centre);
  const ring = layout.steps?.[0] ? layout.steps[0].width / 2 : 6;
  steps.forEach((step, index) => {
    stroke.circle(step.x, step.y, ring, { alpha: 0.85 });
    const next = steps[index + 1];
    if (next) stroke.line(step.x + ring + 3, step.y, next.x - ring - 3, next.y, { alpha: 0.4, color: COLOR.muted });
  });
  stroke.line(code.x - (mobile ? 9 : 14), code.y + 2, code.x - (mobile ? 9 : 14), code.y + code.height - 2, { alpha: 0.26, color: COLOR.muted });

  const status = layout.status ? centre(layout.status) : { x: widget.x + 18, y: widget.y + 20 };
  const statusGroup = {
    weight: 70,
    build(count) {
      const dot = new Stroke().disc(status.x, status.y, mobile ? 2.6 : 3.2, { color: COLOR.accent, alpha: 1, fill: 0.9 }).sample(count);
      return (f, i, local, ctx, out, rest) => {
        const o = Math.min(dot.count - 1, Math.floor(f * dot.count)) * STRIDE;
        out[0] = dot.data[o];
        out[1] = dot.data[o + 1];
        out[2] = 1;
        const beat = rest ? 1 : 0.55 + 0.45 * Math.sin(ctx.time * 0.0035) ** 2;
        writeColor(out, ctx.palette[COLOR.accent], beat);
      };
    },
  };
  const fillGroup = {
    weight: steps.length ? steps.length * Math.PI * ring * ring * 0.62 : 1,
    build(count) {
      const per = Math.max(1, Math.floor(count / Math.max(1, steps.length)));
      const discs = steps.map(step => new Stroke().disc(step.x, step.y, Math.max(1, ring - 2.3), { fill: 0.75 }).sample(per));
      const rims = steps.map(step => new Stroke().circle(step.x, step.y, ring - 0.4).sample(per));
      return (f, i, local, ctx, out, rest) => {
        if (!steps.length) { out[0] = widget.x; out[1] = widget.y; out[2] = 0.5; writeColor(out, ctx.palette[COLOR.fg], 0); return; }
        const k = Math.min(steps.length - 1, Math.floor(f * steps.length));
        const inner = f * steps.length - k;
        const disc = discs[k];
        const rim = rims[k];
        const d = Math.min(disc.count - 1, Math.floor(inner * disc.count)) * STRIDE;
        const r = Math.min(rim.count - 1, Math.floor(inner * rim.count)) * STRIDE;
        const filled = rest ? 1 : smoother(0.08 + k * 0.13, 0.2 + k * 0.13, local);
        out[0] = mix(rim.data[r], disc.data[d], filled);
        out[1] = mix(rim.data[r + 1], disc.data[d + 1], filled);
        out[2] = 0.95 + ctx.seed[i * 4 + 3] * 0.4;
        writeColor(out, filled > 0.5 && k === steps.length - 1 ? ctx.palette[COLOR.accent] : ctx.palette[COLOR.fg], 0.55 + filled * 0.4);
      };
    },
  };
  const cursorRect = layout.cursor || { x: code.x + code.width * 0.5, y: code.y + code.height - 12, width: 6, height: 12 };
  const cursorGroup = {
    weight: 60,
    build(count) {
      const cols = 4;
      return (f, i, local, ctx, out, rest) => {
        const k = Math.floor(f * count);
        const rows = Math.max(1, Math.ceil(count / cols));
        out[0] = cursorRect.x + 1 + ((k % cols) + 0.5) * ((mobile ? 5 : 6.5) / cols);
        out[1] = cursorRect.y + 1 + (Math.floor(k / cols) + 0.5) * ((cursorRect.height - 2) / rows);
        out[2] = 1.1;
        const blink = rest ? 1 : 0.18 + 0.72 * smooth(-0.2, 0.2, Math.sin(ctx.time * 0.0058));
        writeColor(out, ctx.palette[COLOR.accent], blink);
      };
    },
  };
  return [strokeGroup(stroke, { density: 1.25 }), statusGroup, fillGroup, cursorGroup];
}

// ---------------------------------------------------------------- 03 notes

function notesScene(layout, { w, h, mobile }) {
  const notes = layout.notes?.length ? layout.notes : [
    { x: w * 0.48, y: h * 0.33, width: w * 0.2, height: h * 0.32 },
    { x: w * 0.73, y: h * 0.4, width: w * 0.2, height: h * 0.32 },
  ];
  const stroke = new Stroke();
  const ticks = [];
  notes.slice(0, 2).forEach((note, index) => {
    const { x, y, width, height } = note;
    const fold = Math.min(mobile ? 14 : 20, width * 0.12, height * 0.12);
    stroke.polyline([[x, y], [x + width - fold, y], [x + width, y + fold], [x + width, y + height], [x, y + height]], { alpha: 0.84 }, true);
    stroke.polyline([[x + width - fold, y], [x + width - fold, y + fold], [x + width, y + fold]], { alpha: 0.5 });
    const off = mobile ? 5 : 7;
    stroke.line(x + width + off, y + fold + off, x + width + off, y + height + off, { alpha: 0.28, color: COLOR.muted });
    stroke.line(x + off, y + height + off, x + width + off, y + height + off, { alpha: 0.28, color: COLOR.muted });
    const rule = layout.noteRules?.[index];
    const ruleY = rule ? rule.y + rule.height + (mobile ? 6 : 9) : y + (mobile ? 30 : 44);
    stroke.line(x + 12, ruleY, x + width - 12, ruleY, { alpha: 0.55 });
    stroke.line(x + (mobile ? 8 : 11), ruleY + 8, x + (mobile ? 8 : 11), y + height - 10, { alpha: 0.32, color: COLOR.accent });
    const block = layout.noteDetails?.[index];
    if (!block) return;
    if (index === 0) {
      const rows = 3;
      const box = mobile ? 6 : 8;
      for (let r = 0; r < rows; r += 1) {
        const cy = block.y + ((r + 0.5) * block.height) / rows;
        const bx = block.x;
        const rect = { x: bx, y: cy - box / 2, width: box, height: box };
        stroke.roundRect(rect, 1.2, { alpha: 0.72 });
        stroke.line(bx + box + (mobile ? 6 : 9), cy, bx + box + (mobile ? 6 : 9) + (block.width - box - 12) * [0.82, 0.64, 0.74][r], cy, { alpha: 0.3, color: COLOR.muted });
        ticks.push({ rect, cx: bx + box / 2, cy });
      }
    } else {
      const mid = block.x + block.width / 2;
      stroke.line(mid, block.y, mid, block.y + block.height, { alpha: 0.4, color: COLOR.muted });
      for (let r = 0; r < 3; r += 1) {
        const ly = block.y + ((r + 0.5) * block.height) / 3;
        stroke.line(block.x, ly, block.x + (block.width / 2 - 8) * [0.9, 0.7, 0.8][r], ly, { alpha: 0.34 });
        stroke.line(mid + 8, ly, mid + 8 + (block.width / 2 - 8) * [0.75, 0.9, 0.6][r], ly, { alpha: 0.5, color: COLOR.accent });
      }
    }
  });
  const tickGroup = {
    weight: ticks.length ? ticks.length * 34 : 1,
    build(count) {
      const per = Math.max(1, Math.floor(count / Math.max(1, ticks.length)));
      const shapes = ticks.map(({ rect, cx, cy }) => {
        const s = rect.width;
        const box = new Stroke().roundRect({ x: rect.x + 1.4, y: rect.y + 1.4, width: s - 2.8, height: s - 2.8 }, 0.8).sample(per);
        const mark = new Stroke().polyline([[cx - s * 0.36, cy - s * 0.02], [cx - s * 0.08, cy + s * 0.3], [cx + s * 0.62, cy - s * 0.62]]).sample(per);
        return { box, mark };
      });
      return (f, i, local, ctx, out, rest) => {
        if (!shapes.length) { out[0] = w / 2; out[1] = h / 2; out[2] = 0.5; writeColor(out, ctx.palette[COLOR.fg], 0); return; }
        const k = Math.min(shapes.length - 1, Math.floor(f * shapes.length));
        const inner = f * shapes.length - k;
        const { box, mark } = shapes[k];
        const b = Math.min(box.count - 1, Math.floor(inner * box.count)) * STRIDE;
        const m = Math.min(mark.count - 1, Math.floor(inner * mark.count)) * STRIDE;
        const checked = rest ? 1 : smoother(0.12 + k * 0.1, 0.22 + k * 0.1, local);
        out[0] = mix(box.data[b], mark.data[m], checked);
        out[1] = mix(box.data[b + 1], mark.data[m + 1], checked);
        out[2] = 1 + checked * 0.2;
        writeColor(out, checked > 0.5 ? ctx.palette[COLOR.accent] : ctx.palette[COLOR.fg], 0.5 + checked * 0.45);
      };
    },
  };
  return [strokeGroup(stroke, { density: 1.2 }), tickGroup];
}

// ---------------------------------------------------------------- 04 publishing flow

/** The five publishing-flow nodes: centres measured from the DOM labels, with radii. */
function flowNodes(layout, { w, h, mobile }) {
  const compact = mobile && h <= 650;
  const anchors = layout.nodes?.length === 5 ? layout.nodes.map(centre) : (() => {
    const centerY = mobile ? h * (compact ? 0.64 : 0.67) : h * 0.51;
    const left = mobile ? w * 0.12 : w * 0.47;
    const middle = mobile ? w * 0.51 : w * 0.68;
    const right = mobile ? w * 0.87 : w * 0.9;
    const rows = mobile ? (compact ? [h * 0.5, h * 0.64, h * 0.78] : [h * 0.51, h * 0.67, h * 0.83]) : [h * 0.28, h * 0.51, h * 0.74];
    return [{ x: left, y: centerY }, ...rows.map(y => ({ x: middle, y })), { x: right, y: centerY }];
  })();
  const radii = [mobile ? 12 : 18, mobile ? 13 : 21, mobile ? 13 : 21, mobile ? 13 : 21, mobile ? 14 : 18];
  return anchors.map((point, index) => ({ ...point, r: radii[index] }));
}

function flowScene(nodes) {
  const stroke = new Stroke();
  nodes.forEach(node => stroke.circle(node.x, node.y, node.r, { alpha: 0.86 }));
  const [source, hugo, velog, github, result] = nodes;
  // 실험: ripples on water.
  stroke.circle(source.x, source.y, source.r * 0.58, { alpha: 0.48 });
  stroke.circle(source.x, source.y, source.r * 0.3, { alpha: 0.68 });
  stroke.disc(source.x, source.y, source.r * 0.1, { alpha: 0.95, fill: 0.8, color: COLOR.accent });
  // Hugo: a document with a folded corner and text lines.
  {
    const dw = hugo.r * 0.78;
    const dh = hugo.r * 1.0;
    const x = hugo.x - dw / 2;
    const y = hugo.y - dh / 2;
    const f = dw * 0.28;
    stroke.polyline([[x, y], [x + dw - f, y], [x + dw, y + f], [x + dw, y + dh], [x, y + dh]], { alpha: 0.8 }, true);
    for (let k = 0; k < 3; k += 1) stroke.line(x + dw * 0.18, y + dh * (0.42 + k * 0.18), x + dw * (k === 2 ? 0.55 : 0.82), y + dh * (0.42 + k * 0.18), { alpha: 0.55 });
  }
  // Velog: a speech bubble.
  {
    const bw = velog.r * 1.08;
    const bh = velog.r * 0.72;
    const rect = { x: velog.x - bw / 2, y: velog.y - bh / 2 - velog.r * 0.08, width: bw, height: bh };
    stroke.roundRect(rect, 3, { alpha: 0.8 });
    stroke.polyline([[rect.x + bw * 0.24, rect.y + bh], [rect.x + bw * 0.18, rect.y + bh + velog.r * 0.26], [rect.x + bw * 0.42, rect.y + bh]], { alpha: 0.8 });
    stroke.line(rect.x + bw * 0.2, rect.y + bh * 0.38, rect.x + bw * 0.8, rect.y + bh * 0.38, { alpha: 0.5 });
    stroke.line(rect.x + bw * 0.2, rect.y + bh * 0.66, rect.x + bw * 0.6, rect.y + bh * 0.66, { alpha: 0.5 });
  }
  // GitHub: </> brackets.
  {
    const r = github.r;
    stroke.polyline([[github.x - r * 0.2, github.y - r * 0.34], [github.x - r * 0.52, github.y], [github.x - r * 0.2, github.y + r * 0.34]], { alpha: 0.82 });
    stroke.polyline([[github.x + r * 0.2, github.y - r * 0.34], [github.x + r * 0.52, github.y], [github.x + r * 0.2, github.y + r * 0.34]], { alpha: 0.82 });
    stroke.line(github.x + r * 0.1, github.y - r * 0.42, github.x - r * 0.1, github.y + r * 0.42, { alpha: 0.82, color: COLOR.accent });
  }
  // 기록: a stack of records.
  {
    const bw = result.r * 1.0;
    const bh = result.r * 0.24;
    for (let k = -1; k <= 1; k += 1) stroke.roundRect({ x: result.x - bw / 2, y: result.y - bh / 2 + k * bh * 1.45, width: bw, height: bh }, bh / 2, { alpha: 0.78 });
  }
  const edges = [];
  for (let index = 1; index <= 3; index += 1) {
    edges.push({ a: source, b: nodes[index], index, out: false });
    edges.push({ a: nodes[index], b: result, index, out: true });
  }
  const signals = {
    weight: edges.reduce((sum, edge) => sum + Math.hypot(edge.b.x - edge.a.x, edge.b.y - edge.a.y), 0) * 0.85,
    build() {
      return (f, i, local, ctx, out, rest) => {
        const s = ctx.seed;
        const q = i * 4;
        const e = Math.min(edges.length - 1, Math.floor(f * edges.length));
        const edge = edges[e];
        const base = f * edges.length - e;
        const amount = rest ? base : (base + ctx.time * 0.00005) % 1;
        const reveal = edge.out
          ? smooth(0.16 + edge.index * 0.05, 0.36 + edge.index * 0.05, local)
          : smooth(0.02 + edge.index * 0.04, 0.2 + edge.index * 0.04, local);
        const shown = rest ? amount : Math.min(amount, reveal);
        const startX = edge.a.x + (edge.b.x > edge.a.x ? edge.a.r : -edge.a.r);
        const endX = edge.b.x + (edge.b.x > edge.a.x ? -edge.b.r : edge.b.r);
        out[0] = mix(startX, endX, shown) + (s[q + 2] - 0.5) * 1.4;
        out[1] = mix(edge.a.y, edge.b.y, sstep(shown)) + (s[q + 3] - 0.5) * 1.4;
        out[2] = 0.7 + s[q + 3] * 0.5;
        const front = rest ? 1 : 1 - smooth(reveal - 0.02, reveal, amount) * 0.55;
        writeColor(out, edge.out ? ctx.palette[COLOR.accent] : ctx.palette[COLOR.fg], (edge.out ? 0.5 : 0.42) * front);
      };
    },
  };
  return [strokeGroup(stroke, { density: 1.55, jitter: 0.2 }), signals];
}

// ---------------------------------------------------------------- 05 search

function searchScene(layout, { w, h, mobile }) {
  const pill = fallbackRect(layout.final, w * 0.32, h * 0.47, w * 0.36, mobile ? 58 : 62);
  const button = layout.finalButton || { x: pill.x + pill.width - pill.height + 10, y: pill.y + 10, width: pill.height - 20, height: pill.height - 20 };
  const icon = layout.finalIcon ? centre(layout.finalIcon) : { x: pill.x + 26, y: pill.y + pill.height / 2 };
  const stroke = new Stroke();
  const b = centre(button);
  const br = Math.min(button.width, button.height) / 2;
  stroke.circle(b.x, b.y, br, { alpha: 0.9 });
  stroke.line(b.x, b.y + br * 0.44, b.x, b.y - br * 0.44, { alpha: 0.9 });
  stroke.polyline([[b.x - br * 0.3, b.y - br * 0.12], [b.x, b.y - br * 0.44], [b.x + br * 0.3, b.y - br * 0.12]], { alpha: 0.9 });
  const lens = mobile ? 5.2 : 6.2;
  stroke.circle(icon.x - 1.5, icon.y - 1.5, lens, { alpha: 0.72, color: COLOR.muted });
  stroke.line(icon.x + lens * 0.55, icon.y + lens * 0.55, icon.x + lens * 1.25, icon.y + lens * 1.25, { alpha: 0.72, color: COLOR.muted });
  const outline = new Stroke().roundRect(pill, pill.height / 2);
  const perimeter = outline.length;
  const march = {
    weight: perimeter * 1.7,
    build(count) {
      const ring = outline.sample(count);
      return (f, i, local, ctx, out, rest) => {
        const focus = rest ? 0 : ctx.highlight.pill;
        const travel = rest ? f : (f + ctx.time * 0.00004 * focus) % 1;
        const k = Math.min(ring.count - 1, Math.floor(travel * ring.count)) * STRIDE;
        const s = ctx.seed;
        const q = i * 4;
        out[0] = ring.data[k] + (rest ? 0 : Math.sin(ctx.time * 0.001 + s[q + 1] * TAU) * 0.8);
        out[1] = ring.data[k + 1] + (rest ? 0 : Math.cos(ctx.time * 0.001 + s[q + 2] * TAU) * 0.8);
        out[2] = 0.75 + s[q + 3] * 0.65 + focus * 0.3;
        const wave = rest ? 1 : 0.72 + 0.28 * Math.sin((f * 9 - ctx.time * 0.0012) * TAU) * focus;
        writeColor(out, ctx.palette[COLOR.fg], (0.5 + s[q + 3] * 0.35 + focus * 0.12) * wave);
      };
    },
  };
  return [strokeGroup(stroke, { density: 1.6, jitter: 0.2 }), march];
}

/** Build scenes 01–05 for the current viewport and DOM layout. */
export function buildStory({ w, h, mobile, layout, particles }) {
  const context = { w, h, mobile };
  const tree = buildTree({ w, h, mobile });
  const nodes = flowNodes(layout, context);
  const scenes = [
    makeScene(treeScene(tree, context), particles),
    makeScene(widgetScene(layout, context), particles),
    makeScene(notesScene(layout, context), particles),
    makeScene(flowScene(nodes), particles),
    makeScene(searchScene(layout, context), particles),
  ];
  const edgeSpan = scenes[0].groups[0].span;
  /** Fraction within the tree's edge group, or −1 for node rings and the pulse. */
  scenes[0].edgeFraction = fraction => (fraction < edgeSpan ? fraction / edgeSpan : -1);
  // Perches for the companion kingfisher: the upper first-level knot of the network (with
  // the root as a fallback), and the Hugo and record nodes of the publishing flow.
  const branch = tree.nodes.find(node => node.depth === 1 && node.y < tree.centerY - 1) || tree.root;
  const anchors = {
    root: tree.root, rootRing: mobile ? 4.2 : 5.5,
    branch, branchRing: branch === tree.root ? (mobile ? 4.2 : 5.5) : (mobile ? 2.4 : 3.1),
    source: nodes[0], hugo: nodes[1], result: nodes[4],
  };
  return { tree, scenes, anchors };
}
