import { READER_MOTION, smoother } from './reader-motion.js';
import { TAU, clamp01, ease, flightOffset, mix, randomGenerator, rankMatch } from './morph.js';
import { buildStory } from './scenes/story.js';
import { DIVE, buildCompanion, buildSurface, descent, surfaceLayout } from './scenes/kingfisher.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (from, to, value) => {
  const amount = clamp((value - from) / (to - from));
  return amount * amount * (3 - 2 * amount);
};

// Palette by scene colour id: fg, accent, flash, muted, faint, bark.
const PALETTES = {
  ink: [[0.91, 0.902, 0.863], [0.86, 0.52, 0.4], [0.3, 0.77, 0.91], [0.64, 0.631, 0.6], [0.44, 0.43, 0.4], [0.55, 0.43, 0.33]],
  paper: [[0.141, 0.141, 0.125], [0.6, 0.318, 0.224], [0.067, 0.463, 0.604], [0.39, 0.38, 0.345], [0.56, 0.545, 0.5], [0.4, 0.3, 0.22]],
};
const DUST_SHARE = 0.09;
const BIRD_SHARE = 0.14;
const TRANSITION_START = 0.72;
const MAX_DELAY = 0.3;
const SIZE = 1.5;

function copyRect(rect, canvasRect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: (rect.x ?? rect.left) - canvasRect.left,
    y: (rect.y ?? rect.top) - canvasRect.top,
    width: rect.width,
    height: rect.height,
  };
}

function updateRect(target, rect, canvasRect) {
  if (!target || !rect || rect.width <= 0 || rect.height <= 0) return false;
  target.x = (rect.x ?? rect.left) - canvasRect.left;
  target.y = (rect.y ?? rect.top) - canvasRect.top;
  target.width = rect.width;
  target.height = rect.height;
  return true;
}

function spreadMortonBits(value) {
  let bits = value & 1023;
  bits = (bits | (bits << 16)) & 0x030000ff;
  bits = (bits | (bits << 8)) & 0x0300f00f;
  bits = (bits | (bits << 4)) & 0x030c30c3;
  bits = (bits | (bits << 2)) & 0x09249249;
  return bits;
}

function mortonCode(x, y, minX, minY, spanX, spanY) {
  const nx = Math.round(clamp((x - minX) / spanX) * 1023);
  const ny = Math.round(clamp((y - minY) / spanY) * 1023);
  return spreadMortonBits(nx) | (spreadMortonBits(ny) << 1);
}

/**
 * One persistent particle pool that draws every visual on the home page: the Alcedo title
 * over its pond, the five chapters below the surface, and the companion kingfisher that
 * follows the reader through them. Scene modules supply poses; this engine owns slots,
 * transitions, interaction, rendering and the reader morphs.
 */
export class ParticleExperience {
  constructor(canvas, { scenes = true } = {}) {
    if (!canvas?.getContext) throw new TypeError('ParticleExperience requires a canvas.');
    this.canvas = canvas;
    this.parent = canvas.parentElement;
    this.useScenes = scenes;
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.mobile = false;
    this.progress = 0;
    this.theme = 'ink';
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pointer = { x: -2000, y: -2000 };
    this.waves = [];
    this.time = 0;
    this.last = performance.now();
    this.frames = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.raf = 0;
    this.wantsToRun = false;
    this.visible = !document.hidden;
    this.contextLost = false;
    this.destroyed = false;
    this.ready = false;
    this.renderer = 'static';
    this.poolVersion = 0;
    this.layout = {};
    this.documentMorph = null;
    this.pageTurn = null;
    this.highlight = { pill: 0, widget: 0, note0: 0, note1: 0 };
    this.highlightTarget = { ...this.highlight };
    this.reflection = { waterY: 0, alpha: 0 };
    this.scenes = null;
    this.ctx = { time: 0, seed: null, palette: PALETTES.ink, pointer: this.pointer, highlight: this.highlight };
    this._a = new Float32Array(7);
    this._b = new Float32Array(7);
    this._o = new Float32Array(7);
    this._offset = [0, 0];
    this.frame = this.frame.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._onContextLost = this._onContextLost.bind(this);
    this._onContextRestored = this._onContextRestored.bind(this);
    this._onMotion = event => this.setReducedMotion(event.matches);

    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this._setupRenderer();
    this.canvas.addEventListener('webglcontextlost', this._onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this._onContextRestored);
    document.addEventListener('visibilitychange', this._onVisibility);
    if (this.motionQuery.addEventListener) this.motionQuery.addEventListener('change', this._onMotion);
    else this.motionQuery.addListener?.(this._onMotion);

    this.resize();
    queueMicrotask(() => { if (!this.destroyed) this._dispatchState(); });
  }

  get metrics() {
    return {
      scene: Math.min(5, Math.floor(this.progress)),
      progress: this.progress,
      renderer: this.renderer,
      count: this.count || 0,
      running: Boolean(this.raf),
      reduced: this.reduced,
      fps: this.fps,
      poolVersion: this.poolVersion,
      documentMorph: this.documentMorph ? this.documentMorph.amount : null,
      pageTurn: this.pageTurn ? this.pageTurn.amount : null,
      documentGlyphs: this.documentMorph?.glyphCount || 0,
      pageGlyphs: this.pageTurn ? {
        from: this.pageTurn.fromGlyphCount || 0,
        to: this.pageTurn.toGlyphCount || 0,
      } : null,
    };
  }

