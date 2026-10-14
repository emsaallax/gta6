// ГРУППА 5. Миссии. Класс Missions — имя для src/main.js.
import { DriveMission } from './driveAB.js';
import { EscapeMission } from './escape.js';

export class Missions {
  init(engine) {
    this.drive = new DriveMission();
    this.drive.init(engine);
    this.escape = new EscapeMission();
    this._escStatus = 'idle';
  }

  update(dt, engine) {
    const st = engine.state;
    const m = st.mission;
    if (m && st.paused !== true) {
      // Старт «Оторваться от погони»: клавиша J, пока нет активной миссии.
      const inp = engine.input;
      if (m.status === 'idle' && st.ui?.started !== false && inp && typeof inp.pressed === 'function'
        && (inp.pressed('KeyJ') || inp.pressed('J'))) {
        this.escape.start(st);
        this._escStatus = 'active';
        engine.emit('notify', { text: 'Оторвись от погони за 120 сек', ms: 2500 });
      }
      this.escape.update(dt, st);
      if (m.id === 'escape') {
        if (m.timeLeft < 0) m.timeLeft = 0;
        if (m.status !== this._escStatus) {
          this._escStatus = m.status;
          if (m.status === 'success') engine.emit('notify', { text: 'Оторвался! Миссия выполнена', ms: 2500 });
          else if (m.status === 'fail') engine.emit('notify', { text: 'Не оторвался — провал', ms: 2500 });
        }
      }
    }
    this.drive.update(dt, engine);
  }
}
