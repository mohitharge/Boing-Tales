import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { THEMES } from './levels.js';
import { crackTexture, portalTexture, rng } from './fx.js';

export const WORLD_BOTTOM = -16;
export const DEATH_Y = -12;
const Z_FRONT = 2;
const Z_BACK = -6;
const DEPTH = Z_FRONT - Z_BACK;

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });

function surfaceAt(profile, x) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [ax, ay] = profile[i];
    const [bx, by] = profile[i + 1];
    if (bx > ax && x >= ax && x <= bx) return ay + ((by - ay) * (x - ax)) / (bx - ax);
  }
  return null;
}

function slopeAt(profile, x) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [ax, ay] = profile[i];
    const [bx, by] = profile[i + 1];
    if (bx > ax && x >= ax && x <= bx) return (by - ay) / (bx - ax);
  }
  return Infinity;
}

function boxSegs(x, y, w, h) {
  return [
    [x, y + h, x + w, y + h],
    [x + w, y + h, x + w, y],
    [x + w, y, x, y],
    [x, y, x, y + h],
  ];
}

function makeSolid(segs, opts = {}) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [ax, ay, bx, by] of segs) {
    minX = Math.min(minX, ax, bx); maxX = Math.max(maxX, ax, bx);
    minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by);
  }
  return { segs, minX, maxX, minY, maxY, ox: 0, oy: 0, dxStep: 0, dyStep: 0, alive: true, oneWay: false, kind: 'solid', ...opts };
}

export class World {
  constructor(scene, level, index) {
    this.scene = scene;
    this.level = level;
    this.index = index;
    this.theme = THEMES[level.theme];
    this.group = new THREE.Group();
    scene.add(this.group);
    this.rand = rng(1234 + index * 977);

    this.solids = [];
    this.water = [];
    this.gems = [];
    this.hearts = [];
    this.spikes = [];
    this.enemies = [];
    this.springs = [];
    this.totems = [];
    this.checkpoints = [];
    this.movers = [];
    this.clouds = [];
    this.animated = [];

    const xs = level.terrain.flat().map((p) => p[0]);
    this.minX = Math.min(...xs);
    this.maxX = Math.max(...xs, level.goal[0] + 10);

    this.mats = {
      grass: std(this.theme.grass, { roughness: 0.85 }),
      block: std(this.theme.block, { roughness: 0.6 }),
      platform: std(this.theme.platform, { roughness: 0.7 }),
      gem: new THREE.MeshStandardMaterial({
        color: this.theme.gem, emissive: this.theme.gem, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.2, flatShading: true,
      }),
      white: std('#ffffff', { roughness: 0.4 }),
      black: new THREE.MeshBasicMaterial({ color: '#1d1636' }),
    };

    this.buildTerrain();
    this.buildBlocks();
    this.buildWater();
    this.buildSpikes();
    this.buildGems();
    this.buildHearts();
    this.buildEnemies();
    this.buildSprings();
    this.buildTotems();
    this.buildCheckpoints();
    this.buildGoal();
    this.buildDecor();
    this.buildBackground();
  }

  // ---------- Terrain ----------
  buildTerrain() {
    const t = this.theme;
    const cTop = new THREE.Color(t.dirtTop);
    const cBot = new THREE.Color(t.dirtBottom);
    const tmp = new THREE.Color();
    const dirtMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const pebbleMat = std(t.pebble, { roughness: 0.9 });
    const pebbleGeo = new THREE.SphereGeometry(1, 10, 8);
    const jointGeo = new THREE.CylinderGeometry(0.21, 0.21, DEPTH + 0.6, 16);
    jointGeo.rotateX(Math.PI / 2);

    for (const profile of this.level.terrain) {
      const first = profile[0];
      const last = profile[profile.length - 1];

      // collision: surface + side walls
      const segs = [];
      segs.push([first[0], WORLD_BOTTOM, first[0], first[1]]);
      for (let i = 0; i < profile.length - 1; i++) {
        const [ax, ay] = profile[i];
        const [bx, by] = profile[i + 1];
        if (ax !== bx || ay !== by) segs.push([ax, ay, bx, by]);
      }
      segs.push([last[0], last[1], last[0], WORLD_BOTTOM]);
      this.solids.push(makeSolid(segs, { kind: 'terrain' }));

      // mesh
      const shape = new THREE.Shape();
      shape.moveTo(first[0], WORLD_BOTTOM);
      for (const [x, y] of profile) shape.lineTo(x, y);
      shape.lineTo(last[0], WORLD_BOTTOM);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: DEPTH, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelOffset: -0.25, bevelSegments: 3, curveSegments: 1,
      });
      geo.translate(0, 0, Z_BACK);
      const maxTop = Math.max(...profile.map((p) => p[1]));
      const pos = geo.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const k = THREE.MathUtils.smoothstep(y, WORLD_BOTTOM + 2, maxTop);
        tmp.copy(cBot).lerp(cTop, k);
        colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const mesh = new THREE.Mesh(geo, dirtMat);
      mesh.receiveShadow = true;
      this.group.add(mesh);

