// Ready-made design collections. Only text, shapes, colors and stickers, plus an empty frame for my own picture.
import { newDesign, newLayer, FACES, CONDITIONS } from './art.js';

const C = (bg, bg2, angle, accent, text, titleFont, artistFont, material, cond, caseStyle, opts = {}) => ({ bg, bg2, angle, accent, text, titleFont, artistFont, material, cond, caseStyle, ...opts });
export const COLLECTIONS = {
  '90s R&B':             C('#2b0f2e', '#7a2d59', 160, '#ffc6e8', '#ffffff', 'Playfair Display', 'Great Vibes', 'purple', 'Lightly scratched', 'clear', { frame: 'soft', italic: true }),
  '2000s Hip-Hop':       C('#0b0b0b', '#3a3a3a', 180, '#d4af37', '#ffffff', 'Anton', 'Bebas Neue', 'silver', 'Brand-new', 'black', { frame: 'full', sticker: 'advisory' }),
  'Vintage Soul':        C('#d9b98a', '#a8743f', 170, '#6b2e1a', '#3b1d10', 'Abril Fatface', 'Playfair Display', 'vintage', 'Vintage aged', 'vintage', { frame: 'circle' }),
  'Y2K':                 C('#b8e1ff', '#ff9ef0', 135, '#5b2cff', '#ffffff', 'Bungee', 'Space Grotesk', 'holo', 'Shiny polished', 'transparent', { frame: 'soft', sticker: 'sparkle', stroke: '#5b2cff' }),
  'Grunge':              C('#1d1a16', '#3a332b', 200, '#c7c0a5', '#e8e2cc', 'Permanent Marker', 'Courier New', 'black', 'Worn-out', 'damaged', { frame: 'full', tape: true }),
  'Gothic':              C('#050505', '#2a0610', 180, '#9b0d1e', '#e9e2d6', 'UnifrakturMaguntia', 'Cinzel', 'black', 'Matte', 'black', { frame: 'circle' }),
  'Luxury':              C('#0a0a0a', '#1a1408', 135, '#d4af37', '#f5ecd2', 'Cinzel', 'Cinzel', 'gold', 'Shiny polished', 'premium', { frame: 'border', spacing: 18 }),
  'Minimalist':          C('#f4f2ee', '#f4f2ee', 0, '#111111', '#111111', 'Space Grotesk', 'Space Grotesk', 'white', 'Matte', 'white', { frame: 'small', spacing: 10 }),
  'Retro':               C('#f2d7a6', '#e35d3a', 180, '#1f3a5f', '#1f3a5f', 'Righteous', 'Lobster', 'retro', 'Faded', 'colored', { frame: 'circle', stripes: true }),
  'Futuristic':          C('#020617', '#0b2a4a', 160, '#00f0ff', '#d8fbff', 'Monoton', 'Space Grotesk', 'blue', 'Shiny polished', 'transparent', { frame: 'full', grid: true }),
  'Dreamy':              C('#f7c8e0', '#b9c6ff', 150, '#ffffff', '#ffffff', 'Pacifico', 'Space Grotesk', 'pink', 'Brand-new', 'clear', { frame: 'soft', sticker: 'heart', blur: true }),
  'Underground Mixtape': C('#151515', '#151515', 0, '#ff3b3b', '#f2f2f2', 'Rubik Glitch', 'Courier New', 'silver', 'Heavily scratched', 'slim', { frame: 'full', tape: true, sticker: 'advisory', bw: true }),
  'Old-school Rap':      C('#ffd23f', '#ff6a1a', 180, '#111111', '#111111', 'Press Start 2P', 'Anton', 'black', 'Dusty', 'clear', { frame: 'border', boombox: true }),
  'Custom Aesthetic':    C('#222226', '#222226', 0, '#ff6a1a', '#ffffff', 'Bebas Neue', 'Space Grotesk', 'silver', 'Brand-new', 'clear', { frame: 'full' }),
};

