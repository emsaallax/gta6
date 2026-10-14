// ФАЙЛЫ: src/assets/assets.js, src/main.js, CONTRACTS.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

function isLocalAssetPath(path) {
  return typeof path === 'string' && path.startsWith('assets/') && path.indexOf('://') === -1;
}

export class Assets {
  constructor() {
    this.progress = 1;
    this.ready = false;
    this.failed = [];
    this._engine = null;
    this._cache = new Map();
    this._started = 0;
    this._completed = 0;
    this._gltfLoader = new GLTFLoader();
    this._texLoader = new THREE.TextureLoader();
    this._rgbeLoader = new RGBELoader();
  }

  init(engine) {
    this._engine = engine;
    engine.state.assets = this;
  }

  update(_dt, engine) {
    if (this._started === 0) this.ready = true;
    else this.ready = this._completed >= this._started;
    this.progress = this._started === 0 ? 1 : this._completed / this._started;
  }

  loadGLB(path) {
    return this._cached(path, () => {
      if (!isLocalAssetPath(path)) return this._fail(path, new Error('только assets/'));
      return this._gltfLoader.loadAsync(path).then((gltf) => ({
        scene: gltf.scene,
        animations: gltf.animations || [],
      }));
    });
  }

  cloneGLB(gltf) {
    return SkeletonUtils.clone(gltf.scene);
  }

  loadTexture(path, opts) {
    const srgb = opts?.srgb !== false;
    const repeat = opts?.repeat ?? [1, 1];
    const key = `tex:${path}:${srgb}:${repeat[0]}:${repeat[1]}`;
    return this._cached(key, () => {
      if (!isLocalAssetPath(path)) return this._fail(path, new Error('только assets/'));
      return this._texLoader.loadAsync(path).then((texture) => {
        texture.generateMipmaps = true;
        texture.anisotropy = 8;
        texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat[0], repeat[1]);
        texture.needsUpdate = true;
        return texture;
      });
    }, path);
  }

  loadPBR(name) {
    const key = `pbr:${name}`;
    return this._cached(key, () => {
      const base = `assets/textures/${name}/${name}`;
      return Promise.all([
        this.loadTexture(`${base}_diff_1k.jpg`, { srgb: true }),
        this.loadTexture(`${base}_nor_gl_1k.jpg`, { srgb: false }),
        this.loadTexture(`${base}_arm_1k.jpg`, { srgb: false }),
      ]).then(([map, normalMap, aoRoughnessMetalness]) => ({
        map,
        normalMap,
        aoRoughnessMetalness,
      }));
    }, false);
  }

  loadHDR(path) {
    return this._cached(path, () => {
      if (!isLocalAssetPath(path)) return this._fail(path, new Error('только assets/'));
      return this._rgbeLoader.loadAsync(path).then((hdr) => {
        const pmrem = new THREE.PMREMGenerator(this._engine.renderer);
        const target = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        pmrem.dispose();
        return target.texture;
      });
    });
  }

  _refresh() {
    this.progress = this._started === 0 ? 1 : this._completed / this._started;
    if (this._started > 0) this.ready = this._completed >= this._started;
  }

  _fail(path, err) {
    if (path && this.failed.indexOf(path) === -1) this.failed.push(path);
    return Promise.reject(err);
  }

  // countStart=false — обёртка (PBR), счётчик ведут вложенные load*
  _cached(key, factory, failPath) {
    if (this._cache.has(key)) return this._cache.get(key);
    const countStart = failPath !== false;
    if (countStart) {
      this._started += 1;
      this._refresh();
    }
    const promise = Promise.resolve()
      .then(factory)
      .then((result) => {
        if (countStart) {
          this._completed += 1;
          this._refresh();
        }
        return result;
      })
      .catch((err) => {
        if (countStart) {
          this._completed += 1;
          const p = failPath === false ? null : (typeof failPath === 'string' ? failPath : key);
          if (p && this.failed.indexOf(p) === -1) this.failed.push(p);
          this._refresh();
        }
        return Promise.reject(err);
      });
    this._cache.set(key, promise);
    return promise;
  }
}
