import { ParticleExperience } from './particles.js';
import { createArticleReader } from './article-reader.js';

const root = document.documentElement;
const canvas = document.querySelector('#story-particles');
const panels = [...document.querySelectorAll('[data-panel]')];
const chapters = [...document.querySelectorAll('#story-navigation [data-scene]')];
const navigation = document.querySelector('#story-navigation');
const readout = document.querySelector('[data-depth-readout]');
const header = document.querySelector('.story-header');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
// Where each chapter is fully formed, and the end of the scroll track.
const stops = [0, 1.42, 2.46, 3.44, 4.6, 5.3];
const end = 5.82;
let experience, enhanced = false, target = 0, rendered = 0, velocity = 0, loop = 0, lastTick = 0;
let current = 0, resizing = 0, hashTimer = 0, pendingFocus = null, ready = false, lastDepth = '';
let resizeProgress = 0, resizeDestination = null;
let reader, suspended = false;
const homePath = location.pathname;

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smoother = (a, b, value) => { const t = clamp((value - a) / (b - a)); return t * t * t * (t * (t * 6 - 15) + 10); };
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const rect = selector => {
  const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!element) return null;
  const box = element.getBoundingClientRect();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
};
const rects = selector => [...document.querySelectorAll(selector)].map(rect).filter(Boolean);
/** Measure the DOM anchors the particles draw around (they only fade, never move). */
const layout = () => {
  const result = {
    code: rect('[data-particle-code] pre'), cursor: rect('[data-particle-cursor]'),
    widget: rect('[data-particle-widget]'), rule: rect('[data-particle-rule]'), status: rect('[data-particle-status]'),
    steps: rects('[data-particle-step]'), chips: rects('[data-particle-chip]'), buttons: rects('[data-particle-button]'),
    notes: rects('[data-particle-note]'), noteRules: rects('[data-particle-note-rule]'), noteDetails: rects('[data-particle-note-detail]'),
    nodes: rects('[data-particle-node]'),
    final: rect('[data-particle-final]'), finalButton: rect('[data-particle-final-button]'), finalIcon: rect('[data-particle-final-icon]'),
  };
  return result;
};
const hashScene = () => panels.findIndex(panel => '#' + panel.id === location.hash);
const sceneAt = value => clamp(Math.floor(value + 0.1), 0, panels.length - 1);

/** Apply one rendered progress value to the DOM and the particles. */
function apply(value) {
  const scene = sceneAt(value);
  const intro = value < 0.06;
  if (intro && (header.contains(document.activeElement) || navigation.contains(document.activeElement))) {
    const title = panels[0].querySelector('h1');
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
  }
  root.dataset.storyIntro = String(intro);
  for (const chrome of [header, navigation]) {
    chrome.inert = intro;
    chrome.setAttribute('aria-hidden', String(intro));
  }
  root.dataset.scene = String(scene);
  panels.forEach((panel, index) => {
    // The finale waits for the kingfisher to dive into the search pill before it appears.
    const last = index === panels.length - 1;
    const enter = index === 0 ? 1 : (motion.matches ? Number(index === scene) : smoother(index - (last ? -0.01 : 0.1), index + (last ? 0.17 : 0.12), value));
    const exit = index === panels.length - 1 ? 0 : (motion.matches ? Number(index !== scene) : smoother(index + 0.66, index + 0.82, value));
    const visible = enter > 0.001 && exit < 0.999;
    const accessible = index === scene;
    if (!accessible && panel.contains(document.activeElement)) {
      document.activeElement.blur();
      if (!intro) chapters[scene]?.focus({ preventScroll: true });
    }
    panel.style.setProperty('--in', enter.toFixed(4));
    panel.style.setProperty('--out', exit.toFixed(4));
    panel.classList.toggle('is-active', visible);
    panel.inert = !accessible;
    panel.setAttribute('aria-hidden', String(!accessible));
  });
  if (current !== scene || !ready) {
    current = scene;
    chapters.forEach((link, index) => index === scene ? link.setAttribute('aria-current', 'step') : link.removeAttribute('aria-current'));
  }
  const depth = `−${(value >= 5 ? 60 : Math.min(60, value * 12)).toFixed(1)}m`;
  if (readout && depth !== lastDepth) { readout.textContent = depth; lastDepth = depth; }
  if (pendingFocus === scene && Math.abs(value - stops[scene]) < 0.08) {
    const heading = panels[scene].querySelector('h1,h2');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    pendingFocus = null;
  }
  experience.setProgress(motion.matches ? stops[scene] : value);
  ready = true;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    if (!enhanced || suspended || location.pathname !== homePath) return;
    const hash = '#' + panels[current].id;
    if (location.hash !== hash && (current > 0 || location.hash)) window.history.replaceState(window.history.state, '', hash);
  }, 220);
}

