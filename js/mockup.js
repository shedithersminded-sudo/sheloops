// Flat photo-style mockups: CD in a clear square case (playlist cover look) and a see-through MiniDisc.
import { faceCanvas, FACES, DISC, ensureDesign } from './art.js';

const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
function sheen(g, cx, cy, r, alpha, rot = 0) {
  const cg = g.createConicGradient(rot, cx, cy);
  ['#ff4d6d', '#ffd24d', '#5dff8a', '#4dd2ff', '#a64dff', '#ff4dd2', '#ff4d6d'].forEach((c, i, a) => cg.addColorStop(i / (a.length - 1), c));
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = 'color-dodge'; g.fillStyle = cg;
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.arc(cx, cy, r * 0.3, 0, 7, true); g.fill('evenodd'); g.restore();
}
function streaks(g, cx, cy, r0, r1, a0, a1, n, alpha) { // rainbow diffraction lines like a real disc
  g.save(); g.lineWidth = Math.max(1, r1 / 160);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = a0 + (a1 - a0) * t;
    g.strokeStyle = `hsla(${(t * 320 + 300) % 360},100%,62%,${alpha * (0.5 + 0.5 * Math.sin(t * Math.PI))})`;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
  }
  g.restore();
}
function glare(g, S, k) {
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.36, `rgba(255,255,255,${0.16 * k})`);
  gr.addColorStop(0.42, 'rgba(255,255,255,0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); gr.addColorStop(0.65, `rgba(255,255,255,${0.08 * k})`); gr.addColorStop(0.69, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
}

export async function renderMockup(d, S = 1000, opts = {}) {
  ensureDesign(d);
  const m = d.mock, fmt = opts.format || m.format;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), u = S / 1000;
  if (!m.transparent) { g.fillStyle = m.bg; g.fillRect(0, 0, S, S); }
  if (fmt === 'minidisc') await miniDisc(g, d, S, u); else if (fmt === 'disc') await discOnly(g, d, S, u); else if (fmt === 'slim') await slimCase(g, d, S, u); else await cdCase(g, d, S, u);
  return cv;
}

async function discOnly(g, d, S, u) {
  const disc = await faceCanvas(d, 'disc', { size: Math.round(860 * u) });
  g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 40 * u; g.shadowOffsetY = 14 * u; g.drawImage(disc, 70 * u, 70 * u); g.restore();
  sheen(g, 500 * u, 500 * u, 430 * u, d.mock.sparkle * 0.35);
}

async function cdCase(g, d, S, u) {
  const m = d.mock, x0 = 40 * u, y0 = 40 * u, W = 920 * u, R = 22 * u;
  // tray and shadows inside the case
  rr(g, x0, y0, W, W, R); g.fillStyle = 'rgba(255,255,255,0.035)'; g.fill();
  // disc
  const cx = 525 * u, cy = 500 * u, rD = 405 * u;
  const disc = await faceCanvas(d, 'disc', { size: Math.round(rD * 2) });
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 24 * u; g.drawImage(disc, cx - rD, cy - rD); g.restore();
  // disc lighting: edge darkening, rainbow, highlight
  const vg = g.createRadialGradient(cx, cy, rD * 0.55, cx, cy, rD); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)');
  g.fillStyle = vg; g.beginPath(); g.arc(cx, cy, rD, 0, 7); g.fill();
  sheen(g, cx, cy, rD, m.sparkle * 0.28, 0.8);
  // case spindle (clear plastic rings in the middle)
  g.lineWidth = 2.2 * u;
  for (const [r, a] of [[62, 0.45], [78, 0.25], [98, 0.4], [120, 0.18], [142, 0.3]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(cx, cy, r * u, 0, 7); g.stroke(); }
  g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.arc(cx, cy, 142 * u, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.85)'; g.beginPath(); g.arc(cx, cy, 44 * u, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3 * u; g.beginPath(); g.arc(cx, cy, 44 * u, 0, 7); g.stroke();
  // inner tray ring around the disc
  g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2 * u; g.beginPath(); g.arc(cx, cy, rD + 12 * u, 0, 7); g.stroke();
  // case frame
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3.5 * u; rr(g, x0, y0, W, W, R); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2 * u; rr(g, x0 + 14 * u, y0 + 14 * u, W - 28 * u, W - 28 * u, R * 0.7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.12)'; rr(g, x0 + 32 * u, y0 + 32 * u, W - 64 * u, W - 64 * u, R * 0.5); g.stroke();
  // hinge strip and clips on the left
  const hg = g.createLinearGradient(x0, 0, x0 + 46 * u, 0); hg.addColorStop(0, 'rgba(255,255,255,.35)'); hg.addColorStop(1, 'rgba(255,255,255,.03)');
  g.fillStyle = hg; g.fillRect(x0 + 2 * u, y0 + 20 * u, 44 * u, W - 40 * u);
  for (const y of [y0 + 250 * u, y0 + 600 * u]) { rr(g, x0 - 6 * u, y, 40 * u, 74 * u, 8 * u); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2.5 * u; g.stroke(); }
  // right edge notches + top highlight
  for (const y of [y0 + 120 * u, y0 + W - 160 * u]) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2 * u; rr(g, x0 + W - 22 * u, y, 14 * u, 40 * u, 4 * u); g.stroke(); }
  const tg = g.createLinearGradient(0, y0, 0, y0 + 40 * u); tg.addColorStop(0, 'rgba(255,255,255,.35)'); tg.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); rr(g, x0, y0, W, W, R); g.clip(); g.fillStyle = tg; g.fillRect(x0, y0, W, 40 * u); glare(g, 1000 * u, m.glare); g.restore();
}

