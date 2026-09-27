// Shared morph math: slot correspondence between scenes and staggered, curved paths.

export const TAU = Math.PI * 2;
export const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
export const mix = (from, to, amount) => from + (to - from) * amount;

/** Quintic ease: zero velocity and acceleration at both ends, so arrivals never wobble. */
export function ease(value) {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function smoother(from, to, value) {
  return ease((value - from) / (to - from));
}

export function smooth(from, to, value) {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random sequence, so every visitor sees the same composition. */
export function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Pair every source point with one destination slot so that neighbours stay neighbours.
 * Knothe–Rosenblatt rearrangement: sort by the primary axis, cut equal-count bands, sort
 * each band by the secondary axis and match ranks. The primary axis is the one along which
 * both shapes spread the most, so wide scenes sweep sideways and tall scenes sweep down.
 * `src` and `dst` hold `count` interleaved x,y pairs. Returns the dst index for each src.
 */
export function rankMatch(src, dst, count, bands = Math.max(1, Math.round(Math.sqrt(count)))) {
  const result = new Uint32Array(count);
  if (!count) return result;
  const spread = (points, axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = axis; i < count * 2; i += 2) {
      const value = points[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return max - min;
  };
  const primary = spread(src, 0) + spread(dst, 0) >= spread(src, 1) + spread(dst, 1) ? 0 : 1;
  const secondary = 1 - primary;
  const order = points => {
    const indices = new Uint32Array(count);
    for (let i = 0; i < count; i += 1) indices[i] = i;
    indices.sort((a, b) => points[a * 2 + primary] - points[b * 2 + primary] || a - b);
    for (let band = 0; band < bands; band += 1) {
      const start = Math.floor((band * count) / bands);
      const end = Math.floor(((band + 1) * count) / bands);
      indices.subarray(start, end).sort((a, b) => points[a * 2 + secondary] - points[b * 2 + secondary] || a - b);
    }
    return indices;
  };
  const sourceOrder = order(src);
  const destinationOrder = order(dst);
  for (let rank = 0; rank < count; rank += 1) result[sourceOrder[rank]] = destinationOrder[rank];
  return result;
}

/** Match two orderings that are already ranked (for example by distance along a path). */
export function orderMatch(sourceKeys, destinationKeys) {
  const count = sourceKeys.length;
  const byKey = keys => {
    const indices = new Uint32Array(keys.length);
    for (let i = 0; i < keys.length; i += 1) indices[i] = i;
    return indices.sort((a, b) => keys[a] - keys[b] || a - b);
  };
  const source = byKey(sourceKeys);
  const destination = byKey(destinationKeys);
  const result = new Uint32Array(count);
  for (let rank = 0; rank < count; rank += 1) result[source[rank]] = destination[Math.min(destination.length - 1, rank)];
  return result;
}

/**
 * Curved in-flight offset for a particle travelling from a to b at eased progress t.
 * The bend direction comes from a smooth field over the source position, so neighbouring
 * particles arc together like a current instead of crossing each other.
 */
export function flightOffset(ax, ay, bx, by, t, scale, phase, out) {
  const envelope = Math.sin(Math.PI * t);
  if (envelope <= 0) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const field = Math.sin((ax * 0.0021 + ay * 0.0034) * TAU + phase);
  const bend = Math.min(length * 0.2, scale * 0.075) * (0.55 + 0.45 * field) * envelope;
  const current = Math.min(length * 0.07, scale * 0.024) * envelope;
  const angle = ((ax + bx) * 0.0016 - (ay + by) * 0.0012) * TAU + phase * 0.5;
  out[0] = (-dy / length) * bend + Math.cos(angle) * current;
  out[1] = (dx / length) * bend + Math.sin(angle) * current;
  return out;
}
