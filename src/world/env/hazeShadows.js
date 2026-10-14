// ФАЙЛЫ: src/world/env/hazeShadows.js
// Мягкие тени вокруг игрока (PCFSoft) и дымка FogExp2 цветом неба.
import * as THREE from 'three';

const DEFAULT_DRAW = 800;
const SHADOW_EXTENT = 40;
const HAZE_K = 2.5;

function qualityOf(quality) {
  if (quality === 'low' || quality === 'medium' || quality === 'high') return quality;
  return 'high';
}

function qualityFromEngine(engine) {
  return qualityOf(engine?.state?.settings?.quality);
}

function drawDistanceOf(engine) {
  const raw = engine?.state?.settings?.drawDistance;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DRAW;
}

function anchorOf(engine) {
  const p = engine?.state?.player?.position ?? engine?.state?.cameraTarget?.position;
  if (p) return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
  return { x: 0, y: 0, z: 0 };
}

function mapSizeFor(quality) {
  return quality === 'high' ? 2048 : 1024;
}

/** renderer.shadowMap.enabled = quality!=='low'; type = PCFSoftShadowMap. */
export function setupShadowMap(renderer, quality) {
  if (!renderer?.shadowMap) return;
  const q = qualityOf(quality);
  if (q === 'low') {
    renderer.shadowMap.enabled = false;
    return;
  }
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

/**
 * Камера тени солнца ±40 м вокруг якоря игрока.
 * quality==='low' → sun.castShadow=false.
 * medium → mapSize 1024; high → 2048.
 * Смену mapSize — только если изменилось: map?.dispose(); map=null.
 */
export function updateSoftShadows(sun, engine) {
  if (!sun?.shadow) return;
  const q = qualityFromEngine(engine);
  const a = anchorOf(engine);
  if (sun.target) {
    sun.target.position.set(a.x, a.y, a.z);
    sun.target.updateMatrixWorld?.();
  }

  const cam = sun.shadow.camera;
  cam.left = -SHADOW_EXTENT;
  cam.right = SHADOW_EXTENT;
  cam.top = SHADOW_EXTENT;
  cam.bottom = -SHADOW_EXTENT;
  cam.updateProjectionMatrix();

  if (q === 'low') {
    sun.castShadow = false;
    return;
  }

  sun.castShadow = true;
  const size = mapSizeFor(q);
  if (sun.shadow.mapSize.x !== size || sun.shadow.mapSize.y !== size) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(size, size);
  }
}

/**
 * scene.fog = FogExp2(skyColor, density).
 * density так, чтобы к drawDistance картинка растворялась (ориентир 2.5 / drawDistance).
 * skyColor — THREE.Color, не брать из HDRI.
 */
export function updateHaze(scene, engine, skyColor) {
  if (!scene || !skyColor) return;
  const density = HAZE_K / drawDistanceOf(engine);
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.copy(skyColor);
    scene.fog.density = density;
    return;
  }
  scene.fog = new THREE.FogExp2(skyColor, density);
}
