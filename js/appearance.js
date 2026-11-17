// My studio appearance page.
import { $, el, uid, toast, ask, confirmBox, select, knob } from './util.js';
import { helpBtn } from './help.js';
import { app, save, snapshot, emit } from './state.js';
import { settings, saveSettings } from './store.js';
import { openPlayerSettings } from './nowplaying.js';
import { playIntro, introOn, setIntro } from './intro.js';
import { FONTS_UI, applyFont, setLogo, removeLogo, logoURL, applyLogo } from './look.js';
import { UIFX_PRESETS, applyUiFx } from './look.js';
import { look, saveLook, applyLook, applyCursor, applyGlow, applyLayout, allThemes, currentTheme, THEME_KEYS, THEMES, derive, BUILT_IN_WORKSPACES, TOOL_NAMES, setBackgroundImage, resetCursor, trackColors, cursorImage } from './look.js';

const redraw = () => renderAppearance();
const pickFile = accept => new Promise(res => { const i = el('input', { type: 'file', accept }); i.onchange = () => res(i.files[0] || null); i.click(); });
const color = (val, on) => el('input', { type: 'color', value: val.length === 7 ? val : '#000000', oninput: e => on(e.target.value) });
const chips = (opts, cur, on) => el('div', { class: 'fxlib' }, opts.map(([v, l]) => el('button', { class: 'chip' + (cur === v ? ' on' : ''), onclick: () => on(v) }, l)));

