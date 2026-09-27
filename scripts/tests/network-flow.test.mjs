import assert from 'node:assert/strict';
import test from 'node:test';

import { createFolioField, createFolioPaths } from '../../assets/js/particle-flow.js';
import { createNetworkField, createNetworkPaths } from '../../assets/js/network-flow.js';
import { ParticleExperience } from '../../assets/js/particles.js';

function makeSeeds(count) {
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const q = i * 4;
    seeds[q] = ((i * 37) % count + 0.5) / count;
    seeds[q + 1] = ((i * 53) % count + 0.5) / count;
    seeds[q + 2] = ((i * 71) % count + 0.5) / count;
    seeds[q + 3] = ((i * 19) % count + 0.5) / count;
  }
  return seeds;
}

function makeExperience({
  width = 1440,
  height = 1000,
  mobile = false,
  reduced = false,
  count = 256,
} = {}) {
  const experience = Object.create(ParticleExperience.prototype);
  Object.assign(experience, {
    width,
    height,
    mobile,
    reduced,
    count,
    time: 3210,
    temperature: 0.3,
    effort: 2,
    seed: makeSeeds(count),
  });

  const title = [];
  for (let i = 0; i < 512; i++) {
    const angle = i / 512 * Math.PI * 2;
    title.push(width * 0.5 + Math.cos(angle) * width * 0.12);
    title.push(height * 0.5 + Math.sin(angle) * height * 0.08);
  }
  experience.title = title;
  experience._buildTree();

  const project = mobile
    ? { x: width * 0.07, y: height * 0.48, width: width * 0.86, height: height * 0.26 }
    : { x: width * 0.49, y: height * 0.31, width: width * 0.42, height: height * 0.34 };
  const notes = mobile
    ? [
        { x: width * 0.07, y: height * 0.32, width: width * 0.86, height: height * 0.22 },
        { x: width * 0.07, y: height * 0.60, width: width * 0.86, height: height * 0.22 },
      ]
    : [
        { x: width * 0.17, y: height * 0.30, width: width * 0.29, height: height * 0.34 },
        { x: width * 0.55, y: height * 0.42, width: width * 0.29, height: height * 0.34 },
      ];
  experience.networkField = createNetworkField(experience.edges, experience.seed, width);
  experience.projectField = createFolioField([project], experience.seed, width, height);
  experience.networkPaths = createNetworkPaths(
    experience.networkField,
    experience.projectField,
    experience.edges,
    experience.seed,
    width,
  );
  experience.noteField = createFolioField(notes, experience.seed, width, height);
  experience.folioPaths = createFolioPaths(
    experience.projectField,
    experience.noteField,
    experience.seed,
    width,
  );
  return experience;
}

function everyFinite(values) {
  return Array.from(values).every(Number.isFinite);
}

function sceneTarget(experience, stage, local, index) {
  const target = [0, 0, 0, 0, 0];
  const next = [0, 0, 0, 0, 0];
  experience._sceneTarget(stage, local, index, target, next);
  return target;
}

