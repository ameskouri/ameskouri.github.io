// Adam Meskouri: the small amount of script the page needs.
// Everything is readable without it: reveals only hide content under html.js, the figures ship with
// their final values, and the drawn visuals leave a plain ground behind if they cannot run.

const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Runs a frame loop only while its element is on screen and the tab is visible.
const whileVisible = (el, frame) => {
  let raf = 0, visible = false;
  const loop = (now) => { frame(now); raf = requestAnimationFrame(loop); };
  const run = () => { cancelAnimationFrame(raf); if (visible && !document.hidden) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; run(); }).observe(el);
  document.addEventListener('visibilitychange', run);
};

// The pointer, as an offset from the middle of the window (-0.5 to 0.5 each way). The drawn visuals lean toward it.
const pointer = { x: 0, y: 0 };
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  addEventListener('pointermove', (e) => { pointer.x = e.clientX / innerWidth - 0.5; pointer.y = 0.5 - e.clientY / innerHeight; }, { passive: true });
}

// Compiles and links a shader pair; null if the device refuses either half.
const glProgram = (gl, vertex, fragment) => {
  const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null;
};

// Matches a canvas's drawing buffer to its laid-out size at the given scale.
const fitCanvas = (canvas, gl, scale) => {
  const w = Math.max(1, Math.round(canvas.clientWidth * scale)), h = Math.max(1, Math.round(canvas.clientHeight * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
};

// Reveal once on entry. Rows inside a .stagger get their order for the row-by-row arrival.
(() => {
  document.querySelectorAll('.stagger').forEach((list) => {
    [...list.children].forEach((child, r) => child.style.setProperty('--r', r));
  });
  const targets = document.querySelectorAll('[data-reveal]');
  const show = (el) => { el.classList.add('is-in'); el.dispatchEvent(new CustomEvent('revealed')); };
  if (!('IntersectionObserver' in window)) { targets.forEach(show); return; }
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      show(entry.target);
      io.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -4% 0px', threshold: 0.05 });
  targets.forEach((el) => io.observe(el));
  // safety net: anything on screen that the observer missed is shown after load
  window.addEventListener('load', () => setTimeout(() => {
    targets.forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < innerHeight && r.bottom > 0 && !el.classList.contains('is-in')) show(el); });
  }, 2500));
})();

