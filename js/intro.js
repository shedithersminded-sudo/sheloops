// Studio intro: a short animated open (about 3.5 seconds). Click or any key skips it.
import { el } from './util.js';
import { look, saveLook, logoURL } from './look.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
const smooth = (a, b, x) => ease((x - a) / (b - a));

export const introOn = () => !(look.intro && look.intro.on === false);
export function setIntro(on) { look.intro = { ...(look.intro || {}), on }; saveLook(); }

export async function playIntro() {
  document.querySelector('.intro')?.remove();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = css('--led') || '#ff6a1a', text = css('--text') || '#ebe7df', bg = css('--bg') || '#0e0e10';
  const cv = el('canvas', { class: 'intro-cv' });
  const word = el('div', { class: 'intro-word', 'aria-label': 'SHELOOPS' },
    [...'SHELOOPS'].map((ch, i) => el('span', { class: i > 2 ? 'loops' : '', style: `--i:${i}` }, ch)));
  const logo = el('div', { class: 'intro-logo' });
  const ver = el('div', { class: 'intro-ver' });
  fetch('version.json', { cache: 'no-store' }).then(r => r.json()).then(v => ver.textContent = 'v' + v.version).catch(() => { });
  const root = el('div', { class: 'intro' + (reduce ? ' reduce' : ''), style: `--ia:${accent};--it:${text};--ib:${bg}`, role: 'presentation' },
    cv,
    el('div', { class: 'intro-stack' }, logo, word,
      el('div', { class: 'intro-rule' }, el('i'), el('b', {}, 'STUDIO'), el('i')),
      el('div', { class: 'intro-sub' }, 'Record', el('em', {}, '/'), 'Beats', el('em', {}, '/'), 'Mix', el('em', {}, '/'), 'Master')),
    ver, el('div', { class: 'intro-skip' }, 'Click or press any key to skip'));
  logoURL().then(u => { if (u) { logo.append(el('img', { src: u, alt: '', draggable: 'false' })); logo.classList.add('has'); } }).catch(() => { });
  document.body.append(root);
  document.getElementById('intro-cover')?.remove();

  return new Promise(resolve => {
    const g = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
    let W, H, raf, done = false;
    const size = () => { W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); addEventListener('resize', size);
    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, s: Math.random() * 0.012 + 0.004, a: Math.random() * 0.5 + 0.15 }));
    const t0 = performance.now(), END = reduce ? 1.2 : 3.4;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      try { paint(); } catch (e) { console.warn('intro', e); finish(); }
    };
    const paint = () => {
      const t = (performance.now() - t0) / 1000, cx = W / 2, cy = H / 2;
      g.clearRect(0, 0, W, H);
      // dust drifting up
      for (const d of dust) { const y = ((d.y - t * d.s) % 1 + 1) % 1; g.globalAlpha = d.a * smooth(0, 1.2, t); g.fillStyle = text; g.beginPath(); g.arc(d.x * W, y * H, d.r, 0, 7); g.fill(); }
      // record grooves + rotating sheen
      const R = Math.min(W, H) * 0.42, ring = smooth(0.15, 1.4, t);
      g.save(); g.translate(cx, cy); g.scale(0.85 + 0.15 * ring, 0.85 + 0.15 * ring);
      g.lineWidth = 1;
      for (let i = 0; i < 26; i++) { const r = R * (0.32 + i * 0.026); g.globalAlpha = 0.05 * ring * (i % 4 ? 1 : 1.8); g.strokeStyle = text; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); }
      const rot = t * 0.9;
      for (const off of [0, Math.PI]) {
        g.globalAlpha = 0.22 * ring; g.strokeStyle = accent; g.lineWidth = R * 0.68; g.lineCap = 'butt';
        const gr = g.createConicGradient ? g.createConicGradient(rot + off, 0, 0) : null;
        if (gr) { gr.addColorStop(0, 'transparent'); gr.addColorStop(0.06, accent); gr.addColorStop(0.14, 'transparent'); gr.addColorStop(1, 'transparent'); g.strokeStyle = gr; }
        g.beginPath(); g.arc(0, 0, R * 0.66, rot + off, rot + off + 0.9); g.stroke();
      }
      g.restore();
      // waveform: a line draws out, comes alive, then settles
      const grow = smooth(0, 0.7, t), amp = smooth(0.5, 1.4, t) * (1 - smooth(2.4, 3.3, t)), span = W * 0.86 * grow, x0 = cx - span / 2;
      if (span > 2) {
        for (const [col, al, ph, k, lw] of [[accent, 0.95, 0, 1, 2], [text, 0.35, 1.7, 0.7, 1], [accent, 0.35, 3.1, 1.3, 1]]) {
          g.globalAlpha = al * (1 - smooth(3.0, 3.4, t)); g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = col; g.shadowBlur = col === accent ? 14 : 0;
          g.beginPath();
          for (let x = 0; x <= span; x += 3) {
            const u = x / span, win = Math.sin(Math.PI * u) ** 2;
            const y = Math.sin(u * 22 * k + t * 7 + ph) * 0.55 + Math.sin(u * 51 * k - t * 11 + ph) * 0.3 + Math.sin(u * 9 + t * 3) * 0.4;
            g.lineTo(x0 + x, cy + 4 + y * win * amp * Math.min(70, H * 0.09));
          }
          g.stroke();
        }
        g.shadowBlur = 0;
      }
      g.globalAlpha = 1;
      if (t > END) finish();
    };
    const finish = () => {
      if (done) return; done = true;
      root.classList.add('out');
      removeEventListener('keydown', finish, true); root.removeEventListener('pointerdown', finish);
      setTimeout(() => { cancelAnimationFrame(raf); removeEventListener('resize', size); root.remove(); resolve(); }, reduce ? 250 : 700);
    };
    addEventListener('keydown', finish, true); root.addEventListener('pointerdown', finish);
    raf = requestAnimationFrame(draw);
  });
}
