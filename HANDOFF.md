# SHELOOPS handoff

(Called LOOPDEN before 2026-11-16. Browser storage keys still use `loopden` on purpose so nothing is lost.)

My own music studio. Browser app, Web Audio only, no libraries, no build step.
Full feature plan by stage: `ROADMAP.md`. I'm a beginner, so every control has a ? help button.
Rules: no fake buttons. Artwork and backgrounds only from my own uploads (no AI art). I mostly sing over my own beat files.

## Run it
- Double-click `start.bat`, or run `python devserver.py 8780` and open http://localhost:8780 in Chrome
- The mic needs localhost or https, so don't open index.html as a file
- Launch config name in `C:\CODE\.claude\launch.json`: `sheloops`

## Files
- `index.html`, `style.css`
- `js/main.js` nav, views, keyboard shortcuts, meters, boot (also migrates the old phase 1 loop)
- `js/state.js` project model, starters, undo/redo, autosave
- `js/store.js` IndexedDB (projects, audio) and settings
- `js/engine.js` audio graph, noise gate + capture worklets, drums and synths, transport, recording, export
- `js/studio.js` recording studio timeline, clips, takes, drag and drop beat files
- `js/beat.js` beat maker (drum grid, piano roll, genre starters, key/scale)
- `js/pages.js` home, projects, mic setup wizard, learn
- `js/help.js` help texts and lessons
- `js/fx.js` effect definitions, Web Audio builders, pitch/Auto-Tune worklet source
- `js/presets.js` built-in presets, Build My Sound, my presets storage
- `js/fxui.js` Effects, Vocal presets and Build my sound tabs, preview and A/B
- `js/library.js` My sounds page, sound import, BPM detection
- `js/mixer.js` mixer view and groups
- `js/master.js` mastering view, auto master
- `js/mp3.js` MP3 encoding + ID3 tag (needs vendor/lame.min.js)
- `js/fixvoice.js` Fix my voice analysis and fixes
- `js/profile.js` My sound page
- `js/look.js` themes, backgrounds, cursor, layout engine
- `js/appearance.js` Appearance page
- `js/art.js`, `js/artcollections.js`, `js/artui.js` cover art + CD designer
- `js/player.js` music player
- `js/mockup.js` flat CD case / MiniDisc cover mockups
- `js/viewer3d.js` three.js 3D studio
- `vendor/three/` three.js 0.160.0 + OrbitControls, RoomEnvironment, GLTFExporter (+ utils/TextureUtils), Reflector (unused now)

## Stage 1: done (2026-11-15)
- Home dashboard, Simple/Advanced mode, help drawer on every control, Learn page with 7 lessons and a glossary
- Projects: new, new from my beat, open, rename, artist, cover picture (my upload, original kept), duplicate, save version, delete, recent, autosave
- Studio: drag and drop beat files (or Add my beat file), multiple vocal tracks, one button Record (R), count in, metronome, recording timer
- Takes kept for every recording, swap with Use. Punch in/out and loop range (drag the strip under the ruler)
- Edit: move, trim edges, split (S), cut/copy/paste, delete, undo/redo, snap, zoom
- Input meter with clip light, monitoring through headphones, input gain, mono/stereo, browser noise reduction, noise gate per track
- Mixer basics: volume, pan, reverb, delay, mute, solo per track. Master volume, reverb size, delay time and repeats
- Beat maker plays under the song (auto muted when I add a beat file). Genre starters: R&B, Hip-Hop, Trap, Drill, Pop, Soul, Gospel, Afrobeats, Lo-fi. Key/scale highlight
- Mic setup wizard: allow mic, pick input/output, level check, noise check, headphone L/R test, latency and sample rate, 5 second test recording
- Export song WAV, export each track as WAV

Tested in the browser with a fake mic (test tone): recording, count in, punch in, split, copy, paste, undo, beat file import, reload keeps everything, song export.
Not tested yet: a real mic, real headphones monitoring, by ear.

