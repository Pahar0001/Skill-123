/* Росток в горшке — круглая «игрушечная» иконка и предмет-украшение (Zdog).
   Статичный SVG:  node svg3d.mjs zdog scenes/zdog-sprout.mjs --out out --css-vars --for icon
   Живой на сайте: <div data-zdog-live="scenes/zdog-sprout.mjs">…статичный SVG…</div> + zdog-live.js (README).
   Правила сцены: одна толщина обводки на набор (здесь 6), цвета — только из палитры, ничего мельче 4 единиц. */
export const view = { size: [160, 160], rotate: { x: -0.42, y: 0.6 } };
export const palette = { ink: '#16301F', moss: '#5E7A33', leaf: '#8DB04A', clay: '#C8643C', shade: '#A04E2C' };

export function build({ Zdog, illo, palette: c, TAU }) {
  const up = { x: TAU / 4 };   /* ось цилиндра — вертикально */
  /* горшок: тело, ободок, земля */
  new Zdog.Cylinder({ addTo: illo, diameter: 58, length: 34, stroke: false, color: c.clay, backface: c.shade, rotate: up, translate: { y: 44 } });
  new Zdog.Cylinder({ addTo: illo, diameter: 70, length: 12, stroke: false, color: c.clay, frontFace: c.shade, backface: c.shade, rotate: up, translate: { y: 22 } });
  new Zdog.Ellipse({ addTo: illo, diameter: 54, stroke: false, fill: true, color: c.ink, rotate: up, translate: { y: 15.5 } });
  /* стебель */
  new Zdog.Shape({ addTo: illo, stroke: 6, color: c.moss, closed: false, path: [{ x: 0, y: 14 }, { bezier: [{ x: 0, y: -2 }, { x: -4, y: -14 }, { x: 0, y: -28 }] }] });
  /* листья: левый пониже, правый повыше; плоскости развёрнуты по-разному — при повороте видно объём */
  const leaf = (dir, y, len, turn) => {
    /* группа без своей сортировки рисует детей по порядку: жилка всегда поверх листа, с какой стороны ни смотри */
    const a = new Zdog.Group({ addTo: illo, translate: { y }, rotate: { y: turn } });
    new Zdog.Shape({ addTo: a, stroke: 6, fill: true, color: c.leaf, path: [
      { x: 0, y: 0 },
      { bezier: [{ x: dir * len * 0.2, y: -len * 0.62 }, { x: dir * len * 0.8, y: -len * 0.72 }, { x: dir * len, y: -len * 0.5 }] },
      { bezier: [{ x: dir * len * 0.86, y: len * 0.06 }, { x: dir * len * 0.34, y: len * 0.2 }, { x: 0, y: 0 }] },
    ] });
    /* жилка — тоньше остальных линий нарочно: это деталь, а не контур */
    new Zdog.Shape({ addTo: a, stroke: 2.5, color: c.moss, closed: false, path: [{ x: dir * len * 0.14, y: -len * 0.07 }, { bezier: [{ x: dir * len * 0.4, y: -len * 0.2 }, { x: dir * len * 0.62, y: -len * 0.32 }, { x: dir * len * 0.8, y: -len * 0.42 }] }] });
  };
  leaf(-1, -6, 38, -1.0);
  leaf(1, -24, 46, -0.3);
}
