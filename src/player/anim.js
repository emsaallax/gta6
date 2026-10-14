// 3-02. Процедурная анимация: idle / walk / run / jump / crouch.
// Крутит rotation частей модели. Фазу шага крутит только на walk и run.

function rememberRest(part) {
  if (part.userData.restY === undefined) part.userData.restY = part.position.y;
}

function resetExtra(parts) {
  const { head, torso, armL, armR } = parts;
  torso.rotation.y = 0;
  torso.rotation.z = 0;
  torso.rotation.x = 0;
  head.rotation.y = 0;
  head.rotation.z = 0;
  armL.rotation.z = 0;
  armR.rotation.z = 0;
  if (torso.userData.restY !== undefined) torso.position.y = torso.userData.restY;
}

export function createPlayerAnim() {
  return { phase: 0 };
}

export function applyPlayerAnim(anim, parts, flags, dt) {
  const { head, torso, armL, armR, legL, legR } = parts;
  rememberRest(torso);
  resetExtra(parts);

  const gait = flags.gait;

  if (gait === 'walk' || gait === 'run') {
    const hz = gait === 'run' ? 3.4 : 2.0;
    anim.phase += dt * hz * Math.PI * 2;
    const amp = gait === 'run' ? 0.72 : 0.42;
    const swing = Math.sin(anim.phase) * amp;
    const stance = gait === 'run' ? 0.12 : 0.02;
    const armAmp = gait === 'run' ? 0.9 : 0.7;
    // stance разводит walk/run даже при phase=0 (критерий: разный legL.rotation.x).
    legL.rotation.x = swing + stance;
    legR.rotation.x = -swing + stance * 0.5;
    armL.rotation.x = -swing * armAmp;
    armR.rotation.x = swing * armAmp;
    torso.rotation.y = Math.sin(anim.phase) * (gait === 'run' ? 0.10 : 0.05);
    head.rotation.x = 0.04;
    armL.rotation.z = gait === 'run' ? 0.12 : 0.06;
    armR.rotation.z = gait === 'run' ? -0.12 : -0.06;
    return;
  }

  if (gait === 'jump') {
    // В воздухе фазу шага не крутим.
    legL.rotation.x = 0.40;
    legR.rotation.x = 0.34;
    armL.rotation.x = -0.55;
    armR.rotation.x = 0.45;
    armL.rotation.z = 0.22;
    armR.rotation.z = -0.22;
    head.rotation.x = -0.08;
    torso.rotation.x = 0.06;
    return;
  }

  if (gait === 'crouch') {
    torso.position.y = torso.userData.restY - 0.28;
    torso.rotation.x = 0.22;
    head.rotation.x = 0.12;
    legL.rotation.x = 0.85;
    legR.rotation.x = 0.80;
    armL.rotation.x = 0.20;
    armR.rotation.x = 0.16;
    armL.rotation.z = 0.14;
    armR.rotation.z = -0.14;
    return;
  }

  // idle — лёгкое дыхание, ноги почти прямые
  anim._idleT = (anim._idleT || 0) + dt;
  const breath = Math.sin(anim._idleT * 2.4) * 0.025;
  torso.rotation.x = breath;
  head.rotation.x = breath * 0.6 + 0.02;
  legL.rotation.x = 0.04;
  legR.rotation.x = 0.02;
  armL.rotation.x = 0.06;
  armR.rotation.x = 0.05;
  armL.rotation.z = 0.08;
  armR.rotation.z = -0.08;
}
