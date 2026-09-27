import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ParticleExperience } from '../../assets/js/particles.js';
import {
  CHAPTER_MOTION,
  blendChapterTransition,
  createChapterFlow,
  stepChapterProgress,
} from '../../assets/js/chapter-transition.js';

const STOPS = [0, 1.35, 2.45, 3.25, 4.55, 5.25];

export function fixture(Engine, width = 1440, height = 1000) {
  const engine = Object.create(Engine.prototype);
  const count = 128;
  const seed = new Float32Array(count * 4);
  let state = 55;
  for (let i = 0; i < seed.length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    seed[i] = state / 4294967296;
  }
  Object.assign(engine, {
    width, height, count, seed, mobile: width <= 700,
    time: 1543, reduced: false, effort: 2, temperature: 0.3,
    layout: { notes: [] }, progress: 0,
    first: true, theme: 'ink', pointer: { x: -2000, y: -2000 },
    focusFrame: null, focusAmount: 0, focusTarget: 0, waves: [],
    xyz: new Float32Array(count * 4), buffer: new Float32Array(count * 7),
    _makeTitle() { this.title = [100, 200, 110, 210, 120, 220]; },
    _wake() {},
  });
  engine._buildGeometry();
  return engine;
}

export function designHashes(engine) {
  const samples = [];
  for (const [stage, local] of [[1, 0.35], [2, 0.45], [3, 0.25]]) {
    for (const index of [0, 12, 23, 43, 61, 93, 127]) {
      const out = [0, 0, 0, 0, 0];
      engine._target(stage, index, local, out);
      samples.push(out);
    }
  }
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return { geometry: hash([engine.edges, engine.projectPoints, engine.notePoints]), targets: hash(samples) };
}

// Captured from 3adaff2, before the two rejected chapter redesigns.
const BASELINE = {
  desktop: { geometry: '29c81bbfc973d0115abb08e284cd6bd0b3741debb3149c2c74debff30d173628', targets: 'a028fd3c16775f30ed1b3e3282b33ff1689d267b8da0d3b479b89e222f1c64f3' },
  mobile: { geometry: '65ed6d3384fb1e47a2d7d5545eeacc10a6c4fa197df6a35ea16ec2628fb4668e', targets: '5de0caf8028e56e10880a08bec3f583c287fcd840d52cc98fc17be758c8f3ce8' },
};

const close = (actual, expected, epsilon = 1e-5) => actual.forEach((value, index) => {
  assert.ok(Math.abs(value - expected[index]) <= epsilon, `channel ${index}: ${value} != ${expected[index]}`);
});

const rawTarget = (engine, stage, local, index) => {
  const out = [0, 0, 0, 0, 0];
  engine._target(stage, index, local, out);
  return out;
};

const sceneTarget = (engine, progress, index) => {
  const stage = Math.min(5, Math.floor(progress));
  const local = progress - stage;
  const out = [0, 0, 0, 0, 0];
  engine._sceneTarget(stage, local, index, out, [0, 0, 0, 0, 0]);
  return out;
};

const sortedTargetMultiset = targets => targets
  .map(target => target.map(value => Number(value.toFixed(7))).join(','))
  .sort();

const fullRawTargets = (engine, progress) => {
  const stage = Math.min(5, Math.floor(progress));
  const local = progress - stage;
  return Array.from({ length: engine.count }, (_, index) => rawTarget(engine, stage, local, index));
};

const fullSceneTargets = (engine, progress) => Array.from(
  { length: engine.count },
  (_, index) => sceneTarget(engine, progress, index),
);

const renderedEnergy = engine => {
  let energy = 0;
  let visible = 0;
  for (let index = Math.ceil(engine.count * .09); index < engine.count; index += 1) {
    const offset = index * 7;
    const size = engine.buffer[offset + 2];
    const alpha = engine.buffer[offset + 6];
    energy += alpha * size * size;
    if (alpha > 0.05) visible += 1;
  }
  return { energy, visible };
};

const setRenderedProgress = (engine, progress) => {
  engine.progress = progress;
};

test('settled desktop and mobile designs preserve the original geometry and complete target sets', () => {
  for (const [key, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const engine = fixture(ParticleExperience, width, height);
    assert.deepEqual(designHashes(engine), BASELINE[key]);
    assert.equal(engine.edges.length, 45);
    for (const progress of STOPS) {
      assert.deepEqual(
        sortedTargetMultiset(fullSceneTargets(engine, progress)),
        sortedTargetMultiset(fullRawTargets(engine, progress)),
        `${key} chapter at ${progress} changed its settled design`,
      );
    }
  }
});

test('flow coefficients are deterministic, finite, and sized for every particle', () => {
  const engine = fixture(ParticleExperience);
  const from = fullRawTargets(engine, 1.55).flat();
  const to = fullRawTargets(engine, 2.16).flat();
  const a = createChapterFlow(engine.seed, 1440, 1000, from, to, 1);
  const b = createChapterFlow(engine.seed, 1440, 1000, from, to, 1);
  assert.equal(a.length, engine.count * 8);
  assert.deepEqual(a, b);
  assert.ok([...a].every(Number.isFinite));
});

test('transition endpoints are exact and source/output aliasing is safe', () => {
  const engine = fixture(ParticleExperience);
  const from = [100, 200, 0.8, 0.6, 1];
  const to = [800, 500, 0, 0.7, 0.8];
  const flow = createChapterFlow(engine.seed.slice(0, 4), 1440, 1000, from, to, 0);
  for (const progress of [0, 0.2, 0.55, 0.82, 1]) {
    const expected = [];
    const aliased = [...from];
    blendChapterTransition(from, to, flow, 0, progress, expected);
    blendChapterTransition(aliased, to, flow, 0, progress, aliased);
    assert.deepEqual(aliased, expected);
    if (progress === 0) assert.deepEqual(expected, from);
    if (progress === 1) assert.deepEqual(expected, to);
    assert.ok(expected.every(Number.isFinite));
  }
});

test('all five chapter paths are continuous at their start, boundary, and end', () => {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const engine = fixture(ParticleExperience, width, height);
    for (let chapter = 0; chapter < 5; chapter += 1) {
      const start = chapter + CHAPTER_MOTION.start;
      const boundary = chapter + 1;
      const end = chapter + CHAPTER_MOTION.end;
      for (const index of [0, 12, 34, 93, 127]) {
        close(sceneTarget(engine, start - 1e-7, index), sceneTarget(engine, start + 1e-7, index), 1e-3);
        close(sceneTarget(engine, boundary - 1e-7, index), sceneTarget(engine, boundary + 1e-7, index), 1e-3);
        close(sceneTarget(engine, end - 1e-7, index), sceneTarget(engine, end + 1e-7, index), 1e-3);
      }
    }
  }
});

