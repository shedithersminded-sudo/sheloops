// "Now playing" see-through CD player. Shows while anything plays, with my designed disc spinning inside.
import { el, clamp, select } from './util.js';
import { app, songEnd } from './state.js';
import { T, E, play, stop, currentPos } from './engine.js';
import { db } from './store.js';
import { faceCanvas, ensureDesign, listDesigns, designMoves } from './art.js';
import { look, saveLook } from './look.js';
import { isPreviewing } from './library.js';

const DEF = { mode: 'playing', color: '#ff7fbf', alpha: 0.55, size: 230, x: null, y: 20, disc: 'song', text: 'SHELOOPS', glitter: true,
  view: 'cd', vizOn: true, vizStyle: 'ring', vizColor: '', rainbow: false, vizGlow: 0.6, vizSens: 1, vizBars: 48 };
// fill in defaults in place (a fresh copy each call would leave drag and settings editing an old object)
const P = () => { const p = look.player ||= {}; for (const [k, v] of Object.entries(DEF)) if (p[k] === undefined) p[k] = v; return p; };
const COLORS = [['#ff7fbf', 'Pink'], ['#a46bff', 'Purple'], ['#4a9bff', 'Blue'], ['#44d48a', 'Green'], ['#ffb347', 'Orange'], ['#e8eef5', 'Clear'], ['#2a2a30', 'Smoke black']];

let box, cv, menu, angle = 0, speed = 0, discImg = null, discKey = '', loading = false, lidOpen = false, lid = 0;

// pick the disc: the open song's cover design, or a chosen design, or a plain silver disc
async function loadDisc() {
  const p = P(); let id = p.disc === 'song' ? (app.P && app.P.coverDesign) : p.disc;
  const key = id + ':' + (app.P ? app.P.id : '');
  if (key === discKey || loading) return; loading = true; discKey = key;
  let d = id ? await db.get('designs', id).catch(() => null) : null;
  if (!d && p.disc === 'song') { const all = await listDesigns(); d = all[0] || null; } // fall back to my latest design
  discImg = d ? await faceCanvas(ensureDesign(d), 'disc', { size: 600 }) : null;
  discDesign = d; loading = false;
}
// a disc with a GIF on it is redrawn a few times a second so it keeps moving
let discDesign = null, discT = 0;
async function animateDisc() {
  if (!discDesign || loading || performance.now() - discT < 90 || !designMoves(discDesign, 'disc')) return;
  discT = performance.now(); loading = true; discImg = await faceCanvas(discDesign, 'disc', { size: 400 }); loading = false;
}
export function refreshDisc() { discKey = ''; }

function playing() { return T.playing || isPreviewing(); }
function shouldShow() { const m = P().mode; return m === 'always' || (m === 'playing' && playing()); }