      // grass caps along walkable segments
      for (let i = 0; i < profile.length - 1; i++) {
        const [ax, ay] = profile[i];
        const [bx, by] = profile[i + 1];
        if (bx <= ax) continue;
        const len = Math.hypot(bx - ax, by - ay);
        const ang = Math.atan2(by - ay, bx - ax);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.42, DEPTH + 0.6), this.mats.grass);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        cap.position.set((ax + bx) / 2 - nx * 0.13, (ay + by) / 2 - ny * 0.13, (Z_BACK + Z_FRONT) / 2);
        cap.rotation.z = ang;
        cap.receiveShadow = true;
        this.group.add(cap);
        for (const [jx, jy] of [[ax, ay], [bx, by]]) {
          const j = new THREE.Mesh(jointGeo, this.mats.grass);
          j.position.set(jx, jy - 0.13, (Z_BACK + Z_FRONT) / 2);
          j.receiveShadow = true;
          this.group.add(j);
        }
      }

      // pebbles on the front face
      const w = last[0] - first[0];
      const count = Math.min(80, Math.floor(w * 1.1));
      for (let i = 0; i < count; i++) {
        const x = first[0] + 0.6 + this.rand() * (w - 1.2);
        const top = surfaceAt(profile, x);
        if (top === null) continue;
        const y = WORLD_BOTTOM + 3 + this.rand() * (top - WORLD_BOTTOM - 4.2);
        if (y > top - 0.9) continue;
        const p = new THREE.Mesh(pebbleGeo, pebbleMat);
        const s = 0.12 + this.rand() * 0.22;
        p.scale.set(s * (1 + this.rand() * 0.6), s, s * 0.35);
        p.position.set(x, y, Z_FRONT + 0.02);
        this.group.add(p);
      }
    }
  }

  // ---------- Blocks, platforms, movers ----------
  buildBlocks() {
    const L = this.level;
    for (const [x, y, w, h] of L.blocks || []) {
      this.solids.push(makeSolid(boxSegs(x, y, w, h), { kind: 'block' }));
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, 3, 3, 0.14), this.mats.block);
      m.position.set(x + w / 2, y + h / 2, 0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      const cap = new THREE.Mesh(new RoundedBoxGeometry(w + 0.12, 0.3, 3.12, 3, 0.12), this.mats.grass);
      cap.position.set(x + w / 2, y + h - 0.1, 0);
      cap.receiveShadow = true;
      this.group.add(cap);
    }

    const crackMap = crackTexture('#c9a27e');
    const crackMat = new THREE.MeshStandardMaterial({ map: crackMap, roughness: 0.9 });
    for (const [x, y, w, h] of L.cracked || []) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, 3, 3, 0.1), crackMat);
      m.position.set(x + w / 2, y + h / 2, 0);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      this.solids.push(makeSolid(boxSegs(x, y, w, h), { kind: 'cracked', mesh: m, cx: x + w / 2, cy: y + h / 2, w, h }));
    }

    const puffGeo = new THREE.SphereGeometry(1, 16, 12);
    const buildPlatformMesh = (w, color) => {
      const g = new THREE.Group();
      const slab = new THREE.Mesh(new RoundedBoxGeometry(w, 0.5, 2.6, 3, 0.2), color);
      slab.position.y = -0.25;
      slab.castShadow = slab.receiveShadow = true;
      g.add(slab);
      const n = Math.max(2, Math.round(w / 1.1));
      for (let i = 0; i < n; i++) {
        const puff = new THREE.Mesh(puffGeo, color);
        const s = 0.35 + this.rand() * 0.2;
        puff.scale.set(s * 1.3, s, s);
        puff.position.set(-w / 2 + 0.4 + (i / (n - 1)) * (w - 0.8), -0.55, (this.rand() - 0.5) * 1.2);
        puff.castShadow = true;
        g.add(puff);
      }
      return g;
    };

    for (const [x, y, w] of L.platforms || []) {
      this.solids.push(makeSolid([[x, y, x + w, y]], { kind: 'platform', oneWay: true }));
      const g = buildPlatformMesh(w, this.mats.platform);
      g.position.set(x + w / 2, y, 0);
      this.group.add(g);
    }

    const moverMat = std(this.theme.accent, { roughness: 0.45 });
    const dotMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const [x, y, w, dx, dy, period] of L.movers || []) {
      const h = 0.6;
      const solid = makeSolid(boxSegs(x, y - h, w, h), { kind: 'mover', mover: { dx, dy, period } });
      const g = new THREE.Group();
      const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, 2.8, 3, 0.2), moverMat);
      body.position.y = -h / 2;
      body.castShadow = body.receiveShadow = true;
      g.add(body);
      for (let i = 0; i < 3; i++) {
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), dotMat);
        dot.position.set((i - 1) * 0.4, -h / 2, 1.41);
        g.add(dot);
      }
      g.position.set(x + w / 2, y, 0);
      this.group.add(g);
      solid.mesh = g;
      solid.base = [x + w / 2, y];
      this.solids.push(solid);
      this.movers.push(solid);
    }
  }

  stepMovers(time) {
    for (const s of this.movers) {
      const { dx, dy, period } = s.mover;
      const k = 0.5 - 0.5 * Math.cos((time / period) * Math.PI * 2);
      const nx = dx * k, ny = dy * k;
      s.dxStep = nx - s.ox;
      s.dyStep = ny - s.oy;
      s.ox = nx;
      s.oy = ny;
      s.mesh.position.set(s.base[0] + nx, s.base[1] + ny, 0);
    }
  }

  // ---------- Water ----------
  buildWater() {
    const t = this.theme;
    for (const [x1, x2, top, bottom] of this.level.water || []) {
      const w = x2 - x1, h = top - bottom;
      const mat = new THREE.MeshStandardMaterial({
        color: t.water, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.1, depthWrite: false,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH - 0.1), mat);
      body.position.set((x1 + x2) / 2, (top + bottom) / 2, (Z_BACK + Z_FRONT) / 2 - 0.1);
      body.renderOrder = 2;
      this.group.add(body);

      const surfGeo = new THREE.PlaneGeometry(w, DEPTH - 0.1, Math.ceil(w * 2), 6);
      surfGeo.rotateX(-Math.PI / 2);
      const surfMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(t.water).lerp(new THREE.Color('#ffffff'), 0.45), transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.2, depthWrite: false,
      });
      const surf = new THREE.Mesh(surfGeo, surfMat);
      surf.position.set((x1 + x2) / 2, top, (Z_BACK + Z_FRONT) / 2 - 0.1);
      surf.renderOrder = 3;
      this.group.add(surf);
      this.water.push({ x1, x2, top, bottom, surf, base: Float32Array.from(surfGeo.attributes.position.array) });
    }
  }

  // ---------- Hazards & pickups ----------
  buildSpikes() {
    const geo = new THREE.ConeGeometry(0.2, 0.62, 10);
    geo.translate(0, 0.31, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#eef0ff', metalness: 0.4, roughness: 0.25 });
    const baseMat = std('#4a3d6b');
    for (const [x, y, w] of this.level.spikes || []) {
      const n = Math.max(2, Math.round(w / 0.42));
      const base = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, 2.4, 2, 0.06), baseMat);
      base.position.set(x + w / 2, y + 0.04, 0);
      this.group.add(base);
      for (const z of [-0.8, 0, 0.8]) {
        for (let i = 0; i < n; i++) {
          const c = new THREE.Mesh(geo, mat);
          c.position.set(x + (i + 0.5) * (w / n) + (z === 0 ? 0 : 0.1), y + 0.1, z);
          c.castShadow = true;
          this.group.add(c);
        }
      }
      this.spikes.push({ x1: x, x2: x + w, y1: y, y2: y + 0.65 });
    }
  }

  buildGems() {
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    geo.scale(1, 1.35, 1);
    for (const [x, y] of this.level.gems || []) {
      const m = new THREE.Mesh(geo, this.mats.gem);
      m.position.set(x, y, 0);
      m.castShadow = true;
      this.group.add(m);
      this.gems.push({ x, y, mesh: m, taken: false, t: 0, phase: this.rand() * 6 });
    }
  }

  buildHearts() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.35);
    s.bezierCurveTo(-0.1, -0.25, -0.42, -0.05, -0.42, 0.14);
    s.bezierCurveTo(-0.42, 0.34, -0.22, 0.42, -0.1, 0.38);
    s.bezierCurveTo(-0.04, 0.36, 0, 0.3, 0, 0.26);
    s.bezierCurveTo(0, 0.3, 0.04, 0.36, 0.1, 0.38);
    s.bezierCurveTo(0.22, 0.42, 0.42, 0.34, 0.42, 0.14);
    s.bezierCurveTo(0.42, -0.05, 0.1, -0.25, 0, -0.35);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 4 });
    geo.center();
    const mat = new THREE.MeshStandardMaterial({ color: '#ff3d6e', emissive: '#ff3d6e', emissiveIntensity: 0.35, roughness: 0.3 });
    for (const [x, y] of this.level.hearts || []) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, 0);
      m.castShadow = true;
      this.group.add(m);
      this.hearts.push({ x, y, mesh: m, taken: false, t: 0 });
    }
  }

  buildEnemies() {
    const bodyGeo = new THREE.SphereGeometry(0.55, 32, 20);
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#7b5cff', roughness: 0.35, clearcoat: 0.6 });
    const bellyMat = std('#b9a6ff');
    const eyeGeo = new THREE.SphereGeometry(0.15, 16, 12);
    const pupilGeo = new THREE.SphereGeometry(0.075, 12, 8);
    const browGeo = new THREE.BoxGeometry(0.26, 0.06, 0.06);
    const footGeo = new THREE.SphereGeometry(0.17, 12, 8);
    const footMat = std('#4b33b8');
    const hornGeo = new THREE.ConeGeometry(0.09, 0.3, 8);
    const hornMat = std('#ffd84d');

    for (const [x, y, range] of this.level.enemies || []) {
      const g = new THREE.Group();
      const body = new THREE.Group();
      const b = new THREE.Mesh(bodyGeo, bodyMat);
      b.castShadow = true;
      body.add(b);
      const belly = new THREE.Mesh(bodyGeo, bellyMat);
      belly.scale.set(0.6, 0.5, 0.3);
      belly.position.set(0, -0.15, 0.42);
      body.add(belly);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, this.mats.white);
        eye.position.set(side * 0.19, 0.14, 0.44);
        eye.scale.z = 0.6;
        body.add(eye);
        const p = new THREE.Mesh(pupilGeo, this.mats.black);
        p.position.set(side * 0.19, 0.12, 0.54);
        body.add(p);
        const brow = new THREE.Mesh(browGeo, this.mats.black);
        brow.position.set(side * 0.19, 0.32, 0.5);
        brow.rotation.z = side * -0.45;
        body.add(brow);
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(side * 0.28, 0.52, 0);
        horn.rotation.z = side * -0.4;
        body.add(horn);
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(side * 0.26, -0.48, 0.1);
        foot.scale.set(1.2, 0.7, 1.4);
        foot.castShadow = true;
        g.add(foot);
        g.userData[side < 0 ? 'footL' : 'footR'] = foot;
      }
      body.position.y = 0.55;
      g.add(body);
      g.position.set(x, y + 0.05, 0);
      this.group.add(g);
      this.enemies.push({ x0: x, x, y, range, dir: 1, speed: 1.7, alive: true, dying: 0, mesh: g, body, t: this.rand() * 5 });
    }
  }

  updateEnemies(dt) {
    for (const e of this.enemies) {
      if (!e.alive) {
        if (e.dying > 0) {
          e.dying -= dt;
          const k = Math.max(0, e.dying / 0.4);
          e.mesh.scale.set(1 + (1 - k) * 0.6, k * 0.25 + 0.01, 1 + (1 - k) * 0.6);
          if (e.dying <= 0) e.mesh.visible = false;
        }
        continue;
      }
      e.t += dt;
      e.x += e.dir * e.speed * dt;
      if (e.x > e.x0 + e.range) { e.x = e.x0 + e.range; e.dir = -1; }
      if (e.x < e.x0 - e.range) { e.x = e.x0 - e.range; e.dir = 1; }
      const hop = Math.abs(Math.sin(e.t * 7));
      e.mesh.position.x = e.x;
      e.body.position.y = 0.55 + hop * 0.12;
      e.body.scale.set(1 + (1 - hop) * 0.06, 1 - (1 - hop) * 0.08, 1);
      e.body.rotation.y = THREE.MathUtils.lerp(e.body.rotation.y, e.dir * 0.35, 0.15);
      e.mesh.userData.footL.position.y = -0.48 + Math.max(0, Math.sin(e.t * 7)) * 0.1;
      e.mesh.userData.footR.position.y = -0.48 + Math.max(0, -Math.sin(e.t * 7)) * 0.1;
    }
  }

  buildSprings() {
    const stemGeo = new THREE.CylinderGeometry(0.22, 0.3, 0.5, 16);
    const capGeo = new THREE.SphereGeometry(0.75, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMat = new THREE.MeshPhysicalMaterial({ color: '#ff4d6d', roughness: 0.35, clearcoat: 0.8 });
    const dotGeo = new THREE.SphereGeometry(0.12, 12, 8);
    const stemMat = std('#fff1e0');
    for (const [x, y] of this.level.springs || []) {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.y = 0.25;
      stem.castShadow = true;
      g.add(stem);
      const cap = new THREE.Group();
      const c = new THREE.Mesh(capGeo, capMat);
      c.scale.y = 0.55;
      c.castShadow = true;
      cap.add(c);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const d = new THREE.Mesh(dotGeo, this.mats.white);
        const phi = i === 0 ? 0 : 0.9;
        d.position.set(Math.cos(a) * Math.sin(phi) * 0.72, Math.cos(phi) * 0.41, Math.sin(a) * Math.sin(phi) * 0.72);
        d.scale.set(1, 0.5, 1);
        cap.add(d);
      }
      cap.position.y = 0.45;
      g.add(cap);
      g.position.set(x, y, 0);
      this.group.add(g);
      this.springs.push({ x, y, mesh: g, cap, anim: 0 });
    }
  }

  buildTotems() {
    const pedGeo = new RoundedBoxGeometry(0.9, 0.4, 0.9, 2, 0.1);
    const pedMat = std('#f3e9ff');
    const ringGeo = new THREE.TorusGeometry(0.62, 0.05, 8, 48);
    for (const [x, y, form] of this.level.totems || []) {
      const g = new THREE.Group();
      const ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.y = 0.2;
      ped.castShadow = ped.receiveShadow = true;
      g.add(ped);
      let orb;
      if (form === 'stone') {
        orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 1), new THREE.MeshStandardMaterial({ color: '#9aa1b2', roughness: 1, flatShading: true }));
      } else {
        orb = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 20), new THREE.MeshPhysicalMaterial({ color: '#ff4760', roughness: 0.2, clearcoat: 1 }));
      }
      orb.castShadow = true;
      orb.position.y = 1.15;
      g.add(orb);
      const ringColor = form === 'stone' ? '#c7cbe0' : '#ffd23f';
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: ringColor, toneMapped: false }));
      ring.position.y = 1.15;
      g.add(ring);
      g.position.set(x, y, 0);
      this.group.add(g);
      this.totems.push({ x, y, form, mesh: g, orb, ring, t: this.rand() * 6, flash: 0 });
    }
  }

  buildCheckpoints() {
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.07, 2.6, 10);
    const poleMat = std('#ffffff');
    const knobGeo = new THREE.SphereGeometry(0.14, 16, 12);
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.45, 0.2, 16);
    for (const [x, y] of this.level.checkpoints || []) {
      const g = new THREE.Group();
      const base = new THREE.Mesh(baseGeo, std('#e6dcff'));
      base.position.y = 0.1;
      g.add(base);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 1.3;
      pole.castShadow = true;
      g.add(pole);
      const knobMat = new THREE.MeshStandardMaterial({ color: '#cfcfe0', emissive: '#000000', roughness: 0.3 });
      const knob = new THREE.Mesh(knobGeo, knobMat);
      knob.position.y = 2.65;
      g.add(knob);
      const flagGeo = new THREE.PlaneGeometry(1.1, 0.7, 10, 1);
      flagGeo.translate(0.55, 0, 0);
      const flagMat = new THREE.MeshStandardMaterial({ color: '#c9c9d9', side: THREE.DoubleSide, roughness: 0.6 });
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0.05, 2.2, 0);
      flag.castShadow = true;
      g.add(flag);
      g.position.set(x, y, -1.1);
      this.group.add(g);
      this.checkpoints.push({ x, y, mesh: g, flag, flagMat, knobMat, base: Float32Array.from(flagGeo.attributes.position.array), active: false });
    }
  }

  activateCheckpoint(cp) {
    cp.active = true;
    cp.flagMat.color.set(this.theme.accent);
    cp.knobMat.color.set('#ffd23f');
    cp.knobMat.emissive.set('#ffb000');
    cp.knobMat.emissiveIntensity = 0.8;
  }

  buildGoal() {
    const [x, y] = this.level.goal;
    const g = new THREE.Group();
    const torusGeo = new THREE.TorusGeometry(1.3, 0.24, 20, 80);
    const pos = torusGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      c.setHSL((a / (Math.PI * 2) + 1) % 1, 0.95, 0.55);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    torusGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const ring = new THREE.Mesh(torusGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1 }));
    ring.castShadow = true;
    g.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 48),
      new THREE.MeshBasicMaterial({ map: portalTexture(), transparent: true, opacity: 0.92, toneMapped: false }),
    );
    g.add(disc);
    const baseMat = std('#f3e9ff');
    const base = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.35, 1.6, 2, 0.12), baseMat);
    base.position.y = -1.85;
    base.receiveShadow = base.castShadow = true;
    g.add(base);
    g.position.set(x, y + 2.05, -0.4);
    this.group.add(g);
    this.goal = { x, y: y + 2.05, mesh: g, ring, disc };
  }

  // ---------- Decorations ----------
  buildDecor() {
    const t = this.theme;
    const R = this.rand;
    const pick = (arr) => arr[Math.floor(R() * arr.length)];
    const foliageMats = t.foliage.map((c) => std(c, { roughness: 0.8 }));
    const flowerMats = t.flowers.map((c) => std(c, { roughness: 0.6 }));
    const trunkMat = std(t.decor === 'sunset' ? '#ffffff' : '#9b6a4a');
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const lowSphere = new THREE.SphereGeometry(1, 10, 8);
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
    const tuftGeo = new THREE.ConeGeometry(0.08, 0.4, 5);
    tuftGeo.translate(0, 0.2, 0);
    const grassDark = std(t.grassDark);

    const inWater = (x) => this.water.find((w) => x > w.x1 && x < w.x2);

    const tree = (x, y, z) => {
      const g = new THREE.Group();
      const h = 1.4 + R() * 1.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 8), trunkMat);
      trunk.position.y = h / 2;
      trunk.castShadow = true;
      g.add(trunk);
      const mat = pick(foliageMats);
      const n = 1 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const s = 0.9 + R() * 0.6 - i * 0.15;
        const ball = new THREE.Mesh(sphere, mat);
        ball.scale.setScalar(s);
        ball.position.set((R() - 0.5) * 0.7, h + i * 0.7, (R() - 0.5) * 0.4);
        ball.castShadow = true;
        g.add(ball);
      }
      g.position.set(x, y, z);
      g.rotation.y = R() * Math.PI;
      return g;
    };

    const palm = (x, y, z) => {
      const g = new THREE.Group();
      const segs = 6 + Math.floor(R() * 3);
      const lean = (R() - 0.5) * 0.5;
      let px = 0, py = 0;
      for (let i = 0; i < segs; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.5, 8), trunkMat);
        px += Math.sin(lean * (i / segs) * 2) * 0.12;
        seg.position.set(px, py + 0.25, 0);
        seg.rotation.z = -lean * (i / segs);
        seg.castShadow = true;
        g.add(seg);
        py += 0.46;
      }
      const mat = pick(foliageMats);
      for (let i = 0; i < 7; i++) {
        const leaf = new THREE.Mesh(sphere, mat);
        const a = (i / 7) * Math.PI * 2;
        leaf.scale.set(1.0, 0.1, 0.3);
        leaf.position.set(px + Math.cos(a) * 0.8, py - 0.15, Math.sin(a) * 0.8);
        leaf.rotation.set(0, -a, -0.35);
        leaf.castShadow = true;
        g.add(leaf);
      }
      const coco = new THREE.Mesh(lowSphere, trunkMat);
      coco.scale.setScalar(0.16);
      coco.position.set(px + 0.12, py - 0.2, 0.1);
      g.add(coco);
      g.position.set(x, y, z);
      return g;
    };

    const lollipop = (x, y, z) => {
      const g = new THREE.Group();
      const h = 1.2 + R() * 1.4;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 8), trunkMat);
      stick.position.y = h / 2;
      g.add(stick);
      const candy = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.22, 12, 32), pick(foliageMats));
      candy.position.y = h + 0.5;
      candy.castShadow = true;
      g.add(candy);
      const center = new THREE.Mesh(sphere, flowerMats[0]);
      center.scale.set(0.3, 0.3, 0.15);
      center.position.y = h + 0.5;
      g.add(center);
      g.position.set(x, y, z);
      g.rotation.y = (R() - 0.5) * 0.8;
      return g;
    };

    const crystal = (x, y, z) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: pick(t.foliage), roughness: 0.1, metalness: 0.1, flatShading: true, emissive: pick(t.foliage), emissiveIntensity: 0.15 });
      const n = 2 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const h = 0.6 + R() * 1.4;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.22 + R() * 0.15, h, 5), mat);
        c.position.set((R() - 0.5) * 0.8, h / 2 - 0.05, (R() - 0.5) * 0.6);
        c.rotation.z = (R() - 0.5) * 0.6;
        c.castShadow = true;
        g.add(c);
      }
      g.position.set(x, y, z);
      return g;
    };

    const bush = (x, y, z) => {
      const g = new THREE.Group();
      const mat = pick(foliageMats);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(sphere, mat);
        const s = 0.45 + R() * 0.3;
        b.scale.set(s * 1.2, s, s);
        b.position.set((i - 1) * 0.5, s * 0.6, (R() - 0.5) * 0.3);
        b.castShadow = true;
        g.add(b);
      }
      g.position.set(x, y, z);
      return g;
    };

    const rock = (x, y, z) => {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + R() * 0.4, 0), std(t.pebble, { flatShading: true }));
      m.position.set(x, y + 0.15, z);
      m.rotation.set(R() * 3, R() * 3, R() * 3);
      m.scale.y = 0.7;
      m.castShadow = true;
      return m;
    };

    const flower = (x, y, z) => {
      const g = new THREE.Group();
      const h = 0.3 + R() * 0.35;
      const stem = new THREE.Mesh(stemGeo, grassDark);
      stem.scale.y = h;
      stem.position.y = h / 2;
      g.add(stem);
      const head = new THREE.Mesh(lowSphere, pick(flowerMats));
      head.scale.setScalar(0.11 + R() * 0.05);
      head.position.y = h;
      g.add(head);
      g.position.set(x, y, z);
      return g;
    };

    const tuft = (x, y, z) => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(tuftGeo, grassDark);
        b.position.x = (i - 1) * 0.08;
        b.rotation.z = (i - 1) * 0.4;
        g.add(b);
      }
      g.position.set(x, y, z);
      return g;
    };

    const seaweed = (x, y, z) => {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1 + R() * 1.4, 6), grassDark);
        c.position.set((i - 1) * 0.2, 0.6, 0);
        c.rotation.z = (R() - 0.5) * 0.4;
        g.add(c);
      }
      g.position.set(x, y, z);
      this.animated.push({ type: 'sway', obj: g, phase: R() * 6 });
      return g;
    };

    const bigDecor = { meadow: [tree, tree, bush], lagoon: [palm, palm, bush, rock], sunset: [lollipop, crystal, lollipop] }[t.decor];

    for (const profile of this.level.terrain) {
      const x0 = profile[0][0];
      const x1 = profile[profile.length - 1][0];
      // background row
      for (let x = x0 + 1 + R() * 2; x < x1 - 1; x += 1.8 + R() * 3) {
        const y = surfaceAt(profile, x);
        if (y === null || Math.abs(slopeAt(profile, x)) > 0.8) continue;
        if (inWater(x)) {
          if (t.decor === 'lagoon') this.group.add(seaweed(x, y, -1.5 - R() * 3.5));
          continue;
        }
        const make = pick(bigDecor);
        this.group.add(make(x, y, -2.6 - R() * 2.8));
      }
      // small stuff around the play lane
      for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.5 + R() * 1.2) {
        const y = surfaceAt(profile, x);
        if (y === null || Math.abs(slopeAt(profile, x)) > 1.2 || inWater(x)) continue;
        const z = R() < 0.5 ? 0.9 + R() * 0.9 : -0.9 - R() * 1.5;
        this.group.add(R() < 0.45 ? flower(x, y, z) : tuft(x, y, z));
      }
    }
  }

  buildBackground() {
    const t = this.theme;
    const R = this.rand;
    const hillGeo = new THREE.SphereGeometry(1, 32, 16);
    const span0 = this.minX - 60, span1 = this.maxX + 60;
    const fogged = (c, k) => new THREE.Color(c).lerp(new THREE.Color(t.fog), k);
    for (const [z, scale, fade, yb] of [[-70, 24, 0.4, -14], [-50, 9, 0.25, -12]]) {
      for (let x = span0; x < span1; x += scale * (0.9 + R() * 0.7)) {
        const m = new THREE.Mesh(hillGeo, new THREE.MeshStandardMaterial({ color: fogged(t.hills[Math.floor(R() * t.hills.length)], fade), roughness: 1 }));
        const s = scale * (0.8 + R() * 0.6);
        m.scale.set(s * 1.4, s, s * 0.6);
        m.position.set(x, yb, z + (R() - 0.5) * 6);
        this.group.add(m);
      }
    }

    // clouds
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.65 });
    for (let x = span0; x < span1; x += 10 + R() * 14) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(R() * 3);
      for (let i = 0; i < n; i++) {
        const p = new THREE.Mesh(hillGeo, cloudMat);
        const s = 1 + R() * 1.2;
        p.scale.set(s * 1.3, s, s);
        p.position.set(i * 1.5 - n * 0.7, (R() - 0.3) * 0.8, (R() - 0.5));
        g.add(p);
      }
      g.position.set(x, 10 + R() * 8, -22 - R() * 12);
      this.group.add(g);
      this.clouds.push({ obj: g, speed: 0.3 + R() * 0.5, span0, span1 });
    }

    // sun
    const sun = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshBasicMaterial({ color: t.sun, fog: false, toneMapped: false }));
    sun.position.set(0, 22, -90);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(11, 48), new THREE.MeshBasicMaterial({ color: t.sun, transparent: true, opacity: 0.3, fog: false, toneMapped: false }));
    halo.position.z = -0.1;
    sun.add(halo);
    this.group.add(sun);
    this.sun = sun;
  }

  // ---------- Per-frame visuals ----------
  update(dt, time, camX) {
    for (const g of this.gems) {
      if (g.taken) {
        if (g.t > 0) {
          g.t -= dt;
          const k = g.t / 0.35;
          g.mesh.position.y += dt * 6;
          g.mesh.scale.setScalar(Math.max(0.001, k * 1.4));
          if (g.t <= 0) g.mesh.visible = false;
        }
        continue;
      }
      g.mesh.rotation.y = time * 2 + g.phase;
      g.mesh.position.y = g.y + Math.sin(time * 3 + g.phase) * 0.1;
    }
    for (const h of this.hearts) {
      if (h.taken) {
        if (h.t > 0) {
          h.t -= dt;
          h.mesh.position.y += dt * 5;
          h.mesh.scale.setScalar(Math.max(0.001, h.t / 0.4));
          if (h.t <= 0) h.mesh.visible = false;
        }
        continue;
      }
      h.mesh.rotation.y = time * 2.5;
      const beat = 1 + Math.max(0, Math.sin(time * 6)) * 0.12;
      h.mesh.scale.setScalar(beat);
      h.mesh.position.y = h.y + Math.sin(time * 2) * 0.12;
    }
    for (const w of this.water) {
      const pos = w.surf.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = w.base[i * 3], z = w.base[i * 3 + 2];
        pos.setY(i, Math.sin(x * 1.3 + time * 2.2) * 0.06 + Math.sin(z * 0.9 + x * 0.4 + time * 1.4) * 0.05);
      }
      pos.needsUpdate = true;
      w.surf.geometry.computeVertexNormals();
    }
    for (const s of this.springs) {
      if (s.anim > 0) s.anim = Math.max(0, s.anim - dt);
      const k = s.anim / 0.45;
      const squash = Math.sin(k * Math.PI * 3) * k;
      s.cap.scale.set(1 + squash * 0.25, 1 - squash * 0.45, 1 + squash * 0.25);
    }
    for (const tt of this.totems) {
      tt.t += dt;
      tt.orb.position.y = 1.15 + Math.sin(tt.t * 2.4) * 0.12;
      tt.orb.rotation.y += dt * 1.2;
      tt.ring.position.y = tt.orb.position.y;
      tt.ring.rotation.x = Math.sin(tt.t * 0.8) * 0.6 + 1.2;
      tt.ring.rotation.y += dt * 2;
      if (tt.flash > 0) tt.flash -= dt;
      const s = 1 + Math.max(0, tt.flash) * 1.2;
      tt.orb.scale.setScalar(s);
    }
    for (const cp of this.checkpoints) {
      const pos = cp.flag.geometry.attributes.position;
      const amp = cp.active ? 0.12 : 0.04;
      for (let i = 0; i < pos.count; i++) {
        const x = cp.base[i * 3];
        pos.setZ(i, Math.sin(x * 4 - time * (cp.active ? 8 : 3)) * amp * x);
      }
      pos.needsUpdate = true;
    }
    if (this.goal) {
      this.goal.ring.rotation.z = time * 0.6;
      this.goal.disc.rotation.z = -time * 1.5;
      const s = 1 + Math.sin(time * 3) * 0.03;
      this.goal.mesh.scale.setScalar(s);
    }
    for (const c of this.clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > c.span1) c.obj.position.x = c.span0;
    }
    for (const a of this.animated) {
      if (a.type === 'sway') a.obj.rotation.z = Math.sin(time * 1.5 + a.phase) * 0.15;
    }
    this.sun.position.x = camX * 0.85 + 18;
  }

  dispose() {
    this.scene.remove(this.group);
    const seen = new Set();
    this.group.traverse((o) => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (seen.has(m)) continue;
        seen.add(m);
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
  }
}
