// My sound: personal studio profile. Defaults for new songs, compare vocal styles, my collection, backup.
import { $, el, toast, select, download, confirmBox } from './util.js';
import { helpBtn } from './help.js';
import { app, emit, save, snapshot, STARTERS } from './state.js';
import { settings, saveSettings, db } from './store.js';
import { BUILTIN, mine, favs, saveMine, presetFx, findPreset, STYLES } from './presets.js';
import { startPreview, keepPreview, cancelPreview, setRerender } from './fxui.js';
import { applyMix, T, stop } from './engine.js';
import { look, saveLook, applyLook } from './look.js';

const presetOpts = () => [['', 'None'], ...mine.map(p => [p.id, 'Mine: ' + p.name]), ...BUILTIN.map(p => [p.id, p.cat + ': ' + p.name])];
const cmp = { track: null, slots: ['b:R&B Vocals', 'b:Airy Vocals', 'b:Melodic Rap', ''], cur: -1 };

export async function renderProfile() {
  const view = $('#view'); view.innerHTML = '';
  setRerender(renderProfile);
  const sounds = (await db.all('sounds')).length;
  if (app.view !== 'profile') return;
  const kits = JSON.parse(localStorage.getItem('loopden.kits') || '[]');
  const P = app.P;
  const vocals = P ? P.tracks.filter(t => t.clips.length) : [];
  if (!cmp.track || !vocals.find(t => t.id === cmp.track)) cmp.track = (vocals.find(t => t.kind !== 'file') || vocals[0] || {}).id || null;
  const t = vocals.find(x => x.id === cmp.track);

  const hear = i => {
    const p = findPreset(cmp.slots[i]); if (!p || !t) return;
    cmp.cur = i; startPreview(t, { name: p.name, fx: presetFx(p), rev: p.rev, dly: p.dly });
  };
  view.append(el('div', { class: 'profile' },
    el('div', { class: 'ptop' }, el('h1', {}, 'My sound'), helpBtn('profile')),
    el('p', { class: 'hint' }, 'Your personal studio. Set how new songs start, compare vocal styles, and back up your setup.'),

    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, 'Start every new song with my sound'),
      el('label', { class: 'field' }, el('span', {}, 'My vocal chain (for new vocal tracks)', helpBtn('defaultVocal')),
        select(presetOpts(), settings.defaultVocal || '', v => { settings.defaultVocal = v; saveSettings(); toast(v ? 'New vocal tracks will start with this sound.' : 'New vocal tracks start clean.'); })),
      el('label', { class: 'field' }, el('span', {}, 'Beat style for new songs'),
        select(Object.keys(STARTERS), settings.defaultStarter || 'R&B', v => { settings.defaultStarter = v; saveSettings(); })),
      el('label', { class: 'field' }, el('span', {}, 'Mastering style for new songs'),
        select([['', 'None'], ...Object.keys(STYLES).map(s => [s, s === 'Streaming' ? 'Pro Streaming' : s])], settings.defaultMaster || '', v => { settings.defaultMaster = v; saveSettings(); })),
      P && settings.defaultVocal ? el('button', { onclick: async () => {
        const p = findPreset(settings.defaultVocal); if (!p) return;
        const list = P.tracks.filter(x => x.kind !== 'file');
        if (!await confirmBox('Use my vocal chain', `Replace the effects on ${list.length} vocal track${list.length === 1 ? '' : 's'} in "${P.name}" with "${p.name}"?`, 'Replace')) return;
        snapshot(); for (const x of list) Object.assign(x, { fx: presetFx(p), rev: p.rev, dly: p.dly, fxBypass: false });
        save(); applyMix(); toast('Done.');
      } }, 'Use my vocal chain on this song') : null),

    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, 'Compare vocal styles', helpBtn('compare')),
      !t ? el('p', { class: 'hint' }, 'Record a vocal in the Studio first, then come back to compare styles on it.') : [
        el('label', { class: 'num' }, 'Track', select(vocals.map(x => [x.id, x.name]), cmp.track, v => { cancelPreview(true); cmp.track = v; cmp.cur = -1; renderProfile(); })),
        el('div', { class: 'cmpgrid' }, cmp.slots.map((id, i) => el('div', { class: 'cmpslot' + (cmp.cur === i ? ' on' : '') },
          el('b', {}, 'ABCD'[i]),
          select(presetOpts(), id, v => { cmp.slots[i] = v; if (cmp.cur === i) hear(i); }),
          el('button', { disabled: !id, onclick: () => { hear(i); renderProfile(); } }, cmp.cur === i ? 'Playing' : 'Hear')))),
        el('div', { class: 'fxtop' },
          el('button', { class: 'hot', disabled: cmp.cur < 0, onclick: () => { keepPreview(); cmp.cur = -1; stop(); renderProfile(); } }, 'Keep the one I am hearing'),
          el('button', { disabled: cmp.cur < 0, onclick: () => { cancelPreview(); cmp.cur = -1; stop(); renderProfile(); } }, 'Keep my current sound'),
          el('span', { class: 'hint' }, 'Switch between A, B, C and D while it plays.')),
      ]),

    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, 'My collection'),
      el('div', { class: 'coll' },
        el('button', { onclick: () => { settings.inspTab = 'presets'; saveSettings(); emit('goto:studio'); } }, el('b', {}, mine.length), el('span', {}, 'my presets')),
        el('button', { onclick: () => { settings.inspTab = 'presets'; saveSettings(); emit('goto:studio'); } }, el('b', {}, favs.size), el('span', {}, 'favorite presets')),
        el('button', { onclick: () => emit('goto:sounds') }, el('b', {}, sounds), el('span', {}, 'my sounds')),
        el('button', { onclick: () => emit('goto:beat') }, el('b', {}, kits.length), el('span', {}, 'drum kits')))),

    el('div', { class: 'panel mpanel' },
      el('div', { class: 'insp-sub' }, 'Back up my setup', helpBtn('backup')),
      el('div', { class: 'fxtop' },
        el('button', { onclick: exportProfile }, 'Save my studio file'),
        el('button', { onclick: importProfile }, 'Load my studio file'),
        el('span', { class: 'hint' }, 'Includes your settings, presets, favorites, kits, theme, background, cursor and layout. Songs and sounds stay in this browser.'))),
  ));
}