test('equal progress yields identical targets while scrolling forward and backward', () => {
  const engine = fixture(ParticleExperience);
  const progressValues = [];
  for (let chapter = 0; chapter < 5; chapter += 1) {
    for (const amount of [0, 0.17, 0.5, 0.83, 1]) {
      progressValues.push(chapter + CHAPTER_MOTION.start + (CHAPTER_MOTION.end - CHAPTER_MOTION.start) * amount);
    }
  }
  const forward = progressValues.map(progress => sceneTarget(engine, progress, 42));
  progressValues.reverse().forEach((progress, index) => {
    assert.deepEqual(sceneTarget(engine, progress, 42), forward.at(-(index + 1)));
  });
});

test('reduced motion bypasses every transient chapter path', () => {
  const engine = fixture(ParticleExperience);
  engine.reduced = true;
  for (let stage = 0; stage < 5; stage += 1) {
    for (const local of [CHAPTER_MOTION.start, 0.72, 0.99]) {
      for (const index of [0, 42, 127]) {
        close(sceneTarget(engine, stage + local, index), rawTarget(engine, stage, local, index));
      }
    }
  }
});

test('chapter progress follows both directions monotonically without overshoot', () => {
  for (const [from, to] of [[0, 5.25], [5.25, 0]]) {
    let current = from;
    for (let frame = 0; frame < 600 && current !== to; frame += 1) {
      const next = stepChapterProgress(current, to, 16.667);
      assert.ok(Number.isFinite(next));
      if (to > from) assert.ok(next >= current && next <= to);
      else assert.ok(next <= current && next >= to);
      current = next;
    }
    assert.ok(Math.abs(current - to) < 1e-3, `${from} did not settle at ${to}: ${current}`);
  }
});

test('sequential updates keep finite, visible particles through every boundary in both directions', () => {
  for (const [direction, width, height] of [[1, 1440, 1000], [-1, 1440, 1000], [1, 390, 844], [-1, 390, 844]]) {
    const engine = fixture(ParticleExperience, width, height);
    const chapters = direction > 0 ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    for (const chapter of chapters) {
      const start = chapter + CHAPTER_MOTION.start;
      const end = chapter + CHAPTER_MOTION.end;
      const origin = direction > 0 ? start : end;
      const destination = direction > 0 ? end : start;
      setRenderedProgress(engine, origin);
      engine._snapToTargets(false);
      const endpointEnergy = renderedEnergy(engine).energy;
      let minimumEnergy = Infinity;
      let minimumVisible = Infinity;
      let progress = origin;
      for (let frame = 0; frame < 180 && progress !== destination; frame += 1) {
        progress = stepChapterProgress(progress, destination, 16.667);
        engine.setProgress(progress);
        engine.time += 16.667;
        engine._update(1);
        assert.ok([...engine.xyz, ...engine.buffer].every(Number.isFinite), `non-finite buffer at ${progress}`);
        const { energy, visible } = renderedEnergy(engine);
        minimumEnergy = Math.min(minimumEnergy, energy);
        minimumVisible = Math.min(minimumVisible, visible);
      }
      assert.ok(minimumEnergy >= endpointEnergy * 0.22, `chapter ${chapter} ${direction > 0 ? 'forward' : 'reverse'} energy collapsed to ${minimumEnergy}/${endpointEnergy}`);
      assert.ok(minimumVisible >= Math.floor(engine.count * 0.12), `chapter ${chapter} ${direction > 0 ? 'forward' : 'reverse'} retained only ${minimumVisible} visible particles`);
    }
  }
});

test('rendering preserves semantic alpha even while a particle position lags', () => {
  const engine = fixture(ParticleExperience);
  const target = [800, 500, 0, 0.7, 1];
  for (const progress of [0.8, 1.8, 2.8, 3.8, 4.8, 5.25]) {
    setRenderedProgress(engine, progress);
    engine._writeBuffer(42, 40, 20, target);
    assert.ok(Math.abs(engine.buffer[42 * 7 + 6] - target[3]) < 1e-6);
    assert.equal(target[3], 0.7);
  }
});

test('static drawing and snapping use the same chapter targets', () => {
  const engine = fixture(ParticleExperience);
  engine._draw = () => {};
  let written = [];
  engine._writeBuffer = (index, x, y, target) => written.push([x, y, ...target.slice(2)]);
  for (const progress of [0.80, 1.80, 2.80, 3.80, 4.80]) {
    setRenderedProgress(engine, progress);
    written = [];
    engine._snapToTargets();
    const expected = written.map(value => [...value]);
    written = [];
    engine._renderStatic();
    written.forEach((value, index) => close(value, expected[index], 1e-4));
  }
});
