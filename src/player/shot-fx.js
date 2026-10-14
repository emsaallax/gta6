// ФАЙЛЫ: src/player/shot-fx.js
import * as THREE from 'three';

export const FLASH_SCALE = 0.15;
export const FLASH_LIFE = 0.04;
export const TRACER_LIFE = 0.10;
export const SPARK_LIFE = 0.25;
export const SPARK_COUNT = 12;
export const SPARK_POOL = 40;

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/**
 * scene.add: 1 вспышка (Mesh Basic, цвет 0xffee88, scale FLASH_SCALE, visible=false),
 * 1 Line трассер (жёлто-белый непрозрачный), 1 InstancedMesh искр (сфера r=0.03, count=40).
 * Один PointLight (цвет 0xffcc66, intensity 0, distance 6) — не каждый кадр новый.
 * Без утечек: ничего не создавать в play/update.
 */
export function createShotFx(scene) {
  const flashGeo = new THREE.SphereGeometry(1, 8, 6);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffee88,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.scale.setScalar(FLASH_SCALE);
  flash.visible = false;
  flash.frustumCulled = false;
  scene.add(flash);

  const tracerPos = new Float32Array(6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({
    color: 0xfff4aa,
    transparent: false,
    opacity: 1,
    depthWrite: false,
  });
  const tracer = new THREE.Line(tracerGeo, tracerMat);
  tracer.visible = false;
  tracer.frustumCulled = false;
  scene.add(tracer);

  const sparkGeo = new THREE.SphereGeometry(0.03, 6, 4);
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_POOL);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.frustumCulled = false;
  sparks.count = SPARK_POOL;
  scene.add(sparks);

  const sparkLife = new Float32Array(SPARK_POOL);
  const sparkVx = new Float32Array(SPARK_POOL);
  const sparkVy = new Float32Array(SPARK_POOL);
  const sparkVz = new Float32Array(SPARK_POOL);
  const sparkX = new Float32Array(SPARK_POOL);
  const sparkY = new Float32Array(SPARK_POOL);
  const sparkZ = new Float32Array(SPARK_POOL);

  _scale.set(0, 0, 0);
  _quat.identity();
  _pos.set(0, -1000, 0);
  for (let i = 0; i < SPARK_POOL; i++) {
    sparkLife[i] = 0;
    _mat.compose(_pos, _quat, _scale);
    sparks.setMatrixAt(i, _mat);
  }
  sparks.instanceMatrix.needsUpdate = true;

  const light = new THREE.PointLight(0xffcc66, 0, 6);
  light.visible = false;
  scene.add(light);

  let flashLife = 0;
  let tracerLife = 0;
  let sparkCursor = 0;

  function hideSpark(i) {
    sparkLife[i] = 0;
    _pos.set(0, -1000, 0);
    _scale.set(0, 0, 0);
    _quat.identity();
    _mat.compose(_pos, _quat, _scale);
    sparks.setMatrixAt(i, _mat);
  }

  return {
    play(muzzle, hitPoint, engine) {
      if (!muzzle || !hitPoint) return;
      if (typeof muzzle.x !== 'number' || typeof hitPoint.x !== 'number') return;

      const mx = muzzle.x;
      const my = muzzle.y;
      const mz = muzzle.z;
      const hx = hitPoint.x;
      const hy = hitPoint.y;
      const hz = hitPoint.z;

      flash.position.set(mx, my, mz);
      flash.scale.setScalar(FLASH_SCALE);
      flash.visible = true;
      flashLife = FLASH_LIFE;
      flashMat.opacity = 1;

      light.position.set(mx, my, mz);
      light.intensity = 8;
      light.distance = 6;
      light.visible = true;

      tracerPos[0] = mx;
      tracerPos[1] = my;
      tracerPos[2] = mz;
      tracerPos[3] = hx;
      tracerPos[4] = hy;
      tracerPos[5] = hz;
      tracerGeo.attributes.position.needsUpdate = true;
      tracerGeo.computeBoundingSphere();
      tracer.visible = true;
      tracerLife = TRACER_LIFE;
      tracerMat.opacity = 1;

      for (let n = 0; n < SPARK_COUNT; n++) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % SPARK_POOL;
        sparkLife[i] = SPARK_LIFE;
        sparkX[i] = hx;
        sparkY[i] = hy;
        sparkZ[i] = hz;
        const ang = Math.random() * Math.PI * 2;
        const out = 2 + Math.random() * 6;
        sparkVx[i] = Math.cos(ang) * out;
        sparkVy[i] = 3 + Math.random() * 5;
        sparkVz[i] = Math.sin(ang) * out;
        _pos.set(hx, hy, hz);
        _scale.set(1, 1, 1);
        _quat.identity();
        _mat.compose(_pos, _quat, _scale);
        sparks.setMatrixAt(i, _mat);
      }
      sparks.instanceMatrix.needsUpdate = true;

      const audio = engine && engine.state && engine.state.audio;
      if (audio && typeof audio.play === 'function') {
        audio.play('shot', { volume: 0.7 });
      }
    },

    update(dt) {
      if (flashLife > 0) {
        flashLife -= dt;
        const t = flashLife / FLASH_LIFE;
        flashMat.opacity = Math.max(0, t);
        light.intensity = 8 * Math.max(0, t);
        if (flashLife <= 0) {
          flash.visible = false;
          flashMat.opacity = 1;
          light.intensity = 0;
          light.visible = false;
        }
      } else {
        light.intensity = 0;
        light.visible = false;
        flash.visible = false;
      }

      if (tracerLife > 0) {
        tracerLife -= dt;
        if (tracerLife <= 0) {
          tracer.visible = false;
        }
      }

      let sparksDirty = false;
      for (let i = 0; i < SPARK_POOL; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        if (sparkLife[i] <= 0) {
          hideSpark(i);
          sparksDirty = true;
          continue;
        }
        sparkVy[i] -= 18 * dt;
        sparkX[i] += sparkVx[i] * dt;
        sparkY[i] += sparkVy[i] * dt;
        sparkZ[i] += sparkVz[i] * dt;
        const lifeT = sparkLife[i] / SPARK_LIFE;
        const s = 0.4 + 0.6 * lifeT;
        _pos.set(sparkX[i], sparkY[i], sparkZ[i]);
        _scale.set(s, s, s);
        _quat.identity();
        _mat.compose(_pos, _quat, _scale);
        sparks.setMatrixAt(i, _mat);
        sparksDirty = true;
      }
      if (sparksDirty) sparks.instanceMatrix.needsUpdate = true;
    },
  };
}
