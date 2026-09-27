import assert from 'node:assert/strict';
import test from 'node:test';

import {
  blendFolioParticle,
  createFolioField,
  createFolioPaths,
} from '../../assets/js/particle-flow.js';
import { ParticleExperience } from '../../assets/js/particles.js';

const seeds = new Float32Array([
  0.08, 0.05, 0.12, 0.18,
  0.24, 0.92, 0.88, 0.76,
  0.51, 0.34, 0.22, 0.96,
  0.73, 0.68, 0.64, 0.42,
  0.94, 0.18, 0.44, 0.84,
]);

const desktopRects = [
  { x: 610, y: 220, width: 480, height: 260 },
  { x: 720, y: 540, width: 390, height: 230 },
];

const mobileRects = [
  { x: 24, y: 260, width: 342, height: 180 },
  { x: 36, y: 470, width: 318, height: 160 },
];

function everyFinite(values) {
  return Array.from(values).every(Number.isFinite);
}

function particle(field, index) {
  return field.subarray(index * 5, index * 5 + 5);
}

function blended(from, to, paths, index, progress, seed = 0.9) {
  const out = new Float32Array(5);
  blendFolioParticle(from, to, paths, index, progress, seed, out);
  return out;
}

function distance(left, right, dimensions = 5) {
  let sum = 0;
  for (let i = 0; i < dimensions; i++) sum += (left[i] - right[i]) ** 2;
  return Math.sqrt(sum);
}

