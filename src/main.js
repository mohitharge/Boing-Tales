import * as THREE from 'three';
import { LEVELS, THEMES } from './levels.js';
import { World, DEATH_Y } from './world.js';
import { Player, R } from './player.js';
import { Particles, skyTexture } from './fx.js';
import { input, initInput, consumeJump, isTouchDevice } from './input.js';
import { sfx, unlockAudio, startMusic, setMusicTheme, toggleMusic, toggleSound, isSoundOn } from './audio.js';

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  document.body.innerHTML = '<div class="webgl-error">Boing Tales needs WebGL to bounce.<br/>Try a different browser or enable hardware acceleration.</div>';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight('#ffffff', '#88aa66', 1.4);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight('#fff4e0', 2.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -22;
sunLight.shadow.camera.right = 22;
sunLight.shadow.camera.top = 16;
sunLight.shadow.camera.bottom = -16;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 60;
sunLight.shadow.bias = -0.0005;
sunLight.shadow.normalBias = 0.02;
scene.add(sunLight, sunLight.target);

const particles = new Particles(scene);
const player = new Player(scene);

// ---------- Save data ----------
const SAVE_KEY = 'boing-tales-save-v1';
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.unlocked === 'number') return s;
  } catch {}
  return { unlocked: 1, stars: {} };
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}
const save = loadSave();

// ---------- Game state ----------
const game = {
  state: 'menu', // menu | playing | paused | complete | gameover
  levelIndex: 0,
  world: null,
  hearts: 3,
  gems: 0,
  time: 0,
  simTime: 0,
  acc: 0,
  checkpoint: null,
  deathTimer: 0,
  winTimer: 0,
  combo: 0,
  comboTimer: 0,
  shake: 0,
  cam: new THREE.Vector3(0, 3, 16),
  camLook: new THREE.Vector3(),
};

const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), hearts: $('hearts'), gemCount: $('gem-count'), gemTotal: $('gem-total'), levelName: $('level-name'),
  formPill: $('form-pill'), formLabel: $('form-label'),
  menu: $('menu'), pause: $('pause'), complete: $('complete'), gameover: $('gameover'),
  titleCard: $('title-card'), toast: $('toast'), touch: $('touch'),
};

// ---------- Level lifecycle ----------
function loadLevel(i) {
  game.world?.dispose();
  particles.clear();
  game.levelIndex = i;
  const level = LEVELS[i];
  const theme = THEMES[level.theme];
  game.world = new World(scene, level, i);
  scene.background = skyTexture(theme.skyTop, theme.skyBottom);
  scene.fog = new THREE.Fog(theme.fog, 60, 190);
  hemi.color.set('#ffffff');
  hemi.groundColor.set(theme.hemiGround);
  document.querySelector('meta[name=theme-color]').content = theme.skyTop;
  document.body.style.background = theme.skyTop;
  player.reset(level.spawn[0], level.spawn[1]);
  game.checkpoint = { x: level.spawn[0], y: level.spawn[1], form: 'bouncy' };
  game.cam.set(level.spawn[0] + 2, level.spawn[1] + 3, 16);
  setMusicTheme(level.theme);
}

function startLevel(i) {
  unlockAudio();
  startMusic(LEVELS[i].theme);
  loadLevel(i);
  game.state = 'playing';
  game.hearts = 3;
  game.gems = 0;
  game.time = 0;
  game.simTime = 0;
  game.acc = 0;
  game.deathTimer = 0;
  game.winTimer = 0;
  input.jumpPressed = false;
  showOnly(null);
  ui.hud.classList.remove('hidden');
  ui.touch.classList.toggle('hidden', !isTouchDevice());
  ui.levelName.textContent = LEVELS[i].name;
  ui.gemTotal.textContent = game.world.gems.length;
  updateHUD();
  showTitleCard(i);
}

function showOnly(el) {
  for (const o of [ui.menu, ui.pause, ui.complete, ui.gameover]) o.classList.toggle('hidden', o !== el);
}

function showTitleCard(i) {
  $('tc-level').textContent = `Level ${i + 1}`;
  $('tc-name').textContent = LEVELS[i].name;
  $('tc-hint').textContent = LEVELS[i].hint || '';
  const c = ui.titleCard;
  c.classList.add('hidden');
  void c.offsetWidth;
  c.classList.remove('hidden');
}

