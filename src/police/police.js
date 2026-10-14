// ГРУППА 5. Розыск, пешие копы, полицейские машины.
import { Wanted } from './wanted.js';
import { CopFoot } from './copFoot.js';
import { PoliceUnits } from './units.js';

export class Police {
  init(engine) {
    this.wanted = new Wanted();
    this.foot = new CopFoot();
    this.units = new PoliceUnits();
    this.wanted.init(engine);
    this.foot.init(engine);
    this.units.init(engine);
  }

  update(dt, engine) {
    this.wanted.update(dt, engine);
    this.foot.update(dt, engine);
    this.units.update(dt, engine);
  }
}
