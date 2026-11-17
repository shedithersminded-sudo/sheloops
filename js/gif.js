// Animated pictures (GIF, animated WebP/PNG): decode every frame once, then give the right frame for any time.
// Falls back to a still picture when the browser cannot decode frames.
const cache = new Map(); // key -> { frames: [{ bmp, end }], total } or { still }
export const isAnimatedType = t => /gif|webp|apng|png/i.test(t || '');
export async function loadAnim(key, blob) {
  if (cache.has(key)) return cache.get(key);
  let out = null;
  if (/gif|webp|png/i.test(blob.type) && 'ImageDecoder' in window) {
    try {
      const dec = new ImageDecoder({ data: await blob.arrayBuffer(), type: blob.type });
      await dec.tracks.ready; const n = Math.min(dec.tracks.selectedTrack.frameCount, 300);
      if (n > 1) {
        const frames = []; let t = 0;
        for (let i = 0; i < n; i++) { const { image } = await dec.decode({ frameIndex: i }); const dur = Math.max(20, (image.duration || 100000) / 1000); t += dur; frames.push({ bmp: await createImageBitmap(image), end: t }); image.close(); }
        out = { frames, total: t, w: frames[0].bmp.width, h: frames[0].bmp.height };
      }
      dec.close?.();
    } catch { out = null; }
  }
  if (!out) { const still = await createImageBitmap(blob); out = { still, w: still.width, h: still.height }; }
  cache.set(key, out); return out;
}
// the frame to show right now (or at time ms)
export function frameOf(a, ms = performance.now()) {
  if (!a) return null; if (a.still) return a.still;
  const t = ms % a.total; for (const f of a.frames) if (t < f.end) return f.bmp; return a.frames[0].bmp;
}
export const isMoving = a => !!(a && a.frames);
export const animOf = key => cache.get(key);
export const forgetAnim = key => cache.delete(key);