let toastTimer = 0;
function toast(msg) {
  const t = ui.toast;
  t.textContent = msg;
  t.classList.add('hidden');
  void t.offsetWidth;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

const HEART_SVG = `<svg class="heart" viewBox="0 0 24 24"><path fill="#ff3d6e" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 4.3 2.4h2c.7-1.2 2.1-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/><ellipse cx="7.5" cy="8.5" rx="2" ry="1.3" fill="#fff" opacity=".7" transform="rotate(-30 7.5 8.5)"/></svg>`;

function updateHUD(popHeart = -1) {
  const slots = Math.max(3, game.hearts);
  ui.hearts.innerHTML = Array.from({ length: slots }, () => HEART_SVG).join('');
  [...ui.hearts.children].forEach((h, i) => {
    if (i >= game.hearts) h.classList.add('empty');
    if (i === popHeart) h.classList.add('pop');
  });
  ui.gemCount.textContent = game.gems;
  const stone = player.form === 'stone';
  ui.formPill.classList.toggle('stone', stone);
  ui.formLabel.textContent = stone ? 'Rock' : 'Bouncy';
}

function bumpGemPill() {
  const pill = ui.gemCount.parentElement;
  pill.classList.remove('bump');
  void pill.offsetWidth;
  pill.classList.add('bump');
}

// ---------- Gameplay events ----------
function hurt() {
  if (player.dead || player.invuln > 0 || game.state !== 'playing') return;
  player.dead = true;
  player.root.visible = false;
  game.deathTimer = 1.1;
  game.hearts--;
  game.shake = 0.5;
  sfx.hurt();
  const col = player.form === 'stone' ? ['#9aa1b2', '#6d7280', '#c7cbe0'] : ['#ff4760', '#ff9fb0', '#ffffff'];
  particles.emit(player.x, player.y, 0, { color: col, count: 40, speed: 9, size: 0.16, life: 0.9, gravity: -14 });
  updateHUD(game.hearts);
}

function respawn() {
  const cp = game.checkpoint;
  player.reset(cp.x, cp.y + 0.2, cp.form);
  player.invuln = 1.5;
  updateHUD();
  particles.emit(cp.x, cp.y, 0, { color: ['#ffffff', THEMES[LEVELS[game.levelIndex].theme].accent], count: 24, speed: 5, life: 0.6, gravity: 0, size: 0.1 });
}

function transform(form, at) {
  if (player.form === form) return;
  player.setForm(form);
  player.squash = 0.35;
  at.flash = 0.3;
  sfx.transform(form === 'stone');
  const col = form === 'stone' ? ['#c7cbe0', '#9aa1b2', '#ffffff'] : ['#ff4760', '#ffd23f', '#ffffff'];
  particles.emit(player.x, player.y, 0, { color: col, count: 36, speed: 7, life: 0.7, gravity: -4, size: 0.13 });
  toast(form === 'stone' ? 'Rock form! Heavy, sinks, smashes cracks' : 'Bouncy again! Light and floaty');
  updateHUD();
}

function winLevel() {
  game.state = 'complete';
  game.winTimer = 0;
  sfx.win();
  const w = game.world;
  const total = w.gems.length;
  const ratio = total ? game.gems / total : 1;
  const stars = ratio >= 1 ? 3 : ratio >= 0.6 ? 2 : 1;
  const prev = save.stars[game.levelIndex] || 0;
  save.stars[game.levelIndex] = Math.max(prev, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, game.levelIndex + 2));
  writeSave();
  particles.emit(w.goal.x, w.goal.y, 0, { color: ['#ffd23f', '#ff5a6e', '#4fd8ff', '#7ad957', '#b18cff'], count: 80, speed: 12, life: 1.4, gravity: -8, size: 0.14 });

  setTimeout(() => {
    if (game.state !== 'complete') return;
    [...document.querySelectorAll('#stars .star')].forEach((s, i) => {
      s.classList.toggle('on', i < stars);
      s.style.setProperty('--d', `${0.15 + i * 0.18}s`);
    });
    $('c-gems').textContent = `${game.gems}/${total}`;
    const t = Math.floor(game.time);
    $('c-time').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    const last = game.levelIndex >= LEVELS.length - 1;
    $('btn-next').textContent = last ? 'Back to menu' : 'Next level';
    $('btn-next').dataset.action = last ? 'menu' : 'next';
    showOnly(ui.complete);
    ui.touch.classList.add('hidden');
  }, 1100);
}

