import * as THREE from 'three';

function xzDist(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

function playerXZ(engine) {
  const p = engine.state.player?.position;
  if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    return { x: p.x, z: p.z };
  }
  return null;
}

function keyE(engine) {
  const input = engine.input;
  if (!input || typeof input.pressed !== 'function') return false;
  return input.pressed('KeyE') || input.pressed('E');
}

export class DriveMission {
  init(engine) {
    const pois = engine.state.city?.pois || {};
    const spawn = engine.state.city?.spawn;
    const A = pois.downtown || spawn || { x: 0, z: 0 };
    this.A = { x: A.x, z: A.z };
    const Bsrc = pois.pier || pois.beach || { x: this.A.x + 80, z: this.A.z + 80 };
    this.B = { x: Bsrc.x, z: Bsrc.z };
    if (xzDist(this.A.x, this.A.z, this.B.x, this.B.z) < 30) {
      this.B.x += 80;
    }

    this.endHold = 0;

    const geo = new THREE.CylinderGeometry(1.4, 1.4, 0.28, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x19f0ff,
      emissive: 0x19f0ff,
      emissiveIntensity: 3.2,
      metalness: 0.1,
      roughness: 0.45,
    });
    this.marker = new THREE.Mesh(geo, mat);
    this.marker.position.set(this.A.x, 1.1, this.A.z);
    engine.scene.add(this.marker);

    engine.state.mission = {
      id: 'drive-ab',
      title: 'К пирсу до заката',
      status: 'idle',
      target: { x: this.A.x, z: this.A.z },
      timeLeft: 0,
    };
  }

  placeMarker(target) {
    if (!this.marker) return;
    if (!target) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(target.x, 1.1, target.z);
  }

  setMission(engine, status, target, timeLeft) {
    const m = engine.state.mission;
    if (!m) return;
    m.id = 'drive-ab';
    m.title = 'К пирсу до заката';
    m.status = status;
    m.target = target;
    m.timeLeft = timeLeft;
    this.placeMarker(target);
  }

  update(dt, engine) {
    const m = engine.state.mission;
    if (!m) return;

    this.placeMarker(m.target);

    if (engine.state.paused === true) return;

    const status = m.status;

    if (status === 'success' || status === 'fail') {
      this.endHold += dt || 0;
      if (this.endHold >= 4) {
        this.endHold = 0;
        this.setMission(engine, 'idle', { x: this.A.x, z: this.A.z }, 0);
      }
      return;
    }

    if (status === 'idle') {
      m.target = { x: this.A.x, z: this.A.z };
      m.timeLeft = 0;
      this.placeMarker(m.target);
      if (engine.state.ui?.started === false) return;
      const pos = playerXZ(engine);
      if (!pos) return;
      if (xzDist(pos.x, pos.z, this.A.x, this.A.z) <= 10 && keyE(engine)) {
        this.endHold = 0;
        this.setMission(engine, 'active', { x: this.B.x, z: this.B.z }, 90);
        engine.emit('notify', { text: 'Доедь до пирса за 90 сек', ms: 2500 });
      }
      return;
    }

    if (status === 'active') {
      m.timeLeft -= dt || 0;
      // Цель не перезаписываем каждый кадр: приёмка ставит далёкую точку,
      // чтобы проверить fail. Иначе игрок на пирсе снова получает success.
      if (!m.target) m.target = { x: this.B.x, z: this.B.z };
      this.placeMarker(m.target);

      const pos = playerXZ(engine);
      const tgt = m.target;
      if (pos && tgt && xzDist(pos.x, pos.z, tgt.x, tgt.z) <= 10) {
        this.endHold = 0;
        this.setMission(engine, 'success', null, Math.max(0, m.timeLeft));
        engine.emit('notify', { text: 'Пирс! Миссия выполнена', ms: 2500 });
        return;
      }
      if (m.timeLeft <= 0) {
        m.timeLeft = 0;
        this.endHold = 0;
        this.setMission(engine, 'fail', null, 0);
        engine.emit('notify', { text: 'Не успел — провал', ms: 2500 });
      }
    }
  }
}