function build() {
  const p = P(); // same object every time now
  box = el('div', { id: 'nowplaying' });
  cv = el('canvas');
  const gear = el('button', { class: 'np-btn np-gear', title: 'Customize', onclick: e => { e.stopPropagation(); toggleMenu(); } }, '⚙');
  const min = el('button', { class: 'np-btn np-min', title: 'Close (shrink to a small disc)', onclick: e => { e.stopPropagation(); setCollapsed(true); } }, '–');
  const grip = el('div', { class: 'np-grip', title: 'Drag to move' }, '⠿ drag');
  const quick = el('div', { class: 'np-quick', title: 'Pick a visualizer' }, el('button', { class: 'np-btn', title: 'Previous visualizer', onclick: e => { e.stopPropagation(); cycleViz(-1); } }, '◀'), el('span', { class: 'np-qname' }), el('button', { class: 'np-btn', title: 'Next visualizer', onclick: e => { e.stopPropagation(); cycleViz(1); } }, '▶'));
  quick.addEventListener('pointerdown', e => e.stopPropagation());
  box.append(cv, gear, min, grip, quick); updateQuick();
  document.body.append(box);
  // drag anywhere to move; a click without moving presses the drawn buttons (or opens the small disc)
  box.addEventListener('pointerdown', e => {
    if (e.target.closest('.np-btn')) return;
    const r = box.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top, sx = e.clientX, sy = e.clientY;
    let moved = false; try { box.setPointerCapture(e.pointerId); } catch { } box.classList.add('dragging');
    box.onpointermove = ev => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moved = true; p.x = clamp(ev.clientX - ox, 0, innerWidth - 50); p.y = clamp(ev.clientY - oy, 0, innerHeight - 50); place();
    };
    box.onpointerup = ev => {
      box.onpointermove = null; box.classList.remove('dragging');
      if (moved) { saveLook(); return; }
      if (p.collapsed) { setCollapsed(false); return; }
      if (p.view === 'viz') { if (app.P) (T.playing ? stop() : play()); return; }
      const u = cv.clientWidth / 1000; hitButton((ev.clientX - r.left) / u, (ev.clientY - r.top) / u);
    };
  });
  addEventListener('resize', () => box && place());
  place();
}
function cycleViz(d) {
  const p = P(), i = VIZ_STYLES.findIndex(x => x[0] === p.vizStyle), n = VIZ_STYLES[(i + d + VIZ_STYLES.length) % VIZ_STYLES.length][0];
  p.vizStyle = n; p.vizOn = true; saveLook(); updateQuick(); if (menu) { toggleMenu(); toggleMenu(); }
}
function updateQuick() { const q = box && box.querySelector('.np-qname'); if (q) q.textContent = (VIZ_STYLES.find(x => x[0] === P().vizStyle) || ['', 'Ring'])[1]; }
function setCollapsed(v) { P().collapsed = v; saveLook(); if (v && menu) { menu.remove(); menu = null; } place(); }
function place() {
  const p = P(), s = p.collapsed ? 64 : p.size, viz = p.view === 'viz' && !p.collapsed, w = viz ? Math.round(s * 1.5) : s, h = viz ? Math.round(s * 0.55) : s;
  box.classList.toggle('collapsed', !!p.collapsed); box.classList.toggle('vizonly', viz);
  cv.width = Math.round(w * devicePixelRatio); cv.height = Math.round(h * devicePixelRatio); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  box.style.width = w + 'px';
  const x = p.x == null ? innerWidth - w - 24 : p.x;
  const y = p.x == null && viz ? innerHeight - h - 70 : p.y; // the mini visualizer starts in the bottom corner, out of the way
  box.style.left = clamp(x, 0, Math.max(0, innerWidth - w)) + 'px'; box.style.top = clamp(y, 0, Math.max(0, innerHeight - h)) + 'px';
  box.title = p.collapsed ? 'Click to open the CD player, drag to move' : '';
}
function hitButton(x, y) {
  if (x > 900 && x < 965 && y > 690 && y < 830) { lidOpen = !lidOpen; if (lidOpen && !menu) toggleMenu(); return true; } // OPEN: lift the lid to swap the disc
  if (y > 900 && y < 975) {
    if (x > 120 && x < 300) { if (app.P) { stop(); app.playhead = 0; } return true; } // back to start
    if (x > 700 && x < 880) { if (app.P) (T.playing ? stop() : play()); return true; } // play / stop
  }
  return false;
}

