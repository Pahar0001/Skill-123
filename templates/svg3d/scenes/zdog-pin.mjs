/* Метка на карте — круглая «игрушечная» иконка (Zdog): полусфера, конус и «глазок».
   node svg3d.mjs zdog scenes/zdog-pin.mjs --out out --css-vars --for icon */
export const view = { size: [160, 160], rotate: { x: -0.36, y: 0.5 } };
export const palette = { ink: '#16301F', clay: '#C8643C', shade: '#A04E2C', paper: '#F4F1E4', moss: '#5E7A33' };

export function build({ Zdog, illo, palette: c, TAU }) {
  /* тень-площадка: место, куда метка «воткнута» */
  new Zdog.Ellipse({ addTo: illo, diameter: 54, stroke: 6, fill: true, color: c.moss, rotate: { x: TAU / 4 }, translate: { y: 62 } });
  new Zdog.Ellipse({ addTo: illo, diameter: 20, stroke: false, fill: true, color: c.ink, rotate: { x: TAU / 4 }, translate: { y: 61 } });
  /* капля: конус остриём вниз, сверху полусфера */
  const drop = new Zdog.Anchor({ addTo: illo, translate: { y: -18 } });
  new Zdog.Cone({ addTo: drop, diameter: 74, length: 78, stroke: false, color: c.clay, backface: c.shade, rotate: { x: -TAU / 4 } });
  new Zdog.Hemisphere({ addTo: drop, diameter: 74, stroke: false, color: c.clay, backface: c.shade, rotate: { x: TAU / 4 } });
  /* «глазок» — шар, утопленный в каплю наполовину */
  new Zdog.Shape({ addTo: drop, stroke: 30, color: c.paper, translate: { z: 30, y: -2 } });
}
