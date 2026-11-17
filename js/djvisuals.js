// DJ visuals: liquid, flowing, trippy scenes that move with the music. Two layers can be blended,
// and the whole picture can be tilted and turned for a 3D angle.
import { SCENES } from './djlights.js';

export const PALETTES = { ...SCENES, 'Lava': ['#ff3d00', '#ff9100', '#ffd600', '#d50000'], 'Mint': ['#00ffa3', '#00d1ff', '#b4ffea', '#00ff6a'], 'Cotton candy': ['#ff9de2', '#9dd9ff', '#ffd1f2', '#b59dff'], 'Deep sea': ['#00205b', '#0077b6', '#00f5d4', '#3a0ca3'], 'Mono': ['#ffffff', '#9aa4b2', '#e6e9ef', '#5c6370'] };
export const LOOKS = [
  ['liquid', 'Liquid metal', 'Glossy blobs that melt into each other with the bass'],
  ['orbs', 'Light orbs', 'Glowing orbs floating at different depths'],
  ['flow', 'Flow field', 'Thousands of particles flowing like a current'],
  ['ribbons', 'Silk ribbons', 'Flowing ribbons that ripple with the music'],
  ['kaleido', 'Kaleidoscope', 'Mirrored, spinning patterns'],
  ['plasma', 'Plasma', 'A melting field of color'],
  ['aurora', 'Aurora', 'Northern lights curtains in the sky'],
  ['tunnel', 'Warp tunnel', 'Twisting shapes rushing past you'],
  ['starfield', 'Hyperspace', 'Stars streaking past at light speed'],
  ['nebula', 'Nebula', 'Glowing clouds of space gas drifting by'],
  ['galaxy', 'Galaxy', 'A spinning spiral galaxy that pulses'],
  ['planet', 'Planet', 'A ringed planet with moons and a glowing sky'],
  ['blackhole', 'Black hole', 'A swirling disk of light around a black hole'],
  ['dancers', 'Dancers', 'Neon silhouettes dancing to the beat'],
];
export const BACKDROPS = [['none', 'None'], ['stars', 'Stars'], ['nebula', 'Nebula'], ['deep', 'Deep space']];
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const mix = (a, b, t) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), r = (x >> 16) + ((y >> 16) - (x >> 16)) * t, g = (x >> 8 & 255) + ((y >> 8 & 255) - (x >> 8 & 255)) * t, bl = (x & 255) + ((y & 255) - (x & 255)) * t; return `rgb(${r | 0},${g | 0},${bl | 0})`; };
const nz = (x, y, t) => Math.sin(x * 1.3 + t) * Math.cos(y * 1.7 - t * 0.7) + Math.sin((x + y) * 0.8 + t * 1.3) * 0.5;
const bufs = {};
function buf(name, W, H) { let c = bufs[name]; if (!c) c = bufs[name] = document.createElement('canvas'); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } return c; }
let parts = [], orbs = [], stars = [], bgStars = [];
const newStar = () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: Math.random(), k: Math.floor(Math.random() * 8) });
// a pictogram dancer (round limbs, ponytail) with poses that change on the beat
const POSES = [
  [[-2.4, -1.2], [-0.6, -1.6], [0.25, 0.2], [-0.25, -0.1]], [[-0.7, -2.0], [-2.4, -0.9], [0.5, 0.1], [-0.1, 0.4]],
  [[-2.9, -2.6], [-0.2, -0.4], [0.1, 0.6], [-0.5, -0.2]], [[-1.2, 0.3], [-2.0, -2.8], [0.35, -0.4], [-0.35, 0.3]],
];
function dancer(g, i, beat, c, mids, depth) {
  const k = Math.floor(beat + i) % POSES.length, k2 = (k + 1) % POSES.length, f = (beat + i) % 1, e = f < 0.7 ? 0 : (f - 0.7) / 0.3, lerp = (a, b) => a + (b - a) * e;
  const P = POSES[k].map((p, j) => [lerp(p[0], POSES[k2][j][0]), lerp(p[1], POSES[k2][j][1])]);
  const limb = (x, y, a1, a2, l1, l2) => { const x1 = x + Math.cos(a1) * l1, y1 = y + Math.sin(a1) * l1, x2 = x1 + Math.cos(a1 + a2) * l2, y2 = y1 + Math.sin(a1 + a2) * l2; g.beginPath(); g.moveTo(x, y); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
  g.strokeStyle = c; g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 18 * depth; g.lineWidth = 9;
  limb(0, -60, P[0][0], P[0][1], 22, 20); limb(0, -60, P[1][0], P[1][1], 22, 20); // arms
  g.lineWidth = 12; g.beginPath(); g.moveTo(0, -64); g.lineTo(2, -28); g.stroke(); // body
  g.lineWidth = 11; limb(2, -28, Math.PI / 2 - P[2][0], P[2][1], 26, 26); limb(2, -28, Math.PI / 2 - P[3][0], P[3][1], 26, 26); // legs
  g.beginPath(); g.arc(2, -80, 11, 0, 7); g.fill(); // head
  if (i % 2 === 0) { g.lineWidth = 5; g.beginPath(); g.moveTo(-8, -86); g.quadraticCurveTo(-24, -92 + Math.sin(beat * 6) * 4 * (1 + mids * 2), -30, -78); g.stroke(); } // ponytail
  g.shadowBlur = 0;
}
function backdrop(g, W, H, V, A, colAt) {
  if (!V.backdrop || V.backdrop === 'none') { g.fillStyle = '#020206'; g.fillRect(0, 0, W, H); return; }
  const bg = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7); bg.addColorStop(0, V.backdrop === 'deep' ? '#0b0820' : '#05050c'); bg.addColorStop(1, '#010103'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (V.backdrop === 'nebula' || V.backdrop === 'deep') { g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const x = W * (0.2 + 0.6 * ((i * 0.37 + A.t * 0.003) % 1)), y = H * (0.3 + 0.4 * ((i * 0.61) % 1)), r = Math.max(W, H) * 0.35; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(colAt(i), 0.12 * V.space)); gr.addColorStop(1, hexA(colAt(i), 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H); } g.restore(); }
  const n = Math.round(80 + V.space * 420); while (bgStars.length < n) bgStars.push({ x: Math.random(), y: Math.random(), s: Math.random(), p: Math.random() * 7 }); bgStars.length = n;
  for (const st of bgStars) { const tw = 0.5 + 0.5 * Math.sin(A.t * (1 + st.s * 3) + st.p); g.fillStyle = `rgba(255,255,255,${(0.2 + st.s * 0.7) * (V.twinkle ? tw : 1)})`; const z = st.s * 1.8 + 0.4; g.fillRect(((st.x + A.t * 0.002 * V.speed * st.s) % 1) * W, st.y * H, z, z); }
}