## Stage 2: done (2026-11-15)
- Effect chain on every track (`js/fx.js`): Auto-Tune, pitch shift, harmonizer, EQ, compressor, de-esser, limiter, saturation, distortion, robot ring mod, chorus, doubler, flanger, phaser, stereo widener
- Auto-Tune and pitch shift run in an AudioWorklet (YIN pitch detection + granular shifter). Follows the song key/scale from the Beat tab, or a key I pick. Retune speed from natural to robotic
- 42 built-in presets (`js/presets.js`): 20 vocal styles, 8 enhancement, 14 voice effects
- My presets: save, rename, folders, copy, delete, favorites (stored in localStorage)
- Preview any preset on my take, then Keep or Cancel. A/B button for effects vs original
- Build my sound: 10 vibes + my signature sound, 4 sliders (Auto-Tune, Space, Brightness, Warmth), preview, apply, save
- Drag effects from the library onto any track
- Studio inspector tabs: Mix & takes, Effects, Vocal presets, Build my sound. Home tiles for presets and Build my sound
- Help for every effect, 2 new lessons (Auto-Tune, signature sound)

Tested offline: Auto-Tune pulls 450 Hz to 439.7 Hz (target 440), +12 semitones gives 896 Hz (target 900), every effect and preset renders, preview/cancel/apply.
Not tested yet: by ear on a real voice, and CPU use with many Auto-Tune tracks.

## Stage 3: done (2026-11-15)
- My sounds page (`js/library.js`): upload or drop files, one-shot vs loop by length, BPM detected for loops, folders, favorites, search, rename, delete. Stored in IndexedDB store `sounds` (same id as the audio)
- BPM detection (onset envelope + autocorrelation). Adding a beat file sets the song BPM if there are no vocals yet
- Studio: Add from my sounds (picker) and drag sounds from the library onto tracks. Beat row shows the song arrangement, click to change patterns
- Beat maker:
  - Patterns A to H (pattern A stays in the old fields, others live in `track.pats`), new/copy/delete, song arrangement (`beat.arr`, one slot per pattern length, '' is silence)
  - Drum rows can use my sounds, row volume, add/remove rows, save/load kits (localStorage `loopden.kits`)
  - Instruments: synth presets plus piano (additive), guitar (Karplus-Strong) and "my sound" sampler with a root note
  - Note velocity, on-screen keyboard, computer keys with key up, Rec notes (quantized to 16ths), Web MIDI with velocity and drum pads from note 36
  - Genre starters now load drums, chords and bass in the song key
- Help entries and 2 new lessons

Tested: all 9 starters render, arrangement silence works, piano/guitar/sampler pitch at A4 = 441 Hz (measurement step), BPM detection = 100 on a 100 BPM test loop, sound import, kits, pattern copy, every page renders.
Not tested: a real MIDI keyboard, by ear.

