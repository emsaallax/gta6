// ФАЙЛЫ: src/npc/kenney-ped.js
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export const TARGET_HEIGHT = 1.75;

export const KENNEY_PATHS = [
  'assets/models/kenney/mini-characters/character-male-a.glb',
  'assets/models/kenney/mini-characters/character-male-b.glb',
  'assets/models/kenney/mini-characters/character-male-c.glb',
  'assets/models/kenney/mini-characters/character-male-d.glb',
  'assets/models/kenney/mini-characters/character-male-e.glb',
  'assets/models/kenney/mini-characters/character-male-f.glb',
  'assets/models/kenney/mini-characters/character-female-a.glb',
  'assets/models/kenney/mini-characters/character-female-b.glb',
  'assets/models/kenney/mini-characters/character-female-c.glb',
  'assets/models/kenney/mini-characters/character-female-d.glb',
  'assets/models/kenney/mini-characters/character-female-e.glb',
  'assets/models/kenney/mini-characters/character-female-f.glb',
];

const COP_PATH = 'assets/models/kenney/mini-characters/character-male-c.glb';
const COP_COLOR = 0x2f4f8a;
const CIV_PALETTE = [0xffc4a3, 0x9fe3c9, 0xc9b6ff, 0xf4ecd6, 0xff8a7a, 0x3fc1c9];
const CLIP_NAMES = ['idle', 'walk', 'sprint', 'die', 'fall'];
const TINT_STRENGTH = 0.28;

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

function emptyActions() {
  return { idle: undefined, walk: undefined, sprint: undefined, die: undefined, fall: undefined };
}

function collectMeshes(root) {
  const meshes = [];
  if (!root) return meshes;
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  return meshes;
}

function fitToHeight(root) {
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  const h = _size.y || 1;
  const s = TARGET_HEIGHT / h;
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  root.position.y -= _box.min.y;
}

function boxAt(w, h, d, x, y, z) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(x, y, z);
  return geo;
}

function civTintHex(kind) {
  if (kind === 'cop') return COP_COLOR;
  return CIV_PALETTE[(Math.random() * CIV_PALETTE.length) | 0];
}

export function pickKenneyPath(ped) {
  if (ped && ped.kind === 'cop') return COP_PATH;
  return KENNEY_PATHS[(Math.random() * KENNEY_PATHS.length) | 0];
}

export function makeFallbackPedMesh(kind) {
  const group = new THREE.Group();
  group.name = 'pedFallback';

  const geo = mergeGeometries([
    boxAt(0.36, 0.56, 0.22, 0, 1.18, 0),
    boxAt(0.2, 0.22, 0.2, 0, 1.57, 0),
    boxAt(0.22, 0.08, 0.22, 0, 1.72, 0),
    boxAt(0.1, 0.58, 0.1, -0.23, 1.11, 0),
    boxAt(0.1, 0.58, 0.1, 0.23, 1.11, 0),
    boxAt(0.14, 0.9, 0.16, -0.1, 0.45, 0),
    boxAt(0.14, 0.9, 0.16, 0.1, 0.45, 0),
  ]);

  const mat = new THREE.MeshStandardMaterial({
    color: civTintHex(kind),
    roughness: 0.74,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  group.add(mesh);
  fitToHeight(group);
  return group;
}

function cloneMaterials(meshes, ped) {
  const pal = CIV_PALETTE[(Math.random() * CIV_PALETTE.length) | 0];
  const tint = new THREE.Color(pal);
  const cop = new THREE.Color(COP_COLOR);
  const isCop = ped && ped.kind === 'cop';

  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    mesh.castShadow = true;
    const src = mesh.material;
    const list = Array.isArray(src) ? src : [src];
    const cloned = list.map((m) => {
      const c = m.clone();
      if (c.color) {
        if (isCop) c.color.copy(cop);
        else c.color.lerp(tint, TINT_STRENGTH);
      }
      return c;
    });
    mesh.material = Array.isArray(src) ? cloned : cloned[0];
  }
}

function bindActions(mixer, animations) {
  const actions = emptyActions();
  if (!mixer || !animations) return actions;
  const clips = animations;
  for (let i = 0; i < CLIP_NAMES.length; i++) {
    const want = CLIP_NAMES[i];
    let clip = null;
    for (let j = 0; j < clips.length; j++) {
      const n = (clips[j].name || '').toLowerCase();
      if (n === want) {
        clip = clips[j];
        break;
      }
    }
    if (clip) actions[want] = mixer.clipAction(clip);
  }
  return actions;
}

function takeKenneyRoot(assets, gltf) {
  if (assets && typeof assets.cloneGLB === 'function') {
    return assets.cloneGLB(gltf);
  }
  const scene = gltf && gltf.scene;
  return scene ? SkeletonUtils.clone(scene) : new THREE.Group();
}

export function attachKenneyPed(ped, engine) {
  if (!ped || ped._kenney) return;

  const fallback = makeFallbackPedMesh(ped.kind);
  if (ped.object3d) ped.object3d.add(fallback);

  ped._kenney = {
    mixer: null,
    actions: emptyActions(),
    root: fallback,
    meshes: collectMeshes(fallback),
  };

  const assets = engine && engine.state && engine.state.assets;
  if (!assets || typeof assets.loadGLB !== 'function') return;

  const path = pickKenneyPath(ped);
  Promise.resolve(assets.loadGLB(path))
    .then((gltf) => {
      if (!gltf || ped._kenney.root !== fallback) return;
      const root = takeKenneyRoot(assets, gltf);
      fitToHeight(root);
      const meshes = collectMeshes(root);
      cloneMaterials(meshes, ped);
      const mixer = new THREE.AnimationMixer(root);
      const actions = bindActions(mixer, gltf.animations);
      if (ped.object3d) {
        ped.object3d.remove(fallback);
        ped.object3d.add(root);
      }
      ped._kenney = { mixer, actions, root, meshes };
    })
    .catch(() => {});
}