// The flow: a domain-warped noise field lit like pearl satin, drawn on the GPU behind the name. It leans
// gently toward the pointer. Rendered at half resolution (it is soft by nature), paused off screen and in
// hidden tabs, frozen on one frame under reduced motion. Without WebGL the hero keeps its flat ground.
(() => {
  const canvas = document.getElementById('flow');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  gl.getExtension('OES_standard_derivatives');   // for the satin lighting; the field still draws without it
  const vertex = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
  const fragment = `
#ifdef GL_OES_standard_derivatives
#extension GL_OES_standard_derivatives : enable
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 res;
uniform vec2 lean;
uniform float time;
const float ZOOM = 0.8;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.48; }
  return v;
}
void main() {
  vec2 uv = gl_FragCoord.xy / res.y * ZOOM + lean * 0.18;
  float t = time * 0.11;
  vec2 q = vec2(fbm(uv + vec2(0.0, t)), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + 2.3 * q + vec2(1.7, 9.2) + 0.6 * t), fbm(uv + 2.3 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(uv + 2.4 * r + lean * 0.12);
  // colour: white ground, cool silver, blue-grey folds
  float k = clamp((f - 0.24) / 0.46, 0.0, 1.0);
  vec3 col = mix(vec3(0.975, 0.98, 0.99), vec3(0.88, 0.9, 0.94), smoothstep(0.0, 0.38, k));
  col = mix(col, vec3(0.72, 0.77, 0.86), smoothstep(0.32, 0.68, k + 0.15 * (r.x - 0.5)));
  col = mix(col, vec3(0.53, 0.62, 0.8), smoothstep(0.6, 0.95, k + 0.18 * (q.y - 0.5)) * 0.75);
  // light the folds like pearl satin: a surface normal from the slope of the field, lit from the upper left
#ifdef GL_OES_standard_derivatives
  vec2 g = vec2(dFdx(f), dFdy(f)) * res.y / ZOOM;
  vec3 n = normalize(vec3(-g * 0.8, 1.0));
  vec3 l = normalize(vec3(-0.5, 0.6, 0.62));
  float diffuse = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 28.0);
  col *= 0.74 + 0.36 * diffuse;
  col += vec3(1.0) * spec * 0.35;
#endif
  col = min(col, vec3(1.0));
  vec2 s = gl_FragCoord.xy / res;
  col = mix(col, vec3(0.975, 0.98, 0.99), (1.0 - smoothstep(0.0, 0.6, s.x * 0.55 + s.y * 0.75)) * 0.6);   // lighter lower left, under the sentence
  col += (hash(gl_FragCoord.xy + time) - 0.5) * 0.018;                                                    // fine grain against banding
  gl_FragColor = vec4(col, 1.0);
}`;
  const prog = glProgram(gl, vertex, fragment);
  if (!prog) return;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle covers the screen
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'res'), uTime = gl.getUniformLocation(prog, 'time'), uLean = gl.getUniformLocation(prog, 'lean');
  const size = () => { fitCanvas(canvas, gl, 0.5); gl.uniform2f(uRes, canvas.width, canvas.height); };
  // the pull eases so the surface glides rather than jumps
  const lean = { x: 0, y: 0 };
  const start = performance.now() - 40000;   // open mid-flow rather than on the field's seed
  const draw = (now) => {
    lean.x += (pointer.x - lean.x) * 0.04; lean.y += (pointer.y - lean.y) * 0.04;
    gl.uniform2f(uLean, lean.x, lean.y);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  size(); draw(performance.now());
  canvas.classList.add('is-live');
  addEventListener('resize', () => { size(); if (calm) draw(performance.now()); });
  if (!calm) whileVisible(canvas, draw);
})();

// The dataset, flat: every data point as one pixel in 14 bands (variables) by 53 columns (years), dissolving
// into place while the count runs up. Only drawn where WebGL2 is missing; the volume below is the usual view.
const flatDataset = (canvas, count) => {
  const note = document.getElementById('dataset-note');
  if (note) note.textContent = 'data points. Each dot is one of them, arranged in 14 bands for the variables and 53 columns for the years.';
  const TOTAL = 2806605, W = 2400, H = Math.ceil(TOTAL / W), PLAY_MS = 6500;
  const rgba = (r, g, b) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;   // ImageData pixels are little-endian RGBA
  const EMPTY = rgba(238, 241, 246), PAGE = rgba(255, 255, 255);
  const TONES = [rgba(47, 111, 224), rgba(120, 170, 250)], SPECK = rgba(10, 13, 20);
  const inkFor = (i) => {
    if ((Math.imul(i, 2654435761) >>> 28) === 0) return SPECK;
    const band = Math.floor(Math.floor(i / W) * 14 / H), year = Math.floor((i % W) * 53 / W);
    return TONES[(band + year) & 1];
  };
  let ctx, img, px, order, lit = 0;
  const prepare = () => {
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H); px = new Uint32Array(img.data.buffer);
    px.fill(EMPTY, 0, TOTAL); px.fill(PAGE, TOTAL);
    // a scattered order in linear time: bucket every dot by a random byte, then walk the buckets
    let seed = 2463534242;
    const key = new Uint8Array(TOTAL), starts = new Uint32Array(257);
    for (let i = 0; i < TOTAL; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const k = seed & 255; key[i] = k; starts[k + 1]++; }
    for (let k = 0; k < 256; k++) starts[k + 1] += starts[k];
    order = new Uint32Array(TOTAL);
    for (let i = 0; i < TOTAL; i++) order[starts[key[i]]++] = i;
  };
  const lightTo = (n) => {
    for (; lit < n; lit++) { const i = order[lit]; px[i] = inkFor(i); }
    ctx.putImageData(img, 0, 0);
    if (count) count.textContent = n.toLocaleString('en-US');
  };
  const play = () => {
    prepare();
    if (calm) { lightTo(TOTAL); order = null; return; }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / PLAY_MS), eased = 1 - Math.pow(1 - t, 3);
      lightTo(Math.round(TOTAL * eased));
      if (t < 1) requestAnimationFrame(tick); else order = null;   // release the ordering once every dot is placed
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); play(); } }, { threshold: 0.3 });
  io.observe(canvas);
};

