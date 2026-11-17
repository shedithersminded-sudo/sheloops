// CD case plastic: tint, finish (clear, frosted, smoked, iridescent, glitter) and wear (scratches,
// fingerprints, dust, cracks, shattered). Textures are drawn once and used by the case preview and the 3D studio.
export const PLASTIC_DEF = { tint: '#ff5ca8', tintAmt: 0, finish: 'clear', wear: 'new', wearAmt: 0.7, tray: '' };
export const FINISH = [['clear', 'Crystal clear'], ['frosted', 'Frosted'], ['smoked', 'Smoked'], ['iridescent', 'Iridescent'], ['glitter', 'Glitter'], ['mirror', 'Mirror shine']];
export const WEAR = [['new', 'Brand new'], ['scratched', 'Scratched'], ['fingerprints', 'Fingerprints'], ['dusty', 'Dusty'], ['cracked', 'Cracked'], ['shattered', 'Shattered'], ['stickers', 'Sticker residue']];
export const plasticOf = cs => { cs.plastic ||= {}; for (const k in PLASTIC_DEF) if (!(k in cs.plastic)) cs.plastic[k] = PLASTIC_DEF[k]; return cs.plastic; }; // same object every time, so every panel edits the real settings

const cache = new Map();
function rng(seed) { let x = seed; return () => (x = x * 16807 % 2147483647) / 2147483647; }
// a see-through texture (white marks on transparent) for each kind of wear
export function wearCanvas(kind, N = 768) {
  const key = kind + N; if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), R = rng(kind.length * 7919 + 13);
  g.lineCap = 'round';
  if (kind === 'scratched') {
    for (let i = 0; i < 160; i++) { const x = R() * N, y = R() * N, a = (R() - 0.5) * 1.2 + (R() < 0.5 ? 0 : 1.6), len = 20 + R() * N * 0.35; g.strokeStyle = `rgba(255,255,255,${0.15 + R() * 0.5})`; g.lineWidth = 0.5 + R() * 1.4; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * len / 2 + (R() - 0.5) * 20, y + Math.sin(a) * len / 2, x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); }
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.4})`; g.fillRect(R() * N, R() * N, 1, 1 + R() * 3); }
  } else if (kind === 'fingerprints') {
    for (let f = 0; f < 6; f++) { const cx = R() * N, cy = R() * N, r0 = N * (0.05 + R() * 0.05), rot = R() * Math.PI;
      g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(1, 1.35);
      for (let r = 4; r < r0; r += 3.2) { g.strokeStyle = `rgba(255,255,255,${0.16 * (1 - r / r0)})`; g.lineWidth = 1.2; g.beginPath(); g.arc((R() - 0.5) * 2, (R() - 0.5) * 2, r, R() * 0.6, Math.PI * 2 - R() * 0.6); g.stroke(); }
      g.restore(); }
    const sm = g.createRadialGradient(N * 0.7, N * 0.3, 0, N * 0.7, N * 0.3, N * 0.3); sm.addColorStop(0, 'rgba(255,255,255,.1)'); sm.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sm; g.fillRect(0, 0, N, N);
  } else if (kind === 'dusty') {
    for (let i = 0; i < 2600; i++) { const s = R() < 0.95 ? 0.6 + R() * 1.4 : 2 + R() * 4; g.fillStyle = `rgba(255,255,255,${0.2 + R() * 0.55})`; g.beginPath(); g.arc(R() * N, R() * N, s, 0, 7); g.fill(); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.7; const x = R() * N, y = R() * N; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30); g.stroke(); }
  } else if (kind === 'cracked' || kind === 'shattered') {
    const crack = (x, y, a, len, w, depth) => { let px = x, py = y; g.lineWidth = w; g.beginPath(); g.moveTo(px, py); const steps = 8; for (let k = 0; k < steps; k++) { a += (R() - 0.5) * 0.5; px += Math.cos(a) * len / steps; py += Math.sin(a) * len / steps; g.lineTo(px, py); if (depth > 0 && R() < 0.25) { g.stroke(); crack(px, py, a + (R() < 0.5 ? 0.7 : -0.7), len * 0.45, w * 0.7, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(px, py); } } g.stroke(); };
    const hits = kind === 'shattered' ? [[N * 0.42, N * 0.4]] : [[N * 0.8, N * 0.18]];
    for (const [hx, hy] of hits) {
      const rays = kind === 'shattered' ? 16 : 7;
      for (let i = 0; i < rays; i++) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.shadowColor = 'rgba(255,255,255,.6)'; g.shadowBlur = 3; crack(hx, hy, i / rays * Math.PI * 2 + R() * 0.3, N * (kind === 'shattered' ? 0.55 : 0.4) * (0.5 + R() * 0.6), 1.6, 2); }
      if (kind === 'shattered') { g.shadowBlur = 0; for (let ring = 1; ring < 4; ring++) { g.strokeStyle = `rgba(255,255,255,${0.5 - ring * 0.1})`; g.lineWidth = 1.1; g.beginPath(); for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, r = ring * N * 0.09 * (0.8 + R() * 0.4); k ? g.lineTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r) : g.moveTo(hx + Math.cos(a) * r, hy + Math.sin(a) * r); } g.stroke(); }
        const shard = g.createRadialGradient(hx, hy, 0, hx, hy, N * 0.06); shard.addColorStop(0, 'rgba(255,255,255,.55)'); shard.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = shard; g.fillRect(0, 0, N, N); }
    }
  } else if (kind === 'stickers') {
    for (let i = 0; i < 5; i++) { const x = R() * N, y = R() * N, w = 60 + R() * 120, h = 30 + R() * 70; g.save(); g.translate(x, y); g.rotate((R() - 0.5) * 0.6); g.fillStyle = 'rgba(255,250,235,.28)'; g.fillRect(-w / 2, -h / 2, w, h); for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect((R() - 0.5) * w, (R() - 0.5) * h, 2, 2); } g.restore(); }
  } else if (kind === 'glitter') {
    for (let i = 0; i < 1800; i++) { const s = 0.6 + R() * 1.8; g.fillStyle = i % 6 ? `rgba(255,255,255,${0.3 + R() * 0.7})` : `hsla(${R() * 360},100%,75%,.9)`; g.fillRect(R() * N, R() * N, s, s); }
  }
  cache.set(key, c); return c;
}
const urls = new Map();
export const wearURL = kind => { if (!urls.has(kind)) urls.set(kind, wearCanvas(kind, 512).toDataURL()); return urls.get(kind); };
// CSS for the case preview: classes and variables for the scene element
export function plasticStyle(scene, cs) {
  const p = plasticOf(cs);
  for (const [k] of FINISH) scene.classList.toggle('pf-' + k, p.finish === k);
  for (const [k] of WEAR) scene.classList.toggle('pw-' + k, p.wear === k);
  scene.style.setProperty('--ptint', p.tint); scene.style.setProperty('--ptintamt', p.tintAmt);
  scene.style.setProperty('--pwear', p.wear === 'new' ? 'none' : `url(${wearURL(p.wear)})`); scene.style.setProperty('--pwearamt', p.wearAmt);
  scene.style.setProperty('--pglitter', `url(${wearURL('glitter')})`);
}
// three.js: lid plastic material settings, and a see-through overlay for the wear
export function plasticMat(THREE, cs, base = {}) {
  // polystyrene like a real jewel case: crystal clear, very smooth, a hint of blue-green in the thick edges
  const p = plasticOf(cs), tint = new THREE.Color(p.tint);
  const o = { color: new THREE.Color(1, 1, 1), transmission: 1, roughness: 0.012, thickness: 0.012, ior: 1.59, metalness: 0, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.008, attenuationColor: new THREE.Color('#d6ecea'), attenuationDistance: 0.5, ...base };
  if (p.tintAmt > 0) { o.color = new THREE.Color(1, 1, 1).lerp(tint, p.tintAmt * 0.55); o.attenuationColor = tint; o.attenuationDistance = 0.02 / Math.max(0.05, p.tintAmt); }
  if (cs.style === 'vintage') { o.attenuationColor = new THREE.Color('#e9d796'); o.attenuationDistance = 0.04; o.roughness = 0.06; }
  if (cs.style === 'black' && p.tintAmt === 0) { o.color = new THREE.Color(0.3, 0.3, 0.32); o.attenuationColor = new THREE.Color('#111114'); o.attenuationDistance = 0.008; }
  if (p.finish === 'frosted') { o.roughness = 0.42; o.clearcoat = 0; }
  if (p.finish === 'smoked') { o.color = o.color.clone().multiplyScalar(0.4); o.attenuationColor = new THREE.Color('#1c1c20'); o.attenuationDistance = 0.012; }
  if (p.finish === 'iridescent') { o.iridescence = 1; o.iridescenceIOR = 1.6; o.iridescenceThicknessRange = [200, 800]; }
  if (p.finish === 'mirror') { o.metalness = 0.6; o.roughness = 0.02; o.transmission = 0.55; }
  return new THREE.MeshPhysicalMaterial(o);
}
export function wearOverlay(THREE, cs, w, h) {
  const p = plasticOf(cs); const layers = [];
  if (p.wear !== 'new') layers.push([p.wear, p.wearAmt]);
  if (p.finish === 'glitter') layers.push(['glitter', 0.9]);
  if (!layers.length) return null;
  const g = new THREE.Group();
  for (const [kind, amt] of layers) {
    const t = new THREE.CanvasTexture(wearCanvas(kind, 1024)); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: amt, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(m);
  }
  return g;
}
