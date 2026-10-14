// ФАЙЛЫ: src/world/city/dayBright.js
/** Ствол пальмы и фасад: нормали и альбедо, без ночного гашения. */
import * as THREE from 'three';

export const TRUNK = 0xc48a4a;

const WHITE = new THREE.Color(0xffffff);
const TRUNK_COL = new THREE.Color(TRUNK);
const DARK = 0.2;
const PALM_ROUGH_MAX = 0.85;
const FACADE_METAL_MAX = 0.05;
const FACADE_AO = 0.35;

function isGeo(item) {
  return !!(item && item.attributes);
}

function geoOf(item) {
  if (!item) return null;
  if (isGeo(item)) return item;
  if (item.geometry && isGeo(item.geometry)) return item.geometry;
  return null;
}

function hasNormal(geo) {
  return !!(geo && geo.attributes && geo.attributes.normal);
}

function ensureGeoNormal(geo) {
  if (!geo || hasNormal(geo)) return;
  if (typeof geo.computeVertexNormals === 'function') {
    geo.computeVertexNormals();
  }
}

function colorSum(mat) {
  const c = mat && mat.color;
  if (!c) return 3;
  return (c.r || 0) + (c.g || 0) + (c.b || 0);
}

function eachMat(mesh, fn) {
  const m = mesh && mesh.material;
  if (!m) return;
  if (Array.isArray(m)) {
    for (let i = 0; i < m.length; i++) {
      if (m[i]) fn(m[i]);
    }
  } else {
    fn(m);
  }
}

/** Ставит значение. Возвращает true, только если оно реально изменилось. */
function setProp(obj, key, value) {
  if (obj[key] === value) return false;
  obj[key] = value;
  return true;
}

/** geos: BufferGeometry[] пальм. Нет normal → computeVertexNormals. Нет geos — return. */
export function ensureNormals(geos) {
  if (!geos || !geos.length) return;
  for (let i = 0; i < geos.length; i++) {
    const geo = geoOf(geos[i]);
    if (geo) ensureGeoNormal(geo);
  }
}

function liftOnePalmMat(mat) {
  let changed = false;
  if (setProp(mat, 'metalness', 0)) changed = true;
  if (mat.roughness == null || mat.roughness > PALM_ROUGH_MAX) {
    mat.roughness = PALM_ROUGH_MAX;
    changed = true;
  }
  if (setProp(mat, 'aoMapIntensity', 0)) changed = true;
  if (mat.color && colorSum(mat) < DARK) {
    const target = mat.map ? WHITE : TRUNK_COL;
    if (!mat.color.equals(target)) {
      mat.color.copy(target);
      changed = true;
    }
  }
  // needsUpdate только при реальной смене значений: повторный вызов не перекомпилирует шейдер.
  if (changed) mat.needsUpdate = true;
}

/** meshes: InstancedMesh[] пальм. Нет — return. */
export function liftPalmMats(meshes) {
  if (!meshes || !meshes.length) return;
  for (let i = 0; i < meshes.length; i++) {
    const mesh = meshes[i];
    if (!mesh) continue;
    mesh.receiveShadow = false;
    const geo = geoOf(mesh);
    if (geo) ensureGeoNormal(geo);
    eachMat(mesh, liftOnePalmMat);
  }
}

// UV в three 0.160: канал текстуры задаёт texture.channel (по умолчанию 0 → атрибут 'uv').
// Канал N читает атрибут 'uvN': бывший uv2 теперь uv1. Атрибут 'uv2' нужен только каналу 2.
function uvAttrName(channel) {
  return channel > 0 ? 'uv' + channel : 'uv';
}

/** Копирует uv в uvN, только если канал N > 0 и атрибута uvN ещё нет (проверка на существующий uv1 сохранена). */
function ensureUvChannel(geo, channel) {
  if (!geo || !geo.attributes || !(channel > 0)) return;
  const name = uvAttrName(channel);
  if (geo.attributes[name]) return;
  const uv = geo.attributes.uv;
  if (!uv) return;
  geo.setAttribute(name, uv.clone());
}

/** Каналы UV (> 0), которые читают aoMap фасадов. Канал 0 копии не требует. */
function aoChannels(mats) {
  const out = [];
  for (let i = 0; i < mats.length; i++) {
    const ao = mats[i] && mats[i].aoMap;
    const ch = ao ? ao.channel : 0;
    if (ch > 0 && !out.includes(ch)) out.push(ch);
  }
  return out;
}

function liftOneFacadeMat(mat) {
  let changed = false;
  if (setProp(mat, 'aoMapIntensity', FACADE_AO)) changed = true;
  if (mat.metalness == null || mat.metalness > FACADE_METAL_MAX) {
    mat.metalness = FACADE_METAL_MAX;
    changed = true;
  }
  if (changed) mat.needsUpdate = true;
}

/** mats: Material[] фасадов. emissiveIntensity не трогать. */
export function liftFacadeMats(mats, geos) {
  if (!mats || !mats.length) return;
  if (geos && geos.length) {
    // Аргументы не связывают geo с mat, поэтому копия идёт во все переданные geo,
    // но только для каналов, которые реально читает aoMap фасада (channel > 0).
    const channels = aoChannels(mats);
    for (let i = 0; i < geos.length; i++) {
      const geo = geoOf(geos[i]);
      if (!geo) continue;
      ensureGeoNormal(geo);
      for (let c = 0; c < channels.length; c++) ensureUvChannel(geo, channels[c]);
    }
  }
  for (let i = 0; i < mats.length; i++) {
    if (mats[i]) liftOneFacadeMat(mats[i]);
  }
}

/** Пусто ок; ночью материалы не гасить. engine.state не писать. */
export function updateDayBright(_dt, _engine) {}
