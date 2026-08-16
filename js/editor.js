// ===========================================================
// editor.js — in-browser world editor: select/move/rotate/scale,
// explorer hierarchy, properties panel, safe script editor, undo/redo.
// ===========================================================
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { el, toast, deepClone, uid } from './utils.js';
import { createObjectData } from './world.js';
import { validateScriptText } from './scripting.js';

export class Editor {
  constructor({ scene, camera, renderer, world, orbitCamera }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.world = world;
    this.orbitCamera = orbitCamera; // ThirdPersonCamera, disabled while dragging gizmo

    this.active = false;
    this.tool = 'select';
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.transformControls = new TransformControls(camera, renderer.domElement);
    this.transformControls.setSize(0.9);
    this.scene.add(this.transformControls.getHelper ? this.transformControls.getHelper() : this.transformControls);
    this.transformControls.addEventListener('dragging-changed', (e) => {
      this._dragging = e.value;
      if (!e.value && this.selectedId) {
        this._pushUndo();
        this.world.syncFromMesh(this.selectedId);
        this._refreshPropertiesValues();
      }
    });
    this.transformControls.addEventListener('objectChange', () => {
      if (this.selectedId) this._liveSyncTransform();
    });

    this._bindDom();
    this._bindPointer();
  }

  // ---------------------------------------------------------
  loadNewWorld() {
    this.transformControls.detach();
    this.selectedId = null;
    this.undoStack = [];
    this.redoStack = [];
    this._renderExplorer();
    this._renderProperties();
  }

  // ---------------------------------------------------------
  setActive(active) {
    this.active = active;
    document.getElementById('editor-chrome').classList.toggle('hidden', !active);
    if (!active) this.deselect();
  }

