// ===========================================================
// world.js — voxel/part world: materials, object lifecycle, lighting, (de)serialization
// ===========================================================
import * as THREE from 'three';
import { uid } from './utils.js';

export const MATERIALS = {
  grass:    { color: '#4caf50', roughness: 1.0 },
  dirt:     { color: '#7a5230', roughness: 1.0 },
  stone:    { color: '#8a8f98', roughness: 0.95 },
  wood:     { color: '#9a6633', roughness: 0.85 },
  concrete: { color: '#a9adb4', roughness: 0.9 },
  brick:    { color: '#a1543a', roughness: 0.95 },
  glass:    { color: '#bfe3ff', roughness: 0.1, transparent: true, opacity: 0.35 },
  metal:    { color: '#c7cdd6', roughness: 0.35, metalness: 0.7 },
  plastic:  { color: '#f2a541', roughness: 0.5 },
  neon:     { color: '#4fd1c5', roughness: 0.4, emissive: '#1c6b64', emissiveIntensity: 0.6 },
};

const materialCache = new Map();
function getMaterial(materialKey, colorHex, transparency = 0) {
  const key = `${materialKey}|${colorHex}|${transparency}`;
  if (materialCache.has(key)) return materialCache.get(key);
  const base = MATERIALS[materialKey] || MATERIALS.stone;
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex || base.color,
    roughness: base.roughness ?? 0.8,
    metalness: base.metalness ?? 0,
  });
  if (base.emissive) { mat.emissive = new THREE.Color(base.emissive); mat.emissiveIntensity = base.emissiveIntensity || 0.5; }
  const t = transparency ?? (base.transparent ? 1 - (base.opacity ?? 0.35) : 0);
  if (t > 0) { mat.transparent = true; mat.opacity = 1 - t; }
  materialCache.set(key, mat);
  return mat;
}

