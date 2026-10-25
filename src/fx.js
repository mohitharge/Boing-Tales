import * as THREE from 'three';

// ---------- Particles (one instanced mesh, pooled) ----------
const MAX = 600;
const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class Particles {
  constructor(scene) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) {
      this.mesh.setColorAt(i, tmpColor.set('#fff'));
      dummy.scale.setScalar(0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(this.mesh);
    this.items = Array.from({ length: MAX }, () => ({
      life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0.1, g: 0, spin: 0, drag: 0,
    }));
    this.cursor = 0;
  }

  emit(x, y, z, { color = '#fff', count = 12, speed = 4, size = 0.12, life = 0.7, gravity = -12, spread = Math.PI * 2, dir = 0, up = 0, drag = 1.5, zSpread = 1 } = {}) {
    const colors = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count; i++) {
      const p = this.items[this.cursor];
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const a = dir + (Math.random() - 0.5) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s + up;
      p.vz = (Math.random() - 0.5) * speed * zSpread;
      p.life = p.max = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.g = gravity;
      p.drag = drag;
      p.spin = Math.random() * 10;
      this.mesh.setColorAt(idx, tmpColor.set(colors[i % colors.length]));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vy += p.g * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d; p.vy *= d; p.vz *= d;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const k = Math.max(0, p.life / p.max);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.spin * k, p.spin * 0.7 * k, 0);
      dummy.scale.setScalar(p.life > 0 ? p.size * Math.sqrt(k) : 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (const p of this.items) p.life = 0;
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, dummy.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Canvas textures ----------
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function skyTexture(top, bottom) {
  return canvasTex(4, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function ballTexture() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#ff4760';
    g.fillRect(0, 0, w, h);
    // equator band + polka dots so rolling is readable
    g.fillStyle = '#ff6b80';
    g.fillRect(0, h * 0.44, w, h * 0.12);
    g.fillStyle = '#ffd1d8';
    const dots = [[0.12, 0.25], [0.37, 0.7], [0.62, 0.25], [0.87, 0.7], [0.25, 0.78], [0.75, 0.2]];
    for (const [u, v] of dots) {
      g.beginPath();
      g.ellipse(u * w, v * h, 26, 22, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function crackTexture(base) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // brick-ish tiles
    g.strokeStyle = 'rgba(60,40,30,0.25)';
    g.lineWidth = 4;
    for (let y = 0; y <= h; y += 64) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      for (let x = (y / 64) % 2 ? 32 : 0; x <= w; x += 64) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke();
      }
    }
    // cracks
    g.strokeStyle = 'rgba(40,25,20,0.75)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    const crack = (x, y, a, len, depth) => {
      if (depth <= 0 || len < 6) return;
      const nx = x + Math.cos(a) * len;
      const ny = y + Math.sin(a) * len;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      crack(nx, ny, a + (Math.random() - 0.5) * 1.2, len * 0.75, depth - 1);
      if (Math.random() < 0.5) crack(nx, ny, a + (Math.random() > 0.5 ? 0.9 : -0.9), len * 0.5, depth - 2);
    };
    for (let i = 0; i < 3; i++) crack(w / 2, h / 2, (i / 3) * Math.PI * 2 + 0.4, 40, 5);
  });
}

export function portalTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.3, '#ffe6ff');
    grad.addColorStop(0.7, '#b18cff');
    grad.addColorStop(1, '#6a5cff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      for (let t = 0; t < 1; t += 0.01) {
        const a = t * Math.PI * 3 + (i / 5) * Math.PI * 2;
        const r = t * w * 0.5;
        const x = w / 2 + Math.cos(a) * r;
        const y = h / 2 + Math.sin(a) * r;
        t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

// Seeded RNG so level decorations stay the same between plays.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