  resize(layout = this.rawLayout || {}) {
    if (this.destroyed) return this;
    this.rawLayout = layout;
    const previousWidth = this.width;
    const previousHeight = this.height;
    const canvasRect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, canvasRect.width || innerWidth);
    const height = Math.max(1, canvasRect.height || innerHeight);
    const mobile = width <= 700;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const breakpointChanged = !this.count || mobile !== this.mobile;
    this.width = width;
    this.height = height;
    this.mobile = mobile;
    this.dpr = dpr;
    if (this.documentMorph && previousWidth > 0 && previousHeight > 0) {
      const scaleX = width / previousWidth;
      const scaleY = height / previousHeight;
      for (const rect of [this.documentMorph.sourceRect, this.documentMorph.expandedRect]) {
        if (!rect) continue;
        rect.x *= scaleX;
        rect.y *= scaleY;
        rect.width *= scaleX;
        rect.height *= scaleY;
      }
    }
    if (this.pageTurn && previousWidth > 0 && previousHeight > 0) {
      const scaleX = width / previousWidth;
      const scaleY = height / previousHeight;
      this.pageTurn.rect.x *= scaleX;
      this.pageTurn.rect.y *= scaleY;
      this.pageTurn.rect.width *= scaleX;
      this.pageTurn.rect.height *= scaleY;
    }
    this.layout = {};
    for (const [key, value] of Object.entries(layout || {})) {
      this.layout[key] = Array.isArray(value) ? value.map(rect => copyRect(rect, canvasRect)).filter(Boolean) : copyRect(value, canvasRect);
    }

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== pixelWidth) this.canvas.width = pixelWidth;
    if (this.canvas.height !== pixelHeight) this.canvas.height = pixelHeight;
    if (this.gl && !this.contextLost) {
      this.gl.viewport(0, 0, pixelWidth, pixelHeight);
      this.gl.useProgram(this.program);
      this.gl.uniform2f(this.uniforms.resolution, width, height);
      this.gl.uniform1f(this.uniforms.ratio, dpr);
    } else if (this.ctx2d) {
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (breakpointChanged) this._allocatePool();
    this._buildGeometry();
    if (this.documentMorph) {
      this._snapToTargets();
      this._captureDocumentMorph();
    } else if (this.pageTurn) this._snapToTargets();
    if (this.documentMorph) this._refreshDocumentGlyphTargets();
    if (this.pageTurn) this._refreshPageGlyphTargets();
    if (this.pageTurn) this._renderPageTurn();
    else if (this.documentMorph) this._renderDocumentMorph();
    else if (this.reduced || !this.wantsToRun) this._snapToTargets();
    else this._wake();
    return this;
  }

  setProgress(value) {
    this.progress = clamp(Number(value) || 0, 0, 5.82);
    if (this.pageTurn) this._renderPageTurn();
    else if (this.documentMorph) this._renderDocumentMorph();
    else if (this.reduced) this._snapToTargets();
    else this._wake();
    return this;
  }

  setTheme(theme = 'ink') {
    this.theme = theme === 'paper' ? 'paper' : 'ink';
    this.ctx.palette = PALETTES[this.theme];
    if (this.pageTurn) this._renderPageTurn();
    else if (this.documentMorph) this._renderDocumentMorph();
    else if (this.reduced || !this.raf) this._snapToTargets();
    else this._wake();
    return this;
  }

  setReducedMotion(value) {
    this.reduced = Boolean(value);
    this._cancelFrame();
    this.waves.length = 0;
    this.last = performance.now();
    if (this.pageTurn) this._renderPageTurn();
    else if (this.documentMorph) this._renderDocumentMorph();
    else if (this.reduced) this._snapToTargets();
    else this._wake();
    return this;
  }

  /** Ease a named interactive state (hovered widget, focused search) between 0 and 1. */
  setHighlight(name, value) {
    if (!(name in this.highlightTarget)) return this;
    this.highlightTarget[name] = clamp(Number(value) || 0);
    if (this.reduced) {
      this.highlight[name] = this.highlightTarget[name];
      this._snapToTargets();
    } else this._wake();
    return this;
  }

  setPointer(x, y) {
    this.pointer.x = x;
    this.pointer.y = y;
    if (!this.reduced) this._wake();
    return this;
  }

  clearPointer() {
    this.pointer.x = -2000;
    this.pointer.y = -2000;
    if (!this.reduced) this._wake();
    return this;
  }

  pulse(x = this.width / 2, y = this.height / 2, strength = 1) {
    if (this.documentMorph || this.pageTurn || this.reduced) return this;
    this.waves.push({ x, y, start: this.time, strength });
    if (this.waves.length > 8) this.waves.shift();
    this._wake();
    return this;
  }

  burst() {
    if (this.documentMorph || this.pageTurn || this.reduced || !this.disp) return this;
    for (let i = 0; i < this.count; i += 1) {
      const q = i * 4;
      const angle = this.seed[q] * TAU;
      const speed = 6 + this.seed[q + 1] * 18;
      this.disp[q + 2] += Math.cos(angle) * speed;
      this.disp[q + 3] += Math.sin(angle) * speed;
    }
    this._wake();
    return this;
  }

  start() {
    if (this.destroyed) return this;
    this.wantsToRun = true;
    this.last = performance.now();
    if (this.pageTurn) this._renderPageTurn();
    else if (this.documentMorph) this._renderDocumentMorph();
    else if (this.reduced) this._snapToTargets();
    else this._wake();
    return this;
  }

  pause() {
    this.wantsToRun = false;
    this._cancelFrame();
    return this;
  }

  /** Freeze the current home-stage particles before they form readable glyphs. */
  beginDocumentMorph(sourceRect) {
    if (this.destroyed) return this;
    const rect = copyRect(sourceRect, this.canvas.getBoundingClientRect());
    if (!rect) return this;
    if (this.pageTurn) this.endPageTurn();
    if (this.documentMorph) this.endDocumentMorph();
    this._cancelFrame();
    this.documentMorph = {
      amount: 0,
      sourceRect: rect,
      expandedRect: { ...rect },
      captured: null,
      glyphs: null,
      glyphTargets: null,
      glyphCurve: null,
      glyphCount: 0,
    };
    this._captureDocumentMorph();
    this._renderDocumentMorph();
    this._dispatchState();
    return this;
  }

  /** Set the sampled glyph target for the current document transition. */
  setDocumentGlyphs(glyphs) {
    if (!this.documentMorph || this.destroyed) return this;
    this.documentMorph.glyphs = glyphs || null;
    this._refreshDocumentGlyphTargets();
    this._renderDocumentMorph();
    return this;
  }

  /** Render one synchronous frame of the home-to-reader glyph transition. */
  setDocumentMorph(amount, expandedRect, sourceRect) {
    const morph = this.documentMorph;
    if (!morph || this.destroyed) return this;
    const canvasRect = this.canvas.getBoundingClientRect();
    updateRect(morph.expandedRect, expandedRect, canvasRect);
    updateRect(morph.sourceRect, sourceRect, canvasRect);
    morph.amount = clamp(Number(amount) || 0);
    this._renderDocumentMorph();
    return this;
  }

  /** Restore the scroll scene and its original run state after the reverse morph. */
  endDocumentMorph() {
    if (!this.documentMorph) return this;
    this.pageTurn = null;
    this.documentMorph = null;
    this.last = performance.now();
    this._snapToTargets();
    if (this.wantsToRun && !this.reduced) this._wake();
    this._dispatchState();
    return this;
  }

  /** Begin a controller-driven glyph-to-glyph transition over the reader. */
  beginPageTurn(rect, direction = 1, fromGlyphs = null, toGlyphs = null) {
    if (this.destroyed) return this;
    const localRect = copyRect(rect, this.canvas.getBoundingClientRect());
    if (!localRect) return this;
    if (this.pageTurn) this.endPageTurn();
    this._cancelFrame();
    this.pageTurn = {
      amount: 0,
      direction: Number(direction) < 0 ? -1 : 1,
      rect: localRect,
      fromGlyphs,
      toGlyphs,
      fromTargets: null,
      toTargets: null,
      curve: null,
      fromGlyphCount: 0,
      toGlyphCount: 0,
    };
    this._refreshPageGlyphTargets();
    this._renderPageTurn();
    this._dispatchState();
    return this;
  }

  /** Render one synchronous page-turn frame. The controller supplies 0..1. */
  setPageTurn(amount, rect) {
    if (!this.pageTurn || this.destroyed) return this;
    updateRect(this.pageTurn.rect, rect, this.canvas.getBoundingClientRect());
    this.pageTurn.amount = clamp(Number(amount) || 0);
    this._renderPageTurn();
    return this;
  }

  /** Replace page glyph samples after layout, viewport, or theme changes. */
  setPageGlyphs(fromGlyphs, toGlyphs) {
    if (!this.pageTurn || this.destroyed) return this;
    this.pageTurn.fromGlyphs = fromGlyphs || null;
    this.pageTurn.toGlyphs = toGlyphs || null;
    this._refreshPageGlyphTargets();
    this._renderPageTurn();
    return this;
  }

  /** Restore the hidden reader particle state, or the standalone home stage. */
  endPageTurn() {
    if (!this.pageTurn) return this;
    this.pageTurn = null;
    this.last = performance.now();
    if (this.documentMorph) this._renderDocumentMorph();
    else {
      this._snapToTargets();
      if (this.wantsToRun && !this.reduced) this._wake();
    }
    this._dispatchState();
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.wantsToRun = false;
    this.documentMorph = null;
    this.pageTurn = null;
    this._cancelFrame();
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this._onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
    this.motionQuery.removeEventListener?.('change', this._onMotion);
    this.motionQuery.removeListener?.(this._onMotion);
    if (this.gl) {
      if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.canvas.removeAttribute('data-ready');
    this.parent?.classList.remove('is-ready');
  }

  sample() {
    return Array.from(this.xyz?.slice(0, 40) || []);
  }

  _setupRenderer() {
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
      });
    } catch { /* readable HTML fallback remains */ }
    if (gl) {
      try {
        this.gl = gl;
        this._createWebGLResources();
        this.renderer = 'webgl';
        return;
      } catch (error) {
        console.warn('Particle WebGL setup failed.', error);
        this.gl = null;
      }
    }
    try { this.ctx2d = this.canvas.getContext('2d', { alpha: true }); }
    catch { this.ctx2d = null; }
    this.renderer = this.ctx2d ? 'canvas' : 'static';
  }

  _createWebGLResources() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Particle shader compilation failed.';
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    };
    // The same buffer is drawn twice on the surface scene: once mirrored below the
    // waterline with ripples (the reflection), then normally.
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 position; attribute float size; attribute vec4 color;
      uniform vec2 resolution; uniform float ratio; uniform float mirror; uniform float waterY; uniform float mirrorAlpha; uniform float time;
      varying vec4 tint;
      void main(){
        vec2 p=position; float a=color.a;
        if(mirror>0.5){
          float d=waterY-p.y;
          a*=step(1.5,d)*mirrorAlpha*(1.0-clamp(d/(resolution.y*0.36),0.0,1.0))*0.3;
          p.y=waterY+d*0.9+3.0;
          p.x+=sin(p.y*0.11+time*0.0024)*(1.1+d*0.012)+sin(p.y*0.037-time*0.0013)*1.4;
        }
        vec2 q=p/resolution; gl_Position=vec4(q.x*2.0-1.0,1.0-q.y*2.0,0.0,1.0); gl_PointSize=size*ratio; tint=vec4(color.rgb,a);
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      precision mediump float; varying vec4 tint;
      void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(tint.rgb,tint.a*(1.0-smoothstep(.24,.5,d)));}
    `);
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Particle shader link failed.');
    this.program = program;
    this.vertexBuffer = gl.createBuffer();
    this.uniforms = Object.fromEntries(['resolution', 'ratio', 'mirror', 'waterY', 'mirrorAlpha', 'time'].map(name => [name, gl.getUniformLocation(program, name)]));
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (this.buffer) gl.bufferData(gl.ARRAY_BUFFER, this.buffer.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, size, offset] of [['position', 2, 0], ['size', 1, 8], ['color', 4, 12]]) {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 28, offset);
    }
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  _allocatePool() {
    // A lost WebGL context keeps its context object. Preserve the WebGL-sized
    // pool while the renderer is temporarily marked static during recovery.
    const usesWebGLPool = this.renderer === 'webgl' || Boolean(this.gl);
    const desired = usesWebGLPool ? (this.mobile ? 10000 : 19000) : 1800;
    this.count = desired;
    this.dustCount = Math.floor(desired * DUST_SHARE);
    // The companion kingfisher keeps its own particles; the rest draw the chapters.
    this.birdCount = Math.max(360, Math.min(3000, Math.round(desired * BIRD_SHARE)));
    this.sceneStart = this.dustCount + this.birdCount;
    this.xyz = new Float32Array(desired * 4);
    this.disp = new Float32Array(desired * 4);
    this.seed = new Float32Array(desired * 4);
    this.buffer = new Float32Array(desired * 7);
    this.ctx.seed = this.seed;
    const random = randomGenerator(55);
    for (let i = 0; i < this.seed.length; i += 1) this.seed[i] = random();
    if (this.gl && !this.contextLost) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.buffer.byteLength, this.gl.DYNAMIC_DRAW);
    }
    this.poolVersion += 1;
  }

  _buildGeometry() {
    if (!this.useScenes) {
      this.scenes = null;
      this.companion = null;
      return;
    }
    const w = this.width;
    const h = this.height;
    const mobile = this.mobile;
    const particles = this.count - this.sceneStart;
    this.surface = surfaceLayout({ w, h, mobile });
    const story = buildStory({ w, h, mobile, layout: this.layout, particles });
    this.scenes = [buildSurface({ w, h, mobile, particles, surface: this.surface }), ...story.scenes];
    const { root, rootRing, result } = story.anchors;
    const widget = this.layout.widget;
    const note = this.layout.notes?.[1] || this.layout.notes?.[0];
    const perches = [
      { feet: this.surface.feet, facing: 1 },
      { feet: { x: root.x, y: root.y - rootRing - 1 }, facing: mobile ? -1 : 1 },
      widget ? { feet: { x: widget.x + widget.width * 0.74, y: widget.y - 1 }, facing: 1 } : { feet: { x: w * 0.8, y: h * 0.3 }, facing: 1 },
      note ? { feet: { x: note.x + note.width * 0.52, y: note.y - 1 }, facing: 1 } : { feet: { x: w * 0.8, y: h * 0.35 }, facing: 1 },
      { feet: { x: result.x, y: result.y - result.r - 1 }, facing: 1 },
    ];
    this.companion = buildCompanion({ w, h, mobile, count: this.birdCount, surface: this.surface, perches, pill: this.layout.final });
    this._assignSlots();
  }

  /**
   * Give every chapter particle one slot per scene. Scene 00 slots are an even shuffle;
   * each later scene is rank-matched to the previous scene's rest positions so every
   * transition keeps neighbours together.
   */
  _assignSlots() {
    const n = this.count;
    const first = this.sceneStart;
    const m = n - first;
    const ctx = this.ctx;
    const saved = ctx.time;
    ctx.time = 0;
    this.slots = Array.from({ length: 6 }, () => new Float32Array(n));
    this.delays = Array.from({ length: 5 }, () => new Float32Array(n));
    const order = Array.from({ length: m }, (_, k) => k);
    const random = randomGenerator(907);
    for (let k = m - 1; k > 0; k -= 1) {
      const j = Math.floor(random() * (k + 1));
      [order[k], order[j]] = [order[j], order[k]];
    }
    for (let j = 0; j < m; j += 1) this.slots[0][first + j] = (order[j] + 0.5) / m;
    const source = new Float32Array(m * 2);
    const destination = new Float32Array(m * 2);
    const out = this._o;
    for (let scene = 1; scene <= 5; scene += 1) {
      for (let j = 0; j < m; j += 1) {
        const i = first + j;
        this.scenes[scene - 1].pose(this.slots[scene - 1][i], i, 0.5, ctx, out, true);
        source[j * 2] = out[0];
        source[j * 2 + 1] = out[1];
        this.scenes[scene].pose((j + 0.5) / m, i, 0, ctx, out, true);
        destination[j * 2] = out[0];
        destination[j * 2 + 1] = out[1];
      }
      const match = rankMatch(source, destination, m);
      for (let j = 0; j < m; j += 1) this.slots[scene][first + j] = (match[j] + 0.5) / m;
      // Particles leading in the direction of travel leave first: a wave, not a swap.
      let sx = 0;
      let sy = 0;
      let dx = 0;
      let dy = 0;
      for (let j = 0; j < m; j += 1) {
        sx += source[j * 2];
        sy += source[j * 2 + 1];
        dx += destination[match[j] * 2];
        dy += destination[match[j] * 2 + 1];
      }
      const dirX = (dx - sx) / m;
      const dirY = (dy - sy) / m;
      const length = Math.hypot(dirX, dirY) || 1;
      let min = Infinity;
      let max = -Infinity;
      const projection = new Float32Array(m);
      for (let j = 0; j < m; j += 1) {
        const value = (source[j * 2] * dirX + source[j * 2 + 1] * dirY) / length;
        projection[j] = value;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      const span = Math.max(1, max - min);
      const delays = this.delays[scene - 1];
      for (let j = 0; j < m; j += 1) {
        const lead = 1 - (projection[j] - min) / span;
        delays[first + j] = MAX_DELAY * clamp(lead * 0.78 + this.seed[(first + j) * 4 + 1] * 0.22);
      }
    }
    ctx.time = saved;
  }

  frame(now) {
    this.raf = 0;
    if (!this._canRun()) return;
    const rawElapsed = Math.max(0, now - this.last);
    const delta = clamp(rawElapsed / 16.667, 0.25, 2);
    this.last = now;
    this.time += delta * 16.667;
    this._update(delta);
    this._draw();
    this.frames += 1;
    this.elapsed += rawElapsed;
    if (this.elapsed >= 1000) {
      this.fps = Math.round((this.frames * 1000) / this.elapsed);
      this.frames = 0;
      this.elapsed = 0;
    }
    this._schedule();
  }

  /** Evaluate the pose of particle i at the current progress into `out`. */
  _pose(i, stage, local, out) {
    const ctx = this.ctx;
    if (i < this.dustCount || !this.scenes) {
      this._dust(i, out);
      return;
    }
    if (i < this.sceneStart) {
      this.companion.pose(i - this.dustCount, i, ctx, out);
      return;
    }
    const a = this._a;
    this.scenes[stage].pose(this.slots[stage][i], i, local, ctx, a);
    if (stage < 5 && local > TRANSITION_START) {
      const b = this._b;
      this.scenes[stage + 1].pose(this.slots[stage + 1][i], i, 0, ctx, b);
      const u = (local - TRANSITION_START) / (1 - TRANSITION_START);
      const t = ease((u - this.delays[stage][i]) / (1 - MAX_DELAY));
      const offset = flightOffset(a[0], a[1], b[0], b[1], t, Math.min(this.width, this.height), stage * 1.7, this._offset);
      out[0] = mix(a[0], b[0], t) + offset[0];
      out[1] = mix(a[1], b[1], t) + offset[1];
      for (let k = 2; k < 7; k += 1) out[k] = mix(a[k], b[k], t);
      return;
    }
    for (let k = 0; k < 7; k += 1) out[k] = a[k];
  }

  /** Marine snow: faint drifting motes that rise slowly as the reader goes deeper. */
  _dust(i, out) {
    const q = i * 4;
    const s = this.seed;
    const w = this.width;
    const h = this.height;
    const time = this.reduced ? 0 : this.time;
    // The motes also rise with the pond as the reader sinks through scene 00.
    const depth = this.progress * h * 0.12 + (this.camera || 0) * 0.85;
    out[0] = ((s[q] * w + time * 0.003 * (s[q + 1] - 0.4)) % w + w) % w;
    out[1] = ((s[q + 2] * h + Math.sin(time * 0.0001 + s[q] * 10) * 12 - time * 0.0016 * (0.3 + s[q + 3]) - depth) % h + h) % h;
    out[2] = 0.45 + s[q + 3] * 0.6;
    const colour = this.ctx.palette[0];
    out[3] = colour[0];
    out[4] = colour[1];
    out[5] = colour[2];
    out[6] = 0.035 + s[q + 3] * 0.075;
  }

  /** Per-frame setup shared by the animated and the static paths. */
  _prepare(stage, local) {
    if (!this.scenes) return;
    this.scenes[stage].prepare?.(this.ctx);
    this.companion.prepare(this.progress, this.ctx.time);
    this.camera = descent(stage === 0 ? local : 1, this.surface, this.height);
    // The pond's reflection goes with the surface once the bird takes the reader under it.
    this.reflection = stage === 0
      ? { waterY: this.surface.waterY - this.camera, alpha: 1 - smooth(DIVE.entry - 0.02, DIVE.entry + 0.1, local) }
      : { waterY: 0, alpha: 0 };
  }

  _update(delta) {
    const stage = Math.min(5, Math.floor(this.progress));
    const local = this.progress - stage;
    const ctx = this.ctx;
    ctx.time = this.time;
    for (const name in this.highlight) {
      this.highlight[name] += (this.highlightTarget[name] - this.highlight[name]) * Math.min(1, 0.12 * delta);
    }
    this._prepare(stage, local);
    this.waves = this.waves.filter(wave => this.time - wave.start < 1800);
    const out = this._o;
    const pointerRadius = this.mobile ? 62 : 95;
    const waves = this.waves;
    const damping = Math.pow(0.8, delta);
    for (let i = 0; i < this.count; i += 1) {
      this._pose(i, stage, local, out);
      const q = i * 4;
      let dx = this.disp[q];
      let dy = this.disp[q + 1];
      let vx = this.disp[q + 2];
      let vy = this.disp[q + 3];
      const x = out[0] + dx;
      const y = out[1] + dy;
      const px = x - this.pointer.x;
      const py = y - this.pointer.y;
      const distance = Math.sqrt(px * px + py * py);
      if (distance < pointerRadius && distance > 0.1) {
        const force = (1 - distance / pointerRadius) * 2.1;
        vx += (px / distance) * force;
        vy += (py / distance) * force;
      }
      for (let k = 0; k < waves.length; k += 1) {
        const wave = waves[k];
        const wx = x - wave.x;
        const wy = y - wave.y;
        const d = Math.sqrt(wx * wx + wy * wy) + 0.001;
        const band = 1 - Math.abs(d - (this.time - wave.start) * 0.65) / 85;
        if (band > 0) {
          const force = band * wave.strength * 2.2;
          vx += (wx / d) * force;
          vy += (wy / d) * force;
        }
      }
      vx = (vx - dx * 0.06 * delta) * damping;
      vy = (vy - dy * 0.06 * delta) * damping;
      dx += vx * delta;
      dy += vy * delta;
      this.disp[q] = dx;
      this.disp[q + 1] = dy;
      this.disp[q + 2] = vx;
      this.disp[q + 3] = vy;
      this._write(i, out[0] + dx, out[1] + dy, out);
    }
  }

  _write(i, x, y, pose) {
    const q = i * 4;
    this.xyz[q] = x;
    this.xyz[q + 1] = y;
    this.xyz[q + 2] = this.disp[q + 2];
    this.xyz[q + 3] = this.disp[q + 3];
    const o = i * 7;
    this.buffer[o] = x;
    this.buffer[o + 1] = y;
    this.buffer[o + 2] = pose[2] * SIZE;
    this.buffer[o + 3] = pose[3];
    this.buffer[o + 4] = pose[4];
    this.buffer[o + 5] = pose[5];
    this.buffer[o + 6] = pose[6];
  }

  _prepareGlyphTargets(glyphs, sourcePositions = null) {
    const points = glyphs?.points;
    const requestedCount = Math.floor(Number(glyphs?.count) || 0);
    const availableCount = points?.length ? Math.floor(points.length / 6) : 0;
    const limit = Math.min(requestedCount, availableCount);
    if (!points || limit <= 0 || !this.count) return { targets: null, count: 0 };

    const targetOrder = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < limit; i += 1) {
      const offset = i * 6;
      const x = points[offset];
      const y = points[offset + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      targetOrder.push(i);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    const glyphCount = targetOrder.length;
    if (!glyphCount) return { targets: null, count: 0 };
    const targetSpanX = Math.max(1, maxX - minX);
    const targetSpanY = Math.max(1, maxY - minY);
    targetOrder.sort((left, right) => {
      const l = left * 6;
      const r = right * 6;
      return mortonCode(points[l], points[l + 1], minX, minY, targetSpanX, targetSpanY)
        - mortonCode(points[r], points[r + 1], minX, minY, targetSpanX, targetSpanY);
    });

    const poolOrder = Array.from({ length: this.count }, (_, index) => index);
    if (sourcePositions?.length >= this.count * 7) {
      let sourceMinX = Infinity;
      let sourceMinY = Infinity;
      let sourceMaxX = -Infinity;
      let sourceMaxY = -Infinity;
      for (let i = 0; i < this.count; i += 1) {
        const offset = i * 7;
        const x = sourcePositions[offset];
        const y = sourcePositions[offset + 1];
        sourceMinX = Math.min(sourceMinX, x);
        sourceMinY = Math.min(sourceMinY, y);
        sourceMaxX = Math.max(sourceMaxX, x);
        sourceMaxY = Math.max(sourceMaxY, y);
      }
      const sourceSpanX = Math.max(1, sourceMaxX - sourceMinX);
      const sourceSpanY = Math.max(1, sourceMaxY - sourceMinY);
      poolOrder.sort((left, right) => {
        const l = left * 7;
        const r = right * 7;
        return mortonCode(sourcePositions[l], sourcePositions[l + 1], sourceMinX, sourceMinY, sourceSpanX, sourceSpanY)
          - mortonCode(sourcePositions[r], sourcePositions[r + 1], sourceMinX, sourceMinY, sourceSpanX, sourceSpanY);
      });
    }

    const canvasRect = this.canvas.getBoundingClientRect();
    const targets = new Float32Array(this.count * 6);
    for (let rank = 0; rank < this.count; rank += 1) {
      const particle = poolOrder[rank] * 6;
      const glyphRank = Math.min(glyphCount - 1, Math.floor((rank * glyphCount) / this.count));
      const sample = targetOrder[glyphRank] * 6;
      const r = points[sample + 2];
      const g = points[sample + 3];
      const b = points[sample + 4];
      const alpha = points[sample + 5];
      targets[particle] = points[sample] - canvasRect.left;
      targets[particle + 1] = points[sample + 1] - canvasRect.top;
      targets[particle + 2] = clamp(Number.isFinite(r) ? r : 0.5);
      targets[particle + 3] = clamp(Number.isFinite(g) ? g : 0.5);
      targets[particle + 4] = clamp(Number.isFinite(b) ? b : 0.5);
      targets[particle + 5] = clamp(Number.isFinite(alpha) ? alpha : 0);
    }
    return { targets, count: glyphCount };
  }

  _refreshDocumentGlyphTargets() {
    const morph = this.documentMorph;
    if (!morph) return;
    const prepared = this._prepareGlyphTargets(morph.glyphs, morph.captured);
    morph.glyphTargets = prepared.targets;
    morph.glyphCount = prepared.count;
    morph.glyphCurve = null;
    if (!prepared.targets || !morph.captured) return;
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
    const viewportScale = Math.min(width, height);
    const curve = new Float32Array(this.count * 5);
    for (let i = 0; i < this.count; i += 1) {
      const particle = i * 7;
      const glyph = i * 6;
      const coefficient = i * 5;
      const targetX = prepared.targets[glyph];
      const targetY = prepared.targets[glyph + 1];
      const dx = targetX - morph.captured[particle];
      const dy = targetY - morph.captured[particle + 1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const inverseDistance = distance > 0 ? 1 / distance : 0;
      const nx = targetX / width;
      const ny = targetY / height;
      const primaryField = 0.74 + 0.26 * Math.sin((nx * 0.82 + ny * 0.54) * TAU);
      const primaryMagnitude = Math.min(distance * 0.18, viewportScale * 0.055) * primaryField;
      const currentField = 0.76 + 0.24 * Math.cos((nx * 0.47 - ny * 0.31) * TAU);
      const currentMagnitude = Math.min(distance * 0.06, viewportScale * 0.022) * currentField;
      const currentAngle = (nx * 0.58 - ny * 0.36) * Math.PI;
      const delayUnit = clamp(0.5
        + 0.28 * Math.sin(nx * TAU * 0.55)
        + 0.22 * Math.cos(ny * TAU * 0.45));
      curve[coefficient] = -dy * inverseDistance * primaryMagnitude;
      curve[coefficient + 1] = dx * inverseDistance * primaryMagnitude;
      curve[coefficient + 2] = Math.cos(currentAngle) * currentMagnitude;
      curve[coefficient + 3] = Math.sin(currentAngle) * currentMagnitude;
      curve[coefficient + 4] = delayUnit * READER_MOTION.open.stagger;
    }
    morph.glyphCurve = curve;
  }

  _refreshPageGlyphTargets() {
    const page = this.pageTurn;
    if (!page) return;
    const from = this._prepareGlyphTargets(page.fromGlyphs);
    const to = this._prepareGlyphTargets(page.toGlyphs);
    page.fromTargets = from.targets;
    page.toTargets = to.targets;
    page.fromGlyphCount = from.count;
    page.toGlyphCount = to.count;
    page.curve = null;
    if (!from.targets || !to.targets) return;
    const width = Math.max(1, this.width);
    const height = Math.max(1, this.height);
    const viewportScale = Math.min(width, height);
    const curve = new Float32Array(this.count * 5);
    for (let i = 0; i < this.count; i += 1) {
      const glyph = i * 6;
      const coefficient = i * 5;
      const fromX = from.targets[glyph];
      const fromY = from.targets[glyph + 1];
      const toX = to.targets[glyph];
      const toY = to.targets[glyph + 1];
      const dx = toX - fromX;
      const dy = toY - fromY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const inverseDistance = distance > 0 ? 1 / distance : 0;
      const nx = (fromX + toX) * 0.5 / width;
      const ny = (fromY + toY) * 0.5 / height;
      const primaryField = 0.72 + 0.28 * Math.sin((nx * 0.76 + ny * 0.48) * TAU);
      const primaryMagnitude = Math.min(distance * 0.2, viewportScale * 0.06) * primaryField * page.direction;
      const currentField = 0.76 + 0.24 * Math.cos((nx * 0.44 - ny * 0.34) * TAU);
      const currentMagnitude = Math.min(distance * 0.065, viewportScale * 0.024) * currentField;
      const currentAngle = (nx * 0.52 - ny * 0.38) * Math.PI;
      const delayUnit = clamp(0.5
        + 0.3 * Math.sin(nx * TAU * 0.52)
        + 0.2 * Math.cos(ny * TAU * 0.48));
      curve[coefficient] = -dy * inverseDistance * primaryMagnitude;
      curve[coefficient + 1] = dx * inverseDistance * primaryMagnitude;
      curve[coefficient + 2] = Math.cos(currentAngle) * currentMagnitude;
      curve[coefficient + 3] = Math.sin(currentAngle) * currentMagnitude;
      curve[coefficient + 4] = delayUnit * READER_MOTION.page.stagger;
    }
    page.curve = curve;
  }

  _captureDocumentMorph() {
    const morph = this.documentMorph;
    if (!morph || !this.buffer) return;
    const captureLength = this.count * 7;
    if (!morph.captured || morph.captured.length !== captureLength) {
      morph.captured = new Float32Array(captureLength);
    }
    morph.captured.set(this.buffer);
  }

  _renderDocumentMorph() {
    const morph = this.documentMorph;
    if (!morph?.captured || !this.xyz || !this.buffer) return;
    const amount = morph.amount;
    const targets = morph.glyphTargets;
    const curveTargets = morph.glyphCurve;
    const hasGlyphs = Boolean(targets?.length && curveTargets?.length);
    const motion = READER_MOTION.open;
    const fallbackVisibility = 1 - smoother(0, 0.26, amount);
    const glyphVisibility = 1 - smoother(motion.handoff, 1, amount);
    for (let i = 0; i < this.count; i += 1) {
      const particle = i * 7;
      const position = i * 4;
      const originX = morph.captured[particle];
      const originY = morph.captured[particle + 1];
      let x = originX;
      let y = originY;
      let size = morph.captured[particle + 2];
      let r = morph.captured[particle + 3];
      let g = morph.captured[particle + 4];
      let b = morph.captured[particle + 5];
      let alpha = morph.captured[particle + 6] * fallbackVisibility;
      if (hasGlyphs) {
        const glyph = i * 6;
        const coefficient = i * 5;
        const targetX = targets[glyph];
        const targetY = targets[glyph + 1];
        const delay = curveTargets[coefficient + 4];
        const travel = smoother(motion.start + delay, motion.end + delay, amount);
        const inverseTravel = 1 - travel;
        const archEnvelope = 64 * travel * travel * travel
          * inverseTravel * inverseTravel * inverseTravel;
        const currentEnvelope = archEnvelope * (1 - 2 * travel);
        x = mix(originX, targetX, travel)
          + curveTargets[coefficient] * archEnvelope
          + curveTargets[coefficient + 2] * currentEnvelope;
        y = mix(originY, targetY, travel)
          + curveTargets[coefficient + 1] * archEnvelope
          + curveTargets[coefficient + 3] * currentEnvelope;
        const coverage = targets[glyph + 5];
        const glyphSize = 0.72 + coverage * 0.56 + this.seed[position + 3] * 0.14;
        size = mix(morph.captured[particle + 2], glyphSize, travel);
        r = mix(morph.captured[particle + 3], targets[glyph + 2], travel);
        g = mix(morph.captured[particle + 4], targets[glyph + 3], travel);
        b = mix(morph.captured[particle + 5], targets[glyph + 4], travel);
        alpha = mix(morph.captured[particle + 6], coverage, travel) * glyphVisibility;
      }
      this.xyz[position] = x;
      this.xyz[position + 1] = y;
      this.xyz[position + 2] = 0;
      this.xyz[position + 3] = 0;
      this.buffer[particle] = x;
      this.buffer[particle + 1] = y;
      this.buffer[particle + 2] = size;
      this.buffer[particle + 3] = r;
      this.buffer[particle + 4] = g;
      this.buffer[particle + 5] = b;
      this.buffer[particle + 6] = alpha;
    }
    this._draw(false);
  }

  _renderPageTurn() {
    const page = this.pageTurn;
    if (!page || !this.xyz || !this.buffer) return;
    const amount = page.amount;
    const from = page.fromTargets;
    const to = page.toTargets;
    const curveTargets = page.curve;
    const hasGlyphs = Boolean(from?.length && to?.length && curveTargets?.length);
    const motion = READER_MOTION.page;
    const appear = smoother(0, motion.release, amount);
    const fade = 1 - smoother(motion.handoff, 1, amount);
    for (let i = 0; i < this.count; i += 1) {
      const position = i * 4;
      const particle = i * 7;
      let x = this.xyz[position];
      let y = this.xyz[position + 1];
      let size = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      if (hasGlyphs) {
        const glyph = i * 6;
        const coefficient = i * 5;
        const fromX = from[glyph];
        const fromY = from[glyph + 1];
        const toX = to[glyph];
        const toY = to[glyph + 1];
        const delay = curveTargets[coefficient + 4];
        const travel = smoother(motion.start + delay, motion.end + delay, amount);
        const inverseTravel = 1 - travel;
        const archEnvelope = 64 * travel * travel * travel
          * inverseTravel * inverseTravel * inverseTravel;
        const currentEnvelope = archEnvelope * (1 - 2 * travel);
        x = mix(fromX, toX, travel)
          + curveTargets[coefficient] * archEnvelope
          + curveTargets[coefficient + 2] * currentEnvelope;
        y = mix(fromY, toY, travel)
          + curveTargets[coefficient + 1] * archEnvelope
          + curveTargets[coefficient + 3] * currentEnvelope;
        const fromCoverage = from[glyph + 5];
        const toCoverage = to[glyph + 5];
        const coverage = mix(fromCoverage, toCoverage, travel);
        size = 0.72 + coverage * 0.56 + this.seed[position + 3] * 0.14;
        r = mix(from[glyph + 2], to[glyph + 2], travel);
        g = mix(from[glyph + 3], to[glyph + 3], travel);
        b = mix(from[glyph + 4], to[glyph + 4], travel);
        alpha = coverage * appear * fade;
      }
      this.xyz[position] = x;
      this.xyz[position + 1] = y;
      this.xyz[position + 2] = 0;
      this.xyz[position + 3] = 0;
      this.buffer[particle] = x;
      this.buffer[particle + 1] = y;
      this.buffer[particle + 2] = size;
      this.buffer[particle + 3] = r;
      this.buffer[particle + 4] = g;
      this.buffer[particle + 5] = b;
      this.buffer[particle + 6] = alpha;
    }
    this._draw(false);
  }

  _draw(scenesVisible = true) {
    if (this.contextLost || this.renderer === 'static') return;
    const reflect = scenesVisible && !this.documentMorph && !this.pageTurn && this.reflection.alpha > 0.002;
    if (this.gl) {
      const gl = this.gl;
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.buffer);
      gl.uniform1f(this.uniforms.time, this.time);
      if (reflect) {
        gl.uniform1f(this.uniforms.mirror, 1);
        gl.uniform1f(this.uniforms.waterY, this.reflection.waterY);
        gl.uniform1f(this.uniforms.mirrorAlpha, this.reflection.alpha);
        gl.drawArrays(gl.POINTS, 0, this.count);
      }
      gl.uniform1f(this.uniforms.mirror, 0);
      gl.drawArrays(gl.POINTS, 0, this.count);
    } else if (this.ctx2d) {
      const context = this.ctx2d;
      context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      context.clearRect(0, 0, this.width, this.height);
      const buffer = this.buffer;
      if (reflect) {
        const waterY = this.reflection.waterY;
        for (let i = 0; i < this.count; i += 1) {
          const o = i * 7;
          const d = waterY - buffer[o + 1];
          if (d < 1.5) continue;
          const alpha = buffer[o + 6] * this.reflection.alpha * (1 - Math.min(1, d / (this.height * 0.36))) * 0.3;
          if (alpha < 0.004) continue;
          const y = waterY + d * 0.9 + 3;
          context.fillStyle = `rgba(${buffer[o + 3] * 255},${buffer[o + 4] * 255},${buffer[o + 5] * 255},${alpha})`;
          context.fillRect(buffer[o] + Math.sin(y * 0.11 + this.time * 0.0024) * 1.4, y, buffer[o + 2], buffer[o + 2]);
        }
      }
      for (let i = 0; i < this.count; i += 1) {
        const o = i * 7;
        if (buffer[o + 6] < 0.004) continue;
        context.fillStyle = `rgba(${buffer[o + 3] * 255},${buffer[o + 4] * 255},${buffer[o + 5] * 255},${buffer[o + 6]})`;
        context.fillRect(buffer[o], buffer[o + 1], buffer[o + 2], buffer[o + 2]);
      }
    }
    this._setReady(true);
  }

  _snapToTargets(draw = true) {
    if (!this.xyz) return;
    const stage = Math.min(5, Math.floor(this.progress));
    const local = this.progress - stage;
    const ctx = this.ctx;
    const saved = this.time;
    if (this.reduced) this.time = 0;
    ctx.time = this.time;
    this._prepare(stage, local);
    const out = this._o;
    for (let i = 0; i < this.count; i += 1) {
      this._pose(i, stage, local, out);
      const q = i * 4;
      this.disp[q] = 0;
      this.disp[q + 1] = 0;
      this.disp[q + 2] = 0;
      this.disp[q + 3] = 0;
      if (!this.scenes && i >= this.dustCount) out[6] = 0;
      this._write(i, out[0], out[1], out);
    }
    this.time = saved;
    if (draw) this._draw();
  }

  _wake() {
    if (!this.raf) this.last = performance.now();
    this._schedule();
  }

  _canRun() {
    return this.wantsToRun && !this.documentMorph && !this.pageTurn && this.visible && !this.reduced && !this.destroyed && !this.contextLost && this.renderer !== 'static';
  }

  _schedule() {
    if (this._canRun()) {
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    } else this._cancelFrame();
  }

  _cancelFrame() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  _onVisibility() {
    this.visible = !document.hidden;
    this.last = performance.now();
    this._schedule();
  }

  _onContextLost(event) {
    event.preventDefault();
    const wasReady = this.ready;
    this.contextLost = true;
    this.renderer = 'static';
    this._cancelFrame();
    this._setReady(false);
    if (!wasReady) this._dispatchState();
  }

  _onContextRestored() {
    try {
      this.contextLost = false;
      this.gl = this.canvas.getContext('webgl');
      this._createWebGLResources();
      this.renderer = 'webgl';
      const desiredCount = this.mobile ? 10000 : 19000;
      if (this.count !== desiredCount) {
        this._allocatePool();
        this._buildGeometry();
        if (this.documentMorph) {
          this._snapToTargets(false);
          this._captureDocumentMorph();
        } else if (this.pageTurn) this._snapToTargets(false);
        if (this.documentMorph) this._refreshDocumentGlyphTargets();
        if (this.pageTurn) this._refreshPageGlyphTargets();
      }
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.gl.uniform2f(this.uniforms.resolution, this.width, this.height);
      this.gl.uniform1f(this.uniforms.ratio, this.dpr);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, this.buffer, this.gl.DYNAMIC_DRAW);
      if (this.pageTurn) this._renderPageTurn();
      else if (this.documentMorph) this._renderDocumentMorph();
      else {
        this._snapToTargets();
        if (!this.reduced) this._wake();
      }
    } catch (error) {
      this.contextLost = true;
      this.renderer = 'static';
      this._setReady(false);
      console.warn('Particle WebGL context could not be restored.', error);
    }
  }

  _setReady(value) {
    if (this.ready === value) return;
    this.ready = value;
    if (value) {
      this.canvas.dataset.ready = 'true';
      this.parent?.classList.add('is-ready');
    } else {
      this.canvas.removeAttribute('data-ready');
      this.parent?.classList.remove('is-ready');
    }
    this._dispatchState();
  }

  _dispatchState() {
    this.canvas.dispatchEvent(new CustomEvent('particlestatechange', { detail: this.metrics }));
  }
}

export default ParticleExperience;
