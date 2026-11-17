// Cover art + CD designer: data, storage, rendering, export. Artwork comes only from my uploads + drawn shapes/text.
import { loadAnim, frameOf, isMoving } from './gif.js';
import { uid, clamp } from './util.js';
import { db } from './store.js';

// ---------- sizes (300 dpi) ----------
export const DPI = 300, MM = DPI / 25.4;
export const FACES = {
  cover:   { name: 'Front cover', w: 1417, h: 1417, mm: '120 x 120 mm', bleed: true },
  back:    { name: 'Back cover', w: 1772, h: 1394, mm: '150 x 118 mm (with spines)', bleed: true, spine: Math.round(6.5 * MM) },
  disc:    { name: 'Disc label', w: 1394, h: 1394, mm: '118 mm disc, 15 mm hole', disc: true },
  booklet: { name: 'Booklet page', w: 1417, h: 1417, mm: '120 x 120 mm', bleed: true },
  mdlabel: { name: 'MiniDisc label', w: 900, h: 640, mm: 'shutter label' },
};
export const DISC = { R: 697, HOLE: 89, HUB: 195, PRINT: 130 };
export const FONTS = ['Unbounded', 'Anton', 'Bebas Neue', 'Playfair Display', 'Abril Fatface', 'Cinzel', 'Pacifico', 'Great Vibes', 'Lobster', 'Permanent Marker', 'Monoton', 'Righteous', 'Bungee', 'Press Start 2P', 'Rubik Glitch', 'UnifrakturMaguntia', 'Space Grotesk', 'Arial', 'Georgia', 'Impact', 'Courier New', 'Cascadia Mono'];
// ---------- sticker looks: die-cut edge, finishes, peeling corner, wear ----------
export const FINISHES = [['none', 'Plain print'], ['gloss', 'Gloss'], ['holo', 'Hologram'], ['gold', 'Gold foil'], ['silverfoil', 'Silver foil'], ['chrome', 'Chrome'], ['glitter', 'Glitter'], ['matte', 'Matte paper'], ['neon', 'Neon glow']];
let artTime = null; // fixed time while exporting a GIF, otherwise the clock
export const setArtTime = v => { artTime = v; };
const artNow = () => artTime ?? performance.now();
const HOLO_NAMES = ['limited', 'new', 'sparkle', 'star', 'crown'];
export const stickerFx = l => l.sfx || (l.type === 'sticker' ? { outline: ['tape', 'barcode'].includes(l.name) ? 0 : 12, outlineColor: '#ffffff', finish: l.name === 'tape' ? 'none' : HOLO_NAMES.includes(l.name) ? 'holo' : 'gloss', shadow: l.name !== 'tape', peel: false, wear: 0 } : null);
const mkc = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
function seeded(n) { let x = n % 2147483647 || 7; return () => (x = x * 16807 % 2147483647) / 2147483647; }
// draws a layer through its sticker look. draw(ctx) paints the plain layer centered at 0,0
function drawStickerFx(g, l, fx, draw) {
  const W = l.w, H = l.h, o = fx.outline || 0, pad = o + (fx.shadow ? 40 : 6), sc = Math.min(1, 1000 / Math.max(W + 2 * pad, H + 2 * pad));
  const cw = (W + 2 * pad) * sc, ch = (H + 2 * pad) * sc, t = artNow();
  const A = mkc(cw, ch), a = A.getContext('2d'); a.scale(sc, sc); a.translate(W / 2 + pad, H / 2 + pad); draw(a);
  let B = A;
  if (o > 0) { // die-cut edge: the shape grown outward in the edge color
    const S = mkc(cw, ch), s2 = S.getContext('2d'); s2.drawImage(A, 0, 0); s2.globalCompositeOperation = 'source-in'; s2.fillStyle = fx.outlineColor || '#fff'; s2.fillRect(0, 0, cw, ch);
    B = mkc(cw, ch); const b = B.getContext('2d'), r = o * sc;
    for (let k = 0; k < 24; k++) { const an = k / 24 * Math.PI * 2; b.drawImage(S, Math.cos(an) * r, Math.sin(an) * r); }
    b.drawImage(S, 0, 0); b.drawImage(A, 0, 0);
  }
  const b = B.getContext('2d');
  if (fx.finish && fx.finish !== 'none') {
    const C = mkc(cw, ch), c = C.getContext('2d'), R = seeded((l.id || 'x').split('').reduce((q, ch2) => q * 31 + ch2.charCodeAt(0), 7));
    const sweep = (t / 4000) % 1, ang = (fx.angle ?? 35) * Math.PI / 180;
    const lin = (stops, off = 0) => { const dx = Math.cos(ang) * cw, dy = Math.sin(ang) * ch, gr = c.createLinearGradient(cw / 2 - dx, ch / 2 - dy, cw / 2 + dx, ch / 2 + dy); stops.forEach(([p, col]) => gr.addColorStop(Math.min(1, Math.max(0, (p + off) % 1)), col)); return gr; };
    let mode = 'screen';
    if (fx.finish === 'gloss') { c.fillStyle = lin([[0.30, 'rgba(255,255,255,0)'], [0.42, 'rgba(255,255,255,.55)'], [0.5, 'rgba(255,255,255,0)'], [0.7, 'rgba(255,255,255,.12)'], [0.8, 'rgba(255,255,255,0)']]); c.fillRect(0, 0, cw, ch); }
    else if (fx.finish === 'holo') {
      const rb = ['#ff5ec8', '#ffb35e', '#fff35e', '#5effa0', '#5ed8ff', '#8c5eff', '#ff5ec8'];
      c.fillStyle = lin(rb.map((col, i) => [i / (rb.length - 1) * 0.999, col]), sweep); c.globalAlpha = 0.55; c.fillRect(0, 0, cw, ch); c.globalAlpha = 1;
      c.globalCompositeOperation = 'lighter'; c.fillStyle = lin([[0, 'rgba(255,255,255,0)'], [0.48, 'rgba(255,255,255,.7)'], [0.52, 'rgba(255,255,255,0)']], sweep * 1.7); c.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 120; i++) { const x = R() * cw, y = R() * ch, tw = 0.5 + 0.5 * Math.sin(t / 200 + i); c.fillStyle = `rgba(255,255,255,${0.8 * tw})`; const z = (1 + R() * 2) * sc * 3; c.fillRect(x, y, z, z); }
      mode = 'overlay';
    } else if (fx.finish === 'gold' || fx.finish === 'silverfoil' || fx.finish === 'chrome') {
      const pal = fx.finish === 'gold' ? ['#7a5a12', '#f7e08a', '#b8862b', '#fff2c2', '#8a6416'] : fx.finish === 'silverfoil' ? ['#6f747c', '#f4f6fa', '#a3a8b1', '#ffffff', '#7d828a'] : ['#1a1c20', '#e9edf3', '#3a3f47', '#ffffff', '#20232a'];
      c.fillStyle = lin(pal.map((col, i) => [i / (pal.length - 1) * 0.999, col]), sweep * 0.5); c.fillRect(0, 0, cw, ch); mode = fx.finish === 'chrome' ? 'luminosity' : 'color';
      // foil keeps the print, it just turns it metal: second pass adds the shine
      const D = mkc(cw, ch), d2 = D.getContext('2d'); d2.fillStyle = lin([[0.35, 'rgba(255,255,255,0)'], [0.45, 'rgba(255,255,255,.6)'], [0.55, 'rgba(255,255,255,0)']], sweep); d2.fillRect(0, 0, cw, ch); d2.globalCompositeOperation = 'destination-in'; d2.drawImage(B, 0, 0);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(B, 0, 0); b.save(); b.globalCompositeOperation = mode; b.drawImage(C, 0, 0); b.globalCompositeOperation = 'screen'; b.drawImage(D, 0, 0); b.restore();
      mode = null;
    } else if (fx.finish === 'glitter') { for (let i = 0; i < 900; i++) { const x = R() * cw, y = R() * ch, tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 300 + i * 1.7)); c.fillStyle = i % 5 ? `rgba(255,255,255,${0.7 * tw})` : `hsla(${R() * 360},100%,70%,${tw})`; const z = (0.6 + R() * 1.6) * sc * 4; c.fillRect(x, y, z, z); } }
    else if (fx.finish === 'matte') { c.fillStyle = 'rgba(128,128,128,.18)'; c.fillRect(0, 0, cw, ch); for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},.05)`; c.fillRect(R() * cw, R() * ch, 2, 2); } mode = 'soft-light'; }
    else if (fx.finish === 'neon') { c.fillStyle = fx.outlineColor || '#ff5ca8'; c.fillRect(0, 0, cw, ch); mode = null; b.save(); b.shadowColor = fx.outlineColor || '#ff5ca8'; b.shadowBlur = 40 * sc; b.globalCompositeOperation = 'destination-over'; b.drawImage(B, 0, 0); b.restore(); }
    if (mode) { c.globalCompositeOperation = 'destination-in'; c.drawImage(B, 0, 0); b.save(); b.globalCompositeOperation = mode; b.drawImage(C, 0, 0); b.restore(); }
  }
  if (fx.wear > 0) { // scuffs and missing specks, like a sticker that has been through a lot
    const R = seeded(99 + Math.round(l.x)); b.save(); b.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260 * fx.wear; i++) { b.globalAlpha = 0.3 + R() * 0.7; const x = R() * cw, y = R() * ch; b.beginPath(); b.arc(x, y, (0.6 + R() * 2.4) * sc * 3, 0, 7); b.fill(); }
    b.lineWidth = 1.5 * sc; for (let i = 0; i < 30 * fx.wear; i++) { const x = R() * cw, y = R() * ch, a2 = R() * Math.PI; b.globalAlpha = 0.5; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a2) * 60 * sc, y + Math.sin(a2) * 60 * sc); b.stroke(); }
    b.restore();
  }
  if (fx.peel) { // a corner lifting off: cut the corner, then draw the paper curling back
    const k = Math.min(cw, ch) * 0.22, x1 = (pad + W) * sc + o * sc, y1 = (pad + H) * sc + o * sc;
    b.save(); b.globalCompositeOperation = 'destination-out'; b.beginPath(); b.moveTo(x1 - k, y1 + 2); b.lineTo(x1 + 2, y1 - k); b.lineTo(x1 + 2, y1 + 2); b.closePath(); b.fill(); b.restore();
    b.save(); b.shadowColor = 'rgba(0,0,0,.35)'; b.shadowBlur = 14 * sc; b.shadowOffsetX = -4 * sc; b.shadowOffsetY = -4 * sc;
    const gr = b.createLinearGradient(x1 - k, y1 - k, x1, y1); gr.addColorStop(0, '#d9dce2'); gr.addColorStop(1, '#ffffff');
    b.fillStyle = gr; b.beginPath(); b.moveTo(x1 - k, y1); b.quadraticCurveTo(x1 - k * 0.9, y1 - k * 0.9, x1, y1 - k); b.lineTo(x1 - k * 0.25, y1 - k * 0.25); b.closePath(); b.fill(); b.restore();
  }
  g.save();
  if (fx.shadow) { g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 22; g.shadowOffsetY = 8; }
  g.drawImage(B, -W / 2 - pad, -H / 2 - pad, W + 2 * pad, H + 2 * pad);
  g.restore();
}
export const STICKERS = { advisory: 'Parental advisory', explicit: 'E (explicit)', star: 'Star', heart: 'Heart', sparkle: 'Sparkle', crown: 'Crown', flame: 'Flame', note: 'Music note', new: 'NEW badge', limited: 'Limited edition', bonus: 'Bonus tracks', barcode: 'Barcode', cd: 'Compact disc logo', tape: 'Tape strip' };

// ---------- defaults ----------
export const newLayer = (type, o = {}) => ({ id: uid(), type, x: 200, y: 200, w: 400, h: 400, rot: 0, opacity: 1, hidden: false, locked: false, ...({
  image: { src: null, crop: { zoom: 1, ox: 0, oy: 0 }, filters: { bright: 100, contrast: 100, sat: 100, hue: 0, blur: 0, gray: 0, sepia: 0 }, radius: 0, circle: false, shadow: { on: false, blur: 30, color: '#000000' } },
  text: { text: 'TEXT', font: 'Bebas Neue', size: 140, color: '#ffffff', bold: false, italic: false, spacing: 0, align: 'center', stroke: { w: 0, color: '#000000' }, shadow: { on: false, blur: 20, color: '#000000' }, arc: 0, w: 900, h: 160 },
  shape: { shape: 'rect', fill: '#ff5ca8', fill2: '', angle: 90, stroke: '', strokeW: 0, radius: 0 },
  sticker: { name: 'advisory', color: '#ffffff', w: 360, h: 220 },
  tracklist: { items: ['Track one', 'Track two', 'Track three'], font: 'Space Grotesk', size: 44, color: '#ffffff', numbered: true, gap: 1.5, w: 700, h: 500 },
  pattern: { kind: 'dots', c1: '#f3ecdc', c2: '#111111', scale: 1, angle: 0, circle: false, seed: Math.floor(Math.random() * 1e9), w: 1400, h: 1400 },
}[type]), ...o });
export const newFace = (bg = { type: 'color', c1: '#111111', c2: '#333333', angle: 135 }) => ({ bg, layers: [] });
export function newDesign(name = 'New design') {
  return {
    id: uid(), name, created: Date.now(), updated: Date.now(), template: false, unfinished: true,
    faces: { cover: newFace(), back: newFace(), disc: newFace({ type: 'none', c1: '#ffffff', c2: '#dddddd', angle: 135 }), booklet: newFace(), mdlabel: newFace({ type: 'color', c1: '#f4f1ea', c2: '#f4f1ea', angle: 135 }) },
    disc: { material: 'silver', color: '#c0c4cc', hub: 'clear', hubColor: '#ffffff', seed: Math.floor(Math.random() * 1e9), cond: { scratches: 0, cracks: 0, chips: 0, wear: 0, dirt: 0, dust: 0, fade: 0, age: 0, shine: 0.2 } },
    caseStyle: { style: 'clear', color: '#ff5ca8' },
    mock: { ...MOCK_DEFAULTS },
  };
}
export const MOCK_DEFAULTS = { format: 'cdcase', bg: '#050505', transparent: false, shell: '#ff6f9f', shellAlpha: 0.5, shutter: 'metal', insert: true, glare: 0.6, sparkle: 0.35, shellText: '', mdDisc: 'silver', paper: 'satin' };
// Older designs: add anything missing
export function ensureDesign(d) {
  d.faces.mdlabel ||= newFace({ type: 'color', c1: '#f4f1ea', c2: '#f4f1ea', angle: 135 });
  { const f = d.faces.mdlabel; if (!f.layers.length && f.bg.c1 === '#111111' && f.bg.c2 === '#333333') f.bg = { type: 'color', c1: '#f4f1ea', c2: '#f4f1ea', angle: 135 }; } // old untouched black label: make it paper
  d.mock ||= {}; for (const k in MOCK_DEFAULTS) if (!(k in d.mock)) d.mock[k] = MOCK_DEFAULTS[k]; // fill in place: panels keep editing the same object
  return d;
}

// ---------- storage ----------
export const listDesigns = async () => (await db.all('designs')).sort((a, b) => b.updated - a.updated);
export const saveDesign = d => { d.updated = Date.now(); return db.put('designs', d.id, d); };
export const deleteDesign = id => db.del('designs', id);
export const listArt = async () => (await db.all('art')).sort((a, b) => b.added - a.added);
const imgCache = new Map();
export async function addArt(file) {
  const id = 'a' + uid(), a = await loadAnim('art:' + id, file); // throws if not a picture; GIFs keep every frame
  await db.put('art', id, { id, blob: file, name: file.name, w: a.w, h: a.h, fav: false, added: Date.now(), moving: isMoving(a) });
  imgCache.set(id, a);
  return id;
}
export async function artImage(id) {
  if (!id) return null;
  if (imgCache.has(id)) return frameOf(imgCache.get(id));
  const d = await db.get('art', id); if (!d) return null;
  const a = await loadAnim('art:' + id, d.blob); imgCache.set(id, a); return frameOf(a);
}
// true when a design uses a moving picture (GIF), so editors and the CD player keep redrawing it
export const designMoves = (design, face) => Object.entries(design.faces || {}).some(([k, f]) => (!face || k === face) && f.layers.some(l => !l.hidden && (l.type === 'image' && isMoving(imgCache.get(l.src)) || ['holo', 'glitter', 'gold', 'silverfoil', 'chrome'].includes((stickerFx(l) || {}).finish))));
export async function preload(design) {
  ensureDesign(design);
  const ids = new Set();
  for (const f of Object.values(design.faces)) for (const l of f.layers) if (l.type === 'image' && l.src) ids.add(l.src);
  await Promise.all([...ids].map(artImage));
  const fonts = new Set();
  for (const f of Object.values(design.faces)) for (const l of f.layers) if (l.font) fonts.add(l.font);
  await Promise.all([...fonts].map(f => document.fonts.load(`40px "${f}"`).catch(() => { })));
}

// ---------- rendering ----------
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function paintBg(g, bg, w, h) {
  if (!bg || bg.type === 'none') return;
  if (bg.type === 'gradient') {
    const a = (bg.angle - 90) * Math.PI / 180, cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
    const gr = g.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    gr.addColorStop(0, bg.c1); gr.addColorStop(1, bg.c2); g.fillStyle = gr;
  } else g.fillStyle = bg.c1;
  g.fillRect(-2000, -2000, w + 4000, h + 4000);
}
const fontStr = l => `${l.italic ? 'italic ' : ''}${l.bold ? '700 ' : ''}${l.size}px "${l.font}", sans-serif`;
export function measureText(g, l) {
  if (l.arc) { const d = 2 * Math.abs(l.arc) + l.size * 1.2; return { w: d, h: d }; }
  g.save(); g.font = fontStr(l); g.letterSpacing = (l.spacing || 0) + 'px';
  const lines = String(l.text).split('\n'), w = Math.max(...lines.map(s => g.measureText(s).width), 10);
  g.restore();
  return { w: w + (l.stroke?.w || 0) * 2, h: lines.length * l.size * 1.15 };
}
function drawText(g, l) {
  g.font = fontStr(l); g.letterSpacing = (l.spacing || 0) + 'px'; g.textBaseline = 'middle';
  if (l.shadow?.on) { g.shadowColor = l.shadow.color; g.shadowBlur = l.shadow.blur; }
  if (l.arc) { // curved text: the layer position is the circle center, negative = along the top, positive = along the bottom
    const r = Math.abs(l.arc), top = l.arc < 0, txt = String(l.text).replace(/\n/g, ' ');
    const widths = [...txt].map(ch => g.measureText(ch).width + (l.spacing || 0)), total = widths.reduce((a, b) => a + b, 0);
    let phi = -total / r / 2;
    g.textAlign = 'center';
    for (let i = 0; i < txt.length; i++) {
      const a = phi + widths[i] / 2 / r;
      g.save();
      if (top) { g.translate(r * Math.sin(a), -r * Math.cos(a)); g.rotate(a); }
      else { g.translate(r * Math.sin(a), r * Math.cos(a)); g.rotate(-a); }
      if (l.stroke?.w) { g.lineWidth = l.stroke.w * 2; g.strokeStyle = l.stroke.color; g.lineJoin = 'round'; g.strokeText(txt[i], 0, 0); }
      g.fillStyle = l.color; g.fillText(txt[i], 0, 0); g.restore();
      phi += widths[i] / r;
    }
    return;
  }
  const lines = String(l.text).split('\n'), lh = l.size * 1.15, top = -(lines.length - 1) * lh / 2;
  g.textAlign = l.align; const x = l.align === 'left' ? -l.w / 2 : l.align === 'right' ? l.w / 2 : 0;
  lines.forEach((s, i) => {
    if (l.stroke?.w) { g.lineWidth = l.stroke.w * 2; g.strokeStyle = l.stroke.color; g.lineJoin = 'round'; g.strokeText(s, x, top + i * lh); }
    g.fillStyle = l.color; g.fillText(s, x, top + i * lh);
  });
}
function shapePath(g, l) {
  const w = l.w, h = l.h; g.beginPath();
  if (l.shape === 'circle') g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  else if (l.shape === 'line') { g.rect(-w / 2, -Math.max(2, h) / 2, w, Math.max(2, h)); }
  else if (l.shape === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.4 : 1, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * h / 2 * r); } g.closePath(); }
  else if (l.shape === 'heart') { g.moveTo(0, h * 0.4); g.bezierCurveTo(-w * 0.6, -h * 0.05, -w * 0.35, -h * 0.55, 0, -h * 0.2); g.bezierCurveTo(w * 0.35, -h * 0.55, w * 0.6, -h * 0.05, 0, h * 0.4); }
  else if (l.shape === 'ring') { g.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); g.ellipse(0, 0, w / 2 * 0.7, h / 2 * 0.7, 0, 0, Math.PI * 2, true); }
  else g.roundRect(-w / 2, -h / 2, w, h, l.radius || 0);
}
function drawShape(g, l) {
  shapePath(g, l);
  if (l.fill) {
    if (l.fill2) { const a = (l.angle - 90) * Math.PI / 180, r = Math.hypot(l.w, l.h) / 2, gr = g.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r); gr.addColorStop(0, l.fill); gr.addColorStop(1, l.fill2); g.fillStyle = gr; }
    else g.fillStyle = l.fill;
    g.fill('evenodd');
  }
  if (l.stroke && l.strokeW) { g.lineWidth = l.strokeW; g.strokeStyle = l.stroke; g.stroke(); }
}
function drawSticker(g, l) {
  const w = l.w, h = l.h, c = l.color, n = l.name;
  const box = (fill, text, tc, font = 'Anton', sz = 0.32) => { g.fillStyle = fill; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = tc; g.font = `${h * sz}px "${font}", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; text.forEach((t, i) => g.fillText(t, 0, (i - (text.length - 1) / 2) * h * sz * 1.05)); };
  switch (n) {
    case 'advisory': {
      g.fillStyle = '#000'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#fff';
      const bw = w * 0.92, bh = h * 0.86; g.fillRect(-bw / 2, -bh / 2 + h * 0.18, bw, bh * 0.52);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = `700 ${h * 0.17}px Arial, sans-serif`; g.fillText('PARENTAL', 0, -h * 0.33);
      g.fillStyle = '#000'; g.font = `900 ${h * 0.3}px Arial Black, Arial, sans-serif`; g.fillText('ADVISORY', 0, -h * 0.01, w * 0.86);
      g.fillStyle = '#fff'; g.font = `700 ${h * 0.14}px Arial, sans-serif`; g.fillText('EXPLICIT CONTENT', 0, h * 0.36, w * 0.9); break;
    }
    case 'explicit': g.fillStyle = '#888'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#fff'; g.font = `700 ${h * 0.75}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('E', 0, h * 0.04); break;
    case 'new': box(c, ['NEW'], '#000', 'Anton', 0.6); break;
    case 'limited': box('#000', ['LIMITED', 'EDITION'], c, 'Bebas Neue', 0.36); break;
    case 'bonus': box(c, ['INCLUDES', 'BONUS TRACKS'], '#000', 'Bebas Neue', 0.3); break;
    case 'tape': g.fillStyle = c; g.globalAlpha *= 0.75; g.fillRect(-w / 2, -h / 2, w, h); break;
    case 'barcode': { g.fillStyle = '#fff'; g.fillRect(-w / 2, -h / 2, w, h); g.fillStyle = '#000'; const r = rng(7); let x = -w / 2 + w * 0.06; while (x < w / 2 - w * 0.06) { const bw = (1 + Math.floor(r() * 3)) * w / 160; if (r() > 0.4) g.fillRect(x, -h * 0.35, bw, h * 0.55); x += bw + w / 160; } g.font = `${h * 0.14}px monospace`; g.textAlign = 'center'; g.fillText('0 12345 67890 5', 0, h * 0.36); break; }
    case 'cd': { g.strokeStyle = c; g.lineWidth = h * 0.06; g.beginPath(); g.ellipse(0, -h * 0.1, h * 0.32, h * 0.32, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(0, -h * 0.1, h * 0.08, h * 0.08, 0, 0, 7); g.stroke(); g.fillStyle = c; g.font = `700 ${h * 0.16}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('COMPACT DISC', 0, h * 0.38, w); break; }
    default: { // simple drawn icons
      g.fillStyle = c; g.beginPath(); const s = Math.min(w, h) / 2;
      if (n === 'star') { for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.42 : s, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
      else if (n === 'sparkle') { for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.18 : s, a = -Math.PI / 2 + i * Math.PI / 4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
      else if (n === 'heart') { g.moveTo(0, s * 0.8); g.bezierCurveTo(-s * 1.2, -s * 0.1, -s * 0.7, -s * 1.1, 0, -s * 0.4); g.bezierCurveTo(s * 0.7, -s * 1.1, s * 1.2, -s * 0.1, 0, s * 0.8); }
      else if (n === 'crown') { g.moveTo(-s, s * 0.6); g.lineTo(-s, -s * 0.4); g.lineTo(-s * 0.5, s * 0.1); g.lineTo(0, -s * 0.7); g.lineTo(s * 0.5, s * 0.1); g.lineTo(s, -s * 0.4); g.lineTo(s, s * 0.6); }
      else if (n === 'flame') { g.moveTo(0, -s); g.bezierCurveTo(s * 0.9, -s * 0.2, s * 0.8, s, 0, s); g.bezierCurveTo(-s * 0.8, s, -s * 0.9, -s * 0.1, -s * 0.15, -s * 0.5); g.bezierCurveTo(-s * 0.1, -s * 0.1, s * 0.2, -s * 0.3, 0, -s); }
      else if (n === 'note') { g.ellipse(-s * 0.35, s * 0.55, s * 0.35, s * 0.25, -0.4, 0, 7); g.rect(-s * 0.05, -s, s * 0.14, s * 1.5); g.moveTo(s * 0.09, -s); g.quadraticCurveTo(s * 0.7, -s * 0.8, s * 0.6, -s * 0.2); g.lineTo(s * 0.09, -s * 0.55); }
      g.closePath(); g.fill();
    }
  }
}
function drawTracklist(g, l) {
  g.font = `${l.size}px "${l.font}", sans-serif`; g.textBaseline = 'top'; g.textAlign = 'left'; g.fillStyle = l.color;
  l.items.forEach((t, i) => g.fillText((l.numbered ? `${i + 1}. ` : '') + t, -l.w / 2, -l.h / 2 + i * l.size * l.gap, l.w));
}
function drawImage(g, l, img, editor) {
  if (!img) {
    if (editor) { g.setLineDash([24, 16]); g.lineWidth = 6; g.strokeStyle = '#ffffff99'; g.strokeRect(-l.w / 2, -l.h / 2, l.w, l.h); g.setLineDash([]); g.fillStyle = '#ffffff99'; g.font = `${Math.max(28, l.w / 14)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Your picture here', 0, 0); }
    return;
  }
  const f = l.filters;
  g.filter = `brightness(${f.bright}%) contrast(${f.contrast}%) saturate(${f.sat}%) hue-rotate(${f.hue}deg) blur(${f.blur}px) grayscale(${f.gray}%) sepia(${f.sepia}%)`;
  if (l.shadow?.on) { g.save(); g.shadowColor = l.shadow.color; g.shadowBlur = l.shadow.blur; g.fillStyle = '#000'; g.beginPath(); l.circle ? g.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, 7) : g.roundRect(-l.w / 2, -l.h / 2, l.w, l.h, l.radius); g.fill(); g.restore(); }
  if (l.border) { g.save(); g.fillStyle = l.borderColor || '#ffffff'; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = l.border; g.beginPath(); const b = l.border; l.circle ? g.ellipse(0, 0, l.w / 2 + b, l.h / 2 + b, 0, 0, 7) : g.roundRect(-l.w / 2 - b, -l.h / 2 - b, l.w + 2 * b, l.h + 2 * b, (l.radius || 0) + b); g.fill(); g.restore(); }
  g.beginPath(); l.circle ? g.ellipse(0, 0, l.w / 2, l.h / 2, 0, 0, 7) : g.roundRect(-l.w / 2, -l.h / 2, l.w, l.h, l.radius || 0); g.clip();
  // cover-fit, then crop zoom + offset (offset in fractions of the frame)
  const s = Math.max(l.w / img.width, l.h / img.height) * l.crop.zoom, iw = img.width * s, ih = img.height * s;
  g.drawImage(img, -iw / 2 + l.crop.ox * l.w, -ih / 2 + l.crop.oy * l.h, iw, ih);
  g.filter = 'none';
}
export function drawLayer(g, l, editor) {
  if (l.hidden) return;
  g.save(); g.translate(l.x, l.y); g.rotate(l.rot * Math.PI / 180); g.globalAlpha *= l.opacity;
  const sfx = stickerFx(l);
  if (l.type === 'image' && sfx && l.src) drawStickerFx(g, l, sfx, c => drawImage(c, l, frameOf(imgCache.get(l.src), artNow()), editor));
  else if (l.type === 'sticker' && sfx) drawStickerFx(g, l, sfx, c => drawSticker(c, l));
  else if (l.type === 'image') drawImage(g, l, frameOf(imgCache.get(l.src), artNow()), editor);
  else if (l.type === 'text') drawText(g, l);
  else if (l.type === 'shape') drawShape(g, l);
  else if (l.type === 'sticker') drawSticker(g, l);
  else if (l.type === 'tracklist') drawTracklist(g, l);
  else if (l.type === 'pattern') drawPattern(g, l);
  g.restore();
}
// Draw one face at a given scale. opts: { editor, bleed (px in face units), hole (cut the disc hole) }
export function renderFace(g, design, faceKey, scale = 1, opts = {}) {
  const F = FACES[faceKey], face = design.faces[faceKey], b = opts.bleed || 0;
  g.save(); g.scale(scale, scale); g.translate(b, b);
  if (F.disc) drawDisc(g, design, opts);
  else {
    paintBg(g, face.bg, F.w, F.h);
    if (b) { /* background already extends past the trim */ }
    for (const l of face.layers) drawLayer(g, l, opts.editor);
    if (faceKey === 'back' && opts.editor) { g.strokeStyle = '#ffffff55'; g.setLineDash([12, 10]); g.lineWidth = 3; g.strokeRect(F.spine, 0, F.w - 2 * F.spine, F.h); g.setLineDash([]); }
  }
  g.restore();
}

// ---------- disc ----------
export const MATERIALS = { silver: 'Classic silver', white: 'White', black: 'Black', gold: 'Gold', rosegold: 'Rose gold', pink: 'Pink', purple: 'Purple', blue: 'Blue', rainbow: 'Rainbow reflective', transparent: 'Transparent', frosted: 'Frosted', holo: 'Holographic', vintage: 'Vintage', retro: 'Retro', custom: 'Custom color' };
const MAT_BASE = { silver: '#c3c7ce', white: '#f2f2f0', black: '#141416', gold: '#cfa83a', rosegold: '#e3ac9e', pink: '#ff9ac9', purple: '#9b6bff', blue: '#4a8cff', rainbow: '#c9ccd2', transparent: 'rgba(210,225,255,0.18)', frosted: 'rgba(240,244,250,0.6)', holo: '#cfd2da', vintage: '#c9b48c', retro: '#e7e0cf' };
export const CONDITIONS = {
  'Brand-new': { shine: 0.3 }, 'Lightly scratched': { scratches: 0.3, shine: 0.2 }, 'Heavily scratched': { scratches: 0.95, wear: 0.3 }, 'Cracked': { cracks: 0.6 }, 'Broken': { cracks: 1, chips: 1 },
  'Chipped': { chips: 0.5 }, 'Worn-out': { wear: 0.7, scratches: 0.45, fade: 0.3 }, 'Vintage aged': { age: 0.7, fade: 0.3, dust: 0.25, scratches: 0.2 }, 'Dirty': { dirt: 0.75 }, 'Dusty': { dust: 0.85 },
  'Faded': { fade: 0.7 }, 'Shiny polished': { shine: 1 }, 'Matte': { shine: -1 },
};
export const COND_KEYS = [['scratches', 'Scratches'], ['cracks', 'Cracks'], ['chips', 'Chips and breaks'], ['wear', 'Wear'], ['dirt', 'Dirt'], ['dust', 'Dust'], ['fade', 'Fade'], ['age', 'Age (yellowing)'], ['shine', 'Shine (matte to glossy)']];

function drawDisc(g, d, opts) {
  const { R, HOLE, HUB, PRINT } = DISC, c = R, D = d.disc, k = D.cond, r = rng(D.seed);
  g.save();
  // outline + chips (missing bites at the edge)
  const disc = new Path2D(); disc.arc(c, c, R, 0, Math.PI * 2);
  g.save(); g.clip(disc);
  const P = !opts.labelOnly;
  // material
  const base = D.material === 'custom' ? D.color : MAT_BASE[D.material];
  const sheen = (alpha, colors) => { const cg = g.createConicGradient(r() * 6, c, c); colors.forEach((col, i) => cg.addColorStop(i / (colors.length - 1), col)); g.globalAlpha = alpha; g.fillStyle = cg; g.fillRect(0, 0, 2 * R, 2 * R); g.globalAlpha = 1; };
  if (P) {
  g.fillStyle = base; g.fillRect(0, 0, 2 * R, 2 * R);
  if (['silver', 'gold', 'rosegold', 'pink', 'purple', 'blue', 'black', 'transparent', 'custom'].includes(D.material)) sheen(D.material === 'black' ? 0.25 : 0.45, ['#ffffff', '#00000033', '#ffffff', '#00000022', '#ffffff', '#00000033', '#ffffff']);
  if (D.material === 'rainbow' || D.material === 'holo') sheen(D.material === 'holo' ? 0.75 : 0.45, ['#ff4d4d', '#ffd24d', '#4dff88', '#4dd2ff', '#9b4dff', '#ff4dd2', '#ff4d4d']);
  if (D.material === 'holo') { for (let i = 0; i < 3000; i++) { g.fillStyle = `hsla(${r() * 360},100%,70%,.5)`; g.fillRect(r() * 2 * R, r() * 2 * R, 3, 3); } }
  if (D.material === 'frosted') { for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.25})`; g.fillRect(r() * 2 * R, r() * 2 * R, 2, 2); } }
  if (D.material === 'retro' || D.material === 'vintage') { g.strokeStyle = 'rgba(0,0,0,.06)'; g.lineWidth = 2; for (let rr = PRINT; rr < R; rr += 7) { g.beginPath(); g.arc(c, c, rr, 0, 7); g.stroke(); } }
  }
  // printed art (the label), clipped to the printable ring
  const ring = new Path2D(); ring.arc(c, c, R - 4, 0, Math.PI * 2); ring.arc(c, c, PRINT, 0, Math.PI * 2, true);
  g.save(); g.clip(ring, 'evenodd');
  paintBg(g, d.faces.disc.bg, 2 * R, 2 * R);
  for (const l of d.faces.disc.layers) drawLayer(g, l, opts.editor);
  g.restore();
  // hub (clear plastic ring)
  if (P) {
  g.beginPath(); g.arc(c, c, PRINT, 0, 7); g.arc(c, c, HOLE, 0, 7, true);
  g.fillStyle = D.hub === 'clear' ? 'rgba(220,230,240,0.35)' : D.hubColor; g.fill('evenodd');
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, HUB, 0, 7); g.stroke(); g.beginPath(); g.arc(c, c, PRINT, 0, 7); g.stroke();
  }
  // ---- conditions ----
  if (P) {
  const sh = k.shine || 0;
  if (sh > 0) sheen(sh * 0.35, ['#ffffff00', '#ffffff', '#ffffff00', '#ffffff00', '#ffffff', '#ffffff00']);
  if (sh < 0) { g.globalAlpha = -sh * 0.35; g.fillStyle = '#808080'; g.globalCompositeOperation = 'saturation'; g.fillRect(0, 0, 2 * R, 2 * R); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  if (k.fade) { g.globalAlpha = k.fade * 0.55; g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, 2 * R, 2 * R); g.globalCompositeOperation = 'source-over'; g.globalAlpha = k.fade * 0.3; g.fillStyle = '#ffffff'; g.fillRect(0, 0, 2 * R, 2 * R); g.globalAlpha = 1; }
  if (k.age) { g.globalAlpha = k.age * 0.45; g.globalCompositeOperation = 'multiply'; g.fillStyle = '#d9b77a'; g.fillRect(0, 0, 2 * R, 2 * R); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  if (k.dirt) for (let i = 0; i < 18 * k.dirt; i++) { const x = r() * 2 * R, y = r() * 2 * R, rad = 40 + r() * 160, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(70,50,30,${0.35 * k.dirt})`); gr.addColorStop(1, 'rgba(70,50,30,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  if (k.wear) { for (let i = 0; i < 4000 * k.wear; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.35 * k.wear})`; const a = r() * 7, rr = R * (0.75 + r() * 0.25); g.fillRect(c + Math.cos(a) * rr, c + Math.sin(a) * rr, 2, 2); } }
  if (k.scratches) {
    g.lineCap = 'round';
    for (let i = 0; i < 120 * k.scratches; i++) {
      const light = r() > 0.35; g.strokeStyle = light ? `rgba(255,255,255,${0.25 + r() * 0.5})` : `rgba(0,0,0,${0.15 + r() * 0.3})`; g.lineWidth = 0.8 + r() * 2.2 * k.scratches;
      g.beginPath();
      if (r() > 0.45) { const rr = PRINT + r() * (R - PRINT), a = r() * 7; g.arc(c, c, rr, a, a + 0.1 + r() * 0.9); }
      else { const x = r() * 2 * R, y = r() * 2 * R, a = r() * 7, len = 40 + r() * 400 * k.scratches; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); }
      g.stroke();
    }
  }
  if (k.dust) for (let i = 0; i < 1800 * k.dust; i++) { g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,110,100'},${0.3 + r() * 0.5})`; const s = 1 + r() * 3.5; g.beginPath(); g.arc(r() * 2 * R, r() * 2 * R, s / 2, 0, 7); g.fill(); }
  if (k.cracks) {
    for (let i = 0; i < Math.ceil(1 + k.cracks * 5); i++) {
      let a = r() * 7, x = c + Math.cos(a) * R, y = c + Math.sin(a) * R;
      const steps = 6 + Math.floor(r() * 10 * k.cracks);
      const pts = [[x, y]];
      for (let s = 0; s < steps; s++) { const tx = c - x, ty = c - y, ta = Math.atan2(ty, tx) + (r() - 0.5) * 1.1, len = 25 + r() * 70; x += Math.cos(ta) * len; y += Math.sin(ta) * len; pts.push([x, y]); if (Math.hypot(x - c, y - c) < HUB) break; }
      for (const [col, w] of [['rgba(255,255,255,.55)', 5], ['rgba(0,0,0,.75)', 2]]) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([px, py], j) => j ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke(); }
    }
  }
  }
  g.restore();
  // edge highlight
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, R - 1.5, 0, 7); g.stroke();
  // cut the hole and chips (transparent)
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(c, c, HOLE, 0, 7); g.fill();
  if (k.chips) {
    const n = Math.ceil(k.chips * 6);
    for (let i = 0; i < n; i++) {
      const a = r() * 7, depth = (0.02 + r() * 0.08 + (k.chips > 0.85 && i === 0 ? 0.35 : 0)) * R, span = 0.08 + r() * 0.25 + (k.chips > 0.85 && i === 0 ? 0.6 : 0);
      g.beginPath(); g.moveTo(c + Math.cos(a - span) * (R + 5), c + Math.sin(a - span) * (R + 5));
      for (let s = 0; s <= 6; s++) { const aa = a - span + (2 * span * s) / 6, rr = R - depth * (0.5 + r() * 0.5) * Math.sin(Math.PI * s / 6); g.lineTo(c + Math.cos(aa) * rr, c + Math.sin(aa) * rr); }
      g.lineTo(c + Math.cos(a + span) * (R + 5), c + Math.sin(a + span) * (R + 5)); g.closePath(); g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

// ---------- export ----------
export async function faceCanvas(design, faceKey, opts = {}) {
  await preload(design);
  const F = FACES[faceKey], scale = opts.size ? opts.size / F.w : 1, b = opts.bleed ? Math.round(3 * MM) : 0;
  const cv = document.createElement('canvas');
  cv.width = Math.round((F.w + 2 * b) * scale); cv.height = Math.round((F.h + 2 * b) * scale);
  const g = cv.getContext('2d');
  if (opts.jpg && F.disc) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); }
  renderFace(g, design, faceKey, scale, { bleed: b, labelOnly: opts.labelOnly });
  return cv;
}
export const canvasBlob = (cv, jpg) => new Promise(r => cv.toBlob(r, jpg ? 'image/jpeg' : 'image/png', 0.92));
// A4 print sheet at 300 dpi: front, back, disc with crop marks
export async function printSheet(design) {
  await preload(design);
  const W = Math.round(210 * MM), H = Math.round(297 * MM), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const b = Math.round(3 * MM), m = Math.round(12 * MM);
  const place = (key, x, y) => {
    const F = FACES[key];
    g.save(); g.translate(x - b, y - b); g.beginPath(); g.rect(0, 0, F.w + 2 * b, F.h + 2 * b); g.clip(); renderFace(g, design, key, 1, { bleed: b }); g.restore();
    if (!F.disc) { // crop marks at the trim
      g.strokeStyle = '#000'; g.lineWidth = 2; const L = 40, o = b + 6;
      for (const [cx, cy] of [[x, y], [x + F.w, y], [x, y + F.h], [x + F.w, y + F.h]]) { const sx = cx === x ? -1 : 1, sy = cy === y ? -1 : 1; g.beginPath(); g.moveTo(cx + sx * o, cy); g.lineTo(cx + sx * (o + L), cy); g.moveTo(cx, cy + sy * o); g.lineTo(cx, cy + sy * (o + L)); g.stroke(); }
      if (F.spine) { g.setLineDash([10, 10]); g.strokeStyle = '#999'; for (const sx of [x + F.spine, x + F.w - F.spine]) { g.beginPath(); g.moveTo(sx, y - b - 30); g.lineTo(sx, y - b - 5); g.moveTo(sx, y + F.h + b + 5); g.lineTo(sx, y + F.h + b + 30); g.stroke(); } g.setLineDash([]); }
    } else { g.strokeStyle = '#999'; g.lineWidth = 1; g.setLineDash([8, 8]); g.beginPath(); g.arc(x + DISC.R, y + DISC.R, DISC.R, 0, 7); g.stroke(); g.setLineDash([]); }
    g.fillStyle = '#555'; g.font = '28px Arial'; g.textAlign = 'left'; g.fillText(`${F.name} · ${F.mm}`, x, y - b - 44);
  };
  place('cover', m + b, m + b + 60);
  place('disc', W - m - FACES.disc.w, m + b + 60);
  place('back', m + b, m + b + 60 + FACES.cover.h + 2 * b + 120);
  g.fillStyle = '#555'; g.font = '30px Arial';
  g.fillText(`${design.name} · print at 100% (no scaling) on A4 · cut on the crop marks · 3 mm bleed included`, m, H - m);
  return cv;
}