export function fromCollection(name, info = {}) {
  const s = COLLECTIONS[name], d = newDesign(info.album || info.title || name);
  const title = (info.album || info.title || 'ALBUM TITLE'), artist = info.artist || 'ARTIST NAME', tracks = info.tracks && info.tracks.length ? info.tracks : ['Intro', 'First song', 'Second song', 'Interlude', 'Last song'];
  const W = FACES.cover.w, H = FACES.cover.h, bg = { type: s.bg === s.bg2 ? 'color' : 'gradient', c1: s.bg, c2: s.bg2, angle: s.angle };
  const T = (text, font, size, color, x, y, o = {}) => newLayer('text', { text, font, size, color, x, y, spacing: s.spacing || 0, italic: !!s.italic && font === s.titleFont, ...(s.stroke ? { stroke: { w: 6, color: s.stroke } } : {}), ...o });
  // ---- front ----
  const cover = d.faces.cover; cover.bg = bg;
  const L = cover.layers;
  if (s.grid) for (let i = 1; i < 8; i++) { L.push(newLayer('shape', { shape: 'line', x: W / 2, y: i * H / 8, w: W, h: 2, fill: s.accent + '44' })); L.push(newLayer('shape', { shape: 'line', x: i * W / 8, y: H / 2, w: 2, h: H, fill: s.accent + '44' })); }
  if (s.stripes) [0, 1, 2].forEach(i => L.push(newLayer('shape', { shape: 'rect', x: W / 2, y: H * 0.78 + i * 60, w: W, h: 36, fill: ['#e35d3a', '#f2a541', '#1f3a5f'][i] })));
  const pic = { full: { x: W / 2, y: H / 2, w: W, h: H }, soft: { x: W / 2, y: H * 0.45, w: W * 0.8, h: H * 0.62, radius: 40 }, circle: { x: W / 2, y: H * 0.45, w: W * 0.62, h: W * 0.62, circle: true },
    border: { x: W / 2, y: H * 0.46, w: W * 0.74, h: H * 0.6 }, small: { x: W / 2, y: H * 0.42, w: W * 0.42, h: W * 0.42 } }[s.frame];
  L.push(newLayer('image', { ...pic, filters: { bright: 100, contrast: 100, sat: s.bw ? 0 : 100, hue: 0, blur: 0, gray: s.bw ? 100 : 0, sepia: name === 'Vintage Soul' ? 40 : 0 } }));
  if (s.frame === 'border') L.push(newLayer('shape', { shape: 'rect', x: W / 2, y: H / 2, w: W - 80, h: H - 80, fill: '', stroke: s.accent, strokeW: 8 }));
  if (s.frame === 'full') L.push(newLayer('shape', { shape: 'rect', x: W / 2, y: H * 0.86, w: W, h: H * 0.28, fill: s.bg + '00', fill2: s.bg + 'ee', angle: 180 }));
  if (s.tape) { L.push(newLayer('sticker', { name: 'tape', x: W * 0.18, y: H * 0.1, w: 360, h: 90, rot: -18, color: '#e8e0c8' })); L.push(newLayer('sticker', { name: 'tape', x: W * 0.84, y: H * 0.12, w: 320, h: 90, rot: 14, color: '#e8e0c8' })); }
  if (s.boombox) L.push(newLayer('shape', { shape: 'star', x: W * 0.85, y: H * 0.15, w: 260, h: 260, fill: '#ffffff', stroke: '#111', strokeW: 8 }));
  const ty = s.frame === 'full' ? H * 0.84 : H * 0.86;
  L.push(T(title, s.titleFont, s.titleFont === 'Press Start 2P' ? 70 : 150, s.text, W / 2, ty, { w: W * 0.9, h: 170, ...(s.blur ? { shadow: { on: true, blur: 30, color: '#ff6ec7' } } : {}) }));
  L.push(T(artist, s.artistFont, s.artistFont === 'Great Vibes' ? 110 : 70, s.accent, W / 2, s.frame === 'full' ? H * 0.12 : H * 0.95, { w: W * 0.9, h: 120 }));
  if (s.sticker === 'advisory') L.push(newLayer('sticker', { name: 'advisory', x: W - 230, y: H - 130, w: 340, h: 200 }));
  else if (s.sticker) L.push(newLayer('sticker', { name: s.sticker, x: W * 0.86, y: H * 0.14, w: 200, h: 200, color: s.accent }));
  // ---- back ----
  const B = d.faces.back, BW = FACES.back.w, BH = FACES.back.h, sp = FACES.back.spine;
  B.bg = bg;
  B.layers.push(T(title, s.titleFont, s.titleFont === 'Press Start 2P' ? 40 : 90, s.text, BW / 2, 150, { w: BW * 0.8, h: 110 }));
  B.layers.push(newLayer('tracklist', { items: tracks, font: s.artistFont === 'Great Vibes' ? 'Playfair Display' : s.artistFont, size: 48, color: s.text, x: BW / 2, y: BH * 0.52, w: BW * 0.62, h: tracks.length * 72 }));
  B.layers.push(newLayer('sticker', { name: 'barcode', x: BW - sp - 230, y: BH - 140, w: 300, h: 150 }));
  B.layers.push(T(`(c) ${new Date().getFullYear()} ${artist}. All rights reserved.`, 'Space Grotesk', 26, s.text, BW * 0.42, BH - 90, { w: BW * 0.6, h: 40 }));
  B.layers.push(T(`${artist}  ·  ${title}`, s.artistFont === 'Great Vibes' ? 'Playfair Display' : s.artistFont, 40, s.text, sp / 2, BH / 2, { rot: 90, w: BH * 0.9, h: 50 }));
  B.layers.push(T(`${artist}  ·  ${title}`, s.artistFont === 'Great Vibes' ? 'Playfair Display' : s.artistFont, 40, s.text, BW - sp / 2, BH / 2, { rot: -90, w: BH * 0.9, h: 50 }));
  // ---- disc ----
  const D = d.faces.disc;
  D.bg = name === 'Minimalist' ? { type: 'none', c1: '#fff', c2: '#fff', angle: 0 } : { ...bg };
  D.layers.push(T(title.toUpperCase(), s.titleFont, s.titleFont === 'Press Start 2P' ? 40 : 80, s.text, 697, 697, { arc: -470, w: 900, h: 100 }));
  D.layers.push(T(artist, s.artistFont, 54, s.accent, 697, 1100, { w: 700, h: 70 }));
  d.disc.material = s.material; Object.assign(d.disc.cond, { scratches: 0, cracks: 0, chips: 0, wear: 0, dirt: 0, dust: 0, fade: 0, age: 0, shine: 0 }, CONDITIONS[s.cond]);
  // ---- booklet ----
  d.faces.booklet.bg = bg;
  d.faces.booklet.layers.push(T('Thank you for listening.', s.artistFont === 'Great Vibes' ? 'Great Vibes' : s.titleFont, 90, s.text, W / 2, H / 2, { w: W * 0.8, h: 120 }));
  d.caseStyle = { style: s.caseStyle, color: s.accent };
  d.collection = name;
  return d;
}
