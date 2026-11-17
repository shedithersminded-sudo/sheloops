// My cover art: gallery + editor + package preview + exports + song covers.
import { $, el, clamp, toast, ask, confirmBox, modal, select, download, safeName } from './util.js';
import { helpBtn } from './help.js';
import { app, flush, emit } from './state.js';
import { db } from './store.js';
import { FINISHES, stickerFx, drawLayer } from './art.js';
import { FINISH as PFINISH, WEAR as PWEAR, plasticOf, plasticStyle } from './plastic.js';
import { FACES, DISC, FONTS, STICKERS, MATERIALS, CONDITIONS, COND_KEYS, newDesign, newLayer, listDesigns, saveDesign, deleteDesign, listArt, addArt, artImage, preload, designMoves, renderFace, measureText, faceCanvas, canvasBlob, printSheet } from './art.js';
import { COLLECTIONS, fromCollection } from './artcollections.js';
import { PATTERNS, ensureDesign } from './art.js';
const FORMATS_3D = [['cdcase', 'CD in a jewel case'], ['slim', 'Colored slim case'], ['sleeve', 'Card sleeve'], ['fan', 'Stack of cases'], ['disc', 'Disc only'], ['minidisc', 'MiniDisc'], ['wallet', 'CD book'], ['spindle', 'Spindle stack'], ['pile', 'Pile of discs']];
import { refreshDisc } from './nowplaying.js';

const S = { d: null, face: 'cover', sel: null, preview: false, undo: [], redo: [], lastTouch: 0, scale: 0.4 };
const CASES = { clear: 'Clear jewel case', black: 'Black jewel case', white: 'White jewel case', colored: 'Colored case', transparent: 'See-through case', vintage: 'Vintage case', slim: 'Slim case', custom: 'Custom packaging (card sleeve)', damaged: 'Damaged / cracked case', premium: 'Premium collector edition' };
const pickFiles = (accept, multiple) => new Promise(res => { const i = el('input', { type: 'file', accept, multiple }); i.onchange = () => res([...i.files]); i.click(); });
const songInfo = () => app.P ? { title: app.P.name, artist: app.P.artist || '' } : {};

// ---------- persistence + undo ----------
let saveT;
function changed(re = true) { clearTimeout(saveT); saveT = setTimeout(async () => { refreshDisc(); S.d.thumb = (await faceCanvas(S.d, 'cover', { size: 240, jpg: true })).toDataURL('image/jpeg', 0.8); saveDesign(S.d); }, 600); if (re) draw(); }
function touch() { const now = performance.now(); if (now - S.lastTouch > 700) { S.undo.push(JSON.stringify(S.d)); if (S.undo.length > 60) S.undo.shift(); S.redo = []; } S.lastTouch = now; }
function undo() { if (!S.undo.length) return toast('Nothing to undo.'); S.redo.push(JSON.stringify(S.d)); S.d = JSON.parse(S.undo.pop()); S.sel = null; changed(false); renderEditor(); }
function redo() { if (!S.redo.length) return toast('Nothing to redo.'); S.undo.push(JSON.stringify(S.d)); S.d = JSON.parse(S.redo.pop()); S.sel = null; changed(false); renderEditor(); }
const face = () => S.d.faces[S.face];
const isFace = () => !!FACES[S.face];
const selLayer = () => isFace() && face().layers.find(l => l.id === S.sel);

export async function renderArt() { if (S.d) await renderEditor(); else await renderGallery(); }
export async function openDesign(d) { ensureDesign(d); S.d = d; S.face = 'cover'; S.sel = null; S.undo = []; S.redo = []; await preload(d); emit('goto:art'); }

// ---------- gallery ----------
async function renderGallery() {
  const designs = await listDesigns(), pics = await listArt();
  if (app.view !== 'art' || S.d) return;
  const view = $('#view'); view.innerHTML = '';
  const mine = designs.filter(d => !d.template), templates = designs.filter(d => d.template);
  const thumb = d => d.thumb ? el('img', { class: 'cover', src: d.thumb, alt: '' }) : el('div', { class: 'cover blank' }, 'ART');
  const collGrid = el('div', { class: 'collgrid' });
  view.append(el('div', { class: 'artgallery' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My cover art'), helpBtn('coverArt'),
      el('button', { class: 'hot', onclick: async () => { const d = newDesign(app.P ? app.P.name : 'New design'); await saveDesign(d); openDesign(d); } }, 'New blank design'),
      el('button', { onclick: () => openDesignFile() }, 'Open a design file'),
      el('button', { onclick: uploadPics }, 'Upload pictures')),
    el('h2', { class: 'h2' }, 'Start from a collection'), el('p', { class: 'hint' }, 'Each one is a full CD package (front, back, disc, case) with a frame for your own picture.'), collGrid,
    el('h2', { class: 'h2' }, 'My designs'),
    mine.length ? el('div', { class: 'pgrid' }, mine.map(d => el('div', { class: 'pcard panel' },
      el('button', { class: 'pcover', onclick: () => openDesign(d) }, thumb(d)),
      el('div', { class: 'pinfo' }, el('b', {}, d.name), el('small', {}, (d.unfinished ? 'Unfinished · ' : 'Finished · ') + new Date(d.updated).toLocaleDateString())),
      el('div', { class: 'pbtns' },
        el('button', { class: 'hot', onclick: () => openDesign(d) }, 'Open'),
        el('button', { onclick: () => useAsCover(d) }, 'Use as song cover'),
        el('button', { onclick: async () => { const c = JSON.parse(JSON.stringify(d)); c.id = Math.random().toString(36).slice(2, 10); c.name += ' copy'; await saveDesign(c); renderGallery(); } }, 'Duplicate'),
        el('button', { onclick: async () => { const n = await ask('Rename design', 'Name', d.name); if (n) { d.name = n; await saveDesign(d); renderGallery(); } } }, 'Rename'),
        el('button', { class: 'danger', onclick: async () => { if (await confirmBox('Delete design', `Delete "${d.name}"? Your uploaded pictures stay.`, 'Delete')) { await deleteDesign(d.id); renderGallery(); } } }, 'Delete'))))) : el('p', { class: 'hint' }, 'No designs yet. Start from a collection or a blank design.'),
    templates.length ? el('h2', { class: 'h2' }, 'My templates') : null,
    templates.length ? el('div', { class: 'pgrid' }, templates.map(d => el('div', { class: 'pcard panel' }, thumb(d), el('div', { class: 'pinfo' }, el('b', {}, d.name)),
      el('div', { class: 'pbtns' },
        el('button', { class: 'hot', onclick: async () => { const c = JSON.parse(JSON.stringify(d)); c.id = Math.random().toString(36).slice(2, 10); c.template = false; c.unfinished = true; c.name = (app.P ? app.P.name : d.name); await saveDesign(c); openDesign(c); } }, 'Use'),
        el('button', { class: 'danger', onclick: async () => { if (await confirmBox('Delete template', `Delete "${d.name}"?`, 'Delete')) { await deleteDesign(d.id); renderGallery(); } } }, 'Delete'))))) : null,
    el('h2', { class: 'h2' }, 'My pictures'), helpBtn('artLibrary'),
    pics.length ? el('div', { class: 'picgrid' }, pics.map(p => picCard(p))) : el('p', { class: 'hint' }, 'Upload your photos, art and logos. They are kept here so you can reuse them on any design.'),
  ));
  // collection thumbnails (rendered from the real templates)
  for (const name of Object.keys(COLLECTIONS)) {
    const d = fromCollection(name, songInfo()), cv = await faceCanvas(d, 'cover', { size: 200, jpg: true });
    if (!document.body.contains(collGrid)) return;
    collGrid.append(el('button', { class: 'collcard', onclick: async () => { const nd = fromCollection(name, { ...songInfo(), tracks: await songTitles() }); await saveDesign(nd); openDesign(nd); } }, cv, el('b', {}, name)));
  }
}
function picCard(p) {
  const img = el('img', { alt: '' });
  db.get('art', p.id).then(d => { if (d) img.src = URL.createObjectURL(d.blob); });
  return el('div', { class: 'piccard' }, img,
    el('div', { class: 'pbtns' },
      el('button', { class: 'star' + (p.fav ? ' on' : ''), title: 'Favorite', onclick: async () => { p.fav = !p.fav; const d = await db.get('art', p.id); d.fav = p.fav; await db.put('art', p.id, d); renderGallery(); } }, p.fav ? '★' : '☆'),
      el('button', { class: 'danger', onclick: async () => { if (await confirmBox('Delete picture', 'Delete this picture? Designs that use it will show an empty frame.', 'Delete')) { await db.del('art', p.id); renderGallery(); } } }, 'Delete')));
}
async function uploadPics() {
  const fs = await pickFiles('image/*', true); let n = 0;
  for (const f of fs) { try { await addArt(f); n++; } catch { toast('Could not read ' + f.name); } }
  if (n) toast(`Added ${n} picture${n === 1 ? '' : 's'}.`);
  if (S.d) renderEditor(); else renderGallery();
}
async function songTitles() { return (await db.all('projects')).sort((a, b) => a.created - b.created).map(p => p.name); }

