// "Now playing" see-through CD player. Shows while anything plays, with my designed disc spinning inside.
import { el, clamp, select } from './util.js';
import { app, songEnd } from './state.js';
import { T, play, stop, currentPos } from './engine.js';
import { db } from './store.js';
import { faceCanvas, ensureDesign, listDesigns } from './art.js';
import { look, saveLook } from './look.js';
import { isPreviewing } from './library.js';

const DEF = { mode: 'playing', color: '#ff7fbf', alpha: 0.55, size: 230, x: null, y: 20, disc: 'song', text: 'SHELOOPS', glitter: true };
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
  loading = false;
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
  box.append(cv, gear, min, grip);
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
      const u = cv.clientWidth / 1000; hitButton((ev.clientX - r.left) / u, (ev.clientY - r.top) / u);
    };
  });
  addEventListener('resize', () => box && place());
  place();
}
function setCollapsed(v) { P().collapsed = v; saveLook(); if (v && menu) { menu.remove(); menu = null; } place(); }
function place() {
  const p = P(), s = p.collapsed ? 64 : p.size;
  box.classList.toggle('collapsed', !!p.collapsed);
  cv.width = cv.height = Math.round(s * devicePixelRatio); cv.style.width = cv.style.height = s + 'px';
  box.style.width = s + 'px';
  const x = p.x == null ? innerWidth - s - 24 : p.x;
  box.style.left = clamp(x, 0, Math.max(0, innerWidth - s)) + 'px'; box.style.top = clamp(p.y, 0, Math.max(0, innerHeight - s)) + 'px';
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
  menu = el('div', { class: 'np-menu panel' },
    el('b', {}, 'CD player'),
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
    el('button', { onclick: toggleMenu }, 'Close'));
  document.body.append(menu);
  const r = box.getBoundingClientRect();
  // open beside the player, on whichever side has room
  const left = r.left - 262 >= 8 ? r.left - 262 : (r.right + 12 + 250 <= innerWidth ? r.right + 12 : clamp(r.left, 8, innerWidth - 260));
  menu.style.left = left + 'px'; menu.style.top = clamp(r.top, 8, Math.max(8, innerHeight - 440)) + 'px';
  listDesigns().then(ds => { const s = menu && menu.querySelector('#np-disc'); if (!s) return; for (const d of ds.filter(x => !x.template)) s.append(el('option', { value: d.id, selected: p.disc === d.id }, d.name)); });
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
  loadDisc();
  // spin up to about 3.5 turns per second while playing, slow down when stopped
  const target = playing() ? 3.5 * Math.PI * 2 : 0; speed += (target - speed) * Math.min(1, dt * 2.5); angle += speed * dt;
  draw(dt);
}
export function openPlayerSettings() { if (!box) { P().mode = P().mode === 'never' ? 'playing' : P().mode; build(); } toggleMenu(); }