function interact(dt) {
  const w = game.world;
  const px = player.x, py = player.y;
  const stone = player.form === 'stone';

  // gems
  game.comboTimer -= dt;
  if (game.comboTimer <= 0) game.combo = 0;
  for (const g of w.gems) {
    if (g.taken) continue;
    const dx = g.x - px, dy = g.mesh.position.y - py;
    if (dx * dx + dy * dy < 1.0) {
      g.taken = true;
      g.t = 0.35;
      game.gems++;
      sfx.gem(game.combo++);
      game.comboTimer = 0.6;
      particles.emit(g.x, g.y, 0, { color: [w.theme.gem, '#ffffff'], count: 10, speed: 4, life: 0.45, gravity: 0, size: 0.08 });
      ui.gemCount.textContent = game.gems;
      bumpGemPill();
    }
  }

  for (const h of w.hearts) {
    if (h.taken) continue;
    const dx = h.x - px, dy = h.mesh.position.y - py;
    if (dx * dx + dy * dy < 1.1) {
      h.taken = true;
      h.t = 0.4;
      game.hearts = Math.min(5, game.hearts + 1);
      sfx.heart();
      particles.emit(h.x, h.y, 0, { color: ['#ff3d6e', '#ffb3c6'], count: 18, speed: 5, life: 0.6, gravity: 0 });
      toast('+1 heart');
      updateHUD(game.hearts - 1);
    }
  }

  // springs
  for (const s of w.springs) {
    if (Math.abs(px - s.x) < 0.9 && py - R < s.y + 0.75 && py > s.y && player.vy <= 2) {
      player.vy = player.cfg.spring;
      player.y = Math.max(player.y, s.y + 0.75 + R);
      player.grounded = false;
      player.jumping = false;
      player.coyote = 0;
      player.squash = -0.3;
      s.anim = 0.45;
      sfx.spring();
      particles.emit(s.x, s.y + 0.8, 0, { color: ['#ffffff', '#ff4d6d'], count: 14, speed: 5, life: 0.5, gravity: -6, dir: Math.PI / 2, spread: 2 });
    }
  }

  // totems
  for (const t of w.totems) {
    const dx = t.x - px, dy = t.y + 1.15 - py;
    if (dx * dx + dy * dy < 1.3 * 1.3) transform(t.form, t);
  }

  // checkpoints
  for (const cp of w.checkpoints) {
    if (cp.active) continue;
    if (Math.abs(px - cp.x) < 0.8 && py > cp.y - 0.5 && py < cp.y + 3) {
      w.activateCheckpoint(cp);
      game.checkpoint = { x: cp.x, y: cp.y + 1, form: player.form };
      sfx.checkpoint();
      particles.emit(cp.x, cp.y + 2.6, -1.1, { color: ['#ffd23f', w.theme.accent, '#ffffff'], count: 26, speed: 6, life: 0.8, gravity: -6 });
      toast('Checkpoint!');
    }
  }

  // smash cracked blocks
  if (stone) {
    for (const s of player.touched) {
      if (!s.alive) continue;
      s.alive = false;
      s.mesh.visible = false;
      game.shake = 0.35;
      sfx.smash();
      particles.emit(s.cx, s.cy, 0, { color: ['#c9a27e', '#8a6a52', '#e8d2b8'], count: 50, speed: 9, size: 0.2, life: 1.1, gravity: -20, drag: 0.5 });
    }
  }

  if (player.dead) return;

  // enemies
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const ex = e.x, ey = e.y + 0.6;
    const dx = px - ex, dy = py - ey;
    if (dx * dx + dy * dy > (R + 0.5) * (R + 0.5)) continue;
    if (stone || (player.vy < 1 && dy > 0.35)) {
      e.alive = false;
      e.dying = 0.4;
      sfx.stomp();
      particles.emit(ex, ey, 0, { color: ['#7b5cff', '#b9a6ff', '#ffd84d'], count: 22, speed: 6, life: 0.6, gravity: -10 });
      if (!stone || dy > 0.35) {
        player.vy = 11;
        player.squash = 0.3;
      }
      game.shake = 0.15;
    } else if (player.invuln <= 0) {
      hurt();
      return;
    }
  }

  // spikes
  if (player.invuln <= 0) {
    for (const s of w.spikes) {
      const cx = Math.max(s.x1, Math.min(px, s.x2));
      const cy = Math.max(s.y1, Math.min(py, s.y2));
      const dx = px - cx, dy = py - cy;
      if (dx * dx + dy * dy < (R * 0.85) ** 2) { hurt(); return; }
    }
  }

  // falling out of the world
  if (py < DEATH_Y) { hurt(); return; }

  // goal
  const g = w.goal;
  const gdx = px - g.x, gdy = py - g.y;
  if (gdx * gdx + gdy * gdy < 1.6 * 1.6) winLevel();
}

// ---------- Main loop ----------
const FIXED = 1 / 120;
const IDLE_INPUT = { left: false, right: false, jump: false };
const clock = new THREE.Clock();
let elapsed = 0;

