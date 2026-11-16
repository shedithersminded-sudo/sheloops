// Club light rig for the DJ booth: haze, volumetric beams from moving heads, lasers, blinders,
// strobes, an LED wall and floor reflections. Everything follows the beat and the music.

export const SCENES = {
  'Neon club': ['#ff2bd6', '#2b6bff', '#00e5ff', '#9d2bff'],
  'Warehouse': ['#ffffff', '#dfe9ff', '#fff1d6', '#ffffff'],
  'Sunset': ['#ff5a1f', '#ff2e63', '#ffb000', '#d6336c'],
  'Ice': ['#9be7ff', '#3fa9ff', '#ffffff', '#5b6cff'],
  'Acid': ['#39ff14', '#c6ff00', '#00ff9c', '#7dff3a'],
  'Techno red': ['#ff1a1a', '#ff4d00', '#ffffff', '#ff0040'],
  'Ocean': ['#00c2a8', '#0077ff', '#00e1ff', '#2fffd5'],
  'Ultraviolet': ['#7a00ff', '#b400ff', '#3d00ff', '#ff00e6'],
  'Gold': ['#ffd27a', '#ffb347', '#fff3c4', '#ff9a3d'],
};
export const PATTERNS = [['sweep', 'Sweep'], ['fan', 'Fan'], ['cross', 'Cross'], ['circle', 'Circle'], ['wave', 'Wave'], ['ballyhoo', 'Ballyhoo'], ['chase', 'Chase'], ['still', 'Still']];
export const LASERS = [['off', 'Off'], ['fan', 'Fan'], ['scan', 'Scan'], ['tunnel', 'Tunnel'], ['rain', 'Rain'], ['cross', 'Crossfire']];
export const WALLS = [['off', 'Off'], ['spectrum', 'Spectrum'], ['scope', 'Waveform'], ['grid', 'LED grid'], ['tunnel', 'Tunnel'], ['bloom', 'Bloom']];

// soft haze texture made once
let haze = null;
function hazeTex() {
  if (haze) return haze;
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) { const x = Math.random() * W, y = Math.random() * H, r = 20 + Math.random() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.04 + Math.random() * 0.07})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  // tile edges so it can scroll without a seam
  const t = document.createElement('canvas'); t.width = W * 2; t.height = H; const tg = t.getContext('2d'); tg.drawImage(c, 0, 0); tg.save(); tg.translate(W * 2, 0); tg.scale(-1, 1); tg.drawImage(c, 0, 0); tg.restore();
  return haze = t;
}
const hex = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const noise1 = (x, s) => Math.sin(x * 1.7 + s) * 0.5 + Math.sin(x * 0.63 + s * 2.1) * 0.35 + Math.sin(x * 2.9 + s * 0.7) * 0.15;
const off = { beams: null, bloom: null };
function layer(name, W, H) { let c = off[name]; if (!c) c = off[name] = document.createElement('canvas'); if (c.width !== W || c.height !== H) { c.width = W; c.height = H; } const g = c.getContext('2d'); g.clearRect(0, 0, W, H); return [c, g]; }