// ---------- editor ----------
let stage, stageWrap;
async function renderEditor() {
  if (app.view !== 'art' || !S.d) return;
  if (S.viewer) { S.viewer.dispose(); S.viewer = null; }
  const view = $('#view'); view.innerHTML = '';
  const d = S.d;
  const tab = (k, label) => el('button', { class: 'itab' + (S.face === k ? ' on' : ''), onclick: () => { S.face = k; S.sel = null; renderEditor(); } }, label);
  stageWrap = el('div', { class: 'stagewrap' });
  view.append(el('div', { class: 'arteditor' },
    el('div', { class: 'panel toolbar' },
      el('button', { onclick: () => { S.d = null; renderArt(); } }, '< My cover art'),
      el('input', { class: 'tname artname', value: d.name, onchange: e => { d.name = e.target.value; changed(false); } }),
      el('div', { class: 'itabs' }, tab('cover', 'Front'), tab('back', 'Back'), tab('disc', 'Disc'), tab('booklet', 'Booklet'), tab('mdlabel', 'MD label'), tab('mockup', 'Cover mockup'), tab('3d', '3D studio'), tab('package', 'Case preview')),
      el('span', { class: 'spacer' }),
      el('button', { onclick: undo, title: 'Ctrl+Z' }, 'Undo'), el('button', { onclick: redo, title: 'Ctrl+Y' }, 'Redo'),
      el('button', { class: 'tog' + (S.preview ? ' on' : ''), onclick: () => { S.preview = !S.preview; renderEditor(); } }, 'Preview'),
      el('button', { onclick: exportMenu }, 'Export'),
      el('button', { class: 'hot', onclick: () => useAsCover(d) }, 'Use as song cover'),
      el('button', { title: 'More', onclick: moreMenu }, '...')),
    S.face === 'package' ? packageView() : S.face === 'mockup' ? mockupView() : S.face === '3d' ? studio3dView() : el('div', { class: 'artmain' }, addPanel(), stageWrap, el('div', { class: 'artside', id: 'artside' }))));
  if (isFace()) { buildStage(); renderSide(); }
}
function moreMenu() {
  const close = modal('Design options', el('div', { class: 'menu' },
    el('button', { onclick: async () => { const c = JSON.parse(JSON.stringify(S.d)); c.id = Math.random().toString(36).slice(2, 10); c.name += ' copy'; await saveDesign(c); close(); openDesign(c); toast('Duplicated.'); } }, 'Duplicate design'),
    el('button', { onclick: async () => { const n = await ask('Save as template', 'Template name', S.d.name + ' template'); if (!n) return; const c = JSON.parse(JSON.stringify(S.d)); c.id = Math.random().toString(36).slice(2, 10); c.name = n; c.template = true; await saveDesign(c); close(); toast('Template saved. Find it in My cover art.'); } }, 'Save as template'),
    el('button', { onclick: () => { S.d.unfinished = !S.d.unfinished; changed(false); close(); toast(S.d.unfinished ? 'Marked unfinished.' : 'Marked finished.'); } }, S.d.unfinished ? 'Mark as finished' : 'Mark as unfinished'),
    isFace() ? el('button', { class: 'danger', onclick: async () => { if (!await confirmBox('Reset this side', `Clear everything on the ${FACES[S.face].name.toLowerCase()}?`, 'Reset')) return; touch(); S.d.faces[S.face].layers = []; S.sel = null; changed(); close(); renderEditor(); } }, `Reset ${FACES[S.face].name.toLowerCase()}`) : null,
  ));
}

// ---------- stage (canvas with handles) ----------
function buildStage() {
  const F = FACES[S.face], avail = Math.min(stageWrap.clientWidth || 640, 720) - 20, availH = Math.max(380, innerHeight - 220);
  S.scale = Math.min(avail / F.w, availH / F.h);
  stage = el('canvas', { width: Math.round(F.w * S.scale), height: Math.round(F.h * S.scale), class: 'stage' + (F.disc ? ' checker' : '') });
  stageWrap.append(stage, el('p', { class: 'hint center' }, `${F.name}: ${F.mm}. Drag to move, corners to resize, the top dot to rotate.`));
  stage.addEventListener('pointerdown', stageDown);
  animLoop();
  stage.addEventListener('dblclick', () => { const l = selLayer(); if (l && (l.type === 'text' || l.type === 'tracklist')) { const ta = document.querySelector('#artside textarea'); if (ta) { ta.focus(); ta.select(); } } });
  draw();
}
// GIFs on the design keep moving in the editor
let animOn = false, animLast = 0;
function animLoop() {
  if (animOn) return; animOn = true;
  const step = now => {
    if (app.view !== 'art' || !S.d || !stage || !document.body.contains(stage)) { animOn = false; return; }
    if (now - animLast > 60 && designMoves(S.d, S.face)) { animLast = now; draw(); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function bounds(l) { // w/h for hit-testing (text measures itself)
  if (l.type === 'text') { const m = measureText(stage.getContext('2d'), l); return { w: Math.max(m.w, 40), h: Math.max(m.h, 40) }; }
  return { w: l.w, h: l.h };
}
function draw() {
  if (!stage || !document.body.contains(stage)) return;
  const g = stage.getContext('2d'); g.clearRect(0, 0, stage.width, stage.height);
  renderFace(g, S.d, S.face, S.scale, { editor: !S.preview });
  const l = selLayer(); if (!l || S.preview) return;
  const b = bounds(l), s = S.scale;
  g.save(); g.translate(l.x * s, l.y * s); g.rotate(l.rot * Math.PI / 180);
  g.strokeStyle = '#00d0ff'; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.strokeRect(-b.w / 2 * s, -b.h / 2 * s, b.w * s, b.h * s); g.setLineDash([]);
  g.fillStyle = '#fff'; g.strokeStyle = '#00a0d0';
  for (const [hx, hy] of handlePts(b)) { g.beginPath(); g.rect(hx * s - 6, hy * s - 6, 12, 12); g.fill(); g.stroke(); }
  g.beginPath(); g.moveTo(0, -b.h / 2 * s); g.lineTo(0, -b.h / 2 * s - 26); g.stroke();
  g.beginPath(); g.arc(0, -b.h / 2 * s - 30, 7, 0, 7); g.fill(); g.stroke();
  g.restore();
}
const handlePts = b => [[-b.w / 2, -b.h / 2], [b.w / 2, -b.h / 2], [-b.w / 2, b.h / 2], [b.w / 2, b.h / 2]];
function toLocal(l, x, y) { const a = -l.rot * Math.PI / 180, dx = x - l.x, dy = y - l.y; return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]; }
function stageDown(e) {
  const r = stage.getBoundingClientRect(), s = S.scale, x = (e.clientX - r.left) / s, y = (e.clientY - r.top) / s;
  let l = selLayer(), mode = null, hi = -1;
  if (l && !l.locked) {
    const b = bounds(l), [lx, ly] = toLocal(l, x, y), tol = 10 / s;
    if (Math.hypot(lx, ly + b.h / 2 + 30 / s) < tol * 1.4) mode = 'rot';
    else handlePts(b).forEach(([hx, hy], i) => { if (Math.abs(lx - hx) < tol && Math.abs(ly - hy) < tol) { mode = 'size'; hi = i; } });
  }
  if (!mode) {
    l = [...face().layers].reverse().find(q => { if (q.hidden || q.locked) return false; const b = bounds(q), [lx, ly] = toLocal(q, x, y); return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2; });
    S.sel = l ? l.id : null; renderSide(); draw();
    if (!l) return; mode = 'move';
  }
  touch();
  const o = { x: l.x, y: l.y, w: l.w, h: l.h, rot: l.rot, size: l.size }, b0 = bounds(l);
  stage.setPointerCapture(e.pointerId);
  stage.onpointermove = ev => {
    const X = (ev.clientX - r.left) / s, Y = (ev.clientY - r.top) / s, F = FACES[S.face];
    if (mode === 'move') {
      let nx = o.x + X - x, ny = o.y + Y - y; const snap = 12 / s;
      if (Math.abs(nx - F.w / 2) < snap) nx = F.w / 2; if (Math.abs(ny - F.h / 2) < snap) ny = F.h / 2;
      l.x = nx; l.y = ny;
    } else if (mode === 'rot') {
      let a = Math.atan2(Y - l.y, X - l.x) * 180 / Math.PI + 90; if (ev.shiftKey) a = Math.round(a / 15) * 15;
      l.rot = Math.round(((a + 540) % 360) - 180);
    } else {
      const [lx, ly] = toLocal({ ...l, x: o.x, y: o.y }, X, Y), sx = Math.abs(lx) * 2 / b0.w, sy = Math.abs(ly) * 2 / b0.h;
      const keep = l.type === 'image' || l.type === 'sticker' || l.type === 'text' || ev.shiftKey, k = Math.max(0.05, keep ? Math.max(sx, sy) : 1);
      if (l.type === 'text') { l.size = clamp(Math.round(o.size * k), 8, 1200); l.w = o.w * k; }
      else if (keep) { l.w = Math.max(10, o.w * k); l.h = Math.max(10, o.h * k); }
      else { l.w = Math.max(10, o.w * sx); l.h = Math.max(4, o.h * sy); }
    }
    draw();
  };
  stage.onpointerup = () => { stage.onpointermove = null; changed(false); renderSide(); };
}

// ---------- add panel ----------
function addPanel() {
  const add = (type, o) => { touch(); const F = FACES[S.face], l = newLayer(type, { x: F.w / 2, y: F.h / 2, ...o }); face().layers.push(l); S.sel = l.id; changed(); renderSide(); return l; };
  return el('div', { class: 'artadd panel' },
    el('div', { class: 'insp-sub' }, 'Add'),
    el('button', { onclick: () => choosePicture(id => add('image', { src: id, ...fitPic(id) })) }, 'Picture'),
    el('button', { onclick: () => add('text', { text: S.face === 'disc' ? 'TITLE' : (app.P ? app.P.name : 'TITLE'), color: S.face === 'disc' ? '#111111' : '#ffffff' }) }, 'Text'),
    el('button', { onclick: () => add('text', { text: app.P && app.P.artist ? app.P.artist : 'ARTIST', font: 'Space Grotesk', size: 70, color: S.face === 'disc' ? '#111111' : '#ffffff' }) }, 'Artist name'),
    el('div', { class: 'insp-sub' }, 'Shapes'),
    el('div', { class: 'addgrid thumbs' }, [['rect', 'Box'], ['circle', 'Circle'], ['ring', 'Ring'], ['line', 'Line'], ['star', 'Star'], ['heart', 'Heart']].map(([k, n]) => el('button', { class: 'tthumb', title: n, onclick: () => add('shape', { shape: k, h: k === 'line' ? 8 : 400, w: k === 'line' ? 900 : 400 }) }, thumb('s:' + k, newLayer('shape', { shape: k, h: k === 'line' ? 40 : 400, w: 400 })), el('span', {}, n)))),
    el('div', { class: 'insp-sub' }, 'Patterns'),
    el('div', { class: 'addgrid thumbs' }, Object.entries(PATTERNS).map(([k, n]) => el('button', { class: 'tthumb', title: n, onclick: () => { const F = FACES[S.face]; add('pattern', { kind: k, w: F.w, h: F.h, circle: S.face === 'disc' }); } }, thumb('p:' + k, newLayer('pattern', { kind: k, w: 600, h: 600, seed: 7 })), el('span', {}, n)))),
    el('div', { class: 'insp-sub' }, 'Stickers'),
    el('button', { class: 'hot', onclick: async () => { const fs = await pickFiles('image/*', true); for (const f of fs) { try { const id = await addArt(f); const a = await artImage(id); const k = 420 / Math.max(a.width, a.height); add('image', { src: id, w: a.width * k, h: a.height * k, sfx: { outline: 14, outlineColor: '#ffffff', finish: 'holo', shadow: true, peel: false, wear: 0 } }); } catch { toast('Could not read ' + f.name); } } } }, '+ Upload my own sticker'),
    el('small', { class: 'hint' }, 'PNGs with a see-through background get a perfect die-cut edge. GIFs keep moving.'),
    el('div', { class: 'addgrid thumbs' }, Object.entries(STICKERS).map(([k, n]) => el('button', { class: 'tthumb', title: n, onclick: () => add('sticker', { name: k, w: ['advisory', 'limited', 'bonus', 'barcode', 'tape', 'new', 'cd'].includes(k) ? 360 : 220, h: k === 'advisory' ? 210 : k === 'tape' ? 90 : k === 'barcode' ? 170 : 220, color: k === 'barcode' ? '#000' : '#ffd23f' }) }, thumb('k:' + k, newLayer('sticker', { name: k, w: ['advisory', 'limited', 'bonus', 'barcode', 'tape', 'new', 'cd'].includes(k) ? 360 : 220, h: k === 'advisory' ? 210 : k === 'tape' ? 90 : k === 'barcode' ? 170 : 220, color: k === 'barcode' ? '#000' : '#ffd23f' })), el('span', {}, n)))),
    el('div', { class: 'insp-sub' }, 'Text blocks'),
    el('button', { onclick: async () => add('tracklist', { items: await songTitles() }) }, 'Track list'),
    el('button', { onclick: () => add('text', { text: `(c) ${new Date().getFullYear()} ${app.P && app.P.artist ? app.P.artist : 'Artist'}. All rights reserved.`, font: 'Space Grotesk', size: 30, w: 1000 }) }, 'Copyright line'),
    el('button', { onclick: () => add('text', { text: 'A short line about this album.', font: 'Playfair Display', size: 40, italic: true, w: 1000 }) }, 'Description'),
    el('button', { onclick: () => add('text', { text: 'LOGO', font: 'Monoton', size: 120 }) }, 'Logo text'));
}
function stickerLook(l, set) {
  const fx = stickerFx(l) || { outline: 14, outlineColor: '#ffffff', finish: 'gloss', shadow: true, peel: false, wear: 0 };
  const put = (k, v) => { touch(); l.sfx = { ...fx, [k]: v }; changed(); renderSide(); };
  const range = (label, k, min, max, step, fmt) => { const out = el('span', { class: 'val' }, fmt(fx[k] ?? 0)); const i = el('input', { type: 'range', min, max, step, value: fx[k] ?? 0 }); i.oninput = () => { touch(); l.sfx = { ...fx, [k]: +i.value }; fx[k] = +i.value; out.textContent = fmt(+i.value); changed(); }; return el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, label), out), i); };
  return [
    el('div', { class: 'insp-sub' }, 'Sticker look', helpBtn('stickerLook')),
    el('div', { class: 'finishes' }, ...FINISHES.map(([k, n]) => el('button', { class: 'finish f-' + k + (fx.finish === k ? ' on' : ''), onclick: () => put('finish', k) }, el('i'), n))),
    range('Die-cut edge', 'outline', 0, 60, 1, v => v ? v + 'px' : 'off'),
    fx.outline || fx.finish === 'neon' ? el('label', { class: 'num' }, fx.finish === 'neon' ? 'Glow color' : 'Edge color', el('input', { type: 'color', value: fx.outlineColor || '#ffffff', oninput: e => { touch(); l.sfx = { ...fx, outlineColor: e.target.value }; fx.outlineColor = e.target.value; changed(); } })) : null,
    ['holo', 'gloss', 'gold', 'silverfoil', 'chrome'].includes(fx.finish) ? range('Shine angle', 'angle', 0, 180, 1, v => v + '°') : null,
    range('Worn', 'wear', 0, 1, 0.01, v => v ? Math.round(v * 100) + '%' : 'new'),
    el('div', { class: 'pbtns' },
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!fx.shadow, onchange: e => put('shadow', e.target.checked) }), 'Shadow'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!fx.peel, onchange: e => put('peel', e.target.checked) }), 'Peeling corner')),
    l.type === 'image' ? el('button', { onclick: () => { touch(); delete l.sfx; l.isSticker = false; changed(); renderSide(); } }, 'Make it a normal picture again') : null];
}
// small live previews of shapes, patterns and stickers for the tool panel
const thumbCache = new Map();
function thumb(key, layer) {
  if (thumbCache.has(key)) return thumbCache.get(key).cloneNode(true);
  const c = document.createElement('canvas'); c.width = c.height = 120; const g = c.getContext('2d');
  const sc = 92 / Math.max(layer.w, layer.h); g.translate(60, 60); g.scale(sc, sc);
  try { drawLayer(g, { ...layer, x: 0, y: 0, rot: 0, opacity: 1, hidden: false }); } catch { }
  const img = el('img', { src: c.toDataURL(), alt: '' }); thumbCache.set(key, img); return img.cloneNode(true);
}
function fitPic(id) { const F = FACES[S.face]; return S.face === 'disc' ? { w: 1394, h: 1394, x: 697, y: 697 } : { w: F.w, h: F.h }; }
async function choosePicture(cb) {
  const pics = await listArt();
  const box = el('div', { class: 'picgrid small' });
  const close = modal('Pick a picture', el('div', {}, el('button', { class: 'hot', onclick: async () => { const fs = await pickFiles('image/*', true); let last = null; for (const f of fs) { try { last = await addArt(f); } catch { toast('Could not read ' + f.name); } } if (last) { close(); await artImage(last); cb(last); } } }, 'Upload new picture'), box));
  for (const p of pics.sort((a, b) => b.fav - a.fav)) {
    const img = el('img', { alt: '' }); db.get('art', p.id).then(d => { if (d) img.src = URL.createObjectURL(d.blob); });
    box.append(el('button', { class: 'piccard pick', onclick: async () => { close(); await artImage(p.id); cb(p.id); } }, img, p.fav ? el('span', { class: 'favtag' }, '★') : null));
  }
  if (!pics.length) box.append(el('p', { class: 'hint' }, 'No pictures yet. Upload one.'));
}

