// Real 3D studio (three.js). Everything is built at real size (1 unit = 100 mm) and lit like a product photo:
// jewel case with booklet and back inlay, slim cases, card sleeve, MiniDisc, a CD book with sleeve pages,
// a stack of cases, a spindle and a pile. Orbit all the way around, export pictures, video, GIF and GLB.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { GLTFExporter } from '../vendor/three/addons/GLTFExporter.js';
import { faceCanvas, ensureDesign, FACES, designMoves } from './art.js';
import { plasticMat, wearOverlay, plasticOf } from './plastic.js';

const V3 = THREE.Vector3;
const tex = (cv, srgb = true) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const cnv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const rng = seed => { let x = seed; return () => (x = x * 16807 % 2147483647) / 2147483647; };
// formats that lie flat on the table get a camera from above
const FLAT = new Set(['wallet', 'pile', 'fan']);
const FORMATS_3D = [['cdcase', 'CD in a jewel case'], ['slim', 'Colored slim case'], ['sleeve', 'Card sleeve'], ['fan', 'Stack of cases'], ['disc', 'Disc only'], ['minidisc', 'MiniDisc'], ['wallet', 'CD book'], ['spindle', 'Spindle stack'], ['pile', 'Pile of discs']];

// a photo studio made of soft light panels: gives glass and metal crisp, real reflections
function studioScene() {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: 0x141418, side: THREE.BackSide })));
  const panel = (w, h, x, y, z, k, col = 0xffffff) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  panel(6, 2.2, 0, 7, 2.5, 7);            // big softbox overhead
  panel(2.6, 2.6, -4.5, 3, 5.5, 4);       // key light front left
  panel(0.9, 7, -7, 1, -1, 3.5);          // tall strip left
  panel(0.9, 7, 7, 1, 1.5, 5);            // tall strip right (makes the long edge highlight on glass)
  panel(5, 3, 2, 2, -7, 1.3, 0xdbe4ff);   // cool fill behind
  panel(9, 0.7, 0, -1.2, 7, 1.6);         // low bounce in front
  return s;
}