// ---------- patterns (drawn, never AI) ----------
export const PATTERNS = { dots: 'Polka dots', stars: 'Stars', sparkle: 'Sparkles', sun: 'Sun rays', swirl: 'Swirl', lace: 'Lace', hearts: 'Hearts', stripes: 'Stripes', checker: 'Checker', plaid: 'Plaid', leopard: 'Leopard', zebra: 'Zebra', bubbles: 'Bubbles', flames: 'Flames', rings: 'Rings' };
function star(g, x, y, r, pts = 5, inner = 0.45) { g.beginPath(); for (let i = 0; i < pts * 2; i++) { const rr = i % 2 ? r * inner : r, a = -Math.PI / 2 + i * Math.PI / pts; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function heart(g, x, y, s) { g.beginPath(); g.moveTo(x, y + s * 0.8); g.bezierCurveTo(x - s * 1.2, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4); g.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.2, y - s * 0.1, x, y + s * 0.8); g.fill(); }
export function drawPattern(g, l) {
  const w = l.w, h = l.h, s = 70 * l.scale, r = rng(l.seed || 1), R = Math.hypot(w, h) / 2;
  g.save(); g.beginPath(); l.circle ? g.ellipse(0, 0, w / 2, h / 2, 0, 0, 7) : g.rect(-w / 2, -h / 2, w, h); g.clip();
  g.fillStyle = l.c1; g.fillRect(-w / 2, -h / 2, w, h);
  g.rotate((l.angle || 0) * Math.PI / 180);
  g.fillStyle = l.c2; g.strokeStyle = l.c2;
  const grid = (fn, step = s) => { let row = 0; for (let y = -R; y < R; y += step, row++) for (let x = -R + (row % 2 ? step / 2 : 0); x < R; x += step) fn(x, y); };
  switch (l.kind) {
    case 'dots': grid((x, y) => { g.beginPath(); g.arc(x, y, s * 0.2, 0, 7); g.fill(); }); break;
    case 'stars': for (let i = 0; i < (w * h) / (s * s) * 0.5; i++) star(g, (r() - 0.5) * w, (r() - 0.5) * h, s * (0.12 + r() * 0.35)); break;
    case 'sparkle': for (let i = 0; i < (w * h) / (s * s) * 1.4; i++) star(g, (r() - 0.5) * w, (r() - 0.5) * h, s * (0.05 + r() * 0.2), 4, 0.18); break;
    case 'hearts': grid((x, y) => heart(g, x, y, s * 0.28)); break;
    case 'stripes': for (let x = -R; x < R; x += s) g.fillRect(x, -R, s / 2, 2 * R); break;
    case 'checker': for (let y = -R, i = 0; y < R; y += s / 1.4, i++) for (let x = -R + (i % 2) * s / 1.4; x < R; x += 2 * s / 1.4) g.fillRect(x, y, s / 1.4, s / 1.4); break;
    case 'plaid': g.globalAlpha = 0.35; for (let x = -R; x < R; x += s * 1.6) { g.fillRect(x, -R, s * 0.6, 2 * R); g.fillRect(-R, x, 2 * R, s * 0.6); } g.globalAlpha = 0.8; for (let x = -R; x < R; x += s * 1.6) { g.fillRect(x + s * 0.9, -R, 4, 2 * R); g.fillRect(-R, x + s * 0.9, 2 * R, 4); } break;
    case 'sun': {
      const n = 22; for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n, a2 = a + Math.PI / n; g.beginPath(); g.moveTo(0, 0); for (let k = 0; k <= 8; k++) { const t = k / 8, aa = a + (a2 - a) * t, rr = R * (0.95 + 0.05 * Math.sin(t * Math.PI * 4)); g.lineTo(Math.cos(aa + Math.sin(t * 6) * 0.05) * rr, Math.sin(aa + Math.sin(t * 6) * 0.05) * rr); } g.closePath(); g.fill(); }
      g.beginPath(); g.arc(0, 0, R * 0.22, 0, 7); g.fill(); break;
    }
    case 'swirl': g.lineCap = 'round'; for (let k = 0; k < 6; k++) { g.lineWidth = s * 0.45; g.globalAlpha = 0.9; g.beginPath(); for (let t = 0; t < 1; t += 0.01) { const a = t * 7 + k * Math.PI / 3, rr = t * R; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); } break;
    case 'lace': {
      g.lineWidth = Math.max(1.5, s * 0.04);
      for (let rr = s * 0.6; rr < R; rr += s * 0.75) { const n = Math.max(8, Math.round(rr * 2 * Math.PI / (s * 0.55))); for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n, x = Math.cos(a) * rr, y = Math.sin(a) * rr; g.beginPath(); g.ellipse(x, y, s * 0.24, s * 0.12, a, 0, 7); g.stroke(); g.beginPath(); g.arc(x * 1.08, y * 1.08, s * 0.05, 0, 7); g.fill(); } g.beginPath(); g.arc(0, 0, rr + s * 0.3, 0, 7); g.stroke(); }
      break;
    }
    case 'leopard': for (let i = 0; i < (w * h) / (s * s) * 1.1; i++) { const x = (r() - 0.5) * w, y = (r() - 0.5) * h, rr = s * (0.18 + r() * 0.2); g.lineWidth = rr * 0.45; g.beginPath(); for (let k = 0; k < 4; k++) { const a0 = k * 1.57 + r() * 0.6; g.moveTo(x + Math.cos(a0) * rr, y + Math.sin(a0) * rr); g.arc(x, y, rr, a0, a0 + 0.9 + r() * 0.4); } g.stroke(); } break;
    case 'zebra': for (let y = -R; y < R; y += s * 0.9) { g.beginPath(); for (let x = -R; x <= R; x += 10) g.lineTo(x, y + Math.sin(x / (s * 0.9) + y) * s * 0.35); for (let x = R; x >= -R; x -= 10) g.lineTo(x, y + s * 0.35 + Math.sin(x / (s * 0.7) + y * 1.3) * s * 0.3); g.closePath(); g.fill(); } break;
    case 'bubbles': g.lineWidth = Math.max(3, s * 0.08); for (let i = 0; i < (w * h) / (s * s) * 0.7; i++) { const x = (r() - 0.5) * w, y = (r() - 0.5) * h, rr = s * (0.2 + r() * 0.9); g.globalAlpha = 0.25; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); g.globalAlpha = 0.9; g.stroke(); } break;
    case 'flames': for (let i = 0; i < 14; i++) { const x = -w / 2 + (i + 0.5) * w / 14 + (r() - 0.5) * 30, top = -h / 2 + r() * h * 0.5, ww = w / 10; g.beginPath(); g.moveTo(x - ww, h / 2); g.bezierCurveTo(x - ww, h * 0.1, x - ww * 0.2, top + h * 0.2, x, top); g.bezierCurveTo(x + ww * 0.4, top + h * 0.25, x + ww, h * 0.1, x + ww, h / 2); g.fill(); } break;
    case 'rings': g.lineWidth = s * 0.18; for (let rr = s * 0.4; rr < R; rr += s * 0.45) { g.beginPath(); g.arc(0, 0, rr, 0, 7); g.stroke(); } break;
  }
  g.restore();
}
