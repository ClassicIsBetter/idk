// ===========================================================
// avatar.js — original blocky character: hierarchy, cosmetics, animation
// ===========================================================
import * as THREE from 'three';

// ---- proportions (world units; 1 unit ~ 1 "stud") ----
export const PROPORTIONS = {
  headSize: 0.9,
  torsoW: 1.0, torsoH: 1.2, torsoD: 0.55,
  armW: 0.35, armH: 1.1, armD: 0.35,
  legW: 0.4, legH: 1.25, legD: 0.4,
};

export const TOTAL_HEIGHT =
  PROPORTIONS.legH + PROPORTIONS.torsoH + PROPORTIONS.headSize + 0.1;

// ---- cosmetics catalog (all procedural / original, no external assets) ----
export const CATALOG = {
  skin: [
    { id: 'skin-a', label: 'Sand', color: '#f0c39a' },
    { id: 'skin-b', label: 'Almond', color: '#d9a06b' },
    { id: 'skin-c', label: 'Umber', color: '#9c6b45' },
    { id: 'skin-d', label: 'Cocoa', color: '#5b3a29' },
    { id: 'skin-e', label: 'Porcelain', color: '#f4e0d0' },
    { id: 'skin-f', label: 'Slate', color: '#7d8494' },
    { id: 'skin-g', label: 'Amber Bot', color: '#f2a541' },
    { id: 'skin-h', label: 'Mint Bot', color: '#5fd0b0' },
  ],
  shirt: [
    { id: 'shirt-none', label: 'None', color: null },
    { id: 'shirt-a', label: 'Crimson', color: '#c0392b' },
    { id: 'shirt-b', label: 'Cobalt', color: '#2e6fd9' },
    { id: 'shirt-c', label: 'Forest', color: '#2e8b57' },
    { id: 'shirt-d', label: 'Charcoal', color: '#2b2f38' },
    { id: 'shirt-e', label: 'Amber', color: '#f2a541' },
    { id: 'shirt-f', label: 'Violet', color: '#8e5bd9' },
  ],
  pants: [
    { id: 'pants-a', label: 'Denim', color: '#33475b' },
    { id: 'pants-b', label: 'Charcoal', color: '#2a2e36' },
    { id: 'pants-c', label: 'Khaki', color: '#a68a5b' },
    { id: 'pants-d', label: 'Crimson', color: '#7a2e2e' },
    { id: 'pants-e', label: 'Teal', color: '#2f7d75' },
  ],
  hair: [
    { id: 'hair-none', label: 'None', color: null, shape: 'none' },
    { id: 'hair-a', label: 'Buzz', color: '#3b2a20', shape: 'buzz' },
    { id: 'hair-b', label: 'Swoop', color: '#1c1c1c', shape: 'swoop' },
    { id: 'hair-c', label: 'Curly', color: '#6b3f22', shape: 'curly' },
    { id: 'hair-d', label: 'Spike', color: '#d9d2c4', shape: 'spike' },
    { id: 'hair-e', label: 'Fire', color: '#e5484d', shape: 'spike' },
  ],
  hat: [
    { id: 'hat-none', label: 'None', shape: 'none' },
    { id: 'hat-cap', label: 'Cap', color: '#2e6fd9', shape: 'cap' },
    { id: 'hat-top', label: 'Top Hat', color: '#1b1b1b', shape: 'top' },
    { id: 'hat-cone', label: 'Cone', color: '#f2a541', shape: 'cone' },
    { id: 'hat-band', label: 'Headband', color: '#e5484d', shape: 'band' },
  ],
  face: [
    { id: 'face-a', label: 'Classic' },
    { id: 'face-b', label: 'Happy' },
    { id: 'face-c', label: 'Cool' },
    { id: 'face-d', label: 'Surprised' },
    { id: 'face-e', label: 'Determined' },
  ],
  accessory: [
    { id: 'acc-none', label: 'None', shape: 'none' },
    { id: 'acc-backpack', label: 'Backpack', color: '#2e8b57', shape: 'backpack' },
    { id: 'acc-cape', label: 'Cape', color: '#7a2e2e', shape: 'cape' },
    { id: 'acc-shades', label: 'Shades', color: '#111318', shape: 'shades' },
  ],
  body: [
    { id: 'body-classic', label: 'Classic', scale: 1.0 },
    { id: 'body-slim', label: 'Slim', scale: 0.88 },
    { id: 'body-bulky', label: 'Bulky', scale: 1.14 },
  ],
};

export function defaultAvatarConfig() {
  return {
    skin: 'skin-a',
    shirt: 'shirt-b',
    pants: 'pants-a',
    hair: 'hair-a',
    hat: 'hat-none',
    face: 'face-a',
    accessory: 'acc-none',
    body: 'body-classic',
  };
}