export async function mountViewer(host, d, o = {}) {
  ensureDesign(d);
  const st = { format: o.format || (d.mock.format === 'minidisc' ? 'minidisc' : 'cdcase'), open: 0, spin: false, auto: o.auto ?? true, mirror: o.mirror ?? true, bg: o.bg || '#0b0b0d', transparent: false, light: 1, rainbow: 1, caseColor: d.mock.slim || '#7a3cff', count: 40, dome: true };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studioScene(), 0.015).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(-2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.8); rim.position.set(3, 1.5, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100); camera.position.set(1.2, 0.5, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 0.4; controls.maxDistance = 12;
  const model = new THREE.Group(); scene.add(model);
  let floor = null, spinner = null, lidPivot = null, lidMax = Math.PI * 0.72, framedFor = null;

  // ---------- art textures ----------
  const FACE_SIZE = { disc: 1024, mdlabel: 900, cover: 1024, back: 1400, booklet: 768 };
  const art = {};
  const mdPaper = cv => { // a blank MiniDisc label looks like real paper with ruled lines
    const f = d.faces.mdlabel; if (f.layers.length) return cv;
    const g = cv.getContext('2d'); g.strokeStyle = 'rgba(40,60,120,.28)'; g.lineWidth = 2;
    for (let y = cv.height * 0.3; y < cv.height * 0.95; y += cv.height * 0.13) { g.beginPath(); g.moveTo(cv.width * 0.06, y); g.lineTo(cv.width * 0.94, y); g.stroke(); }
    return cv;
  };
  const drawFace = async k => { const cv = await faceCanvas(d, k, { size: FACE_SIZE[k], labelOnly: k === 'disc' }); return k === 'mdlabel' ? mdPaper(cv) : cv; };
  for (const k of Object.keys(FACE_SIZE)) art[k] = tex(await drawFace(k));
  let movers = [];
  const findMovers = () => { movers = Object.keys(FACE_SIZE).filter(k => designMoves(d, k)); };
  findMovers();

  // ---------- made textures (drawn once) ----------
  // brushed circles: makes the long radial light streak you see on a real CD
  const anisoMap = (() => { const N = 512, [c, g] = cnv(N), im = g.createImageData(N, N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = x / N - 0.5, v = 0.5 - y / N, l = Math.hypot(u, v) || 1, i = (y * N + x) * 4; im.data[i] = (-v / l * 0.5 + 0.5) * 255; im.data[i + 1] = (u / l * 0.5 + 0.5) * 255; im.data[i + 2] = 255; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); return tex(c, false); })();
  // thin-film thickness that changes around the disc: the streak picks up rainbow colors that shift as it turns
  const iriMap = (() => { const N = 512, [c, g] = cnv(N), cg = g.createConicGradient(0, N / 2, N / 2); for (let i = 0; i <= 48; i++) { const t = i / 48, v = Math.round(128 + 115 * Math.sin(t * Math.PI * 2 * 4)); cg.addColorStop(t, `rgb(${v},${v},${v})`); } g.fillStyle = cg; g.fillRect(0, 0, N, N); const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); rg.addColorStop(0, 'rgba(128,128,128,.5)'); rg.addColorStop(1, 'rgba(128,128,128,0)'); g.fillStyle = rg; g.fillRect(0, 0, N, N); return tex(c, false); })();
  const stripes = (n, horiz, a, b) => { const [c, g] = cnv(horiz ? 64 : 8, horiz ? 8 : 64); g.fillStyle = a; g.fillRect(0, 0, c.width, c.height); g.fillStyle = b; if (horiz) for (let i = 0; i < 64; i += 8) g.fillRect(i, 0, 4, 8); else for (let i = 0; i < 64; i += 8) g.fillRect(0, i, 8, 4); const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const noise = (N, amt, seed) => { const [c, g] = cnv(N), R = rng(seed), im = g.createImageData(N, N); for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (R() - 0.5) * amt; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  const weave = (() => { const N = 256, [c, g] = cnv(N); g.fillStyle = '#808080'; g.fillRect(0, 0, N, N); for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x += 4) { g.fillStyle = (x + y) % 8 ? '#9a9a9a' : '#5c5c5c'; g.fillRect(x, y, 4, 2); } const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 10); return t; })();
  const fleece = noise(256, 120, 5); fleece.repeat.set(6, 6);
  const ridges = (() => { const [c, g] = cnv(64, 8); for (let x = 0; x < 64; x++) { const n = Math.sin(x / 64 * Math.PI * 2 * 8); g.fillStyle = `rgb(${Math.round(128 + n * 110)},128,255)`; g.fillRect(x, 0, 1, 8); } const t = tex(c, false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const zipTeeth = stripes(0, true, '#1d1d20', '#8a8c92'); zipTeeth.repeat.set(160, 1);
  const shadowTex = (() => { const N = 256, [c, g] = cnv(N); const rg = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); rg.addColorStop(0, 'rgba(0,0,0,.75)'); rg.addColorStop(0.55, 'rgba(0,0,0,.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, N, N); return tex(c); })();

  const grain = noise(512, 90, 3); grain.repeat.set(5, 5);
  const felt = noise(256, 200, 9); felt.repeat.set(3, 3);
  const PAPERS = { gloss: { rough: 0.22, coat: 2.5, bump: 0.08, sheen: 0, tex: grain }, satin: { rough: 0.45, coat: 1, bump: 0.18, sheen: 0.1, tex: grain }, matte: { rough: 0.8, coat: 0, bump: 0.3, sheen: 0.25, tex: grain }, textured: { rough: 0.85, coat: 0, bump: 1.2, sheen: 0.35, tex: felt } };
  // ---------- materials ----------
  const DYES = { silver: '#eceff3', green: '#c6d494', blue: '#9ab8ea', purple: '#bfa4ea', gold: '#efd796', magenta: '#e58cba', red: '#ea969c', black: '#55555c' };
  const cache = new Map(), once = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };
  const M = {
    data: (dye = 'silver') => once('data' + dye + st.rainbow, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(DYES[dye] || DYES.silver), metalness: dye === 'black' ? 0.6 : 1, roughness: 0.2, anisotropy: 0.9, anisotropyMap: anisoMap, iridescence: Math.min(1, st.rainbow), iridescenceIOR: 2.0, iridescenceThicknessMap: iriMap, iridescenceThicknessRange: [200, 1300], clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide })),
    mirror: (dye = 'silver') => once('mir' + dye, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(DYES[dye] || DYES.silver), metalness: 1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.25 * st.rainbow, iridescenceIOR: 1.6, side: THREE.DoubleSide })),
    pc: () => once('pc', () => new THREE.MeshPhysicalMaterial({ color: 0xf2f6f9, transmission: 1, roughness: 0.05, thickness: 0.012, ior: 1.58, clearcoat: 1, clearcoatRoughness: 0.02, side: THREE.DoubleSide })),
    edge: () => once('edge', () => new THREE.MeshPhysicalMaterial({ color: 0xc9cfd6, metalness: 0.55, roughness: 0.28 })),
    print: () => once('print', () => new THREE.MeshPhysicalMaterial({ map: art.disc, alphaTest: 0.35, roughness: 0.42, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.22 })),
    // printed paper: fine fibre grain you can see when the light skims it. Paper type: gloss, satin, matte or textured art paper
    paper: (map, gloss = 0.3) => { const P = PAPERS[d.mock.paper || 'satin']; return new THREE.MeshPhysicalMaterial({ map, roughness: P.rough, clearcoat: gloss * P.coat, clearcoatRoughness: 0.3, bumpMap: P.tex, bumpScale: P.bump, sheen: P.sheen, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.9 }); },
    white: () => once('white', () => new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.85 })),
    nylon: () => once('nylon', () => new THREE.MeshPhysicalMaterial({ color: 0x141417, roughness: 0.82, sheen: 0.7, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x4a4a55), bumpMap: weave, bumpScale: 0.6 })),
    fleece: () => once('fleece', () => new THREE.MeshPhysicalMaterial({ color: 0xf1f0ec, roughness: 1, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xffffff), bumpMap: fleece, bumpScale: 0.4 })),
    sleeve: () => once('sleeve', () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.07, thickness: 0.002, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide })),
    weld: () => once('weld', () => new THREE.MeshPhysicalMaterial({ color: 0xd2d4d8, roughness: 0.35, clearcoat: 1, side: THREE.DoubleSide })),
    zip: () => once('zip', () => new THREE.MeshPhysicalMaterial({ map: zipTeeth, metalness: 0.6, roughness: 0.35 })),
    metal: () => once('metal', () => new THREE.MeshPhysicalMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.22, anisotropy: 0.6, anisotropyRotation: Math.PI / 2 })),
  };
  // the printed top of the disc where the art is blank: the real disc surface
  const topMat = () => {
    const m = d.disc.material, tint = { gold: 0xcfa83a, rosegold: 0xe3ac9e, pink: 0xff9ac9, purple: 0x9b6bff, blue: 0x4a8cff, black: 0x18181a, white: 0xf2f2f0, vintage: 0xc9b48c, retro: 0xe7e0cf, custom: d.disc.color }[m];
    if (!tint) return M.mirror(d.disc.dye || 'silver');
    const matte = ['white', 'vintage', 'retro'].includes(m);
    return once('top' + m + tint, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint), metalness: matte ? 0 : 0.9, roughness: matte ? 0.55 : 0.18, clearcoat: matte ? 0.3 : 1, iridescence: matte ? 0 : 0.4 }));
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const box = (parent, w, h, dz, mat, x, y, z) => add(parent, new THREE.BoxGeometry(w, h, dz), mat, x, y, z);

  // ---------- a real CD: clear hub, stacking ring, mirror band, data area, clear rim ----------
  function makeDisc(r = 0.6, hole = 0.075, labelled = true, dye = d.disc.dye || 'silver') {
    const g = new THREE.Group(), T = 0.012, k = r / 0.6;
    const ring = (a, b, mat, z, flip) => { const m = add(g, new THREE.RingGeometry(a, b, 180, 1), mat, 0, 0, z); if (flip) m.rotation.y = Math.PI; return m; };
    ring(hole, 0.165 * k, M.pc(), T / 2); ring(hole, 0.165 * k, M.pc(), -T / 2, true);
    const sr = add(g, new THREE.TorusGeometry(0.172 * k, 0.0022, 8, 120), M.pc(), 0, 0, -T / 2);
    sr.scale.z = 0.6;
    ring(0.165 * k, 0.232 * k, M.mirror(dye), -T / 2 + 0.0002, true);
    ring(0.232 * k, 0.588 * k, M.data(dye), -T / 2 + 0.0002, true);
    ring(0.588 * k, r, M.pc(), -T / 2, true);
    if (labelled) { ring(0.165 * k, 0.594 * k, topMat(), T / 2 + 0.0001); ring(hole, r, M.print(), T / 2 + 0.0004); }
    else ring(0.165 * k, 0.588 * k, M.data(dye), T / 2 + 0.0002);
    const edge = add(g, new THREE.CylinderGeometry(r, r, T, 180, 1, true), M.edge()); edge.rotation.x = Math.PI / 2;
    const inner = add(g, new THREE.CylinderGeometry(hole, hole, T, 64, 1, true), M.pc()); inner.rotation.x = Math.PI / 2;
    return g;
  }
  // the tray rosette that holds the disc by its hole
  function rosette(parent, mat, x, y, z) {
    add(parent, new THREE.CylinderGeometry(0.068, 0.074, 0.008, 48), mat, x, y, z).rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, t = box(parent, 0.016, 0.03, 0.011, mat, x + Math.cos(a) * 0.058, y + Math.sin(a) * 0.058, z + 0.004); t.rotation.z = a + Math.PI / 2; }
  }
  const trayColor = () => {
    const cs = d.caseStyle, p = plasticOf(cs);
    if (p.tray === 'clear') return null; if (p.tray === 'white') return '#eeeeea'; if (p.tray === 'black') return '#0c0c0e'; if (p.tray === 'color') return cs.color;
    return { white: '#eeeeea', colored: cs.color, premium: cs.color, transparent: null }[cs.style] ?? '#0c0c0e';
  };
  const trayMat = col => col ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(col), roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 }) : plasticMat(THREE, d.caseStyle, { roughness: 0.05 });
  const caseStyle = () => { const cs = d.caseStyle; if (cs.style === 'damaged' && plasticOf(cs).wear === 'new') return { ...cs, plastic: { ...plasticOf(cs), wear: 'cracked' } }; return cs; };

  // ---------- jewel case: base with back inlay and spines, tray, disc, hinged lid with booklet ----------
  function makeJewel(open = null) {
    const g = new THREE.Group(), W = 1.42, H = 1.25, cs = caseStyle(), baseM = plasticMat(THREE, cs, { roughness: 0.02 }), lidM = plasticMat(THREE, cs);
    box(g, W, H, 0.012, baseM, 0, 0, -0.046);
    for (const s of [-1, 1]) box(g, 0.012, H, 0.07, baseM, s * (W / 2 - 0.006), 0, -0.017);
    // back inlay: the back art, folded at both ends into the spines
    const F = FACES.back, sp = F.spine / F.w, slice = (u0, u1) => { const t = art.back.clone(); t.offset.set(u0, 0); t.repeat.set(u1 - u0, 1); return t; };
    const inl = add(g, new THREE.PlaneGeometry(1.37, 1.18), M.paper(slice(sp, 1 - sp), 0.15), 0, 0, -0.0395); inl.rotation.y = Math.PI;
    add(g, new THREE.PlaneGeometry(0.065, 1.18), M.paper(slice(0, sp), 0.15), W / 2 - 0.0125, 0, -0.007).rotation.y = Math.PI / 2;
    add(g, new THREE.PlaneGeometry(0.065, 1.18), M.paper(slice(1 - sp, 1), 0.15), -W / 2 + 0.0125, 0, -0.007).rotation.y = -Math.PI / 2;
    const tm = trayMat(trayColor());
    box(g, 1.37, 1.17, 0.008, tm, 0.01, 0, -0.033);
    add(g, new THREE.TorusGeometry(0.61, 0.004, 8, 160), tm, 0.01, 0, -0.028);
    rosette(g, tm, 0.01, 0, -0.026);
    const disc = makeDisc(); disc.position.set(0.01, 0, -0.022); g.add(disc); if (open == null) spinner = disc;
    // lid
    const pivot = new THREE.Group(); pivot.position.set(-W / 2, 0, -0.01); g.add(pivot);
    const plate = box(pivot, W, H, 0.012, lidM, W / 2, 0, 0.056);
    for (const s of [-1, 1]) box(pivot, W, 0.012, 0.087, lidM, W / 2, s * (H / 2 - 0.006), 0.0185);
    const rib = box(pivot, 0.09, H - 0.03, 0.003, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.12, thickness: 0.003, ior: 1.58, normalMap: ridges, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1 }), 0.062, 0, 0.0635);
    rib.material.normalMap.repeat.set(2.5, 1);
    const bookMats = [M.white(), M.white(), M.white(), M.white(), M.paper(art.cover, 0.45), M.paper(art.booklet, 0.2)];
    box(pivot, 1.2, 1.2, 0.003, bookMats, W - 0.025 - 0.6, 0, 0.048);
    for (const y of [-0.36, 0.36]) box(pivot, 0.03, 0.12, 0.006, lidM, W - 0.02, y, 0.045);
    const wo = wearOverlay(THREE, cs, W, H); if (wo) { wo.position.set(W / 2, 0, 0.0625); pivot.add(wo); }
    if (open == null) { lidPivot = pivot; lidMax = Math.PI * 0.72; } else pivot.rotation.y = -open;
    void plate;
    return g;
  }
  // ---------- slim case: colored tray, clear lid with the cover slip under it ----------
  function makeSlim(color, withCover = true, open = null) {
    const g = new THREE.Group(), W = 1.42, H = 1.25, col = new THREE.Color(color);
    const trayM = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffffff').lerp(col, 0.85), transmission: 0.3, roughness: 0.12, thickness: 0.02, ior: 1.55, attenuationColor: col, attenuationDistance: 0.03, clearcoat: 1, clearcoatRoughness: 0.04 });
    const lidM = plasticMat(THREE, caseStyle());
    box(g, W - 0.04, H, 0.012, trayM, 0.02, 0, -0.018);
    box(g, 0.045, H, 0.045, trayM, -W / 2 + 0.0225, 0, -0.002);
    add(g, new THREE.TorusGeometry(0.61, 0.004, 8, 160), trayM, 0.04, 0, -0.011);
    rosette(g, trayM, 0.04, 0, -0.009);
    const disc = makeDisc(); disc.position.set(0.04, 0, -0.005); g.add(disc); if (open == null) spinner = disc;
    const pivot = new THREE.Group(); pivot.position.set(-W / 2 + 0.045, 0, 0.0); g.add(pivot);
    const LW = W - 0.045;
    box(pivot, LW, H, 0.008, lidM, LW / 2, 0, 0.017);
    for (const s of [-1, 1]) box(pivot, LW, 0.008, 0.03, lidM, LW / 2, s * (H / 2 - 0.004), 0.004);
    if (withCover) add(pivot, new THREE.PlaneGeometry(1.2, 1.2), M.paper(art.cover, 0.35), LW - 0.62, 0, 0.0125);
    const wo = wearOverlay(THREE, caseStyle(), LW, H); if (wo) { wo.position.set(LW / 2, 0, 0.0215); pivot.add(wo); }
    if (open == null) { lidPivot = pivot; lidMax = Math.PI * 0.9; } else pivot.rotation.y = -open;
    return g;
  }
  // ---------- card sleeve: printed cardboard, disc slid half out ----------
  function makeSleeve() {
    const g = new THREE.Group(), S = 1.25, F = FACES.back, sp = F.spine / F.w;
    const back = art.back.clone(); back.offset.set(sp, 0); back.repeat.set(1 - 2 * sp, 1);
    const card = (map, z, flip) => { const m = add(g, new THREE.PlaneGeometry(S, S), new THREE.MeshPhysicalMaterial({ map, roughness: 0.75, clearcoat: 0.1, side: THREE.FrontSide }), 0, 0, z); if (flip) m.rotation.y = Math.PI; };
    card(art.cover, 0.008); card(back, -0.008, true);
    const edgeM = new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.9 });
    box(g, S, 0.004, 0.016, edgeM, 0, S / 2 - 0.002, 0); box(g, S, 0.004, 0.016, edgeM, 0, -S / 2 + 0.002, 0); box(g, 0.004, S, 0.016, edgeM, -S / 2 + 0.002, 0, 0);
    const disc = makeDisc(); disc.position.set(0.42, 0, 0); g.add(disc); spinner = disc;
    return g;
  }
  // ---------- MiniDisc: 68 x 72 x 5 mm glassy shell, label, shutter, hub ----------
  function roundedShape(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2); s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5); return s; }
  function makeMiniDisc() {
    const g = new THREE.Group(), W = 0.68, H = 0.72, D = 0.05, m = d.mock, col = new THREE.Color(m.shell);
    const tint = new THREE.Color('#ffffff').lerp(col, m.shellAlpha * 0.7);
    const shellM = new THREE.MeshPhysicalMaterial({ color: tint, transmission: 1, roughness: 0.02, thickness: 0.025, ior: 1.55, attenuationColor: col, attenuationDistance: m.shellAlpha < 0.05 ? 1e6 : Math.max(0.01, 0.25 * (1 - m.shellAlpha)), clearcoat: 1, clearcoatRoughness: 0.01, specularIntensity: 1 });
    // two shell halves with a fine seam between them, like the real thing
    for (const s of [-1, 1]) { const geo = new THREE.ExtrudeGeometry(roundedShape(W, H, 0.025), { depth: D / 2 - 0.004, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 3, curveSegments: 12 }); const half = add(g, geo, shellM, 0, 0, s > 0 ? 0.0006 : -0.0006); if (s < 0) half.rotation.y = Math.PI; }
    // inside: the disc, its metal hub and the wall around it
    const disc = makeDisc(0.32, 0.03, false, m.mdDisc || 'silver'); disc.position.set(0, -0.03, 0); g.add(disc); spinner = disc;
    add(disc, new THREE.CylinderGeometry(0.055, 0.055, 0.016, 48), M.metal()).rotation.x = Math.PI / 2;
    add(g, new THREE.TorusGeometry(0.335, 0.004, 8, 120), shellM, 0, -0.03, 0).scale.z = 4;
    // label on the front (and its ruled paper or art), plus the spine label on top
    const LW = 0.5, LH = LW * FACES.mdlabel.h / FACES.mdlabel.w;
    add(g, new THREE.PlaneGeometry(LW, LH), M.paper(art.mdlabel, 0.15), 0, H / 2 - 0.045 - LH / 2, D / 2 + 0.0008);
    const [sc, sg] = cnv(1024, 80); sg.fillStyle = '#f4f1ea'; sg.fillRect(0, 0, 1024, 80); sg.fillStyle = '#222'; sg.font = '600 46px "Space Grotesk", Arial'; sg.textBaseline = 'middle'; sg.textAlign = 'center'; sg.fillText((m.shellText || d.name || '').slice(0, 40), 512, 42);
    const spine = add(g, new THREE.PlaneGeometry(0.56, 0.034), M.paper(tex(sc), 0.1), 0, H / 2 + 0.0035, 0); spine.rotation.x = -Math.PI / 2;
    // the metal shutter on the bottom, wrapping front and back, and the hub window on the back
    const shutM = m.shutter === 'black' ? new THREE.MeshPhysicalMaterial({ color: 0x141416, metalness: 0.5, roughness: 0.35, clearcoat: 0.6 }) : m.shutter === 'color' ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.25, clearcoat: 1 }) : new THREE.MeshPhysicalMaterial({ color: 0xaeb3ba, metalness: 1, roughness: 0.38, anisotropy: 0.8, clearcoat: 0.2 });
    const SW = 0.4, SH = 0.27, sy = -H / 2 + SH / 2 - 0.002;
    for (const z of [D / 2 + 0.003, -D / 2 - 0.003]) box(g, SW, SH, 0.002, shutM, -0.05, sy, z);
    box(g, SW, 0.002, D + 0.008, shutM, -0.05, -H / 2 - 0.0035, 0);
    add(g, new THREE.CircleGeometry(0.07, 48), new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.4, clearcoat: 1 }), 0, -0.03, -D / 2 - 0.0012).rotation.y = Math.PI;
    box(g, 0.05, 0.025, 0.004, new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.5 }), W / 2 - 0.06, -H / 2 + 0.05, -D / 2 - 0.002);
    if (m.insert) { // printed insert arrow next to the shutter
      const [c, x] = cnv(256, 128); x.fillStyle = 'rgba(255,255,255,.92)'; x.font = '700 30px "Space Grotesk", Arial'; x.textAlign = 'center'; x.fillText('INSERT', 128, 40); x.beginPath(); x.moveTo(100, 62); x.lineTo(156, 62); x.lineTo(128, 112); x.fill();
      add(g, new THREE.PlaneGeometry(0.12, 0.06), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false }), W / 2 - 0.1, -H / 2 + 0.1, D / 2 + 0.0012);
    }
    return g;
  }
  // ---------- stack of slim cases fanned out on the table ----------
  function makeStack() {
    const g = new THREE.Group(), cols = ['#2fd06a', '#2f6bff', '#ff9a1f', '#7a3cff', st.caseColor];
    cols.forEach((c, i) => {
      const pv = new THREE.Group(); pv.position.set(-0.55, i * 0.05, 0.5); pv.rotation.y = (cols.length - 1 - i) * 0.2; g.add(pv);
      const s = makeSlim(c, i === cols.length - 1, 0); s.rotation.x = -Math.PI / 2; s.position.set(0.63, 0.025, -0.55); pv.add(s);
    });
    return g;
  }
  // ---------- CD book: padded zip binder lying open, pages of clear sleeves holding discs ----------
  function makeBook() {
    const g = new THREE.Group(), CW = 1.46, CH = 1.58, PW = 1.34, PH = 1.46, gap = 0.06;
    const cover = () => { const geo = new THREE.ExtrudeGeometry(roundedShape(CW, CH, 0.09), { depth: 0.024, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.022, bevelSegments: 6, curveSegments: 16 }); geo.translate(0, 0, -0.012); return new THREE.Mesh(geo, M.nylon()); };
    const zipPath = () => { // around the outer three sides, from spine top to spine bottom
      const x0 = CW / 2, x1 = -CW / 2 + 0.008, y = CH / 2 - 0.008, r = 0.08, p = new THREE.CurvePath(), v = (a, b) => new V3(a, b, 0);
      p.add(new THREE.LineCurve3(v(x0, y), v(x1 + r, y))); p.add(new THREE.QuadraticBezierCurve3(v(x1 + r, y), v(x1, y), v(x1, y - r)));
      p.add(new THREE.LineCurve3(v(x1, y - r), v(x1, -y + r))); p.add(new THREE.QuadraticBezierCurve3(v(x1, -y + r), v(x1, -y), v(x1 + r, -y)));
      p.add(new THREE.LineCurve3(v(x1 + r, -y), v(x0, -y))); return p;
    };
    const page = (withDisc, discFlip, back) => {
      const p = new THREE.Group();
      box(p, PW, PH, 0.004, M.fleece(), 0, 0, 0);
      const pocket = (side) => {
        const q = new THREE.Group(); q.position.z = side * 0.006; if (side < 0) q.rotation.y = Math.PI; p.add(q);
        const w = 1.26, h = 1.3, y0 = -PH / 2 + 0.04, nr = 0.17, sh = new THREE.Shape();
        sh.moveTo(-w / 2, y0); sh.lineTo(w / 2, y0); sh.lineTo(w / 2, y0 + h); sh.lineTo(nr, y0 + h); sh.absarc(0, y0 + h, nr, 0, Math.PI, true); sh.lineTo(-w / 2, y0 + h); sh.closePath();
        add(q, new THREE.ShapeGeometry(sh, 24), M.sleeve(), 0, 0, 0.0085);
        for (const [ww, hh, x, y] of [[0.025, h, -w / 2 + 0.0125, y0 + h / 2], [0.025, h, w / 2 - 0.0125, y0 + h / 2], [w, 0.025, 0, y0 + 0.0125]]) add(q, new THREE.PlaneGeometry(ww, hh), M.weld(), x, y, 0.009);
        if (withDisc) { const dc = makeDisc(); dc.position.set(0, y0 + h / 2 - 0.02, 0.002); if (discFlip) dc.rotation.y = Math.PI; dc.rotation.z = Math.random() * 6; q.add(dc); }
      };
      pocket(1); if (back) pocket(-1);
      return p;
    };
    const half = (side) => { // side -1 = left, 1 = right
      const h = new THREE.Group(); h.position.x = side * gap; h.rotation.y = -side * 0.035; g.add(h);
      const c = cover(); c.position.set(side * CW / 2, 0, -0.02); h.add(c);
      const z = new THREE.Mesh(new THREE.TubeGeometry(zipPath(), 300, 0.011, 8), M.zip()); z.position.set(side * CW / 2, 0, -0.02); if (side > 0) z.scale.x = -1; h.add(z);
      for (let i = 0; i < 7; i++) { const sp = box(h, PW, PH, 0.004, M.fleece(), side * (PW / 2 + 0.05 + i * 0.004), 0, 0.012 + i * 0.006); sp.material = M.fleece(); }
      const top = page(true, false, false); top.position.set(side * (PW / 2 + 0.05), 0, 0.058); h.add(top);
      return h;
    };
    half(-1); const right = half(1);
    // the zip pull at the top corner
    const pull = new THREE.Group(); pull.position.set(CW + gap - 0.02, CH / 2 + 0.03, -0.02); right.add(pull);
    box(pull, 0.05, 0.1, 0.012, M.metal(), 0, 0.03, 0); add(pull, new THREE.TorusGeometry(0.022, 0.006, 8, 24), M.metal(), 0, 0.1, 0);
    // spine and the stitched binding the pages hang from
    box(g, gap * 2 + 0.02, CH - 0.04, 0.05, M.nylon(), 0, 0, -0.022);
    box(g, gap * 2, PH, 0.03, new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.7 }), 0, 0, 0.03);
    // one page turning over, with discs on both sides
    const tp = new THREE.Group(); tp.position.set(gap, 0, 0.08); tp.rotation.y = -1.25; g.add(tp);
    const turning = page(true, true, true); turning.position.x = PW / 2 + 0.03; tp.add(turning);
    g.rotation.x = -Math.PI / 2;
    const wrap = new THREE.Group(); wrap.add(g); return wrap;
  }
  // ---------- spindle stack ----------
  function makeSpindle() {
    const g = new THREE.Group(), n = st.count, h = n * 0.012;
    add(g, new THREE.CylinderGeometry(0.72, 0.74, 0.04, 96), new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.4, clearcoat: 0.5 }), 0, 0.02, 0);
    const [c, x] = cnv(8, 256), dye = { silver: '#cfd4da', green: '#7c9a52', blue: '#3c63b0', purple: '#6b47a3', gold: '#c49c42' }[d.disc.dye || 'silver'] || '#cfd4da';
    for (let i = 0; i < 256; i += 4) { x.fillStyle = i % 8 ? '#e6e9ed' : dye; x.fillRect(0, i, 8, 3); x.fillStyle = '#20232a'; x.fillRect(0, i + 3, 8, 1); }
    const sideTex = tex(c); sideTex.wrapT = THREE.RepeatWrapping; sideTex.repeat.set(1, n / 64);
    add(g, new THREE.CylinderGeometry(0.6, 0.6, h, 160, 1, true), new THREE.MeshPhysicalMaterial({ map: sideTex, metalness: 0.6, roughness: 0.3 }), 0, 0.04 + h / 2, 0);
    const top = makeDisc(); top.rotation.x = -Math.PI / 2; top.position.y = 0.04 + h + 0.006; g.add(top); spinner = top;
    add(g, new THREE.CylinderGeometry(0.06, 0.06, h + 0.5, 32), new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.35 }), 0, 0.04 + (h + 0.5) / 2, 0);
    if (st.dome) { const dm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.03, thickness: 0.01, ior: 1.5, clearcoat: 1, side: THREE.DoubleSide }); add(g, new THREE.CylinderGeometry(0.71, 0.71, h + 0.6, 120, 1, true), dm, 0, 0.04 + (h + 0.6) / 2, 0); add(g, new THREE.CircleGeometry(0.71, 120), dm, 0, 0.04 + h + 0.6, 0).rotation.x = -Math.PI / 2; }
    return g;
  }
  function makePile() {
    const g = new THREE.Group(), r = rng(7);
    for (let i = 0; i < 7; i++) {
      const disc = makeDisc(0.6, 0.075, i % 2 === 0); disc.rotation.x = -Math.PI / 2 + (r() - 0.5) * 0.06; disc.rotation.z = r() * 6;
      if (i % 3 === 1) disc.rotation.x += Math.PI;
      disc.position.set((r() - 0.5) * 1.5, i * 0.013, (r() - 0.5) * 1.1); g.add(disc);
    }
    return g;
  }

  // ---------- build, sit it on the floor, frame the camera ----------
  const FLOOR_Y = -0.82;
  let shadow = null;
  function build() {
    model.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
    model.clear(); cache.clear(); spinner = null; lidPivot = null;
    const ry = model.rotation.y, rx = model.rotation.x; model.rotation.set(0, 0, 0); model.position.set(0, 0, 0);
    const f = st.format, obj =
      f === 'minidisc' ? makeMiniDisc() : f === 'disc' ? (() => { const dd = makeDisc(); spinner = dd; return dd; })() : f === 'slim' ? makeSlim(st.caseColor) :
      f === 'sleeve' ? makeSleeve() : f === 'fan' ? makeStack() : f === 'spindle' ? makeSpindle() : f === 'wallet' ? makeBook() : f === 'pile' ? makePile() :
      d.caseStyle.style === 'slim' ? makeSlim(d.caseStyle.color || st.caseColor) : d.caseStyle.style === 'custom' ? makeSleeve() : makeJewel();
    const inner = new THREE.Group(); inner.add(obj); model.add(inner);
    model.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(inner), s = b.getSize(new V3()), c = b.getCenter(new V3());
    inner.position.set(-c.x, -c.y, -c.z);
    model.position.y = FLOOR_Y + s.y / 2 + 0.002;
    shadow = add(model, new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }), 0, -s.y / 2 - 0.0015, 0);
    shadow.rotation.x = -Math.PI / 2; shadow.scale.set(s.x * 1.25 + 0.15, s.z * 1.25 + 0.15, 1);
    model.rotation.set(rx, ry, 0);
    if (framedFor !== f) { framedFor = f; frame(s); }
    applyFloor();
  }
  function frame(s = new V3(1.4, 1.3, 0.1)) {
    const target = new V3(0, model.position.y, 0), r = Math.max(s.x, s.y, s.z) * 0.5;
    const vf = THREE.MathUtils.degToRad(camera.fov / 2), hf = Math.atan(Math.tan(vf) * Math.max(0.3, camera.aspect || 1)), dist = r / Math.sin(Math.min(vf, hf)) * 1.08;
    const dir = FLAT.has(st.format) ? new V3(0.2, 1.15, 1) : new V3(0.45, 0.22, 1);
    controls.target.copy(target); camera.position.copy(target).add(dir.normalize().multiplyScalar(dist)); controls.update();
  }
  // Mirror floor: a live upside-down copy under a glossy, partly see-through floor.
  let mirror = null, pairs = [];
  function applyFloor() {
    if (floor) { scene.remove(floor); floor = null; }
    if (mirror) { scene.remove(mirror); mirror = null; pairs = []; }
    if (!st.mirror) return;
    mirror = new THREE.Group(); mirror.scale.y = -1; mirror.position.y = 2 * FLOOR_Y;
    const copy = model.clone(true); mirror.add(copy); scene.add(mirror);
    copy.traverse(o => { if (o.material && o.material.map === shadowTex) o.visible = false; });
    const a = [], b = []; model.traverse(o => a.push(o)); copy.traverse(o => b.push(o)); pairs = a.map((o, i) => [o, b[i]]);
    floor = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshPhysicalMaterial({ color: st.transparent ? 0x000000 : new THREE.Color(st.bg), transparent: true, opacity: 0.88, roughness: 0.5, metalness: 0, envMapIntensity: 0.2 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
  }
  const syncMirror = () => { for (const [o, c] of pairs) { c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); } };
  function applyBg() { scene.background = st.transparent ? null : new THREE.Color(st.bg); renderer.setClearColor(0x000000, st.transparent ? 0 : 1); if (floor) floor.material.color.set(st.bg); }

  // ---------- loop ----------
  let raf, w = 0, h = 0, recording = null, stopped = false, animBusy = false, lastAnim = 0;
  const resize = () => { const r = host.getBoundingClientRect(); if (r.width !== w || r.height !== h) { w = r.width; h = r.height; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } };
  const animate = now => { // moving GIFs and foil stickers keep playing on the 3D model
    if (!movers.length || animBusy || now - lastAnim < 110) return;
    animBusy = true; lastAnim = now;
    Promise.all(movers.map(async k => { art[k].image = await drawFace(k); art[k].needsUpdate = true; })).finally(() => { animBusy = false; });
  };
  const tick = now => {
    if (stopped) return;
    if (!host.isConnected) { api.dispose(); return; }
    if (!recording) resize();
    if (st.auto && !recording) model.rotation.y += 0.004;
    if (st.spin && spinner) spinner.rotation.z -= 0.08;
    if (lidPivot) lidPivot.rotation.y += ((-st.open * lidMax) - lidPivot.rotation.y) * 0.15;
    key.intensity = 1.2 * st.light; rim.intensity = 0.8 * st.light; scene.environmentIntensity = st.light;
    animate(now || performance.now());
    syncMirror(); controls.update(); renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  resize(); build(); applyBg(); tick();

  // ---------- api ----------
  const api = {
    st,
    set(k, v) { st[k] = v; if (['format', 'caseColor', 'count', 'dome', 'rainbow'].includes(k)) build(); if (k === 'mirror') applyFloor(); if (k === 'bg' || k === 'transparent') applyBg(); },
    rebuild() { build(); },
    async refresh() { for (const k of Object.keys(FACE_SIZE)) { art[k].image = await drawFace(k); art[k].needsUpdate = true; } findMovers(); build(); },
    frame() { framedFor = null; build(); },
    view(name) {
      model.rotation.set(0, 0, 0); const dist = camera.position.distanceTo(controls.target);
      const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0.0001], right: [1, 0, 0.0001], top: [0, 1, 0.0001], three: [0.6, 0.35, 1], hero: [0.45, 0.22, 1] };
      const v = new V3(...dirs[name]).normalize().multiplyScalar(dist); camera.position.copy(controls.target).add(v); controls.update();
    },
    zoom(k) { const v = camera.position.clone().sub(controls.target).multiplyScalar(k); const L = v.length(); if (L < controls.minDistance || L > controls.maxDistance) return; camera.position.copy(controls.target).add(v); controls.update(); },
    turn(axis) { model.rotation[axis] += Math.PI / 2; },
    // still image at any size; mime: image/png, image/jpeg, image/webp
    async snapshot(size, mime, transparent) {
      const prevT = st.transparent; st.transparent = !!transparent && mime !== 'image/jpeg'; applyBg();
      const fl = floor, mi = mirror; if (st.transparent) { if (fl) fl.visible = false; if (mi) mi.visible = false; }
      const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(size, size, false); camera.aspect = 1; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const blob = await new Promise(r => renderer.domElement.toBlob(r, mime, 0.95));
      st.transparent = prevT; applyBg(); if (fl) fl.visible = true; if (mi) mi.visible = true; renderer.setPixelRatio(pr); w = 0; resize();
      return blob;
    },
    videoTypes() { return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].filter(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)); },
    record(seconds = 6, mime = 'video/webm', size = 1080) {
      return new Promise((res, rej) => {
        const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(size, size, false); camera.aspect = 1; camera.updateProjectionMatrix();
        const stream = renderer.domElement.captureStream(30), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 }), chunks = [];
        rec.ondataavailable = e => e.data.size && chunks.push(e.data);
        rec.onstop = () => { recording = null; renderer.setPixelRatio(pr); w = 0; resize(); res(new Blob(chunks, { type: mime.split(';')[0] })); };
        rec.onerror = e => rej(e.error || e);
        const y0 = model.rotation.y, t0 = performance.now();
        recording = () => { const t = (performance.now() - t0) / 1000; model.rotation.y = y0 + Math.min(1, t / seconds) * Math.PI * 2; if (t >= seconds) { rec.stop(); recording = () => { }; } };
        const step = () => { if (recording) { recording(); requestAnimationFrame(step); } };
        rec.start(); step();
      });
    },
    // frames for a GIF: one full turn, rendered frame by frame so it loops perfectly
    async gifFrames(frames = 48, size = 480, onProgress) {
      const pr = renderer.getPixelRatio(); renderer.setPixelRatio(1); renderer.setSize(size, size, false); camera.aspect = 1; camera.updateProjectionMatrix();
      const [c, g] = cnv(size), out = [];
      const y0 = model.rotation.y, spin0 = spinner ? spinner.rotation.z : 0, wasAuto = st.auto; st.auto = false; recording = () => { };
      for (let i = 0; i < frames; i++) {
        model.rotation.y = y0 + i / frames * Math.PI * 2; if (spinner && st.spin) spinner.rotation.z = spin0 - i / frames * Math.PI * 4;
        syncMirror(); controls.update(); renderer.render(scene, camera);
        g.fillStyle = st.bg; g.fillRect(0, 0, size, size); g.drawImage(renderer.domElement, 0, 0, size, size); out.push(g.getImageData(0, 0, size, size));
        onProgress?.(i / frames); await new Promise(r => setTimeout(r, 0));
      }
      model.rotation.y = y0; st.auto = wasAuto; recording = null; renderer.setPixelRatio(pr); w = 0; resize();
      void c; return out;
    },
    exportGLB() {
      return new Promise((res, rej) => new GLTFExporter().parse(model, r => res(new Blob([r], { type: 'model/gltf-binary' })), rej, { binary: true }));
    },
    dispose() { stopped = true; cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); pmrem.dispose(); renderer.domElement.remove(); },
  };
  return api;
}