function update(dt) {
  elapsed += dt;
  const w = game.world;
  if (!w) return;

  if (game.state === 'playing') {
    game.time += dt;
    if (consumeJump()) player.jumpBuffer = 0.13;
    if (player.invuln > 0) player.invuln -= dt;

    if (player.dead) {
      game.deathTimer -= dt;
      game.acc += dt;
      while (game.acc >= FIXED) { game.simTime += FIXED; w.stepMovers(game.simTime); game.acc -= FIXED; }
      if (game.deathTimer <= 0) {
        if (game.hearts <= 0) {
          game.state = 'gameover';
          showOnly(ui.gameover);
          ui.touch.classList.add('hidden');
        } else respawn();
      }
    } else {
      game.acc += dt;
      while (game.acc >= FIXED) {
        game.simTime += FIXED;
        w.stepMovers(game.simTime);
        const ev = player.step(FIXED, w, input);
        if (ev.jumped) {
          sfx.jump(player.form === 'stone');
          particles.emit(player.x, player.y - R, 0, { color: '#ffffff', count: 6, speed: 2.5, life: 0.35, gravity: 0, size: 0.08, dir: -Math.PI / 2, spread: 2 });
        }
        if (ev.impact > 5) {
          sfx.land(ev.impact, player.form === 'stone');
          particles.emit(player.x, player.y - R, 0, { color: w.theme.grass, count: Math.min(14, Math.floor(ev.impact)), speed: ev.impact * 0.35, life: 0.4, gravity: -10, size: 0.07, dir: Math.PI / 2, spread: 2.6 });
          if (player.form === 'stone' && ev.impact > 12) game.shake = Math.max(game.shake, 0.25);
        }
        if (ev.splash) {
          sfx.splash();
          particles.emit(player.x, player.y, 0, { color: [w.theme.water, '#ffffff'], count: 24, speed: 7, life: 0.7, gravity: -18, dir: Math.PI / 2, spread: 1.6, size: 0.1 });
        }
        game.acc -= FIXED;
      }
      interact(dt);
    }
  } else if (game.state === 'complete') {
    game.winTimer += dt;
    const g = w.goal;
    player.x = THREE.MathUtils.lerp(player.x, g.x, Math.min(1, dt * 5));
    player.y = THREE.MathUtils.lerp(player.y, g.y, Math.min(1, dt * 5));
    player.ball.rotation.z -= dt * 12;
    player.root.scale.setScalar(Math.max(0.001, 1 - game.winTimer * 1.2));
    if (Math.random() < 0.5) particles.emit(g.x, g.y, 0, { color: ['#ffd23f', '#ffffff', '#b18cff'], count: 2, speed: 3, life: 0.8, gravity: 0, size: 0.07 });
    game.acc += dt;
    while (game.acc >= FIXED) { game.simTime += FIXED; w.stepMovers(game.simTime); game.acc -= FIXED; }
  } else if (game.state === 'menu') {
    game.acc += dt;
    while (game.acc >= FIXED) {
      game.simTime += FIXED;
      w.stepMovers(game.simTime);
      player.step(FIXED, w, IDLE_INPUT);
      game.acc -= FIXED;
    }
  }

  if (game.state !== 'paused') {
    if (game.state === 'playing' || game.state === 'menu' || game.state === 'gameover') w.updateEnemies(dt);
    w.update(dt, elapsed, game.cam.x);
    particles.update(dt);
    if (game.state !== 'complete') player.syncMesh(dt, elapsed);
    else player.root.position.set(player.x, player.y, 0);

    // portal sparkles
    if (Math.random() < 0.25) {
      const g = w.goal;
      const a = Math.random() * Math.PI * 2;
      particles.emit(g.x + Math.cos(a) * 1.3, g.y + Math.sin(a) * 1.3, -0.4, { color: ['#ffffff', '#ffd23f', '#b18cff'], count: 1, speed: 0.5, life: 0.8, gravity: 1.5, size: 0.06 });
    }
  }

  updateCamera(dt);
}

