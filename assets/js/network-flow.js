import { createFolioPaths } from './particle-flow.js';

// Sparse, soft-edged branches. Positions stay continuous: grains breathe around
// their own place instead of wrapping from a branch tip back to its root.
export function createNetworkField(edges, seeds, width) {
  const field = new Float32Array(seeds.length / 4 * 5);
  const mobile = width <= 700;
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4, k = i * 5;
    const a = seeds[q], b = seeds[q + 1], c = seeds[q + 2], d = seeds[q + 3];
    const edge = edges[Math.min(edges.length - 1, Math.floor(a * edges.length))];
    const dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const taper = Math.sin(b * Math.PI);
    const widthAtPoint = (mobile ? 9 : 15) * (.25 + taper * .75);
    const cross = (d - .5) * widthAtPoint * 2;
    // The branch bows gently; its grain envelope thins near the junctions.
    field[k] = edge.a.x + dx * b - dy / length * cross;
    field[k + 1] = edge.a.y + dy * (b * b * (3 - 2 * b)) + dx / length * cross;
    field[k + 2] = edge.selected ? .48 : d > .94 ? .20 : 0;
    field[k + 3] = c < .32 ? (.20 + d * .30) * (.25 + taper * .75) : 0;
    field[k + 4] = .48 + d * .46;
  }
  return field;
}

export function createNetworkPaths(from, to, edges, seeds, width) {
  const paths = createFolioPaths(from, to, seeds, width);
  const maxDepth = Math.max(1, ...edges.map(edge => edge.depth));
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4;
    const edge = edges[Math.min(edges.length - 1, Math.floor(seeds[q] * edges.length))];
    // Outer branches release first. Within a branch, the tip loosens before
    // the root. Broad, staggered currents replace a synchronized wire collapse.
    paths[q] *= .65;
    paths[q + 1] *= 1.12;
    paths[q + 2] = .40 + (1 - edge.depth / maxDepth) * .18 + (1 - seeds[q + 1]) * .07 + seeds[q + 2] * .03;
    paths[q + 3] = .94 + seeds[q + 3] * .06;
  }
  return paths;
}
