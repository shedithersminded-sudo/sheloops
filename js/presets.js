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

  P('Vocal', 'Drill Vocals', 'Dark, tight and aggressive with a slap echo.', 0.08, 0.12, () => [eq({ lowcut: 120, body: 1, mud: -3, presence: 4, air: 1 }), comp(-24, 6, 7, { attack: 0.003 }), deess(0.55), sat(0.4), F('delay', { time: 0.12, feedback: 0.15, tone: 3000, mix: 0.18 })]),
  P('Vocal', 'Afrobeats Vocals', 'Warm, bouncy and wide with soft tune.', 0.25, 0.2, () => [tune(0.55), eq({ lowcut: 95, body: 1, mud: -2, presence: 2.5, air: 3 }), comp(-20, 3.5, 5), deess(0.5), F('doubler', { width: 0.5, mix: 0.2 })]),
  P('Vocal', 'Lo-fi Vocals', 'Dusty, soft and a little crunchy.', 0.3, 0.15, () => [eq({ lowcut: 200, mud: -2, presence: 2, air: -3, hicut: 7000 }), comp(-20, 4, 5), sat(0.5), F('bitcrush', { bits: 10, tone: 6500, mix: 0.25 })]),
  P('Vocal', 'Rock Vocals', 'Gritty, loud and in front.', 0.2, 0.08, () => [eq({ lowcut: 110, body: 1, mud: -3, presence: 5, air: 2 }), comp(-24, 6, 7), deess(0.5), F('dist', { drive: 0.25, tone: 4000, mix: 0.2 }), F('limiter', { ceiling: -1 })]),
  P('Vocal', 'Country Vocals', 'Natural and bright with a short slapback.', 0.18, 0, () => [eq({ lowcut: 90, mud: -2, presence: 3, air: 3 }), comp(-18, 3.5, 4), deess(0.5), F('delay', { time: 0.11, feedback: 0.05, tone: 5000, mix: 0.2 })]),
  P('Vocal', 'Indie Vocals', 'Soft, roomy and slightly doubled.', 0.25, 0.1, () => [eq({ lowcut: 100, mud: -2, presence: 1.5, air: 2 }), comp(-16, 3, 3), F('doubler', { width: 0.4, mix: 0.25 }), F('room', { size: 1.2, tone: 6000, mix: 0.2 })]),
  P('Vocal', 'Podcast Voice', 'Clear, close and even for talking.', 0, 0, () => [F('denoise', { amount: 0.5 }), eq({ lowcut: 90, body: 1.5, mud: -3, presence: 3, air: 1 }), comp(-22, 4, 6), deess(0.55), F('limiter', { ceiling: -1 })]),
  P('Vocal', 'Big Hall', 'Huge and grand, like singing on a stage.', 0.2, 0.05, () => [eq({ lowcut: 90, mud: -2, presence: 2, air: 3 }), comp(-18, 3, 4), F('room', { size: 4.5, tone: 7000, mix: 0.4 })]),

  P('Vocal', 'Ragga MC', 'Jungle and dancehall MC: bright, punchy, with a dub echo.', 0.12, 0.3, () => [eq({ lowcut: 140, mud: -3, presence: 5, air: 3 }), comp(-26, 6, 7, { attack: 0.003 }), deess(0.5), sat(0.35), F('delay', { time: 0.35, feedback: 0.45, tone: 2500, mix: 0.22 })]),

  P('Enhance', 'Clarity', 'Removes mud so words are easier to hear.', 0.12, 0, () => [eq({ lowcut: 90, mud: -4, presence: 4 }), deess(0.4)]),
  P('Enhance', 'Warmth', 'Fuller and softer, takes the edge off.', 0.15, 0, () => [eq({ lowcut: 70, body: 3, air: -1 }), sat(0.35)]),
  P('Enhance', 'Brightness', 'More sparkle on top.', 0.12, 0, () => [eq({ lowcut: 90, presence: 2, air: 6 }), deess(0.5)]),
  P('Enhance', 'Presence', 'Pushes the voice to the front.', 0.1, 0, () => [eq({ lowcut: 90, presence: 6 }), comp(-18, 3, 3)]),
  P('Enhance', 'Depth', 'Bigger low end and more room.', 0.3, 0.05, () => [eq({ lowcut: 60, body: 4 })]),
  P('Enhance', 'Smooth', 'Soft top end and even volume.', 0.2, 0, () => [eq({ lowcut: 85, presence: -1, air: 1, hicut: 13000 }), comp(-20, 3, 4), deess(0.7)]),
  P('Enhance', 'Radio Quality', 'Loud and consistent like broadcast.', 0.05, 0, () => [eq({ lowcut: 140, mud: -2, presence: 5, air: 2 }), comp(-26, 7, 8), F('limiter', { ceiling: -1, drive: 2 })]),
  P('Enhance', 'Studio Quality', 'Clean, balanced and controlled.', 0.15, 0.05, () => [eq({ lowcut: 90, mud: -3, presence: 3, air: 3 }), comp(-20, 4, 5), deess(0.5), F('limiter', { ceiling: -1 })]),

  P('Enhance', 'Sparkle', 'Shiny top end that catches the ear.', 0, 0, () => [eq({ lowcut: 90, presence: 1, air: 7 }), deess(0.55)]),
  P('Enhance', 'Fullness', 'Thicker voice with a soft double.', 0, 0, () => [eq({ body: 2.5, mud: -1 }), F('doubler', { width: 0.4, mix: 0.25 })]),
  P('Enhance', 'Tighten', 'Evens out the volume so every word lands.', 0, 0, () => [comp(-24, 5, 6, { attack: 0.004 })]),
  P('Enhance', 'Loudness', 'Louder without clipping.', 0, 0, () => [comp(-22, 4, 5), F('limiter', { ceiling: -1, drive: 4 })]),
  P('Enhance', 'Silky', 'Takes away sharp S sounds and harsh edges.', 0, 0, () => [deess(0.75), eq({ presence: -1.5, hicut: 15000 })]),
  P('Enhance', 'Noise Cleanup', 'Removes hiss and room noise.', 0, 0, () => [F('denoise', { amount: 0.6 })]),
  P('Enhance', 'Wide', 'Spreads the voice across left and right.', 0, 0, () => [F('widen', { amount: 0.55 }), F('doubler', { width: 0.7, mix: 0.2 })]),
  P('Enhance', 'Intimate', 'Close and dry, like whispering in an ear.', 0, 0, () => [eq({ lowcut: 70, body: 2, presence: 1.5, air: 2 }), comp(-26, 4, 6)]),
  P('Enhance', 'Room', 'Puts the voice in a small real room.', 0, 0, () => [F('room', { size: 0.9, tone: 7000, mix: 0.25 })]),
  P('Enhance', 'Echo Tail', 'A soft echo after your words.', 0, 0, () => [F('delay', { time: 0.38, feedback: 0.35, tone: 3500, mix: 0.22 })]),

  P('Enhance', 'Crisp Words', 'Every word cuts through clearly.', 0, 0, () => [eq({ lowcut: 100, mud: -3, presence: 5, air: 2 }), deess(0.5)]),
  P('Enhance', 'Thick Low End', 'More chest and weight.', 0, 0, () => [eq({ lowcut: 55, body: 5, mud: -1 }), sat(0.2)]),
  P('Enhance', 'Breathy Air', 'Soft breathy top like a close whisper.', 0, 0, () => [eq({ lowcut: 110, presence: 1, air: 9 }), comp(-22, 3, 4), deess(0.6)]),
  P('Enhance', 'Vintage Mic', 'Warm old ribbon mic tone.', 0, 0, () => [eq({ lowcut: 90, body: 2, air: -3, hicut: 11000 }), sat(0.45)]),
  P('Enhance', 'Tape Warmth', 'Glued and rounded like analog tape.', 0, 0, () => [sat(0.55), comp(-18, 2.5, 3), eq({ air: -1.5 })]),
  P('Enhance', 'Broadcast Punch', 'Tight and loud like a radio host.', 0, 0, () => [eq({ lowcut: 110, body: 2, presence: 3 }), comp(-28, 7, 8, { attack: 0.002 }), F('limiter', { ceiling: -1, drive: 3 })]),
  P('Enhance', 'Gentle Glue', 'Light squeeze so it sits in the beat.', 0, 0, () => [comp(-16, 2, 2)]),
  P('Enhance', 'Pop Sheen', 'Glossy, bright and expensive sounding.', 0, 0, () => [eq({ lowcut: 100, mud: -2, presence: 2, air: 6 }), comp(-20, 3.5, 4), deess(0.6), F('doubler', { width: 0.4, mix: 0.15 })]),
  P('Enhance', 'Stadium', 'Huge space, like a big arena.', 0, 0, () => [F('room', { size: 5, tone: 7000, mix: 0.35 }), F('delay', { time: 0.5, feedback: 0.25, tone: 3000, mix: 0.12 })]),
  P('Enhance', 'Shimmer Tail', 'A bright sparkly echo behind you.', 0, 0, () => [F('delay', { time: 0.42, feedback: 0.45, tone: 9000, mix: 0.2 }), F('room', { size: 3, tone: 12000, mix: 0.25 })]),
  P('Enhance', 'De-harsh', 'Tames sharp, painful frequencies.', 0, 0, () => [eq({ presence: -3, air: -1 }), deess(0.6)]),
  P('Enhance', 'Lush Chorus', 'Wide, thick and dreamy.', 0, 0, () => [F('chorus', { rate: 0.6, depth: 0.45, mix: 0.3 }), F('widen', { amount: 0.4 })]),

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
  P('Voice FX', 'Megaphone', 'Loud, thin and blown out.', 0, 0, () => [eq({ lowcut: 600, presence: 8, hicut: 4000 }), F('dist', { drive: 0.6, tone: 3500, mix: 0.6 }), comp(-28, 8, 6)]),
  P('Voice FX', 'Walkie-Talkie', 'Crunchy radio with a lo-fi edge.', 0, 0, () => [eq({ lowcut: 500, presence: 6, hicut: 3000 }), F('bitcrush', { bits: 6, tone: 3200, mix: 0.6 }), comp(-28, 8, 8)]),
  P('Voice FX', 'Underwater', 'Muffled and wobbly like under water.', 0.3, 0, () => [eq({ lowcut: 60, body: 4, air: -10, hicut: 900 }), F('vibrato', { rate: 1.2, depth: 0.6 }), F('chorus', { rate: 0.4, depth: 0.8, mix: 0.5 })]),
  P('Voice FX', 'Cave', 'Huge echoey cave.', 0, 0, () => [F('room', { size: 5.5, tone: 4000, mix: 0.55 }), F('delay', { time: 0.45, feedback: 0.4, tone: 2500, mix: 0.25 })]),
  P('Voice FX', 'Ghost', 'Airy, floaty and haunted.', 0, 0, () => [F('pitch', { semis: 2, mix: 0.5 }), eq({ lowcut: 400, air: 6 }), F('vibrato', { rate: 3, depth: 0.3 }), F('room', { size: 4, tone: 9000, mix: 0.5 })]),
  P('Voice FX', 'Demon', 'Dark doubled voice with grit.', 0.2, 0, () => [F('harmony', { v1: -12, v2: -7, mix: 0.7 }), F('dist', { drive: 0.4, tone: 1800, mix: 0.35 }), eq({ body: 4, air: -3 })]),
  P('Voice FX', 'Baby Voice', 'Small and cute.', 0.05, 0, () => [F('pitch', { semis: 7 }), eq({ lowcut: 250, body: -3, presence: 2 })]),
  P('Voice FX', 'Giant', 'Huge and slow, like a giant talking.', 0.25, 0, () => [F('pitch', { semis: -12 }), eq({ body: 5, air: -2 }), F('room', { size: 3, tone: 4000, mix: 0.3 })]),
  P('Voice FX', '8-Bit', 'Crunchy video game voice.', 0, 0, () => [tune(1), F('bitcrush', { bits: 4, tone: 8000, mix: 0.8 })]),
  P('Voice FX', 'Wobble', 'Seasick warble.', 0, 0, () => [F('vibrato', { rate: 6, depth: 0.7 })]),
  P('Voice FX', 'Chopped', 'Fast stutter chop on every word.', 0, 0, () => [F('tremolo', { rate: 8, depth: 1, shape: 1 })]),
  P('Voice FX', 'Wah Voice', 'Funky talking wah sweep.', 0, 0, () => [F('autowah', { rate: 2, freq: 900, depth: 0.8, q: 6, mix: 0.8 })]),
  P('Voice FX', 'Space Station', 'Robotic radio from orbit.', 0, 0, () => [eq({ lowcut: 300, presence: 4, hicut: 6000 }), F('ring', { freq: 120, mix: 0.3 }), F('delay', { time: 0.28, feedback: 0.5, tone: 3000, mix: 0.3 })]),
  P('Voice FX', 'Choir of Me', 'Turns you into a little choir.', 0.4, 0, () => [F('harmony', { v1: -12, v2: 7, mix: 0.45 }), F('doubler', { width: 0.9, mix: 0.5 }), F('room', { size: 3, tone: 8000, mix: 0.3 })]),
  P('Voice FX', 'Villain', 'Deep, dark and menacing.', 0.25, 0, () => [F('pitch', { semis: -5 }), eq({ body: 4, air: -2 }), sat(0.5), F('room', { size: 2.5, tone: 4000, mix: 0.25 })]),
  P('Voice FX', 'Fairy', 'Tiny, sparkly and magic.', 0.3, 0.2, () => [F('pitch', { semis: 9 }), F('chorus', { rate: 2, depth: 0.4, mix: 0.4 }), eq({ air: 6 })]),
  P('Voice FX', 'Intercom', 'Tinny speaker on the wall.', 0, 0, () => [eq({ lowcut: 700, presence: 7, hicut: 3500 }), F('bitcrush', { bits: 8, tone: 3500, mix: 0.4 }), F('room', { size: 0.4, tone: 3000, mix: 0.3 })]),
  P('Voice FX', 'Drive-Thru', 'Crackly order speaker.', 0, 0, () => [eq({ lowcut: 600, presence: 6, hicut: 3000 }), F('dist', { drive: 0.5, tone: 2500, mix: 0.5 }), F('bitcrush', { bits: 7, tone: 3000, mix: 0.3 })]),
  P('Voice FX', 'Haunted House', 'Creepy echoes in an empty hall.', 0, 0, () => [F('pitch', { semis: -3, mix: 0.6 }), F('vibrato', { rate: 2, depth: 0.4 }), F('delay', { time: 0.55, feedback: 0.55, tone: 2000, mix: 0.35 }), F('room', { size: 5, tone: 3500, mix: 0.45 })]),
  P('Voice FX', 'Vaporwave', 'Slowed, hazy and nostalgic.', 0, 0, () => [F('pitch', { semis: -2 }), eq({ air: -4, hicut: 8000 }), F('chorus', { rate: 0.3, depth: 0.6, mix: 0.4 }), F('room', { size: 3.5, tone: 6000, mix: 0.4 })]),
  P('Voice FX', 'Glitch', 'Broken digital stutter.', 0, 0, () => [F('tremolo', { rate: 12, depth: 1, shape: 1 }), F('bitcrush', { bits: 5, tone: 7000, mix: 0.5 })]),
  P('Voice FX', 'Robot Choir', 'A stack of tuned robots.', 0.25, 0, () => [tune(1), F('harmony', { v1: 4, v2: 7, mix: 0.5 }), F('ring', { freq: 90, mix: 0.3 })]),
  P('Voice FX', 'Bubbles', 'Fast gurgly wah.', 0, 0, () => [F('autowah', { rate: 6, freq: 700, depth: 0.9, q: 9, mix: 0.7 })]),
  P('Voice FX', 'Announcer', 'Big echo like a stadium speaker.', 0, 0, () => [eq({ lowcut: 200, presence: 5, hicut: 7000 }), comp(-26, 6, 6), F('delay', { time: 0.3, feedback: 0.4, tone: 3000, mix: 0.3 }), F('room', { size: 4, tone: 5000, mix: 0.3 })]),
  P('Voice FX', 'Insect', 'Buzzy little bug voice.', 0, 0, () => [F('pitch', { semis: 12 }), F('ring', { freq: 260, mix: 0.4 }), F('tremolo', { rate: 14, depth: 0.5, shape: 0 })]),
  P('Voice FX', 'Hologram', 'Shimmering sci-fi transmission.', 0.2, 0.2, () => [tune(1), F('phaser', { rate: 0.8, depth: 0.8, feedback: 0.5, mix: 0.5 }), F('flanger', { rate: 0.2, depth: 0.5, feedback: 0.5, mix: 0.3 })]),
  P('Voice FX', 'Arcade Boss', 'Low crunchy video game villain.', 0, 0, () => [F('pitch', { semis: -7 }), F('bitcrush', { bits: 5, tone: 5000, mix: 0.6 }), F('room', { size: 2, tone: 3000, mix: 0.2 })]),
  P('Voice FX', 'Tunnel', 'Long metal tunnel.', 0, 0, () => [eq({ lowcut: 200, presence: 3 }), F('flanger', { rate: 0.05, depth: 0.3, feedback: 0.7, mix: 0.3 }), F('room', { size: 3, tone: 5000, mix: 0.45 })]),
  P('Voice FX', 'Dub Echo', 'Long dark echoes that keep repeating, like a sound system.', 0.15, 0, () => [eq({ lowcut: 200, presence: 3 }), F('delay', { time: 0.35, feedback: 0.7, tone: 1800, mix: 0.4 }), F('room', { size: 2.5, tone: 3000, mix: 0.2 })]),
  P('Voice FX', 'Sound System', 'Loud, gritty speaker stack at a street party.', 0.1, 0, () => [eq({ lowcut: 180, body: 2, presence: 5, hicut: 9000 }), F('dist', { drive: 0.35, tone: 3500, mix: 0.3 }), comp(-26, 6, 6), F('delay', { time: 0.18, feedback: 0.3, tone: 2500, mix: 0.18 })]),
  P('Voice FX', 'Jungle Chop', 'Fast 16th chop that rides a 170 BPM break.', 0, 0, () => [F('tremolo', { rate: 11.3, depth: 1, shape: 1 }), F('delay', { time: 0.18, feedback: 0.3, tone: 3000, mix: 0.2 })]),
  P('Voice FX', 'Pitched Sample', 'Sped up like an old rave vocal sample.', 0.1, 0, () => [F('pitch', { semis: 5 }), eq({ lowcut: 250, air: -2, hicut: 9000 }), F('bitcrush', { bits: 10, tone: 8000, mix: 0.3 })]),
  P('Voice FX', 'Ethereal', 'Heavenly, floating and far away, for breakcore and ambient.', 0.4, 0.2, () => [F('harmony', { v1: 12, v2: 7, mix: 0.35 }), eq({ lowcut: 250, air: 7 }), F('chorus', { rate: 0.4, depth: 0.5, mix: 0.35 }), F('room', { size: 5.5, tone: 11000, mix: 0.5 })]),
  P('Voice FX', 'Nightcore', 'Sped up, bright and sweet.', 0.2, 0.1, () => [F('pitch', { semis: 4 }), eq({ lowcut: 200, presence: 2, air: 5 }), comp(-20, 4, 5)]),
  P('Voice FX', 'Breakcore Chop', 'Glitchy stutter chop with crunch.', 0, 0, () => [F('tremolo', { rate: 12.6, depth: 1, shape: 1 }), F('bitcrush', { bits: 7, tone: 7000, mix: 0.4 }), F('delay', { time: 0.16, feedback: 0.35, tone: 4000, mix: 0.2 })]),
  P('Voice FX', 'Dark Blue', 'Low, sad and drowned in reverb.', 0.3, 0, () => [F('pitch', { semis: -3 }), eq({ lowcut: 150, air: -4, hicut: 7000 }), F('room', { size: 4.5, tone: 4000, mix: 0.5 }), F('vibrato', { rate: 0.8, depth: 0.25 })]),
  P('Voice FX', 'Frozen Heart', 'Icy shimmer that hangs in the air, breakcore style.', 0.3, 0.15, () => [F('harmony', { v1: 12, v2: 7, mix: 0.3 }), eq({ lowcut: 220, mud: -3, air: 6 }), F('chorus', { rate: 0.3, depth: 0.5, mix: 0.35 }), F('room', { size: 8, tone: 12000, mix: 0.55 })]),
  P('Voice FX', 'Anime Chop', 'Pitched up and chopped like a sampled anime vocal.', 0.2, 0.1, () => [F('pitch', { semis: 5 }), eq({ lowcut: 250, presence: 3, air: 4 }), F('repeat', { slice: 0.08, count: 3, mix: 0.6 })]),
  P('Voice FX', 'Stutter Repeat', 'Grabs a tiny slice and repeats it, like a glitched sample.', 0.1, 0, () => [F('repeat', { slice: 0.06, count: 6, mix: 0.85 })]),
  P('Voice FX', 'Digital Angel', 'Hard tuned, an octave of shine, and huge space.', 0.3, 0.2, () => [tune(1), F('harmony', { v1: 12, v2: 0, mix: 0.4 }), F('bitcrush', { bits: 9, tone: 9000, mix: 0.25 }), F('room', { size: 6, tone: 11000, mix: 0.45 })]),
  P('Voice FX', 'Cassette Memory', 'Warbly, faded, like an old tape you found.', 0.2, 0, () => [eq({ lowcut: 220, air: -4, hicut: 6000 }), sat(0.5), F('vibrato', { rate: 0.6, depth: 0.35 }), F('room', { size: 2.5, tone: 5000, mix: 0.3 })]),
  P('Voice FX', 'Distant Signal', 'A voice far away through a broken radio.', 0, 0, () => [eq({ lowcut: 500, presence: 4, hicut: 4000 }), F('bitcrush', { bits: 8, tone: 4000, mix: 0.3 }), F('delay', { time: 0.45, feedback: 0.55, tone: 2200, mix: 0.3 }), F('room', { size: 5, tone: 3500, mix: 0.4 })]),
  P('Voice FX', 'Pump', 'Breathes in and out with the beat, like sidechain.', 0, 0, () => [F('tremolo', { rate: 2.9, depth: 0.8, shape: 0.2 })]),
  P('Voice FX', 'Glitch Angel', 'Sweet high voice that keeps breaking apart.', 0.25, 0.1, () => [F('pitch', { semis: 7, mix: 0.6 }), F('repeat', { slice: 0.045, count: 5, mix: 0.6 }), F('bitcrush', { bits: 7, tone: 8000, mix: 0.3 }), F('room', { size: 4, tone: 10000, mix: 0.35 })]),
  P('Voice FX', 'Whisper Haze', 'Soft breathy whisper lost in fog.', 0.4, 0.1, () => [eq({ lowcut: 450, mud: -5, air: 8 }), comp(-28, 6, 6), F('chorus', { rate: 0.4, depth: 0.6, mix: 0.4 }), F('room', { size: 5, tone: 9000, mix: 0.5 })]),
  P('Voice FX', 'Crystal', 'Glassy high octave with bright echoes.', 0.3, 0.2, () => [F('pitch', { semis: 12, mix: 0.4 }), eq({ lowcut: 300, air: 8 }), F('delay', { time: 0.3, feedback: 0.45, tone: 10000, mix: 0.25 }), F('room', { size: 4, tone: 13000, mix: 0.35 })]),
  P('Voice FX', 'Sad Robot', 'Tuned, a bit lower, cold and lonely.', 0.3, 0.1, () => [tune(1), F('pitch', { semis: -2 }), eq({ air: -3, hicut: 8000 }), F('room', { size: 4, tone: 5000, mix: 0.4 })]),
  P('Voice FX', 'Hyper Bright', 'Sped up, squeezed and sparkly.', 0.15, 0.1, () => [F('pitch', { semis: 4 }), comp(-26, 6, 2), sat(0.3), eq({ lowcut: 200, presence: 2, air: 5 }), F('limiter', { ceiling: -1 })]),
];
export const CATS = ['Vocal', 'Enhance', 'Voice FX'];