function findItem(cat, id) {
  return CATALOG[cat].find(i => i.id === id) || CATALOG[cat][0];
}

// draws a simple flat face texture onto a canvas, returned as CanvasTexture
function makeFaceTexture(faceId) {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#1c1c22';
  const eyeY = 52, eyeR = 8, eyeDX = 26;
  switch (faceId) {
    case 'face-b': // happy
      ctx.beginPath(); ctx.arc(64 - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(64 + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(64, 82, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.lineWidth = 6; ctx.strokeStyle = '#1c1c22'; ctx.stroke();
      break;
    case 'face-c': // cool (flat shades line + smirk)
      ctx.fillRect(64 - eyeDX - 12, eyeY - 6, 24, 10);
      ctx.fillRect(64 + eyeDX - 12, eyeY - 6, 24, 10);
      ctx.fillRect(64 - eyeDX + 10, eyeY - 2, 2 * (eyeDX - 10), 4);
      ctx.beginPath(); ctx.moveTo(50, 88); ctx.lineTo(78, 84); ctx.lineWidth = 5; ctx.strokeStyle = '#1c1c22'; ctx.stroke();
      break;
    case 'face-d': // surprised
      ctx.beginPath(); ctx.arc(64 - eyeDX, eyeY, eyeR + 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(64 + eyeDX, eyeY, eyeR + 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(64, 86, 10, 0, Math.PI * 2); ctx.fill();
      break;
    case 'face-e': // determined
      ctx.fillRect(64 - eyeDX - 10, eyeY - 4, 20, 8);
      ctx.fillRect(64 + eyeDX - 10, eyeY - 4, 20, 8);
      ctx.beginPath(); ctx.moveTo(48, 90); ctx.lineTo(80, 90); ctx.lineWidth = 6; ctx.strokeStyle = '#1c1c22'; ctx.stroke();
      break;
    default: // classic
      ctx.beginPath(); ctx.arc(64 - eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(64 + eyeDX, eyeY, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(48, 86); ctx.lineTo(80, 86); ctx.lineWidth = 5; ctx.strokeStyle = '#1c1c22'; ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a full blocky avatar as a THREE.Group with a real hierarchy:
 * root
 *  └ hips (moves with locomotion)
 *     ├ torso
 *     │   ├ head-pivot -> head (+ face, hair, hat)
 *     │   ├ leftArm-pivot -> leftArm
 *     │   ├ rightArm-pivot -> rightArm
 *     │   └ accessory meshes
 *     ├ leftLeg-pivot -> leftLeg
 *     └ rightLeg-pivot -> rightLeg
 */
export function buildAvatar(config = defaultAvatarConfig()) {
  const P = PROPORTIONS;
  const bodyScale = findItem('body', config.body).scale ?? 1;

  const root = new THREE.Group();
  root.name = 'AvatarRoot';
  root.userData.config = config;

  const skinColor = findItem('skin', config.skin).color;
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.7 });
  const shirtItem = findItem('shirt', config.shirt);
  const torsoMat = new THREE.MeshStandardMaterial({ color: shirtItem.color || skinColor, roughness: 0.75 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: findItem('pants', config.pants).color, roughness: 0.8 });

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'Body';
  bodyGroup.scale.setScalar(bodyScale);
  root.add(bodyGroup);

  // ---- legs ----
  function makeLeg(side) {
    const pivot = new THREE.Group();
    pivot.name = `${side}LegPivot`;
    pivot.position.set(side === 'left' ? -P.legW / 2 - 0.02 : P.legW / 2 + 0.02, P.legH, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(P.legW, P.legH, P.legD), pantsMat);
    mesh.position.set(0, -P.legH / 2, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    pivot.add(mesh);
    return pivot;
  }
  const leftLeg = makeLeg('left');
  const rightLeg = makeLeg('right');
  bodyGroup.add(leftLeg, rightLeg);

  // ---- torso (sits on top of legs) ----
  const torso = new THREE.Mesh(new THREE.BoxGeometry(P.torsoW, P.torsoH, P.torsoD), torsoMat);
  torso.position.set(0, P.legH + P.torsoH / 2, 0);
  torso.castShadow = true; torso.receiveShadow = true;
  torso.name = 'Torso';
  bodyGroup.add(torso);

  // ---- arms ----
  function makeArm(side) {
    const pivot = new THREE.Group();
    pivot.name = `${side}ArmPivot`;
    const x = side === 'left' ? -(P.torsoW / 2 + P.armW / 2 + 0.02) : (P.torsoW / 2 + P.armW / 2 + 0.02);
    pivot.position.set(x, P.legH + P.torsoH - P.armW / 2, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(P.armW, P.armH, P.armD), skinMat.clone());
    mesh.position.set(0, -P.armH / 2, 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    pivot.add(mesh);
    return pivot;
  }
  const leftArm = makeArm('left');
  const rightArm = makeArm('right');
  bodyGroup.add(leftArm, rightArm);

  // ---- head ----
  const headPivot = new THREE.Group();
  headPivot.name = 'HeadPivot';
  headPivot.position.set(0, P.legH + P.torsoH, 0);
  bodyGroup.add(headPivot);

  const faceTex = makeFaceTexture(config.face);
  const headMats = [
    skinMat, skinMat, skinMat, skinMat,
    new THREE.MeshStandardMaterial({ color: skinColor, map: faceTex, roughness: 0.6 }), // +Z = face
    skinMat,
  ];
  const head = new THREE.Mesh(new THREE.BoxGeometry(P.headSize, P.headSize, P.headSize), headMats);
  head.position.set(0, P.headSize / 2, 0);
  head.castShadow = true; head.receiveShadow = true;
  head.name = 'Head';
  headPivot.add(head);

  // ---- hair ----
  const hairItem = findItem('hair', config.hair);
  if (hairItem.shape && hairItem.shape !== 'none') {
    const hairMat = new THREE.MeshStandardMaterial({ color: hairItem.color, roughness: 0.9 });
    let hairMesh;
    const hs = P.headSize;
    if (hairItem.shape === 'buzz') {
      hairMesh = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.02, hs * 0.22, hs * 1.02), hairMat);
      hairMesh.position.set(0, hs * 0.92, 0);
    } else if (hairItem.shape === 'swoop') {
      hairMesh = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.05, hs * 0.3, hs * 1.05), hairMat);
      hairMesh.position.set(hs * 0.08, hs * 0.95, -hs * 0.05);
      hairMesh.rotation.z = 0.12;
    } else if (hairItem.shape === 'curly') {
      hairMesh = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.32, hs * 0.32, hs * 0.32), hairMat);
        s.position.set((Math.random() - 0.5) * hs * 0.7, hs * 0.95 + Math.random() * 0.1, (Math.random() - 0.5) * hs * 0.7);
        hairMesh.add(s);
      }
    } else if (hairItem.shape === 'spike') {
      hairMesh = new THREE.Group();
      for (let i = -1; i <= 1; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(hs * 0.16, hs * 0.5, 4), hairMat);
        s.position.set(i * hs * 0.28, hs * 1.1, 0);
        s.rotation.y = Math.PI / 4;
        hairMesh.add(s);
      }
    }
    if (hairMesh) { hairMesh.name = 'Hair'; headPivot.add(hairMesh); }
  }

  // ---- hat ----
  const hatItem = findItem('hat', config.hat);
  if (hatItem.shape && hatItem.shape !== 'none') {
    const hatMat = new THREE.MeshStandardMaterial({ color: hatItem.color, roughness: 0.6 });
    let hatMesh;
    const hs = P.headSize;
    if (hatItem.shape === 'cap') {
      hatMesh = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.05, hs * 0.35, hs * 1.05), hatMat);
      top.position.set(0, hs * 0.95, 0);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.5, hs * 0.08, hs * 0.4), hatMat);
      brim.position.set(0, hs * 0.8, hs * 0.65);
      hatMesh.add(top, brim);
    } else if (hatItem.shape === 'top') {
      hatMesh = new THREE.Group();
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.7, hs * 0.7, hs * 0.1, 12), hatMat);
      brim.position.set(0, hs * 0.85, 0);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(hs * 0.4, hs * 0.4, hs * 0.7, 12), hatMat);
      cyl.position.set(0, hs * 1.25, 0);
      hatMesh.add(brim, cyl);
    } else if (hatItem.shape === 'cone') {
      hatMesh = new THREE.Mesh(new THREE.ConeGeometry(hs * 0.55, hs * 0.9, 10), hatMat);
      hatMesh.position.set(0, hs * 1.25, 0);
    } else if (hatItem.shape === 'band') {
      hatMesh = new THREE.Mesh(new THREE.BoxGeometry(hs * 1.04, hs * 0.18, hs * 1.04), hatMat);
      hatMesh.position.set(0, hs * 0.72, 0);
    }
    if (hatMesh) { hatMesh.name = 'Hat'; headPivot.add(hatMesh); }
  }

  // ---- accessory ----
  const accItem = findItem('accessory', config.accessory);
  if (accItem.shape && accItem.shape !== 'none') {
    const accMat = new THREE.MeshStandardMaterial({ color: accItem.color, roughness: 0.6 });
    if (accItem.shape === 'backpack') {
      const bp = new THREE.Mesh(new THREE.BoxGeometry(P.torsoW * 0.7, P.torsoH * 0.6, 0.25), accMat);
      bp.position.set(0, P.legH + P.torsoH / 2, -(P.torsoD / 2 + 0.15));
      bp.name = 'Backpack';
      bodyGroup.add(bp);
    } else if (accItem.shape === 'cape') {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(P.torsoW * 0.9, P.torsoH * 1.1, 0.08), accMat);
      cape.position.set(0, P.legH + P.torsoH * 0.55, -(P.torsoD / 2 + 0.06));
      cape.rotation.x = 0.15;
      cape.name = 'Cape';
      bodyGroup.add(cape);
    } else if (accItem.shape === 'shades') {
      const shades = new THREE.Mesh(new THREE.BoxGeometry(P.headSize * 0.8, P.headSize * 0.22, 0.06), new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.2, metalness: 0.4 }));
      shades.position.set(0, P.headSize * 0.55, P.headSize / 2 + 0.02);
      shades.name = 'Shades';
      headPivot.add(shades);
    }
  }

  root.userData.parts = { bodyGroup, torso, headPivot, head, leftArm, rightArm, leftLeg, rightLeg };
  root.userData.height = TOTAL_HEIGHT * bodyScale;
  root.userData.legH = P.legH * bodyScale;
  return root;
}