export function renderAppearance() {
  const view = $('#view'); view.innerHTML = '';
  view.append(el('div', { class: 'appearance' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My studio appearance'), helpBtn('appearance')),
    el('p', { class: 'hint' }, 'Everything here saves by itself and is included in your studio file (My sound page).'),
    themesPanel(), uiFxPanel(), glowPanel(), logoFontPanel(), backgroundPanel(), cursorPanel(), playerPanel(), layoutPanel()));
}

// ---------- logo + font ----------
function logoFontPanel() {
  const L = look.logo || (look.logo = { has: false, size: 34, shape: 'none', text: true });
  const prev = el('img', { class: 'logoprev', alt: '', oncontextmenu: e => e.preventDefault(), draggable: 'false' });
  logoURL().then(u => { if (u) prev.src = u; else prev.replaceWith(el('div', { class: 'logoprev hint' }, 'No logo yet')); });
  const setL = async (k, v) => { L[k] = v; saveLook(); await applyLogo(); redraw(); };
  return el('div', { class: 'panel mpanel' },
    el('div', { class: 'insp-sub' }, 'My logo', helpBtn('logo')),
    el('div', { class: 'fxtop' }, prev,
      el('button', { class: 'hot', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; try { await setLogo(f); toast('Logo set.'); redraw(); } catch { toast('Could not read that picture.'); } } }, L.has ? 'Change logo' : 'Upload my logo'),
      L.has ? el('button', { class: 'danger', onclick: async () => { await removeLogo(); redraw(); } }, 'Remove') : null),
    L.has ? el('div', { class: 'knobrow' },
      knob('Logo size', 20, 80, 1, L.size || 34, v => { L.size = v; saveLook(); applyLogo(); }, v => v + 'px'),
      el('label', { class: 'num' }, 'Shape', select([['none', 'As is'], ['rounded', 'Rounded corners'], ['circle', 'Circle']], L.shape || 'none', v => setL('shape', v))),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: L.text !== false, onchange: e => setL('text', e.target.checked) }), 'Also show the SHELOOPS name')) : null,
    el('p', { class: 'hint' }, 'Your logo shows in the top bar, on Home and as the browser tab icon. It stays in this browser exactly as you uploaded it and is never part of the shared app code.'),
    el('div', { class: 'insp-sub' }, 'Intro', helpBtn('intro')),
    el('div', { class: 'fxtop' },
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: introOn(), onchange: e => { setIntro(e.target.checked); toast(e.target.checked ? 'The intro plays when SHELOOPS opens.' : 'Intro turned off.'); } }), 'Play the studio intro when SHELOOPS opens'),
      el('button', { onclick: () => playIntro() }, 'Play it now')),
    el('div', { class: 'insp-sub' }, 'Font', helpBtn('font')),
    el('div', { class: 'fxlib' }, FONTS_UI.map(([f, n]) => el('button', { class: 'fontcard' + ((look.font || 'Fredoka') === f ? ' on' : ''), style: `font-family:"${f}", sans-serif`, onclick: () => { look.font = f; saveLook(); applyFont(); redraw(); } }, el('b', {}, f), el('small', {}, n)))));
}
// ---------- themes ----------
function themesPanel() {
  const cur = currentTheme();
  const card = t => el('button', { class: 'themecard' + (t.id === look.theme ? ' on' : ''), style: `--tb:${t.c.bg};--tp:${t.c.panel};--ta:${t.c.led};--tt:${t.c.text}`, onclick: async () => { look.theme = t.id; saveLook(); await applyLook(); redraw(); } },
    el('div', { class: 'swatch' }, el('i', { style: `background:${t.c.panel}` }), el('i', { style: `background:${t.c.led}` }), ...(t.tracks || []).slice(0, 5).map(c => el('i', { style: `background:${c}` }))),
    el('b', {}, t.name), t.builtin ? null : el('small', {}, 'mine'));
  const editor = !cur.builtin ? themeEditor(cur) : el('p', { class: 'hint' }, 'Built-in themes cannot be changed. Click Copy to edit, then change any color.');
  return el('div', { class: 'panel mpanel' },
    el('div', { class: 'insp-sub' }, 'Theme', helpBtn('themes')),
    el('div', { class: 'themegrid' }, allThemes().map(card)),
    el('div', { class: 'fxtop' },
      el('button', { onclick: async () => { const n = await ask('New theme', 'Name', cur.name + ' (mine)'); if (!n) return; const t = { id: 'my-' + uid(), name: n, c: { ...cur.c }, tracks: [...(cur.tracks || [])] }; look.themes.push(t); look.theme = t.id; saveLook(); await applyLook(); redraw(); } }, 'Copy this theme'),
      cur.builtin ? null : [
        el('button', { onclick: async () => { const n = await ask('Rename theme', 'Name', cur.name); if (n) { cur.name = n; saveLook(); redraw(); } } }, 'Rename'),
        el('button', { class: 'danger', onclick: async () => { if (!await confirmBox('Delete theme', `Delete "${cur.name}"?`, 'Delete')) return; look.themes = look.themes.filter(t => t !== cur); look.theme = 'midnight'; saveLook(); await applyLook(); redraw(); } }, 'Delete')],
      app.P ? el('button', { title: 'Give the tracks in the open song the theme colors', onclick: () => {
        snapshot(); const c = trackColors(); let i = 0;
        for (const t of [...app.P.tracks, ...app.P.beat.tracks]) t.color = c[i++ % c.length];
        save(); toast('Track colors updated.');
      } }, 'Use theme colors on my tracks') : null,
      el('label', { class: 'num' }, 'Waveforms', select([['', 'Track colors'], ['custom', 'One color']], look.wave ? 'custom' : '', v => { look.wave = v ? (look.wave || cur.c.led) : ''; saveLook(); redraw(); }),
        look.wave ? color(look.wave, v => { look.wave = v; saveLook(); }) : null, helpBtn('waveColor'))),
    editor);
}
function themeEditor(t) {
  const set = async (k, v) => { t.c[k] = v; saveLook(); await applyLook(); };
  return el('div', { class: 'themeeditor' },
    el('div', { class: 'insp-sub' }, `Edit "${t.name}"`),
    el('div', { class: 'quick' }, el('span', { class: 'hint' }, 'Quick start: pick 3 colors and the rest is made for you.'),
      el('label', { class: 'num' }, 'Background', color(t.c.bg, v => { t._b = v; })), el('label', { class: 'num' }, 'Accent', color(t.c.led, v => { t._a = v; })), el('label', { class: 'num' }, 'Text', color(t.c.text, v => { t._t = v; })),
      el('button', { onclick: async () => { t.c = derive(t._b || t.c.bg, t._a || t.c.led, t._t || t.c.text); delete t._b; delete t._a; delete t._t; saveLook(); await applyLook(); redraw(); } }, 'Make theme')),
    el('div', { class: 'colorgrid' }, THEME_KEYS.map(([k, label]) => el('label', { class: 'colorrow' }, color(t.c[k] || '#000000', v => set(k, v)), el('span', {}, label)))),
    el('div', { class: 'insp-sub' }, 'Track colors (for new tracks)'),
    el('div', { class: 'fxtop' }, (t.tracks ||= [...THEMES[0].tracks]).map((c, i) => color(c, v => { t.tracks[i] = v; saveLook(); }))));
}

