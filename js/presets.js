// Built-in vocal presets, voice effects, Build My Sound, and my saved presets.
import { uid, clamp } from './util.js';
import { newFx } from './fx.js';

const F = (type, params) => newFx(type, params);
const tune = s => F('tune', { speed: s });
const eq = p => F('eq', p);
const comp = (thresh, ratio, makeup, extra = {}) => F('comp', { thresh, ratio, makeup, ...extra });
const deess = amount => F('deess', { amount });
const sat = drive => F('sat', { drive });

// Each preset: name, cat, desc, rev, dly, chain()
const P = (cat, name, desc, rev, dly, chain) => ({ id: 'b:' + name, cat, name, desc, rev, dly, chain });
export const BUILTIN = [
  P('Vocal', 'Clean Natural', 'Your real voice, just cleaned up.', 0.12, 0, () => [eq({ lowcut: 80, mud: -2, presence: 1.5, air: 1 }), comp(-16, 3, 3), deess(0.4)]),
  P('Vocal', 'Professional Studio', 'Polished, loud and clear, ready for most songs.', 0.18, 0.1, () => [eq({ lowcut: 90, mud: -3, presence: 3, air: 3 }), comp(-20, 4, 5), deess(0.5), sat(0.2), F('limiter', { ceiling: -1 })]),
  P('Vocal', 'R&B Vocals', 'Smooth and warm with gentle Auto-Tune and lots of space.', 0.32, 0.18, () => [tune(0.45), eq({ lowcut: 90, mud: -3, presence: 2, air: 4 }), comp(-20, 3.5, 5), deess(0.5), sat(0.15), F('doubler', { width: 0.5, mix: 0.2 })]),
  P('Vocal', 'Hip-Hop Vocals', 'Upfront and punchy, a little warm.', 0.1, 0.08, () => [eq({ lowcut: 100, body: 1, mud: -2, presence: 4, air: 2 }), comp(-22, 5, 6), deess(0.5), sat(0.3)]),
  P('Vocal', 'Rap Vocals', 'Tight, dry and in your face.', 0.06, 0.05, () => [eq({ lowcut: 110, mud: -3, presence: 5, air: 2 }), comp(-24, 6, 7, { attack: 0.003 }), deess(0.6), sat(0.35), F('limiter', { ceiling: -1 })]),
  P('Vocal', 'Trap Vocals', 'Fast Auto-Tune, bright, with echo.', 0.15, 0.2, () => [tune(0.85), eq({ lowcut: 110, mud: -3, presence: 4, air: 4 }), comp(-22, 5, 6), deess(0.5), sat(0.3)]),
  P('Vocal', 'Melodic Rap', 'Auto-Tune with a soft chorus and space.', 0.25, 0.22, () => [tune(0.7), eq({ lowcut: 100, mud: -3, presence: 3, air: 4 }), comp(-20, 4, 5), deess(0.5), F('chorus', { depth: 0.3, mix: 0.15 })]),
  P('Vocal', 'Pop Vocals', 'Bright, shiny and wide.', 0.25, 0.15, () => [tune(0.5), eq({ lowcut: 100, mud: -2, presence: 3, air: 5 }), comp(-22, 4, 6), deess(0.55), sat(0.1), F('doubler', { width: 0.6, mix: 0.25 })]),
  P('Vocal', 'Soul Vocals', 'Warm and full, a bit vintage.', 0.28, 0.1, () => [eq({ lowcut: 70, body: 2, mud: -1, presence: 2, air: 1 }), comp(-16, 3, 4), deess(0.4), sat(0.35)]),
  P('Vocal', 'Gospel Vocals', 'Big and open, like a church hall.', 0.45, 0.1, () => [eq({ lowcut: 70, body: 1.5, presence: 2.5, air: 3 }), comp(-18, 3, 4), deess(0.45), sat(0.2)]),
  P('Vocal', 'Soft Vocals', 'Gentle and intimate.', 0.3, 0.1, () => [eq({ lowcut: 90, mud: -2, presence: 1, air: 3, hicut: 14000 }), comp(-14, 2.5, 3), deess(0.55)]),
  P('Vocal', 'Deep Vocals', 'More body and weight in the low end.', 0.15, 0.05, () => [eq({ lowcut: 60, body: 4, mud: -1, presence: 1 }), comp(-18, 3.5, 4), sat(0.25)]),
  P('Vocal', 'Airy Vocals', 'Breathy, light and open on top.', 0.4, 0.2, () => [eq({ lowcut: 120, mud: -4, presence: 2, air: 7 }), comp(-18, 3, 4), deess(0.6), F('chorus', { depth: 0.2, mix: 0.15 })]),
  P('Vocal', 'Radio Voice', 'Squashed and bright like a radio host.', 0.04, 0, () => [eq({ lowcut: 150, body: 2, mud: -2, presence: 6, air: 1, hicut: 11000 }), comp(-28, 8, 9), sat(0.4), F('limiter', { ceiling: -1, drive: 3 })]),
  P('Vocal', 'Auto-Tuned Vocals', 'Clear Auto-Tune you can hear but still natural.', 0.28, 0.18, () => [tune(0.75), eq({ lowcut: 90, mud: -3, presence: 3, air: 4 }), comp(-20, 4, 5), deess(0.5)]),
  P('Vocal', 'Light Auto-Tune', 'Fixes notes quietly in the background.', 0.18, 0.08, () => [tune(0.3), eq({ lowcut: 85, mud: -2, presence: 2, air: 2 }), comp(-18, 3, 4), deess(0.45)]),
  P('Vocal', 'Heavy Auto-Tune', 'The hard robotic Auto-Tune sound.', 0.2, 0.25, () => [tune(1), eq({ lowcut: 110, mud: -3, presence: 4, air: 4 }), comp(-22, 5, 6), deess(0.5), sat(0.25)]),
  P('Vocal', 'Harmonies', 'Adds two harmony voices to your voice.', 0.35, 0.15, () => [tune(0.5), F('harmony', { v1: 4, v2: 7, mix: 0.4 }), eq({ lowcut: 100, mud: -3, presence: 2, air: 4 }), comp(-20, 4, 5), deess(0.5)]),
  P('Vocal', 'Background Vocals', 'Thin, wide and behind the lead.', 0.45, 0.15, () => [eq({ lowcut: 200, mud: -4, presence: -1, air: 3, hicut: 12000 }), comp(-24, 5, 4), F('doubler', { width: 0.9, mix: 0.6 }), F('widen', { amount: 0.6 })]),
  P('Vocal', 'Ad-libs', 'Small, gritty and echoey, for shouts and fills.', 0.3, 0.35, () => [eq({ lowcut: 250, presence: 4, air: 3, hicut: 9000 }), comp(-24, 6, 6), sat(0.4), F('widen', { amount: 0.4 })]),

  P('Enhance', 'Clarity', 'Removes mud so words are easier to hear.', 0.12, 0, () => [eq({ lowcut: 90, mud: -4, presence: 4 }), deess(0.4)]),
  P('Enhance', 'Warmth', 'Fuller and softer, takes the edge off.', 0.15, 0, () => [eq({ lowcut: 70, body: 3, air: -1 }), sat(0.35)]),
  P('Enhance', 'Brightness', 'More sparkle on top.', 0.12, 0, () => [eq({ lowcut: 90, presence: 2, air: 6 }), deess(0.5)]),
  P('Enhance', 'Presence', 'Pushes the voice to the front.', 0.1, 0, () => [eq({ lowcut: 90, presence: 6 }), comp(-18, 3, 3)]),
  P('Enhance', 'Depth', 'Bigger low end and more room.', 0.3, 0.05, () => [eq({ lowcut: 60, body: 4 })]),
  P('Enhance', 'Smooth', 'Soft top end and even volume.', 0.2, 0, () => [eq({ lowcut: 85, presence: -1, air: 1, hicut: 13000 }), comp(-20, 3, 4), deess(0.7)]),
  P('Enhance', 'Radio Quality', 'Loud and consistent like broadcast.', 0.05, 0, () => [eq({ lowcut: 140, mud: -2, presence: 5, air: 2 }), comp(-26, 7, 8), F('limiter', { ceiling: -1, drive: 2 })]),
  P('Enhance', 'Studio Quality', 'Clean, balanced and controlled.', 0.15, 0.05, () => [eq({ lowcut: 90, mud: -3, presence: 3, air: 3 }), comp(-20, 4, 5), deess(0.5), F('limiter', { ceiling: -1 })]),

  P('Voice FX', 'Deep Voice', 'Lowers your voice.', 0.12, 0, () => [F('pitch', { semis: -4 }), eq({ body: 3 })]),
  P('Voice FX', 'High-Pitched Voice', 'Raises your voice.', 0.12, 0, () => [F('pitch', { semis: 5 })]),
  P('Voice FX', 'Robotic Voice', 'Flat robotic tone.', 0.1, 0.1, () => [tune(1), F('ring', { freq: 70, mix: 0.5 })]),
  P('Voice FX', 'Telephone Voice', 'Thin and crunchy like a phone call.', 0, 0, () => [eq({ lowcut: 400, presence: 6, hicut: 3400 }), F('dist', { drive: 0.3, tone: 3000, mix: 0.5 })]),
  P('Voice FX', 'Radio Voice FX', 'Old AM radio.', 0, 0, () => [eq({ lowcut: 300, presence: 5, hicut: 5000 }), comp(-28, 8, 8), sat(0.6)]),
  P('Voice FX', 'Whisper', 'Thin, airy and breathy.', 0.35, 0, () => [eq({ lowcut: 600, mud: -6, presence: -2, air: 8 }), comp(-30, 8, 8)]),
  P('Voice FX', 'Alien Voice', 'Metallic and strange.', 0.2, 0.15, () => [F('pitch', { semis: 3 }), F('ring', { freq: 180, mix: 0.5 }), F('flanger', { rate: 0.3, depth: 0.7, feedback: 0.6, mix: 0.5 })]),
  P('Voice FX', 'Chipmunk Voice', 'Very high and squeaky.', 0.05, 0, () => [F('pitch', { semis: 10 })]),
  P('Voice FX', 'Monster Voice', 'Very low and growly.', 0.2, 0, () => [F('pitch', { semis: -9 }), F('dist', { drive: 0.6, tone: 1500, mix: 0.5 }), eq({ body: 4 })]),
  P('Voice FX', 'Echo Voice', 'Big repeating echo.', 0.2, 0.65, () => [eq({ lowcut: 120, presence: 2 })]),
  P('Voice FX', 'Distorted Voice', 'Loud and broken up.', 0.1, 0.1, () => [eq({ lowcut: 200 }), F('dist', { drive: 0.8, tone: 2500, mix: 0.8 })]),
  P('Voice FX', 'Vintage Voice', 'Old record sound.', 0.15, 0, () => [eq({ lowcut: 250, presence: 3, hicut: 6000 }), sat(0.6)]),
  P('Voice FX', 'Dreamy Voice', 'Floaty, wide and washed out.', 0.6, 0.35, () => [F('chorus', { rate: 0.5, depth: 0.5, mix: 0.4 }), eq({ lowcut: 120, air: 5 })]),
  P('Voice FX', 'Futuristic Voice', 'Hard tune with swirling effects.', 0.25, 0.3, () => [tune(1), F('flanger', { rate: 0.15, depth: 0.4, feedback: 0.4, mix: 0.3 }), F('phaser', { rate: 0.3, depth: 0.6, feedback: 0.3, mix: 0.3 })]),
];
export const CATS = ['Vocal', 'Enhance', 'Voice FX'];

