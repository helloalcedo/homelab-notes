import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ParticleExperience } from '../../assets/js/particles.js';
import { createChapterScatter, blendChapterTransition, chapterArrivalScale } from '../../assets/js/chapter-transition.js';

export function fixture(Engine, width = 1440, height = 1000) {
  const engine = Object.create(Engine.prototype);
  const count = 128, seed = new Float32Array(count * 4);
  let state = 55;
  for (let i = 0; i < seed.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    seed[i] = state / 4294967296;
  }
  Object.assign(engine, { width, height, count, seed, mobile: width <= 700,
    time: 1543, reduced: false, effort: 2, temperature: .3, layout: { notes: [] },
    _makeTitle() { this.title = [100, 200, 110, 210, 120, 220]; },
  });
  engine._buildGeometry();
  return engine;
}

export function designHashes(engine) {
  const samples = [];
  for (const [stage, local] of [[1, .35], [2, .45], [3, .25]]) {
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
const sample = (engine, stage, local, index) => {
  const out = [0, 0, 0, 0, 0];
  engine._sceneTarget(stage, local, index, out, [0, 0, 0, 0, 0]);
  return out;
};
const close = (a, b, epsilon = 1e-5) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= epsilon, `channel ${i}: ${v} != ${b[i]}`));

test('settled desktop and mobile designs match the original geometry and targets', () => {
  for (const [key, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    const engine = fixture(ParticleExperience, width, height);
    assert.deepEqual(designHashes(engine), BASELINE[key]);
    assert.equal(engine.edges.length, 45);
    for (const [stage, local] of [[1, .35], [2, .45], [3, .25]]) {
      for (const index of [0, 12, 61, 127]) {
        const raw = [0, 0, 0, 0, 0];
        engine._target(stage, index, local, raw);
        assert.deepEqual(sample(engine, stage, local, index), raw);
      }
    }
  }
});

test('scatter is deterministic, finite, and scaled to the viewport', () => {
  const engine = fixture(ParticleExperience);
  const a = createChapterScatter(engine.seed, 1440, 1000);
  assert.deepEqual(a, createChapterScatter(engine.seed, 1440, 1000));
  assert.ok([...a].every(Number.isFinite));
  const mobile = createChapterScatter(engine.seed, 320, 568);
  assert.ok([...mobile].every(Number.isFinite));
  for (let i = 0; i < engine.count; i++) {
    const k = i * 6;
    assert.ok(Math.hypot(mobile[k], mobile[k + 1]) < Math.hypot(a[k], a[k + 1]));
  }
});

test('individual grains diffuse in place before any destination translation', () => {
  const engine = fixture(ParticleExperience);
  const from = [100, 200, .8, .6, 1];
  for (const i of [12, 40, 98, 127]) {
    const k = i * 6, delay = engine.chapterScatter[k + 4];
    const a = [], b = [];
    const progress = delay + .27;
    blendChapterTransition(from, [800, 500, 0, .7, .8], engine.chapterScatter, i, progress, a);
    blendChapterTransition(from, [-900, -300, 0, .7, .8], engine.chapterScatter, i, progress, b);
    close(a, b); // Destination cannot influence the release phase.
    close(a.slice(0, 2), [from[0] + engine.chapterScatter[k], from[1] + engine.chapterScatter[k + 1]]);
    assert.ok(a[3] <= .14 && a[3] > 0);
    assert.equal(a[2], 0);
  }
});

test('transition endpoints are exact and source/output aliasing is safe', () => {
  const engine = fixture(ParticleExperience);
  const from = [100, 200, .8, .6, 1], to = [800, 500, 0, .7, .8];
  for (const progress of [0, .2, .55, .82, 1]) {
    const expected = [], aliased = [...from];
    blendChapterTransition(from, to, engine.chapterScatter, 42, progress, expected);
    blendChapterTransition(aliased, to, engine.chapterScatter, 42, progress, aliased);
    assert.deepEqual(aliased, expected);
    if (progress === 0) assert.deepEqual(expected, from);
    if (progress === 1) assert.deepEqual(expected, to);
  }
});

test('0→1, 1→2 and 2→3 boundaries preserve position and destination alpha', () => {
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    const engine = fixture(ParticleExperience, width, height);
    for (const stage of [0, 1, 2]) {
      for (const index of [0, 12, 34, 93, 127]) {
        close(sample(engine, stage, 1 - 1e-7, index), sample(engine, stage + 1, 0, index));
      }
    }
    assert.equal(sample(engine, 1, 1, 42)[3], 0); // Original project entry reveal.
    assert.ok(sample(engine, 2, 1, 42)[3] > .45);
  }
});