function updateCamera(dt) {
  const aspect = window.innerWidth / window.innerHeight;
  const dist = THREE.MathUtils.clamp(aspect >= 1.3 ? 15 : (15 * 1.3) / aspect, 15, 25);
  let tx, ty;
  if (game.state === 'menu') {
    const L = LEVELS[game.levelIndex];
    const span = L.goal[0] - L.spawn[0];
    tx = L.spawn[0] + (0.5 - 0.5 * Math.cos(elapsed * 0.06)) * span;
    ty = 3.5;
  } else {
    tx = player.x + THREE.MathUtils.clamp(player.vx * 0.3, -2.5, 2.5) + 1;
    ty = Math.max(player.y, -5) + 1.8;
  }
  const k = 1 - Math.exp(-dt * (game.state === 'menu' ? 1.5 : 5));
  game.cam.x += (tx - game.cam.x) * k;
  game.cam.y += (ty + 1.6 - game.cam.y) * (1 - Math.exp(-dt * 3.5));
  game.cam.z += (dist - game.cam.z) * k;
  game.shake = Math.max(0, game.shake - dt);
  const sh = game.shake * game.shake * 1.2;
  camera.position.set(game.cam.x + (Math.random() - 0.5) * sh, game.cam.y + (Math.random() - 0.5) * sh, game.cam.z);
  game.camLook.set(game.cam.x, game.cam.y - 1.6 - 0.2, 0);
  camera.lookAt(game.camLook);

  sunLight.position.set(game.cam.x - 8, game.cam.y + 16, 12);
  sunLight.target.position.set(game.cam.x, game.cam.y - 3, 0);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 1 ? 50 : 42;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Menus ----------
function buildLogo() {
  const text = 'Boing Tales';
  const colors = ['#ff5a6e', '#ffb000', '#7ad957', '#3fb0ff', '#b18cff'];
  let ci = 0;
  $('logo').innerHTML = [...text]
    .map((ch, i) => (ch === ' ' ? '<span class="space"> </span>' : `<span style="--c:${colors[ci++ % colors.length]};--d:${i * 0.08}s">${ch}</span>`))
    .join('');
}

function buildLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const [a, b, shadow] = THEMES[L.theme].card;
    const locked = i >= save.unlocked;
    const stars = save.stars[i] || 0;
    const card = document.createElement('button');
    card.className = 'level-card' + (locked ? ' locked' : '');
    card.style.cssText = `--a:${a};--b:${b};--shadow:${shadow}`;
    card.innerHTML = `
      <div class="num">Level ${i + 1}</div>
      <div class="name">${L.name}</div>
      <div class="card-stars">${[0, 1, 2].map((s) => `<span class="${s < stars ? '' : 'off'}">★</span>`).join('')}</div>`;
    card.addEventListener('mouseenter', () => {
      if (!locked && game.state === 'menu' && game.levelIndex !== i) loadLevel(i);
    });
    card.addEventListener('click', () => {
      if (locked) { sfx.click(); toast('Finish the previous level to unlock'); return; }
      sfx.click();
      startLevel(i);
    });
    grid.appendChild(card);
  });
}

function goMenu() {
  game.state = 'menu';
  ui.hud.classList.add('hidden');
  ui.touch.classList.add('hidden');
  ui.titleCard.classList.add('hidden');
  buildLevelGrid();
  showOnly(ui.menu);
  const idx = Math.min(save.unlocked - 1, LEVELS.length - 1);
  loadLevel(idx);
  player.root.visible = true;
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  showOnly(ui.pause);
  ui.touch.classList.add('hidden');
}

function resume() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  showOnly(null);
  ui.touch.classList.toggle('hidden', !isTouchDevice());
  clock.getDelta();
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  sfx.click();
  const a = btn.dataset.action;
  if (a === 'resume') resume();
  else if (a === 'restart') startLevel(game.levelIndex);
  else if (a === 'menu') goMenu();
  else if (a === 'next') startLevel(Math.min(game.levelIndex + 1, LEVELS.length - 1));
});

$('btn-pause').addEventListener('click', () => (game.state === 'paused' ? resume() : pause()));
const soundBtn = $('btn-sound');
soundBtn.addEventListener('click', () => {
  unlockAudio();
  const on = toggleSound();
  soundBtn.classList.toggle('off', !on);
});

initInput((e) => {
  unlockAudio();
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'playing') pause();
    else if (game.state === 'paused') resume();
  } else if (e.code === 'KeyR' && (game.state === 'playing' || game.state === 'gameover')) {
    startLevel(game.levelIndex);
  } else if (e.code === 'KeyM') {
    const on = toggleMusic();
    toast(on ? 'Music on' : 'Music off');
  } else if ((e.code === 'Enter' || e.code === 'Space') && game.state === 'menu') {
    startLevel(Math.min(save.unlocked - 1, LEVELS.length - 1));
  } else if (e.code === 'Enter' && game.state === 'complete') {
    $('btn-next').click();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ---------- Boot ----------
buildLogo();
resize();
goMenu();
soundBtn.classList.toggle('off', !isSoundOn());
frame();

// handy for debugging from the console
window.__game = { game, player, startLevel, interact };
