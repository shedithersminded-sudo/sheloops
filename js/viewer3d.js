// Real 3D viewer (three.js): CD + clear case, CD alone, MiniDisc. Orbit all the way around, export images, video and GLB.
import * as THREE from 'three';
import { OrbitControls } from '../vendor/three/addons/OrbitControls.js';
import { RoomEnvironment } from '../vendor/three/addons/RoomEnvironment.js';
import { GLTFExporter } from '../vendor/three/addons/GLTFExporter.js';
import { faceCanvas, ensureDesign } from './art.js';

const tex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

export async function mountViewer(host, d, o = {}) {
  ensureDesign(d);
  const st = { format: o.format || (d.mock.format === 'minidisc' ? 'minidisc' : 'cdcase'), open: 0, spin: false, auto: true, mirror: true, bg: o.bg || '#0b0b0d', transparent: false, light: 1, caseColor: d.mock.slim || '#7a3cff', count: 40, dome: true };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 1, -2); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100); camera.position.set(1.2, 0.5, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minDistance = 1.4; controls.maxDistance = 9; controls.target.set(0, 0, 0);
  const model = new THREE.Group(); scene.add(model);
  let floor = null, spinner = null, lidPivot = null;

  // ---------- textures ----------
  const discTex = tex(await faceCanvas(d, 'disc', { size: 1024, labelOnly: true }));
  const mdTex = tex(await faceCanvas(d, 'mdlabel', { size: 900 }));

  // ---------- parts ----------
  // shiny data side: silver with rainbow diffraction streaks (drawn, then lit as metal + thin-film)
  const DYES = { silver: ['#e9ecf0', '#bfc5cd', '#eef0f3', 0.35], green: ['#c9d48f', '#6f8f4a', '#a8b86a', 0.18], blue: ['#7fa6e0', '#2c4f8f', '#5b7fc4', 0.2], purple: ['#b58fe0', '#5b3a8c', '#8a62c4', 0.2], gold: ['#f0d78a', '#b8923a', '#e0bd62', 0.18], magenta: ['#d0508f', '#6e1340', '#a52a66', 0.25], red: ['#e0606a', '#7a121c', '#b52a35', 0.25], black: ['#4a4a50', '#121214', '#2a2a2e', 0.3] };
  function dataCanvas(dye = 'silver') {
    const [c0, c1, c2, rain] = DYES[dye] || DYES.silver;
    const N = 1024, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), m = N / 2;
    const rg = g.createRadialGradient(m, m, N * 0.08, m, m, m); rg.addColorStop(0, c0); rg.addColorStop(0.5, c1); rg.addColorStop(1, c2);
    g.fillStyle = rg; g.fillRect(0, 0, N, N);
    const cg = g.createConicGradient(0.6, m, m); ['#ff4d6d', '#ffd24d', '#5dff8a', '#4dd2ff', '#a64dff', '#ff4dd2', '#ff4d6d'].forEach((col, i, a) => cg.addColorStop(i / (a.length - 1), col));
    g.globalAlpha = rain; g.fillStyle = cg; g.fillRect(0, 0, N, N); g.globalAlpha = 1;
    for (const [a0, a1, n] of [[0.4, 1.3, 60], [3.5, 4.3, 50]]) for (let i = 0; i < n; i++) {
      const t = i / (n - 1), a = a0 + (a1 - a0) * t; g.strokeStyle = `hsla(${(t * 320 + 300) % 360},100%,60%,${0.85 * Math.sin(t * Math.PI)})`; g.lineWidth = 3;
      g.beginPath(); g.moveTo(m + Math.cos(a) * m * 0.42, m + Math.sin(a) * m * 0.42); g.lineTo(m + Math.cos(a) * m * 0.99, m + Math.sin(a) * m * 0.99); g.stroke();
    }
    g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; for (let r = m * 0.3; r < m; r += 6) { g.beginPath(); g.arc(m, m, r, 0, 7); g.stroke(); }
    return c;
  }
  const dataSide = new THREE.MeshPhysicalMaterial({ map: tex(dataCanvas(d.disc.dye || 'silver')), color: 0xffffff, metalness: 0.85, roughness: 0.14, iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [180, 900], clearcoat: 1, side: THREE.DoubleSide });
  function makeDisc(r = 0.6, hole = 0.075, labelled = true) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.RingGeometry(hole, r, 160, 1),
      labelled ? new THREE.MeshPhysicalMaterial({ map: discTex, alphaTest: 0.35, roughness: 0.32, metalness: 0.15, clearcoat: 0.9, clearcoatRoughness: 0.08 }) : dataSide); // solid (alphaTest), so it shows through clear plastic
    top.position.z = 0.0064; g.add(top);
    if (labelled) { // the real disc surface under the print: shows wherever the art is blank
      const under = new THREE.Mesh(new THREE.RingGeometry(hole, r, 160, 1), discFace()); under.position.z = 0.0058; g.add(under);
      const hubM = new THREE.Mesh(new THREE.RingGeometry(hole, 0.19, 96, 1), new THREE.MeshPhysicalMaterial({ color: 0xdfe6ee, transmission: 0.9, roughness: 0.2, thickness: 0.01 })); hubM.position.z = 0.0066; g.add(hubM);
    }
    const bottom = new THREE.Mesh(new THREE.RingGeometry(hole, r, 160, 1), dataSide); bottom.rotation.y = Math.PI; bottom.position.z = -0.0062; g.add(bottom);
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.012, 160, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 0.8, roughness: 0.3 })); edge.rotation.x = Math.PI / 2; g.add(edge);
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(hole, hole, 0.012, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0xbfc4cb, metalness: 0.5, roughness: 0.3, side: THREE.BackSide })); inner.rotation.x = Math.PI / 2; g.add(inner);
    return g;
  }
  function discFace() {
    const m = d.disc.material, tint = { gold: 0xcfa83a, rosegold: 0xe3ac9e, pink: 0xff9ac9, purple: 0x9b6bff, blue: 0x4a8cff, black: 0x18181a, white: 0xf2f2f0, vintage: 0xc9b48c, retro: 0xe7e0cf, custom: d.disc.color }[m];
    if (!tint) return dataSide; // silver, rainbow, holographic, transparent, frosted: shiny rainbow
    const matte = ['white', 'vintage', 'retro'].includes(m);
    return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint), metalness: matte ? 0.1 : 0.9, roughness: matte ? 0.6 : 0.18, iridescence: matte ? 0 : 0.6, iridescenceIOR: 1.8, clearcoat: 1 });
  }
  const clear = (opts = {}) => new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, roughness: 0.04, thickness: 0.03, ior: 1.5, metalness: 0, transparent: true, ...opts });
  function makeCase() {
    const g = new THREE.Group(), W = 1.42, T = 0.11;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(W, W, 0.02), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.35, clearcoat: 0.6 })); tray.position.z = -0.045; g.add(tray);
    for (const [r, h] of [[0.16, 0.03], [0.11, 0.04], [0.07, 0.05]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 64, 1, true), clear({ roughness: 0.15 })); c.rotation.x = Math.PI / 2; c.position.z = -0.03; g.add(c); }
    // sides (thickness), slightly frosted clear plastic
    const sideM = clear({ roughness: 0.18, thickness: 0.05 });
    for (const [w, h, x, y] of [[W, 0.012, 0, W / 2], [W, 0.012, 0, -W / 2], [0.012, W, W / 2, 0]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, T), sideM); s.position.set(x, y, 0); g.add(s); }
    // lid on a hinge at the left edge
    lidPivot = new THREE.Group(); lidPivot.position.set(-W / 2, 0, 0.05); g.add(lidPivot);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(W, W, 0.012), clear()); lid.position.x = W / 2; lidPivot.add(lid);
    const lidEdge = new THREE.Mesh(new THREE.BoxGeometry(W - 0.06, W - 0.06, 0.004), clear({ roughness: 0.25 })); lidEdge.position.set(W / 2, 0, -0.008); lidPivot.add(lidEdge);
    for (const y of [-0.45, 0.45]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 24), clear({ roughness: 0.2 })); h.position.set(-W / 2, y, 0.02); g.add(h); }
    const disc = makeDisc(); disc.position.set(0.02, 0, 0); spinner = disc; g.add(disc);
    return g;
  }
  function roundedShape(w, h, r) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2); s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5); return s; }
  function makeMiniDisc() {
    const g = new THREE.Group(), W = 1.42, H = 1.36, D = 0.09, col = new THREE.Color(d.mock.shell);
    const geo = new THREE.ExtrudeGeometry(roundedShape(W, H, 0.06), { depth: D, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 3, curveSegments: 16 }); geo.translate(0, 0, -D / 2);
    // tinted clear plastic: a light tint on the surface plus color that builds up through the thickness
    const tint = new THREE.Color('#ffffff').lerp(col, d.mock.shellAlpha * 0.85);
    const shell = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: tint, transmission: 1, roughness: 0.05, thickness: 0.06, ior: 1.45, attenuationColor: col, attenuationDistance: d.mock.shellAlpha < 0.05 ? 1e6 : 1.2 - d.mock.shellAlpha, clearcoat: 1, clearcoatRoughness: 0.05, specularIntensity: 1 }));
    g.add(shell);
    const disc = makeDisc(0.62, 0.06, false); disc.position.set(-0.06, 0, 0); spinner = disc; g.add(disc);
    const mdM = new THREE.MeshPhysicalMaterial({ map: tex(dataCanvas(d.mock.mdDisc || 'silver')), metalness: 0.85, roughness: 0.14, iridescence: 1, iridescenceIOR: 1.9, clearcoat: 1, side: THREE.DoubleSide });
    disc.traverse(o => { if (o.material === dataSide) o.material = mdM; });
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.016, 64), new THREE.MeshStandardMaterial({ color: 0x9ea4ac, metalness: 1, roughness: 0.25 })); hub.rotation.x = Math.PI / 2; disc.add(hub);
    const metal = d.mock.shutter === 'black' ? new THREE.MeshStandardMaterial({ color: 0x18181a, metalness: 0.4, roughness: 0.4 }) : d.mock.shutter === 'color' ? new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, clearcoat: 1 }) : new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.35 });
    for (const z of [D / 2 + 0.012, -D / 2 - 0.012]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.52, 0.006), metal); s.position.set(0.32, -0.02, z); g.add(s); }
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58 * 640 / 900), new THREE.MeshPhysicalMaterial({ map: mdTex, roughness: 0.5, clearcoat: 0.3 })); label.position.set(0.32, -0.02, D / 2 + 0.016); g.add(label);
    // printed "insert this end" decal
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '600 44px "Space Grotesk", Arial'; x.textBaseline = 'middle'; x.fillText('INSERT THIS END', 10, 64); x.beginPath(); x.moveTo(470, 30); x.lineTo(500, 100); x.lineTo(440, 100); x.fill();
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), new THREE.MeshBasicMaterial({ map: tex(c), transparent: true })); decal.position.set(0.3, 0.52, D / 2 + 0.011); g.add(decal);
    return g;
  }
  // tinted see-through plastic
  const tinted = (hex, strength = 0.6, rough = 0.08) => { const col = new THREE.Color(hex); return new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#ffffff').lerp(col, strength), transmission: 1, roughness: rough, thickness: 0.03, ior: 1.48, attenuationColor: col, attenuationDistance: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 }); };
  // slim case: colored tray + clear lid on a hinge
  function makeSlim(color, withDisc = true, open = null) {
    const g = new THREE.Group(), W = 1.42, H = 1.25, trayM = tinted(color, 0.65), lidM = clear({ roughness: 0.03 });
    const tray = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.022), trayM); tray.position.z = -0.012; g.add(tray);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.61, 0.006, 8, 128), trayM); rim.position.set(0.04, 0, 0.0); g.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.02, 32), trayM); hub.rotation.x = Math.PI / 2; hub.position.set(0.04, 0, 0.005); g.add(hub);
    for (let i = 0; i < 8; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.016), trayM), a = i * Math.PI / 4; t.position.set(0.04 + Math.cos(a) * 0.105, Math.sin(a) * 0.105, 0.006); t.rotation.z = a; g.add(t); }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.05, H, 0.05), clear({ roughness: 0.25 })); spine.position.set(-W / 2 + 0.025, 0, 0.005); g.add(spine);
    const pivot = new THREE.Group(); pivot.position.set(-W / 2 + 0.05, 0, 0.022); g.add(pivot);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(W - 0.05, H, 0.01), lidM); lid.position.x = (W - 0.05) / 2; pivot.add(lid);
    if (open == null) lidPivot = pivot; else pivot.rotation.y = -open;
    if (withDisc) { const disc = makeDisc(); disc.position.set(0.04, 0, 0.004); g.add(disc); if (open == null) spinner = disc; }
    return g;
  }
  function makeFan() {
    const g = new THREE.Group(), cols = ['#7a3cff', '#ff2f8f', '#ff9a1f', '#2f6bff', '#2fd06a'];
    cols.forEach((c, i) => { const s = makeSlim(c, i === 3, 0); s.rotation.x = -Math.PI / 2 + 0.02; s.position.set(-0.55 + (i % 3) * 0.55 + (i > 2 ? 0.25 : 0), -0.45 + i * 0.03, -0.5 + (i > 2 ? 0.75 : i * 0.18)); s.rotation.z = (i - 2) * 0.05; g.add(s); });
    return g;
  }
  // spindle stack (cake box) with dye-colored edges and my disc on top
  function makeSpindle() {
    const g = new THREE.Group(), n = st.count, h = n * 0.012;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.74, 0.06, 96), new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.4, clearcoat: 0.5 })); base.position.y = -0.8 + 0.03; g.add(base);
    const c = document.createElement('canvas'); c.width = 8; c.height = 256; const x = c.getContext('2d'), dye = { silver: '#cfd4da', green: '#7c9a52', blue: '#3c63b0', purple: '#6b47a3', gold: '#c49c42' }[d.disc.dye || 'silver'];
    for (let i = 0; i < 256; i += 4) { x.fillStyle = i % 8 ? '#e6e9ed' : dye; x.fillRect(0, i, 8, 3); x.fillStyle = '#20232a'; x.fillRect(0, i + 3, 8, 1); }
    const sideTex = tex(c); sideTex.wrapT = THREE.RepeatWrapping; sideTex.repeat.set(1, n / 64);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, h, 128, 1, true), new THREE.MeshPhysicalMaterial({ map: sideTex, metalness: 0.6, roughness: 0.3 })); stack.position.y = -0.74 + h / 2; g.add(stack);
    const under = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.6, 128), dataSide); under.rotation.x = Math.PI / 2; under.position.y = -0.74; g.add(under);
    const top = makeDisc(); top.rotation.x = -Math.PI / 2; top.position.y = -0.74 + h + 0.006; g.add(top); spinner = top;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h + 0.5, 32), new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.35 })); rod.position.y = -0.74 + (h + 0.5) / 2; g.add(rod);
    if (st.dome) { const dm = clear({ roughness: 0.04, thickness: 0.02 }); const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.71, h + 0.62, 96, 1, true), dm); dome.position.y = -0.74 + (h + 0.62) / 2; g.add(dome); const cap = new THREE.Mesh(new THREE.CircleGeometry(0.71, 96), dm); cap.rotation.x = -Math.PI / 2; cap.position.y = -0.74 + h + 0.62; g.add(cap); }
    g.position.y = 0.2 - h / 2 * 0.3;
    return g;
  }
  // zip wallet open like a book, with sleeves holding discs
  function makeWallet() {
    const g = new THREE.Group(), fab = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x333338) });
    const coverGeo = new THREE.BoxGeometry(1.45, 1.55, 0.08);
    const left = new THREE.Mesh(coverGeo, fab); left.position.set(-0.76, 0, 0); left.rotation.y = 0.35; g.add(left);
    const right = new THREE.Mesh(coverGeo, fab); right.position.set(0.76, 0, 0); right.rotation.y = -0.35; g.add(right);
    const zip = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.4 });
    for (const s of [left, right]) { const z = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.012, 6, 64, Math.PI), zip); z.scale.set(1, 1.05, 1); z.position.z = 0.045; z.rotation.z = s === left ? Math.PI / 2 : -Math.PI / 2; s.add(z); }
    const sleeve = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.85, roughness: 0.35, thickness: 0.005, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 4; i++) {
      const page = new THREE.Group(); page.position.set(-0.05 + i * 0.03, 0, 0.06 + i * 0.012); page.rotation.y = 0.35 - i * 0.22;
      const disc = makeDisc(0.6, 0.075, i === 3); disc.position.x = 0.7; page.add(disc); if (i === 3) spinner = disc;
      const sl = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35), sleeve); sl.position.set(0.7, 0, 0.01); page.add(sl);
      g.add(page);
    }
    return g;
  }
  // loose pile of discs on the floor
  function makePile() {
    const g = new THREE.Group(), r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
    for (let i = 0; i < 7; i++) {
      const disc = makeDisc(0.6, 0.075, i % 2 === 0); disc.rotation.x = -Math.PI / 2 + (r() - 0.5) * 0.15; disc.rotation.z = r() * 6;
      if (i % 3 === 1) disc.rotation.x += Math.PI;
      disc.position.set((r() - 0.5) * 1.6, -0.79 + i * 0.016, (r() - 0.5) * 1.2); g.add(disc);
    }
    return g;
  }
  function build() {
    model.clear(); spinner = null; lidPivot = null;
    if (st.format === 'minidisc') model.add(makeMiniDisc());
    else if (st.format === 'disc') { const disc = makeDisc(); spinner = disc; model.add(disc); }
    else if (st.format === 'slim') model.add(makeSlim(st.caseColor));
    else if (st.format === 'fan') model.add(makeFan());
    else if (st.format === 'spindle') model.add(makeSpindle());
    else if (st.format === 'wallet') model.add(makeWallet());
    else if (st.format === 'pile') model.add(makePile());
    else model.add(makeCase());
    applyFloor();
  }
  // Mirror floor: a live upside-down copy under a glossy, partly see-through floor.
  // (three's Reflector shares the glass render step and breaks see-through plastic, so it is not used.)
  let mirror = null, pairs = [];
  const FLOOR_Y = -0.82;
  function applyFloor() {
    if (floor) { scene.remove(floor); floor = null; }
    if (mirror) { scene.remove(mirror); mirror = null; pairs = []; }
    if (!st.mirror) return;
    mirror = new THREE.Group(); mirror.scale.y = -1; mirror.position.y = 2 * FLOOR_Y;
    const copy = model.clone(true); mirror.add(copy); scene.add(mirror);
    const a = [], b = []; model.traverse(o => a.push(o)); copy.traverse(o => b.push(o)); pairs = a.map((o, i) => [o, b[i]]);
    floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshPhysicalMaterial({ color: st.transparent ? 0x000000 : new THREE.Color(st.bg), transparent: true, opacity: 0.86, roughness: 0.55, metalness: 0, envMapIntensity: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
  }
  const syncMirror = () => { for (const [o, c] of pairs) { c.position.copy(o.position); c.quaternion.copy(o.quaternion); c.scale.copy(o.scale); } };
  function applyBg() { scene.background = st.transparent ? null : new THREE.Color(st.bg); renderer.setClearColor(0x000000, st.transparent ? 0 : 1); if (floor) floor.material.color.set(st.bg); }

  // ---------- loop ----------
  let raf, w = 0, h = 0, recording = null, stopped = false;
  const resize = () => { const r = host.getBoundingClientRect(); if (r.width !== w || r.height !== h) { w = r.width; h = r.height; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); } };
  const tick = () => {
    if (stopped) return;
    if (!host.isConnected) { api.dispose(); return; }
    if (!recording) resize();
    if (st.auto && !recording) model.rotation.y += 0.004;
    if (st.spin && spinner) spinner.rotation.z -= 0.08; // spindle/pile discs lie flat, so z is still their spin axis
    if (lidPivot) lidPivot.rotation.y += ((-st.open * Math.PI * 0.75) - lidPivot.rotation.y) * 0.15;
    key.intensity = 1.4 * st.light; scene.environmentIntensity = st.light;
    syncMirror(); controls.update(); renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  build(); applyBg(); tick();

  // ---------- api ----------
  const api = {
    st,
    set(k, v) { st[k] = v; if (['format', 'caseColor', 'count', 'dome'].includes(k)) build(); if (k === 'mirror') applyFloor(); if (k === 'bg' || k === 'transparent') applyBg(); },
    async refresh() { discTex.image = await faceCanvas(d, 'disc', { size: 1024, labelOnly: true }); discTex.needsUpdate = true; mdTex.image = await faceCanvas(d, 'mdlabel', { size: 900 }); mdTex.needsUpdate = true; build(); },
    view(name) {
      model.rotation.set(0, 0, 0); const dist = camera.position.distanceTo(controls.target);
      const dirs = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0.0001], right: [1, 0, 0.0001], top: [0, 1, 0.0001], three: [0.6, 0.35, 1] };
      const v = new THREE.Vector3(...dirs[name]).normalize().multiplyScalar(dist); camera.position.copy(v); controls.update();
    },
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
    // one full turn, square video
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
    exportGLB() {
      return new Promise((res, rej) => new GLTFExporter().parse(model, r => res(new Blob([r], { type: 'model/gltf-binary' })), rej, { binary: true }));
    },
    dispose() { stopped = true; cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); pmrem.dispose(); renderer.domElement.remove(); },
  };
  return api;
}
