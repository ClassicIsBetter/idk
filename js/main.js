// ===========================================================
// main.js — application entry point
// ===========================================================
import * as THREE from 'three';
import { bus, toast, formatTime, clamp } from './utils.js';
import { buildAvatar, disposeAvatar } from './avatar.js';
import { World, setupEnvironment, createObjectData } from './world.js';
import { PlayerController } from './player.js';
import { ThirdPersonCamera } from './camera.js';
import { Editor } from './editor.js';
import { GameRuntime } from './scripting.js';
import { UI } from './ui.js';
import { getBuiltinGame } from './games.js';
import { getProject, saveProject, exportProjectJSON, importProjectFromFile } from './saveSystem.js';

// ===========================================================
// Audio — tiny procedural sound engine (no external/copyrighted assets)
// ===========================================================
class AudioManager {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.4;
    this.sfxVol = 0.7;
    this._ambientNodes = null;
  }
  _ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  _blip(freq, dur, type = 'sine', gainMul = 1) {
    const ctx = this._ensure();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(this.sfxVol * 0.5 * gainMul, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }
  jump() { this._blip(520, 0.14, 'triangle'); }
  land() { this._blip(160, 0.1, 'sine', 0.6); }
  footstep() { this._blip(90 + Math.random() * 20, 0.06, 'square', 0.3); }
  click() { this._blip(700, 0.05, 'square', 0.5); }
  attack() { this._blip(300, 0.12, 'sawtooth', 0.7); }
  hit() { this._blip(140, 0.15, 'square', 0.8); }
  score() { this._blip(900, 0.12, 'sine', 0.6); }
  win() { [660, 880, 1100].forEach((f, i) => setTimeout(() => this._blip(f, 0.2, 'sine', 0.6), i * 110)); }

  startAmbient() {
    if (this._ambientNodes) return;
    const ctx = this._ensure();
    const gain = ctx.createGain();
    gain.gain.value = this.musicVol * 0.12;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 110;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 165;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain).connect(gain.gain);
    o1.connect(gain); o2.connect(gain); gain.connect(ctx.destination);
    o1.start(); o2.start(); lfo.start();
    this._ambientNodes = { gain, o1, o2, lfo };
  }
  stopAmbient() {
    if (!this._ambientNodes) return;
    const { gain, o1, o2, lfo } = this._ambientNodes;
    const ctx = this.ctx;
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    setTimeout(() => { o1.stop(); o2.stop(); lfo.stop(); }, 450);
    this._ambientNodes = null;
  }
  setMusicVolume(v) { this.musicVol = v; if (this._ambientNodes) this._ambientNodes.gain.gain.value = v * 0.12; }
  setSfxVolume(v) { this.sfxVol = v; }
}
const audio = new AudioManager();
document.addEventListener('click', () => audio._ensure(), { once: true });

