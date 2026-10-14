// ГРУППА 3. Герой пешком. state.player по CONTRACTS §7, cameraTarget mode 'foot'.
import { createHeroRig } from './hero-rig.js';
import { createPlayerAnim, applyPlayerAnim } from './anim.js';
import { createMoveState, stepPlayerMove } from './move.js';
import { handleVehicleInteract } from './vehicle.js';
import { initPlayerHealth, updatePlayerHealth } from './health.js';
import {
  initPlayerCombat,
  updatePlayerCombat,
  syncPlayerBody,
} from './combat.js';
import { loadKenneyHero, updateKenneyHero } from './kenney-hero.js';
import { bindRecoil, stepRecoil } from './recoil.js';
import { applyKenneyStride, applyStridePose, maybePlayStep } from './gait-stride.js';
import {
  createAimPoseState,
  notifyShot,
  stepAimPoseState,
  wantAimPose,
  applyProceduralAim,
  applyKenneyAim,
} from './aim-pose.js';
import { firePistol } from './aim-ray.js';
import { createShotFx } from './shot-fx.js';
import { stepHeroTurn } from './turn-heading.js';

export class Player {
  init(e) {
    const model = createHeroRig();
    this.object3d = model.object3d;
    this.parts = model.parts;
    this.anim = createPlayerAnim();
    this.move = createMoveState();
    this.aimPose = createAimPoseState();
    this.shotFx = createShotFx(e.scene);
    this.kenney = null;
    this._kenneyWait = false;
    this._kenneyDone = false;

    const s = e.state.city?.spawn ?? { x: 0, z: 0 };
    this.object3d.position.set(s.x, 0, s.z);
    e.scene.add(this.object3d);

    e.state.player = {
      object3d: this.object3d,
      position: this.object3d.position,
      inVehicle: null,
    };
    initPlayerHealth(e.state.player);
    initPlayerCombat(e);
    bindRecoil(e);
    this._tryKenney(e);
  }

  _tryKenney(e) {
    if (this.kenney || this._kenneyWait || this._kenneyDone) return;
    const assets = e.state && e.state.assets;
    if (!assets || typeof assets.loadGLB !== 'function') return;
    this._kenneyWait = true;
    loadKenneyHero(assets)
      .then((hero) => {
        this._kenneyWait = false;
        if (!hero) {
          this._kenneyDone = true;
          return;
        }
        this._swapKenney(e, hero);
      })
      .catch(() => {
        this._kenneyWait = false;
        this._kenneyDone = true;
      });
  }

  _swapKenney(e, hero) {
    const p = e.state.player;
    if (!p || !hero || !hero.object3d) return;
    const old = this.object3d;
    hero.object3d.position.copy(old.position);
    hero.object3d.rotation.y = old.rotation.y;
    e.scene.add(hero.object3d);
    e.scene.remove(old);
    this.object3d = hero.object3d;
    this.kenney = hero;
    this.parts = null;
    p.object3d = hero.object3d;
    p.position = hero.object3d.position;
    if (p.body) p.body.position = p.position;
  }

  _heroFlags(p, melee, poseOn) {
    return {
      gait: this.move.gait,
      grounded: this.move.grounded,
      aiming: !!(poseOn || p.aiming),
      weapon: p.weapon || 'fist',
      inVehicle: !!p.inVehicle,
      dead: !!p.dead,
      melee: !!melee,
    };
  }

  _tickShot(e, dt, pistolShot) {
    if (pistolShot) {
      notifyShot(this.aimPose);
      const hit = firePistol(e);
      if (hit && this.shotFx && hit.muzzle && hit.hitPoint) {
        this.shotFx.play(hit.muzzle, hit.hitPoint, e);
      }
    }
    if (this.shotFx) this.shotFx.update(dt);
  }

  _tickGaitAndPose(e, p, dt, melee) {
    const spd = Math.hypot(this.move.vx, this.move.vz);
    const gait = this.move.gait;
    const poseOn = wantAimPose(this.aimPose, p);
    const walking = this.move.grounded && (gait === 'walk' || gait === 'run');
    const prevPhase = this.anim.phase || 0;
    if (walking) {
      applyStridePose(this.anim, this.parts || {}, spd, gait, dt);
      maybePlayStep(this.anim, prevPhase, e);
    }

    if (this.kenney) {
      updateKenneyHero(this.kenney, this._heroFlags(p, melee, poseOn), dt);
      applyKenneyStride(this.kenney, spd, gait);
      applyKenneyAim(this.kenney, poseOn);
    } else if (this.parts) {
      if (!walking) {
        applyPlayerAnim(this.anim, this.parts, {
          gait,
          grounded: this.move.grounded,
        }, dt);
      }
      applyProceduralAim(this.parts, p, poseOn);
    }
  }

  update(dt, e) {
    const p = e.state.player;
    if (!p) return;
    this._tryKenney(e);

    updatePlayerHealth(e, dt);

    const melee =
      !p.dead &&
      !p.inVehicle &&
      p.weapon === 'fist' &&
      e.input &&
      typeof e.input.pressed === 'function' &&
      e.input.pressed('Mouse0');

    if (p.dead) {
      this.move.vx = 0;
      this.move.vz = 0;
      this.move.vy = 0;
      this.move.gait = 'idle';
      this.move.grounded = true;
      this.move.crouching = false;
      p.aiming = false;
      syncPlayerBody(p, 0, 0);
      if (this.kenney) updateKenneyHero(this.kenney, this._heroFlags(p, false, false), dt);
      this._tickShot(e, dt, false);
      return;
    }

    handleVehicleInteract(e);

    if (p.inVehicle) {
      this.move.vx = 0;
      this.move.vz = 0;
      this.move.vy = 0;
      this.move.gait = 'idle';
      this.move.grounded = true;
      this.move.crouching = false;
      const pos = p.inVehicle.position || p.inVehicle.object3d?.position;
      if (pos) {
        p.object3d.position.x = pos.x;
        p.object3d.position.y = pos.y || 0;
        p.object3d.position.z = pos.z;
      }
      updatePlayerCombat(e, dt);
      syncPlayerBody(p, 0, 0);
      if (this.kenney) updateKenneyHero(this.kenney, this._heroFlags(p, false, false), dt);
      this._tickShot(e, dt, false);
      return;
    }

    stepPlayerMove(this.move, p.object3d, e.input, e.camera, e.physics, dt);
    const pistolShot = updatePlayerCombat(e, dt);
    const camFwd = e.state.camera && e.state.camera.forward;
    stepHeroTurn(p.object3d, this.move, !!p.aiming, camFwd, dt);
    stepAimPoseState(this.aimPose, dt, !!p.aiming);
    this._tickShot(e, dt, pistolShot);
    this._tickGaitAndPose(e, p, dt, melee);
    syncPlayerBody(p, this.move.vx, this.move.vz);

    const aiming = !!p.aiming;
    e.state.cameraTarget = {
      position: p.object3d.position,
      heading: 0,
      distance: aiming ? 2.6 : (this.move.crouching ? 4.2 : 5),
      height: aiming ? 1.6 : (this.move.crouching ? 1.2 : 1.8),
      mode: 'foot',
    };
    stepRecoil(e.state.cameraTarget, dt);
  }
}
