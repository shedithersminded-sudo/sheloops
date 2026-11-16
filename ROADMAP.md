# SHELOOPS roadmap

My full spec, split into stages. Each stage ships working features only. No fake buttons.
"Needs" lists extra technology a feature depends on.

## Stage 1: Recording studio + foundation (done 2026-11-15)
- Home dashboard, top menu, Simple and Advanced mode
- Project library: new, open, rename, duplicate, save version, delete, recent, autosave, cover picture per song
- Recording studio: song timeline, multiple vocal tracks, one-button record, count-in, metronome, recording timer
- Drag and drop my own beat files (MP3, WAV, etc.) onto the studio to sing over them
- Takes: every recording is kept, swap takes any time
- Punch in and out, loop range
- Edit: select, move, trim, split, cut, copy, paste, delete, undo, redo, snap to beat
- Input gain, mono or stereo recording, live monitoring through headphones
- Noise reduction (browser's built-in) and a noise gate per track
- Waveforms, input meter with clipping warning, master meter
- Mixer basics per track: volume, pan, reverb, delay, mute, solo
- Mic setup wizard: pick mic and output, level check, clipping check, background noise check, headphone test, latency info, test recording
- Help button on every control, Learn page with lessons
- Beat maker (from phase 1) plays under the song, with genre starters and key/scale help
- Export full song as WAV, export each track as its own WAV

## Stage 2: Vocal presets and effects (done 2026-11-15, except formant shift)
- Real effect chain per track: EQ, compressor, de-esser, saturation, distortion, chorus, doubler, flanger, phaser, stereo widener, limiter
- Pitch correction / Auto-Tune (AudioWorklet pitch detect + shift, key and scale aware), harmonizer, formant shift
- Vocal preset library (R&B, Rap, Trap, Melodic Rap, Pop, Soul, Gospel, Airy, Deep, Radio, Studio, Natural, Light/Heavy Auto-Tune, Harmonies, Background, Ad-libs)
- Voice effects (deep, high, robot, telephone, whisper, alien, chipmunk, monster, vintage, dreamy, futuristic, etc.)
- Save, name and folder my own presets. A/B button
- BUILD MY SOUND: pick a vibe, get a chain, preview before applying
- Drag and drop effects onto tracks

## Stage 3: Beat studio upgrade (done 2026-11-15; loop time-stretch still open)
- Pattern arrangement in the song (different beat sections)
- Sampler: load my own sounds, more drum kits, piano and guitar sounds
- Sound library built from sounds and loops I upload, with favorites and folders
- MIDI keyboard input (Web MIDI), velocity, virtual keyboard on screen
- More genre starters (Drill, Afrobeats, etc. with bass and chords)

## Stage 4: Mixing and mastering studios (done 2026-11-15, MP3 added 2026-11-16)
- Visual mixing console view, groups, automation lanes, routing to buses
- Mastering assistant with styles (Warm, Clean, Loud, Smooth, Bright, Deep, Streaming), loudness meter (LUFS), before/after
- MP3 export with cover art in the tags. Needs: an MP3 encoder library (lamejs, bundled locally)

## Stage 5: Fix My Voice + signature sound (done 2026-11-16, except vocal isolation)
- Analyze a take: noise, low level, clipping, harshness, mud, too much bass or highs, uneven volume, pitch issues. Apply fixes one by one, never destructive
- My Signature Sound profile and personal sound collection with folders
- Better noise removal and vocal isolation. Needs: a spectral noise reducer in a worklet, and an ML model (for example a separation model run with ONNX in the browser) for isolation

## Stage 6: My studio appearance (done 2026-11-16)
- Theme editor (all colors), ready themes (Midnight Studio, Purple Dream, Pink Paradise, Neon Cyber, Black Diamond, Ocean Blue, Sunset, Luxury Gold, Rose Gold, Minimalist), save/rename/duplicate themes
- Backgrounds: solid, gradient, my own uploaded pictures (no AI pictures)
- Custom cursor: designs, colors, size, glow, trail, click animation, uploaded image, reset. Never over record or edit controls
- Layout: move, resize, hide panels, save workspaces
- Save my whole studio setup

## Stage 7: My Cover Art + CD design studio (done 2026-11-16)
- Cover editor: layers, text, fonts, stickers, filters, crop, undo/redo, templates
- CD package: front, back with track list, disc label, booklet, case styles
- Disc looks (silver, gold, holographic, transparent, etc.) and conditions (scratched, cracked, dusty, faded) with strength sliders
- Design collections (90s R&B, Y2K, Underground Mixtape, etc.)
- Export PNG/JPG, print-ready layouts with sizes
- Artwork comes only from pictures I upload (no AI art, no built-in stock art)

## Stage 8: AI helpers (AI helper skipped; installable app + update notices done 2026-11-16)
- AI assistant that answers questions in the app ("how do I sound smoother?"). Needs: a Claude API key and a small local server so the key stays private
- Guided tour mode across the whole app

## Desktop
- Wrap as a desktop app (Tauri or Electron) for lower latency, real buffer size control and file system projects
