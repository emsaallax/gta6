// ФАЙЛЫ: src/vehicles/kenneyLights.js, src/vehicles/kenneyPaint.js
// Окраска кузова Kenney: клон материала только у узла body.

export const BODY_COLORS = {
  sedan: [0x2a6bd6, 0x3fc1c9, 0x9fe3c9, 0xffc4a3, 0xc9b6ff, 0xf4ecd6],
  suv: [0x3d5c3a, 0x6b4e3d, 0x2a6bd6, 0xff8a7a, 0xc9b6ff, 0xffc4a3],
  taxi: 0xf5c400,
  sport: 0xc41e3a,
  van: 0x5a6a4a,
  police: 0xececec,
  coupe: 0xd4783a,
  pickup: 0x6b4e3d,
};

function colorFor(type, seed) {
  const kind = type || 'sedan';
  if (kind === 'taxi') return BODY_COLORS.taxi;
  const pal = BODY_COLORS[kind];
  if (Array.isArray(pal) && pal.length) {
    const s = Math.abs(Number(seed) || 0) | 0;
    return pal[s % pal.length];
  }
  if (typeof pal === 'number') return pal;
  const sedan = BODY_COLORS.sedan;
  const s = Math.abs(Number(seed) || 0) | 0;
  return sedan[s % sedan.length];
}

function applyHex(mat, hex) {
  if (!mat) return;
  if (mat.color && typeof mat.color.setHex === 'function') mat.color.setHex(hex);
}

function cloneAndPaintMesh(mesh, hex) {
  if (!mesh || !mesh.material) return;
  if (!mesh.userData.kenneyPainted) {
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => (m && m.clone ? m.clone() : m));
    } else if (mesh.material.clone) {
      mesh.material = mesh.material.clone();
    }
    mesh.userData.kenneyPainted = true;
  }
  if (Array.isArray(mesh.material)) {
    for (let i = 0; i < mesh.material.length; i++) applyHex(mesh.material[i], hex);
  } else {
    applyHex(mesh.material, hex);
  }
}

export function paintKenneyCar(object3d, type, seed) {
  if (!object3d || typeof object3d.getObjectByName !== 'function') return;
  const body = object3d.getObjectByName('body');
  if (!body) return;
  const hex = colorFor(type, seed);
  if (body.isMesh) {
    cloneAndPaintMesh(body, hex);
    return;
  }
  const kids = body.children || [];
  for (let i = 0; i < kids.length; i++) {
    if (kids[i] && kids[i].isMesh) cloneAndPaintMesh(kids[i], hex);
  }
  if (body.material) cloneAndPaintMesh(body, hex);
}