// S: settings, A: { t (seconds), beat (beats, fractional), bpm, bass 0..1, mids, highs, spec Uint8Array, wave Uint8Array, strobe, blinder, blackout }
export function drawRig(cv, S, A) {
  const dpr = devicePixelRatio, W = cv.width = Math.round(cv.clientWidth * dpr), H = cv.height = Math.round(cv.clientHeight * dpr), g = cv.getContext('2d');
  const pal = S.scene === 'Theme' ? [S.accent, S.accent2, S.accent, S.accent2] : S.scene === 'Custom' ? [S.c1, S.c2, S.c1, S.c2] : S.scene === 'Rainbow' ? [0, 1, 2, 3].map(k => `hsl(${(A.t * 25 + k * 90) % 360} 100% 60%)`) : SCENES[S.scene] || SCENES['Neon club'];
  const toHex = c => c.startsWith('#') ? c : (() => { const d = document.createElement('canvas').getContext('2d'); d.fillStyle = c; return d.fillStyle; })();
  const P = pal.map(toHex);
  const colorStep = Math.floor(A.beat / (S.colorBeats || 4)); // palette moves on with the music
  const colAt = k => P[(k + colorStep) % P.length];
  const floorY = H * (S.floor ? 0.8 : 1), beatF = A.beat % 1, kick = Math.pow(1 - beatF, 3), pulse = 0.55 + 0.45 * Math.max(kick * (S.beatPulse ? 1 : 0), A.bass);
  // background: deep room with a little ambient color
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#020205'); bg.addColorStop(0.75, '#05050b'); bg.addColorStop(1, '#010103'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (A.blackout) { drawTruss(g, W, H, S, P, A, 0); return; }
  const amb = g.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, W * 0.6); amb.addColorStop(0, hex(colAt(0), 0.10 * S.intensity * pulse)); amb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = amb; g.fillRect(0, 0, W, H);

  // LED wall behind the booth
  if (S.wall !== 'off') drawWall(g, W, floorY, S, A, colAt);

  // beams into an off-screen layer, then haze breaks them up, then bloom
  const [bc, bgc] = layer('beams', W, H); bgc.globalCompositeOperation = 'lighter';
  const n = S.heads, span = 0.55 * S.spread, speed = A.beat * (S.speed || 1) * Math.PI / 4;
  for (let k = 0; k < n; k++) {
    const x = (k + 0.5) / n * W, y = H * 0.07, u = n > 1 ? k / (n - 1) - 0.5 : 0;
    let a = Math.PI / 2, on = 1;
    switch (S.pattern) {
      case 'sweep': a += Math.sin(speed) * span; break;
      case 'fan': a += u * span * 2 * (0.4 + 0.6 * Math.abs(Math.sin(speed))); break;
      case 'cross': a += Math.sin(speed) * span * (k % 2 ? 1 : -1); break;
      case 'circle': a += Math.sin(speed + k * Math.PI * 2 / n) * span; break;
      case 'wave': a += Math.sin(speed * 1.5 + u * 5) * span; break;
      case 'ballyhoo': a += noise1(A.t * 0.6 * (S.speed || 1), k * 7.3) * span * 1.4; break;
      case 'chase': a += u * span; on = Math.floor(A.beat * 2) % n === k ? 1 : 0.06; break;
      default: a += u * span * 0.6;
    }
    const level = on * S.intensity * pulse * (S.flicker && Math.random() < 0.04 ? 0.3 : 1), col = colAt(k % P.length);
    beam(bgc, x, y, a, H * 1.25, S.width * W * 0.012, col, level);
  }
  if (S.laser !== 'off') lasers(bgc, W, H, S, A, colAt);
  // haze: beams only show where there is smoke
  if (S.haze > 0) {
    const ht = hazeTex(), sx = (A.t * 12) % (ht.width / 2);
    bgc.globalCompositeOperation = 'destination-in';
    bgc.globalAlpha = 1; const tmp = layer('hz', W, H)[1]; const hc = off.hz;
    tmp.globalAlpha = 1; tmp.fillStyle = `rgba(255,255,255,${1 - S.haze})`; tmp.fillRect(0, 0, W, H); tmp.globalCompositeOperation = 'lighter';
    tmp.drawImage(ht, sx, 0, ht.width / 2, ht.height, 0, 0, W, H); tmp.globalAlpha = S.haze; tmp.drawImage(ht, (sx * 1.7) % (ht.width / 2), 0, ht.width / 2, ht.height, -W * 0.1, H * 0.1, W * 1.2, H); tmp.globalAlpha = 1; tmp.globalCompositeOperation = 'source-over';
    bgc.drawImage(hc, 0, 0); bgc.globalCompositeOperation = 'source-over';
  }
  // bloom: a blurred copy makes the light glow like it does in a real room
  g.globalCompositeOperation = 'lighter';
  if (S.bloom > 0) { g.save(); g.filter = `blur(${Math.round(10 * dpr * S.bloom)}px)`; g.globalAlpha = 0.9; g.drawImage(bc, 0, 0); g.restore(); }
  g.drawImage(bc, 0, 0);
  // floor reflection
  if (S.floor) {
    g.save(); g.beginPath(); g.rect(0, floorY, W, H - floorY); g.clip(); g.globalAlpha = 0.22; g.filter = `blur(${Math.round(6 * dpr)}px)`;
    g.translate(0, floorY * 2); g.scale(1, -1); g.drawImage(bc, 0, 0); g.restore();
    const fl = g.createLinearGradient(0, floorY, 0, H); fl.addColorStop(0, 'rgba(255,255,255,0.04)'); fl.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'source-over'; g.fillStyle = fl; g.fillRect(0, floorY, W, H - floorY);
    g.globalCompositeOperation = 'lighter';
  }
  // blinders and strobes
  if (A.blinder || A.strobeOn) {
    const a = A.blinder ? 0.9 : 1;
    for (let k = 0; k < 4; k++) { const x = (k + 0.5) / 4 * W, gr = g.createRadialGradient(x, H * 0.08, 0, x, H * 0.08, W * 0.35); gr.addColorStop(0, `rgba(255,248,230,${a})`); gr.addColorStop(0.2, `rgba(255,240,210,${a * 0.5})`); gr.addColorStop(1, 'rgba(255,240,210,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
    if (A.strobeOn) { g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 0, W, H); }
  }
  g.globalCompositeOperation = 'source-over';
  drawTruss(g, W, H, S, P, A, pulse);
  // film grain so it never looks flat
  if (S.grain) { g.globalAlpha = 0.05; for (let i = 0; i < 300; i++) { g.fillStyle = Math.random() < 0.5 ? '#fff' : '#000'; g.fillRect(Math.random() * W, Math.random() * H, dpr, dpr); } g.globalAlpha = 1; }
}
// one volumetric beam: bright core, soft cone, fading with distance
function beam(g, x, y, a, len, w, col, level) {
  if (level <= 0.01) return;
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len, nx = -Math.sin(a), ny = Math.cos(a), spread = w * 4.5;
  const cone = g.createLinearGradient(x, y, ex, ey); cone.addColorStop(0, hex(col, 0.55 * level)); cone.addColorStop(0.35, hex(col, 0.22 * level)); cone.addColorStop(1, hex(col, 0));
  g.fillStyle = cone; g.beginPath(); g.moveTo(x + nx * w * 0.4, y + ny * w * 0.4); g.lineTo(ex + nx * spread, ey + ny * spread); g.lineTo(ex - nx * spread, ey - ny * spread); g.lineTo(x - nx * w * 0.4, y - ny * w * 0.4); g.closePath(); g.fill();
  const core = g.createLinearGradient(x, y, ex, ey); core.addColorStop(0, hex('#ffffff', 0.7 * level)); core.addColorStop(0.15, hex(col, 0.6 * level)); core.addColorStop(0.7, hex(col, 0.05 * level)); core.addColorStop(1, hex(col, 0));
  g.fillStyle = core; g.beginPath(); g.moveTo(x + nx * w * 0.2, y + ny * w * 0.2); g.lineTo(ex + nx * spread * 0.25, ey + ny * spread * 0.25); g.lineTo(ex - nx * spread * 0.25, ey - ny * spread * 0.25); g.lineTo(x - nx * w * 0.2, y - ny * w * 0.2); g.closePath(); g.fill();
  // lens hot spot
  const hs = g.createRadialGradient(x, y, 0, x, y, w * 3); hs.addColorStop(0, hex('#ffffff', 0.9 * level)); hs.addColorStop(0.3, hex(col, 0.6 * level)); hs.addColorStop(1, hex(col, 0)); g.fillStyle = hs; g.fillRect(x - w * 3, y - w * 3, w * 6, w * 6);
}
function lasers(g, W, H, S, A, colAt) {
  const dpr = devicePixelRatio, col = S.laserColor === 'scene' ? colAt(1) : S.laserColor, ph = A.beat * Math.PI / 2 * (S.speed || 1);
  g.lineCap = 'round';
  const line = (x0, y0, x1, y1, a) => { g.strokeStyle = hex(col, 0.18 * a); g.lineWidth = 4 * dpr; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = hex(col, 0.9 * a); g.lineWidth = 1.1 * dpr; g.stroke(); };
  const lv = S.intensity * (0.6 + 0.4 * A.highs);
  if (S.laser === 'fan') { const ox = W / 2, oy = H * 0.12, n = 18, sp = 0.9 + 0.3 * Math.sin(ph * 0.5); for (let k = 0; k < n; k++) { const a = Math.PI / 2 + (k / (n - 1) - 0.5) * sp * 2; line(ox, oy, ox + Math.cos(a) * W, oy + Math.sin(a) * W, lv); } }
  else if (S.laser === 'scan') { for (let s = 0; s < 2; s++) { const ox = s ? W * 0.85 : W * 0.15, oy = H * 0.1; for (let k = 0; k < 6; k++) { const a = Math.PI / 2 + Math.sin(ph + k * 0.25 + s * Math.PI) * 0.9; line(ox, oy, ox + Math.cos(a) * W * 1.2, oy + Math.sin(a) * W * 1.2, lv); } } }
  else if (S.laser === 'tunnel') { const cx = W / 2, cy = H * 0.5, r = Math.min(W, H) * 0.42; for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2 + ph * 0.3; line(cx, cy, cx + Math.cos(a) * r * 3, cy + Math.sin(a) * r * 3, lv * 0.6); } }
  else if (S.laser === 'rain') { for (let k = 0; k < 24; k++) { const x = (k * 97.3 % 1) * W + Math.sin(ph + k) * 20, y0 = ((A.t * 0.8 + k * 0.137) % 1) * H; line(x, y0, x, y0 + H * 0.25, lv); } }
  else if (S.laser === 'cross') { for (let s = 0; s < 2; s++) for (let k = 0; k < 5; k++) { const ox = s ? W : 0, a = (s ? Math.PI : 0) + (s ? -1 : 1) * (0.15 + k * 0.08 + Math.sin(ph) * 0.12); line(ox, H * 0.25, ox + Math.cos(a) * W * 1.3, H * 0.25 + Math.sin(a) * W * 1.3, lv); } }
}
function drawWall(g, W, H, S, A, colAt) {
  const x0 = W * 0.2, x1 = W * 0.8, y0 = H * 0.22, y1 = H * 0.92, w = x1 - x0, h = y1 - y0, dpr = devicePixelRatio, br = S.wallLevel;
  g.save(); g.beginPath(); g.rect(x0, y0, w, h); g.clip();
  g.fillStyle = '#030306'; g.fillRect(x0, y0, w, h);
  g.globalCompositeOperation = 'lighter';
  const sp = A.spec, n = 48;
  if (S.wall === 'spectrum') { const bw = w / n; for (let i = 0; i < n; i++) { const v = Math.pow(sp[Math.floor(Math.pow(i / n, 1.7) * 380)] / 255, 1.4), hh = v * h; const gr = g.createLinearGradient(0, y1, 0, y1 - hh); gr.addColorStop(0, hex(colAt(0), 0.9 * br)); gr.addColorStop(1, hex(colAt(1), 0.25 * br)); g.fillStyle = gr; g.fillRect(x0 + i * bw + bw * 0.18, y1 - hh, bw * 0.64, hh); } }
  else if (S.wall === 'scope') { g.lineWidth = 2 * dpr; g.strokeStyle = hex(colAt(0), br); g.shadowColor = colAt(0); g.shadowBlur = 12 * dpr; g.beginPath(); for (let i = 0; i < 256; i++) { const x = x0 + i / 255 * w, y = y0 + h / 2 + (A.wave[i * 4] - 128) / 128 * h * 0.45; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0; }
  else if (S.wall === 'grid') { const cols = 32, rows = 12, cw = w / cols, rh = h / rows; for (let i = 0; i < cols; i++) { const v = sp[Math.floor(i / cols * 300)] / 255; for (let j = 0; j < rows; j++) { const lit = (rows - j) / rows < v; g.fillStyle = hex(lit ? colAt(Math.floor(j / 4)) : '#ffffff', lit ? 0.85 * br : 0.03); g.fillRect(x0 + i * cw + 1, y0 + j * rh + 1, cw - 2, rh - 2); } } }
  else if (S.wall === 'tunnel') { const cx = x0 + w / 2, cy = y0 + h / 2; for (let k = 0; k < 10; k++) { const p = (k / 10 + A.beat * 0.125) % 1, s = Math.pow(p, 2); g.strokeStyle = hex(colAt(k), (1 - p) * 0.8 * br); g.lineWidth = (1 + s * 4) * dpr; g.strokeRect(cx - w * s * 0.6, cy - h * s * 0.6, w * s * 1.2, h * s * 1.2); } }
  else if (S.wall === 'bloom') { const cx = x0 + w / 2, cy = y0 + h / 2, r = h * (0.25 + A.bass * 0.35); const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * 2); gr.addColorStop(0, hex('#ffffff', 0.8 * br)); gr.addColorStop(0.2, hex(colAt(0), 0.7 * br)); gr.addColorStop(1, hex(colAt(1), 0)); g.fillStyle = gr; g.fillRect(x0, y0, w, h); }
  // LED pixel mesh so it reads as a real screen
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(0,0,0,0.35)'; const px = 4 * dpr; for (let x = x0; x < x1; x += px) g.fillRect(x, y0, 1, h); for (let y = y0; y < y1; y += px) g.fillRect(x0, y, w, 1);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.06)'; g.strokeRect(x0, y0, w, h);
}
// overhead truss with the fixtures hanging from it
function drawTruss(g, W, H, S, P, A, pulse) {
  const y = H * 0.035, th = H * 0.03, dpr = devicePixelRatio;
  const tg = g.createLinearGradient(0, y - th, 0, y + th); tg.addColorStop(0, '#2b2b31'); tg.addColorStop(0.5, '#4a4a52'); tg.addColorStop(1, '#1a1a1e'); g.fillStyle = tg; g.fillRect(0, y - th / 2, W, th);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = dpr; for (let x = 0; x < W; x += th * 1.2) { g.beginPath(); g.moveTo(x, y - th / 2); g.lineTo(x + th * 0.6, y + th / 2); g.lineTo(x + th * 1.2, y - th / 2); g.stroke(); }
  for (let k = 0; k < S.heads; k++) { const x = (k + 0.5) / S.heads * W; g.fillStyle = '#121216'; g.beginPath(); g.roundRect(x - th * 0.8, y + th * 0.3, th * 1.6, th * 1.4, th * 0.3); g.fill(); g.fillStyle = A.blackout ? '#111' : hex(P[k % P.length], 0.5 + 0.5 * pulse * S.intensity); g.beginPath(); g.arc(x, y + th * 1.55, th * 0.42, 0, 7); g.fill(); }
}
