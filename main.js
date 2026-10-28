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
// gently toward the pointer. Drawn as near the screen's own pixel density as a fixed pixel budget allows,
// and stepped down on a device that can't keep up; paused off screen and in hidden tabs, frozen on one frame
// under reduced motion. Without WebGL the hero keeps its flat ground.
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
  float unit = min(res.x, res.y);   // the folds keep one size against the shorter side, so a phone shows as many as a laptop
  vec2 uv = gl_FragCoord.xy / unit * ZOOM + lean * 0.18;
  float t = time * 0.07;
  vec2 q = vec2(fbm(uv + vec2(0.0, t)), fbm(uv + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv + 2.3 * q + vec2(1.7, 9.2) + 0.6 * t), fbm(uv + 2.3 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(uv + 2.4 * r + lean * 0.12);
  // colour: white ground, cool silver, blue-grey folds
  float k = clamp((f - 0.24) / 0.46, 0.0, 1.0);
  vec3 col = mix(vec3(0.975, 0.98, 0.99), vec3(0.88, 0.9, 0.94), smoothstep(0.0, 0.38, k));
  col = mix(col, vec3(0.72, 0.77, 0.86), smoothstep(0.32, 0.68, k + 0.15 * (r.x - 0.5)));
  col = mix(col, vec3(0.53, 0.62, 0.8), smoothstep(0.6, 0.95, k + 0.18 * (q.y - 0.5)) * 0.5);
  // light the folds like pearl satin: a surface normal from the slope of the field, lit from the upper left
#ifdef GL_OES_standard_derivatives
  vec2 g = vec2(dFdx(f), dFdy(f)) * unit / ZOOM;
  vec3 n = normalize(vec3(-g * 0.8, 1.0));
  vec3 l = normalize(vec3(-0.5, 0.6, 0.62));
  float diffuse = clamp(dot(n, l), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(l + vec3(0.0, 0.0, 1.0))), 0.0, 1.0), 28.0);
  col *= 0.8 + 0.26 * diffuse;
  col += vec3(1.0) * spec * 0.22;
