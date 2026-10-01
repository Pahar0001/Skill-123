/* Чашка с паром — круглая «игрушечная» иконка и предмет-украшение (Zdog).
   node svg3d.mjs zdog scenes/zdog-cup.mjs --out out --css-vars --for icon */
export const view = { size: [160, 160], rotate: { x: -0.46, y: 0.5 } };
export const palette = { ink: '#16301F', moss: '#5E7A33', deep: '#4A6228', leaf: '#8DB04A', paper: '#F4F1E4' };

export function build({ Zdog, illo, palette: c, TAU }) {
  const up = { x: TAU / 4 };
  /* блюдце */
  new Zdog.Cylinder({ addTo: illo, diameter: 100, length: 6, stroke: false, color: c.moss, frontFace: c.leaf, backface: c.moss, rotate: up, translate: { y: 58 } });
  /* ручка — половина кольца сбоку */
  new Zdog.Ellipse({ addTo: illo, diameter: 30, quarters: 2, stroke: 8, color: c.moss, translate: { x: 33, y: 28 }, rotate: { z: -TAU / 4 } });
  /* тело чашки, кромка и напиток */
  new Zdog.Cylinder({ addTo: illo, diameter: 62, length: 50, stroke: false, color: c.moss, backface: c.deep, rotate: up, translate: { y: 30 } });
  new Zdog.Ellipse({ addTo: illo, diameter: 62, stroke: 4, fill: true, color: c.paper, rotate: up, translate: { y: 5 } });
  new Zdog.Ellipse({ addTo: illo, diameter: 50, stroke: false, fill: true, color: c.ink, rotate: up, translate: { y: 4.5 } });
  /* пар: три волны разной высоты */
  const wisp = (x, z, h) => new Zdog.Shape({ addTo: illo, stroke: 5, color: c.ink, closed: false, translate: { x, y: -10, z }, path: [
    { x: 0, y: 0 }, { bezier: [{ x: -7, y: -h * 0.25 }, { x: 7, y: -h * 0.45 }, { x: 0, y: -h * 0.66 }] }, { bezier: [{ x: -4, y: -h * 0.78 }, { x: 2, y: -h * 0.9 }, { x: 0, y: -h }] },
  ] });
  wisp(-14, 4, 28); wisp(0, -6, 38); wisp(14, 6, 24);
}
