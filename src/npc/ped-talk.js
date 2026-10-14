// ФАЙЛЫ: src/player/recoil.js, src/npc/ped-talk.js
// Гражданские стоят парами лицом друг к другу. mode не меняем (нет talk в CONTRACTS).

export const TALK_RADIUS = 2.4;
export const TALK_TIME = 6;
export const TALK_COOLDOWN = 12;
export const TALK_MAX_PAIRS = 6;

const RANGE = 80;

export function updatePedTalk(list, dt, playerPos) {
  if (!list) return;
  const t = dt > 0 ? dt : 0;

  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    if (!ped) continue;
    if (typeof ped._talkCd === 'number' && ped._talkCd > 0) {
      ped._talkCd -= t;
      if (ped._talkCd < 0) ped._talkCd = 0;
    }
  }

  let pairs = 0;
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a || seen.has(a) || !isTalking(a)) continue;
    const b = a._talkWith;
    if (!b || b._talkWith !== a || !canTalk(a, playerPos) || !canTalk(b, playerPos)) {
      stopTalk(a);
      stopTalk(b);
      continue;
    }
    seen.add(a);
    seen.add(b);
    pairs += 1;

    a._talkT -= t;
    b._talkT -= t;
    holdPair(a, b);

    if (a._talkT <= 0 || b._talkT <= 0) {
      stopTalk(a);
      stopTalk(b);
      pairs -= 1;
    }
  }

  if (pairs >= TALK_MAX_PAIRS) return;

  const cands = [];
  for (let i = 0; i < list.length; i++) {
    const ped = list[i];
    if (!canTalk(ped, playerPos)) continue;
    if (isTalking(ped)) continue;
    if (ped._talkCd > 0) continue;
    cands.push(ped);
  }

  const r2 = TALK_RADIUS * TALK_RADIUS;
  for (let i = 0; i < cands.length && pairs < TALK_MAX_PAIRS; i++) {
    const a = cands[i];
    if (isTalking(a) || a._talkCd > 0) continue;
    const pa = pedPos(a);
    if (!pa) continue;
    for (let j = i + 1; j < cands.length; j++) {
      const b = cands[j];
      if (isTalking(b) || b._talkCd > 0) continue;
      const pb = pedPos(b);
      if (!pb) continue;
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      if (dx * dx + dz * dz >= r2) continue;
      startTalk(a, b);
      pairs += 1;
      break;
    }
  }
}

function canTalk(ped, playerPos) {
  if (!ped) return false;
  if (ped.kind !== 'civ') return false;
  if (ped.mode !== 'walk') return false;
  if (typeof ped.brain === 'function') return false;
  const p = pedPos(ped);
  if (!p || !playerPos) return false;
  const dx = p.x - playerPos.x;
  const dz = p.z - playerPos.z;
  return dx * dx + dz * dz <= RANGE * RANGE;
}

function isTalking(ped) {
  return !!(ped && ped._talkT > 0 && ped._talkWith);
}

function startTalk(a, b) {
  a._talkT = TALK_TIME;
  b._talkT = TALK_TIME;
  a._talkWith = b;
  b._talkWith = a;
  holdPair(a, b);
}

function holdPair(a, b) {
  const pa = pedPos(a);
  const pb = pedPos(b);
  if (pa && pb) {
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    a.heading = Math.atan2(dx, dz);
    b.heading = Math.atan2(-dx, -dz);
  }
  stopBody(a);
  stopBody(b);
}

function stopTalk(ped) {
  if (!ped) return;
  ped._talkT = 0;
  ped._talkWith = null;
  ped._talkCd = TALK_COOLDOWN;
}

function stopBody(ped) {
  if (!ped.body) return;
  ped.body.vx = 0;
  ped.body.vz = 0;
}

function pedPos(ped) {
  return ped.position || (ped.object3d && ped.object3d.position) || null;
}