export function disposeAvatar(root) {
  root.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
}

// ===========================================================
// Procedural animation — drives the limb pivots each frame.
// state: 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'attack'
// ===========================================================
export class AvatarAnimator {
  constructor(avatarRoot) {
    this.root = avatarRoot;
    this.parts = avatarRoot.userData.parts;
    this.t = 0;
    this.landTimer = 0;
    this.attackTimer = 0;
    this.prevState = 'idle';
  }

  triggerAttack() { this.attackTimer = 0.001; }
  triggerLand() { this.landTimer = 0.001; this.justLanded = true; }

  update(dt, state, speed01) {
    this.t += dt;
    const { leftArm, rightArm, leftLeg, rightLeg, bodyGroup, headPivot } = this.parts;
    const walkFreq = 6 + speed01 * 4;
    const swing = (state === 'run' ? 0.9 : 0.55) * (state === 'walk' || state === 'run' ? Math.min(1, speed01 + 0.35) : 0);

    // reset targets
    let lArmX = 0, rArmX = 0, lLegX = 0, rLegX = 0, bob = 0, tilt = 0;

    if (state === 'idle') {
      bob = Math.sin(this.t * 1.6) * 0.03;
      lArmX = Math.sin(this.t * 1.2) * 0.04;
      rArmX = -Math.sin(this.t * 1.2) * 0.04;
    } else if (state === 'walk' || state === 'run') {
      const s = Math.sin(this.t * walkFreq);
      lArmX = -s * swing;
      rArmX = s * swing;
      lLegX = s * swing * 0.9;
      rLegX = -s * swing * 0.9;
      bob = Math.abs(Math.cos(this.t * walkFreq)) * 0.06 * (state === 'run' ? 1.6 : 1);
    } else if (state === 'jump') {
      lArmX = -0.9; rArmX = -0.9; lLegX = 0.35; rLegX = -0.2;
    } else if (state === 'fall') {
      lArmX = -0.4; rArmX = -0.4; lLegX = -0.15; rLegX = 0.15;
    }

    // landing squash
    let squash = 0;
    if (this.landTimer > 0) {
      this.landTimer += dt;
      const d = this.landTimer;
      squash = Math.max(0, 0.22 - d * 1.4);
      if (d > 0.16) this.landTimer = 0;
    }

    // attack swing overrides right arm briefly
    let attackActive = false;
    if (this.attackTimer > 0) {
      attackActive = true;
      this.attackTimer += dt;
      const d = this.attackTimer;
      const dur = 0.28;
      if (d > dur) { this.attackTimer = 0; }
      else {
        const p = d / dur;
        rArmX = -2.2 + Math.sin(p * Math.PI) * 2.6;
        tilt = Math.sin(p * Math.PI) * 0.15;
      }
    }

    leftArm.rotation.x = damp(leftArm.rotation.x, lArmX, 14, dt);
    rightArm.rotation.x = damp(rightArm.rotation.x, rArmX, 14, dt);
    leftLeg.rotation.x = damp(leftLeg.rotation.x, lLegX, 14, dt);
    rightLeg.rotation.x = damp(rightLeg.rotation.x, rLegX, 14, dt);
    bodyGroup.position.y = damp(bodyGroup.position.y, bob - squash, 10, dt);
    bodyGroup.rotation.z = damp(bodyGroup.rotation.z, tilt, 10, dt);

    this.prevState = state;
    return attackActive;
  }
}

function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
