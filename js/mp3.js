// MP3 export with an ID3 tag (title, artist, cover art). Needs vendor/lame.min.js (lamejs) loaded as window.lamejs.
export async function encodeMp3(buf, project) {
  const lame = window.lamejs;
  if (!lame) throw new Error('MP3 encoder not installed');
  const ch = Math.min(2, buf.numberOfChannels), sr = buf.sampleRate;
  const enc = new lame.Mp3Encoder(ch, sr, 256);
  const toI16 = f => { const o = new Int16Array(f.length); for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  const L = toI16(buf.getChannelData(0)), R = ch > 1 ? toI16(buf.getChannelData(1)) : null;
  const parts = [id3(project)], block = 1152;
  for (let i = 0; i < L.length; i += block) {
    const out = R ? enc.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block)) : enc.encodeBuffer(L.subarray(i, i + block));
    if (out.length) parts.push(new Uint8Array(out));
    if (i % (block * 400) === 0) await new Promise(r => setTimeout(r));
  }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: 'audio/mpeg' });
}

// ID3v2.3 tag
function id3(p) {
  const frames = [];
  const u16 = s => { const b = new Uint8Array(2 + s.length * 2 + 2); b[0] = 0xff; b[1] = 0xfe; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; } return b; };
  const frame = (id, body) => { const h = new Uint8Array(10); for (let i = 0; i < 4; i++) h[i] = id.charCodeAt(i); const n = body.length; h[4] = n >>> 24; h[5] = (n >>> 16) & 255; h[6] = (n >>> 8) & 255; h[7] = n & 255; return cat([h, body]); };
  const text = (id, s) => frame(id, cat([new Uint8Array([1]), u16(s)]));
  if (p.name) frames.push(text('TIT2', p.name));
  if (p.artist) frames.push(text('TPE1', p.artist));
  frames.push(text('TSSE', 'SHELOOPS'));
  if (p.cover && p.cover.startsWith('data:image/jpeg;base64,')) {
    const bin = atob(p.cover.split(',')[1]), img = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    const mime = 'image/jpeg', head = new Uint8Array(1 + mime.length + 1 + 1 + 1);
    head[0] = 0; for (let i = 0; i < mime.length; i++) head[1 + i] = mime.charCodeAt(i);
    head[1 + mime.length] = 0; head[2 + mime.length] = 3; head[3 + mime.length] = 0; // front cover, empty description
    frames.push(frame('APIC', cat([head, img])));
  }
  const body = cat(frames), n = body.length, h = new Uint8Array(10);
  h.set([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127]);
  return cat([h, body]);
}
function cat(arrs) { const n = arrs.reduce((a, b) => a + b.length, 0), o = new Uint8Array(n); let k = 0; for (const a of arrs) { o.set(a, k); k += a.length; } return o; }
