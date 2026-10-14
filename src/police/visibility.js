// Видимость игрока для полиции: видят ли копы игрока и сколько времени он ушёл из виду.
// Интерфейс: new Visibility(); update(dt, player, cops) -> { seen, unseenTime, searchCenter, searchRadius }.

export const SIGHT_RANGE = 70;

const BASE_RADIUS = 25;    // м: радиус поиска сразу после потери видимости
const RADIUS_PER_SEC = 6;  // м/с: рост радиуса поиска
const MAX_GROW_SEC = 10;   // с: рост останавливается на 10 с (радиус 85 м)

export class Visibility {
  constructor() {
    this.unseenTime = 0;
    this.hasLastSeen = false;
    this.lastSeenPos = { x: 0, z: 0 };   // создаётся один раз, в кадре не аллоцируется
    this.result = { seen: false, unseenTime: 0, searchCenter: null, searchRadius: BASE_RADIUS };
  }

  // player {x,z}, cops [{x,z}]. Возвращается один и тот же объект this.result:
  // поля перезаписываются на каждом кадре, searchCenter ссылается на внутренний lastSeenPos.
  update(dt, player, cops) {
    const range2 = SIGHT_RANGE * SIGHT_RANGE;
    let seen = false;
    for (let i = 0; i < cops.length; i++) {
      const dx = cops[i].x - player.x;
      const dz = cops[i].z - player.z;
      if (dx * dx + dz * dz < range2) { seen = true; break; }
    }
    if (seen) {
      this.unseenTime = 0;
      this.hasLastSeen = true;
      this.lastSeenPos.x = player.x;
      this.lastSeenPos.z = player.z;
    } else {
      this.unseenTime += dt;
    }
    const r = this.result;
    r.seen = seen;
    r.unseenTime = this.unseenTime;
    r.searchCenter = this.hasLastSeen ? this.lastSeenPos : null;
    r.searchRadius = BASE_RADIUS + Math.min(this.unseenTime, MAX_GROW_SEC) * RADIUS_PER_SEC;
    return r;
  }
}