#endif
  col = min(col, vec3(1.0));
  vec2 s = gl_FragCoord.xy / res;
  col = mix(col, vec3(0.975, 0.98, 0.99), (1.0 - smoothstep(0.0, 0.6, s.x * 0.55 + s.y * 0.75)) * 0.6);   // lighter lower left, under the sentence
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;                                                            // a still, one-step dither against banding
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
  const BUDGET = 1.5e6;   // pixels drawn per frame at most; the field is soft, so it needs no more
  let quality = 1;
  const size = () => {
    const area = Math.max(1, canvas.clientWidth * canvas.clientHeight);
    fitCanvas(canvas, gl, Math.max(0.5, Math.min(window.devicePixelRatio || 1, Math.sqrt(BUDGET / area)) * quality));
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  // on a device that can't keep up, frames run long: if the typical gap over 90 frames passes 24ms, draw
  // fewer pixels, at most twice
  const gaps = [];
  let last = 0, steps = 0;
  const pace = (now) => {
    if (steps < 2 && last && now - last < 200) {   // a longer gap is a pause, not a slow frame
      gaps.push(now - last);
      if (gaps.length === 90) {
        gaps.sort((a, b) => a - b);
        if (gaps[45] > 24) { quality *= 0.7; steps++; size(); } else steps = 2;
        gaps.length = 0;
      }
    }
    last = now;
  };
  // the pull eases so the surface glides rather than jumps
  const lean = { x: 0, y: 0 };
  const start = performance.now() - 40000;   // open mid-flow rather than on the field's seed
  const draw = (now) => {
    pace(now);
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

// The dataset: all 2,806,605 data points in the Harvard database, drawn once as a still block, one dot each.
// The block stacks 14 layers, one per variable; each layer runs the 3,981 cities along one floor edge and the
// 53 years along the other. It is drawn in an even isometric view with dimension lines on its three edges,
// and the labels in the page are set beside them. The dots are counted into the canvas in slices as the
// figure nears the screen, so drawing never holds up scrolling.
(() => {
  const canvas = document.getElementById('dataset');
  if (!canvas || !('IntersectionObserver' in window)) return;
  const ctx = canvas.getContext('2d'), wrap = canvas.parentElement;
  if (!ctx) return;
  const TOTAL = 2806605, CITIES = 3981, YEARS = 53, VARS = 14, LAYER = CITIES * YEARS;
  const GAPS = 147297 / TOTAL;            // the grid has 2,953,902 cells; those without a data point are spread evenly through it
  const SIDE = 0.35, TALL = 0.24, TOP = 0.05, MID = 0.47;   // floor edge, height, space above and centre line, as shares of the canvas width (a little left of centre, leaving room for the side label)
  const COS = Math.cos(Math.PI / 6), SIN = 0.5;
  const TONES = [[47, 111, 224], [16, 38, 96]];   // alternate layers: cobalt and deep navy
  // a point in the block (cities, years, layers, each 0 to 1) to the canvas, in canvas widths
  const place = (x, z, y) => [MID + (x - z) * COS * SIDE, TOP + TALL + (x + z) * SIN * SIDE - y * TALL];
  const EDGES = [   // from, to, outward direction; one per label, in the page's order
    { a: place(0, 1, 0), b: place(1, 1, 0), out: [-SIN, COS] },   // cities
    { a: place(1, 1, 0), b: place(1, 0, 0), out: [SIN, COS] },    // years
    { a: place(1, 0, 0), b: place(1, 0, 1), out: [1, 0] },        // variables
  ];
  const LINE = 0.03, TICK = 0.008, LABEL = [0.062, 0.062, 0.048];   // how far out the dimension lines and labels sit, in canvas widths
  let drawnAt = 0, job = 0;
  const draw = () => {
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(canvas.clientWidth * scale), H = Math.round(canvas.clientHeight * scale);
    if (!W || !H) return;
    const run = ++job;
    drawnAt = canvas.clientWidth;
    const counts = [new Uint16Array(W * H), new Uint16Array(W * H)];
    let seed = 2463534242, i = 0;
    const slice = () => {
      if (run !== job) return;   // a resize started a fresh drawing
      for (const end = Math.min(TOTAL, i + 350000); i < end; i++) {
        const c = i + Math.floor(i * GAPS);
        const v = Math.floor(c / LAYER), rest = c - v * LAYER, year = Math.floor(rest / CITIES), city = rest - year * CITIES;
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        // each year is a soft row of cities, so the rows read as texture rather than as hard lines
        const [u, w] = place((city + 0.5) / CITIES, (year + 0.5 + 0.35 * ((seed >>> 0) / 4294967296 - 0.5)) / YEARS, v / (VARS - 1));
        counts[v & 1][Math.floor(w * W) * W + Math.floor(u * W)]++;
      }
      if (i < TOTAL) { setTimeout(slice, 0); return; }
      // each dot is a faint mark; where they stack the ink builds up. The mark is lighter on denser buffers
      // so the block carries the same weight at any size.
      const mark = 1 - Math.pow(0.8, (W * H) / 2200000), cover = new Float32Array(4096);
      for (let n = 0; n < 4096; n++) cover[n] = 1 - Math.pow(1 - mark, n);
      canvas.width = W; canvas.height = H;
      const img = ctx.createImageData(W, H), px = new Uint32Array(img.data.buffer), [A, B] = TONES;
      for (let p = 0; p < W * H; p++) {
        const na = counts[0][p], nb = counts[1][p], n = na + nb;
        if (!n) continue;
        const wa = na / n, wb = nb / n, alpha = Math.round(255 * cover[Math.min(n, 4095)]);
        px[p] = ((alpha << 24) | (Math.round(A[2] * wa + B[2] * wb) << 16) | (Math.round(A[1] * wa + B[1] * wb) << 8) | Math.round(A[0] * wa + B[0] * wb)) >>> 0;
      }
      ctx.putImageData(img, 0, 0);
      // dimension lines with end ticks, and the labels set just beyond them
      ctx.strokeStyle = '#8b93a3'; ctx.lineWidth = scale;
      const labels = wrap.querySelectorAll('.dataset-label');
      EDGES.forEach(({ a, b, out }, k) => {
        const at = (p, d) => [(p[0] + out[0] * d) * W, (p[1] + out[1] * d) * W];
        ctx.beginPath();
        ctx.moveTo(...at(a, LINE)); ctx.lineTo(...at(b, LINE));
        for (const p of [a, b]) { ctx.moveTo(...at(p, LINE - TICK)); ctx.lineTo(...at(p, LINE + TICK)); }
        ctx.stroke();
        const label = labels[k];
        if (label) {
          const mid = [(a[0] + b[0]) / 2 + out[0] * LABEL[k], (a[1] + b[1]) / 2 + out[1] * LABEL[k]];
          label.style.left = (mid[0] * 100).toFixed(2) + '%';
          label.style.top = (mid[1] * 100 * canvas.clientWidth / canvas.clientHeight).toFixed(2) + '%';
        }
      });
      wrap.classList.add('is-drawn');
    };
    slice();
  };
  const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); draw(); } }, { rootMargin: '1200px 0px' });
  io.observe(canvas);
  // redraw for a much wider or narrower figure, so it stays sharp
  let wait = 0;
  addEventListener('resize', () => { clearTimeout(wait); wait = setTimeout(() => { if (drawnAt && Math.abs(canvas.clientWidth - drawnAt) > drawnAt * 0.2) draw(); }, 250); });
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