// ---------- side panel: properties + layers (or background / disc look) ----------
function renderSide() {
  const box = $('#artside'); if (!box) return; box.innerHTML = '';
  const l = selLayer();
  if (l && l.type === 'shape') { if (l.fill2 === true) l.fill2 = '#ffffff'; if (l.fill2 === false) l.fill2 = ''; }
  const set = (k, v, re = true) => { touch(); if (k.includes('.')) { const [a, b] = k.split('.'); l[a][b] = v; } else l[k] = v; changed(); if (!re) return; };
  const num = (label, k, min, max, step, val, fmt = v => v) => { const out = el('span', { class: 'val' }, fmt(val)); const i = el('input', { type: 'range', min, max, step }); i.value = val; i.oninput = () => { set(k, +i.value); out.textContent = fmt(+i.value); }; return el('label', { class: 'knob' }, el('span', { class: 'lab' }, label, out), i); };
  const col = (label, k, val) => el('label', { class: 'num' }, label, el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(val) ? val : '#000000', oninput: e => set(k, e.target.value) }));
  const chk = (label, k, val) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: val, onchange: e => { set(k, e.target.checked); renderSide(); } }), label);
  if (l) {
    const common = [
      num('Rotation', 'rot', -180, 180, 1, l.rot, v => v + '°'), num('Opacity', 'opacity', 0, 1, 0.01, l.opacity, v => Math.round(v * 100) + '%'),
      el('div', { class: 'pbtns' },
        el('button', { onclick: () => { touch(); const c = JSON.parse(JSON.stringify(l)); c.id = Math.random().toString(36).slice(2, 10); c.x += 40; c.y += 40; face().layers.push(c); S.sel = c.id; changed(); renderSide(); } }, 'Duplicate'),
        el('button', { onclick: () => { touch(); const F = FACES[S.face]; l.x = F.w / 2; l.y = F.h / 2; changed(); } }, 'Center'),
        el('button', { class: 'danger', onclick: () => { touch(); face().layers = face().layers.filter(q => q !== l); S.sel = null; changed(); renderSide(); } }, 'Delete')),
    ];
    let props = [];
    if (l.type === 'image') props = [
      el('button', { onclick: () => choosePicture(id => { set('src', id); renderSide(); }) }, l.src ? 'Replace picture' : 'Choose picture'),
      el('button', { onclick: () => { touch(); Object.assign(l, fitPic(l.src)); const F = FACES[S.face]; l.x = F.w / 2; l.y = F.h / 2; l.rot = 0; changed(); } }, 'Fill the whole side'),
      el('div', { class: 'insp-sub' }, 'Crop', helpBtn('crop')),
      num('Zoom', 'crop.zoom', 1, 4, 0.01, l.crop.zoom, v => Math.round(v * 100) + '%'), num('Move left/right', 'crop.ox', -1, 1, 0.01, l.crop.ox, v => v.toFixed(2)), num('Move up/down', 'crop.oy', -1, 1, 0.01, l.crop.oy, v => v.toFixed(2)),
      num('Round corners', 'radius', 0, 400, 1, l.radius, v => v), chk('Circle', 'circle', l.circle),
      num('Sticker border', 'border', 0, 60, 1, l.border || 0, v => v ? v + 'px' : 'off'), l.border ? col('Border color', 'borderColor', l.borderColor || '#ffffff') : null,
      el('div', { class: 'insp-sub' }, 'Filters and color'),
      num('Brightness', 'filters.bright', 0, 200, 1, l.filters.bright, v => v + '%'), num('Contrast', 'filters.contrast', 0, 200, 1, l.filters.contrast, v => v + '%'), num('Saturation', 'filters.sat', 0, 200, 1, l.filters.sat, v => v + '%'),
      num('Hue', 'filters.hue', -180, 180, 1, l.filters.hue, v => v + '°'), num('Blur', 'filters.blur', 0, 30, 0.5, l.filters.blur, v => v + 'px'), num('Black and white', 'filters.gray', 0, 100, 1, l.filters.gray, v => v + '%'), num('Sepia', 'filters.sepia', 0, 100, 1, l.filters.sepia, v => v + '%'),
      chk('Shadow', 'shadow.on', l.shadow.on), l.shadow.on ? num('Shadow size', 'shadow.blur', 0, 120, 1, l.shadow.blur) : null,
      ...(l.sfx ? stickerLook(l, set) : [el('button', { class: 'hot', onclick: () => { touch(); l.sfx = { outline: 14, outlineColor: '#ffffff', finish: 'holo', shadow: true, peel: false, wear: 0 }; changed(); renderSide(); } }, 'Turn this picture into a sticker')])];
    if (l.type === 'text') props = [
      el('textarea', { class: 'textin', rows: 2, value: l.text, oninput: e => set('text', e.target.value) }),
      el('label', { class: 'num' }, 'Font', select(FONTS, l.font, async v => { await document.fonts.load(`40px "${v}"`).catch(() => { }); set('font', v); })),
      num('Size', 'size', 8, 600, 1, l.size), col('Color', 'color', l.color),
      el('div', { class: 'pbtns' }, chk('Bold', 'bold', l.bold), chk('Italic', 'italic', l.italic), select([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], l.align, v => set('align', v))),
      num('Letter spacing', 'spacing', -10, 80, 1, l.spacing), num('Curve (for discs)', 'arc', -800, 800, 5, l.arc, v => v ? (v < 0 ? 'top ' : 'bottom ') + Math.abs(v) : 'off'),
      num('Outline', 'stroke.w', 0, 30, 1, l.stroke.w), l.stroke.w ? col('Outline color', 'stroke.color', l.stroke.color) : null,
      chk('Shadow / glow', 'shadow.on', l.shadow.on), l.shadow.on ? [num('Shadow size', 'shadow.blur', 0, 120, 1, l.shadow.blur), col('Shadow color', 'shadow.color', l.shadow.color)] : null];
    if (l.type === 'shape') props = [
      el('label', { class: 'num' }, 'Shape', select([['rect', 'Box'], ['circle', 'Circle'], ['ring', 'Ring'], ['line', 'Line'], ['star', 'Star'], ['heart', 'Heart']], l.shape, v => set('shape', v))),
      col('Fill', 'fill', l.fill || '#000000'), el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!l.fill2, onchange: e => { set('fill2', e.target.checked ? '#ffffff' : ''); renderSide(); } }), 'Gradient'), l.fill2 ? [col('Second color', 'fill2', l.fill2), num('Gradient angle', 'angle', 0, 360, 1, l.angle, v => v + '°')] : null,
      el('button', { onclick: () => { set('fill', ''); renderSide(); } }, 'No fill'),
      num('Outline', 'strokeW', 0, 60, 1, l.strokeW), l.strokeW ? col('Outline color', 'stroke', l.stroke || '#ffffff') : null,
      l.shape === 'rect' ? num('Round corners', 'radius', 0, 400, 1, l.radius) : null];
    if (l.type === 'sticker') props = [el('label', { class: 'num' }, 'Sticker', select(Object.entries(STICKERS), l.name, v => set('name', v))), ['advisory', 'explicit', 'barcode'].includes(l.name) ? null : col('Color', 'color', l.color), ...stickerLook(l, set)];
    if (l.type === 'tracklist') props = [
      el('textarea', { class: 'textin', rows: 6, value: l.items.join('\n'), oninput: e => { set('items', e.target.value.split('\n')); } }),
      el('button', { onclick: async () => { touch(); l.items = await songTitles(); changed(); renderSide(); } }, 'Fill from my songs'),
      el('label', { class: 'num' }, 'Font', select(FONTS, l.font, async v => { await document.fonts.load(`40px "${v}"`).catch(() => { }); set('font', v); })),
      num('Size', 'size', 12, 160, 1, l.size), col('Color', 'color', l.color), chk('Numbers', 'numbered', l.numbered), num('Line spacing', 'gap', 1, 3, 0.05, l.gap, v => v.toFixed(2))];
    if (l.type === 'pattern') props = [
      el('label', { class: 'num' }, 'Pattern', select(Object.entries(PATTERNS), l.kind, v => set('kind', v))),
      col('Background', 'c1', l.c1), col('Pattern color', 'c2', l.c2),
      num('Size', 'scale', 0.2, 4, 0.01, l.scale, v => Math.round(v * 100) + '%'), num('Angle', 'angle', -180, 180, 1, l.angle, v => v + '°'),
      chk('Circle', 'circle', l.circle),
      el('button', { onclick: () => { set('seed', Math.floor(Math.random() * 1e9)); } }, 'Shuffle'),
      el('button', { onclick: () => { touch(); const F = FACES[S.face]; Object.assign(l, { x: F.w / 2, y: F.h / 2, w: F.w, h: F.h, rot: 0 }); changed(); } }, 'Fill the whole side')];
    box.append(el('div', { class: 'panel sidep' }, el('div', { class: 'insp-sub' }, { image: 'Picture', text: 'Text', shape: 'Shape', sticker: 'Sticker', tracklist: 'Track list', pattern: 'Pattern' }[l.type], el('span', { class: 'spacer' }), el('button', { class: 'tiny', onclick: () => { S.sel = null; draw(); renderSide(); } }, 'Done')), props, common));
  } else if (S.face === 'disc') box.append(discPanel());
  else box.append(bgPanel());
  box.append(layersPanel());
}
function bgPanel() {
  const bg = face().bg, set = (k, v) => { touch(); bg[k] = v; changed(); };
  return el('div', { class: 'panel sidep' }, el('div', { class: 'insp-sub' }, 'Background', helpBtn('artBg')),
    select([['color', 'Solid color'], ['gradient', 'Gradient']], bg.type === 'none' ? 'color' : bg.type, v => { set('type', v); renderSide(); }),
    el('label', { class: 'num' }, 'Color', el('input', { type: 'color', value: bg.c1, oninput: e => set('c1', e.target.value) })),
    bg.type === 'gradient' ? [el('label', { class: 'num' }, 'Color 2', el('input', { type: 'color', value: bg.c2, oninput: e => set('c2', e.target.value) })), el('label', { class: 'knob' }, 'Angle', el('input', { type: 'range', min: 0, max: 360, value: bg.angle, oninput: e => set('angle', +e.target.value) }))] : null,
    el('p', { class: 'hint' }, 'Click something on the design to edit it. Click empty space to come back here.'));
}
function discPanel() {
  const D = S.d.disc, bg = face().bg;
  const setC = (k, v) => { touch(); D.cond[k] = v; changed(); };
  return el('div', { class: 'panel sidep' },
    el('div', { class: 'insp-sub' }, 'Disc look', helpBtn('discLook')),
    el('div', { class: 'fxlib' }, Object.entries(MATERIALS).map(([k, n]) => el('button', { class: 'chip' + (D.material === k ? ' on' : ''), onclick: () => { touch(); D.material = k; changed(); renderSide(); } }, n))),
    D.material === 'custom' ? el('label', { class: 'num' }, 'Disc color', el('input', { type: 'color', value: D.color, oninput: e => { touch(); D.color = e.target.value; changed(); } })) : null,
    el('div', { class: 'insp-sub' }, 'Back of the disc (shiny side)', helpBtn('discDye')),
    el('div', { class: 'fxlib' }, [['silver', 'Silver'], ['green', 'Green (CD-R)'], ['gold', 'Gold'], ['blue', 'Blue'], ['purple', 'Purple (DVD-R)']].map(([k, n]) => el('button', { class: 'chip' + ((D.dye || 'silver') === k ? ' on' : ''), onclick: () => { touch(); D.dye = k; changed(); renderSide(); } }, n))),
    el('button', { onclick: () => {
      touch(); const L = face().layers, c = 697;
      L.push(newLayer('text', { text: 'CD-R', font: 'Playfair Display', italic: true, bold: true, size: 150, color: '#3a3a3a', x: c - 330, y: c - 120 }));
      L.push(newLayer('text', { text: '700 MB', font: 'Playfair Display', italic: true, size: 80, color: '#3a3a3a', x: c + 330, y: c - 120 }));
      L.push(newLayer('text', { text: '80 min', font: 'Space Grotesk', size: 46, color: '#555555', x: c + 330, y: c - 40 }));
      for (let i = 0; i < 4; i++) L.push(newLayer('shape', { shape: 'line', x: c, y: c + 230 + i * 70, w: 760 - i * 90, h: 3, fill: '#9a9a9a' }));
      if (D.material !== 'silver' && D.material !== 'white') D.material = 'silver';
      changed(); renderSide(); toast('Blank CD-R look added. Write on the lines with Text.');
    } }, 'Add blank CD-R look'),
    el('div', { class: 'insp-sub' }, 'Condition', helpBtn('discCondition')),
    el('div', { class: 'fxlib' }, Object.keys(CONDITIONS).map(n => el('button', { class: 'chip', onclick: () => { touch(); Object.assign(D.cond, { scratches: 0, cracks: 0, chips: 0, wear: 0, dirt: 0, dust: 0, fade: 0, age: 0, shine: 0 }, CONDITIONS[n]); changed(); renderSide(); } }, n))),
    COND_KEYS.map(([k, n]) => { const i = el('input', { type: 'range', min: k === 'shine' ? -1 : 0, max: 1, step: 0.01 }); i.value = D.cond[k]; i.oninput = () => setC(k, +i.value); return el('label', { class: 'knob' }, n, i); }),
    el('button', { onclick: () => { touch(); D.seed = Math.floor(Math.random() * 1e9); changed(); } }, 'New random damage'),
    el('div', { class: 'insp-sub' }, 'Center', helpBtn('discHub')),
    select([['clear', 'Clear plastic ring'], ['color', 'Colored ring']], D.hub, v => { touch(); D.hub = v; changed(); renderSide(); }),
    D.hub === 'color' ? el('label', { class: 'num' }, 'Ring color', el('input', { type: 'color', value: D.hubColor, oninput: e => { touch(); D.hubColor = e.target.value; changed(); } })) : null,
    el('div', { class: 'insp-sub' }, 'Printed label background'),
    select([['none', 'None (show the disc)'], ['color', 'Solid color'], ['gradient', 'Gradient']], bg.type, v => { touch(); bg.type = v; changed(); renderSide(); }),
    bg.type !== 'none' ? el('label', { class: 'num' }, 'Color', el('input', { type: 'color', value: bg.c1, oninput: e => { touch(); bg.c1 = e.target.value; changed(); } })) : null,
    bg.type === 'gradient' ? el('label', { class: 'num' }, 'Color 2', el('input', { type: 'color', value: bg.c2, oninput: e => { touch(); bg.c2 = e.target.value; changed(); } })) : null);
}
function layersPanel() {
  const L = face().layers;
  const name = l => l.type === 'pattern' ? 'Pattern: ' + PATTERNS[l.kind] : l.type === 'text' ? '"' + String(l.text).slice(0, 18) + '"' : l.type === 'sticker' ? STICKERS[l.name] : l.type === 'shape' ? l.shape : l.type === 'image' ? (l.src ? 'Picture' : 'Picture frame (empty)') : 'Track list';
  const mv = (l, d) => { const i = L.indexOf(l), j = i + d; if (j < 0 || j >= L.length) return; touch(); [L[i], L[j]] = [L[j], L[i]]; changed(); renderSide(); };
  return el('div', { class: 'panel sidep' }, el('div', { class: 'insp-sub' }, 'Layers (top first)', helpBtn('layers')),
    L.length ? [...L].reverse().map(l => el('div', { class: 'layerrow' + (l.id === S.sel ? ' on' : '') },
      el('button', { class: 'lname', onclick: () => { S.sel = l.id; draw(); renderSide(); } }, name(l)),
      el('button', { class: 'sq', title: 'Up', onclick: () => mv(l, 1) }, '↑'), el('button', { class: 'sq', title: 'Down', onclick: () => mv(l, -1) }, '↓'),
      el('button', { class: 'sq' + (l.hidden ? ' on' : ''), title: 'Hide', onclick: () => { touch(); l.hidden = !l.hidden; changed(); renderSide(); } }, l.hidden ? 'H' : 'V'),
      el('button', { class: 'sq' + (l.locked ? ' on' : ''), title: 'Lock', onclick: () => { touch(); l.locked = !l.locked; changed(); renderSide(); } }, l.locked ? 'L' : 'U'))) : el('p', { class: 'hint' }, 'Empty. Add something on the left.'));
}

