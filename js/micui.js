// Mic sound: clean up your mic before it is recorded, shape it with an EQ, and stop feedback (the high squeal).
import { el, toast, knob, modal } from './util.js';
import { helpBtn } from './help.js';
import { on } from './state.js';
import { E, openMic, reopenMic, setInputGain, micSettings, applyMicSettings, clearNotches, updateMonitor, peakOf, rmsOf } from './engine.js';
import { settings, saveSettings } from './store.js';

export const MIC_PRESETS = {
  'Natural': { lowcut: 80, body: 0, mud: 0, presence: 0, air: 0 },
  'Close to the mic': { lowcut: 120, body: -3, mud: -3, presence: 1, air: 1 },
  'Laptop or phone mic': { lowcut: 150, body: 1, mud: -4, presence: 3, air: 2 },
  'Bright and clear': { lowcut: 100, body: 0, mud: -2, presence: 3, air: 4 },
  'Warm': { lowcut: 70, body: 2, mud: -1, presence: -1, air: -1 },
  'Noisy room': { lowcut: 160, body: -2, mud: -3, presence: 2, air: -2, gate: true, denoise: 0.55 },
};
const db = v => (v <= 0.00001 ? -90 : 20 * Math.log10(v));
export function micPanel(rerender) {
  const M = micSettings(), set = (k, v) => { M[k] = v; saveSettings(); applyMicSettings(); };
  const meter = el('div', { class: 'micmeter' }, el('i', { class: 'lvl' }), el('i', { class: 'gateline' }), el('span', { class: 'micdb' }, 'mic off'));
  const floorEl = el('b', {}, '...');
  const fb = el('div', { class: 'fbstatus' });
  const showFb = () => { const n = (E.mic && E.mic.notches) || []; fb.replaceChildren(el('span', { class: 'fbled' + (M.guard ? ' on' : '') }), n.length ? el('span', {}, `Stopped ${n.length} ringing pitch${n.length === 1 ? '' : 'es'}: ${n.map(x => x.hz >= 1000 ? (x.hz / 1000).toFixed(1) + ' kHz' : Math.round(x.hz) + ' Hz').join(', ')}`) : el('span', {}, M.guard ? 'Listening for feedback. All quiet.' : 'Feedback guard is off.'), n.length ? el('button', { class: 'sq', title: 'Forget the fixes (if your voice sounds thin)', onclick: () => { clearNotches(); showFb(); } }, '↺') : null); };
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
    el('div', { class: 'explain', style: 'display:block' }, el('b', {}, 'Hear a high squeal? '), 'That is feedback: your speakers going back into your mic. Wear headphones if you can. If not, turn on "I am on speakers" below and leave the Feedback guard on.'),
    sect('Level', 'micLevel', meter,
      el('div', { class: 'knobrow' }, knob('Input', 0.1, 4, 0.01, settings.inputGain, v => setInputGain(v), v => Math.round(v * 100) + '%', null, 'dial'),
        el('div', { class: 'micinfo' }, el('small', {}, 'Room noise'), floorEl, el('small', {}, 'Speak normally: the bar should reach the yellow, never the red.')))),
    sect('Clean up', 'micClean',
      el('div', { class: 'knobrow' },
        knob('Low cut', 20, 300, 1, M.lowcut, v => set('lowcut', v), v => Math.round(v) + ' Hz', null, 'dial'),
        knob('Noise remover', 0, 1, 0.01, M.denoise, v => set('denoise', v), v => v < 0.01 ? 'off' : Math.round(v * 100) + '%', null, 'dial'),
        knob('Gate', -80, -20, 1, M.gateDb, v => set('gateDb', v), v => v + ' dB', null, 'dial')),
      el('div', { class: 'fxtop' }, el('button', { class: 'tog' + (M.gate ? ' on' : ''), onclick: e => { set('gate', !M.gate); e.target.classList.toggle('on', M.gate); e.target.textContent = M.gate ? 'Gate ON' : 'Gate OFF'; } }, M.gate ? 'Gate ON' : 'Gate OFF'),
        el('button', { class: 'hot', onclick: e => measure(e.target) }, 'Measure my room (2 seconds of quiet)'))),
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
        el('button', { class: 'chip' + (!M.monFx ? ' on' : ''), onclick: () => { set('monFx', false); rerender(); } }, 'Dry (safer on speakers)')),
      el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: M.speakers, onchange: async e => { M.speakers = e.target.checked; if (M.speakers) { settings.ec = true; settings.nr = true; M.monFx = false; M.guard = true; } saveSettings(); await reopenMic().catch(() => { }); applyMicSettings(); rerender(); toast(M.speakers ? 'Speaker mode: echo cancelling on, monitor quieter and dry.' : 'Headphone mode.'); } }), 'I am on speakers (no headphones)'),
      el('div', { class: 'fxtop' }, el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.ec, onchange: async e => { settings.ec = e.target.checked; saveSettings(); await reopenMic().catch(() => { }); } }), 'Echo cancel'),
        el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: !!settings.nr, onchange: async e => { settings.nr = e.target.checked; saveSettings(); await reopenMic().catch(() => { }); } }), 'Browser noise suppression'))),
    sect('Feedback guard', 'feedbackGuard', el('label', { class: 'chk' }, el('input', { type: 'checkbox', checked: M.guard, onchange: e => { set('guard', e.target.checked); showFb(); } }), 'Stop the squeal automatically'), fb));
}
export function openMicPanel() {
  let close; const wrap = el('div', { class: 'micwrap' });
  const draw = () => wrap.replaceChildren(micPanel(draw));
  draw(); close = modal('Mic sound', wrap);
}