async function exportProfile() {
  const { inputId, outputId, lastProject, ...rest } = settings;
  const { imgEl, ...cur } = look.cursor;
  let bgImage = null;
  const d = await db.get('audio', 'look-bg').catch(() => null);
  if (d && d.img && d.img.size < 8e6) bgImage = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(d.img); });
  let logoImage = null;
  const lg = await db.get('audio', 'look-logo').catch(() => null);
  if (lg && lg.img && lg.img.size < 8e6) logoImage = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(lg.img); });
  const data = { app: 'SHELOOPS', kind: 'studio', v: 2, logoImage, saved: new Date().toISOString(), settings: rest, presets: mine, favs: [...favs], kits: JSON.parse(localStorage.getItem('loopden.kits') || '[]'), look: { ...look, cursor: cur }, bgImage };
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'my-sheloops-studio.json');
  toast('Studio file saved to your downloads.');
}
function importProfile() {
  const inp = el('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.kind !== 'studio' || !Array.isArray(d.presets)) throw 0;
      let added = 0;
      for (const p of d.presets) if (!mine.find(x => x.id === p.id)) { mine.push(p); added++; }
      for (const id of d.favs || []) favs.add(id);
      saveMine();
      const kits = JSON.parse(localStorage.getItem('loopden.kits') || '[]');
      for (const k of d.kits || []) if (!kits.find(x => x.name === k.name)) kits.push(k);
      localStorage.setItem('loopden.kits', JSON.stringify(kits));
      Object.assign(settings, d.settings || {}); saveSettings();
      if (d.look) {
        Object.assign(look, d.look); look.cursor.imgEl = null;
        if (d.logoImage) { const blob = await (await fetch(d.logoImage)).blob(); await db.put('audio', 'look-logo', { img: blob, name: 'logo' }); }
        if (d.bgImage) { const blob = await (await fetch(d.bgImage)).blob(); await db.put('audio', 'look-bg', { img: blob, name: 'background' }); }
        saveLook(); await applyLook();
      }
      document.body.classList.toggle('simple', settings.simple);
      toast(`Loaded. ${added} new preset${added === 1 ? '' : 's'}.`); renderProfile();
    } catch { toast('That is not a SHELOOPS studio file.'); }
  };
  inp.click();
}