// The dataset as a volume: all 2,806,605 data points in the Harvard database, one GPU point each, stacked in
// 14 layers (the variables), each 3,981 cities across and 53 years deep. Before it is in view every layer lies
// folded into one rippling surface. Then a scan crosses the block left to right and, behind it, each dot
// lifts or drops to its own layer while the count runs up to the total. Afterward the layers keep a slow
// swell, scrolling tilts the block and the pointer turns it a little. Under reduced motion it is drawn
// settled and still.
(() => {
  const canvas = document.getElementById('dataset'), count = document.getElementById('dataset-count');
  if (!canvas || !('IntersectionObserver' in window)) return;
  const flat = () => { const fresh = canvas.cloneNode(); canvas.replaceWith(fresh); flatDataset(fresh, count); };
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
  if (!gl) { flatDataset(canvas, count); return; }
  const TOTAL = 2806605, PLAY_MS = 5000;
  const SWEEP = 4, JITTER = 0.12;   // the scan front spans a quarter of the block; dots leave it a little out of step
  const vertex = `#version 300 es
precision highp float;
precision highp int;
uniform float settle;   // the scan's progress, 0 to 1
uniform float time;
uniform vec2 turn;      // yaw and pitch, radians
uniform float aspect;
uniform float size;
uniform float ink;      // opacity per dot, scaled to the canvas so the block reads the same at any size
out vec4 tint;
const int CITIES = 3981, LAYER = 3981 * 53;
const float GAPS = 147297.0 / 2806605.0;   // the block has 2,953,902 cells; those without a data point are spread evenly through it
const float SWEEP = ${SWEEP.toFixed(2)}, JITTER = ${JITTER.toFixed(2)};
uint scramble(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
void main() {
  int i = gl_VertexID;
  int c = i + int(float(i) * GAPS);
  int layer = c / LAYER, r = c - layer * LAYER, year = r / CITIES, city = r - year * CITIES;
  float across = float(city) / 3980.0, jitter = float(scramble(uint(i)) >> 8) / 16777216.0;
  vec3 p = (vec3(across, float(layer) / 13.0, float(year) / 52.0) - 0.5) * vec3(2.4, 1.15, 0.9);
  // where the scan has passed, the dot moves from the shared surface to its layer
  float s = clamp(settle * (1.0 + SWEEP + JITTER) - across * SWEEP - jitter * JITTER, 0.0, 1.0);
  float e = s * s * (3.0 - 2.0 * s);
  float surface = 0.3 * (0.6 * sin(p.x * 2.4 + p.z * 2.6 + time * 0.8) + 0.25 * sin(p.x * 4.9 - time * 0.6 + 1.3) + 0.3 * cos(p.z * 3.7 + time * 0.45)) + p.y * 0.05;
  float swell = 0.03 * sin(p.x * 2.8 + time * 0.55 + float(layer) * 0.55) * cos(p.z * 3.0 - time * 0.4);
  vec3 q = vec3(p.x, mix(surface, p.y + swell, e), p.z);
  float cy = cos(turn.x), sy = sin(turn.x), cp = cos(turn.y), sp = sin(turn.y);
  q = vec3(cy * q.x - sy * q.z, q.y, sy * q.x + cy * q.z);     // yaw about the vertical
  q = vec3(q.x, cp * q.y + sp * q.z, cp * q.z - sp * q.y);     // pitch: the far edge rises, so the layers show from above
  float w = 3.2 + q.z;
  gl_Position = vec4(q.x * 2.85 / aspect, q.y * 2.85, 0.0, w);
  gl_PointSize = size;
  float near = clamp((4.0 - w) / 1.6, 0.0, 1.0);
  float front = 4.0 * s * (1.0 - s);                           // dots in flight mark the scan
  vec3 col = mix(vec3(0.4, 0.56, 0.89), vec3(0.145, 0.349, 0.722), near);
  col = mix(col, vec3(0.04, 0.05, 0.08), 0.3 * e * float(layer & 1));   // alternate layers a shade deeper once apart
  col = mix(col, vec3(0.184, 0.435, 0.878), front);
  tint = vec4(col, min(1.0, ink * (0.55 + 0.45 * near) * (1.0 + 0.8 * front)));
}`;
  const fragment = `#version 300 es
precision mediump float;
in vec4 tint;
out vec4 color;
void main() { color = tint; }`;
  const prog = glProgram(gl, vertex, fragment);
  if (!prog) { flat(); return; }
  gl.useProgram(prog);
  gl.clearColor(1, 1, 1, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const u = (name) => gl.getUniformLocation(prog, name);
  const uSettle = u('settle'), uTime = u('time'), uTurn = u('turn'), uAspect = u('aspect'), uSize = u('size'), uInk = u('ink');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  canvas.classList.add('is-depth');
  const size = () => {
    fitCanvas(canvas, gl, scale);
    gl.uniform1f(uAspect, canvas.width / canvas.height);
    gl.uniform1f(uSize, scale);   // one CSS pixel per dot
    // dots overlap less on a bigger canvas, so each carries a little more ink there
    gl.uniform1f(uInk, Math.min(0.4, Math.max(0.03, 0.12 * canvas.clientWidth * canvas.clientHeight / 484000)));
  };
  // the count follows the dots a quarter of the way through their move, so it starts with the scan
  const placed = (settle) => Math.round(TOTAL * Math.min(1, Math.max(0, (settle * (1 + SWEEP + JITTER) - 0.25 - JITTER / 2) / SWEEP)));
  const inView = () => { const r = canvas.getBoundingClientRect(); return Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height))); };
  const lean = { x: 0, y: 0 };
  let armed = false, begun = 0, shown = -1;
  const draw = (now) => {
    lean.x += (pointer.x - lean.x) * 0.05; lean.y += (pointer.y - lean.y) * 0.05;
    if (armed && !begun) begun = now;   // timed from the first frame actually drawn, so no step is skipped
    const t = calm ? 1 : begun ? Math.min(1, (now - begun) / PLAY_MS) : 0;
    const settle = 1 - (1 - t) * (1 - t);   // under way at once, easing into place at the end
    const secs = calm ? 0 : now / 1000, v = calm ? 0.5 : inView();
    gl.uniform1f(uSettle, settle);
    gl.uniform1f(uTime, secs);
    gl.uniform2f(uTurn, -0.5 + 0.55 * v + 0.1 * Math.sin(secs * 0.13) + lean.x * 0.4, 0.55 - 0.3 * v - lean.y * 0.2);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, TOTAL);
    if (count && begun && !calm) {
      const n = placed(settle);
      if (n !== shown) { shown = n; count.textContent = n.toLocaleString('en-US'); }
    }
  };
  size();
  addEventListener('resize', () => { size(); if (calm) draw(performance.now()); });
  if (calm) { draw(performance.now()); return; }
  // draw once now so the GPU has the shader ready before the block scrolls in, and start the count from zero
  draw(performance.now());
  if (count) count.textContent = '0';
  const io = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    io.disconnect();
    armed = true;
  }, { threshold: 0.2 });
  io.observe(canvas);
  whileVisible(canvas, draw);
})();