// ---------- Build My Sound ----------
export const VIBES = {
  'Smooth R&B': { base: 'R&B Vocals', tune: 0.4, space: 0.6, bright: 0.5, warm: 0.4 },
  'Modern R&B': { base: 'R&B Vocals', tune: 0.65, space: 0.5, bright: 0.65, warm: 0.2 },
  'Melodic Rap': { base: 'Melodic Rap', tune: 0.7, space: 0.45, bright: 0.6, warm: 0.2 },
  'Clean Hip-Hop': { base: 'Hip-Hop Vocals', tune: 0, space: 0.2, bright: 0.55, warm: 0.3 },
  'Deep Rap Vocals': { base: 'Rap Vocals', tune: 0, space: 0.15, bright: 0.35, warm: 0.6 },
  'Airy Vocals': { base: 'Airy Vocals', tune: 0.3, space: 0.7, bright: 0.85, warm: 0.1 },
  'Dreamy Vocals': { base: 'Airy Vocals', tune: 0.4, space: 0.9, bright: 0.7, warm: 0.2 },
  'Pop Vocals': { base: 'Pop Vocals', tune: 0.5, space: 0.5, bright: 0.75, warm: 0.15 },
  'Soulful Vocals': { base: 'Soul Vocals', tune: 0, space: 0.5, bright: 0.4, warm: 0.7 },
  'Professional Studio Vocals': { base: 'Professional Studio', tune: 0.25, space: 0.35, bright: 0.55, warm: 0.3 },
};
// Turns a vibe + slider values into a preset object.
export function buildSound(base, s) {
  const chain = base.chain().filter(f => f.type !== 'tune');
  if (s.tune > 0.02) chain.unshift(newFx('tune', { speed: clamp(s.tune, 0, 1) }));
  const e = chain.find(f => f.type === 'eq');
  if (e) { e.params.air = clamp(e.params.air + (s.bright - 0.5) * 8, -12, 12); e.params.presence = clamp(e.params.presence + (s.bright - 0.5) * 4, -12, 12); e.params.body = clamp(e.params.body + (s.warm - 0.3) * 4, -12, 12); }
  let sa = chain.find(f => f.type === 'sat');
  if (s.warm > 0.05) { if (!sa) { sa = newFx('sat'); chain.splice(chain.findIndex(f => f.type === 'comp') + 1 || chain.length, 0, sa); } sa.params.drive = clamp(s.warm * 0.7, 0, 1); }
  else if (sa) chain.splice(chain.indexOf(sa), 1);
  return { id: 'tmp', name: 'Built sound', fx: chain, rev: clamp(s.space * 0.6, 0, 1), dly: clamp(s.space * 0.3, 0, 1) };
}

