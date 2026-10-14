// ГРУППА 5. Миссии. Класс Missions — имя для src/main.js.
import { DriveMission } from './driveAB.js';

export class Missions {
  init(engine) {
    this.drive = new DriveMission();
    this.drive.init(engine);
  }

  update(dt, engine) {
    this.drive.update(dt, engine);
  }
}
