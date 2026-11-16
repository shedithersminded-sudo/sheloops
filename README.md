# SHELOOPS

A free music studio that runs in your browser. Record vocals over your beats, make beats, mix, master and design your cover art.

## What it does

- **Record:** sing over your own beat (drag and drop an MP3 or WAV), with takes, punch in and Fix my voice
- **Vocals:** presets, Auto-Tune, effects and Build my sound
- **Beats:** drum patterns, your own sounds, many built-in instruments, percussion, a guitar loop maker and MIDI
- **Mix and master:** mixer, mastering styles, WAV and MP3 export
- **Cover art:** cover, CD and MiniDisc designer with a 3D studio
- **Your look:** themes, backgrounds, cursors, fonts and your own logo
- **Simple mode** for beginners. Every control has a ? button that explains it

## Your songs stay yours

Everything you make is saved **only in your own browser** on your own computer. Nothing is uploaded anywhere. Nobody using SHELOOPS can see or open anyone else's songs, sounds, art or logo. This repo holds only the app code.

To move your work to another computer, use the studio backup on the My sound page.

## Run it

You need [Python 3](https://www.python.org/downloads/).

1. Download this repo (green **Code** button, then **Download ZIP**) and unzip it, or `git clone` it.
2. On Windows, double-click `start.bat`. On Mac or Linux, run `python3 devserver.py` in the folder.
3. Open http://localhost:8780 in Chrome or Edge.

Always use the same address (localhost:8780). Your browser keeps your songs for that address.

You can also install it as an app from the Home page (Install as an app).

## Updates

SHELOOPS tells you when a newer version is out. To update, download the new ZIP or run `git pull`, then restart. Your songs stay in your browser.

## Credits

- Fonts: open-licensed fonts (SIL Open Font License) from Fontsource, in `vendor/fonts`
- 3D: [three.js](https://threejs.org) (MIT), in `vendor/three`
- MP3: lamejs (LGPL), in `vendor/lame.min.js`
