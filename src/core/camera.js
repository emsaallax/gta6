// ГРУППА 1. Камера следует за state.cameraTarget (CONTRACTS §2).
import * as THREE from 'three';
import { pullCamera, raycastBoxes } from './camera-occlusion.js';
import {
  MIN_CAM_Y,
  aimLookTarget,
  cameraFov,
  desiredCameraPos,
  stepFov,
  writeCameraState,
} from './camera-follow.js';
import {
  LOOK_SENS,
  PITCH_MAX,
  PITCH_MIN,
  desiredVehicleOrbit,
  stepOrbitLook,
} from './camera-orbit.js';
import { createHitShake, hitConcernsPlayer, lerpCam } from './camera-hit.js';

export const CAMERA_FOOT = { distance: 6, height: 2 };
export const CAMERA_VEHICLE = { distance: 11, height: 1.4 };

const ZOOM_MIN = 0.55;
const ZOOM_MAX = 1.8;
const HEAD_Y = 1.6;
const WALL_PAD = 0.3;
const MIN_DIST = 2.0;

const _dir = new THREE.Vector3();
const _orig = new THREE.Vector3();
const _rc = new THREE.Raycaster();

function isUnder(obj, root) {
  let o = obj;
  while (o) {
    if (o === root) return true;
    o = o.parent;
  }
  return false;
}

function skipBody(body, player, vehicle) {
  if (!body) return true;
  const ref = body.ref;
  if (player && (ref === player || body === player.body)) return true;
  if (vehicle && (ref === vehicle || body === vehicle.body)) return true;
  return false;
}

/** Ближайшее препятствие: коробки домов, тела, меши сцены (фонари без addBox). */
function nearestObstacle(engine, origin, dir, maxDist, player, vehicle) {
  let best = null;
  const physics = engine.physics;
  if (typeof physics?.raycast === 'function') {
    const h = physics.raycast(origin, dir, maxDist);
    if (h && (best == null || h.dist < best.dist)) best = h;
  } else {
    const h = raycastBoxes(physics?.boxes ?? [], origin, dir, maxDist);
    if (h && (best == null || h.dist < best.dist)) best = h;
  }
  if (typeof physics?.raycastBodies === 'function') {
    const h = physics.raycastBodies(origin, dir, maxDist, player);
    if (h && !skipBody(h.body, player, vehicle) && (best == null || h.dist < best.dist)) {
      best = h;
    }
  }
  const playerObj = player?.object3d;
  const vehicleObj = vehicle?.object3d;
  _orig.set(origin.x, origin.y, origin.z);
  _dir.set(dir.x, dir.y, dir.z);
  const len = _dir.length();
  if (len > 1e-8 && engine.scene) {
    _dir.multiplyScalar(1 / len);
    _rc.set(_orig, _dir);
    _rc.near = 0.08;
    _rc.far = maxDist;
    const hits = _rc.intersectObjects(engine.scene.children, true);
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!(hit.distance > 0.08) || hit.distance >= maxDist) continue;
      if (playerObj && isUnder(hit.object, playerObj)) continue;
      if (vehicleObj && isUnder(hit.object, vehicleObj)) continue;
      // Земля/асфальт/бордюр — иначе камера падает под ноги.
      if (hit.point && hit.point.y < 1.0) continue;
      if (best == null || hit.distance < best.dist) {
        best = { dist: hit.distance, point: hit.point };
      }
      break;
    }
  }
  return best;
}

export class CameraRig {
  init(engine) {
    this.yaw = 0;
    this.pitch = 0.3;
    this.zoom = 1;
    this._hasPos = false;
    this._lookIdle = 0;
    this._wasVehicle = false;
    this._shake = createHitShake();
    this._from = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._smooth = new THREE.Vector3();
    this._canvas = engine.renderer?.domElement ?? null;
    engine.on('bodyHit', (d) => {
      if (hitConcernsPlayer(d, engine.state.player)) this._shake.onHit(d && d.speed);
    });
    engine.on('playerDamage', (d) => {
      this._shake.onDamage(d && d.amount);
    });

    this._onWheel = (ev) => {
      const canvas = this._canvas;
      const locked = document.pointerLockElement != null;
      const overCanvas = canvas && (ev.target === canvas || canvas.contains(ev.target));
      if (!locked && !overCanvas) return;
      ev.preventDefault();
      const factor = Math.exp(-ev.deltaY * 0.001);
      this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
    };
    window.addEventListener('wheel', this._onWheel, { passive: false });
  }