async function miniDisc(g, d, S, u) {
  const m = d.mock, x0 = 55 * u, y0 = 70 * u, W = 890 * u, H = 860 * u, R = 34 * u;
  const cx = x0 + 420 * u, cy = y0 + 440 * u, rD = 330 * u;
  // the disc inside: silver data side with rainbow streaks and a metal hub
  const DC = { silver: ['#d9dde3', '#b8bec7', '#e8ebef'], magenta: ['#c2407f', '#6e1340', '#a52a66'], red: ['#d0454f', '#7a121c', '#b52a35'], blue: ['#6f9be0', '#24427f', '#4f78c2'], gold: ['#f0d78a', '#a8822e', '#e0bd62'], green: ['#9fd08a', '#3f7a3a', '#7cb06a'], black: ['#3a3a40', '#121214', '#2a2a2e'] }[m.mdDisc || 'silver'] || ['#d9dde3', '#b8bec7', '#e8ebef'];
  const dg = g.createRadialGradient(cx, cy, rD * 0.2, cx, cy, rD); dg.addColorStop(0, DC[0]); dg.addColorStop(0.5, DC[1]); dg.addColorStop(1, DC[2]);
  g.fillStyle = dg; g.beginPath(); g.arc(cx, cy, rD, 0, 7); g.fill();
  sheen(g, cx, cy, rD, 0.35 + m.sparkle * 0.3, 2.2);
  streaks(g, cx, cy, rD * 0.5, rD * 0.98, 1.65, 2.65, 46, 0.9);
  streaks(g, cx, cy, rD * 0.55, rD * 0.97, 4.9, 5.6, 30, 0.7);
  g.strokeStyle = 'rgba(0,0,0,.15)'; for (let r = rD * 0.35; r < rD; r += 9 * u) { g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  const hub = g.createRadialGradient(cx - 20 * u, cy - 20 * u, 5 * u, cx, cy, 95 * u); hub.addColorStop(0, '#f2f3f5'); hub.addColorStop(0.6, '#9aa1aa'); hub.addColorStop(1, '#5b6068');
  g.fillStyle = hub; g.beginPath(); g.arc(cx, cy, 95 * u, 0, 7); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2 * u; for (const r of [30, 55, 80]) { g.beginPath(); g.arc(cx, cy, r * u, 0, 7); g.stroke(); }
  g.fillStyle = '#3d4148'; g.beginPath(); g.arc(cx, cy, 9 * u, 0, 7); g.fill();
  // the shell: see-through colored plastic
  const shell = new Path2D(); shell.roundRect(x0, y0, W, H, R);
  g.save(); g.globalAlpha = m.shellAlpha * 0.55; g.fillStyle = m.shell; g.fill(shell); g.restore();
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.4 * m.shellAlpha; g.fillStyle = m.shell; g.fill(shell); g.restore();
  if (m.shellAlpha < 0.15) { g.save(); g.globalAlpha = 0.08; g.fillStyle = '#ffffff'; g.fill(shell); g.restore(); } // clear plastic still catches a little light
  // rainbow light still shines through the colored plastic
  g.save(); g.globalCompositeOperation = 'screen';
  streaks(g, cx, cy, rD * 0.5, rD * 0.98, 1.65, 2.65, 46, 0.55 + m.sparkle * 0.4);
  streaks(g, cx, cy, rD * 0.55, rD * 0.97, 4.9, 5.6, 30, 0.4 + m.sparkle * 0.4);
  g.restore();
  // molded details
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2.5 * u;
  for (const r of [rD + 18 * u, rD + 40 * u]) { g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(cx, cy, rD + 28 * u, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2 * u; g.beginPath(); g.roundRect(x0 + 40 * u, y0 + 40 * u, W - 80 * u, H - 80 * u, R * 0.6); g.stroke();
  for (const [x, y] of [[x0 + 60 * u, y0 + 60 * u], [x0 + W - 60 * u, y0 + 60 * u], [x0 + 60 * u, y0 + H - 60 * u], [x0 + W - 60 * u, y0 + H - 60 * u], [x0 + 230 * u, y0 + 40 * u], [x0 + W - 230 * u, y0 + H - 40 * u]]) {
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.5 * u; g.beginPath(); g.arc(x, y, 15 * u, 0, 7); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x, y, 6 * u, 0, 7); g.fill();
  }
  // write protect tab (bottom left)
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x0 + 70 * u, y0 + H - 70 * u, 90 * u, 22 * u); g.fillRect(x0 + 70 * u, y0 + H - 110 * u, 22 * u, 60 * u);
  // insert arrow + text
  if (m.insert) {
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = `600 ${30 * u}px "Space Grotesk", Arial, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText('INSERT THIS END', x0 + W - 110 * u, y0 + 110 * u);
    g.beginPath(); g.moveTo(x0 + W - 75 * u, y0 + 70 * u); g.lineTo(x0 + W - 50 * u, y0 + 130 * u); g.lineTo(x0 + W - 100 * u, y0 + 130 * u); g.closePath(); g.fill();
  }
  if (m.shellText) { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `italic 800 ${56 * u}px "Space Grotesk", Arial, sans-serif`; g.textAlign = 'right'; g.fillText(m.shellText, x0 + W - 70 * u, y0 + 200 * u); }
  // shutter with my label
  const sx = x0 + 560 * u, sy = y0 + 330 * u, sw = 330 * u, sh = 250 * u;
  g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 16 * u; g.shadowOffsetX = -4 * u;
  const mg = g.createLinearGradient(sx, sy, sx + sw, sy + sh);
  const metal = m.shutter === 'black' ? ['#1a1a1c', '#3a3a3e', '#151517'] : m.shutter === 'color' ? [m.shell, '#ffffff', m.shell] : ['#9da2a9', '#e6e8eb', '#a9aeb5'];
  metal.forEach((c, i) => mg.addColorStop(i / 2, c)); g.fillStyle = mg; rr(g, sx, sy, sw, sh, 10 * u); g.fill(); g.restore();
  if (m.shutter === 'metal') { g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; for (let y = sy + 4; y < sy + sh; y += 3 * u) { g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + sw, y); g.stroke(); } }
  const lab = await faceCanvas(d, 'mdlabel', { size: Math.round(sw - 36 * u) });
  g.drawImage(lab, sx + 18 * u, sy + 18 * u, sw - 36 * u, (sw - 36 * u) * FACES.mdlabel.h / FACES.mdlabel.w);
  // edges + glare
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3 * u; g.stroke(shell);
  g.save(); g.clip(shell); glare(g, 1000 * u, m.glare); g.restore();
}

// colored see-through slim case, front view: tinted tray, the disc on top, clear lid
async function slimCase(g, d, S, u) {
  const m = d.mock, col = m.slim || '#7a3cff', x0 = 45 * u, y0 = 95 * u, W = 910 * u, H = 810 * u, R = 10 * u;
  const tray = new Path2D(); tray.roundRect(x0, y0, W, H, R);
  g.save(); g.globalAlpha = 0.55; g.fillStyle = col; g.fill(tray); g.globalAlpha = 0.3; g.globalCompositeOperation = 'multiply'; g.fill(tray); g.restore();
  const cx = x0 + 480 * u, cy = y0 + H / 2, rD = 375 * u;
  // molded tray details: ring recess, hub with teeth, corner tabs
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3 * u; g.beginPath(); g.arc(cx, cy, rD + 10 * u, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(cx, cy, rD + 16 * u, 0, 7); g.stroke();
  for (const [x, y] of [[x0 + 60 * u, y0 + 30 * u], [x0 + W - 60 * u, y0 + 30 * u], [x0 + 60 * u, y0 + H - 30 * u], [x0 + W - 60 * u, y0 + H - 30 * u]]) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2 * u; g.strokeRect(x - 22 * u, y - 8 * u, 44 * u, 16 * u); }
  // the disc
  const disc = await faceCanvas(d, 'disc', { size: Math.round(rD * 2) });
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 18 * u; g.drawImage(disc, cx - rD, cy - rD); g.restore();
  sheen(g, cx, cy, rD, m.sparkle * 0.28, 0.8);
  // hub teeth through the hole
  g.fillStyle = col; g.globalAlpha = 0.85; g.beginPath(); g.arc(cx, cy, 40 * u, 0, 7); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2.5 * u;
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(cx + Math.cos(a) * 14 * u, cy + Math.sin(a) * 14 * u); g.lineTo(cx + Math.cos(a) * 40 * u, cy + Math.sin(a) * 40 * u); g.stroke(); }
  g.beginPath(); g.arc(cx, cy, 14 * u, 0, 7); g.stroke();
  // clear lid + spine
  const sg = g.createLinearGradient(x0, 0, x0 + 40 * u, 0); sg.addColorStop(0, 'rgba(255,255,255,.55)'); sg.addColorStop(1, 'rgba(255,255,255,.12)');
  g.fillStyle = sg; g.fillRect(x0, y0, 40 * u, H);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 3 * u; g.stroke(tray);
  g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2 * u; g.strokeRect(x0 + 40 * u, y0 + 6 * u, W - 46 * u, H - 12 * u);
  g.save(); g.clip(tray); glare(g, 1000 * u, m.glare); g.restore();
}
