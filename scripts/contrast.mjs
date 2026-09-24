// Contraste de los tokens de texto (WCAG AA, 4.5:1) en claro y oscuro y en todas las paletas.
// `npm run contrast` falla si algún par de texto no llega. Los fondos translúcidos (los «soft») se
// mezclan sobre la superficie donde de verdad se usan.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const css = readFileSync("src/styles/tokens.css", "utf8") + readFileSync("src/styles/palettes.css", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<style>${css}</style><body></body>`);
// [texto, fondo, superficie debajo del fondo]
const pairs = [
  ["--nx-foreground", "--nx-card", "--nx-card"],
  ["--nx-muted-foreground", "--nx-sidebar", "--nx-sidebar"],
  ["--nx-text-tertiary", "--nx-sidebar", "--nx-sidebar"],
  ["--nx-text-tertiary", "--nx-canvas", "--nx-canvas"],
  ["--nx-text-tertiary", "--nx-card", "--nx-card"],
  ["--nx-primary-ink", "--nx-card", "--nx-card"],
  ["--nx-primary-ink", "--nx-primary-soft", "--nx-canvas"],
  ["--nx-primary-ink", "--nx-nav-active-bg", "--nx-sidebar"],
  ["--nx-success", "--nx-success-soft", "--nx-canvas"],
  ["--nx-danger", "--nx-danger-soft", "--nx-canvas"],
  ["--nx-primary-foreground", "--nx-primary", "--nx-card"],
  ["--nx-danger-foreground", "--nx-danger", "--nx-card"],
];
const palettes = ["", "oceano", "esmeralda", "bosque", "terracota", "frambuesa", "violeta", "medianoche", "grafito"];
const out = await page.evaluate(({ pairs, palettes }) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const rgb = (c, over) => { ctx.clearRect(0,0,1,1); if (over) { ctx.fillStyle = over; ctx.fillRect(0,0,1,1); } ctx.fillStyle = c; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].slice(0,3); };
  const lum = ([r,g,b]) => { const f = (v) => { v/=255; return v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
  const ratio = (a,b) => { const [x,y] = [lum(a), lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  const res = {};
  for (const theme of ["light", "dark"]) for (const p of palettes) {
    document.documentElement.dataset.theme = theme;
    if (p) document.documentElement.dataset.nxPalette = p; else delete document.documentElement.dataset.nxPalette;
    // Los tokens se resuelven en un elemento real (var(), light-dark()), y el lienzo mezcla la
    // transparencia sobre la tarjeta.
    const probe = document.body.appendChild(document.createElement("i"));
    const resolve = (token) => {
      probe.style.color = `var(${token})`;
      return getComputedStyle(probe).color;
    };
    for (const [fg, bg, base] of pairs) {
      const b = rgb(resolve(bg), resolve(base));
      const f = rgb(resolve(fg), `rgb(${b.join(",")})`);
      const r = ratio(f, b);
      const k = `${fg} / ${bg}`;
      res[k] ??= {};
      res[k][`${theme}${p ? ":" + p : ""}`] = Math.round(r * 100) / 100;
    }
  }
  return res;
}, { pairs, palettes });
let failed = false;
for (const [k, v] of Object.entries(out)) {
  const min = Math.min(...Object.values(v));
  const worst = Object.entries(v).filter(([, x]) => x < 4.5).map(([t, x]) => `${t}=${x}`).join(" ");
  failed ||= min < 4.5;
  console.log(`${min < 4.5 ? "✗" : "✓"} ${k.padEnd(50)} mín ${min.toFixed(2)}  ${worst}`);
}
await browser.close();
if (failed) process.exit(1);
