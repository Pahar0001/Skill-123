/* Стенд самопроверки svg3d.mjs: шар на подставке с кольцом — все виды фигур Zdog, что дают разные контуры
   (обводка-шар, эллипс, полусфера с дугой, цилиндр без круглых концов, коробка). */
export const view = { size: [160, 160], rotate: { x: -0.45, y: 0.6 } };
export const palette = { ink: '#16301F', moss: '#5E7A33', sun: '#E8B647', paper: '#F4F1E4' };

export function build({ Zdog, illo, palette: c, TAU }) {
  new Zdog.Shape({ addTo: illo, stroke: 46, color: c.moss, translate: { y: -18 } });                       /* шар */
  new Zdog.Ellipse({ addTo: illo, diameter: 78, stroke: 7, color: c.sun, rotate: { x: TAU / 4 }, translate: { y: -18 } });   /* кольцо */
  new Zdog.Hemisphere({ addTo: illo, diameter: 30, stroke: false, color: c.sun, backface: c.ink, translate: { y: -46 }, rotate: { x: TAU / 4 } });
  new Zdog.Cylinder({ addTo: illo, diameter: 40, length: 12, stroke: false, color: c.ink, backface: c.paper, rotate: { x: TAU / 4 }, translate: { y: 22 } });
  new Zdog.Box({ addTo: illo, width: 64, height: 10, depth: 64, stroke: 3, color: c.ink, topFace: c.paper, translate: { y: 38 } });
}