// ---------- my presets (localStorage) ----------
const KEY = 'loopden.presets';
export const mine = JSON.parse(localStorage.getItem(KEY) || '[]');
export const favs = new Set(JSON.parse(localStorage.getItem(KEY + '.fav') || '[]'));
export function saveMine() { localStorage.setItem(KEY, JSON.stringify(mine)); localStorage.setItem(KEY + '.fav', JSON.stringify([...favs])); }
export function addMine(name, folder, fx, rev, dly) {
  const p = { id: 'm:' + uid(), name, folder: folder || 'My presets', fx: JSON.parse(JSON.stringify(fx)), rev, dly, created: Date.now() };
  mine.push(p); saveMine(); return p;
}
export const folders = () => [...new Set(mine.map(p => p.folder))].sort();

// Fresh copy of a preset's chain with new ids
export function presetFx(p) {
  const fx = p.chain ? p.chain() : JSON.parse(JSON.stringify(p.fx));
  for (const f of fx) f.id = uid();
  return fx;
}
export const findPreset = id => BUILTIN.find(p => p.id === id) || mine.find(p => p.id === id);

// Mastering styles (used by the Master page and new-song defaults)
export const STYLES = {
  'Warm':      { target: -12, lowcut: 25, bass: 1.5, warmth: 0.5, clarity: 0,   air: -1,  harsh: 0.2, glue: 0.4,  width: 1 },
  'Clean':     { target: -14, lowcut: 30, bass: 0,   warmth: 0,   clarity: 1,   air: 1,   harsh: 0.2, glue: 0.25, width: 1.05 },
  'Loud':      { target: -9,  lowcut: 30, bass: 1,   warmth: 0.3, clarity: 1.5, air: 1.5, harsh: 0.3, glue: 0.6,  width: 1.1 },
  'Smooth':    { target: -13, lowcut: 30, bass: 0.5, warmth: 0.3, clarity: -1,  air: -0.5, harsh: 0.6, glue: 0.4, width: 1 },
  'Bright':    { target: -12, lowcut: 30, bass: 0,   warmth: 0.1, clarity: 2,   air: 3,   harsh: 0.4, glue: 0.3,  width: 1.1 },
  'Deep':      { target: -11, lowcut: 22, bass: 3,   warmth: 0.4, clarity: 0,   air: -0.5, harsh: 0.2, glue: 0.4, width: 1 },
  'Streaming': { target: -14, lowcut: 28, bass: 0.5, warmth: 0.15, clarity: 1,  air: 1,   harsh: 0.3, glue: 0.35, width: 1.05 },
};