// ---------- background ----------
function backgroundPanel() {
  const b = look.bg;
  const set = async (k, v, re) => { b[k] = v; saveLook(); await applyLook(); if (re) redraw(); };
  const controls = [];
  if (b.type === 'solid') controls.push(el('label', { class: 'num' }, 'Color', color(b.c1, v => set('c1', v))));
  if (b.type === 'gradient' || b.type === 'animated') controls.push(el('label', { class: 'num' }, 'Color 1', color(b.c1, v => set('c1', v))), el('label', { class: 'num' }, 'Color 2', color(b.c2, v => set('c2', v))));
  if (b.type === 'gradient') controls.push(knob('Angle', 0, 360, 1, b.angle, v => set('angle', v), v => v + '°'));
  if (b.type === 'animated') controls.push(el('label', { class: 'num' }, 'Animation', select([['aurora', 'Aurora (slow color flow)'], ['glow', 'Glow (soft pulsing lights)'], ['bars', 'Equalizer bars']], b.anim, v => set('anim', v))));
  if (b.type === 'image') controls.push(el('button', { class: 'hot', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; try { await setBackgroundImage(f); toast('Background set.'); redraw(); } catch { toast('Could not read that picture.'); } } }, b.hasImage ? 'Change my picture' : 'Upload my picture'),
    knob('Blur', 0, 20, 1, b.blur, v => set('blur', v), v => v + 'px'));
  if (b.type !== 'theme') controls.push(knob('Darken', 0, 0.9, 0.01, b.dim, v => set('dim', v), v => Math.round(v * 100) + '%', 'bgDim'));
  return el('div', { class: 'panel mpanel' },
    el('div', { class: 'insp-sub' }, 'Background', helpBtn('background')),
    chips([['theme', 'Theme color'], ['solid', 'Solid color'], ['gradient', 'Gradient'], ['animated', 'Animated'], ['image', 'My picture']], b.type, v => set('type', v, true)),
    el('div', { class: 'knobrow' }, controls,
      knob('See-through panels', 0, 0.7, 0.01, look.see, async v => { look.see = v; saveLook(); await applyLook(); }, v => Math.round(v * 100) + '%', 'seeThrough')));
}

// ---------- style effects ----------
function uiFxPanel() {
  const f = look.uifx, set = (k, v) => { f[k] = v; saveLook(); applyUiFx(); redraw(); };
  const opt = (k, v, label, what) => el('button', { class: 'fxopt' + (f[k] === v ? ' on' : ''), onclick: () => set(k, v) }, el('b', {}, label), el('small', {}, what));
  const same = p => Object.entries(UIFX_PRESETS[p]).every(([k, v]) => f[k] === v);
  return el('div', { class: 'panel mpanel uifx' },
    el('div', { class: 'insp-sub' }, 'Style effects', helpBtn('uiFx')),
    el('p', { class: 'hint' }, 'Choose how the whole app feels: how much it glows, how much it moves, and whether things pulse or flash. Start with a combo, then change single parts.'),
    el('div', { class: 'fxcombos' }, ...Object.keys(UIFX_PRESETS).map(n => el('button', { class: 'fxcombo' + (same(n) ? ' on' : ''), onclick: () => { Object.assign(f, UIFX_PRESETS[n]); saveLook(); applyUiFx(); redraw(); } }, n))),
    el('div', { class: 'fxgroups' },
      el('div', {}, el('small', {}, 'GLOW'), el('div', { class: 'fxopts' }, opt('glow', 'none', 'No glow', 'Flat and clean'), opt('glow', 'soft', 'Soft', 'A gentle halo'), opt('glow', 'neon', 'Neon', 'Bright glowing edges'), opt('glow', 'max', 'Max', 'Everything shines'))),
      el('div', {}, el('small', {}, 'MOTION'), el('div', { class: 'fxopts' }, opt('motion', 'still', 'Still', 'No animations'), opt('motion', 'calm', 'Calm', 'Slow, gentle moves'), opt('motion', 'lively', 'Lively', 'Full animations'))),
      el('div', {}, el('small', {}, 'PULSE'), el('div', { class: 'fxopts' }, opt('pulse', 'off', 'Off', 'Panels stay steady'), opt('pulse', 'slow', 'Breathe', 'Panels glow in and out slowly'), opt('pulse', 'fast', 'Throb', 'A faster heartbeat glow'))),
      el('div', {}, el('small', {}, 'FLASH'), el('div', { class: 'fxopts' }, el('button', { class: 'fxopt' + (!f.flash ? ' on' : ''), onclick: () => set('flash', false) }, el('b', {}, 'Off'), el('small', {}, 'No flashing')), el('button', { class: 'fxopt' + (f.flash ? ' on' : ''), onclick: () => set('flash', true) }, el('b', {}, 'Flashing accents'), el('small', {}, 'Titles and lit buttons flicker like neon signs'))))));
}
// ---------- text glow ----------
function glowPanel() {
  const g = look.glow, set = (k, v, re = true) => { g[k] = v; saveLook(); applyGlow(); if (re) redraw(); };
  return el('div', { class: 'panel mpanel glowpanel' },
    el('div', { class: 'insp-sub' }, 'Text glow and color', helpBtn('textGlow')),
    el('p', { class: 'hint' }, 'Makes the words in the app glow. Pick the glow color, how strong it is, and the text color.'),
    el('div', { class: 'fxtop' },
      el('button', { class: 'tog' + (g.on ? ' on' : ''), onclick: () => set('on', !g.on) }, g.on ? 'Glow ON' : 'Glow OFF'),
      el('span', { class: 'glowdemo' }, 'SHELOOPS glow')),
    g.on ? [
      chips([['soft', 'Soft'], ['neon', 'Neon'], ['pulse', 'Pulse (titles breathe)']], g.style, v => set('style', v)),
      el('div', { class: 'knobrow' },
        el('label', { class: 'num' }, 'Glow color', color(g.color || currentTheme().c.led, v => set('color', v, false))),
        g.color ? el('button', { onclick: () => set('color', '') }, 'Use theme accent') : null,
        knob('Strength', 0, 1, 0.01, g.amount, v => set('amount', v, false), v => Math.round(v * 100) + '%', null, 'dial')),
    ] : null,
    el('div', { class: 'knobrow' },
      el('label', { class: 'num' }, 'Text color', color(g.text || currentTheme().c.text, v => set('text', v, false))),
      g.text ? el('button', { onclick: () => set('text', '') }, 'Use theme text color') : null));
}