test('reduced motion bypasses transient offsets and keeps each original chapter', () => {
  const engine = fixture(ParticleExperience);
  engine.reduced = true;
  for (const stage of [1, 2]) {
    for (const local of [.35, .45, .70, .90]) {
      const raw = [];
      engine._target(stage, 42, local, raw);
      assert.deepEqual(sample(engine, stage, local, 42), raw);
    }
  }
});

test('forward and reverse scroll use identical targets at equal progress and time', () => {
  const engine = fixture(ParticleExperience);
  const values = [.50, .58, .68, .79, .94, 1];
  for (const stage of [1, 2]) {
    const forward = values.map(p => sample(engine, stage, p, 42));
    for (let i = values.length - 1; i >= 0; i--) assert.deepEqual(sample(engine, stage, values[i], 42), forward[i]);
  }
});

test('static drawing and snapping use the same chapter transition targets', () => {
  const engine = fixture(ParticleExperience);
  engine.xyz = new Float32Array(engine.count * 4);
  engine._draw = () => {};
  let written = [];
  engine._writeBuffer = (i, x, y, target) => written.push([x, y, ...target.slice(2)]);
  for (const progress of [1.75, 2.80]) {
    engine.progress = progress;
    written = [];
    engine._snapToTargets();
    const expected = written.map(a => [...a]);
    written = [];
    engine._renderStatic();
    written.forEach((v, i) => close(v, expected[i], 1e-4));
  }
});

test('fast chapter jumps keep moving outlines faint until their rendered positions arrive', () => {
  const engine = fixture(ParticleExperience);
  engine.buffer = new Float32Array(engine.count * 7);
  engine.theme = 'ink';
  engine.focusAmount = 0;
  const index = 42, target = [800, 500, 0, .7, 1];
  for (const progress of [2.45, 2.86, 3.25]) {
    engine.progress = progress;
    engine._writeBuffer(index, 400, 200, target);
    assert.ok(engine.buffer[index * 7 + 6] < .03);
    engine._writeBuffer(index, target[0], target[1], target);
    assert.ok(Math.abs(engine.buffer[index * 7 + 6] - target[3]) < 1e-6);
    assert.equal(target[3], .7); // Rendering never mutates the semantic target.
  }
  for (const progress of [0, 1.35, 3.6, 4.55, 5.25]) {
    engine.progress = progress;
    engine._writeBuffer(index, 400, 200, target);
    assert.ok(Math.abs(engine.buffer[index * 7 + 6] - .7) < 1e-6);
  }
  engine.progress = 3.25;
  engine.reduced = true;
  engine._writeBuffer(index, 400, 200, target);
  assert.ok(Math.abs(engine.buffer[index * 7 + 6] - .7) < 1e-6);
  engine.reduced = false;
  engine._wake = () => {};
  engine.progress = 2.45;
  engine.setProgress(1.35);
  engine._writeBuffer(index, 400, 200, target);
  assert.ok(engine.buffer[index * 7 + 6] < .03);
  engine._writeBuffer(index, target[0], target[1], target);
  assert.ok(Math.abs(engine.buffer[index * 7 + 6] - .7) < 1e-6);
  engine.time += 801;
  engine._writeBuffer(index, 400, 200, target);
  assert.ok(Math.abs(engine.buffer[index * 7 + 6] - .7) < 1e-6);
  for (const mobile of [true, false]) {
    const scales = [100, 20, 10, 2, 0].map(d => chapterArrivalScale(d, 0, .5, mobile));
    assert.equal(scales.at(-1), 1);
    scales.forEach((v, i) => { if (i) assert.ok(v >= scales[i - 1]); });
    assert.equal(chapterArrivalScale(20, 10, .5, mobile), chapterArrivalScale(-20, -10, .5, mobile));
  }
});
