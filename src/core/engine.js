// ГРУППА 1 владеет этим файлом. Публичный API ниже менять только с согласия оркестратора.
import * as THREE from 'three';
import { Input } from './input.js';
import { Physics } from './physics.js';
import { attachLoop } from './timestep.js';
import { PerfSystem } from './perf.js';
import { applyTonemap, applyExposure } from './render-tonemap.js';
import {
  applyPixelRatio,
  createComposer,
  readQuality,
  renderFrame,
  resizeComposer,
} from './composer.js';
import { attachMouseButtons } from './mouse-buttons.js';
import { attachBodies } from './bodies.js';

export class Engine {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    applyTonemap(this.renderer);
    applyPixelRatio(this.renderer, 'high');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
    this.input = new Input(canvas);
    attachMouseButtons(this.input, canvas);
    this.physics = new Physics();
    attachBodies(this.physics);
    this.clock = new THREE.Clock();
    this.systems = [];          // объекты с update(dt, engine)
    this.state = {};            // общий словарь: state.player, state.city, state.vehicles ...
    this.events = new EventTarget();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.composer = createComposer(this.renderer, this.scene, this.camera);
    resizeComposer(this.composer, innerWidth, innerHeight, readQuality(this));
  }
  add(system) { this.systems.push(system); system.init?.(this); return system; }
  emit(name, detail) { this.events.dispatchEvent(new CustomEvent(name, { detail })); }
  on(name, fn) { this.events.addEventListener(name, e => fn(e.detail)); }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const q = readQuality(this);
    const pr = applyPixelRatio(this.renderer, q);
    if (this.composer) resizeComposer(this.composer, w, h, q, pr);
  }
  render() {
    applyExposure(this.renderer, this);
    renderFrame(this, this.composer);
  }
  start() {
    if (this._running) return;
    this._running = true;
    // PerfSystem не в main.js: оркестратор владеет main.js, зона подключает сама.
    if (!this.systems.some((s) => s instanceof PerfSystem)) {
      this.add(new PerfSystem());
    }
    attachLoop(this);
  }
}