// ---------- package preview (3D) ----------
const IRID = { silver: 0.9, white: 0.2, black: 0.55, gold: 0.75, rosegold: 0.7, pink: 0.6, purple: 0.6, blue: 0.65, rainbow: 1, transparent: 0.85, frosted: 0.35, holo: 1, vintage: 0.35, retro: 0.3, custom: 0.6 };
function disc3d(url, d) {
  const labelCovers = d.faces.disc.bg.type !== 'none';
  const k = IRID[d.disc.material] ?? 0.6;
  const edges = Array.from({ length: 7 }, (_, i) => el('div', { class: 'd3-edge', style: `transform: translateZ(${(i - 3) * 0.55}px)` }));
  return el('div', { class: 'obj disc3d', style: `--irid:${labelCovers ? (k * 0.35).toFixed(2) : k};--iridback:${Math.max(0.75, k)}` },
    el('div', { class: 'tilt' }, edges,
      el('div', { class: 'spinner' },
        el('div', { class: 'd3-face front' }, el('img', { src: url, alt: 'disc label', draggable: 'false' })),
        el('div', { class: 'd3-face back' }, el('div', { class: 'd3-data' }))),
      el('div', { class: 'd3-light front' }, el('div', { class: 'd3-irid' }), el('div', { class: 'd3-rings' }), el('div', { class: 'd3-spec' })),
      el('div', { class: 'd3-light back' }, el('div', { class: 'd3-irid strong' }), el('div', { class: 'd3-rings' }), el('div', { class: 'd3-spec' }))));
}
function case3d(url, w, h, hinge) {
  const T = 16;
  const f = (cls, style, ...kids) => el('div', { class: 'cf ' + cls, style }, ...kids);
  return el('div', { class: 'obj case3d', style: `--w:${w}px;--h:${h}px;--t:${T}px` },
    el('div', { class: 'tilt' },
      f('front', `width:${w}px;height:${h}px;transform:translateZ(${T / 2}px)`, el('img', { src: url, alt: '', draggable: 'false' }), el('div', { class: 'ptint' }), el('div', { class: 'pfin' }), el('div', { class: 'glass' }), el('div', { class: 'pwear' }), hinge ? el('div', { class: 'hinge' }) : null, el('div', { class: 'cracks' })),
      f('back', `width:${w}px;height:${h}px;transform:rotateY(180deg) translateZ(${T / 2}px)`, el('img', { class: 'thru', src: url, alt: '', draggable: 'false' }), el('div', { class: 'ptint' }), el('div', { class: 'pfin' }), el('div', { class: 'glass' }), el('div', { class: 'pwear' })),
      f('side', `width:${T}px;height:${h}px;left:${(w - T) / 2}px;transform:rotateY(90deg) translateZ(${w / 2}px)`),
      f('side spine', `width:${T}px;height:${h}px;left:${(w - T) / 2}px;transform:rotateY(-90deg) translateZ(${w / 2}px)`),
      f('side', `width:${w}px;height:${T}px;top:${(h - T) / 2}px;transform:rotateX(90deg) translateZ(${h / 2}px)`),
      f('side', `width:${w}px;height:${T}px;top:${(h - T) / 2}px;transform:rotateX(-90deg) translateZ(${h / 2}px)`)));
}
// plastic controls: tint, finish and wear, shared by the case preview and the 3D studio
function plasticPanel(cs, apply) {
  const p = plasticOf(cs), put = (k, v, re = true) => { touch(); p[k] = v; changed(false); apply(); if (re) renderEditor(); };
  const rng = (label, k, min, max, step, fmt) => { const out = el('span', { class: 'val' }, fmt(p[k])); const i = el('input', { type: 'range', min, max, step, value: p[k] }); i.oninput = () => { p[k] = +i.value; out.textContent = fmt(+i.value); changed(false); apply(); }; return el('label', { class: 'knob' }, el('span', { class: 'lab' }, el('span', {}, label), out), i); };
  return [
    el('div', { class: 'insp-sub' }, 'Plastic', helpBtn('plastic')),
    el('div', { class: 'fxlib' }, ...PFINISH.map(([k, n]) => el('button', { class: 'chip' + (p.finish === k ? ' on' : ''), onclick: () => put('finish', k) }, n))),
    el('label', { class: 'num' }, 'Tint color', el('input', { type: 'color', value: p.tint, oninput: e => put('tint', e.target.value, false) })),
    rng('Tint strength', 'tintAmt', 0, 1, 0.01, v => v ? Math.round(v * 100) + '%' : 'none'),
    el('div', { class: 'insp-sub' }, 'Condition'),
    el('div', { class: 'fxlib' }, ...PWEAR.map(([k, n]) => el('button', { class: 'chip' + (p.wear === k ? ' on' : ''), onclick: () => put('wear', k) }, n))),
    p.wear !== 'new' ? rng('How much', 'wearAmt', 0.1, 1, 0.01, v => Math.round(v * 100) + '%') : null];
}
// ---------- shared 3D pieces (case preview, cover mockup and 3D studio all use the real 3D renderer) ----------
const PAPER_TYPES = [['gloss', 'Glossy'], ['satin', 'Satin'], ['matte', 'Matte'], ['textured', 'Textured art paper']];
const TRAYS = [['', 'Match the case'], ['black', 'Black'], ['white', 'White'], ['clear', 'Clear'], ['color', 'Case color']];
function mount3d(d, opts, ready) {
  const host = el('div', { class: 'view3d' }), status = el('p', { class: 'hint' }, 'Loading 3D...');
  (async () => {
    try { const mod = await import('./viewer3d.js'); const V = await mod.mountViewer(host, d, opts); S.viewer = V; ready(V); }
    catch (e) { status.textContent = '3D could not start in this browser: ' + e.message; }
  })();
  return { host, status };
}
const zoomHint = () => el('p', { class: 'hint center' }, 'Drag to turn it. Mouse wheel or pinch to zoom in close. Right-drag to move it.');
function zoomBtns(V) { return el('div', { class: 'pbtns' }, el('button', { onclick: () => V.zoom(0.8) }, 'Zoom in'), el('button', { onclick: () => V.zoom(1.25) }, 'Zoom out'), el('button', { onclick: () => V.frame() }, 'Fit')); }
function paperPanel(V) {
  const m = S.d.mock;
  return [el('div', { class: 'insp-sub' }, 'Paper', helpBtn('paper3d')),
    el('div', { class: 'fxlib' }, PAPER_TYPES.map(([k, n]) => el('button', { class: 'chip' + ((m.paper || 'satin') === k ? ' on' : ''), onclick: () => { touch(); m.paper = k; changed(false); V.rebuild(); renderEditor(); } }, n)))];
}
function trayPanel(V) {
  const p = plasticOf(S.d.caseStyle);
  return [el('div', { class: 'insp-sub' }, 'Disc tray'),
    el('div', { class: 'fxlib' }, TRAYS.map(([k, n]) => el('button', { class: 'chip' + ((p.tray || '') === k ? ' on' : ''), onclick: () => { touch(); p.tray = k; changed(false); V.rebuild(); renderEditor(); } }, n)))];
}
function caseStylePanel(V) {
  const cs = S.d.caseStyle;
  return [el('div', { class: 'insp-sub' }, 'Case style', helpBtn('caseStyle')),
    el('div', { class: 'fxlib' }, Object.entries(CASES).map(([k, n]) => el('button', { class: 'chip' + (cs.style === k ? ' on' : ''), onclick: () => { touch(); cs.style = k; changed(false); V.rebuild(); renderEditor(); } }, n))),
    el('label', { class: 'num' }, 'Case color', el('input', { type: 'color', value: cs.color, onchange: e => { touch(); cs.color = e.target.value; changed(false); V.rebuild(); } }))];
}
// the MiniDisc label: picture or GIF, words, label color, spine text
function mdLabelPanel(V) {
  const d = S.d, f = d.faces.mdlabel, F = FACES.mdlabel, txt = f.layers.find(l => l.mdText);
  const redo = async () => { changed(false); await V.refresh(); };
  return [el('div', { class: 'insp-sub' }, 'MiniDisc label', helpBtn('mdlabel3d')),
    el('p', { class: 'hint' }, 'The paper label on the front. Put a picture or a moving GIF on it, write on it, or open the full label editor.'),
    el('div', { class: 'pbtns' },
      el('button', { class: 'hot', onclick: async () => { const [file] = await pickFiles('image/*', false); if (!file) return; try { const id = await addArt(file); const a = await artImage(id); touch(); f.layers = f.layers.filter(l => !l.mdPic); const k = Math.max(F.w / a.width, F.h / a.height); f.layers.unshift(newLayer('image', { src: id, mdPic: true, w: a.width * k, h: a.height * k, x: F.w / 2, y: F.h / 2 })); await redo(); renderEditor(); } catch { toast('Could not read that picture.'); } } }, 'Picture or GIF'),
      f.layers.some(l => l.mdPic) ? el('button', { onclick: async () => { touch(); f.layers = f.layers.filter(l => !l.mdPic); await redo(); renderEditor(); } }, 'Remove picture') : null,
      el('button', { onclick: () => { S.face = 'mdlabel'; renderEditor(); } }, 'Full label editor')),
    el('label', { class: 'num' }, 'Words on the label', el('input', { class: 'textin', value: txt ? txt.text : '', placeholder: 'song or mix name', onchange: async e => { touch(); const v = e.target.value; let l = f.layers.find(x => x.mdText); if (!v) f.layers = f.layers.filter(x => !x.mdText); else if (l) l.text = v; else f.layers.push(newLayer('text', { text: v, mdText: true, font: 'Permanent Marker', size: 90, color: '#1a1a1a', x: F.w / 2, y: F.h * 0.55, w: 820, h: 140 })); await redo(); } })),
    el('label', { class: 'num' }, 'Label color', el('input', { type: 'color', value: f.bg.c1 || '#f4f1ea', onchange: async e => { touch(); f.bg = { type: 'color', c1: e.target.value, c2: e.target.value, angle: 135 }; await redo(); } })),
    el('label', { class: 'num' }, 'Spine text', el('input', { class: 'textin', value: d.mock.shellText || '', placeholder: d.name, onchange: e => { touch(); d.mock.shellText = e.target.value; changed(false); V.rebuild(); } }))];
}
function mdShellPanel(V) {
  const m = S.d.mock, set = (k, v, re) => { touch(); m[k] = v; changed(false); V.rebuild(); if (re) renderEditor(); };
  return [el('div', { class: 'insp-sub' }, 'MiniDisc shell'),
    el('label', { class: 'num' }, 'Shell color', el('input', { type: 'color', value: m.shell, onchange: e => set('shell', e.target.value) })),
    el('label', { class: 'knob' }, 'Color strength', el('input', { type: 'range', min: 0, max: 0.9, step: 0.01, value: m.shellAlpha, onchange: e => set('shellAlpha', +e.target.value) })),
    el('button', { onclick: () => set('shellAlpha', 0, true) }, 'Crystal clear shell'),
    el('label', { class: 'num' }, 'Disc inside', select([['silver', 'Silver'], ['magenta', 'Magenta'], ['red', 'Red'], ['blue', 'Blue'], ['gold', 'Gold'], ['green', 'Green'], ['black', 'Black']], m.mdDisc || 'silver', v => set('mdDisc', v))),
    el('label', { class: 'num' }, 'Shutter', select([['metal', 'Silver metal'], ['black', 'Black'], ['color', 'Same as shell']], m.shutter, v => set('shutter', v))),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: m.insert, onchange: e => set('insert', e.target.checked) }), 'Insert arrow')];
}
function packageView() {
  const d = S.d, cs = d.caseStyle, panel = el('div', { class: 'panel sidep' });
  const { host, status } = mount3d(d, { format: 'cdcase', auto: false }, V => {
    V.view('hero');
    panel.innerHTML = '';
    panel.append(...[].concat(...[
      el('p', { class: 'hint' }, 'A real CD case you can open, turn and zoom into. Your front cover is the booklet under the lid. Your back cover is the inlay behind the tray, folded into the spines.'),
      ...caseStylePanel(V),
      el('label', { class: 'knob' }, 'Open the case', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: V.st.open, oninput: e => V.set('open', +e.target.value) })),
      ...plasticPanel(cs, () => V.rebuild()),
      ...trayPanel(V), ...paperPanel(V),
      el('div', { class: 'insp-sub' }, 'Look'),
      el('div', { class: 'addgrid' }, [['hero', 'Angle'], ['front', 'Front'], ['back', 'Back'], ['left', 'Spine'], ['top', 'Top']].map(([k, n]) => el('button', { onclick: () => V.view(k) }, n))),
      zoomBtns(V),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: V.st.spin, onchange: e => V.set('spin', e.target.checked) }), 'Spin the disc'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: V.st.auto, onchange: e => V.set('auto', e.target.checked) }), 'Turn slowly by itself'),
      el('button', { onclick: () => { S.tab = '3d'; S.face = '3d'; renderEditor(); } }, 'More in the 3D studio'),
      helpBtn('package3d')]).flat(4).filter(Boolean));
  });
  panel.append(status);
  return el('div', { class: 'artmain pkg' }, el('div', { class: 'stagewrap s3d' }, host, zoomHint()), panel);
}
// Mouse tilt + drag to turn, with smoothing and a gentle idle sway. Light effects follow the angle.
function tilt3d(scene) {
  let tx = 0, ty = 0, rx = 0, ry = 0, yaw = 0, drag = null, last = performance.now();
  scene.resetView = () => { yaw = 0; tx = 0; ty = 0; last = performance.now(); };
  // keep everything on one row: shrink the objects to fit narrow windows (so reflections never overlap)
  const fit = () => { const wraps = [...scene.querySelectorAll(':scope > .reflectwrap')].filter(w => getComputedStyle(w).display !== 'none'); if (!wraps.length) return; wraps.forEach(w => w.style.zoom = 1); const need = wraps.reduce((a, w) => a + w.offsetWidth, 0) + 56 * (wraps.length - 1) + 60; const z = Math.min(1, scene.clientWidth / need); wraps.forEach(w => w.style.zoom = z); };
  new ResizeObserver(fit).observe(scene); setTimeout(fit, 50);
  scene.addEventListener('pointermove', e => {
    const r = scene.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
    if (drag) { yaw += (e.clientX - drag.x) * 0.6; tx = clamp(tx - (e.clientY - drag.y) * 0.3, -70, 70); drag = { x: e.clientX, y: e.clientY }; }
    else { ty = px * 90; tx = -py * 60; }
    last = performance.now();
  });
  scene.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; scene.setPointerCapture(e.pointerId); scene.classList.add('grabbing'); });
  scene.addEventListener('pointerup', () => { drag = null; scene.classList.remove('grabbing'); });
  scene.addEventListener('pointerleave', () => { if (!drag) { tx = 0; ty = 0; } });
  const step = () => {
    if (!document.body.contains(scene)) return;
    const idle = performance.now() - last > 2500 && !drag && S.sway !== false, t = performance.now() / 1000;
    const gx = idle ? Math.sin(t * 0.6) * 14 : tx, gy = idle ? Math.sin(t * 0.4) * 32 : ty;
    rx += (gx - rx) * 0.12; ry += (gy + yaw - ry) * 0.12;
    scene.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    scene.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    // light: rainbow angle and highlight position follow the tilt
    scene.style.setProperty('--ang', (ry * 2.2 + rx * 3).toFixed(1) + 'deg');
    scene.style.setProperty('--sx', (50 + Math.sin(ry * Math.PI / 180) * 60 + rx * 0.6).toFixed(1) + '%');
    scene.style.setProperty('--glint', (0.35 + Math.abs(Math.sin((ry + rx) * Math.PI / 90)) * 0.45).toFixed(2));
    requestAnimationFrame(step);
  };
  step();
}