// Moods: quick filters inside Enhance and Voice FX
export const MOODS = {
  Enhance: ['Clear', 'Warm', 'Loud', 'Space'],
  'Voice FX': ['Breakcore', 'Fun', 'Scary', 'Robot', 'Retro', 'Places', 'Dreamy'],
};
const MOOD_OF = {
  Clarity: 'Clear', Brightness: 'Clear', Presence: 'Clear', Sparkle: 'Clear', Silky: 'Clear', 'Noise Cleanup': 'Clear', 'Crisp Words': 'Clear', 'Breathy Air': 'Clear', 'De-harsh': 'Clear', Smooth: 'Clear',
  Warmth: 'Warm', Depth: 'Warm', Fullness: 'Warm', Intimate: 'Warm', 'Thick Low End': 'Warm', 'Vintage Mic': 'Warm', 'Tape Warmth': 'Warm',
  'Radio Quality': 'Loud', 'Studio Quality': 'Loud', Tighten: 'Loud', Loudness: 'Loud', 'Broadcast Punch': 'Loud', 'Gentle Glue': 'Loud', 'Pop Sheen': 'Loud',
  Wide: 'Space', Room: 'Space', 'Echo Tail': 'Space', Stadium: 'Space', 'Shimmer Tail': 'Space', 'Lush Chorus': 'Space',
  'High-Pitched Voice': 'Fun', 'Chipmunk Voice': 'Fun', 'Baby Voice': 'Fun', Wobble: 'Fun', 'Wah Voice': 'Fun', Fairy: 'Fun', Bubbles: 'Fun', Insect: 'Fun', Chopped: 'Fun',
  'Deep Voice': 'Scary', 'Monster Voice': 'Scary', Demon: 'Scary', Ghost: 'Scary', Giant: 'Scary', Villain: 'Scary', 'Haunted House': 'Scary',
  'Robotic Voice': 'Robot', 'Alien Voice': 'Robot', 'Futuristic Voice': 'Robot', '8-Bit': 'Robot', 'Space Station': 'Robot', 'Robot Choir': 'Robot', Hologram: 'Robot', Glitch: 'Robot', 'Arcade Boss': 'Robot',
  'Telephone Voice': 'Retro', 'Radio Voice FX': 'Retro', 'Vintage Voice': 'Retro', Megaphone: 'Retro', 'Walkie-Talkie': 'Retro', Intercom: 'Retro', 'Drive-Thru': 'Retro', 'Distorted Voice': 'Retro',
  'Echo Voice': 'Places', 'Dub Echo': 'Places', 'Sound System': 'Places', 'Jungle Chop': 'Fun', 'Pitched Sample': 'Retro', Cave: 'Places', Underwater: 'Places', Announcer: 'Places', Tunnel: 'Places', Whisper: 'Places',
  'Dreamy Voice': 'Dreamy', 'Frozen Heart': 'Breakcore', 'Anime Chop': 'Breakcore', 'Stutter Repeat': 'Breakcore', 'Digital Angel': 'Breakcore', 'Cassette Memory': 'Breakcore', 'Distant Signal': 'Breakcore', Pump: 'Breakcore', 'Glitch Angel': 'Breakcore', 'Whisper Haze': 'Breakcore', Crystal: 'Breakcore', 'Sad Robot': 'Breakcore', 'Hyper Bright': 'Breakcore', 'Breakcore Chop': 'Breakcore', Ethereal: 'Breakcore', 'Dark Blue': 'Breakcore', Nightcore: 'Breakcore',  'Choir of Me': 'Dreamy', Vaporwave: 'Dreamy',
};
export const moodOf = p => MOOD_OF[p.name] || '';

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
  const p = { id: 'm:' + uid(), name, folder: folder || 'My presets', fx: JSON.parse(JSON.stringify(fx)).map(f => { delete f.layer; return f; }), rev, dly, created: Date.now() };
  mine.push(p); saveMine(); return p;
}
export const folders = () => [...new Set(mine.map(p => p.folder))].sort();

// Fresh copy of a preset's chain with new ids
export function presetFx(p) {
  const fx = p.chain ? p.chain() : JSON.parse(JSON.stringify(p.fx));
  for (const f of fx) { f.id = uid(); delete f.layer; }
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