function directTarget(experience, stage, local, index) {
  const target = [0, 0, 0, 0, 0];
  experience._target(stage, index, local, target);
  return target;
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

test('the actual tree builder creates bounded desktop and mobile branch structures', () => {
  const desktop = makeExperience();
  const desktopAgain = makeExperience();
  const mobile = makeExperience({ width: 390, height: 844, mobile: true });

  assert.equal(desktop.edges.length, 21);
  assert.equal(desktop.treeNodes.length, 22);
  assert.equal(mobile.edges.length, 9);
  assert.equal(mobile.treeNodes.length, 10);
  assert.deepEqual(desktop.edges, desktopAgain.edges);

  for (const [experience, deepest, expectedTips, minimumSpan] of [
    [desktop, 2, 12, desktop.height * 0.25],
    [mobile, 1, 6, mobile.height * 0.15],
  ]) {
    const tips = experience.edges.filter((edge) => edge.depth === deepest).map((edge) => edge.b);
    assert.equal(tips.length, expectedTips);
    assert.ok(tips.every((tip) => Math.abs(tip.x - experience.width * 0.91) < 1e-6));
    const ys = tips.map((tip) => tip.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > minimumSpan);
    assert.ok(ys.every((y) => y > 0 && y < experience.height));
  }
});

test('network fields and transition paths are deterministic and finite', () => {
  const desktop = makeExperience();
  const desktopAgain = makeExperience();
  const mobile = makeExperience({ width: 390, height: 844, mobile: true });

  assert.equal(desktop.networkField.length, desktop.count * 5);
  assert.equal(desktop.networkPaths.length, desktop.count * 4);
  assert.ok(everyFinite(desktop.networkField));
  assert.ok(everyFinite(desktop.networkPaths));
  assert.ok(everyFinite(mobile.networkField));
  assert.ok(everyFinite(mobile.networkPaths));
  assert.deepEqual(desktop.networkField, desktopAgain.networkField);
  assert.deepEqual(desktop.networkPaths, desktopAgain.networkPaths);
  assert.notDeepEqual(desktop.networkField, mobile.networkField);
});

test('the network field keeps a sparse, soft visible grain band', () => {
  const experience = makeExperience({ count: 512 });
  let visible = 0;
  let maximumAlpha = 0;
  for (let i = 0; i < experience.count; i++) {
    const alpha = experience.networkField[i * 5 + 3];
    if (alpha > 0) visible += 1;
    maximumAlpha = Math.max(maximumAlpha, alpha);
  }

  const visibleRatio = visible / experience.count;
  assert.ok(visibleRatio >= 0.28 && visibleRatio <= 0.35, `visible ratio was ${visibleRatio}`);
  assert.ok(maximumAlpha > 0.35 && maximumAlpha <= 0.5);
});

test('outer branch tips release before inner branch roots', () => {
  const experience = makeExperience({ count: 2 });
  const rootEdge = experience.edges.findIndex((edge) => edge.depth === 0);
  const outerEdge = experience.edges.findIndex((edge) => edge.depth === 2);
  const edgeCount = experience.edges.length;
  const releaseSeeds = new Float32Array([
    (rootEdge + 0.25) / edgeCount, 0, 0.1, 0.3,
    (outerEdge + 0.25) / edgeCount, 1, 0.1, 0.3,
  ]);
  const from = createNetworkField(experience.edges, releaseSeeds, experience.width);
  const to = createFolioField([
    { x: 700, y: 280, width: 520, height: 320 },
  ], releaseSeeds, experience.width, experience.height);
  const paths = createNetworkPaths(from, to, experience.edges, releaseSeeds, experience.width);

  const innerRootRelease = paths[2];
  const outerTipRelease = paths[6];
  assert.ok(outerTipRelease < innerRootRelease - 0.15);
});

test('scene boundaries are continuous for ambient and visible grains', () => {
  const experience = makeExperience();
  const firstVisible = Math.ceil(experience.count * 0.09);
  const indexes = [0, firstVisible - 1, firstVisible, firstVisible + 37, experience.count - 1];

  for (const index of indexes) {
    assertArrayClose(
      sceneTarget(experience, 0, 0.999999, index),
      sceneTarget(experience, 1, 0, index),
    );
    assertArrayClose(
      sceneTarget(experience, 1, 0.999999, index),
      sceneTarget(experience, 2, 0, index),
    );
  }
});

test('reduced motion keeps the 1.35 stop on the settled network field', () => {
  const experience = makeExperience({ reduced: true });
  const index = Math.ceil(experience.count * 0.09) + 21;

  assert.deepEqual(sceneTarget(experience, 1, 0.35, index), directTarget(experience, 1, 0.35, index));
  assert.deepEqual(sceneTarget(experience, 1, 0.82, index), directTarget(experience, 1, 0.82, index));
});

test('stage 1 targets stay continuous across the previous modulo wrap time', () => {
  const experience = makeExperience();
  const index = Math.ceil(experience.count * 0.09) + 13;
  const q = index * 4;
  const b = experience.seed[q + 1];
  const c = experience.seed[q + 2];
  const formerWrapTime = (1 - b) / (0.000006 * (0.4 + c));

  experience.time = formerWrapTime - 0.01;
  const before = directTarget(experience, 1, 0.2, index);
  experience.time = formerWrapTime + 0.01;
  const after = directTarget(experience, 1, 0.2, index);

  assert.ok(distance(before, after, 2) < 0.01, `target moved ${distance(before, after, 2)}px`);
});

test('stage 1 transport is progress-pure when sampled forward and backward', () => {
  const experience = makeExperience();
  const index = Math.ceil(experience.count * 0.09) + 44;
  const progress = [0.20, 0.41, 0.53, 0.68, 0.84, 0.97, 1];
  const forward = new Map(progress.map((value) => [value, sceneTarget(experience, 1, value, index)]));

  for (const value of [...progress].reverse()) {
    assert.deepEqual(sceneTarget(experience, 1, value, index), forward.get(value));
  }
});