  update(dt, engine) {
    if (engine.state.paused === true) return;
    const t = engine.state.cameraTarget;
    if (!t) return;

    const driven = engine.state.player?.inVehicle || null;
    const vehicle = t.mode === 'vehicle' || !!driven;
    const mode = vehicle ? 'vehicle' : 'foot';
    if (vehicle && !this._wasVehicle) {
      this.yaw = 0;
      this._lookIdle = 0;
      this._hasPos = false;
    }
    if (!vehicle && this._wasVehicle) this._hasPos = false;
    this._wasVehicle = vehicle;
    const aiming = engine.state.player?.aiming === true;
    const target = {
      position: t.position,
      heading: t.heading,
      distance: t.distance,
      height: t.height,
      mode,
      speed: t.speed,
    };

    const dx = engine.input.mouse?.dx ?? 0;
    const dy = engine.input.mouse?.dy ?? 0;
    // В машине мышь применяет stepOrbitLook (иначе yaw/pitch удвоятся).
    if (vehicle) {
      const lookStep = stepOrbitLook(this.yaw, this.pitch, this._lookIdle, dx, dy, dt, true);
      this.yaw = lookStep.yaw;
      this.pitch = lookStep.pitch;
      this._lookIdle = lookStep.idle;
    } else {
      this.yaw -= dx * LOOK_SENS;
      this.pitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, this.pitch + dy * LOOK_SENS));
      this._lookIdle = 0;
    }

    let desired;
    if (vehicle && !aiming) {
      desired = desiredVehicleOrbit(target, this.yaw, this.pitch, this.zoom);
    } else {
      desired = desiredCameraPos(target, this.yaw, this.pitch, this.zoom, aiming);
    }
    this._desired.set(desired.x, desired.y, desired.z);

    const lookH = target.height ?? (vehicle ? CAMERA_VEHICLE.height : CAMERA_FOOT.height);
    let lookX = t.position.x;
    let lookY = t.position.y + lookH * 0.6;
    let lookZ = t.position.z;
    if (aiming) {
      const look = aimLookTarget(target, this.yaw, this.pitch);
      lookX = look.x;
      lookY = look.y;
      lookZ = look.z;
    }
    // Луч от головы, не от груди: иначе камера проезжает столбы и падает вниз.
    this._from.set(t.position.x, t.position.y + HEAD_Y, t.position.z);

    if (!this._hasPos) {
      this._smooth.copy(this._desired);
      this._hasPos = true;
    } else {
      const sprung = lerpCam(this._smooth, this._desired, dt);
      this._smooth.set(sprung.x, sprung.y, sprung.z);
    }

    const shake = this._shake.offset(dt);
    this._smooth.x += shake.x;
    this._smooth.y += shake.y;
    this._smooth.z += shake.z;

    const player = engine.state.player;
    const pulled = pullCamera(this._from, this._smooth, engine.physics?.boxes ?? [], WALL_PAD, (b, origin, dir, maxDist) => {
      return nearestObstacle(engine, origin, dir, maxDist, player, driven);
    });

    const ox = this._from.x;
    const oy = this._from.y;
    const oz = this._from.z;
    let vx = pulled.x - ox;
    let vy = pulled.y - oy;
    let vz = pulled.z - oz;
    let dist = Math.hypot(vx, vy, vz);
    const minArm = aiming ? 1.2 : MIN_DIST;
    if (dist > 1e-6 && dist < minArm) {
      const inv = 1 / dist;
      const h2 = nearestObstacle(engine, this._from, { x: vx * inv, y: vy * inv, z: vz * inv }, minArm + WALL_PAD, player, driven);
      const room = h2 ? Math.max(0, h2.dist - WALL_PAD) : minArm;
      const want = Math.min(minArm, Math.max(dist, room));
      if (want > dist) {
        pulled.x = ox + vx * inv * want;
        pulled.y = oy + vy * inv * want;
        pulled.z = oz + vz * inv * want;
      }
    }

    if (mode === 'foot') {
      pulled.y = Math.max(pulled.y, t.position.y + MIN_CAM_Y);
    }
    engine.camera.position.copy(pulled);
    engine.camera.lookAt(lookX, lookY, lookZ);

    const fovTarget = cameraFov(mode, t.speed, aiming);
    engine.camera.fov = stepFov(engine.camera.fov, fovTarget, dt);
    engine.camera.updateProjectionMatrix();

    writeCameraState(engine, this.yaw, this.pitch, this.zoom, mode);
  }
}
