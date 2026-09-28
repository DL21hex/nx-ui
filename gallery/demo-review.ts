/**
 * Demo de `<nx-review>`: la orden de compra OC-2291 a Aceros del Caribe ya cargada (encabezado,
 * condiciones y cinco líneas con cantidad y precio en `<nx-number>`), envuelta en un `<nx-guard>`
 * con la historia de precios de cada ítem. Al guardar se ve el resumen y, al confirmar, el JSON de
 * `changes` que iría a la bitácora. No es parte de la librería.
 */
import "../src/components/review/review.css";
import "../src/components/review/index";
import type { NxReview, ReviewChange, ReviewMode } from "../src/components/review/index";

/** Las líneas como las trae el servidor, con la historia de precios de cada ítem (para nx-guard). */
const LINES = [
  { id: "L-101", desc: "Lámina HR 4×8 cal. 14", qty: 12, price: 1275000, history: [1180000, 1210000, 1195000, 1240000, 1225000, 1260000] },
  { id: "L-102", desc: "Ángulo 2\" × 1/4\" × 6 m", qty: 40, price: 58000, history: [54000, 55500, 56000, 57200, 58000] },
  { id: "L-103", desc: "Tubo cuadrado 2\" cal. 16", qty: 25, price: 85000, history: [79000, 81500, 83000, 84000, 85500] },
  { id: "L-104", desc: "Platina 1\" × 1/8\" × 6 m", qty: 60, price: 32000, history: [29500, 30000, 31000, 31800, 32400] },
  { id: "L-105", desc: "Varilla corrugada 1/2\" × 6 m", qty: 150, price: 24500, history: [22800, 23500, 23900, 24200, 24600] },
];

/** «Prueba esto»: qué hace cada botón. */
const TRIES: { label: string; run: (form: HTMLFormElement) => void }[] = [
  { label: "Aprobar la orden", run: (f) => set(f, "estado", "aprobada") },
  { label: "Mover la entrega 10 días", run: (f) => set(f, "entrega", "2026-10-22") },
  { label: "12.750.000 en la lámina", run: (f) => typeNumber(f, "lineas[0].precio", "12.750.000") },
  { label: "Otra observación", run: (f) => set(f, "observaciones", "Entregar en la portería de Malambo de lunes a sábado, de 7:00 a. m. a 12:00 m. Traer remisión firmada y certificado de calidad de la colada.") },
];