function toggleMenu() {
  if (menu) { menu.remove(); menu = null; lidOpen = false; return; }
  const p = P(), set = (k, v) => { p[k] = v; saveLook(); if (k === 'size') place(); if (k === 'disc') refreshDisc(); };
  const dock = (cx, cy) => { const w = box.offsetWidth, h = box.offsetHeight; p.x = cx ? innerWidth - w - 16 : 16; p.y = cy ? innerHeight - h - 70 : 70; saveLook(); place(); };
  menu = el('div', { class: 'np-menu panel' + (p.menuMin ? ' min' : '') }, el('div', { class: 'np-mbody' },
    el('div', { class: 'np-dock' }, el('span', { class: 'hint' }, 'Move player to:'),
      [['↖', 0, 0, 'Top left'], ['↗', 1, 0, 'Top right'], ['↙', 0, 1, 'Bottom left'], ['↘', 1, 1, 'Bottom right']].map(([a, x, y, t]) => el('button', { class: 'sq', title: t, onclick: () => dock(x, y) }, a)),
      el('button', { title: 'Shrink the player to a small disc', onclick: () => setCollapsed(!p.collapsed) }, p.collapsed ? 'Open player' : 'Minimize player')),
    el('b', {}, 'Player and visualizer'),
    el('div', { class: 'np-views' }, [['cd', 'CD player'], ['viz', 'Visualizer only']].map(([v, l]) => el('button', { class: 'chip' + (p.view === v ? ' on' : ''), onclick: () => { set('view', v); place(); toggleMenu(); toggleMenu(); } }, l))),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: p.view === 'viz' || p.vizOn, disabled: p.view === 'viz', onchange: e => set('vizOn', e.target.checked) }), 'Music visualizer'),
    el('div', { class: 'np-views' }, VIZ_STYLES.map(([v, l]) => el('button', { class: 'chip' + (p.vizStyle === v ? ' on' : ''), onclick: () => { set('vizStyle', v); toggleMenu(); toggleMenu(); } }, l))),
    el('div', { class: 'np-colors' }, el('span', { class: 'hint' }, 'Visualizer color'), el('input', { type: 'color', value: p.vizColor || p.color, oninput: e => set('vizColor', e.target.value) }),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: p.rainbow, onchange: e => set('rainbow', e.target.checked) }), 'Rainbow')),
    el('label', { class: 'knob' }, 'Glow', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: p.vizGlow, oninput: e => set('vizGlow', +e.target.value) })),
    el('label', { class: 'knob' }, 'Bounce (how much it reacts)', el('input', { type: 'range', min: 0.4, max: 2.5, step: 0.05, value: p.vizSens, oninput: e => set('vizSens', +e.target.value) })),
    el('label', { class: 'knob' }, 'Number of bars', el('input', { type: 'range', min: 16, max: 96, step: 4, value: p.vizBars, oninput: e => set('vizBars', +e.target.value) })),
    el('b', {}, 'Player look'),
    el('label', { class: 'num' }, 'Show', select([['playing', 'While playing'], ['always', 'Always'], ['never', 'Never']], p.mode, v => set('mode', v))),
    el('div', { class: 'np-colors' }, COLORS.map(([c, n]) => el('button', { class: 'swatchbtn', title: n, style: `background:${c}`, onclick: () => set('color', c) })),
      el('input', { type: 'color', value: p.color, oninput: e => set('color', e.target.value) })),
    el('label', { class: 'knob' }, 'See-through', el('input', { type: 'range', min: 0.1, max: 0.95, step: 0.01, value: p.alpha, oninput: e => set('alpha', +e.target.value) })),
    el('label', { class: 'knob' }, 'Size', el('input', { type: 'range', min: 140, max: 420, step: 5, value: p.size, oninput: e => set('size', +e.target.value) })),
    el('label', { class: 'num' }, 'Lid text', el('input', { class: 'textin', value: p.text, maxlength: 24, oninput: e => set('text', e.target.value) })),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: p.glitter, onchange: e => set('glitter', e.target.checked) }), 'Glitter window'),
    el('label', { class: 'num' }, 'Disc', select([['song', 'My song\'s cover design']], p.disc, v => set('disc', v), { id: 'np-disc' })),
    el('button', { onclick: () => { p.x = null; p.y = 20; saveLook(); place(); } }, 'Reset position'),
    el('button', { onclick: () => setCollapsed(true) }, 'Close to small disc'),
    el('button', { onclick: toggleMenu }, 'Close')));
  // title bar: drag to move, minimize, close
  const bar = el('div', { class: 'np-mbar', title: 'Drag to move' }, el('span', { class: 'grip' }, '⠿'), el('b', {}, 'Player settings'), el('span', { class: 'spacer' }),
    el('button', { class: 'sq', title: p.menuMin ? 'Open' : 'Minimize', onclick: e => { e.stopPropagation(); p.menuMin = !p.menuMin; saveLook(); menu.classList.toggle('min', p.menuMin); fitMenu(); e.target.textContent = p.menuMin ? '▢' : '–'; } }, p.menuMin ? '▢' : '–'),
    el('button', { class: 'sq', title: 'Close', onclick: e => { e.stopPropagation(); toggleMenu(); } }, '×'));
  menu.prepend(bar);
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r0 = menu.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top; bar.setPointerCapture(e.pointerId);
    bar.onpointermove = ev => { p.menuX = clamp(ev.clientX - ox, 0, innerWidth - 120); p.menuY = clamp(ev.clientY - oy, 0, innerHeight - 40); menu.style.left = p.menuX + 'px'; menu.style.top = p.menuY + 'px'; };
    bar.onpointerup = () => { bar.onpointermove = null; saveLook(); };
  });
  document.body.append(menu);
  const r = box.getBoundingClientRect();
  // open beside the player, on whichever side has room
  const left = r.left - 262 >= 8 ? r.left - 262 : (r.right + 12 + 250 <= innerWidth ? r.right + 12 : clamp(r.left, 8, innerWidth - 260));
  if (p.menuX != null) { menu.style.left = clamp(p.menuX, 0, innerWidth - 120) + 'px'; menu.style.top = clamp(p.menuY, 0, innerHeight - 40) + 'px'; }
  else { menu.style.left = left + 'px'; menu.style.top = clamp(r.top, 8, Math.max(8, innerHeight - 440)) + 'px'; }
  fitMenu();
  listDesigns().then(ds => { const s = menu && menu.querySelector('#np-disc'); if (!s) return; for (const d of ds.filter(x => !x.template)) s.append(el('option', { value: d.id, selected: p.disc === d.id }, d.name)); });
}