// ---- default data factory for each addable object type ----
export function createObjectData(type, overrides = {}) {
  const base = {
    id: uid(type),
    type,
    name: defaultName(type),
    position: { x: 0, y: 1, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    size: { x: 2, y: 2, z: 2 },
    color: '#8a8f98',
    material: 'stone',
    transparency: 0,
    collidable: true,
    anchored: true,
    parentId: null,
    scripts: [],
  };
  switch (type) {
    case 'part': base.material = 'stone'; base.color = '#8a8f98'; break;
    case 'spawn': base.material = 'plastic'; base.color = '#4fd1c5'; base.size = { x: 3, y: 0.3, z: 3 }; base.collidable = false; break;
    case 'model': base.material = 'wood'; base.color = '#9a6633'; base.size = { x: 2, y: 2, z: 2 }; break;
    case 'light': base.color = '#ffd28a'; base.size = { x: 0.4, y: 0.4, z: 0.4 }; base.collidable = false; base.intensity = 1.2; base.range = 12; break;
    case 'camera': base.color = '#4fd1c5'; base.size = { x: 0.5, y: 0.5, z: 0.5 }; base.collidable = false; base.fov = 60; break;
    case 'npc': base.color = '#e5484d'; base.size = { x: 1, y: 2, z: 1 }; base.collidable = true; base.dialogue = 'Hello there!'; break;
    case 'checkpoint': base.color = '#f2a541'; base.material = 'neon'; base.size = { x: 2, y: 0.2, z: 2 }; base.collidable = false; break;
    case 'killzone': base.color = '#e5484d'; base.material = 'neon'; base.size = { x: 3, y: 0.2, z: 3 }; base.collidable = false; break;
    case 'finish': base.color = '#4fd1c5'; base.material = 'neon'; base.size = { x: 3, y: 0.3, z: 3 }; base.collidable = false; break;
  }
  return { ...base, ...overrides };
}

function defaultName(type) {
  const n = { part: 'Part', spawn: 'SpawnLocation', model: 'Model', light: 'PointLight', camera: 'Camera', npc: 'NPC', checkpoint: 'Checkpoint', killzone: 'KillZone', finish: 'Finish' };
  return n[type] || 'Object';
}

/**
 * World manages the live THREE representation of a project's object list,
 * keeping THREE.Mesh instances in sync with plain-JSON object data so the
 * whole world can be saved/loaded/exported as JSON.
 */
export class World {
  constructor(scene) {
    this.scene = scene;
    this.objects = new Map(); // id -> { data, mesh }
    this.group = new THREE.Group();
    this.group.name = 'World';
    this.scene.add(this.group);
  }

  clear() {
    for (const { mesh } of this.objects.values()) {
      this.group.remove(mesh);
      disposeMesh(mesh);
    }
    this.objects.clear();
  }

  addObject(data) {
    const mesh = this._buildMesh(data);
    this.objects.set(data.id, { data, mesh });
    this.group.add(mesh);
    return mesh;
  }

  removeObject(id) {
    const entry = this.objects.get(id);
    if (!entry) return;
    this.group.remove(entry.mesh);
    disposeMesh(entry.mesh);
    this.objects.delete(id);
  }

  getData(id) { return this.objects.get(id)?.data; }
  getMesh(id) { return this.objects.get(id)?.mesh; }

  updateObject(id, patch) {
    const entry = this.objects.get(id);
    if (!entry) return;
    Object.assign(entry.data, patch);
    this._applyTransform(entry);
  }

  syncFromMesh(id) {
    // pull transform back from a mesh (e.g. after gizmo drag) into data
    const entry = this.objects.get(id);
    if (!entry) return;
    const { mesh, data } = entry;
    data.position = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
    data.rotation = { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z };
    data.scale = { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z };
  }

  allData() {
    return [...this.objects.values()].map(e => e.data);
  }

  getCollidableMeshes() {
    const arr = [];
    for (const { data, mesh } of this.objects.values()) {
      if (data.collidable) arr.push(mesh);
    }
    return arr;
  }

  loadFromData(dataArray) {
    this.clear();
    for (const d of dataArray) this.addObject(d);
  }

  _buildMesh(data) {
    let mesh;
    const size = data.size || { x: 1, y: 1, z: 1 };
    switch (data.type) {
      case 'light': {
        const light = new THREE.PointLight(data.color || '#ffd28a', data.intensity ?? 1.2, data.range ?? 12, 2);
        const holder = new THREE.Group();
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), new THREE.MeshBasicMaterial({ color: data.color || '#ffd28a' }));
        holder.add(light, bulb);
        mesh = holder;
        break;
      }
      case 'camera': {
        const helper = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 4), new THREE.MeshStandardMaterial({ color: data.color || '#4fd1c5' }));
        helper.rotation.x = Math.PI / 2;
        mesh = helper;
        break;
      }
      case 'npc': {
        mesh = new THREE.Group();
        const npcMat = getMaterial('plastic', data.color).clone();
        const body = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.7, size.y, size.x * 0.7), npcMat);
        body.position.y = size.y / 2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.5, size.x * 0.5, size.x * 0.5), npcMat);
        head.position.y = size.y + size.x * 0.25;
        mesh.add(body, head);
        mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        break;
      }
      default: {
        const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
        const mat = getMaterial(data.material, data.color, data.transparency);
        mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = data.type === 'part' || data.type === 'model';
        mesh.receiveShadow = true;
      }
    }
    mesh.name = data.name;
    mesh.userData.id = data.id;
    mesh.userData.type = data.type;
    this._positionMesh(mesh, data);
    return mesh;
  }

  _positionMesh(mesh, data) {
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
  }

  _applyTransform(entry) {
    // rebuild mesh only if shape-affecting fields changed color/material/size are cheap via full rebuild
    const { data, mesh } = entry;
    this.group.remove(mesh);
    disposeMesh(mesh);
    const newMesh = this._buildMesh(data);
    entry.mesh = newMesh;
    this.group.add(newMesh);
  }
}

function disposeMesh(mesh) {
  mesh.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.dispose) o.material.dispose();
  });
}

