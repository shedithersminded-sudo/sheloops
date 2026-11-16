// Studio intro: SHELOOPS written around a turning ring, a neon name that flickers on, then it opens.
// About 3.4 seconds. Click or any key skips it.
import { el } from './util.js';
import { look, saveLook, logoURL } from './look.js';

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const introOn = () => !(look.intro && look.intro.on === false);
export function setIntro(on) { look.intro = { ...(look.intro || {}), on }; saveLook(); }

const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...kids) { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids); return n; }
// text written around a circle of radius r
function ring(id, r, text, cls) {
  const path = svg('path', { id, d: `M 0 ${-r} A ${r} ${r} 0 1 1 -0.01 ${-r}`, fill: 'none' });
  const tp = svg('textPath', { href: '#' + id, textLength: (2 * Math.PI * r - 2).toFixed(1), lengthAdjust: 'spacing' }); tp.textContent = text;
  return svg('g', { class: cls }, path, svg('text', {}, tp));
}

export async function playIntro() {
  document.querySelector('.intro')?.remove();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = css('--led') || '#ff6a1a', text = css('--text') || '#ebe7df', bg = css('--bg') || '#0e0e10';
  const ver = el('div', { class: 'intro-ver' });
  fetch('version.json', { cache: 'no-store' }).then(r => r.json()).then(v => ver.textContent = 'v' + v.version).catch(() => { });

  const art = svg('svg', { class: 'intro-rings', viewBox: '-260 -260 520 520', 'aria-hidden': 'true' },
    svg('circle', { r: 236, class: 'ir-line' }), svg('circle', { r: 176, class: 'ir-line dim' }), svg('circle', { r: 120, class: 'ir-line' }),
    ring('ir-a', 206, 'SHELOOPS ✦ SHELOOPS ✦ SHELOOPS ✦ SHELOOPS ✦ ', 'ir-big'),
    ring('ir-b', 150, 'RECORD · BEATS · MIX · MASTER · COVER ART · RECORD · BEATS · MIX · MASTER · COVER ART · ', 'ir-small'));
  const word = el('div', { class: 'intro-word' }, el('span', { class: 'she' }, 'SHE'), el('span', { class: 'loops' }, 'LOOPS'));
  const logo = el('div', { class: 'intro-logo' });
  logoURL().then(u => { if (u) { logo.append(el('img', { src: u, alt: '', draggable: 'false' })); logo.classList.add('has'); } }).catch(() => { });

  const root = el('div', { class: 'intro' + (reduce ? ' reduce' : ''), style: `--ia:${accent};--it:${text};--ib:${bg}`, role: 'presentation' },
    el('div', { class: 'intro-dither' }), art,
    el('div', { class: 'intro-stack' }, logo, word, el('div', { class: 'intro-sub' }, 'studio')),
    ver, el('div', { class: 'intro-skip' }, 'click or press any key'));
  document.body.append(root);
  document.getElementById('intro-cover')?.remove();

  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      root.classList.add('out');
      removeEventListener('keydown', finish, true); root.removeEventListener('pointerdown', finish);
      setTimeout(() => { root.remove(); resolve(); }, reduce ? 250 : 750);
    };
    addEventListener('keydown', finish, true); root.addEventListener('pointerdown', finish);
    setTimeout(finish, reduce ? 1200 : 3400);
  });
}