// ---------- cursor ----------
function cursorPanel() {
  const c = look.cursor;
  const set = (k, v, re = true) => { c[k] = v; saveLook(); applyCursor(); if (re) redraw(); };
  const prev = c.on ? cursorImage(c) : null;
  return el('div', { class: 'panel mpanel' },
    el('div', { class: 'insp-sub' }, 'Mouse cursor', helpBtn('cursor')),
    el('div', { class: 'fxtop' },
      el('button', { class: 'tog' + (c.on ? ' on' : ''), onclick: () => set('on', !c.on) }, c.on ? 'Custom cursor ON' : 'Custom cursor OFF'),
      el('button', { onclick: () => { resetCursor(); redraw(); toast('Cursor reset to normal.'); } }, 'Reset to default'),
      prev ? el('div', { class: 'curprev' }, el('img', { src: prev.url, alt: '' }), el('span', { class: 'hint' }, 'Move the mouse here to try it')) : null),
    c.on ? [
      el('div', { class: 'insp-sub' }, 'Design'),
      chips([['dot', 'Dot'], ['ring', 'Ring'], ['cross', 'Crosshair'], ['arrow', 'Arrow'], ['star', 'Star'], ['heart', 'Heart'], ['note', 'Music note'], ['image', 'My picture']], c.design, async v => {
        if (v === 'image' && !c.image) {
          const f = await pickFile('image/*'); if (!f) return;
          const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
          const img = await new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = url; }).catch(() => null);
          if (!img) return toast('Could not read that picture.');
          const cv = el('canvas', { width: 64, height: 64 }); cv.getContext('2d').drawImage(img, 0, 0, 64, 64);
          c.image = cv.toDataURL('image/png'); c.imgEl = null;
        }
        set('design', v);
      }),
      c.design === 'image' ? el('button', { onclick: async () => { c.image = null; c.imgEl = null; set('design', 'dot'); } }, 'Remove my picture') : null,
      el('div', { class: 'knobrow' },
        el('label', { class: 'num' }, 'Color', color(c.color, v => set('color', v, false))),
        knob('Size', 12, 64, 1, c.size, v => set('size', v, false), v => v + 'px'),
        knob('Glow', 0, 1, 0.01, c.glow, v => set('glow', v, false), v => Math.round(v * 100) + '%'),
        el('label', { class: 'num' }, 'Animation', select([['none', 'None'], ['pulse', 'Pulse'], ['spin', 'Spinning ring'], ['orbit', 'Orbiting dot'], ['breathe', 'Breathing glow']], c.anim, v => set('anim', v, false)))),
      el('div', { class: 'insp-sub' }, 'Trail (follows the mouse)'),
      chips([['none', 'None'], ['dots', 'Dots'], ['sparkle', 'Sparkles'], ['line', 'Line'], ['comet', 'Comet'], ['rainbow', 'Rainbow'], ['notes', 'Music notes'], ['bubbles', 'Bubbles']], c.trail, v => set('trail', v)),
      c.trail !== 'none' ? knob('Trail length', 150, 1500, 10, c.trailLen || 450, v => set('trailLen', v, false), v => (v / 1000).toFixed(2) + 's') : null,
      el('div', { class: 'insp-sub' }, 'Click effect'),
      chips([['none', 'None'], ['ripple', 'Ripple'], ['burst', 'Burst'], ['shockwave', 'Shockwave'], ['stars', 'Stars'], ['notes', 'Music notes'], ['confetti', 'Confetti']], c.click, v => set('click', v)),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!c.spot, onchange: e => set('spot', e.target.checked, false) }), 'Spotlight: a soft glow that follows the mouse'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: c.safe, onchange: e => set('safe', e.target.checked, false) }), 'Use the normal cursor on the timeline, drum grid, piano roll and faders (recommended)', helpBtn('cursorSafe')),
    ] : null);
}

