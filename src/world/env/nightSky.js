// Ночное небо: луна напротив солнца, звёзды вокруг камеры. Свет не добавляем.
import * as THREE from 'three';

const STAR_COUNT = 2000;
const STAR_RADIUS = 700;
const MOON_DIST = 500;
const MOON_RADIUS = 16;

function nightAmount(time) {
  if (time < 5 || time >= 19.5) return 1;
  if (time >= 6 && time < 18.5) return 0;
  if (time >= 18.5 && time < 19.5) return time - 18.5;
  if (time >= 5 && time < 6) return 1 - (time - 5);
  return 0;
}

export class NightSky {
  init(engine) {
    this.group = new THREE.Group();
    this.group.name = 'nightSky';

    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = STAR_RADIUS;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const w = 0.82 + Math.random() * 0.18;
      colors[i * 3] = w;
      colors[i * 3 + 1] = w;
      colors[i * 3 + 2] = 1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.starMat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    this.stars = new THREE.Points(geo, this.starMat);
    this.group.add(this.stars);

    this.moonMat = new THREE.MeshStandardMaterial({
      color: 0xe8e6d8,
      emissive: 0x9a9878,
      emissiveIntensity: 1.1,
      roughness: 1,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0,
    });
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 16, 16), this.moonMat);
    this.group.add(this.moon);

    engine.scene.add(this.group);
    this.apply(engine);
  }

  update(_dt, engine) {
    this.apply(engine);
  }

  apply(engine) {
    const time = Number.isFinite(engine.state.time) ? engine.state.time : 12;
    const theta = ((time - 6) / 24) * Math.PI * 2;
    this.moon.position.set(
      Math.cos(theta + Math.PI) * MOON_DIST,
      Math.sin(theta + Math.PI) * MOON_DIST,
      0,
    );

    let amount = nightAmount(time);
    if (this.moon.position.y < 0) {
      this.moonMat.opacity = 0;
    } else {
      this.moonMat.opacity = amount;
    }
    this.starMat.opacity = amount;
    this.moon.visible = this.moonMat.opacity > 0.01;
    this.stars.visible = amount > 0.01;

    if (engine.camera) {
      this.group.position.copy(engine.camera.position);
      const far = engine.camera.far || 800;
      const fit = Math.min(1, (far * 0.9) / STAR_RADIUS);
      this.group.scale.setScalar(Math.max(0.25, fit));
    }
  }
}
