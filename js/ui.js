// ===========================================================
// ui.js — screen navigation + non-3D UI wiring
// ===========================================================
import { el, toast, bus } from './utils.js';
import { CATALOG, defaultAvatarConfig } from './avatar.js';
import {
  listProjects, deleteProject, newProjectData, saveProject,
  loadAvatarConfig, saveAvatarConfig, loadSettings, saveSettings,
} from './saveSystem.js';
import { getBuiltinGames } from './games.js';

export class UI {
  constructor() {
    this.avatarConfig = loadAvatarConfig() || defaultAvatarConfig();
    this.settings = Object.assign({
      graphics: 'medium', sensitivity: 1, music: 0.4, sfx: 0.7, firstPerson: false, showFps: false,
    }, loadSettings() || {});
    this._bindNav();
    this._bindCreate();
    this._bindAvatarTabs();
    this._bindSettings();
    this._bindHero();
    this.renderDiscovery();
    this.renderMyGames();
    this.renderCreateProjects();
    this.renderAvatarTab('skin');
    this.applySettingsToInputs();
  }

  // ---------------------------------------------------------
  _bindNav() {
    document.querySelectorAll('.nav-btn[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => this.showScreen(btn.dataset.screen));
    });
  }

  showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(`screen-${name}`)?.classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.screen === name));
    document.getElementById('topnav').classList.toggle('hidden', name === 'game');
    if (name === 'mygames') this.renderMyGames();
    if (name === 'create') this.renderCreateProjects();
    bus.emit('screen-change', name);
  }

  _bindHero() {
    document.getElementById('hero-play-btn').addEventListener('click', () => this.showScreen('home'));
    document.getElementById('hero-create-btn').addEventListener('click', () => this.showScreen('create'));
  }

  // ---------------------------------------------------------
  renderDiscovery() {
    const grid = document.getElementById('discovery-grid');
    grid.innerHTML = '';
    getBuiltinGames().forEach(g => grid.appendChild(this._gameCard(g, { launch: true })));
  }

  renderMyGames() {
    const grid = document.getElementById('mygames-grid');
    grid.innerHTML = '';
    const builtins = getBuiltinGames();
    const own = listProjects();
    [...builtins, ...own].forEach(g => grid.appendChild(this._gameCard(g, { launch: true, editable: !g.builtin })));
    if (own.length === 0) {
      const hint = el('p', 'muted small', 'Your saved and published projects will show up here alongside the built-in demos.');
      grid.appendChild(hint);
    }
  }

  renderCreateProjects() {
    const wrap = document.getElementById('create-projects-list');
    wrap.innerHTML = '';
    listProjects().forEach(p => {
      const card = el('div', 'project-card');
      card.appendChild(el('div', 'card-title', `${p.icon || '🧊'} ${p.name}`));
      card.appendChild(el('div', 'card-sub', new Date(p.updated).toLocaleDateString()));
      const row = el('div', 'row');
      const editBtn = el('button', 'btn btn-ghost', 'Edit');
      editBtn.addEventListener('click', () => bus.emit('open-editor', p.project_id));
      const delBtn = el('button', 'btn btn-danger', 'Delete');
      delBtn.addEventListener('click', () => { deleteProject(p.project_id); toast('Project deleted'); this.renderCreateProjects(); this.renderMyGames(); });
      row.appendChild(editBtn); row.appendChild(delBtn);
      card.appendChild(row);
      wrap.appendChild(card);
    });
  }

  _gameCard(g, { launch, editable } = {}) {
    const card = el('div', 'card');
    const thumb = el('div', 'card-thumb', g.icon || '🎮');
    thumb.style.background = 'linear-gradient(135deg, var(--bg-2), var(--bg-3))';
    card.appendChild(thumb);
    const body = el('div', 'card-body');
    body.appendChild(el('div', 'card-title', g.name));
    body.appendChild(el('div', 'card-sub', g.description || `by ${g.creator || 'Unknown'}`));
    card.appendChild(body);
    const actions = el('div', 'card-actions');
    const playBtn = el('button', 'btn btn-primary', '▶ Play');
    playBtn.addEventListener('click', () => bus.emit('play-game', g.project_id));
    actions.appendChild(playBtn);
    if (editable) {
      const editBtn = el('button', 'btn btn-ghost', 'Edit');
      editBtn.addEventListener('click', () => bus.emit('open-editor', g.project_id));
      actions.appendChild(editBtn);
      const delBtn = el('button', 'btn btn-danger', '✕');
      delBtn.addEventListener('click', () => { deleteProject(g.project_id); toast('Deleted'); this.renderMyGames(); this.renderCreateProjects(); });
      actions.appendChild(delBtn);
    }
    card.appendChild(actions);
    return card;
  }

  // ---------------------------------------------------------
  _bindCreate() {
    document.getElementById('create-new-project').addEventListener('click', () => {
      const data = newProjectData('Untitled Game');
      saveProject(data);
      toast('New project created');
      bus.emit('open-editor', data.project_id);
      this.renderCreateProjects();
    });
  }

  // ---------------------------------------------------------
  _bindAvatarTabs() {
    document.querySelectorAll('.avatar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.avatar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.renderAvatarTab(tab.dataset.tab);
      });
    });
  }

  renderAvatarTab(tab) {
    const wrap = document.getElementById('avatar-options');
    wrap.innerHTML = '';
    const items = CATALOG[tab] || [];
    items.forEach(item => {
      const swatch = el('div', 'opt-swatch', item.label);
      if (item.color) swatch.style.background = `linear-gradient(160deg, ${item.color}, ${shade(item.color)})`;
      if (this.avatarConfig[tab] === item.id) swatch.classList.add('selected');
      swatch.addEventListener('click', () => {
        this.avatarConfig[tab] = item.id;
        saveAvatarConfig(this.avatarConfig);
        this.renderAvatarTab(tab);
        bus.emit('avatar-changed', this.avatarConfig);
      });
      wrap.appendChild(swatch);
    });
  }

  // ---------------------------------------------------------
  _bindSettings() {
    const g = document.getElementById('setting-graphics');
    const sens = document.getElementById('setting-sensitivity');
    const music = document.getElementById('setting-music');
    const sfx = document.getElementById('setting-sfx');
    const fp = document.getElementById('setting-firstperson');
    const fps = document.getElementById('setting-showfps');
    const persist = () => { saveSettings(this.settings); bus.emit('settings-changed', this.settings); };
    g.addEventListener('change', () => { this.settings.graphics = g.value; persist(); });
    sens.addEventListener('input', () => { this.settings.sensitivity = parseFloat(sens.value); persist(); });
    music.addEventListener('input', () => { this.settings.music = parseFloat(music.value); persist(); });
    sfx.addEventListener('input', () => { this.settings.sfx = parseFloat(sfx.value); persist(); });
    fp.addEventListener('change', () => { this.settings.firstPerson = fp.checked; persist(); });
    fps.addEventListener('change', () => { this.settings.showFps = fps.checked; document.getElementById('fps-badge').classList.toggle('hidden', !fps.checked); persist(); });
  }

  applySettingsToInputs() {
    document.getElementById('setting-graphics').value = this.settings.graphics;
    document.getElementById('setting-sensitivity').value = this.settings.sensitivity;
    document.getElementById('setting-music').value = this.settings.music;
    document.getElementById('setting-sfx').value = this.settings.sfx;
    document.getElementById('setting-firstperson').checked = this.settings.firstPerson;
    document.getElementById('setting-showfps').checked = this.settings.showFps;
    document.getElementById('fps-badge').classList.toggle('hidden', !this.settings.showFps);
  }
}

function shade(hex) {
  try {
    const c = parseInt(hex.slice(1), 16);
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    r = Math.max(0, r - 40); g = Math.max(0, g - 40); b = Math.max(0, b - 40);
    return `rgb(${r},${g},${b})`;
  } catch { return hex; }
}
