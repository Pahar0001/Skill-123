/* Коробка с лентой и бантом — круглая «игрушечная» иконка и предмет-украшение (Zdog).
   node svg3d.mjs zdog scenes/zdog-gift.mjs --out out --css-vars --for icon
   Приёмы: лента — коробки на 1 единицу шире самой коробки (их грани снаружи и рисуются поверх);
   бант — отдельной группой: Zdog раскладывает слои по центру фигуры, и маленькая петля над широкой
   крышкой без группы уходила под неё. Грани, которых не видно, из статичного SVG убирает сам svg3d.mjs
   (backface: false у Zdog.Box прячет не те грани — не использовать). */
export const view = { size: [160, 160], rotate: { x: -0.5, y: 0.65 } };
export const palette = { ink: '#16301F', sun: '#E8B647', honey: '#D29A2E', cream: '#F4D98A', clay: '#C8643C', shade: '#A04E2C' };

export function build({ Zdog, illo, palette: c }) {
  const body = new Zdog.Group({ addTo: illo, updateSort: true });
  const box = (o) => new Zdog.Box({ addTo: body, stroke: 3, ...o });
  /* коробка и крышка: верх светлее, бока темнее — объём читается без света */
  box({ width: 76, height: 54, depth: 76, translate: { y: 26 }, color: c.honey, frontFace: c.sun, rearFace: c.sun, topFace: c.cream });
  box({ width: 88, height: 18, depth: 88, translate: { y: -12 }, color: c.honey, frontFace: c.sun, rearFace: c.sun, topFace: c.cream });
  /* лента крест-накрест: по коробке и по крышке */
  const band = (w, h, d, y) => box({ width: w, height: h, depth: d, translate: { y }, color: c.shade, frontFace: c.clay, rearFace: c.clay, topFace: c.clay });
  band(18, 54, 78, 26); band(78, 54, 18, 26);
  band(18, 18, 90, -12); band(90, 18, 18, -12);
  /* бант: две петли и узел, развёрнут к зрителю */
  const bow = new Zdog.Group({ addTo: illo, translate: { y: -24 }, rotate: { y: -0.65 } });
  for (const dir of [-1, 1]) new Zdog.Ellipse({ addTo: bow, width: 30, height: 20, stroke: 7, color: c.clay, translate: { x: dir * 17, y: -11 }, rotate: { z: dir * 0.45 } });
  new Zdog.Shape({ addTo: bow, stroke: 14, color: c.shade, translate: { y: -4 } });
}
