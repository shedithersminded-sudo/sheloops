// Mic sound: clean up your mic before it is recorded, shape it with an EQ, and stop feedback (the high squeal).
import { el, toast, knob, modal } from './util.js';
import { helpBtn } from './help.js';
import { on } from './state.js';
import { CLICKS, click, ensureCtx, shieldNow, SHIELDS } from './engine.js';
import { E, openMic, reopenMic, setInputGain, micSettings, applyMicSettings, clearNotches, updateMonitor, peakOf, rmsOf, fixSqueal, checkStatic, fixStatic } from './engine.js';
import { settings, saveSettings } from './store.js';

export const MIC_PRESETS = {
  'Natural': { lowcut: 80, body: 0, mud: 0, presence: 0, air: 0 },
  'Close to the mic': { lowcut: 120, body: -3, mud: -3, presence: 1, air: 1 },
  'Laptop or phone mic': { lowcut: 150, body: 1, mud: -4, presence: 3, air: 2 },
  'Bright and clear': { lowcut: 100, body: 0, mud: -2, presence: 3, air: 4 },
  'Warm': { lowcut: 70, body: 2, mud: -1, presence: -1, air: -1 },
  'Noisy room': { lowcut: 160, body: -2, mud: -3, presence: 2, air: -2, gate: true, denoise: 0.3 },
};
const db = v => (v <= 0.00001 ? -90 : 20 * Math.log10(v));
export function micPanel(rerender) {
  const M = micSettings(), set = (k, v) => { M[k] = v; saveSettings(); applyMicSettings(); };
  const meter = el('div', { class: 'micmeter' }, el('i', { class: 'lvl' }), el('i', { class: 'gateline' }), el('span', { class: 'micdb' }, 'mic off'));
  const floorEl = el('b', {}, '...');
  const fb = el('div', { class: 'fbstatus' });
  const showFb = () => { const n = (E.mic && E.mic.notches) || []; fb.replaceChildren(...[el('span', { class: 'fbled' + (M.guard ? ' on' : '') }), n.length ? el('span', {}, `Stopped ${n.length} ringing pitch${n.length === 1 ? '' : 'es'}: ${n.map(x => x.hz >= 1000 ? (x.hz / 1000).toFixed(1) + ' kHz' : Math.round(x.hz) + ' Hz').join(', ')}`) : el('span', {}, M.guard ? 'Listening for feedback. All quiet.' : 'Feedback guard is off.'), n.length ? el('button', { class: 'sq', title: 'Forget the fixes (if your voice sounds thin)', onclick: () => { clearNotches(); showFb(); } }, '↺') : null].filter(Boolean)); };
  on(k => { if (k === 'feedback' && fb.isConnected) showFb(); });
  let raf = 0, floorMin = 0;
  const tick = () => {
    if (!meter.isConnected) return cancelAnimationFrame(raf);
    const m = E.mic; if (m) { const pk = peakOf(m.an), r = rmsOf(m.an), d = db(pk); meter.style.setProperty('--l', Math.max(0, Math.min(1, (d + 60) / 60)).toFixed(3)); meter.querySelector('.micdb').textContent = d.toFixed(0) + ' dB';
      const rd = db(r); floorMin = floorMin ? Math.min(rd, floorMin + 0.03) : rd; floorEl.textContent = floorMin.toFixed(0) + ' dB'; } // quietest moment lately = your room
    meter.style.setProperty('--g', Math.max(0, Math.min(1, (M.gateDb + 60) / 60)).toFixed(3)); meter.classList.toggle('gated', !!M.gate);
    raf = requestAnimationFrame(tick);
  };
  openMic().then(() => { tick(); showFb(); }).catch(() => meter.querySelector('.micdb').textContent = 'no mic access');
  const measure = async btn => {
    await openMic(); btn.disabled = true; btn.textContent = 'Stay quiet...'; const vals = [];
    const t0 = performance.now(); while (performance.now() - t0 < 2000) { vals.push(db(rmsOf(E.mic.an))); await new Promise(r => setTimeout(r, 50)); }
    vals.sort((a, b) => a - b); const floor = vals[Math.floor(vals.length / 2)];
    set('gateDb', Math.round(Math.min(-20, floor + 10))); set('gate', true);
    btn.disabled = false; btn.textContent = 'Measure my room again'; toast(`Your room is about ${floor.toFixed(0)} dB. The gate now closes below ${M.gateDb} dB.`); rerender();
  };
  const presetOn = n => Object.entries(MIC_PRESETS[n]).every(([k, v]) => M[k] === v);
  const sect = (title, help, ...kids) => el('div', { class: 'micsect' }, el('div', { class: 'micsect-t' }, title, help ? helpBtn(help) : null), ...kids);
  return el('div', { class: 'micpanel' },
    staticBox(rerender),
    el('div', { class: 'explain squealbox', style: 'display:block' }, el('b', {}, 'Hear a high squeal? '), 'That is feedback: your speakers going back into your mic, round and round. Press the button and SHELOOPS sets everything up the safe way. Headphones fix it best.', el('div', {}, fixButton(rerender))),
    sect('Level', 'micLevel', meter,
      el('div', { class: 'knobrow' }, knob('Input', 0.1, 4, 0.01, settings.inputGain, v => setInputGain(v), v => Math.round(v * 100) + '%', null, 'dial'),
        el('div', { class: 'micinfo' }, el('small', {}, 'Room noise'), floorEl, el('small', {}, 'Speak normally: the bar should reach the yellow, never the red.')))),
    sect('Clean up', 'micClean',
      el('div', { class: 'knobrow' },
        knob('Low cut', 20, 300, 1, M.lowcut, v => set('lowcut', v), v => Math.round(v) + ' Hz', null, 'dial'),
        knob('Noise remover', 0, 1, 0.01, M.denoise, v => set('denoise', v), v => v < 0.01 ? 'off' : Math.round(v * 100) + '%', null, 'dial'),
        knob('Gate', -80, -20, 1, M.gateDb, v => set('gateDb', v), v => v + ' dB', null, 'dial')),
      el('div', { class: 'fxtop' }, el('button', { class: 'tog' + (M.gate ? ' on' : ''), onclick: e => { set('gate', !M.gate); e.target.classList.toggle('on', M.gate); e.target.textContent = M.gate ? 'Gate ON' : 'Gate OFF'; } }, M.gate ? 'Gate ON' : 'Gate OFF'),
        el('button', { class: 'hot', onclick: e => measure(e.target) }, 'Measure my room (2 seconds of quiet)')),
      el('div', { class: 'fxlib' }, el('small', { class: 'hint' }, 'Hum remover (for buzz):'),
        ...[['off', 'Off'], ['60', '60 Hz (US, Canada)'], ['50', '50 Hz (UK, Europe, most others)']].map(([k, n]) => el('button', { class: 'chip' + (M.hum === k ? ' on' : ''), onclick: () => { set('hum', k); rerender(); } }, n))),
      el('div', { class: 'fxlib' }, el('small', { class: 'hint' }, 'Audio mode:'),
        ...[['interactive', 'Lowest delay'], ['balanced', 'Smooth (fewer crackles)'], ['playback', 'Smoothest']].map(([k, n]) => el('button', { class: 'chip' + (settings.latency === k ? ' on' : ''), onclick: () => { settings.latency = k; saveSettings(); toast('Reloading to switch the audio mode...'); setTimeout(() => location.reload(), 900); } }, n)))),
    sect('Mic EQ', 'micEq',
      el('div', { class: 'fxlib' }, ...Object.keys(MIC_PRESETS).map(n => el('button', { class: 'chip' + (presetOn(n) ? ' on' : ''), onclick: () => { Object.assign(M, MIC_PRESETS[n]); saveSettings(); applyMicSettings(); rerender(); toast(`Mic: ${n}.`); } }, n))),
      el('div', { class: 'knobrow' },
        knob('Body', -12, 12, 0.5, M.body, v => set('body', v), v => (v > 0 ? '+' : '') + v, null, 'dial'),
        knob('Mud', -12, 12, 0.5, M.mud, v => set('mud', v), v => (v > 0 ? '+' : '') + v, null, 'dial'),
        knob('Presence', -12, 12, 0.5, M.presence, v => set('presence', v), v => (v > 0 ? '+' : '') + v, null, 'dial'),
        knob('Air', -12, 12, 0.5, M.air, v => set('air', v), v => (v > 0 ? '+' : '') + v, null, 'dial'))),
    sect('Hearing yourself', 'monitor',
      el('div', { class: 'fxtop' },
        el('button', { class: 'tog' + (settings.monitor ? ' on' : ''), onclick: async e => { settings.monitor = !settings.monitor; saveSettings(); if (settings.monitor) await openMic().catch(() => { }); updateMonitor(); e.target.classList.toggle('on', settings.monitor); e.target.textContent = settings.monitor ? 'Hear myself ON' : 'Hear myself OFF'; } }, settings.monitor ? 'Hear myself ON' : 'Hear myself OFF'),
        knob('Volume', 0, 1.5, 0.01, M.monVol, v => set('monVol', v), v => Math.round(v * 100) + '%', null, 'dial sm')),
      el('div', { class: 'fxlib' },
        el('button', { class: 'chip' + (M.monFx ? ' on' : ''), onclick: () => { set('monFx', true); rerender(); } }, 'With my effects'),
        el('button', { class: 'chip' + (!M.monFx ? ' on' : ''), onclick: () => { set('monFx', false); rerender(); } }, 'Dry voice')),
      shieldPicker(M, set, rerender),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: M.speakers, onchange: async e => { M.speakers = e.target.checked; if (M.speakers) { settings.ec = true; settings.nr = true; M.shield = 'strong'; M.guard = true; } saveSettings(); await reopenMic().catch(() => { }); applyMicSettings(); rerender(); toast(M.speakers ? 'Speaker mode: echo cancelling on, squeal shield strong, monitor quieter. Your effects still work.' : 'Headphone mode.'); } }), 'I am on speakers (no headphones)'),
      el('div', { class: 'fxtop' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.ec, onchange: async e => { settings.ec = e.target.checked; saveSettings(); await reopenMic().catch(() => { }); } }), 'Echo cancel'),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.nr, onchange: async e => { settings.nr = e.target.checked; saveSettings(); await reopenMic().catch(() => { }); } }), 'Browser noise suppression'))),
    sect('Feedback guard', 'feedbackGuard', el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: M.guard, onchange: e => { set('guard', e.target.checked); showFb(); } }), 'Stop the squeal automatically'), fb));
}
// Static, hiss or buzz: listens for 3 seconds, finds the cause, fixes what it can, and shows how to fix the rest
export function staticBox(rerender) {
  const out = el('div', { class: 'staticout' });
  const btn = el('button', { class: 'hot', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Stay quiet for 3 seconds...';
    try {
      const r = await checkStatic(), res = await fixStatic(r);
      out.replaceChildren(...[
        res.found.length ? el('div', {}, el('b', {}, 'What I found'), el('ul', {}, ...res.found.map(x => el('li', {}, x)))) : el('p', {}, 'Your mic sounds clean right now. If the static only comes with effects on, see the tips below.'),
        res.did.length ? el('div', {}, el('b', {}, 'What I changed'), el('ul', { class: 'okl' }, ...res.did.map(x => el('li', {}, x)))) : null,
        res.reload ? el('button', { class: 'hot', onclick: () => location.reload() }, 'Reload to finish') : null].filter(Boolean));
    } catch { out.replaceChildren(el('p', {}, 'No mic access. Allow the mic in your browser and try again.')); }
    btn.disabled = false; btn.textContent = 'Check again';
  } }, 'Find and fix my static');
  const tip = (b, t) => el('li', {}, el('b', {}, b + ' '), t);
  return el('div', { class: 'explain staticbox', style: 'display:block' },
    el('b', {}, 'Static, hiss or buzz? '), 'Press the button and stay quiet. SHELOOPS listens to your room, finds what causes it, and fixes what it can.',
    navigator.brave ? el('div', { class: 'bravenote' }, el('b', {}, 'You are using Brave. '), 'Brave Shields can blur sound on purpose to stop tracking, which can add noise and break the mic meters. Click the lion icon in the address bar, then turn Shields down (off) for this site, and reload. Your projects stay safe.') : null,
    el('div', {}, btn), out,
    el('details', { class: 'statictips' }, el('summary', {}, 'How to fix it by hand'),
      el('ul', {},
        tip('Bluetooth headset?', 'Its mic is low quality and crackles. Use wired headphones, a wired mic, or your computer mic.'),
        tip('Buzz that changes when you touch the laptop?', 'Unplug the charger, or plug the mic straight into the computer instead of a hub. Then turn on the Hum remover.'),
        tip('Crackles only with effects?', 'Your computer is too busy. Pick Audio mode: Smooth, close other tabs, and use fewer effects at once.'),
        tip('Level in the red?', 'Turn Input down until the bar only reaches the yellow when you sing loud.'),
        tip('Hiss between words?', 'Turn on the Gate and press Measure my room. Keep the Noise remover around 30%. Higher sounds watery.'),
        tip('Loud effects make it worse?', 'Distortion, Lo-fi and heavy compression turn the hiss up too. Use the gate, or lower the effect.'),
        tip('Still there?', 'Move the mic away from the computer fan, and record a 5 second test to hear it plain.'))));
}
// Squeal shield: protects what you hear, with or without effects. Your recording is never changed by it.
export const SHIELD_INFO = { off: ['Off', 'Nothing added. Only for good headphones.'], auto: ['Auto', 'Light protection you will not notice. Turns itself up to Strong if a squeal keeps coming back.'], strong: ['Strong', 'For speakers or a room that keeps squealing. Trims the sharp highs, keeps your voice moving a tiny bit so a howl cannot build, and keeps the volume in check.'] };
export function shieldPicker(M, set, rerender) {
  return el('div', { class: 'shieldpick' }, el('div', { class: 'micsect-t' }, 'Squeal shield', helpBtn('shield')),
    el('div', { class: 'fxlib' }, ...Object.entries(SHIELD_INFO).map(([k, [n]]) => el('button', { class: 'chip' + (M.shield === k ? ' on' : ''), onclick: () => { delete M.sh; set('shield', k); rerender(); } }, n))),
    el('small', { class: 'hint' }, SHIELD_INFO[M.shield || 'auto'][1] + ' Works with your effects on too.'),
    shieldKnobs(M, set));
}
// fine tune the shield: every part of it, in plain words
export function shieldKnobs(M, set) {
  const S = shieldNow(), put = (k, v) => { M.sh = { ...(M.sh || {}), [k]: v }; set('sh', M.sh); };
  return el('details', { class: 'shieldtune' }, el('summary', {}, 'Fine tune the shield'),
    el('div', { class: 'knobrow' },
      knob('Trim lows', 20, 300, 1, S.hp, v => put('hp', v), v => Math.round(v) + ' Hz', null, 'dial sm'),
      knob('Trim highs', 3000, 20000, 50, S.lp, v => put('lp', v), v => v >= 19500 ? 'off' : (v / 1000).toFixed(1) + ' kHz', null, 'dial sm'),
      knob('Anti-howl wobble', 0, 0.0008, 0.00002, S.dep, v => put('dep', v), v => v ? Math.round(v / 0.0008 * 100) + '%' : 'off', null, 'dial sm'),
      knob('Level cap', -30, 0, 0.5, S.thr, v => put('thr', v), v => v ? v + ' dB' : 'off', null, 'dial sm')),
    el('small', { class: 'hint' }, 'Trim highs and Level cap stop most squeals. Wobble helps on speakers but can make your voice feel less steady, so keep it low. Picking Off, Auto or Strong resets these.'),
    el('button', { onclick: () => { delete M.sh; set('sh', undefined); } }, 'Back to ' + (M.shield || 'auto')));
}
export function fixButton(rerender) {
  return el('button', { class: 'hot fixsqueal', onclick: async e => { e.currentTarget.disabled = true; const did = await fixSqueal(); toast('Fixed: ' + did.join(', ') + '.'); rerender && rerender(); } }, 'Fix my squeal');
}
// the metronome sound and volume, with a test button
export function clickPicker() {
  return el('div', { class: 'clickpick' }, el('small', {}, 'Click'),
    el('select', { title: 'Metronome sound', onchange: async e => { settings.clickSound = e.target.value; saveSettings(); const c = await ensureCtx(); click(c, c.currentTime + 0.01, true); } }, ...Object.entries(CLICKS).map(([k, n]) => el('option', { value: k, selected: (settings.clickSound || 'beep') === k }, n))),
    el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: settings.clickVol ?? 0.6, title: 'Click volume', oninput: e => { settings.clickVol = +e.target.value; saveSettings(); } }),
    el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.metro, onchange: e => { settings.metro = e.target.checked; saveSettings(); } }), 'On'));
}
export function mountMicDock() {
  const cv = el('canvas', { width: 44, height: 220 }), lab = el('b', {}, 'MIC'), dbt = el('small', {}, '');
  const dock = el('div', { class: 'micdock', title: 'Your mic level. Aim for the yellow when you sing loud. Red means too loud.' }, lab, cv, dbt);
  document.body.append(dock);
  const hist = new Float32Array(110); let hp = 0, hold = 0, holdT = 0, clipT = 0;
  const g = cv.getContext('2d'), W = 44, H = 220;
  const loop = () => {
    const m = E.mic, on = !!m && E.ctx && E.ctx.state === 'running';
    dock.classList.toggle('on', on);
    if (on) {
      const pk = peakOf(m.an), d = pk > 0 ? 20 * Math.log10(pk) : -90, lv = Math.max(0, Math.min(1, (d + 60) / 60)), now = performance.now();
      if (lv > hold || now - holdT > 1200) { hold = lv; holdT = now; }
      if (pk > 0.98) clipT = now;
      hist[hp++ % hist.length] = lv;
      const rec = !!(window.__shRec && window.__shRec());
      lab.textContent = rec ? 'REC' : 'MIC'; dock.classList.toggle('rec', rec); dock.classList.toggle('clip', now - clipT < 1500);
      dbt.textContent = d > -89 ? Math.round(d) + '' : '-';
      g.clearRect(0, 0, W, H);
      const grad = g.createLinearGradient(0, H, 0, 0); grad.addColorStop(0, '#3ddc84'); grad.addColorStop(0.7, '#ffd23f'); grad.addColorStop(0.9, '#ff8c42'); grad.addColorStop(1, '#ff3b5c');
      // left: the level bar with a peak line
      g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(2, 0, 14, H);
      g.fillStyle = grad; g.fillRect(2, H - lv * H, 14, lv * H);
      g.fillStyle = '#fff'; g.fillRect(2, H - hold * H - 1, 14, 2);
      // right: your voice over the last few seconds, moving up
      g.fillStyle = grad;
      for (let i = 0; i < hist.length; i++) { const v = hist[(hp + i) % hist.length], y = i * 2, w = v * 24; g.globalAlpha = 0.35 + 0.65 * (i / hist.length); g.fillRect(31 - w / 2, y, Math.max(1, w), 2); }
      g.globalAlpha = 1;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export function openMicPanel() {
  let close; const wrap = el('div', { class: 'micwrap' });
  const draw = () => wrap.replaceChildren(micPanel(draw));
  draw(); close = modal('Mic sound', wrap);
}