  _bindPointer() {
    this.renderer.domElement.addEventListener('click', (e) => {
      if (!this.active || this._dragging) return;
      if (this.tool !== 'select' && this._justAttached) { this._justAttached = false; return; }
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const meshes = [...this.world.objects.values()].map(o => o.mesh);
      const hits = this.raycaster.intersectObjects(meshes, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData.id && obj.parent) obj = obj.parent;
        if (obj && obj.userData.id) this.select(obj.userData.id);
      } else {
        this.deselect();
      }
    });
  }

  _bindDom() {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
    });
    document.getElementById('tool-duplicate').addEventListener('click', () => this.duplicateSelected());
    document.getElementById('tool-delete').addEventListener('click', () => this.deleteSelected());
    document.getElementById('tool-undo').addEventListener('click', () => this.undo());
    document.getElementById('tool-redo').addEventListener('click', () => this.redo());

    document.querySelectorAll('.add-btn[data-add]').forEach(btn => {
      btn.addEventListener('click', () => this.addObject(btn.dataset.add));
    });

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
      if (e.code === 'KeyG') this.setTool('move');
      if (e.code === 'KeyR') this.setTool('rotate');
      if (e.code === 'KeyB') this.setTool('scale');
      if (e.code === 'KeyQ') this.setTool('select');
      if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSelected();
      if (e.ctrlKey && e.code === 'KeyD') { e.preventDefault(); this.duplicateSelected(); }
      if (e.ctrlKey && e.code === 'KeyZ') { e.preventDefault(); this.undo(); }
      if (e.ctrlKey && e.code === 'KeyY') { e.preventDefault(); this.redo(); }
    });
  }

  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    if (tool === 'select') {
      this.transformControls.detach();
    } else if (this.selectedId) {
      this.transformControls.setMode(tool === 'move' ? 'translate' : tool);
      this.transformControls.attach(this.world.getMesh(this.selectedId));
      this._justAttached = true;
    }
  }

  select(id) {
    this.selectedId = id;
    const mesh = this.world.getMesh(id);
    if (this.tool !== 'select' && mesh) {
      this.transformControls.setMode(this.tool === 'move' ? 'translate' : this.tool);
      this.transformControls.attach(mesh);
    }
    this._renderExplorer();
    this._renderProperties();
  }

  deselect() {
    this.selectedId = null;
    this.transformControls.detach();
    this._renderExplorer();
    this._renderProperties();
  }

  addObject(type) {
    const data = createObjectData(type, {
      position: { x: (Math.random() - 0.5) * 4, y: 3, z: (Math.random() - 0.5) * 4 },
    });
    this._pushUndo();
    this.world.addObject(data);
    this.select(data.id);
    toast(`Added ${data.name}`);
    this._renderExplorer();
  }

  duplicateSelected() {
    if (!this.selectedId) return;
    const src = this.world.getData(this.selectedId);
    const copy = deepClone(src);
    copy.id = uid(copy.type);
    copy.name = src.name + ' Copy';
    copy.position = { x: src.position.x + 0.6, y: src.position.y, z: src.position.z + 0.6 };
    this._pushUndo();
    this.world.addObject(copy);
    this.select(copy.id);
    this._renderExplorer();
  }

  deleteSelected() {
    if (!this.selectedId) return;
    this._pushUndo();
    this.transformControls.detach();
    this.world.removeObject(this.selectedId);
    this.selectedId = null;
    this._renderExplorer();
    this._renderProperties();
  }

  // ---------------------------------------------------------
  _pushUndo() {
    this.undoStack.push(this.world.allData().map(deepClone));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack = [];
  }
  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this.world.allData().map(deepClone));
    const snapshot = this.undoStack.pop();
    this.transformControls.detach();
    this.world.loadFromData(snapshot);
    this.selectedId = null;
    this._renderExplorer();
    this._renderProperties();
  }
  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this.world.allData().map(deepClone));
    const snapshot = this.redoStack.pop();
    this.transformControls.detach();
    this.world.loadFromData(snapshot);
    this.selectedId = null;
    this._renderExplorer();
    this._renderProperties();
  }

  _liveSyncTransform() {
    const mesh = this.world.getMesh(this.selectedId);
    if (!mesh) return;
    // live-update only the numeric fields in the properties panel (cheap DOM writes)
    const p = document.getElementById('properties-body');
    if (!p) return;
    const set = (name, v) => { const inp = p.querySelector(`[data-field="${name}"]`); if (inp && document.activeElement !== inp) inp.value = v.toFixed(2); };
    set('position-x', mesh.position.x); set('position-y', mesh.position.y); set('position-z', mesh.position.z);
    set('rotation-x', mesh.rotation.x); set('rotation-y', mesh.rotation.y); set('rotation-z', mesh.rotation.z);
    set('scale-x', mesh.scale.x); set('scale-y', mesh.scale.y); set('scale-z', mesh.scale.z);
  }

  _refreshPropertiesValues() { this._renderProperties(); }

  // ---------------------------------------------------------
  _renderExplorer() {
    const tree = document.getElementById('explorer-tree');
    tree.innerHTML = '';
    const root = el('div', 'exp-node', null);
    root.innerHTML = `<span class="exp-name">🌍 World</span>`;
    tree.appendChild(root);
    for (const data of this.world.allData()) {
      const node = el('div', 'exp-node' + (data.id === this.selectedId ? ' selected' : ''));
      node.style.paddingLeft = '20px';
      const icon = iconFor(data.type);
      const name = el('span', 'exp-name', `${icon} ${data.name}`);
      node.appendChild(name);
      const del = el('span', 'exp-del', '✕');
      del.addEventListener('click', (e) => { e.stopPropagation(); this.select(data.id); this.deleteSelected(); });
      node.appendChild(del);
      node.addEventListener('click', () => this.select(data.id));
      node.addEventListener('dblclick', () => this._renameInline(node, data));
      tree.appendChild(node);
    }
  }

  _renameInline(node, data) {
    const input = document.createElement('input');
    input.className = 'exp-rename';
    input.value = data.name;
    node.innerHTML = '';
    node.appendChild(input);
    input.focus();
    input.select();
    const commit = () => {
      data.name = input.value.trim() || data.name;
      const mesh = this.world.getMesh(data.id);
      if (mesh) mesh.name = data.name;
      this._renderExplorer();
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => { if (e.code === 'Enter') input.blur(); });
  }

  _renderProperties() {
    const body = document.getElementById('properties-body');
    const scriptBody = document.getElementById('script-body');
    body.innerHTML = '';
    scriptBody.innerHTML = '';
    if (!this.selectedId) {
      body.innerHTML = '<p class="muted small">Nothing selected.</p>';
      scriptBody.innerHTML = '<p class="muted small">Select an object to attach a script.</p>';
      return;
    }
    const data = this.world.getData(this.selectedId);
    if (!data) return;

    const vecRow = (label, key, step = 0.1) => {
      const row = el('div', 'prop-row');
      row.appendChild(el('label', null, label));
      const group = el('div', 'prop-group');
      ['x', 'y', 'z'].forEach(axis => {
        const input = document.createElement('input');
        input.type = 'number'; input.step = step;
        input.dataset.field = `${key}-${axis}`;
        input.value = (data[key][axis]).toFixed(2);
        input.addEventListener('change', () => {
          this._pushUndo();
          data[key][axis] = parseFloat(input.value) || 0;
          this.world.updateObject(data.id, {});
          if (this.tool !== 'select') this.transformControls.attach(this.world.getMesh(data.id));
        });
        group.appendChild(input);
      });
      row.appendChild(group);
      return row;
    };

    body.appendChild(vecRow('Position', 'position'));
    body.appendChild(vecRow('Rotation', 'rotation', 0.05));
    body.appendChild(vecRow('Scale', 'scale', 0.05));

    if (data.size) {
      const row = el('div', 'prop-row');
      row.appendChild(el('label', null, 'Size'));
      const group = el('div', 'prop-group');
      ['x', 'y', 'z'].forEach(axis => {
        const input = document.createElement('input');
        input.type = 'number'; input.step = 0.1; input.min = 0.1;
        input.value = data.size[axis].toFixed(2);
        input.addEventListener('change', () => {
          this._pushUndo();
          data.size[axis] = Math.max(0.1, parseFloat(input.value) || 1);
          this.world.updateObject(data.id, {});
          if (this.tool !== 'select') this.transformControls.attach(this.world.getMesh(data.id));
        });
        group.appendChild(input);
      });
      row.appendChild(group);
      body.appendChild(row);
    }

    const colorRow = el('div', 'prop-row');
    colorRow.appendChild(el('label', null, 'Color'));
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = data.color || '#8a8f98';
    colorInput.addEventListener('input', () => {
      data.color = colorInput.value;
      this.world.updateObject(data.id, {});
      if (this.tool !== 'select') this.transformControls.attach(this.world.getMesh(data.id));
    });
    colorRow.appendChild(colorInput);
    body.appendChild(colorRow);

    const matRow = el('div', 'prop-row');
    matRow.appendChild(el('label', null, 'Material'));
    const matSelect = document.createElement('select');
    ['stone', 'grass', 'dirt', 'wood', 'concrete', 'brick', 'glass', 'metal', 'plastic', 'neon'].forEach(m => {
      const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
      if (data.material === m) opt.selected = true;
      matSelect.appendChild(opt);
    });
    matSelect.addEventListener('change', () => {
      this._pushUndo(); data.material = matSelect.value; this.world.updateObject(data.id, {});
      if (this.tool !== 'select') this.transformControls.attach(this.world.getMesh(data.id));
    });
    matRow.appendChild(matSelect);
    body.appendChild(matRow);

    const transRow = el('div', 'prop-row');
    transRow.appendChild(el('label', null, 'Transparency'));
    const transInput = document.createElement('input');
    transInput.type = 'number'; transInput.min = 0; transInput.max = 1; transInput.step = 0.05;
    transInput.value = data.transparency || 0;
    transInput.addEventListener('change', () => {
      data.transparency = parseFloat(transInput.value) || 0; this.world.updateObject(data.id, {});
      if (this.tool !== 'select') this.transformControls.attach(this.world.getMesh(data.id));
    });
    transRow.appendChild(transInput);
    body.appendChild(transRow);

    const collRow = el('div', 'prop-row');
    collRow.appendChild(el('label', null, 'Collision'));
    const collInput = document.createElement('input'); collInput.type = 'checkbox'; collInput.checked = !!data.collidable;
    collInput.addEventListener('change', () => { data.collidable = collInput.checked; });
    collRow.appendChild(collInput);
    body.appendChild(collRow);

    const anchRow = el('div', 'prop-row');
    anchRow.appendChild(el('label', null, 'Anchored'));
    const anchInput = document.createElement('input'); anchInput.type = 'checkbox'; anchInput.checked = !!data.anchored;
    anchInput.addEventListener('change', () => { data.anchored = anchInput.checked; });
    anchRow.appendChild(anchInput);
    body.appendChild(anchRow);

    // ---- script editor ----
    const hint = el('p', 'script-hint', 'JSON rules — e.g. [{"event":"onTouch","actions":[{"type":"addScore","amount":10},{"type":"showMessage","text":"+10!"}]}]. Events: onPlayerJoin, onTouch, onTimer, onButtonPress, onCheckpoint. No raw JavaScript is executed.');
    const textarea = document.createElement('textarea');
    textarea.value = JSON.stringify(data.scripts || [], null, 2);
    const saveBtn = el('button', 'btn btn-ghost btn-sm', 'Save script');
    saveBtn.addEventListener('click', () => {
      const result = validateScriptText(textarea.value);
      if (!result.ok) { toast('Script error: ' + result.error); return; }
      data.scripts = result.rules;
      toast('Script saved');
    });
    scriptBody.appendChild(textarea);
    scriptBody.appendChild(saveBtn);
    scriptBody.appendChild(hint);
  }
}

function iconFor(type) {
  return { part: '◼', spawn: '⭐', model: '🧩', light: '💡', camera: '🎥', npc: '🙂', checkpoint: '🚩', killzone: '☠', finish: '🏁' }[type] || '◼';
}
