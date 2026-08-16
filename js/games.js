// ===========================================================
// games.js — built-in demo games (Obby, Sword Arena, Sandbox)
// Each is a self-contained project-shaped object so it can be loaded
// through the same World/save pipeline as user-made games.
// ===========================================================
import { createObjectData } from './world.js';

function obbyWorld() {
  const objs = [];
  const push = (type, o) => objs.push(createObjectData(type, o));

  push('part', { name: 'Start Platform', material: 'concrete', color: '#a9adb4', size: { x: 6, y: 1, z: 6 }, position: { x: 0, y: -0.5, z: 0 } });
  push('spawn', { name: 'SpawnLocation', position: { x: 0, y: 0.2, z: 0 } });
  push('checkpoint', { name: 'Checkpoint 0', position: { x: 0, y: 0.15, z: 2 } });

  // a winding platform course with gaps (kill zones between)
  let x = 0, z = 4, step = 0;
  const positions = [];
  for (let i = 0; i < 16; i++) {
    z += 3.2;
    x += (i % 3 === 0) ? 2.4 : (i % 3 === 1 ? -2.4 : 0);
    positions.push({ x, z, y: Math.sin(i * 0.6) * 0.6 });
  }
  positions.forEach((p, i) => {
    push('part', { name: `Platform ${i + 1}`, material: i % 4 === 0 ? 'wood' : 'stone', color: i % 4 === 0 ? '#9a6633' : '#8a8f98', size: { x: 2.2, y: 0.6, z: 2.2 }, position: { x: p.x, y: p.y, z: p.z } });
    if (i > 0 && i % 4 === 0) {
      push('checkpoint', { name: `Checkpoint ${i}`, position: { x: p.x, y: p.y + 0.5, z: p.z } });
    }
  });
  // a wide kill-lava strip under the whole course
  push('killzone', { name: 'Void', material: 'neon', color: '#e5484d', size: { x: 60, y: 0.2, z: 60 }, position: { x: 6, y: -6, z: 30 } });

  const last = positions[positions.length - 1];
  push('finish', { name: 'Finish', position: { x: last.x, y: last.y + 0.5, z: last.z + 2 } });
  push('part', { name: 'Finish Pad', material: 'neon', color: '#4fd1c5', size: { x: 3, y: 0.4, z: 3 }, position: { x: last.x, y: last.y, z: last.z + 2 } });

  return objs;
}

function swordArenaWorld() {
  const objs = [];
  const push = (type, o) => objs.push(createObjectData(type, o));

  push('part', { name: 'Arena Floor', material: 'concrete', color: '#787d86', size: { x: 26, y: 1, z: 26 }, position: { x: 0, y: -0.5, z: 0 } });
  push('spawn', { name: 'SpawnLocation', position: { x: 0, y: 0.2, z: -9 } });

  // ring wall
  const wallH = 3, ringR = 13;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    push('part', {
      name: 'Arena Wall', material: 'brick', color: '#a1543a',
      size: { x: 2.4, y: wallH, z: 0.6 },
      position: { x: Math.cos(a) * ringR, y: wallH / 2, z: Math.sin(a) * ringR },
      rotation: { x: 0, y: -a, z: 0 },
    });
  }
  // pillars for cover
  [[5, 5], [-5, 5], [5, -3], [-5, -3]].forEach(([x, z], i) => {
    push('part', { name: `Pillar ${i + 1}`, material: 'stone', color: '#8a8f98', size: { x: 1.4, y: 3.4, z: 1.4 }, position: { x, y: 1.7, z } });
  });
  // training dummies (NPCs act as attackable targets)
  [[0, 4], [4, -2], [-4, -2]].forEach(([x, z], i) => {
    push('npc', { name: `Training Dummy ${i + 1}`, color: '#e5484d', position: { x, y: 0, z }, dialogue: 'Hit me!', scripts: [] });
  });

  return objs;
}

function sandboxWorld() {
  const objs = [];
  const push = (type, o) => objs.push(createObjectData(type, o));
  const tile = 8;
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      push('part', { name: 'Baseplate', material: 'grass', color: '#4caf50', size: { x: tile, y: 1, z: tile }, position: { x: x * tile, y: -0.5, z: z * tile } });
    }
  }
  push('spawn', { name: 'SpawnLocation', position: { x: 0, y: 0.2, z: 0 } });
  // a handful of starter parts to play with
  const mats = ['stone', 'wood', 'brick', 'glass', 'concrete', 'metal'];
  mats.forEach((m, i) => {
    push('part', { name: `Sample ${m}`, material: m, size: { x: 2, y: 2, z: 2 }, position: { x: -10 + i * 4, y: 1, z: -10 } });
  });
  return objs;
}

export function getBuiltinGames() {
  return [
    {
      project_id: 'builtin_obby',
      builtin: true,
      mode: 'obby',
      name: 'Sky Climb Obby',
      description: 'Jump across floating platforms, hit every checkpoint, and dodge the void below.',
      creator: 'Blockverse',
      icon: '🧗',
      world: obbyWorld(),
      scripts: [],
      settings: { timer: true },
    },
    {
      project_id: 'builtin_sword',
      builtin: true,
      mode: 'sword',
      name: 'Arena Duel',
      description: 'A simple sword arena — swing at training dummies, manage your health, respawn and go again.',
      creator: 'Blockverse',
      icon: '⚔️',
      world: swordArenaWorld(),
      scripts: [],
      settings: { timer: false },
    },
    {
      project_id: 'builtin_sandbox',
      builtin: true,
      mode: 'sandbox',
      name: 'Open Sandbox',
      description: 'A big open plot with sample materials — opens straight into the editor so you can build freely.',
      creator: 'Blockverse',
      icon: '🏗️',
      world: sandboxWorld(),
      scripts: [],
      settings: { timer: false, openInEditor: true },
    },
  ];
}

export function getBuiltinGame(id) {
  return getBuiltinGames().find(g => g.project_id === id) || null;
}