// ===========================================================
// Scene environment: sky, fog, ambient + sun lighting
// ===========================================================
export function setupEnvironment(scene, renderer) {
  scene.background = new THREE.Color('#7fb8e0');
  scene.fog = new THREE.Fog('#9fd0ea', 40, 160);

  const hemi = new THREE.HemisphereLight('#bfe3ff', '#5b7a4f', 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3d6', 1.15);
  sun.position.set(30, 45, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  return { hemi, sun };
}

// ===========================================================
// Procedural starter world data — a small, visually interesting map
// ===========================================================
export function buildStarterWorldData() {
  const objs = [];
  const push = (type, overrides) => objs.push(createObjectData(type, overrides));

  // baseplate (large ground of grass parts, tiled for visual break-up)
  const tile = 8;
  for (let x = -3; x <= 3; x++) {
    for (let z = -3; z <= 3; z++) {
      push('part', {
        name: 'Baseplate',
        material: 'grass', color: MATERIALS.grass.color,
        size: { x: tile, y: 1, z: tile },
        position: { x: x * tile, y: -0.5, z: z * tile },
        collidable: true,
      });
    }
  }

  // spawn pad
  push('spawn', { name: 'SpawnLocation', position: { x: 0, y: 0.15, z: 0 } });

  // stone path
  for (let i = 0; i < 10; i++) {
    push('part', { name: 'Path', material: 'concrete', color: MATERIALS.concrete.color, size: { x: 2, y: 0.2, z: 2 }, position: { x: 0, y: 0.1, z: 3 + i * 2.2 } });
  }

  // a simple house
  const houseX = -8, houseZ = 6;
  push('part', { name: 'House Floor', material: 'wood', color: MATERIALS.wood.color, size: { x: 6, y: 0.3, z: 6 }, position: { x: houseX, y: 0.15, z: houseZ } });
  push('part', { name: 'House Wall N', material: 'brick', color: MATERIALS.brick.color, size: { x: 6, y: 3, z: 0.3 }, position: { x: houseX, y: 1.65, z: houseZ - 3 } });
  push('part', { name: 'House Wall S', material: 'brick', color: MATERIALS.brick.color, size: { x: 6, y: 3, z: 0.3 }, position: { x: houseX, y: 1.65, z: houseZ + 3 } });
  push('part', { name: 'House Wall W', material: 'brick', color: MATERIALS.brick.color, size: { x: 0.3, y: 3, z: 6 }, position: { x: houseX - 3, y: 1.65, z: houseZ } });
  push('part', { name: 'House Wall E (window)', material: 'glass', color: MATERIALS.glass.color, transparency: 0.6, size: { x: 0.3, y: 3, z: 6 }, position: { x: houseX + 3, y: 1.65, z: houseZ } });
  push('part', { name: 'House Roof', material: 'wood', color: '#7a4a24', size: { x: 6.6, y: 0.4, z: 6.6 }, position: { x: houseX, y: 3.4, z: houseZ }, rotation: { x: 0, y: Math.PI / 4, z: 0 } });

  // trees (trunk + canopy)
  const treeSpots = [[6, 4], [9, 8], [-4, 10], [12, -2], [-10, -4], [4, -8]];
  for (const [tx, tz] of treeSpots) {
    push('part', { name: 'Tree Trunk', material: 'wood', color: '#6b4226', size: { x: 0.6, y: 2.4, z: 0.6 }, position: { x: tx, y: 1.2, z: tz } });
    push('part', { name: 'Tree Canopy', material: 'grass', color: '#2e8b57', size: { x: 2.2, y: 2.2, z: 2.2 }, position: { x: tx, y: 3.4, z: tz } });
  }

  // low wall / plaza decoration
  for (let i = -4; i <= 4; i++) {
    push('part', { name: 'Plaza Light Post', material: 'metal', color: '#8a8f98', size: { x: 0.25, y: 2, z: 0.25 }, position: { x: i * 3, y: 1, z: -6 } });
  }
  push('light', { name: 'Sun Fill', position: { x: 0, y: 8, z: 0 }, intensity: 0.6, range: 30 });

  // road block
  push('part', { name: 'Road', material: 'concrete', color: '#3a3d44', size: { x: 4, y: 0.15, z: 30 }, position: { x: 8, y: 0.08, z: 6 } });

  return objs;
}
