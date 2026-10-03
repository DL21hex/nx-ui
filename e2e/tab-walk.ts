import type { Page } from "@playwright/test";

/**
 * Recorrer con Tab en navegador real: montar un caso de prueba, simular un navegador sin
 * `reading-flow` y anotar adónde va el foco con cada pulsación (y si el componente evitó el Tab del
 * navegador). Lo usan dialog.spec y tabs.spec.
 */

/** Simula un Chrome sin `reading-flow`: `CSS.supports` lo niega (y `mount` le quita el efecto). */
export async function withoutReadingFlow(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const supports = CSS.supports.bind(CSS);
    CSS.supports = ((a: string, b?: string) => (/reading-flow/.test(a) ? false : b === undefined ? supports(a) : supports(a, b))) as typeof CSS.supports;
  });
}

/** Monta `html` al final de <body> y anota, por cada Tab, si alguien evitó el del navegador. */
export async function mount(page: Page, html: string, noReadingFlow = false): Promise<void> {
  await page.evaluate((h) => {
    const box = document.createElement("div");
    box.id = "fxbox";
    box.innerHTML = h;
    document.body.append(box);
    const w = window as unknown as { prevented: boolean[] };
    w.prevented = [];
    // En `window` y en burbuja: después de los manejadores del documento.
    addEventListener("keydown", (e) => void (e.key === "Tab" && w.prevented.push(e.defaultPrevented)));
  }, html);
  if (noReadingFlow) await page.addStyleTag({ content: "nx-dialog:popover-open, nx-tabs { reading-flow: normal !important; }" });
}

/** El navegador ordena Tab con `reading-flow` (Chrome 137+), sin simular lo contrario. */
export const nativeReadingFlow = (page: Page): Promise<boolean> => page.evaluate(() => CSS.supports("reading-flow", "flex-visual"));

/** Quién tiene el foco: «tab:Etiqueta» (una pestaña), su id, su `data-tool` (la cabecera de
 *  nx-dialog), «x» (cerrar) o la etiqueta con un número propio de ese nodo. */
export const focused = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "body";
    const w = window as unknown as { walkIds?: WeakMap<Element, number>; walkN?: number };
    w.walkIds ??= new WeakMap();
    let k = w.walkIds.get(a);
    if (!k) w.walkIds.set(a, (k = w.walkN = (w.walkN ?? 0) + 1));
    if (a.getAttribute("role") === "tab") return `tab:${a.firstElementChild?.textContent ?? a.textContent}`;
    return a.id || a.getAttribute("data-tool") || (a.classList.contains("nx-dialog__x") ? "x" : `${a.localName}#${k}`);
  });

/** Pulsa Tab (o Mayús+Tab) `n` veces: dónde quedó el foco tras cada una y si se evitó el Tab del navegador. */
export async function walk(page: Page, n: number, back = false): Promise<{ stops: string[]; prevented: boolean[] }> {
  await page.evaluate(() => ((window as unknown as { prevented: boolean[] }).prevented = []));
  const stops: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press(back ? "Shift+Tab" : "Tab");
    stops.push(await focused(page));
  }
  const prevented = await page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented);
  return { stops, prevented };
}

/** Las paradas sin repetir las seguidas (los segmentos de una fecha son varias pulsaciones en el mismo control). */
export const distinct = (stops: string[]): string[] => stops.filter((s, i) => s !== stops[i - 1]);

/** Dónde se evitó el Tab del navegador: la parada a la que llevó el componente. */
export const interceptedAt = (w: { stops: string[]; prevented: boolean[] }): string[] => w.stops.filter((_, i) => w.prevented[i]);