// ===========================================================
// Mini avatar viewer — small self-contained rotating preview
// used on the Home hero panel and the Avatar customization page.
// ===========================================================
class MiniAvatarViewer {
  constructor(mountEl, config, { interactive = false } = {}) {
    this.mount = mountEl;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountEl.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    const hemi = new THREE.HemisphereLight('#bfe3ff', '#222', 1.1);
    const dir = new THREE.DirectionalLight('#fff3d6', 1.1);
    dir.position.set(3, 5, 4);
    this.scene.add(hemi, dir);

    this.avatar = buildAvatar(config);
    this.avatar.position.y = 0;
    this.pivot = new THREE.Group();
    this.pivot.add(this.avatar);
    this.scene.add(this.pivot);

    this.angle = 0.4;
    this.autoRotate = true;
    this.camDist = 3.6;
    this.camHeight = 1.5;

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(mountEl);
    this._resize();

    if (interactive) {
      let dragging = false, lastX = 0;
      mountEl.style.cursor = 'grab';
      mountEl.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; this.autoRotate = false; mountEl.style.cursor = 'grabbing'; });
      window.addEventListener('mouseup', () => { dragging = false; mountEl.style.cursor = 'grab'; });
      window.addEventListener('mousemove', (e) => { if (dragging) { this.angle += (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
    }

    this._running = true;
    this._lastT = performance.now();
    const loop = () => {
      if (!this._running) return;
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - this._lastT) / 1000);
      this._lastT = now;
      if (this.autoRotate) this.angle += dt * 0.5;
      this.camera.position.set(Math.sin(this.angle) * this.camDist, this.camHeight, Math.cos(this.angle) * this.camDist);
      this.camera.lookAt(0, 1.1, 0);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setConfig(config) {
    disposeAvatar(this.avatar);
    this.pivot.remove(this.avatar);
    this.avatar = buildAvatar(config);
    this.pivot.add(this.avatar);
  }

  _resize() {
    const w = this.mount.clientWidth || 300;
    const h = this.mount.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this._running = false;
    this._ro.disconnect();
    disposeAvatar(this.avatar);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ===========================================================
// GameSession — the 3D game/editor viewport (play + edit modes)
// ===========================================================
class GameSession {
  constructor(canvas, avatarConfigProvider) {
    this.canvas = canvas;
    this.avatarConfigProvider = avatarConfigProvider;
    this.mode = null; // 'play' | 'edit'
    this.project = null;
    this.score = 0;
    this.elapsed = 0;
    this.timerRunning = false;
    this.finished = false;
    this.paused = false;
    this.suspended = true;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);

    this.scene = new THREE.Scene();
    setupEnvironment(this.scene, this.renderer);
    this.world = new World(this.scene);

    this.avatarRoot = buildAvatar(avatarConfigProvider());
    this.scene.add(this.avatarRoot);
    this.player = new PlayerController(this.avatarRoot, this.world, this.scene);
    this.orbitCam = new ThirdPersonCamera(this.camera, canvas, this.world);

    this.editor = new Editor({ scene: this.scene, camera: this.camera, renderer: this.renderer, world: this.world, orbitCamera: this.orbitCam });

    this.npcHealth = new Map();
    this.npcCooldown = new Map();
    this._attackCooldown = 0;
    this._footstepTimer = 0;

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(document.getElementById('game-canvas-wrap'));

    this._bindInputs();
  }

  refreshAvatar() {
    const cfg = this.avatarConfigProvider();
    disposeAvatar(this.avatarRoot);
    this.scene.remove(this.avatarRoot);
    this.avatarRoot = buildAvatar(cfg);
    this.scene.add(this.avatarRoot);
    this.player.avatar = this.avatarRoot;
    this.player.animator = new (this.player.animator.constructor)(this.avatarRoot);
  }

  _bindInputs() {
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode !== 'play' || this.paused) return;
      if (!this.orbitCam.locked) { this.orbitCam.lockPointer(); return; }
      if (e.button === 0) this._handleAttack();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.mode === 'play' && !this.suspended) this.togglePause();
        else if (this.mode === 'edit') this.editor.deselect();
      }
      if (e.code === 'KeyF' && this.mode === 'play') this._toggleFirstPersonQuick();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.mode === 'play' && !this.orbitCam.locked && !this.paused && !this.suspended) {
        this.togglePause(true);
      }
    });

    document.getElementById('pause-resume').addEventListener('click', () => this.togglePause(false));
    document.getElementById('pause-respawn').addEventListener('click', () => { this.player.respawn(); this.togglePause(false); });
    document.getElementById('pause-settings').addEventListener('click', () => { this.exitToMenu(); bus.emit('nav-settings'); });
    document.getElementById('pause-exit').addEventListener('click', () => {
      if (this._playtestOrigin) { this._playtestOrigin = false; this.togglePause(false); this.enterEditor(); toast('Back to editor'); }
      else this.exitToMenu();
    });

    document.getElementById('editor-exit').addEventListener('click', () => this.exitToMenu());
    document.getElementById('editor-save').addEventListener('click', () => this._saveCurrentProject());
    document.getElementById('editor-export').addEventListener('click', () => exportProjectJSON(this._exportableProject()));
    document.getElementById('editor-import').addEventListener('click', () => this._importFlow());
    document.getElementById('editor-playtest').addEventListener('click', () => { this._playtestOrigin = true; this.enterPlay({ keepLiveWorld: true }); });
    document.getElementById('editor-project-name').addEventListener('change', (e) => {
      if (this.project) this.project.name = e.target.value;
    });
  }

  _toggleFirstPersonQuick() {
    this.orbitCam.setFirstPerson(!this.orbitCam.firstPerson);
  }

  // ---------------------------------------------------------
  loadProject(projectData, { startInEditor = false } = {}) {
    this.project = projectData;
    this._playtestOrigin = false;
    this.score = 0;
    this.elapsed = 0;
    this.finished = false;
    this.timerRunning = !!(projectData.settings && projectData.settings.timer);
    this.npcHealth.clear();
    this.npcCooldown.clear();

    this.world.loadFromData(projectData.world.map(d => JSON.parse(JSON.stringify(d))));
    this.editor.loadNewWorld();

    const spawnData = this.world.allData().find(d => d.type === 'spawn');
    const spawnPos = spawnData ? new THREE.Vector3(spawnData.position.x, spawnData.position.y + 1, spawnData.position.z) : new THREE.Vector3(0, 2, 0);
    this.player.setSpawn(spawnPos);
    this.player.respawn();

    this.orbitCam.theta = Math.PI;
    this.orbitCam.setFirstPerson(false);

    this.runtime = new GameRuntime(this._buildScriptContext());

    document.getElementById('editor-project-name').value = projectData.name || 'Untitled Game';
    document.getElementById('hud-game-name').textContent = projectData.name || 'Untitled Game';
    document.getElementById('hud-health-wrap').classList.toggle('hidden', projectData.mode !== 'sword');

    if (startInEditor || (projectData.settings && projectData.settings.openInEditor)) {
      this.enterEditor();
    } else {
      this.enterPlay();
    }
  }

  _buildScriptContext() {
    const session = this;
    return {
      world: this.world,
      globalScripts: this.project?.scripts || [],
      showMessage: (text) => session._hudMessage(text),
      addScore: (amount) => session._addScore(amount),
      damagePlayer: (amount) => { session.player.takeDamage(amount); session._updateHealthBar(); },
      teleport: (x, y, z) => session.player.position.set(x, y, z),
      respawnPlayer: () => session.player.respawn(),
      setCheckpoint: (data) => session.player.setSpawn(new THREE.Vector3(data.position.x, data.position.y + 1, data.position.z)),
      spawnObjectData: (data) => session.world.addObject(createObjectData(data.type || 'part', data)),
      destroyObjectId: (id) => { if (id) session.world.removeObject(id); },
    };
  }

  // ---------------------------------------------------------
  enterPlay({ keepLiveWorld = false } = {}) {
    this.mode = 'play';
    this.suspended = false;
    this.paused = false;
    this.editor.setActive(false);
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    document.getElementById('hud-crosshair').classList.toggle('hidden', !this.orbitCam.firstPerson);
    this.player.enabled = true;
    this.player.respawn();
    audio.startAmbient();
    this.runtime?.fireEvent('onPlayerJoin');
    if (!keepLiveWorld) toast(`Loaded ${this.project.name}`);
  }

  enterEditor() {
    this.mode = 'edit';
    this.suspended = false;
    this.paused = false;
    this.player.enabled = false;
    this.orbitCam.unlockPointer();
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    this.editor.setActive(true);
    audio.stopAmbient();
  }

  togglePause(forceState) {
    this.paused = forceState !== undefined ? forceState : !this.paused;
    document.getElementById('pause-menu').classList.toggle('hidden', !this.paused);
    document.getElementById('pause-exit').textContent = this._playtestOrigin ? 'Back to editor' : 'Exit game';
    if (this.paused) this.orbitCam.unlockPointer();
  }

  exitToMenu() {
    this.suspended = true;
    this.mode = null;
    this.orbitCam.unlockPointer();
    this.editor.setActive(false);
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('pause-menu').classList.add('hidden');
    audio.stopAmbient();
    bus.emit('exit-game');
  }

  // ---------------------------------------------------------
  _saveCurrentProject() {
    if (!this.project || this.project.builtin) { toast("Built-in demos can't be overwritten — use Export instead."); return; }
    const data = this._exportableProject();
    saveProject(data);
    toast('Project saved');
    bus.emit('project-saved');
  }

  _exportableProject() {
    return { ...this.project, world: this.world.allData().map(d => JSON.parse(JSON.stringify(d))) };
  }

  async _importFlow() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = await importProjectFromFile(file);
        this.loadProject(data, { startInEditor: true });
        toast('Project imported');
      } catch (e) {
        toast('Import failed: invalid JSON file');
      }
    });
    input.click();
  }

  // ---------------------------------------------------------
  _hudMessage(text) {
    const m = document.getElementById('hud-message');
    m.textContent = text;
    m.classList.add('show');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => m.classList.remove('show'), 2200);
  }
  _addScore(amount) {
    this.score += amount;
    document.getElementById('hud-score').textContent = `Score: ${this.score}`;
    if (amount > 0) audio.score();
  }
  _updateHealthBar() {
    const pct = clamp((this.player.health / this.player.maxHealth) * 100, 0, 100);
    document.getElementById('hud-health-fill').style.width = pct + '%';
    if (this.player.health <= 0) {
      this._hudMessage('You were defeated — respawning');
      this.player.respawn();
      this._updateHealthBar();
    }
  }

  _handleAttack() {
    if (this._attackCooldown > 0) return;
    this._attackCooldown = 0.35;
    this.player.attack();
    audio.attack();
    // find nearby npc/model to hit
    const playerPos = this.player.position;
    for (const data of this.world.allData()) {
      if (data.type !== 'npc') continue;
      const mesh = this.world.getMesh(data.id);
      if (!mesh) continue;
      const dist = mesh.position.distanceTo(new THREE.Vector3(playerPos.x, mesh.position.y, playerPos.z));
      if (dist < 2.3) {
        const hp = (this.npcHealth.get(data.id) ?? 100) - 34;
        this.npcHealth.set(data.id, hp);
        audio.hit();
        this._hudMessage(`Hit ${data.name}!`);
        this._addScore(10);
        this._flash(mesh);
        if (hp <= 0) {
          this.npcHealth.set(data.id, 100);
          this._hudMessage(`${data.name} down! Respawning...`);
          setTimeout(() => { /* dummy "respawns" — position unchanged, health reset */ }, 10);
        }
      }
    }
  }

  _flash(mesh) {
    mesh.traverse(o => {
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          const orig = m.emissive ? m.emissive.getHex() : 0x000000;
          if (m.emissive) {
            m.emissive.setHex(0xff4444);
            setTimeout(() => m.emissive.setHex(orig), 120);
          }
        });
      }
    });
  }

  // ---------------------------------------------------------
  update(dt) {
    if (this.suspended) return;
    if (this.mode === 'play' && !this.paused) {
      this.player.update(dt, this.orbitCam.yaw);

      // footsteps
      if (this.player.grounded && (this.player.state === 'walk' || this.player.state === 'run')) {
        this._footstepTimer -= dt;
        if (this._footstepTimer <= 0) { audio.footstep(); this._footstepTimer = this.player.state === 'run' ? 0.26 : 0.4; }
      }
      if (this.player.animator.justLanded) { audio.land(); this.player.animator.justLanded = false; }

      this._attackCooldown = Math.max(0, this._attackCooldown - dt);

      // gameplay: checkpoints / killzones / finish via direct type checks + generic scripts via touches
      const p = this.player.position;
      const playerBox = new THREE.Box3(
        new THREE.Vector3(p.x - 0.4, p.y, p.z - 0.4),
        new THREE.Vector3(p.x + 0.4, p.y + 1.8, p.z + 0.4)
      );
      for (const data of this.world.allData()) {
        const mesh = this.world.getMesh(data.id);
        if (!mesh) continue;
        if (data.type === 'checkpoint' || data.type === 'killzone' || data.type === 'finish') {
          const box = new THREE.Box3().setFromObject(mesh);
          if (box.intersectsBox(playerBox)) {
            if (data.type === 'checkpoint' && this._lastCheckpoint !== data.id) {
              this._lastCheckpoint = data.id;
              this.player.setSpawn(new THREE.Vector3(mesh.position.x, mesh.position.y + 1, mesh.position.z));
              this._hudMessage('Checkpoint!');
              this._addScore(5);
            } else if (data.type === 'killzone') {
              this.player.respawn();
              this._hudMessage('Ouch! Respawned.');
            } else if (data.type === 'finish' && !this.finished) {
              this.finished = true;
              this.timerRunning = false;
              this._hudMessage('🏁 Finished!');
              this._addScore(50);
              audio.win();
            }
          }
        }
      }
      this.runtime?.checkTouches(playerBox);

      // sword-mode: dummies periodically strike back if player lingers close
      if (this.project?.mode === 'sword') {
        document.getElementById('hud-health-wrap').classList.remove('hidden');
        for (const data of this.world.allData()) {
          if (data.type !== 'npc') continue;
          const mesh = this.world.getMesh(data.id);
          if (!mesh) continue;
          const dist = mesh.position.distanceTo(p);
          const cd = this.npcCooldown.get(data.id) || 0;
          if (dist < 1.8) {
            if (cd <= 0) {
              this.player.takeDamage(6);
              this._updateHealthBar();
              this.npcCooldown.set(data.id, 1.1);
              this._flash(mesh);
            }
          }
          this.npcCooldown.set(data.id, Math.max(0, (this.npcCooldown.get(data.id) || 0) - dt));
        }
      }

      if (this.timerRunning) {
        this.elapsed += dt;
        document.getElementById('hud-timer').textContent = formatTime(this.elapsed);
      }

      this.orbitCam.update(dt, new THREE.Vector3(p.x, p.y + (this.avatarRoot.userData.height || 2.2) * 0.72, p.z), this.avatarRoot);
    } else if (this.mode === 'edit') {
      // free orbit around current target for building
      const target = this._editorFocus || new THREE.Vector3(0, 1, 0);
      this.orbitCam.update(dt, target, null);
      this.avatarRoot.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const wrap = document.getElementById('game-canvas-wrap');
    const w = wrap.clientWidth || window.innerWidth;
    const h = wrap.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// ===========================================================
// Boot / app wiring
// ===========================================================
const BOOT_TIPS = [
  'Stacking voxels…', 'Rigging blocky limbs…', 'Warming up the physics…',
  'Painting checkpoints…', 'Tuning the camera boom…', 'Waking up the training dummies…',
];

async function boot() {
  const fill = document.getElementById('boot-bar-fill');
  const tip = document.getElementById('boot-tip');
  let p = 0;
  const tipInterval = setInterval(() => { tip.textContent = BOOT_TIPS[Math.floor(Math.random() * BOOT_TIPS.length)]; }, 550);
  await new Promise((resolve) => {
    const step = () => {
      p += Math.random() * 18 + 6;
      fill.style.width = Math.min(100, p) + '%';
      if (p >= 100) { resolve(); return; }
      setTimeout(step, 140);
    };
    step();
  });
  clearInterval(tipInterval);
  await new Promise(r => setTimeout(r, 150));

  document.getElementById('boot-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  initApp();
}

function initApp() {
  const ui = new UI();
  audio.setMusicVolume(ui.settings.music);
  audio.setSfxVolume(ui.settings.sfx);

  const getAvatarConfig = () => ui.avatarConfig;

  // ---- hero + avatar preview mini viewers ----
  const heroViewer = new MiniAvatarViewer(document.getElementById('hero-avatar-mount'), getAvatarConfig(), { interactive: false });
  const avatarPreview = new MiniAvatarViewer(document.getElementById('avatar-preview-mount'), getAvatarConfig(), { interactive: true });

  bus.on('avatar-changed', (cfg) => {
    heroViewer.setConfig(cfg);
    avatarPreview.setConfig(cfg);
    if (session.mode) session.refreshAvatar();
  });

  bus.on('settings-changed', (settings) => {
    audio.setMusicVolume(settings.music);
    audio.setSfxVolume(settings.sfx);
    session.orbitCam.sensitivity = settings.sensitivity;
    session.orbitCam.setFirstPerson(settings.firstPerson);
    document.getElementById('hud-crosshair').classList.toggle('hidden', !settings.firstPerson);
  });

  bus.on('nav-settings', () => ui.showScreen('settings'));

  // ---- main game session ----
  const canvas = document.getElementById('game-canvas');
  const session = new GameSession(canvas, getAvatarConfig);
  session.orbitCam.sensitivity = ui.settings.sensitivity;
  session.orbitCam.setFirstPerson(ui.settings.firstPerson);

  function launchProject(id, { edit = false } = {}) {
    const builtin = getBuiltinGame(id);
    const data = builtin || getProject(id);
    if (!data) { toast('Project not found'); return; }
    ui.showScreen('game');
    // small timeout lets the canvas become visible before we size the renderer
    requestAnimationFrame(() => {
      session.resize();
      session.loadProject(JSON.parse(JSON.stringify(data)), { startInEditor: edit });
    });
  }

  bus.on('play-game', (id) => launchProject(id, { edit: false }));
  bus.on('open-editor', (id) => launchProject(id, { edit: true }));
  bus.on('exit-game', () => ui.showScreen('home'));

  // ---- shared render loop ----
  let last = performance.now();
  let fpsAcc = 0, fpsCount = 0, fpsTimer = 0;
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const onGameScreen = document.getElementById('screen-game').classList.contains('active');
    if (onGameScreen) session.update(dt);

    if (ui.settings.showFps) {
      fpsAcc += dt; fpsCount++;
      fpsTimer += dt;
      if (fpsTimer > 0.4) {
        document.getElementById('fps-badge').textContent = `${Math.round(fpsCount / fpsAcc)} FPS`;
        fpsAcc = 0; fpsCount = 0; fpsTimer = 0;
      }
    }
  }
  loop();

  window.addEventListener('resize', () => session.resize());

  toast('Welcome to Blockverse!');
}

boot();