/** Pone un valor como una persona (con `input` y `change`). */
function set(form: HTMLFormElement, name: string, value: string): void {
  const el = form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
/** En un <nx-number>: se teclea en su campo y se sale (así lo ve nx-guard). */
function typeNumber(form: HTMLFormElement, name: string, text: string): void {
  const input = form.querySelector(`[name="${name}"]`)!.querySelector("input")!;
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.blur();
}

let seq = 0;
function lineRow(i: number, l: { id: string; desc: string; qty: number | null; price: number | null; history?: number[] }): HTMLTableRowElement {
  const tr = document.createElement("tr");
  const guard = l.history ? JSON.stringify({ history: l.history, format: "money", currency: "COP" }) : "";
  const n = ++seq;
  tr.innerHTML = `
    <td><input type="hidden" name="lineas[${i}].id" value="${l.id}"><input id="rv-d${n}" name="lineas[${i}].descripcion" aria-label="Descripción" autocomplete="off" placeholder="Descripción del ítem"></td>
    <td class="rv-num"><nx-number name="lineas[${i}].cantidad" label="Cantidad" min="0" ${l.qty === null ? "" : `value="${l.qty}"`}></nx-number></td>
    <td class="rv-num"><nx-number name="lineas[${i}].precio" label="Precio unitario" format="money" currency="COP" min="0" ${l.price === null ? "" : `value="${l.price}"`}></nx-number></td>
    <td><button type="button" class="rv-del" data-rv-del>Quitar</button></td>`;
  tr.querySelector("input[aria-label]")!.setAttribute("value", l.desc);
  if (guard) tr.querySelector(`[name="lineas[${i}].precio"]`)!.setAttribute("data-guard", guard);
  return tr;
}

export function mountReviewDemo(root: HTMLElement): void {
  const review = root.querySelector<NxReview>("#rv-demo")!;
  const form = root.querySelector<HTMLFormElement>("#rv-form")!;
  const body = root.querySelector<HTMLTableSectionElement>("#rv-body")!;
  const log = root.querySelector<HTMLOListElement>("#review-log")!;
  const dirty = root.querySelector<HTMLElement>("#rv-dirty")!;
  const bitacora = root.querySelector<HTMLElement>("#rv-bitacora")!;
  const json = root.querySelector<HTMLElement>("#rv-json")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  // «El servidor» trae la orden: las líneas se pintan y lo cargado es la base.
  let next = LINES.length;
  LINES.forEach((l, i) => body.append(lineRow(i, l)));
  review.snapshot();

  // Cada línea nueva lleva un índice propio (no se reutilizan: las quitadas no se confunden con las nuevas).
  root.querySelector("#rv-add")!.addEventListener("click", () => {
    const tr = lineRow(next++, { id: "", desc: "", qty: null, price: null });
    body.append(tr);
    tr.querySelector<HTMLInputElement>("input[aria-label]")!.focus();
  });
  body.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("[data-rv-del]");
    if (!b) return;
    const tr = b.closest("tr")!;
    // El foco no se pierde: a la fila siguiente (o a «Agregar línea»).
    const to = (tr.nextElementSibling ?? tr.previousElementSibling)?.querySelector<HTMLElement>("[data-rv-del]") ?? root.querySelector<HTMLElement>("#rv-add");
    tr.remove();
    to?.focus();
  });
  // Nombre accesible de cada «Quitar»: «Quitar línea 3 (Tubo cuadrado…)».
  const label = () =>
    body.querySelectorAll("tr").forEach((tr, i) => {
      const d = tr.querySelector<HTMLInputElement>("input[aria-label]")!.value.trim();
      tr.querySelector("[data-rv-del]")!.setAttribute("aria-label", `Quitar línea ${i + 1}${d ? ` (${d})` : ""}`);
    });
  label();
  new MutationObserver(label).observe(body, { childList: true });
  body.addEventListener("change", label);

  const short = (cs: ReviewChange[]) => cs.map((c) => (c.rows ? `${c.label}: ${c.rows.summary}` : c.label)).join(", ");
  review.addEventListener("nx-review-open", (e) => add(`nx-review-open → ${short(e.detail.changes)}`));
  review.addEventListener("nx-review-cancel", () => add("nx-review-cancel → sigue editando"));
  review.addEventListener("nx-review-confirm", (e) => {
    add(`nx-review-confirm → ${e.detail.silent ? "sin resumen" : "confirmado"}: ${short(e.detail.changes)}`);
    json.textContent = JSON.stringify(e.detail.changes, null, 2);
    bitacora.hidden = false;
  });
  review.addEventListener("nx-review-dirty", (e) => {
    const { dirty: d, count } = e.detail;
    dirty.textContent = d ? (count === 1 ? "1 cambio sin guardar" : `${count} cambios sin guardar`) : "Sin cambios";
    dirty.toggleAttribute("data-dirty", d);
    add(`nx-review-dirty → {dirty: ${d}, count: ${count}}`);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const by = (e as SubmitEvent).submitter?.textContent?.trim();
    add(`submit → orden guardada${by ? ` («${by}»)` : ""}`);
  });

  // `review()` a mano: la app usa su propio botón (en `never`, es la única forma de verlo).
  root.querySelector("#rv-manual")!.addEventListener("click", async () => {
    const ok = await review.review();
    add(`review() → ${ok}`);
  });

  for (const r of root.querySelectorAll<HTMLInputElement>("input[name=rv-mode]"))
    r.addEventListener("change", () => {
      if (r.checked) review.mode = r.value as ReviewMode;
    });

  const tries = root.querySelector<HTMLElement>("#rv-try")!;
  for (const t of TRIES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rv-chip";
    b.textContent = t.label;
    b.addEventListener("click", () => {
      t.run(form);
      b.focus();
    });
    tries.append(b);
  }
}