function assertArrayClose(actual, expected, epsilon = 1e-5) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, received ${actual[i]}`,
    );
  }
}

function sceneFixture({ reduced = false, count = 100 } = {}) {
  const seed = new Float32Array(count * 4);
  const folioPaths = new Float32Array(count * 4);
  const projectField = new Float32Array(count * 5);
  const noteField = new Float32Array(count * 5);
  for (let i = 0; i < count; i++) {
    const q = i * 4;
    const k = i * 5;
    const unit = count > 1 ? i / (count - 1) : 0;
    seed[q] = unit;
    seed[q + 1] = (i % 7) / 6;
    seed[q + 2] = unit;
    seed[q + 3] = (i % 5) / 4;
    folioPaths[q] = 45 + i * 0.3;
    folioPaths[q + 1] = -38 + i * 0.2;
    folioPaths[q + 2] = 0.38 + seed[q + 1] * 0.15;
    folioPaths[q + 3] = 0.93 + seed[q + 2] * 0.07;
    projectField.set([100 + i * 2, 50 - i, 0, 0.24, 0.7], k);
    noteField.set([700 - i, 350 + i * 1.5, 0.5, 0.72, 1], k);
  }

  const calls = [];
  return {
    reduced,
    count,
    seed,
    folioPaths,
    projectField,
    noteField,
    calls,
    _target(stage, index, local, out) {
      calls.push({ stage, index, local });
      if (index < count * 0.09) {
        out[0] = 20 + index * 3;
        out[1] = 30 + index * 2;
        out[2] = 0;
        out[3] = 0.12;
        out[4] = 0.55;
        return;
      }
      const base = stage === 2 ? 100 : 700;
      out[0] = base + index * (stage === 2 ? 2 : -1);
      out[1] = base * 0.5 + index * (stage === 2 ? -1 : 1.5);
      out[2] = stage === 2 ? 0 : 0.5;
      out[3] = stage === 2 ? 0.24 : 0.72;
      out[4] = stage === 2 ? 0.7 : 1.0;
    },
  };
}

function sceneTarget(context, stage, local, index) {
  const target = [0, 0, 0, 0, 0];
  const next = [0, 0, 0, 0, 0];
  ParticleExperience.prototype._sceneTarget.call(context, stage, local, index, target, next);
  return target;
}

test('folio fields are deterministic, finite, and responsive to viewport geometry', () => {
  const desktop = createFolioField(desktopRects, seeds, 1440, 1000);
  const desktopAgain = createFolioField(desktopRects, seeds, 1440, 1000);
  const mobile = createFolioField(mobileRects, seeds, 390, 844);
  const mobileAgain = createFolioField(mobileRects, seeds, 390, 844);

  assert.equal(desktop.length, seeds.length / 4 * 5);
  assert.equal(mobile.length, seeds.length / 4 * 5);
  assert.deepEqual(desktop, desktopAgain);
  assert.deepEqual(mobile, mobileAgain);
  assert.ok(everyFinite(desktop));
  assert.ok(everyFinite(mobile));
  assert.notDeepEqual(desktop, mobile);

  for (let i = 0; i < seeds.length / 4; i++) {
    const desktopParticle = particle(desktop, i);
    const mobileParticle = particle(mobile, i);
    assert.ok(desktopParticle[4] >= 0.5 && desktopParticle[4] <= 1.05);
    assert.ok(mobileParticle[4] >= 0.5 && mobileParticle[4] <= 1.05);
    assert.ok(desktopParticle[3] >= 0);
    assert.ok(mobileParticle[3] >= 0);
  }
});

test('folio paths are finite, curved, and stagger release and arrival', () => {
  const from = createFolioField([desktopRects[0]], seeds, 1440, 1000);
  const to = createFolioField(desktopRects, seeds, 1440, 1000);
  const paths = createFolioPaths(from, to, seeds, 1440);
  const pathsAgain = createFolioPaths(from, to, seeds, 1440);
  const mobileFrom = createFolioField([mobileRects[0]], seeds, 390, 844);
  const mobileTo = createFolioField(mobileRects, seeds, 390, 844);
  const mobilePaths = createFolioPaths(mobileFrom, mobileTo, seeds, 390);
  const mobilePathsAgain = createFolioPaths(mobileFrom, mobileTo, seeds, 390);

  assert.equal(paths.length, seeds.length);
  assert.ok(everyFinite(paths));
  assert.ok(everyFinite(mobilePaths));
  assert.deepEqual(paths, pathsAgain);
  assert.deepEqual(mobilePaths, mobilePathsAgain);
  assert.notDeepEqual(paths, mobilePaths);

  const pathVectors = new Set();
  const starts = new Set();
  const ends = new Set();
  for (let i = 0; i < seeds.length / 4; i++) {
    const q = i * 4;
    assert.ok(Math.hypot(paths[q], paths[q + 1]) >= 40);
    assert.ok(paths[q + 2] >= 0.38 && paths[q + 2] <= 0.53);
    assert.ok(paths[q + 3] >= 0.93 && paths[q + 3] <= 1);
    assert.ok(paths[q + 2] < paths[q + 3]);
    pathVectors.add(`${paths[q].toFixed(3)}:${paths[q + 1].toFixed(3)}`);
    starts.add(paths[q + 2].toFixed(4));
    ends.add(paths[q + 3].toFixed(4));
  }

  assert.ok(pathVectors.size >= 4, 'particles should follow distinct currents');
  assert.ok(starts.size >= 4, 'release times should be staggered');
  assert.ok(ends.size >= 4, 'arrival times should be staggered');

  const index = 1;
  const q = index * 4;
  const midpoint = (paths[q + 2] + paths[q + 3]) / 2;
  const curved = blended(particle(from, index), particle(to, index), paths, index, midpoint);
  const linearMidpoint = new Float32Array(5);
  for (let j = 0; j < 5; j++) {
    linearMidpoint[j] = (from[index * 5 + j] + to[index * 5 + j]) / 2;
  }
  assert.ok(
    distance(curved, linearMidpoint, 2) >= 40,
    'the middle of a transition should bow away from a straight interpolation',
  );
});

test('blend preserves exact endpoints and approaches them continuously', () => {
  const fromField = createFolioField([desktopRects[0]], seeds, 1440, 1000);
  const toField = createFolioField(desktopRects, seeds, 1440, 1000);
  const paths = createFolioPaths(fromField, toField, seeds, 1440);
  const index = 2;
  const q = index * 4;
  const from = particle(fromField, index);
  const to = particle(toField, index);
  const start = paths[q + 2];
  const end = paths[q + 3];

  assertArrayClose(blended(from, to, paths, index, start - 0.1), from, 0);
  assertArrayClose(blended(from, to, paths, index, start), from, 0);
  assertArrayClose(blended(from, to, paths, index, end), to, 0);
  assertArrayClose(blended(from, to, paths, index, end + 0.1), to, 0);

  const justAfterStart = blended(from, to, paths, index, start + 1e-3);
  const laterAfterStart = blended(from, to, paths, index, start + 1e-2);
  const justBeforeEnd = blended(from, to, paths, index, end - 1e-3);
  const earlierBeforeEnd = blended(from, to, paths, index, end - 1e-2);
  assert.ok(distance(justAfterStart, from) < distance(laterAfterStart, from));
  assert.ok(distance(justBeforeEnd, to) < distance(earlierBeforeEnd, to));
});

test('blend is progress-pure when sampled forward or in reverse', () => {
  const fromField = createFolioField([desktopRects[0]], seeds, 1440, 1000);
  const toField = createFolioField(desktopRects, seeds, 1440, 1000);
  const paths = createFolioPaths(fromField, toField, seeds, 1440);
  const index = 3;
  const from = particle(fromField, index);
  const to = particle(toField, index);
  const progress = [0.31, 0.45, 0.61, 0.79, 0.94, 1];

  const forward = new Map(progress.map((value) => [
    value,
    blended(from, to, paths, index, value, seeds[index * 4 + 2]),
  ]));
  for (const value of [...progress].reverse()) {
    assert.deepEqual(
      blended(from, to, paths, index, value, seeds[index * 4 + 2]),
      forward.get(value),
    );
  }
});

test('blend remains stable when the output aliases the source particle', () => {
  const fromField = createFolioField([desktopRects[0]], seeds, 1440, 1000);
  const toField = createFolioField(desktopRects, seeds, 1440, 1000);
  const paths = createFolioPaths(fromField, toField, seeds, 1440);
  const index = 4;
  const source = Float32Array.from(particle(fromField, index));
  const destination = particle(toField, index);
  const progress = 0.71;
  const expected = blended(source, destination, paths, index, progress, 0.2);
  const aliased = Float32Array.from(source);

  blendFolioParticle(aliased, destination, paths, index, progress, 0.2, aliased);

  assert.deepEqual(aliased, expected);
  assert.ok(everyFinite(aliased));
});

test('different release seeds create visible temporal separation', () => {
  const staggerSeeds = new Float32Array([
    0.2, 0.0, 0.2, 0.2,
    0.8, 1.0, 0.8, 0.8,
  ]);
  const from = new Float32Array([
    100, 200, 0, 0.2, 0.8,
    100, 200, 0, 0.2, 0.8,
  ]);
  const to = new Float32Array([
    700, 500, 0.5, 0.7, 1.0,
    700, 500, 0.5, 0.7, 1.0,
  ]);
  const paths = createFolioPaths(from, to, staggerSeeds, 1440);
  const progress = 0.46;
  const early = blended(particle(from, 0), particle(to, 0), paths, 0, progress);
  const late = blended(particle(from, 1), particle(to, 1), paths, 1, progress);

  assert.ok(distance(early, particle(from, 0)) > 0.1);
  assert.deepEqual(late, particle(from, 1));
});

test('reduced motion keeps scene 2 on its settled project field', () => {
  const context = sceneFixture({ reduced: true });
  const index = 42;
  const target = sceneTarget(context, 2, 0.45, index);

  assert.deepEqual(target, [100 + index * 2, 50 - index, 0, 0.24, 0.7]);
  assert.deepEqual(context.calls, [{ stage: 2, index, local: 0.45 }]);
});

test('scene 2 meets scene 3 continuously for ambient and transported grains', () => {
  const context = sceneFixture();
  const indexes = [0, 8, 9, 42, 99];

  for (const index of indexes) {
    const beforeBoundary = sceneTarget(context, 2, 0.999999, index);
    const atBoundary = sceneTarget(context, 3, 0, index);
    assertArrayClose(beforeBoundary, atBoundary, 1e-5);
  }
});