function tick(now) {
  loop = 0;
  if (!enhanced || suspended || resizing) return;
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;
  if (motion.matches) {
    rendered = target;
    velocity = 0;
  } else {
    // Critically damped spring: silky under wheel steps, never overshoots a chapter.
    const omega = 11;
    const acceleration = -omega * omega * (rendered - target) - 2 * omega * velocity;
    velocity += acceleration * dt;
    rendered += velocity * dt;
    if (Math.abs(rendered - target) < 0.0003 && Math.abs(velocity) < 0.003) {
      rendered = target;
      velocity = 0;
    }
  }
  apply(rendered);
  if (rendered !== target || velocity !== 0) loop = requestAnimationFrame(tick);
}
function readScroll() {
  target = clamp(scrollY / maxScroll() * end, 0, end);
}
function requestUpdate() {
  if (!enhanced || suspended || resizing) return;
  readScroll();
  resizeDestination = null;
  if (!loop) {
    lastTick = performance.now();
    loop = requestAnimationFrame(tick);
  }
}
/** Jump without easing: deep links, history, resize and the reader's return. */
function settle() {
  readScroll();
  rendered = target;
  velocity = 0;
  cancelAnimationFrame(loop);
  loop = 0;
  apply(rendered);
}
function goToScene(scene, { history = true, focus = false, instant = false } = {}) {
  if (suspended || location.pathname !== homePath) return;
  scene = clamp(scene, 0, panels.length - 1);
  if (!enhanced) {
    panels[scene].scrollIntoView({ behavior: 'auto' });
    return;
  }
  clearTimeout(hashTimer);
  if (history && location.hash !== '#' + panels[scene].id) window.history.pushState({}, '', '#' + panels[scene].id);
  // Keep explicit navigation until the next settled frame: a resize event may
  // still be queued even if a rapid rotation returned to the original size.
  resizeDestination = stops[scene];
  pendingFocus = focus ? scene : null;
  scrollTo({ top: maxScroll() * stops[scene] / end, behavior: instant || motion.matches ? 'instant' : 'smooth' });
  if (instant || motion.matches) settle();
  else requestUpdate();
}
function fallback() {
  enhanced = false;
  window.history.scrollRestoration = 'auto';
  root.classList.remove('immersive-ready');
  delete root.dataset.storyIntro;
  for (const chrome of [header, navigation]) { chrome.inert = false; chrome.removeAttribute('aria-hidden'); }
  panels.forEach(panel => {
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    panel.style.removeProperty('--in');
    panel.style.removeProperty('--out');
    panel.classList.remove('is-active');
  });
  panels[current]?.scrollIntoView({ behavior: 'instant' });
}
function enhance() {
  const visible = panels.reduce((best, panel, index) => Math.abs(panel.getBoundingClientRect().top) < Math.abs(panels[best].getBoundingClientRect().top) ? index : best, 0);
  root.classList.add('immersive-ready');
  enhanced = true;
  window.history.scrollRestoration = 'manual';
  experience.resize(layout());
  scrollTo({ top: maxScroll() * stops[visible] / end, behavior: 'instant' });
  settle();
}

