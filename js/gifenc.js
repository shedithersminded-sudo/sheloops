// Small animated GIF encoder: shared 256-color palette (median cut), LZW compression, looping.
// frames: ImageData[] all the same size. delay in ms. Returns a Blob (image/gif).
export function encodeGIF(frames, delay = 50, opts = {}) {
  const W = frames[0].width, H = frames[0].height;
  const pal = buildPalette(frames, opts.colors || 256), lookup = new Map();
  const near = (r, g, b) => {
    const key = (r >> 2) << 12 | (g >> 2) << 6 | (b >> 2); let i = lookup.get(key); if (i !== undefined) return i;
    let best = 0, bd = Infinity; for (let k = 0; k < pal.length; k += 3) { const dr = pal[k] - r, dg = pal[k + 1] - g, db = pal[k + 2] - b, d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; best = k / 3; } }
    lookup.set(key, best); return best;
  };
  const out = []; const w8 = b => out.push(b & 255), w16 = v => { out.push(v & 255, (v >> 8) & 255); }, str = s => { for (const ch of s) out.push(ch.charCodeAt(0)); };
  str('GIF89a'); w16(W); w16(H); w8(0xF7); w8(0); w8(0); // global color table, 256 entries
  for (let i = 0; i < 256; i++) { w8(pal[i * 3] || 0); w8(pal[i * 3 + 1] || 0); w8(pal[i * 3 + 2] || 0); }
  w8(0x21); w8(0xFF); w8(11); str('NETSCAPE2.0'); w8(3); w8(1); w16(opts.loop ?? 0); w8(0); // loop forever
  const idx = new Uint8Array(W * H);
  for (const f of frames) {
    const d = f.data; for (let p = 0, q = 0; p < idx.length; p++, q += 4) idx[p] = near(d[q], d[q + 1], d[q + 2]);
    w8(0x21); w8(0xF9); w8(4); w8(0x04); w16(Math.round(delay / 10)); w8(0); w8(0); // graphic control: keep frame
    w8(0x2C); w16(0); w16(0); w16(W); w16(H); w8(0);
    lzw(idx, 8, out);
  }
  w8(0x3B);
  return new Blob([new Uint8Array(out)], { type: 'image/gif' });
}
function buildPalette(frames, n) {
  const px = []; const step = Math.max(1, Math.floor(frames.length * frames[0].width * frames[0].height / 60000));
  let c = 0; for (const f of frames) { const d = f.data; for (let i = 0; i < d.length; i += 4) { if (c++ % step) continue; px.push([d[i], d[i + 1], d[i + 2]]); } }
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, br = -1, bc = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let ch = 0; ch < 3; ch++) { let lo = 255, hi = 0; for (const p of b) { if (p[ch] < lo) lo = p[ch]; if (p[ch] > hi) hi = p[ch]; } if (hi - lo > br) { br = hi - lo; bi = i; bc = ch; } } });
    if (bi < 0 || br <= 0) break;
    const b = boxes[bi].sort((x, y) => x[bc] - y[bc]), m = b.length >> 1; boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  const pal = new Uint8Array(n * 3);
  boxes.forEach((b, i) => { let r = 0, g = 0, bl = 0; for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; } const k = b.length || 1; pal[i * 3] = r / k; pal[i * 3 + 1] = g / k; pal[i * 3 + 2] = bl / k; });
  return pal;
}
function lzw(idx, minCode, out) {
  out.push(minCode);
  const clear = 1 << minCode, eoi = clear + 1; let size = minCode + 1, next = eoi + 1, dict = new Map();
  let buf = 0, bits = 0; const bytes = [];
  const emit = code => { buf |= code << bits; bits += size; while (bits >= 8) { bytes.push(buf & 255); buf >>>= 8; bits -= 8; } };
  emit(clear);
  let cur = idx[0];
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i], key = cur << 12 | k, hit = dict.get(key);
    if (hit !== undefined) { cur = hit; continue; }
    emit(cur);
    if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; }
    else { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    cur = k;
  }
  emit(cur); emit(eoi); if (bits > 0) bytes.push(buf & 255);
  for (let i = 0; i < bytes.length; i += 255) { const n = Math.min(255, bytes.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(bytes[i + j]); }
  out.push(0);
}
