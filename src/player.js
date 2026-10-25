import * as THREE from 'three';
import { ballTexture } from './fx.js';

export const R = 0.5;

const FORMS = {
  bouncy: { accel: 40, airAccel: 24, maxSpeed: 8.5, jump: 12.5, gravity: 32, buoyancy: 1.9, restitution: 0.32, spring: 21 },
  stone: { accel: 30, airAccel: 15, maxSpeed: 6.2, jump: 10.5, gravity: 36, buoyancy: 0.45, restitution: 0.05, spring: 18 },
};

export class Player {
  constructor(scene) {
    this.root = new THREE.Group();
    this.squashGroup = new THREE.Group();
    this.root.add(this.squashGroup);

    // bouncy ball
    this.bouncyMat = new THREE.MeshPhysicalMaterial({ map: ballTexture(), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 });
    this.bouncyGeo = new THREE.SphereGeometry(R, 48, 32);

    // stone ball: jittered icosphere with per-face greys
    const sg = new THREE.IcosahedronGeometry(R, 2);
    const pos = sg.attributes.position;
    const jitter = new Map();
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!jitter.has(key)) jitter.set(key, 0.94 + Math.random() * 0.1);
      v.multiplyScalar(jitter.get(key));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const cols = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      c.setHSL(0.62, 0.08, 0.45 + Math.random() * 0.15);
      for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
    }
    sg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    sg.computeVertexNormals();
    this.stoneGeo = sg;
    this.stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });

    this.ball = new THREE.Mesh(this.bouncyGeo, this.bouncyMat);
    this.ball.castShadow = true;
    this.squashGroup.add(this.ball);

    // face (does not roll)
    this.face = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    const black = new THREE.MeshBasicMaterial({ color: '#1d1636' });
    const eyeGeo = new THREE.SphereGeometry(0.12, 20, 14);
    const pupilGeo = new THREE.SphereGeometry(0.062, 14, 10);
    const shineGeo = new THREE.SphereGeometry(0.022, 8, 6);
    const shineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.eyes = [];
    this.pupils = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      const e = new THREE.Mesh(eyeGeo, white);
      e.scale.set(0.9, 1.15, 0.55);
      eye.add(e);
      const p = new THREE.Mesh(pupilGeo, black);
      p.position.z = 0.06;
      p.scale.set(1, 1.2, 0.6);
      eye.add(p);
      const s = new THREE.Mesh(shineGeo, shineMat);
      s.position.set(0.025, 0.04, 0.1);
      p.add(s);
      eye.position.set(side * 0.15, 0.1, 0.44);
      this.face.add(eye);
      this.eyes.push(eye);
      this.pupils.push(p);
    }
    const cheekMat = new THREE.MeshBasicMaterial({ color: '#ff9fb0', transparent: true, opacity: 0.8 });
    this.cheeks = [];
    for (const side of [-1, 1]) {
      const ch = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), cheekMat);
      ch.position.set(side * 0.27, -0.06, 0.43);
      ch.rotation.y = side * 0.55;
      ch.scale.y = 0.6;
      this.face.add(ch);
      this.cheeks.push(ch);
    }
    this.brows = [];
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.04), black);
      b.position.set(side * 0.15, 0.27, 0.45);
      b.rotation.z = side * -0.3;
      b.visible = false;
      this.face.add(b);
      this.brows.push(b);
    }
    this.squashGroup.add(this.face);

    scene.add(this.root);
    this.reset(0, 1);
  }

  reset(x, y, form = 'bouncy') {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.groundSolid = null;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.jumping = false;
    this.squash = 0;
    this.squashV = 0;
    this.blink = 2;
    this.facing = 1;
    this.inWater = 0;
    this.wasInWater = 0;
    this.dead = false;
    this.invuln = 0;
    this.touched = [];
    this.root.visible = true;
    this.root.scale.setScalar(1);
    this.setForm(form);
    this.syncMesh();
  }

  setForm(form) {
    this.form = form;
    this.cfg = FORMS[form];
    const stone = form === 'stone';
    this.ball.geometry = stone ? this.stoneGeo : this.bouncyGeo;
    this.ball.material = stone ? this.stoneMat : this.bouncyMat;
    for (const b of this.brows) b.visible = stone;
    for (const ch of this.cheeks) ch.visible = !stone;
  }

  // One fixed physics step. Returns events for the game (landing impact, jump, splash).
  step(dt, world, input) {
    const cfg = this.cfg;
    const ev = { impact: 0, jumped: false, splash: false };

    // ride moving platforms
    if (this.grounded && this.groundSolid?.kind === 'mover') {
      this.x += this.groundSolid.dxStep;
      this.y += this.groundSolid.dyStep;
    }

    // water
    let sub = 0;
    for (const w of world.water) {
      if (this.x < w.x1 || this.x > w.x2 || this.y - R > w.top + 0.2 || this.y + R < w.bottom) continue;
      sub = Math.max(sub, THREE.MathUtils.clamp((w.top - (this.y - R)) / (2 * R), 0, 1));
    }
    this.wasInWater = this.inWater;
    this.inWater = sub;
    if (sub > 0 && this.wasInWater === 0 && this.vy < -3) ev.splash = true;

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir) this.facing = dir;
    let accel = this.grounded ? cfg.accel : cfg.airAccel;
    if (dir * this.vx < 0) accel *= 1.8;
    const maxSpeed = cfg.maxSpeed * (sub > 0.6 ? 0.75 : 1);
    if (dir) {
      if (this.vx * dir < maxSpeed) this.vx = Math.min(maxSpeed, this.vx * dir + accel * dt) * dir;
    } else {
      this.vx *= 1 - (this.grounded ? 7 : 0.8) * dt;
    }

    // gravity (a little heavier on the way down for snappier arcs)
    const g = cfg.gravity * (this.vy < 0 ? 1.2 : 1);
    this.vy -= g * dt;
    if (sub > 0) {
      this.vy += sub * cfg.gravity * cfg.buoyancy * dt;
      const drag = 1 - sub * 2.6 * dt;
      this.vy *= drag;
      this.vx *= 1 - sub * 0.8 * dt;
    }
    this.vy = Math.max(this.vy, -26);

    // jumping: coyote time + input buffer + variable height
    this.coyote = this.grounded ? 0.1 : this.coyote - dt;
    this.jumpBuffer -= dt;
    const canSwimJump = sub > 0.2 && sub < 0.95 && this.form === 'bouncy';
    if (this.jumpBuffer > 0 && (this.coyote > 0 || canSwimJump)) {
      this.vy = cfg.jump * (canSwimJump && this.coyote <= 0 ? 0.95 : 1);
      // keep the momentum of a moving platform we jump off
      if (this.groundSolid?.kind === 'mover') {
        this.vx += this.groundSolid.dxStep / dt;
        this.vy += Math.max(0, this.groundSolid.dyStep / dt);
      }
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.jumping = true;
      this.grounded = false;
      ev.jumped = true;
      this.squash = -0.25;
    }
    if (this.jumping && !input.jump && this.vy > 3) {
      this.vy *= 0.5;
      this.jumping = false;
    }
    if (this.vy <= 0) this.jumping = false;

    const px = this.x;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    ev.impact = this.collide(world);
    if (ev.impact > 4) this.squash = Math.min(0.38, ev.impact / 38);

    // roll the ball by the distance travelled
    this.ball.rotation.z -= (this.x - px) / R;
    return ev;
  }

  collide(world) {
    let impact = 0;
    this.grounded = false;
    this.groundSolid = null;
    this.touched.length = 0;
    const r = R;
    for (let iter = 0; iter < 2; iter++) {
      for (const s of world.solids) {
        if (!s.alive) continue;
        const ox = s.ox, oy = s.oy;
        if (this.x + r < s.minX + ox || this.x - r > s.maxX + ox || this.y + r < s.minY + oy || this.y - r > s.maxY + oy) continue;
        for (const seg of s.segs) {
          const ax = seg[0] + ox, ay = seg[1] + oy, bx = seg[2] + ox, by = seg[3] + oy;
          const abx = bx - ax, aby = by - ay;
          const len2 = abx * abx + aby * aby;
          let t = len2 > 0 ? ((this.x - ax) * abx + (this.y - ay) * aby) / len2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = ax + abx * t, cy = ay + aby * t;
          const dx = this.x - cx, dy = this.y - cy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r || d2 < 1e-10) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          if (s.oneWay && (ny < 0.6 || this.vy > 0.5)) continue;
          const pen = r - d;
          this.x += nx * pen;
          this.y += ny * pen;
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) {
            const e = -vn > 7 ? this.cfg.restitution : 0;
            this.vx -= (1 + e) * vn * nx;
            this.vy -= (1 + e) * vn * ny;
            if (ny > 0.5) impact = Math.max(impact, -vn);
          }
          if (ny > 0.5) {
            this.grounded = true;
            this.groundSolid = s;
          }
          if (s.kind === 'cracked' && !this.touched.includes(s)) this.touched.push(s);
        }
      }
    }
    return impact;
  }

  syncMesh(dt = 0, time = 0) {
    // squash & stretch spring
    if (dt > 0) {
      const k = 180, damp = 14;
      this.squashV += (-k * this.squash - damp * this.squashV) * dt;
      this.squash += this.squashV * dt;
      if (!this.grounded && Math.abs(this.vy) > 6 && this.squash > -0.12) {
        this.squash = THREE.MathUtils.lerp(this.squash, -Math.min(0.12, Math.abs(this.vy) / 120), 0.2);
      }
    }
    const sq = THREE.MathUtils.clamp(this.squash, -0.3, 0.4);
    const sy = 1 - sq;
    const sxz = 1 + sq * 0.6;
    this.squashGroup.scale.set(sxz, sy, sxz);
    this.squashGroup.position.y = -(1 - sy) * R;
    this.root.position.set(this.x, this.y, 0);

    // face looks where we're going
    const look = THREE.MathUtils.clamp(this.vx / 8, -1, 1);
    this.face.rotation.y = THREE.MathUtils.lerp(this.face.rotation.y, look * 0.6, Math.min(1, dt * 8));
    this.face.rotation.x = THREE.MathUtils.lerp(this.face.rotation.x, THREE.MathUtils.clamp(-this.vy / 30, -0.3, 0.3), Math.min(1, dt * 8));
    for (const p of this.pupils) {
      p.position.x = look * 0.025;
      p.position.y = THREE.MathUtils.clamp(this.vy / 60, -0.03, 0.03);
    }

    // blink
    this.blink -= dt;
    let eyeY = 1;
    if (this.blink < 0.12) eyeY = 0.12;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = THREE.MathUtils.lerp(e.scale.y, eyeY, 0.5);

    if (this.invuln > 0) this.root.visible = Math.floor(time * 20) % 2 === 0;
    else if (!this.dead) this.root.visible = true;
  }
}