## Stage 4: done (2026-11-15)
- Mixer view (`js/mixer.js`): vertical strips for every track, beat maker (and its parts), groups and master. Faders, live meters, pan, sends, mute/solo, color legend by type, routing (Out) to groups
- Groups (`P.buses`): own fader, sends and effect chain; track sends scale with the group so a muted group is silent
- Volume automation (`track.auto` points) drawn on the studio timeline (Advanced mode, Automation toggle), scheduled per playback segment and in exports
- Master chain in the engine: low cut, bass, vocal clarity, air, harshness control, glue, warmth, M/S width, loudness, and a lookahead worklet limiter (exact ceiling)
- Mastering view (`js/master.js`): 7 styles, Auto master (renders the mix once, analyzes loudness/bass/top/width, then searches loudness on the master chain only), report in plain words, Before/After with loudness match, live LUFS, measure final loudness, export mastered WAV
- MP3 export (`js/mp3.js`, 256 kbps, ID3 tag with title, artist, cover art) using `vendor/lame.min.js` (lamejs 1.2.1 from cdnjs, downloaded 2026-11-16 with the user's OK, sha256 15d285e2...). Tested: encodes, decodes back, tags present
- Help for every mixer/master control, 2 new lessons

Tested: LUFS meter reads -20.2 on a -20 LUFS test tone, auto master hits -14.2 (target -14) and -8.6 (target -9) in about 7 s for a 25 s song, peak held at -1.0 dB, automation silences where drawn, groups mute fully.
Not tested: by ear on real songs, long songs (auto master time grows with song length).

## Stage 5: done (2026-11-16)
- Fix my voice (`js/fixvoice.js`, studio inspector tab): analyzes a track's clips for clipping, low level, background noise, too much bass, mud, harshness, sharp S, dull or too bright, uneven volume, and pitch against the song key (YIN). Each finding has a fix (clip volume, noise remover with a learned profile + gate, EQ, de-esser, compressor, light Auto-Tune). Fix everything, A/B, undo. Never edits the audio
- Noise remover effect (`denoise` in `js/fx.js`): STFT spectral subtraction worklet (1024 FFT, hop 256), learned profile via processorOptions or adaptive noise tracking, floor down to -30 dB
- My sound page (`js/profile.js`): default vocal chain for new vocal tracks, default beat style and mastering style for new songs, compare up to 4 presets on a take (A to D while playing), collection counts, studio file backup and restore (settings, presets, favorites, kits)
- Mastering styles moved to `js/presets.js` (shared with new-song defaults)

Tested: on a synthetic quiet, noisy, +39 cent off-pitch take it found clipping, quiet, noise and pitch (measured 39 cents). Noise remover alone +16 dB signal-to-noise, gate +16 dB, together +25 dB, gaps silent after the gate closes. Default vocal chain applies to new tracks. Compare switches and restores.
Not tested: real voices in real rooms (thresholds for mud/harsh/bright are estimates).

## Stage 6: done (2026-11-16)
- `js/look.js` + `js/appearance.js` (Appearance tab). Stored in localStorage `loopden.look`; the background picture is in IndexedDB `audio` under `look-bg` (cleanup skips `look-*` keys)
- 10 themes (Midnight Studio, Purple Dream, Pink Paradise, Neon Cyber, Black Diamond, Ocean Blue, Sunset, Luxury Gold, Rose Gold, Minimalist light). Themes set CSS variables; `derive()` builds a full theme from background, accent and text. Copy, rename, delete my themes, edit every color, track color palette, waveform color
- The stylesheet now uses theme variables everywhere; canvases read them through `cssVar()` (cached, reset on theme change)
- Backgrounds: theme, solid, gradient, animated (aurora, glow, equalizer bars, CSS only), my uploaded picture with blur. Darken and see-through panels
- Cursor: dot, ring, crosshair, arrow, star, heart, music note, my picture; color, size, glow; pulse/spin halo, trails, click effects on a pointer-events:none overlay; normal cursor in editors by default; reset
- Layout: settings panel bottom or right, drag to resize, hide edit bar / master bar, compact, reorder and hide recording toolbar buttons. Workspaces: Beginner, Pro, and my own
- Studio file backup now includes the whole look and the background picture

Tested: all themes apply, light theme sets the light class, all cursor designs render, overlay never takes clicks, all background types, right-side panel, hidden toolbar items.

## Stage 7: done (2026-11-16)
- `js/art.js` render engine and storage (IndexedDB v4 stores `art` for uploaded pictures, `designs` for designs/templates). Faces at 300 dpi: front 1417 px (120 mm), back 1772x1394 (150x118 mm with spines), disc 1394 (118 mm, 15 mm hole), booklet 1417
- Layers: my picture (crop zoom/move, filters, round/circle, shadow), text (16 Google fonts + system fonts, outline, shadow/glow, letter spacing, curved text for discs), shapes, 14 drawn stickers (parental advisory, barcode, NEW, limited edition...), track list
- Disc: 15 materials (silver, gold, holographic, transparent, frosted...), 13 condition presets + 9 sliders (scratches, cracks, chips/broken, wear, dirt, dust, fade, age, shine), seeded random damage, clear or colored hub. Visual only
- `js/artcollections.js`: 14 collections that build a full package (front, back with track list, barcode and spines, disc, booklet, case style) with an empty frame for my picture
- `js/artui.js`: gallery (collections, my designs, templates, my pictures with favorites), editor (drag, resize, rotate, snap to center, layers with order/hide/lock, undo/redo, keyboard nudge/delete/duplicate, preview mode, autosave), package preview with 10 case styles, export (3000 px cover, 1000 px, front/back/booklet with 3 mm bleed, disc PNG with transparent hole, A4 print sheet with crop marks, everything), Use as song cover (1000 px JPEG into the project, shown in projects, menu, player, MP3 tags)
- `js/player.js`: simple music player with covers. Menu now has a More dropdown
- Cover mockup tab (`js/mockup.js`, from the user's Pinterest playlist-cover and MiniDisc references): flat photo-style renders of a CD in a clear square case, a see-through colored MiniDisc (shell color/strength, shutter, insert arrow, shell text, rainbow streaks) or the disc alone. Background color or see-through. Export PNG/JPG/WebP at 640 to 4000 px, or use as song cover
- 3D studio tab (`js/viewer3d.js`, three.js 0.160.0 in `vendor/three`, MIT, loaded through an import map in index.html): CD in clear case (lid opens on a hinge), CD alone, MiniDisc. Orbit all the way around, quick views, turn/tip buttons, spin, light, background. Glass and tinted plastic use transmission. The disc label is rendered "printed only" (`faceCanvas(..., { labelOnly: true })`) with alphaTest so blank areas show the real metal/rainbow disc below and it stays visible through glass. Floor reflection is a live mirrored copy (three's Reflector breaks transmission). Exports: PNG/JPG/WebP up to 4000 px (see-through option), spinning video MP4/WebM (MediaRecorder), GLB 3D model
- New: MD label face (MiniDisc shutter label), pattern layers (15 drawn patterns: dots, stars, sparkles, sun rays, swirl, lace, hearts, stripes, checker, plaid, leopard, zebra, bubbles, flames, rings), sticker border on pictures
- More 3D objects: colored slim case (lid opens), slim case set (5 colors fanned), spindle stack (disc count, clear dome, dye-striped edge), CD wallet with sleeves, pile of loose discs. Disc back color (dye): silver, green CD-R, gold, blue, purple DVD-R. Flat mockup "Colored slim case". MiniDisc: disc color inside (silver, magenta, red, blue, gold, green, black) and a fully clear shell. "Add blank CD-R look" (generic text and writing lines, no brands)
- Now playing CD player (`js/nowplaying.js`, from the user's see-through portable player photo, no brand names): floating see-through player drawn on a canvas with the song's cover design disc (or any chosen design) spinning while anything plays (transport or sound previews). Working play/stop and back buttons, LCD with time and scrolling song name. Customize from its gear or Appearance: show while playing / always / never, color + presets, see-through, size, lid text, glitter window, which disc, drag to move. Saved in `look.player`. Drag anywhere to move (position saved, kept on screen on resize). The – button closes it to a small spinning disc bubble; click the bubble to open it again. The OPEN button lifts the lid and opens the disc/settings panel (beside the player)
- Fixes in this round: look.player helper now fills defaults in place (a fresh copy each call made dragging do nothing); the main frame loop now schedules first and isolates each step (one error used to stop every meter for good); a saved custom cursor picture crashed startup (the image element was saved as {}), now never saved and startup survives appearance errors; `sheen` scope bug in drawDisc
- Fonts are local now (2026-11-16): `vendor/fonts/` has 34 woff2 files (675 KB, SIL OFL, from Fontsource on jsdelivr) + `fonts.css`; no Google Fonts requests, so fonts work in every browser (Brave shields), offline and in the installed app. devserver serves .woff2
- Font + logo (2026-11-16): the whole UI now uses Fredoka through `--font`; numbers and times use `--mono`. Font picker in Appearance (Fredoka, Baloo 2, Nunito, Quicksand, Comfortaa, Space Grotesk, original Cascadia Mono). "My logo": the user uploads their own art; stored untouched in IndexedDB `audio` under `look-logo`, shown in the top bar (size, shape, keep name), on Home and as the tab icon; included in the studio backup file. The owner's own art must NOT be copied into this repo because it is public: it must never be downloadable or exportable by others
- Gotchas: transmission only shows opaque objects behind glass (keep labels alphaTest, not transparent); CSS box-reflect flattens 3D
- 3D package preview (added after the user asked for a realistic CD): CSS 3D disc with real thickness, label side + shiny data side, rainbow sheen that moves with the angle, moving highlight, data rings; jewel cases as 3D boxes with glass glare and thick edges per case style; floor reflections are mirrored live copies (CSS box-reflect flattens 3D, so it is not used); mouse tilt, drag to turn, gentle idle motion, spin, close-up views

Tested: all 14 collections render all 4 sides (56 renders in 0.6 s), export sizes correct, disc hole transparent, conditions and materials render, editor select/props, package preview, use as cover on a temp song.
Not tested: printing on real paper.

## Known limits
- The top menu wraps to two lines on narrow windows
- Fix my voice tone thresholds are rough estimates and may need tuning with real takes
- Vocal isolation (pulling a voice out of a finished song) needs an ML model and is not built
- Built-in compressors (track Compressor effect, Glue) use the browser compressor, which adds its own automatic gain
- Automation is volume only (no pan or effect automation yet)
- Loops from My sounds are not time-stretched to the song BPM
- All patterns share the same length (Bars)
- Kits and presets live in this browser only
- Formant shifting is not built (needs a better pitch algorithm, for example PSOLA or a phase vocoder). Pitch shift moves formants too, so big shifts sound cartoonish
- Auto-Tune adds about 20 to 40 ms of delay, so monitoring through it feels slightly late
- Presets live in this browser only (localStorage)
- BPM is not detected from a beat file. Set it by hand so the grid and metronome line up
- Changing BPM does not stretch recorded audio
- Clips move left/right only, not between tracks
- No project backup file yet (everything lives in this browser's storage)
- Latency is lined up using the browser's own estimate

## Updates and the installable app (2026-11-16)
- `version.json` holds the version, date, GitHub repo (`shedithersminded-sudo/sheloops`), "What's new" notes and history
- **To publish an update:** `python release.py 1.1.0 "what you added" "what you fixed"`, then commit and push. It bumps version.json and `VERSION` in sw.js
- `js/update.js` reads version.json on start, every 30 minutes and when the tab comes back. If the files on the server got newer while the app was open, a bar says "New version X is ready" with What's new and Update now (reload). Copies running from a downloaded folder (localhost) also compare with GitHub's raw version.json and show "How to update" (download ZIP or git pull, keep localhost:8780 so songs stay)
- Installable app (instead of Electron/Tauri, which need big toolchains): `manifest.webmanifest`, `icons/` (generated CD icon), `sw.js` (network first, saved copy offline, never caches version.json). Install as an app from Home (Chrome/Edge install prompt) gives its own window, Start menu/taskbar icon, offline
- Home "Coming in later stages" box replaced with "Updates & app" (version, check, what's new, install)
- 3D case preview: clear cases show the art through the back, Front view button, objects stay on one row and shrink to fit (no overlapping reflections)

## Guitar loops, new instruments, intro, Simple mode (2026-11-16)
- `js/instruments.js`: all synthesized. Guitars via Karplus-Strong (`playString`): acoustic, nylon, clean electric, overdrive, muted, 12-string, bass guitar, banjo, harp, koto, sitar. Others (`playExtra`): kalimba, marimba, vibraphone, bells, music box, steel drum, pan flute, flute, talking drum, choir, brass, organ, electric piano, 808 bass, reese bass, theremin. Percussion (`playPerc`): conga, bongo, shaker, cowbell, tambourine, triangle, woodblock, snap, timbale, guiro
- Beat Instrument menu is grouped (optgroups in `beat.js` GROUPS). Old 'guitar' preset kept for saved songs. `+ Percussion` adds a drum track with the 10 percussion rows
- `js/guitar.js` Guitar loop maker: 16 styles (one char per 16th: D/U strums, T stab, x scratch, P chug, B/b bass, 0-5 pick), 10 progressions from the beat key+scale, human feel, Surprise me, Save as loop in My sounds (folder "Guitar loops", tail wraps to loop). Notes carry `off` (seconds) for strum spread; `scheduleBeatStep` adds it
- `js/intro.js` studio intro (about 3.5 s, click/key skips, reduced-motion aware). `#intro-cover` in index.html stops the app flashing first. Toggle + Play it now in Appearance > My logo. Setting: `look.intro.on`
- Simple mode now really differs: Simple/Advanced switch, Mixer + Player go into More, hides Count in, Punch, Monitor, Automation, range strip, Effects and Build my sound tabs, MIDI, Rec notes, kits (plus the old `.adv` items)

## 1.1.0 (2026-11-17): export, play modes, more sounds, new look
- `js/exporter.js` Export window (top bar button + Projects): whole song, beat only, vocals only, each track (WAV or MP3, user names the file), song project file and Everything backup (`.sheloops` = JSON with audio as data URLs), Open a .sheloops file (`importData`, never replaces: existing ids come in as copies). `profile.js` now exports `studioData` / `applyStudioData`
- Instruments: recipe tables in `instruments.js` (`HELD` bowed/reeds/brass/breath/drones, `STRUCK` modal, more `GUITARS` strings). 71 presets, grouped in beat.js GROUPS (Orchestra, Japanese, World, Fun and electronic...). Percussion: 38 sounds, `PERC_KITS` (Latin, Japanese, World, Orchestra, FX) picked from + Percussion
- Play panel under the piano roll: Piano keys (key labels on keys) or Guitar (7 chord pads from the key, 6-string fretboard, drag to strum). Drums get big pads with keys and Rec hits. `liveNote` in engine.js holds a note until key up. Keys: piano A-K + Z/X, guitar 1-7 (Shift up strum) + Q-Y strings, pads A-K and Q-I
- `js/keyguide.js` Keys guide (press ? anywhere, or the button): keyboard picture per mode plus lists
- New look ("skin" block at the end of style.css): Monoton neon name, Righteous headings, Comfortaa body (look.skinV 2 migrates Fredoka users once), sharp corners with corner brackets, numbered tiles with scan sweep, scanline overlay, Home ticker (`ticker()` in pages.js)
- Intro rewritten: SHELOOPS written around a turning ring (SVG textPath), inner counter ring, neon flicker name, dither dots

## Next: upload to GitHub
Stage 8 (AI helper, tour, desktop app) was skipped by the user on 2026-11-16 ("dont need that really"). Next step is the public GitHub upload: code only, no personal files, .gitignore and a README that says all songs, sounds and art stay in each person's own browser.

## 1.2.0 sound stack, knobs, beat effects
- Presets layer: fx made by a preset carry `f.layer` = preset id; `t.layers` lists active presets, `t.layerBase` keeps rev/dly from before. One Vocal at a time, others stack. Logic in fxui.js `layered()`, panel `stackPanel()`.
- `knob(..., cls)` with `dial` in cls draws a rotary knob (util.js `dial()`): drag, wheel, arrows, double-click resets.
- Beat tracks now have fx chains (engine nodeFor, syncFx for beat tracks). UI: beat.js `fxDrawer()` uses fxui `beatFxPanel()`. `BEAT_FX` in fx.js.
- New fx types: bitcrush, autowah, tremolo, vibrato, delay, room. Tune has `shift`.
- Fonts: headings Bungee, labels Bebas Neue (both already vendored), body still the chosen font.

## 1.3.0 explanations, moods, genres, glow, visualizer
- Simple mode: `.explain` blocks are hidden unless body.simple. studio.js TAB_EXPLAIN, fxui steps(), fxCard shows HELP what/how/start.
- presets.js MOODS + moodOf (MOOD_OF by preset name). fxui: mood row, Surprise me, eqBars on active items.
- Genres: STARTERS Jungle, Drum & Bass, Breakcore, Heavenly Breakcore. PERC adds breaksnare, ghost, airhorn, siren, rewind (kit Jungle). fxui BEAT_RECIPES = Quick sounds. BPM max 300.
- look.glow {on,color,amount,style,text} -> applyGlow() sets html.tglow and --tgc/--tga, can override --text.
- Cursor: trails comet/rainbow/notes/bubbles, trailLen, particle clicks (notes, confetti, shockwave, stars), spot, halo orbit/breathe.
- nowplaying.js: view 'cd' | 'viz', vizOn, vizStyle ring/bars/mirror/wave/dots, vizColor, rainbow, vizGlow, vizSens, vizBars. Reads E.g.analyser.

## 1.4.0 pad machine, house, welcome guide
- js/pads.js: PADS (localStorage loopden.pads) banks A-D x16, loops per bank. Pad kinds drum/note/sample/voice/empty. Per-pad fx chains (chainFor). Voice recordings go to My sounds folder "Pad recordings". renderLoop bakes effects; loopToBeat makes drum + synth tracks. Keys 1234 qwer asdf zxcv, Space loop.
- fx: filter (mode/cutoff/res/rate/depth), dust (crackle/hiss/tone). Starters support `stab` rhythm strings for chord hits.
- Home welcome() in pages.js: theme swatches, glow toggle, Simple/Advanced cards (emit 'modechange'), style buttons -> createSong(false, style).

## 1.5 to 1.7: drum variations, loop slots, DJ booth
- instruments.js VARIANTS (84 synth drum recipes, V.kick/snare/clap/hat/b808/tom/perc/swell/impact), merged into PERC/PERC_NAMES, drumMenu() groups. PERC_KITS genre kits.
- pads.js: PADS.slots[bank] = [{id,name,hits}], PADS.slot[bank]; Safe record copies the slot and shows a take bar; Play all in order (PADS.chain); recordVoiceLoop() uses engine captureMic(from,to) for in-time voice loops; PADS.skin looks.
- nowplaying.js VIZ_STYLES (10) + hover picker (.np-quick).
- js/dj.js: deck AudioWorklet 'sheloops-deck' (variable/negative rate for scratching, loops), channel EQ/filter/fx, crossfader, TRANSITIONS, light stage canvas, crate, mix recorder (cap worklet), DJ settings in localStorage loopden.dj.
