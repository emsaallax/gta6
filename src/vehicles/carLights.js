// Фары, стопы, мигалки. Геометрию не строит — ищет меши по имени.

const cache = new WeakMap();

export function isNight(time) {
  const t = Number(time);
  if (!Number.isFinite(t)) return false;
  return t < 6 || t >= 19;
}

function grab(object3d, name) {
  if (!object3d || typeof object3d.getObjectByName !== 'function') return null;
  return object3d.getObjectByName(name) || null;
}

function matsOf(mesh) {
  if (!mesh || !mesh.material) return [];
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function setEmissive(mesh, intensity, colorHex) {
  for (const mat of matsOf(mesh)) {
    if (!mat) continue;
    if (colorHex != null && mat.emissive && typeof mat.emissive.setHex === 'function') {
      mat.emissive.setHex(colorHex);
    }
    if ('emissiveIntensity' in mat) mat.emissiveIntensity = intensity;
  }
}

export function setupCarLights(object3d, type) {
  if (!object3d) return;
  cache.set(object3d, {
    type,
    t: 0,
    heads: [grab(object3d, 'light_head_l'), grab(object3d, 'light_head_r')].filter(Boolean),
    brakes: [grab(object3d, 'light_brake_l'), grab(object3d, 'light_brake_r')].filter(Boolean),
    sirenL: grab(object3d, 'light_siren_l'),
    sirenR: grab(object3d, 'light_siren_r'),
  });
}

export function updateCarLights(vehicle, time, dt) {
  if (!vehicle || !vehicle.object3d) return;
  let rec = cache.get(vehicle.object3d);
  if (!rec) {
    setupCarLights(vehicle.object3d, vehicle.type);
    rec = cache.get(vehicle.object3d);
    if (!rec) return;
  }
  rec.t += dt > 0 ? dt : 0;

  const night = isNight(time);
  const driven = !!vehicle.driver;
  const headI = night ? (driven ? 2.2 : 1.2) : 0.15;
  for (const m of rec.heads) setEmissive(m, headI);

  const stopOn = !!vehicle.braking || (Number(vehicle.speed) || 0) < -0.3;
  const brakeI = stopOn ? 3.0 : 0.25;
  for (const m of rec.brakes) setEmissive(m, brakeI);

  const police = (rec.type || vehicle.type) === 'police';
  if (!police) return;
  if (!driven) {
    setEmissive(rec.sirenL, 0.2, 0xff1a1a);
    setEmissive(rec.sirenR, 0.2, 0x2244ff);
    return;
  }
  const wave = Math.sin(rec.t * Math.PI * 2 * 4);
  const leftOn = wave >= 0;
  setEmissive(rec.sirenL, leftOn ? 3.2 : 0.15, 0xff1a1a);
  setEmissive(rec.sirenR, leftOn ? 0.15 : 3.2, 0x2244ff);
}