// Beside the contact rows: a knot of seven threads of light, a three-dimensional Lissajous figure whose phases
// drift so it slowly reties itself, with pulses of ink running along each thread. It turns, leans toward the
// pointer, pauses off screen and holds one frame under reduced motion.
(() => {
  const canvas = document.getElementById('knot');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) { canvas.hidden = true; return; }
  const THREADS = 7, STEPS = 2600;
  const vertex = `
attribute vec2 at;   // x: how far along its thread, 0 to 1; y: which thread
uniform float time;
uniform vec2 turn;
uniform float size;
varying vec4 tint;
void main() {
  float u = at.x * 6.2831853, k = at.y - 3.0;
  vec3 p = 0.78 * vec3(sin(3.0 * u + 0.21 * time + 0.05 * k), sin(4.0 * u + 0.17 * time + 1.1 - 0.035 * k), sin(5.0 * u + 0.13 * time + 2.3 + 0.045 * k));
  float cy = cos(turn.x), sy = sin(turn.x), cp = cos(turn.y), sp = sin(turn.y);
  p = vec3(cy * p.x - sy * p.z, p.y, sy * p.x + cy * p.z);
  p = vec3(p.x, cp * p.y + sp * p.z, cp * p.z - sp * p.y);
  float w = 3.0 + p.z;
  gl_Position = vec4(p.xy * 2.3, 0.0, w);
  float near = clamp((3.8 - w) / 1.6, 0.0, 1.0);
  float pulse = pow(0.5 + 0.5 * cos(6.2831853 * (at.x * 4.0 - time * 0.05) + at.y * 0.9), 40.0);
  gl_PointSize = size * (1.1 + 1.8 * pulse) * (0.75 + 0.5 * near);
  vec3 col = mix(vec3(0.62, 0.74, 0.96), vec3(0.184, 0.435, 0.878), near);
  tint = vec4(mix(col, vec3(0.04, 0.05, 0.08), 0.85 * pulse), (0.3 + 0.55 * near) * (0.65 + 0.35 * pulse));
}`;
  const fragment = `
precision mediump float;
varying vec4 tint;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  gl_FragColor = vec4(tint.rgb, tint.a * smoothstep(0.25, 0.12, r));
}`;
  const prog = glProgram(gl, vertex, fragment);
  if (!prog) { canvas.hidden = true; return; }
  gl.useProgram(prog);
  const at = new Float32Array(THREADS * STEPS * 2);
  for (let k = 0, j = 0; k < THREADS; k++) for (let n = 0; n < STEPS; n++) { at[j++] = n / STEPS; at[j++] = k; }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, at, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'at');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.clearColor(1, 1, 1, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const uTime = gl.getUniformLocation(prog, 'time'), uTurn = gl.getUniformLocation(prog, 'turn'), uSize = gl.getUniformLocation(prog, 'size');
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const size = () => { fitCanvas(canvas, gl, scale); gl.uniform1f(uSize, scale); };
  const lean = { x: 0, y: 0 };
  const start = performance.now() - 30000;   // open on a tied shape rather than the seed
  const draw = (now) => {
    lean.x += (pointer.x - lean.x) * 0.05; lean.y += (pointer.y - lean.y) * 0.05;
    const secs = (now - start) / 1000;
    gl.uniform1f(uTime, secs);
    gl.uniform2f(uTurn, secs * 0.07 + lean.x * 0.7, 0.35 - lean.y * 0.5);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, THREADS * STEPS);
  };
  size(); draw(performance.now());
  addEventListener('resize', () => { size(); if (calm) draw(performance.now()); });
  if (!calm) whileVisible(canvas, draw);
})();

// The two figures count up once when they arrive.
(() => {
  if (calm) return;
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count), decimals = Number(el.dataset.decimals || 0), suffix = el.dataset.suffix || '';
    const format = (v) => (el.dataset.group ? Math.round(v).toLocaleString('en-US') : v.toFixed(decimals)) + suffix;
    const holder = el.closest('[data-reveal]');
    if (!holder) return;
    holder.addEventListener('revealed', () => {
      const start = performance.now(), dur = 1400;
      const tick = (now) => {
        const t = Math.min(1, (now - start) / dur), eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format(target * eased);
        if (t < 1) requestAnimationFrame(tick);
      };
      el.textContent = format(0);
      requestAnimationFrame(tick);
    }, { once: true });
  });
})();