// keep the whole settings window on screen
function fitMenu() {
  if (!menu) return;
  const r = menu.getBoundingClientRect();
  if (r.bottom > innerHeight - 8) menu.style.top = Math.max(8, innerHeight - 8 - r.height) + 'px';
  if (r.right > innerWidth - 8) menu.style.left = Math.max(8, innerWidth - 8 - r.width) + 'px';
}
addEventListener('resize', fitMenu);

// ---------- visualizer ----------
const VIZ_STYLES = [['ring', 'Ring'], ['bars', 'Bars'], ['mirror', 'Mirror'], ['wave', 'Wave'], ['dots', 'Dots'], ['spectrum', 'Spectrum'], ['blocks', 'LED blocks'], ['orb', 'Orb'], ['particles', 'Particles'], ['halo', 'Halo']];
let parts = [], fbuf = null, tbuf = null, smooth = new Float32Array(128), peaks = new Float32Array(128);
function vizData(n) {
  const an = E.g && E.g.analyser, p = P();
  if (an) {
    if (!fbuf || fbuf.length !== an.frequencyBinCount) { fbuf = new Uint8Array(an.frequencyBinCount); tbuf = new Uint8Array(an.fftSize); }
    an.getByteFrequencyData(fbuf); an.getByteTimeDomainData(tbuf);
  }
  const live = an && playing(), now = performance.now() / 1000;
  for (let i = 0; i < n; i++) {
    let v;
    if (live) { // log spaced bands, bass on the left
      const a = Math.floor(Math.pow(i / n, 1.8) * fbuf.length * 0.7), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.8) * fbuf.length * 0.7));
      let m = 0; for (let k = a; k < b; k++) m = Math.max(m, fbuf[k]); v = Math.pow(m / 255, 1.4) * p.vizSens * (1 + i / n * 0.6);
    } else v = 0.06 + 0.05 * Math.sin(now * 2 + i * 0.4); // idle: gentle breathing
    v = Math.min(1, v);
    smooth[i] += (v - smooth[i]) * (v > smooth[i] ? 0.6 : 0.18);
    peaks[i] = Math.max(smooth[i], peaks[i] - 0.012);
  }
  return { bars: smooth, peaks, wave: live ? tbuf : null };
}
const vcol = (p, i, n) => p.rainbow ? `hsl(${(i / n * 300 + performance.now() / 20) % 360} 100% 62%)` : (p.vizColor || p.color);
function glow(g, p, c) { g.shadowColor = c; g.shadowBlur = p.vizGlow * 24 * devicePixelRatio; }
// draws the chosen style inside a box (x, y, w, h) or around a circle (ring)
function drawViz(g, p, x, y, w, h, ring) {
  const n = ring ? Math.max(32, p.vizBars) : p.vizBars, d = vizData(n), st = ring ? 'ring' : p.vizStyle;
  g.save(); g.lineCap = 'round';
  if (st === 'ring') {
    const { cx, cy, r, len } = ring || { cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) * 0.26, len: Math.min(w, h) * 0.22 };
    g.lineWidth = Math.max(3, 2 * Math.PI * r / n * 0.55);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + i / n * Math.PI * 2, v = d.bars[i < n / 2 ? i * 2 : (n - i) * 2 - 1] || d.bars[i], c = vcol(p, i, n);
      g.strokeStyle = c; glow(g, p, c);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * (r + 6 + v * len), cy + Math.sin(a) * (r + 6 + v * len)); g.stroke();
    }
  } else if (st === 'spectrum') { // smooth filled curve
    const c = vcol(p, 0, 1), gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, c); gr.addColorStop(1, 'transparent');
    g.beginPath(); g.moveTo(x, y + h);
    for (let i = 0; i < n; i++) { const X = x + i / (n - 1) * w, Y = y + h - d.bars[i] * h; if (i) { const px = x + (i - 1) / (n - 1) * w, py = y + h - d.bars[i - 1] * h; g.quadraticCurveTo(px, py, (px + X) / 2, (py + Y) / 2); } else g.lineTo(X, Y); }
    g.lineTo(x + w, y + h); g.closePath(); g.globalAlpha = 0.55; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = c; g.lineWidth = Math.max(2, h / 40); glow(g, p, c); g.stroke();
  } else if (st === 'blocks') { // LED blocks, green to yellow to red
    const bw = w / n, rows = 12, rh = h / rows;
    for (let i = 0; i < n; i++) { const lit = Math.round(d.bars[i] * rows); for (let j = 0; j < rows; j++) {
      const on = j < lit, c = p.rainbow ? vcol(p, i, n) : j > 9 ? '#ff4a5e' : j > 6 ? '#ffd84a' : (p.vizColor || '#6dffb0');
      g.globalAlpha = on ? 1 : 0.08; g.fillStyle = c; if (on) glow(g, p, c); else g.shadowBlur = 0; g.fillRect(x + i * bw + bw * 0.12, y + h - (j + 1) * rh + rh * 0.15, bw * 0.76, rh * 0.7); } }
    g.globalAlpha = 1;
  } else if (st === 'orb') { // glowing orb that swells with the bass
    const bass = (d.bars[0] + d.bars[1] + d.bars[2] + d.bars[3]) / 4, cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * (0.16 + bass * 0.22), c = vcol(p, 0, 1);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, c); gr.addColorStop(1, 'transparent');
    g.fillStyle = gr; glow(g, p, c); g.beginPath(); g.arc(cx, cy, R * 1.6, 0, 7); g.fill();
    g.lineWidth = 2; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, v = d.bars[i]; g.strokeStyle = vcol(p, i, n); g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 1.7, cy + Math.sin(a) * R * 1.7); g.lineTo(cx + Math.cos(a) * (R * 1.7 + v * Math.min(w, h) * 0.3), cy + Math.sin(a) * (R * 1.7 + v * Math.min(w, h) * 0.3)); g.stroke(); }
  } else if (st === 'particles') { // sparks thrown out by the music
    const lvl = d.bars.reduce((a, v) => a + v, 0) / n, cx = x + w / 2, cy = y + h / 2;
    for (let k = 0; k < Math.round(lvl * 10); k++) { const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random()) * Math.min(w, h) * 0.02; parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: vcol(p, Math.floor(Math.random() * n), n) }); }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
    for (const q of parts) { q.x += q.vx; q.y += q.vy; q.life -= 0.015; if (q.life <= 0 || q.x < x || q.x > x + w || q.y < y || q.y > y + h) continue; g.globalAlpha = q.life; g.fillStyle = q.c; glow(g, p, q.c); g.beginPath(); g.arc(q.x, q.y, 2 + q.life * 4, 0, 7); g.fill(); }
    for (let k = parts.length - 1; k >= 0; k--) if (parts[k].life <= 0) parts.splice(k, 1);
    g.globalAlpha = 1;
  } else if (st === 'halo') { // waveform wrapped around a circle
    const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) * 0.3, c = vcol(p, 0, 1); g.strokeStyle = c; g.lineWidth = Math.max(2, h / 60); glow(g, p, c); g.beginPath();
    for (let i = 0; i <= 180; i++) { const a = i / 180 * Math.PI * 2, v = d.wave ? (d.wave[Math.floor(i / 180 * (d.wave.length - 1))] - 128) / 128 * p.vizSens : Math.sin(i / 6 + performance.now() / 300) * 0.05, r = R + v * R * 0.8; const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
    g.closePath(); g.stroke();
  } else if (st === 'wave') {
    g.lineWidth = Math.max(3, h / 30); const c = vcol(p, 0, 1); g.strokeStyle = c; glow(g, p, c); g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const v = d.wave ? (d.wave[Math.floor(i / 200 * (d.wave.length - 1))] - 128) / 128 * p.vizSens : Math.sin(i / 12 + performance.now() / 400) * 0.08;
      const X = x + i / 200 * w, Y = y + h / 2 + v * h * 0.45; i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
  } else { // bars, mirror, dots
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const v = d.bars[i], c = vcol(p, i, n), X = x + i * bw + bw * 0.15, W = bw * 0.7;
      g.fillStyle = c; glow(g, p, c);
      if (st === 'mirror') { const H = Math.max(2, v * h * 0.5); g.fillRect(X, y + h / 2 - H, W, H * 2); }
      else if (st === 'dots') { const k = Math.round(v * 10); for (let j = 0; j < k; j++) { g.beginPath(); g.arc(X + W / 2, y + h - (j + 0.5) * h / 10, W * 0.4, 0, 7); g.fill(); } }
      else { const H = Math.max(2, v * h); g.fillRect(X, y + h - H, W, H); g.globalAlpha = 0.9; g.fillRect(X, y + h - d.peaks[i] * h - 4, W, 3); g.globalAlpha = 1; }
    }
  }
  g.restore();
}
function drawVizOnly(dt) {
  const p = P(), g = cv.getContext('2d'), k = cv.width / 1000, H = 1000 * cv.height / cv.width;
  g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1000, H);
  g.save(); g.beginPath(); g.roundRect(8, 8, 984, H - 16, 40); g.fillStyle = p.color; g.globalAlpha = p.alpha * 0.55; g.fill();
  g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 4; g.stroke(); g.clip();
  drawViz(g, p, 50, 60, 900, H - 150);
  g.restore();
  // name and time strip
  const pos = T.playing ? currentPos() : app.playhead || 0, t = `${String(Math.floor(pos / 60)).padStart(2, '0')}:${String(Math.floor(pos % 60)).padStart(2, '0')}`;
  g.fillStyle = 'rgba(255,255,255,.92)'; g.font = '700 40px "Cascadia Mono", monospace'; g.textBaseline = 'middle'; g.textAlign = 'left';
  g.shadowColor = p.vizColor || p.color; g.shadowBlur = p.vizGlow * 16 * devicePixelRatio;
  g.fillText((playing() ? '▶ ' : '■ ') + t, 50, H - 50);
  g.textAlign = 'right'; g.font = '600 34px "Cascadia Mono", monospace'; g.fillText((app.P ? app.P.name : '').slice(0, 26), 950, H - 50);
  g.shadowBlur = 0;
}