// ---------- now playing CD player ----------
function playerPanel() {
  return el('div', { class: 'panel mpanel' }, el('div', { class: 'insp-sub' }, 'Now playing CD player', helpBtn('cdplayer')),
    el('p', { class: 'hint' }, 'A see-through CD player with your own disc spinning inside whenever music plays. Change its color, size, text, which disc it shows, and when it appears.'),
    el('button', { class: 'hot', onclick: () => openPlayerSettings() }, 'Customize the CD player and visualizer'));
}
// ---------- layout + workspaces ----------
function layoutPanel() {
  const L = look.layout;
  const set = (k, v) => { L[k] = v; saveLook(); applyLayout(); redraw(); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= L.toolbar.length) return; [L.toolbar[i], L.toolbar[j]] = [L.toolbar[j], L.toolbar[i]]; saveLook(); redraw(); };
  const wsApply = w => { Object.assign(look.layout, JSON.parse(JSON.stringify(w.layout))); settings.simple = w.simple; saveSettings(); document.body.classList.toggle('simple', settings.simple); saveLook(); applyLayout(); emit('meta'); redraw(); toast(`Workspace "${w.name}" on.`); };
  return el('div', { class: 'panel mpanel' },
    el('div', { class: 'insp-sub' }, 'Layout', helpBtn('layout')),
    el('div', { class: 'knobrow' },
      el('label', { class: 'num' }, 'Studio settings panel', select([['bottom', 'At the bottom'], ['right', 'On the right']], L.inspPos, v => set('inspPos', v))),
      knob('Panel size', 140, 900, 10, L.inspSize, v => { L.inspSize = v; saveLook(); applyLayout(); }, v => v + 'px'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: L.editbar, onchange: e => set('editbar', e.target.checked) }), 'Show the edit toolbar'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: L.masterbar, onchange: e => set('masterbar', e.target.checked) }), 'Show the master bar'),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: L.compact, onchange: e => set('compact', e.target.checked) }), 'Compact (smaller buttons and spacing)')),
    el('div', { class: 'insp-sub' }, 'Recording toolbar: order and what shows'),
    el('div', { class: 'toollist' }, L.toolbar.map((k, i) => el('div', { class: 'toolrow' },
      el('input', { type: 'checkbox', checked: !L.hidden.includes(k), onchange: e => { L.hidden = e.target.checked ? L.hidden.filter(x => x !== k) : [...L.hidden, k]; saveLook(); } }),
      el('span', {}, TOOL_NAMES[k]), el('button', { class: 'sq', onclick: () => move(i, -1) }, '↑'), el('button', { class: 'sq', onclick: () => move(i, 1) }, '↓')))),
    el('div', { class: 'insp-sub' }, 'Workspaces', helpBtn('workspaces')),
    el('div', { class: 'fxtop' },
      [...BUILT_IN_WORKSPACES, ...look.workspaces].map(w => el('span', { class: 'wsitem' }, el('button', { onclick: () => wsApply(w) }, w.name),
        w.id.startsWith('my-') ? el('button', { class: 'sq', title: 'Delete', onclick: () => { look.workspaces = look.workspaces.filter(x => x !== w); saveLook(); redraw(); } }, '×') : null)),
      el('button', { class: 'hot', onclick: async () => { const n = await ask('Save workspace', 'Name', 'My workspace'); if (!n) return; look.workspaces.push({ id: 'my-' + uid(), name: n, simple: settings.simple, layout: JSON.parse(JSON.stringify(look.layout)) }); saveLook(); redraw(); toast(`Saved "${n}".`); } }, 'Save current as workspace')));
}
