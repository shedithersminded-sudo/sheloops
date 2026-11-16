// Updates + install as an app.
// - The app reads version.json when it starts. Every 30 minutes (and when you come back to the tab) it checks again.
//   If a newer version was published while SHELOOPS was open, it shows "New version ready" with a Reload button.
// - Copies running from a downloaded folder (localhost) also compare with the version on GitHub
//   and say when there is a newer one to download.
import { el, modal, toast } from './util.js';

export const U = { current: null, latest: null, remote: null, installEvt: null, installed: false };
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
const getJSON = url => fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);
const isLocal = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const repoUrl = () => U.current && U.current.repo ? 'https://github.com/' + U.current.repo : null;

export async function initUpdates() {
  U.current = await getJSON('version.json');
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); U.installEvt = e; document.dispatchEvent(new Event('updatestate')); });
  addEventListener('appinstalled', () => { U.installed = true; U.installEvt = null; toast('SHELOOPS is installed. Find it in your Start menu.'); document.dispatchEvent(new Event('updatestate')); });
  U.installed = matchMedia('(display-mode: standalone)').matches;
  await check(false);
  setInterval(() => check(false), 30 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(false); });
}

// manual = true when you press "Check for updates"
export async function check(manual) {
  if (!U.current) U.current = await getJSON('version.json');
  if (!U.current) { if (manual) toast('Could not read the version file.'); return; }
  // 1) files on this server changed since the app opened (published update, or you pulled new files)
  const now = await getJSON('version.json');
  if (now && newer(now.version, U.current.version)) { U.latest = now; banner('reload', now); }
  // 2) a downloaded copy: is there a newer version on GitHub?
  if (isLocal() && U.current.repo) {
    const remote = await getJSON(`https://raw.githubusercontent.com/${U.current.repo}/main/version.json`);
    if (remote && newer(remote.version, (U.latest || U.current).version)) { U.remote = remote; banner('download', remote); }
  }
  document.dispatchEvent(new Event('updatestate'));
  if (manual && !U.latest && !U.remote) toast(`You have the newest version (${U.current.version}).`);
}

let bar = null;
function banner(kind, v) {
  if (bar) bar.remove();
  bar = el('div', { class: 'updatebar' },
    el('b', {}, kind === 'reload' ? `New version ${v.version} is ready` : `SHELOOPS ${v.version} is out`),
    el('span', {}, (v.notes || [])[0] || ''),
    el('button', { onclick: () => whatsNew(v) }, "What's new"),
    kind === 'reload'
      ? el('button', { class: 'hot', onclick: () => location.reload() }, 'Update now')
      : el('button', { class: 'hot', onclick: () => howToUpdate(v) }, 'How to update'),
    el('button', { class: 'x', title: 'Later', onclick: () => { bar.remove(); bar = null; } }, '×'));
  document.body.append(bar);
}
export function whatsNew(v = U.latest || U.remote || U.current) {
  if (!v) return;
  const hist = (U.current && U.current.history) || [];
  modal(`What's new in ${v.version}`, el('div', { class: 'whatsnew' },
    el('small', { class: 'hint' }, v.date || ''),
    el('ul', {}, (v.notes || []).map(n => el('li', {}, n))),
    hist.length ? el('details', {}, el('summary', {}, 'Older versions'), hist.map(h => el('div', {}, el('b', {}, `${h.version} `), el('small', { class: 'hint' }, h.date), el('ul', {}, (h.notes || []).map(n => el('li', {}, n)))))) : null));
}
function howToUpdate(v) {
  modal(`Get SHELOOPS ${v.version}`, el('div', { class: 'whatsnew' },
    el('p', {}, 'Your songs, sounds and settings stay safe in your browser while you update the app files.'),
    el('ol', {},
      el('li', {}, 'Close SHELOOPS (and the black start.bat window).'),
      el('li', {}, 'Download the new version: on the GitHub page click Code, then Download ZIP. Or, if you used git, run "git pull" in the sheloops folder.'),
      el('li', {}, 'Replace the old sheloops folder files with the new ones.'),
      el('li', {}, 'Start it again with start.bat. Keep the same address (localhost:8780) so your songs are still there.')),
    repoUrl() ? el('a', { class: 'hotlink', href: repoUrl(), target: '_blank', rel: 'noopener' }, 'Open the SHELOOPS GitHub page') : null),
    [["What's new", () => { whatsNew(v); }], ['OK', () => { }, 'hot']]);
}
export async function install() {
  if (U.installEvt) { U.installEvt.prompt(); const r = await U.installEvt.userChoice; U.installEvt = null; document.dispatchEvent(new Event('updatestate')); return r.outcome; }
  modal('Install SHELOOPS', el('div', { class: 'whatsnew' },
    el('p', {}, U.installed ? 'SHELOOPS is already installed as an app on this computer.' : 'In Chrome or Edge, click the install icon at the right end of the address bar (a small screen with an arrow), or open the browser menu and choose "Install SHELOOPS".'),
    el('p', { class: 'hint' }, 'Once installed, SHELOOPS opens in its own window with its own icon in your Start menu and taskbar, and works offline.')));
}