// ---------- drawing ----------
function body(g) { // rounded "squircle" player shape
  g.beginPath(); g.moveTo(140, 30); g.lineTo(860, 30); g.quadraticCurveTo(975, 30, 975, 170); g.lineTo(975, 820);
  g.quadraticCurveTo(975, 985, 820, 985); g.lineTo(180, 985); g.quadraticCurveTo(25, 985, 25, 820); g.lineTo(25, 170); g.quadraticCurveTo(25, 30, 140, 30); g.closePath();
}
function drawMini() { // small spinning disc bubble when closed
  const p = P(), g = cv.getContext('2d'), k = cv.width / 1000;
  g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1000, 1000);
  g.save(); g.beginPath(); g.arc(500, 500, 480, 0, 7); g.fillStyle = p.color; g.globalAlpha = 0.9; g.fill(); g.restore();
  g.save(); g.translate(500, 500); g.rotate(angle); g.beginPath(); g.arc(0, 0, 400, 0, 7); g.clip();
  if (discImg) g.drawImage(discImg, -400, -400, 800, 800); else { g.fillStyle = '#cfd4da'; g.fillRect(-400, -400, 800, 800); }
  g.restore();
  g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(500, 500, 60, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 24; g.beginPath(); g.arc(500, 500, 470, 0, 7); g.stroke();
}
function draw(dt) {
  const p = P(), g = cv.getContext('2d'), k = cv.width / 1000;
  if (p.collapsed) return drawMini();
  if (p.view === 'viz') return drawVizOnly(dt);
  lid += ((lidOpen ? 1 : 0) - lid) * Math.min(1, dt * 8);
  g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, 1000, 1000);
  const cx = 500, cy = 440, R = 360;
  // the disc inside, spinning
  g.save(); g.translate(cx, cy); g.rotate(angle);
  if (discImg) g.drawImage(discImg, -R, -R, 2 * R, 2 * R);
  else { const dg = g.createRadialGradient(0, 0, 40, 0, 0, R); dg.addColorStop(0, '#e8ebef'); dg.addColorStop(0.6, '#b9bfc8'); dg.addColorStop(1, '#eef0f3'); g.fillStyle = dg; g.beginPath(); g.arc(0, 0, R, 0, 7); g.arc(0, 0, 46, 0, 7, true); g.fill('evenodd'); }
  g.restore();
  // rainbow glint that stays still while the disc turns (like light on a real disc)
  const cg = g.createConicGradient(1.1, cx, cy); ['#ff4d6d00', '#ffd24d55', '#5dff8a00', '#4dd2ff55', '#a64dff00', '#ff4dd255', '#ff4d6d00'].forEach((c, i, a) => cg.addColorStop(i / (a.length - 1), c));
  g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.arc(cx, cy, 120, 0, 7, true); g.fill('evenodd'); g.restore();
  // translucent body over everything
  // body around the disc (always), and the lid over the disc (fades as it opens)
  g.save(); body(g); g.beginPath(); g.arc(cx, cy, R + 40, 0, 7, true); g.clip('evenodd'); body(g); g.globalAlpha = p.alpha; g.fillStyle = p.color; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R + 40, 0, 7); g.globalAlpha = p.alpha * (1 - lid * 0.85); g.fillStyle = p.color; g.fill(); g.restore();
  g.save(); body(g); g.clip(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = p.alpha * 0.5 * (1 - lid * 0.8); g.fillStyle = p.color; g.fill(); g.restore();
  g.save(); g.translate(0, -lid * 60);
  // lid: circle, ribs, spindle cap
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, R + 40, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 3;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; g.beginPath(); g.moveTo(cx + Math.cos(a) * 70, cy + Math.sin(a) * 70); g.lineTo(cx + Math.cos(a) * (R + 40), cy + Math.sin(a) * (R + 40)); g.stroke(); }
  g.beginPath(); g.arc(cx, cy, 70, 0, 7); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx, cy, 34, 0, 7); g.fill();
  g.restore();
  if (p.vizOn) { if (p.vizStyle === 'ring') drawViz(g, p, 0, 0, 0, 0, { cx, cy, r: R + 44, len: 62 }); else if (['orb', 'particles', 'halo'].includes(p.vizStyle)) { g.save(); g.globalCompositeOperation = 'screen'; drawViz(g, p, cx - R, cy - R, 2 * R, 2 * R); g.restore(); } else drawViz(g, p, 70, 800, 820, 85); }
  // laser window (curved slot) with glitter
  g.beginPath(); g.arc(cx, cy, 300, Math.PI * 0.18, Math.PI * 0.82); g.arc(cx, cy, 225, Math.PI * 0.8, Math.PI * 0.2, true); g.closePath();
  g.save(); g.fillStyle = p.color; g.globalAlpha = Math.min(1, p.alpha + 0.35); g.fill(); g.restore();
  if (p.glitter) { g.save(); g.clip(); for (let i = 0; i < 70; i++) { const a = Math.PI * (0.18 + ((i * 0.618) % 1) * 0.64), r = 225 + ((i * 0.37) % 1) * 75, tw = 0.4 + 0.6 * Math.abs(Math.sin(performance.now() / 300 + i)); g.fillStyle = `rgba(255,255,255,${tw * 0.8})`; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 3, 3); } g.restore(); }
  // lid text
  g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 800 48px "Space Grotesk", Arial, sans-serif'; g.fillText(p.text || '', cx, cy + 165);
  // buttons + display
  const btn = (x, label) => { const gr = g.createLinearGradient(0, 905, 0, 970); gr.addColorStop(0, '#f4f5f7'); gr.addColorStop(1, '#9aa0a8'); g.fillStyle = gr; g.beginPath(); g.roundRect(x, 905, 180, 62, 30); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#333'; g.font = '700 30px Arial'; g.fillText(label, x + 90, 937); };
  btn(120, '|◀◀'); btn(700, playing() ? '■' : '▶');
  g.fillStyle = '#2b2d2f'; g.beginPath(); g.roundRect(330, 895, 340, 80, 10); g.fill();
  g.fillStyle = '#a8c09a'; g.beginPath(); g.roundRect(342, 905, 316, 60, 6); g.fill();
  const pos = T.playing ? currentPos() : app.playhead || 0, mm = Math.floor(pos / 60), ss = Math.floor(pos % 60);
  g.fillStyle = '#23301f'; g.font = '700 34px "Cascadia Mono", monospace'; g.textAlign = 'left';
  g.fillText(`${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 356, 936);
  const name = app.P ? app.P.name : '', avail = 170; g.font = '600 22px "Cascadia Mono", monospace';
  const w = g.measureText(name).width, off = w > avail ? (performance.now() / 40) % (w + 40) : 0;
  g.save(); g.beginPath(); g.rect(470, 905, avail, 60); g.clip(); g.fillText(name, 470 - off, 936); if (w > avail) g.fillText(name, 470 - off + w + 40, 936); g.restore();
  // open button + edges + glare
  g.fillStyle = '#f3e3c3'; g.beginPath(); g.roundRect(905, 700, 50, 120, 20); g.fill();
  g.fillStyle = '#9a7a4a'; g.font = '700 20px Arial'; g.save(); g.translate(930, 760); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText(lidOpen ? 'CLOSE' : 'OPEN', 0, 0); g.restore();
  body(g); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 5; g.stroke();
  g.save(); body(g); g.clip(); const gl = g.createLinearGradient(0, 0, 1000, 1000); gl.addColorStop(0.28, 'rgba(255,255,255,0)'); gl.addColorStop(0.34, 'rgba(255,255,255,.18)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, 1000, 1000); g.restore();
}

// called every frame from main.js
let last = performance.now();
export function nowPlayingTick() {
  const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
  const show = shouldShow();
  if (!show) { if (box) box.style.display = 'none'; if (menu && P().mode === 'never') { menu.remove(); menu = null; } return; }
  if (!box) build();
  box.style.display = '';
  loadDisc(); animateDisc();
  // spin up to about 3.5 turns per second while playing, slow down when stopped
  const target = playing() ? 3.5 * Math.PI * 2 : 0; speed += (target - speed) * Math.min(1, dt * 2.5); angle += speed * dt;
  draw(dt);
}
export function openPlayerSettings() { if (!box) { P().mode = P().mode === 'never' ? 'playing' : P().mode; build(); } toggleMenu(); }
