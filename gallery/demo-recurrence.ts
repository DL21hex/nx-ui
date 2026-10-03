/**
 * Galería: `<nx-recurrence>`. Tres repeticiones de verdad de una empresa (el informe de cartera, el
 * cobro del arriendo de la bodega y el mantenimiento del montacargas), una fila de frases para
 * probar en un campo aparte, el JSON que va al backend y el log de eventos.
 */
import "./pages/recurrence.css";
import "../src/components/recurrence/index";
import type { NxRecurrence, RecurrenceChangeDetail, RecurrenceErrorDetail } from "../src/components/recurrence/index";

/** Frases para probar (se escriben en el campo de prueba al hacer clic). */
export const RECURRENCE_PHRASES = [
  "todos los días a las 7",
  "de lunes a viernes a las 7 am",
  "cada 15 días desde el lunes",
  "cada semana los martes y jueves",
  "los días 5 y 20 de cada mes",
  "el último viernes de cada mes a las 5 pm",
  "el primer lunes hábil del mes",
  "el quinto día hábil de cada mes",
  "cada año el 15 de enero",
  "cada 2 horas de 8 a 18",
  "todos los días hasta el 31 de diciembre",
  "los lunes 10 veces",
  "todos los días menos en festivos",
  "el día 12 de cada mes, si cae festivo, el día hábil anterior",
  "quincenal los viernes",
];

export function mountRecurrenceDemo(root: HTMLElement): void {
  const $ = <T extends Element = NxRecurrence>(sel: string) => root.querySelector<T>(sel)!;
  const cases = [...root.querySelectorAll<NxRecurrence>(".rec-cases nx-recurrence")];
  const tryEl = $("#rec-try");
  const log = $<HTMLOListElement>("#recurrence-log");
  const out = $<HTMLElement>("#rec-json");
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  // Lo que recibiría el backend: el toJSON() de cada campo, por su `name`.
  const paint = () => {
    const body: Record<string, unknown> = {};
    for (const el of [...cases, tryEl]) body[el.name] = el.toJSON();
    out.textContent = JSON.stringify(body, null, 2);
  };
  root.addEventListener("nx-recurrence-change", (e) => {
    const el = e.target as NxRecurrence;
    if (el.localName !== "nx-recurrence") return;
    const d = (e as Event as CustomEvent<RecurrenceChangeDetail>).detail;
    add(`nx-recurrence-change → #${el.id}: ${d.rrule.split("\n")[1]} · «${d.text}»`);
    paint();
  });
  root.addEventListener("nx-recurrence-error", (e) => {
    const el = e.target as NxRecurrence;
    add(`nx-recurrence-error → #${el.id}: ${(e as CustomEvent<RecurrenceErrorDetail>).detail.message}`);
  });
  // La frase de un campo se entiende apenas llega el intérprete (un `import()`): el JSON se pinta
  // al arrancar y otra vez un instante después.
  paint();
  setTimeout(paint, 300);

  const chips = $<HTMLElement>("#rec-phrases");
  const input = () => tryEl.querySelector<HTMLInputElement>("input")!;
  for (const p of RECURRENCE_PHRASES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rec-chip";
    b.textContent = p;
    b.addEventListener("click", () => {
      // Como si se escribiera y se confirmara: `input` para verla en vivo, `change` para el aviso.
      const i = input();
      i.focus();
      i.value = p;
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
      paint();
    });
    chips.append(b);
  }
}