async function initialize() {
  if (!canvas || !panels.length) return;
  const initial = hashScene();
  if (initial >= 0) current = initial;
  try {
    // A delayed/failed font must never make the actual journal inaccessible.
    let timer;
    await Promise.race([
      Promise.all([document.fonts.load('500 38px Korean'), document.fonts.load('italic 18px Instrument')]),
      new Promise(resolve => { timer = setTimeout(resolve, 3500); }),
    ]).finally(() => clearTimeout(timer));
    root.classList.add('immersive-ready');
    experience = new ParticleExperience(canvas);
    experience.resize(layout());
    experience.setTheme(root.dataset.theme || 'ink');
    experience.setReducedMotion(motion.matches);
    if (experience.metrics.renderer === 'static') { fallback(); return; }
    enhanced = true;
    // Scene hashes own scroll position; browser pixel restoration can otherwise
    // override popstate while a native smooth scroll is still in flight.
    window.history.scrollRestoration = 'manual';
    experience.start();
    if (initial >= 0) goToScene(initial, { history: false, instant: true });
    else settle();
    reader = createArticleReader({
      engine: experience,
      getHomeState: () => ({ enhanced, progress: rendered, scene: current, url: new URL(homePath + '#' + panels[current].id, location.origin).href }),
      suspendHome(value) {
        suspended = value;
        clearTimeout(hashTimer);
        cancelAnimationFrame(loop);
        loop = 0;
      },
      restoreHome(record) {
        const scene = location.pathname === homePath ? Math.max(0, hashScene()) : record.scene;
        const destination = scene === record.scene ? record.progress : stops[scene];
        if (experience.metrics.renderer === 'static') { current = scene; fallback(); return; }
        experience.resize(layout());
        scrollTo({ top: maxScroll() * destination / end, behavior: 'instant' });
        settle();
      },
    });

    document.querySelectorAll('a[data-scene]').forEach(link => link.addEventListener('click', event => {
      if (!enhanced || suspended || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      goToScene(Number(link.dataset.scene), { focus: event.detail === 0 });
    }));
    addEventListener('scroll', requestUpdate, { passive: true });
    addEventListener('hashchange', () => { if (reader.active || reader.loading || location.pathname !== homePath) return; const scene = hashScene(); if (scene >= 0) goToScene(scene, { history: false, instant: true }); });
    addEventListener('popstate', () => { if (reader.active || reader.loading || location.pathname !== homePath) return; const scene = hashScene(); goToScene(scene >= 0 ? scene : 0, { history: false, instant: true }); });
    addEventListener('resize', () => {
      // Resize can clamp scrollY before its scroll event arrives. Keep the last
      // scene position until layout is rebuilt instead of treating that as input.
      clearTimeout(hashTimer);
      if (!resizing) resizeProgress = rendered;
      clearTimeout(resizing);
      resizing = setTimeout(() => {
        resizing = 0;
        const destination = resizeDestination ?? resizeProgress;
        resizeDestination = null;
        if (!enhanced) return;
        if (reader.active) { experience.resize(layout()); reader.resize(); return; }
        experience.resize(layout());
        scrollTo({ top: maxScroll() * destination / end, behavior: 'instant' });
        settle();
      }, 140);
    });
    document.fonts.ready.then(() => { if (enhanced) { experience.resize(layout()); if (reader.active) reader.resize(); else settle(); } });
    document.addEventListener('themechange', event => experience.setTheme(event.detail));
    const onMotion = () => { experience.setReducedMotion(motion.matches); settle(); };
    if (motion.addEventListener) motion.addEventListener('change', onMotion);
    else motion.addListener?.(onMotion);
    canvas.addEventListener('particlestatechange', () => {
      if (!experience) return;
      if (reader.active) { reader.resize(); return; }
      if (experience.metrics.renderer === 'static') fallback();
      else if (!enhanced) enhance();
    });
    addEventListener('pointermove', event => {
      if (suspended || event.pointerType === 'touch' || document.querySelector('dialog[open]')) return;
      experience.setPointer(event.clientX, event.clientY);
    }, { passive: true });
    addEventListener('pointerout', event => { if (!event.relatedTarget) experience.clearPointer(); }, { passive: true });
    addEventListener('pointerdown', event => {
      if (suspended || event.button !== 0 || event.target.closest('a,button,input,dialog')) return;
      experience.pulse(event.clientX, event.clientY, 1.1);
    }, { passive: true });
    addEventListener('pointerup', event => { if (event.pointerType === 'touch') experience.clearPointer(); }, { passive: true });
    // Hover and focus light up the particle drawing that frames the control.
    const bindHighlight = (element, name, events = ['pointerenter', 'pointerleave', 'focusin', 'focusout']) => {
      if (!element) return;
      const [on, off, focusOn, focusOff] = events;
      element.addEventListener(on, () => experience.setHighlight(name, 1));
      element.addEventListener(off, () => { if (!element.contains(document.activeElement)) experience.setHighlight(name, 0); });
      element.addEventListener(focusOn, () => experience.setHighlight(name, 1));
      element.addEventListener(focusOff, () => experience.setHighlight(name, 0));
    };
    bindHighlight(document.querySelector('[data-particle-final]'), 'pill');
    addEventListener('keydown', event => {
      if (!enhanced || suspended || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      if (event.target.isContentEditable || event.target.closest('input,textarea,select,button,a')) return;
      const destination = { ArrowDown: current + 1, PageDown: current + 1, ArrowUp: current - 1, PageUp: current - 1, Home: 0, End: 5 }[event.key];
      if (destination === undefined) return;
      event.preventDefault();
      goToScene(destination, { focus: true });
    });
    // Inspector only: no mutation API is exposed by the production page.
    Object.defineProperty(window, '__particleStory', { value: {
      get state() { return { ...experience.metrics, scene: current, progress: rendered, target, enhanced }; },
      sample() { return experience.sample(); },
    }, configurable: true });
  } catch (error) {
    experience?.destroy();
    fallback();
    console.warn('Particle scenes unavailable; the full journal remains readable.', error);
  }
}
initialize();