// ---------- GIF and design files ----------
async function coverGif(d, faceKey, size, spin) {
  const { setArtTime } = await import('./art.js'), { encodeGIF } = await import('./gifenc.js');
  const n = 36, frames = [], c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < n; i++) {
    setArtTime(i / n * 3000);
    const f = await faceCanvas(d, faceKey, { size: spin ? size * 0.9 : size });
    g.fillStyle = spin ? '#0b0b0d' : '#000'; g.fillRect(0, 0, size, size);
    if (spin) { g.save(); g.translate(size / 2, size / 2); g.rotate(i / n * Math.PI * 2); g.drawImage(f, -f.width / 2, -f.height / 2); g.restore(); const sh = g.createLinearGradient(0, 0, size, size); sh.addColorStop(0.35, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.18)'); sh.addColorStop(0.65, 'rgba(255,255,255,0)'); g.fillStyle = sh; g.beginPath(); g.arc(size / 2, size / 2, size * 0.45, 0, 7); g.fill(); }
    else g.drawImage(f, 0, 0, size, size);
    frames.push(g.getImageData(0, 0, size, size)); await new Promise(r => setTimeout(r, 0));
  }
  setArtTime(null);
  download(encodeGIF(frames, 80), `${safeName(d.name)}-${spin ? 'disc-spin' : 'cover'}.gif`);
}
const blobURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
async function saveDesignFile(d) {
  const ids = new Set(); for (const f of Object.values(d.faces)) for (const l of f.layers) if (l.type === 'image' && l.src) ids.add(l.src);
  const pics = {}; for (const id of ids) { const a = await db.get('art', id); if (a) pics[id] = { name: a.name, data: await blobURL(a.blob) }; }
  const file = { kind: 'sheloops-cover', version: 1, design: d, pics };
  download(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${safeName(d.name)}.sheloopscover`);
}
async function openDesignFile() {
  const [f] = await pickFiles('.sheloopscover,application/json', false); if (!f) return;
  try {
    const file = JSON.parse(await f.text()); if (file.kind !== 'sheloops-cover') throw new Error('not a SHELOOPS cover file');
    const map = {}; for (const [old, p] of Object.entries(file.pics || {})) { const b = await (await fetch(p.data)).blob(); map[old] = await addArt(new File([b], p.name || 'picture', { type: b.type })); }
    const d = JSON.parse(JSON.stringify(file.design)); d.id = Math.random().toString(36).slice(2, 10); d.name = d.name + ' (opened)';
    for (const fc of Object.values(d.faces)) for (const l of fc.layers) if (l.type === 'image' && l.src) l.src = map[l.src] || null;
    await saveDesign(d); toast(`Opened "${d.name}".`); await openDesign(d);
  } catch (e) { toast('Could not open that file: ' + e.message); }
}
// ---------- export ----------
function exportMenu() {
  const d = S.d;
  const go = async (label, fn) => { toast('Making ' + label + '...'); try { await fn(); toast('Saved to your downloads.'); } catch (e) { toast('Export failed: ' + e.message); } };
  const file = async (key, opts, suffix, jpg) => download(await canvasBlob(await faceCanvas(d, key, { ...opts, jpg }), jpg), `${safeName(d.name)}-${suffix}.${jpg ? 'jpg' : 'png'}`);
  const row = (title, sub, png, jpg) => el('div', { class: 'exprow' }, el('div', {}, el('b', {}, title), el('small', {}, sub)), el('button', { onclick: png }, 'PNG'), jpg ? el('button', { onclick: jpg }, 'JPG') : el('span'));
  modal('Export artwork', el('div', { class: 'explist' },
    row('Square cover, high resolution', '3000 x 3000 px. For Spotify, Apple Music, YouTube, SoundCloud and other stores.', () => go('cover', () => file('cover', { size: 3000 }, 'cover-3000', false)), () => go('cover', () => file('cover', { size: 3000 }, 'cover-3000', true))),
    row('Square cover, small', '1000 x 1000 px. For social posts and sharing.', () => go('cover', () => file('cover', { size: 1000 }, 'cover-1000', false)), () => go('cover', () => file('cover', { size: 1000 }, 'cover-1000', true))),
    row('Front insert, print ready', '120 x 120 mm + 3 mm bleed at 300 dpi (1488 x 1488 px).', () => go('front insert', () => file('cover', { bleed: true }, 'front-print', false)), () => go('front insert', () => file('cover', { bleed: true }, 'front-print', true))),
    row('Back insert, print ready', '150 x 118 mm with spines + 3 mm bleed at 300 dpi.', () => go('back insert', () => file('back', { bleed: true }, 'back-print', false)), () => go('back insert', () => file('back', { bleed: true }, 'back-print', true))),
    row('Disc label', '118 mm at 300 dpi with the hole cut out (PNG keeps it see-through).', () => go('disc', () => file('disc', {}, 'disc', false)), () => go('disc', () => file('disc', {}, 'disc', true))),
    row('Booklet page', '120 x 120 mm + 3 mm bleed at 300 dpi.', () => go('booklet', () => file('booklet', { bleed: true }, 'booklet-print', false)), () => go('booklet', () => file('booklet', { bleed: true }, 'booklet-print', true))),
    row('Complete CD package sheet', 'A4 page at 300 dpi with front, back and disc, crop marks included. Print at 100%.', () => go('print sheet', async () => download(await canvasBlob(await printSheet(d)), `${safeName(d.name)}-cd-package.png`)), () => go('print sheet', async () => download(await canvasBlob(await printSheet(d), true), `${safeName(d.name)}-cd-package.jpg`))),
    row('Everything', 'Cover 3000, front, back, disc, booklet and the A4 sheet (PNG).', async () => go('all files', async () => {
      await file('cover', { size: 3000 }, 'cover-3000'); for (const [k, s] of [['cover', 'front-print'], ['back', 'back-print'], ['booklet', 'booklet-print']]) { await file(k, { bleed: true }, s); await new Promise(r => setTimeout(r, 300)); }
      await file('disc', {}, 'disc'); download(await canvasBlob(await printSheet(d)), `${safeName(d.name)}-cd-package.png`);
    })),
    el('div', { class: 'exgroup' }, 'Moving pictures (GIF)'),
    row('Animated cover GIF', 'Your cover with GIFs, holograms and glitter moving. 600 x 600 px.', async () => go('cover GIF', () => coverGif(d, 'cover', 600, false))),
    row('Spinning disc GIF', 'Your disc label turning like it is playing. 500 x 500 px.', async () => go('disc GIF', () => coverGif(d, 'disc', 500, true))),
    el('div', { class: 'exgroup' }, 'Design file'),
    row('Save this design', 'A .sheloopscover file with every picture inside. Open it on any computer, or share it.', async () => go('design file', () => saveDesignFile(d))),
    el('p', { class: 'hint' }, 'Tip: streaming stores want a square image 3000 x 3000 px, RGB, under 10 MB, with no website links or blurry text. For the 3D package as a GIF, open the 3D studio tab.')));
}

// ---------- song covers ----------
export async function useAsCover(d) {
  const projects = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (!projects.length) return toast('Make a song first.');
  let pick = app.P ? app.P.id : projects[0].id;
  const close = modal('Use as song cover', el('div', {},
    el('p', {}, 'The front of this design becomes the cover of:'),
    select(projects.map(p => [p.id, p.name]), pick, v => pick = v),
    el('p', { class: 'hint' }, 'It shows in your projects, the menu, the player, and inside exported MP3s. You can change it any time; your music is not affected.')),
    [['Cancel', () => { }], ['Use it', () => { apply(); return true; }, 'hot']]);
  async function apply() {
    const cv = await faceCanvas(d, 'cover', { size: 1000, jpg: true }), url = cv.toDataURL('image/jpeg', 0.9);
    if (app.P && app.P.id === pick) { app.P.cover = url; app.P.coverDesign = d.id; await flush(); emit('meta'); }
    else { const p = await db.get('projects', pick); p.cover = url; p.coverDesign = d.id; p.updated = Date.now(); await db.put('projects', p.id, p); }
    d.unfinished = false; await saveDesign(d);
    toast('Cover updated.');
  }
}
export function artKey(e) {
  if (app.view !== 'art' || !S.d || e.target.matches('input, textarea, select')) return false;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey, l = selLayer();
  if (ctrl && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return true; }
  if (ctrl && k === 'y') { e.preventDefault(); redo(); return true; }
  if (ctrl && k === 'd' && l) { e.preventDefault(); touch(); const c = JSON.parse(JSON.stringify(l)); c.id = Math.random().toString(36).slice(2, 10); c.x += 40; c.y += 40; face().layers.push(c); S.sel = c.id; changed(); renderSide(); return true; }
  if (!l) return false;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); touch(); face().layers = face().layers.filter(q => q !== l); S.sel = null; changed(); renderSide(); return true; }
  const step = e.shiftKey ? 20 : 4, mv = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[k];
  if (mv) { e.preventDefault(); touch(); l.x += mv[0]; l.y += mv[1]; changed(); return true; }
  return false;
}

// ---------- flat mockups (CD in clear case, MiniDisc, disc) ----------
const MOCK_FORMATS = [['cdcase', 'CD case'], ['slim', 'Colored slim case'], ['sleeve', 'Card sleeve'], ['minidisc', 'MiniDisc'], ['disc', 'Disc only'], ['wallet', 'CD book'], ['fan', 'Stack of cases']];
function mockupView() {
  const d = S.d, m = d.mock, panel = el('div', { class: 'panel sidep' });
  const fmt = () => m.format === 'cdcase' ? 'cdcase' : m.format;
  const { host, status } = mount3d(d, { format: fmt(), auto: false, bg: m.bg }, V => {
    V.view('hero'); V.set('light', 0.4 + m.glare); V.set('rainbow', m.sparkle * 2.5); if (m.slim) V.set('caseColor', m.slim);
    let size = 3000;
    const set = (k, v, re) => { touch(); m[k] = v; changed(false); if (re) renderEditor(); };
    const exp = async mime => { toast('Making your picture...'); const b = await V.snapshot(size, mime, m.transparent); download(b, `${safeName(d.name)}-${m.format}-${size}.${mime.split('/')[1].replace('jpeg', 'jpg')}`); toast('Saved to your downloads.'); };
    panel.innerHTML = '';
    panel.append(...[].concat(...[
      el('div', { class: 'insp-sub' }, 'Style', helpBtn('mockup')),
      el('div', { class: 'fxlib' }, MOCK_FORMATS.map(([k, n]) => el('button', { class: 'chip' + (m.format === k ? ' on' : ''), onclick: () => { set('format', k); V.set('format', fmt()); V.view('hero'); renderEditor(); } }, n))),
      el('div', { class: 'pbtns' }, el('button', { onclick: () => { S.face = 'disc'; renderEditor(); } }, 'Edit disc art'), el('button', { onclick: () => { S.face = 'cover'; renderEditor(); } }, 'Edit front cover')),
      m.format === 'slim' ? el('label', { class: 'num' }, 'Case color', el('input', { type: 'color', value: m.slim || '#7a3cff', onchange: e => { set('slim', e.target.value); V.set('caseColor', e.target.value); } })) : null,
      m.format === 'cdcase' ? [...caseStylePanel(V), ...plasticPanel(d.caseStyle, () => V.rebuild()), ...trayPanel(V)] : null,
      m.format === 'minidisc' ? [...mdLabelPanel(V), ...mdShellPanel(V)] : null,
      m.format !== 'disc' ? paperPanel(V) : null,
      el('div', { class: 'insp-sub' }, 'Light and background'),
      el('label', { class: 'knob' }, 'Shine and glare', el('input', { type: 'range', min: 0, max: 1.5, step: 0.01, value: m.glare, oninput: e => { m.glare = +e.target.value; V.set('light', 0.4 + m.glare); }, onchange: () => { touch(); changed(false); } })),
      el('label', { class: 'knob' }, 'Rainbow on the disc', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: m.sparkle, onchange: e => { set('sparkle', +e.target.value); V.set('rainbow', m.sparkle * 2.5); } })),
      el('div', { class: 'pbtns' }, el('label', { class: 'num' }, 'Color', el('input', { type: 'color', value: m.bg, oninput: e => { m.bg = e.target.value; V.set('bg', m.bg); }, onchange: () => { touch(); changed(false); } })),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: m.transparent, onchange: e => set('transparent', e.target.checked) }), 'See-through (PNG, WebP)')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: V.st.mirror, onchange: e => V.set('mirror', e.target.checked) }), 'Shiny floor reflection'),
      el('div', { class: 'addgrid' }, [['hero', 'Angle'], ['front', 'Front'], ['top', 'Top']].map(([k, n]) => el('button', { onclick: () => V.view(k) }, n))),
      zoomBtns(V),
      el('div', { class: 'insp-sub' }, 'Export'),
      el('label', { class: 'num' }, 'Size', select([[640, '640 px (Spotify playlist minimum)'], [1000, '1000 px'], [1400, '1400 px (Apple podcast / playlist)'], [3000, '3000 px (streaming stores)'], [4000, '4000 px (extra large)']], size, v => size = +v)),
      el('div', { class: 'pbtns' }, el('button', { class: 'hot', onclick: () => exp('image/png') }, 'PNG'), el('button', { onclick: () => exp('image/jpeg') }, 'JPG'), el('button', { onclick: () => exp('image/webp') }, 'WebP')),
      el('button', { onclick: async () => { const b = await V.snapshot(1000, 'image/png', false); const bmp = await createImageBitmap(b); const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; cv.getContext('2d').drawImage(bmp, 0, 0); await useImageAsCover(cv, d); } }, 'Use as song cover'),
      el('p', { class: 'hint' }, 'What you see is what you export. Zoom and turn it to frame your shot first.')]).flat(4).filter(Boolean));
  });
  panel.append(status);
  return el('div', { class: 'artmain pkg' }, el('div', { class: 'stagewrap s3d' }, host, zoomHint()), panel);
}
async function useImageAsCover(cv, d) {
  const projects = (await db.all('projects')).sort((a, b) => b.updated - a.updated);
  if (!projects.length) return toast('Make a song first.');
  let pick = app.P ? app.P.id : projects[0].id;
  modal('Use as song cover', el('div', {}, el('p', {}, 'This picture becomes the cover of:'), select(projects.map(p => [p.id, p.name]), pick, v => pick = v)),
    [['Cancel', () => { }], ['Use it', () => { (async () => {
      const url = cv.toDataURL('image/jpeg', 0.9);
      if (app.P && app.P.id === pick) { app.P.cover = url; app.P.coverDesign = d.id; await flush(); emit('meta'); }
      else { const p = await db.get('projects', pick); p.cover = url; p.coverDesign = d.id; p.updated = Date.now(); await db.put('projects', p.id, p); }
      toast('Cover updated.');
    })(); }, 'hot']]);
}

// ---------- real 3D studio ----------
function studio3dView() {
  const d = S.d, host = el('div', { class: 'view3d' }), panel = el('div', { class: 'panel sidep' }, el('p', { class: 'hint' }, 'Loading 3D...'));
  (async () => {
    let V;
    try { const mod = await import('./viewer3d.js'); V = await mod.mountViewer(host, d); }
    catch (e) { panel.innerHTML = ''; panel.append(el('p', {}, '3D could not start in this browser: ' + e.message)); return; }
    S.viewer = V;
    const st = V.st, draw = () => { panel.innerHTML = ''; panel.append(...controls3d(V, st, draw).flat(4).filter(Boolean)); };
    draw();
  })();
  return el('div', { class: 'artmain pkg' }, el('div', { class: 'stagewrap s3d' }, host, zoomHint()), panel);
}
function controls3d(V, st, draw) {
  const set = (k, v, re = true) => { V.set(k, v); if (re) draw(); };
  const chk = (label, k) => el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: st[k], onchange: e => set(k, e.target.checked, false) }), label);
  let size = 2000, transparent = false, secs = 6;
  const types = V.videoTypes();
  const shot = async mime => { toast('Rendering...'); const b = await V.snapshot(size, mime, transparent); download(b, `${safeName(S.d.name)}-3d-${size}.${mime.split('/')[1].replace('jpeg', 'jpg')}`); toast('Saved to your downloads.'); };
  return [
    el('div', { class: 'insp-sub' }, 'Object', helpBtn('studio3d')),
    el('div', { class: 'fxlib' }, FORMATS_3D.map(([k, n]) => el('button', { class: 'chip' + (st.format === k ? ' on' : ''), onclick: () => set('format', k) }, n))),
    st.format === 'slim' ? el('div', { class: 'pbtns' }, el('label', { class: 'num' }, 'Case color', el('input', { type: 'color', value: st.caseColor, onchange: e => set('caseColor', e.target.value) })), ['#7a3cff', '#ff2f8f', '#ff9a1f', '#2f6bff', '#2fd06a'].map(c => el('button', { class: 'swatchbtn', style: `background:${c}`, onclick: () => set('caseColor', c) }))) : null,
    st.format === 'spindle' ? [el('label', { class: 'knob' }, 'How many discs', el('input', { type: 'range', min: 5, max: 100, step: 5, value: st.count, onchange: e => set('count', +e.target.value) })), chk('Clear dome cover', 'dome')] : null,
    ['cdcase', 'slim'].includes(st.format) ? el('label', { class: 'knob' }, 'Open the case', el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.open, oninput: e => set('open', +e.target.value, false) })) : null,
    st.format === 'cdcase' ? caseStylePanel(V) : null,
    ['cdcase', 'slim', 'fan'].includes(st.format) ? plasticPanel(S.d.caseStyle, () => V.rebuild()) : null,
    st.format === 'cdcase' ? trayPanel(V) : null,
    st.format === 'minidisc' ? [...mdLabelPanel(V), ...mdShellPanel(V)] : null,
    ['cdcase', 'slim', 'fan', 'sleeve', 'minidisc'].includes(st.format) ? paperPanel(V) : null,
    zoomBtns(V),
    chk('Spin the disc', 'spin'), chk('Turn slowly by itself', 'auto'), chk('Mirror floor (reflection)', 'mirror'),
    el('label', { class: 'knob' }, 'Light', el('input', { type: 'range', min: 0.3, max: 2, step: 0.01, value: st.light, oninput: e => set('light', +e.target.value, false) })),
    el('label', { class: 'num' }, 'Background', el('input', { type: 'color', value: st.bg, oninput: e => set('bg', e.target.value, false) })),
    el('div', { class: 'insp-sub' }, 'Look from'),
    el('div', { class: 'addgrid' }, [['front', 'Front'], ['back', 'Back'], ['left', 'Left side'], ['right', 'Right side'], ['top', 'Top'], ['three', 'Angle']].map(([k, n]) => el('button', { onclick: () => { V.set('auto', false); st.auto = false; V.view(k); draw(); } }, n))),
    el('div', { class: 'addgrid' }, el('button', { onclick: () => V.turn('y') }, 'Turn 90°'), el('button', { onclick: () => V.turn('x') }, 'Tip 90°')),
    el('button', { onclick: async () => { await V.refresh(); toast('Updated with your latest art.'); } }, 'Refresh art'),
    el('div', { class: 'insp-sub' }, 'Export picture'),
    el('label', { class: 'num' }, 'Size', select([[1000, '1000 px'], [2000, '2000 px'], [3000, '3000 px'], [4000, '4000 px']], size, v => size = +v)),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', onchange: e => transparent = e.target.checked }), 'See-through background'),
    el('div', { class: 'pbtns' }, el('button', { class: 'hot', onclick: () => shot('image/png') }, 'PNG'), el('button', { onclick: () => shot('image/jpeg') }, 'JPG'), el('button', { onclick: () => shot('image/webp') }, 'WebP')),
    el('div', { class: 'insp-sub' }, 'Export spinning video'),
    types.length ? [
      el('label', { class: 'num' }, 'Length', select([[4, '4 seconds'], [6, '6 seconds'], [10, '10 seconds']], secs, v => secs = +v)),
      el('div', { class: 'pbtns' }, types.filter((t, i, a) => a.findIndex(x => x.split(';')[0] === t.split(';')[0]) === i).map(t => el('button', { onclick: async e => {
        const b0 = e.target; b0.disabled = true; toast('Recording one full turn...');
        try { const b = await V.record(secs, t); download(b, `${safeName(S.d.name)}-3d-spin.${t.includes('mp4') ? 'mp4' : 'webm'}`); toast('Video saved to your downloads.'); } catch (err) { toast('Recording failed: ' + err.message); }
        b0.disabled = false;
      } }, t.includes('mp4') ? 'MP4' : 'WebM')))] : el('p', { class: 'hint' }, 'This browser cannot record video.'),
    el('div', { class: 'insp-sub' }, 'Export GIF'),
    el('p', { class: 'hint' }, 'One full turn that loops forever. Great for posts and profiles.'),
    el('div', { class: 'pbtns' }, ...[[360, 'Small'], [540, 'Medium'], [720, 'Large']].map(([sz, n]) => el('button', { class: sz === 540 ? 'hot' : '', onclick: async e => {
      const b0 = e.currentTarget; b0.disabled = true; const label = b0.textContent;
      try {
        const frames = await V.gifFrames(sz >= 720 ? 40 : 48, sz, p => { b0.textContent = Math.round(p * 100) + '%'; });
        b0.textContent = 'Saving...'; await new Promise(r => setTimeout(r, 20));
        const { encodeGIF } = await import('./gifenc.js'); download(encodeGIF(frames, 60), `${safeName(S.d.name)}-3d.gif`); toast('GIF saved to your downloads.');
      } catch (err) { toast('GIF failed: ' + err.message); }
      b0.disabled = false; b0.textContent = label;
    } }, n + ' ' + sz + 'px'))),
    el('div', { class: 'insp-sub' }, 'Export 3D model'),
    el('button', { onclick: async () => { toast('Making the 3D file...'); try { download(await V.exportGLB(), `${safeName(S.d.name)}-${st.format}.glb`); toast('GLB saved. Opens in Blender, Windows 3D Viewer and most 3D apps.'); } catch (err) { toast('Export failed: ' + err.message); } } }, 'GLB (3D model)'),
  ];
}