// draw one look into context g (W x H) at time A.t with palette P
function look(g, W, H, kind, V, A, P, colAt) {
  const S = Math.min(W, H), t = A.t * V.speed, bass = A.bass * V.react, mids = A.mids * V.react, hi = A.highs * V.react;
  if (kind === 'liquid') {
    const n = Math.round(4 + V.count * 10), off = buf('liq', W >> 1, H >> 1), o = off.getContext('2d'), w = off.width, h = off.height;
    o.globalCompositeOperation = 'source-over'; o.fillStyle = '#000'; o.fillRect(0, 0, w, h); o.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = t * (0.2 + i * 0.03) + i * 2.1, x = w / 2 + Math.cos(a) * w * 0.32 * Math.sin(t * 0.13 + i), y = h / 2 + Math.sin(a * 1.3) * h * 0.3, band = A.spec[4 + i * 9] / 255;
      const r = Math.min(w, h) * (0.1 + band * 0.14 * V.react + bass * 0.05) * V.size, gr = o.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, colAt(i)); gr.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gr; o.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.filter = `blur(${Math.round(S * 0.012)}px) contrast(12) saturate(1.4)`; g.drawImage(off, 0, 0, W, H); g.restore();
    // glossy highlight so it reads as liquid metal
    g.save(); g.globalCompositeOperation = 'lighter'; g.filter = `blur(${Math.round(S * 0.03)}px)`; g.globalAlpha = 0.5; g.drawImage(off, 0, 0, W, H); g.restore();
  } else if (kind === 'orbs') {
    const n = Math.round(10 + V.count * 50);
    while (orbs.length < n) orbs.push({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random(), k: orbs.length });
    orbs.length = n;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const o of orbs) {
      o.z -= 0.0015 * V.speed * (1 + bass * 2); if (o.z <= 0.02) { o.z = 1; o.x = Math.random(); o.y = Math.random(); }
      const p = 1 / o.z, x = W / 2 + (o.x - 0.5) * W * p * 0.6, y = H / 2 + (o.y - 0.5) * H * p * 0.6, band = A.spec[(o.k * 13) % 300] / 255;
      const r = S * 0.02 * p * (0.5 + o.s) * (0.6 + band * V.react) * V.size, c = colAt(o.k); if (x < -r || x > W + r || y < -r || y > H + r) continue;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,' + Math.min(1, 0.5 + band) + ')'); gr.addColorStop(0.2, hexA(c, 0.8)); gr.addColorStop(1, hexA(c, 0));
      g.globalAlpha = Math.min(1, (1 - o.z) * 1.5); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.restore();
  } else if (kind === 'flow') {
    const n = Math.round(300 + V.count * 2200);
    while (parts.length < n) parts.push({ x: Math.random() * W, y: Math.random() * H, k: parts.length });
    parts.length = n;
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineWidth = Math.max(1, S * 0.0015 * V.size); g.globalAlpha = 0.55;
    const sc = 3 / S;
    for (const q of parts) {
      const a = nz(q.x * sc, q.y * sc, t * 0.3) * Math.PI * (1.5 + mids), sp = S * 0.003 * (1 + bass * 3) * V.speed;
      const nx = q.x + Math.cos(a) * sp, ny = q.y + Math.sin(a) * sp;
      g.strokeStyle = colAt(Math.floor(q.k / (n / 4))); g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(nx, ny); g.stroke();
      q.x = nx; q.y = ny; if (q.x < 0 || q.x > W || q.y < 0 || q.y > H || Math.random() < 0.004) { q.x = Math.random() * W; q.y = Math.random() * H; }
    }
    g.restore();
  } else if (kind === 'ribbons') {
    const n = Math.round(3 + V.count * 9);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < n; r++) {
      const c = colAt(r), base = H * (0.2 + 0.6 * r / Math.max(1, n - 1)), amp = H * (0.06 + (A.spec[3 + r * 11] / 255) * 0.2 * V.react) * V.size;
      const pts = []; for (let i = 0; i <= 60; i++) { const x = i / 60 * W; pts.push([x, base + Math.sin(i * 0.18 + t * (0.8 + r * 0.13) + r) * amp + Math.sin(i * 0.05 - t * 0.5 + r * 2) * amp * 0.8]); }
      const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, hexA(c, 0)); gr.addColorStop(0.5, hexA(c, 0.9)); gr.addColorStop(1, hexA(c, 0));
      g.strokeStyle = gr; g.lineWidth = S * 0.004 * V.size; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
      // the silky body under each ribbon
      g.globalAlpha = 0.12; g.fillStyle = gr; g.lineTo(W, base + amp * 3); g.lineTo(0, base + amp * 3); g.closePath(); g.fill(); g.globalAlpha = 1;
    }
    g.restore();
  } else if (kind === 'kaleido') {
    const k = V.symmetry, R = Math.hypot(W, H) / 2, wedge = buf('kal', Math.ceil(R), Math.ceil(R)), o = wedge.getContext('2d'); o.clearRect(0, 0, wedge.width, wedge.height);
    o.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) { const a = t * 0.4 + i, x = R * (0.2 + 0.7 * ((Math.sin(a * 0.7 + i) + 1) / 2)), y = R * 0.35 * ((Math.cos(a) + 1) / 2), r = R * (0.08 + (A.spec[5 + i * 20] / 255) * 0.18 * V.react) * V.size, c = colAt(i);
      const gr = o.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(c, 0.9)); gr.addColorStop(1, hexA(c, 0)); o.fillStyle = gr; o.beginPath(); o.arc(x, y, r, 0, 7); o.fill();
      o.strokeStyle = hexA(colAt(i + 1), 0.6); o.lineWidth = 2; o.beginPath(); o.arc(x, y, r * 0.7, a, a + 2); o.stroke(); }
    g.save(); g.translate(W / 2, H / 2); g.rotate(t * 0.05 * V.spin * 10);
    for (let i = 0; i < k * 2; i++) { g.save(); g.rotate(i * Math.PI / k); if (i % 2) g.scale(1, -1); g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, 0, Math.PI / k + 0.01); g.closePath(); g.clip(); g.globalCompositeOperation = 'lighter'; g.drawImage(wedge, 0, 0); g.restore(); }
    g.restore();
  } else if (kind === 'plasma') {
    const w = 120, h = Math.max(40, Math.round(120 * H / W)), off = buf('pl', w, h), o = off.getContext('2d'), img = o.createImageData(w, h), d = img.data;
    const lut = buf('lut', 256, 1).getContext('2d'); const gr = lut.createLinearGradient(0, 0, 256, 0); P.concat(P[0]).forEach((c, i, a) => gr.addColorStop(i / (a.length - 1), c)); lut.fillStyle = gr; lut.fillRect(0, 0, 256, 1); const L = lut.getImageData(0, 0, 256, 1).data;
    const z = 0.08 / V.size, b = 1 + bass * 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.sin(x * z + t) + Math.sin((y * z + t) * 0.7) + Math.sin((x * z * 0.7 + y * z * 0.5 + t * 0.6) * b) + Math.sin(Math.hypot(x - w / 2, y - h / 2) * z * 1.3 - t * 1.4);
      const k = ((v + 4) / 8 * 255 + A.beat * 8) & 255, i = (y * w + x) * 4; d[i] = L[k * 4]; d[i + 1] = L[k * 4 + 1]; d[i + 2] = L[k * 4 + 2]; d[i + 3] = 255;
    }
    o.putImageData(img, 0, 0); g.save(); g.imageSmoothingQuality = 'high'; g.globalAlpha = 0.85 + bass * 0.15; g.drawImage(off, 0, 0, W, H); g.restore();
  } else if (kind === 'aurora') {
    g.save(); g.globalCompositeOperation = 'lighter';
    const n = 140, lines = Math.round(2 + V.count * 4);
    for (let l = 0; l < lines; l++) { const c = colAt(l), c2 = colAt(l + 1);
      for (let i = 0; i < n; i++) { const x = i / n * W, top = H * (0.15 + 0.25 * (nz(i * 0.03, l, t * 0.3) + 1) / 2), len = H * (0.25 + 0.35 * (A.spec[(i * 2) % 200] / 255) * V.react) * V.size;
        const gr = g.createLinearGradient(x, top, x, top + len); gr.addColorStop(0, hexA(c2, 0)); gr.addColorStop(0.3, hexA(c, 0.35)); gr.addColorStop(1, hexA(c, 0)); g.fillStyle = gr; g.fillRect(x, top, W / n + 1, len); } }
    g.restore();
  } else if (kind === 'starfield') {
    const n = Math.round(150 + V.count * 650); while (stars.length < n) stars.push(newStar()); stars.length = n;
    g.save(); g.translate(W / 2, H / 2); g.lineCap = 'round';
    for (const st of stars) {
      const pz = st.z; st.z -= 0.006 * V.speed * (1 + bass * 6); if (st.z <= 0.01) Object.assign(st, newStar(), { z: 1 });
      const x = st.x / st.z * S * 0.5, y = st.y / st.z * S * 0.5, px = st.x / pz * S * 0.5, py = st.y / pz * S * 0.5;
      if (Math.abs(x) > W || Math.abs(y) > H) { Object.assign(st, newStar(), { z: 1 }); continue; }
      const b = Math.min(1, (1 - st.z) * 1.4); g.strokeStyle = hexA(colAt(st.k % 4), b); g.lineWidth = Math.max(0.6, (1 - st.z) * 3 * V.size); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    }
    g.restore();
  } else if (kind === 'nebula') {
    const off = buf('neb', W >> 2, H >> 2), o = off.getContext('2d'), w = off.width, h = off.height; o.clearRect(0, 0, w, h); o.globalCompositeOperation = 'lighter';
    const n = Math.round(6 + V.count * 14);
    for (let i = 0; i < n; i++) { const a = t * 0.05 + i * 1.7, x = w / 2 + Math.cos(a) * w * (0.15 + 0.3 * ((i * 0.37) % 1)), y = h / 2 + Math.sin(a * 1.3 + i) * h * 0.35, r = Math.min(w, h) * (0.25 + 0.2 * ((i * 0.61) % 1)) * V.size * (1 + bass * 0.3);
      const gr = o.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(colAt(i), 0.35 + mids * 0.3)); gr.addColorStop(0.6, hexA(colAt(i + 1), 0.08)); gr.addColorStop(1, hexA(colAt(i), 0)); o.fillStyle = gr; o.fillRect(x - r, y - r, 2 * r, 2 * r); }
    g.save(); g.globalCompositeOperation = 'lighter'; g.filter = `blur(${Math.round(S * 0.02)}px)`; g.drawImage(off, 0, 0, W, H); g.restore();
  } else if (kind === 'galaxy') {
    const n = Math.round(600 + V.count * 2400), arms = Math.max(2, Math.round(V.symmetry / 2)), rot = t * 0.15 * (0.3 + V.spin * 3);
    g.save(); g.translate(W / 2, H / 2); g.scale(1, 0.55 + 0.45 * Math.cos(V.tilt * Math.PI / 180)); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) { const f = (i * 0.618) % 1, arm = i % arms, d = Math.pow(f, 0.6) * S * 0.48 * V.size, a = arm / arms * Math.PI * 2 + d / (S * 0.12) - rot + Math.sin(i) * 0.25, sz = 0.6 + (1 - f) * 2.2 + bass * 1.5;
      g.fillStyle = hexA(colAt(arm + (f > 0.5 ? 1 : 0)), 0.25 + (1 - f) * 0.6); g.fillRect(Math.cos(a) * d, Math.sin(a) * d, sz, sz); }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.12 * (1 + bass)); core.addColorStop(0, 'rgba(255,255,255,0.95)'); core.addColorStop(0.3, hexA(colAt(0), 0.6)); core.addColorStop(1, hexA(colAt(0), 0)); g.fillStyle = core; g.beginPath(); g.arc(0, 0, S * 0.12 * (1 + bass), 0, 7); g.fill();
    g.restore();
  } else if (kind === 'planet') {
    const cx = W / 2, cy = H / 2, R = S * 0.22 * V.size * (1 + bass * 0.05), c1 = colAt(0), c2 = colAt(1);
    const atm = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.5); atm.addColorStop(0, hexA(c2, 0.5 + bass * 0.4)); atm.addColorStop(1, hexA(c2, 0)); g.fillStyle = atm; g.beginPath(); g.arc(cx, cy, R * 1.5, 0, 7); g.fill();
    const body = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R); body.addColorStop(0, mix(c1, '#ffffff', 0.35)); body.addColorStop(0.6, c1); body.addColorStop(1, '#05030a'); g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.clip(); g.globalAlpha = 0.25; for (let b = 0; b < 7; b++) { g.fillStyle = b % 2 ? c2 : '#000'; g.fillRect(cx - R, cy - R + b * R * 0.3 + Math.sin(t * 0.3 + b) * 6, R * 2, R * 0.12); } g.restore();
    g.save(); g.translate(cx, cy); g.rotate(-0.35 + Math.sin(t * 0.1) * 0.05); g.scale(1, 0.28); g.globalCompositeOperation = 'lighter';
    for (let r = 0; r < 26; r++) { const rr = R * (1.35 + r * 0.04), band = A.spec[r * 8] / 255; g.strokeStyle = hexA(r % 3 ? c2 : colAt(2), 0.1 + band * 0.5 * V.react); g.lineWidth = R * 0.03; g.beginPath(); g.arc(0, 0, rr, Math.PI * 0.05, Math.PI * 0.95, true); g.stroke(); }
    g.restore();
    for (let m = 0; m < 3; m++) { const a = t * (0.3 + m * 0.2) + m * 2, mx = cx + Math.cos(a) * R * (1.9 + m * 0.5), my = cy + Math.sin(a) * R * (0.5 + m * 0.15), mr = R * (0.06 + m * 0.02); const mg = g.createRadialGradient(mx - mr / 3, my - mr / 3, 0, mx, my, mr); mg.addColorStop(0, '#fff'); mg.addColorStop(1, colAt(m + 2)); g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fill(); }
  } else if (kind === 'blackhole') {
    const cx = W / 2, cy = H / 2, R = S * 0.13 * V.size, spin = t * (0.6 + V.spin * 2);
    g.save(); g.translate(cx, cy); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 900; i++) { const f = (i * 0.618) % 1, r = R * (1.3 + f * 2.6), a = (i * 2.39996) + spin / (0.4 + f), band = A.spec[(i % 64) * 4] / 255, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.32;
      g.fillStyle = hexA(colAt(f < 0.3 ? 0 : f < 0.7 ? 1 : 2), (1 - f) * 0.7 + band * 0.3); g.fillRect(x, y, 1.5 + (1 - f) * 2, 1.5); }
    const ring = g.createRadialGradient(0, 0, R * 0.9, 0, 0, R * 1.35); ring.addColorStop(0, hexA('#ffffff', 0.9)); ring.addColorStop(0.3, hexA(colAt(0), 0.7 + bass * 0.3)); ring.addColorStop(1, hexA(colAt(0), 0)); g.fillStyle = ring; g.beginPath(); g.arc(0, 0, R * 1.35, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over'; g.fillStyle = '#000'; g.beginPath(); g.arc(0, 0, R * (0.95 + bass * 0.05), 0, 7); g.fill();
    g.restore();
  } else if (kind === 'dancers') {
    const n = Math.round(3 + V.count * 7), floor = H * 0.86;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const depth = 0.55 + 0.45 * ((i * 0.53) % 1), sc = S * 0.0034 * depth * V.size, x = W * (i + 0.5) / n + Math.sin(t * 0.3 + i) * W * 0.02, c = colAt(i), beatP = (A.beat + i * 0.25) % 1, bounce = Math.abs(Math.sin(beatP * Math.PI)) * 6 * sc * (1 + bass);
      g.save(); g.translate(x, floor - bounce); g.scale(sc * (i % 2 ? -1 : 1), sc); dancer(g, i, A.beat, c, mids, depth); g.restore();
      g.save(); g.globalAlpha = 0.18; g.translate(x, floor + bounce * 0.2); g.scale(sc * (i % 2 ? -1 : 1), -sc * 0.5); dancer(g, i, A.beat, c, mids, depth); g.restore();
    }
    const fl = g.createLinearGradient(0, floor, 0, H); fl.addColorStop(0, hexA(colAt(0), 0.25 + bass * 0.3)); fl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = fl; g.fillRect(0, floor, W, H - floor);
    g.restore();
  } else if (kind === 'tunnel') {
    g.save(); g.translate(W / 2, H / 2); g.globalCompositeOperation = 'lighter';
    const sides = Math.max(3, V.symmetry), n = Math.round(10 + V.count * 20);
    for (let i = 0; i < n; i++) { const p = ((i / n) + t * 0.08) % 1, s = Math.pow(p, 2.2) * S * 1.4 * V.size, rot = p * 3 * V.spin * 4 + t * 0.2, c = colAt(i);
      g.strokeStyle = hexA(c, Math.min(1, p * 1.5)); g.lineWidth = (1 + p * 6 + bass * 6) * (S / 800); g.beginPath();
      for (let k = 0; k <= sides; k++) { const a = rot + k / sides * Math.PI * 2, wob = 1 + Math.sin(a * 3 + t) * 0.08 * (1 + mids * 3); const x = Math.cos(a) * s * wob, y = Math.sin(a) * s * wob * 0.8; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.restore();
  }
}

// V: settings, A: audio state. Draws both layers, trails, glow and the camera angle.
export function drawVisuals(cv, V, A) {
  const dpr = Math.min(devicePixelRatio, 1.5), W = Math.round(cv.clientWidth * dpr * V.res), H = Math.round(cv.clientHeight * dpr * V.res);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; parts = []; }
  const g = cv.getContext('2d');
  const P = (V.palette === 'Custom' ? [V.c1, V.c2, V.c3, V.c1] : PALETTES[V.palette] || PALETTES['Neon club']);
  const step = Math.floor(A.beat / (V.colorBeats || 4));
  const colAt = k => P[(k + step) % P.length];
  // trails: paint black with a little alpha instead of clearing
  const fade = A.freeze ? 0 : 1 - V.trails * 0.96;
  const L = buf('main', W, H), m = L.getContext('2d');
  m.globalCompositeOperation = 'destination-out'; m.globalAlpha = 1; m.filter = 'none'; m.fillStyle = `rgba(0,0,0,${fade})`; m.fillRect(0, 0, W, H); m.globalCompositeOperation = 'source-over';
  if (!A.freeze) {
    look(m, W, H, V.look, V, A, P, colAt);
    if (V.layer2 && V.layer2 !== 'none') { const off = buf('l2', W, H), o = off.getContext('2d'); o.clearRect(0, 0, W, H); look(o, W, H, V.layer2, { ...V, speed: V.speed * 0.7 }, A, P, k => colAt(k + 2)); m.save(); m.globalCompositeOperation = V.blend; m.globalAlpha = V.layer2Amt; m.drawImage(off, 0, 0); m.restore(); }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.filter = 'none';
  backdrop(g, W, H, V, A, colAt);
  g.drawImage(L, 0, 0);
  // glow pass
  if (V.glow > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = V.glow * 0.5; g.filter = `blur(${Math.round(Math.min(W, H) * 0.02)}px)`; g.drawImage(L, 0, 0); g.restore(); }
  if (A.flash) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, W, H); }
  if (V.grain) { g.globalAlpha = 0.06; for (let i = 0; i < 250; i++) { g.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); } g.globalAlpha = 1; }
  // camera: a 3D angle, slow turn and zoom punch on the kick
  const punch = A.warp ? 1.25 : 1 + A.bass * 0.06 * V.react * (V.kickZoom ? 1 : 0);
  cv.style.transform = `perspective(900px) rotateX(${V.tilt}deg) rotateY(${Math.sin(A.t * 0.2) * V.sway}deg) rotateZ(${V.roll + A.t * V.turn}deg) scale(${V.zoom * punch})`;
  cv.style.filter = `${A.invert ? 'invert(1) hue-rotate(180deg) ' : ''}saturate(${V.saturation}) contrast(${V.contrast})`;
}
function shiftHue(hex, deg) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
  return `hsl(${(h + deg) % 360} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}
export const hexToRgba = hexA; export const mixColor = mix;
