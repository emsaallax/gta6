// Круг поиска копов на мини-карте. Вызывается из minimap.js внутри draw(),
// пока ctx сдвинут в центр карты и повёрнут: координаты относительно игрока.

/**
 * search.center: {x, z} последней точки, где копы видели игрока, или null (ничего не рисовать).
 * search.radius: радиус в метрах. px, pz: позиция игрока, scale: пикселей на метр, dpr: масштаб экрана.
 */
export function drawSearchCircle(ctx, search, px, pz, scale, dpr, time) {
  if (!search || !search.center) return;
  const r = search.radius * scale;
  // ctx.arc с отрицательным радиусом бросает исключение, поэтому отсекаем.
  if (!(r > 0)) return;
  const x = (search.center.x - px) * scale;
  const z = (search.center.z - pz) * scale;
  const pulse = 0.75 + 0.2 * Math.sin(time * 4); // 0.55..0.95
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, z, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,60,60,0.14)';
  ctx.fill();
  ctx.strokeStyle = `rgba(255,90,90,${pulse.toFixed(3)})`;
  ctx.lineWidth = 2 * dpr;
  ctx.setLineDash([8 * dpr, 6 * dpr]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
