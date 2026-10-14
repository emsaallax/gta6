// ФАЙЛЫ: src/ui/timeSwitch.js, src/ui/weatherHud.js
// Значок текущей погоды рядом с часами HUD.

export const WEATHER_ICON = {
  clear: '☀',
  cloudy: '☁',
  rain: '🌧',
  storm: '⛈',
};

export class WeatherHud {
  init(_engine) {
    this.el = null;
    const host = document.getElementById('ui');
    if (!host) return;

    this.el = document.createElement('div');
    this.el.id = 'g5-weather-icon';
    this.el.style.cssText = [
      'position:absolute',
      'top:16px',
      'left:50%',
      'margin-left:72px',
      'pointer-events:none',
      'z-index:21',
      'font-size:22px',
      'line-height:1',
      'color:#fff',
      'text-shadow:0 1px 3px rgba(0,0,0,0.85)',
      'display:none',
    ].join(';');
    this.el.textContent = WEATHER_ICON.clear;
    host.appendChild(this.el);
  }

  update(_dt, engine) {
    if (!this.el) return;
    const started = engine.state.ui?.started === true;
    this.el.style.display = started ? '' : 'none';
    if (!started) return;

    const kind = engine.state.weather?.kind;
    this.el.textContent = WEATHER_ICON[kind] || WEATHER_ICON.clear;
  }
}
