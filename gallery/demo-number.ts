/**
 * Demo de `<nx-number>`: una línea de factura (cantidad × precio − descuento + IVA = total en
 * letras), una tabla de lo que se puede escribir —con el resultado calculado por el mismo
 * intérprete— y los modos (número, monto, porcentaje, en inglés y dentro de un <form>).
 */
import { NUMBER_LABELS, evaluateNumber, formatNumberText, type NumberChangeDetail, type NxNumber } from "../src/components/number/index";

/** Lo que se puede escribir, con el porqué. `base` es el valor anterior (para «+15%»). */
export const NUMBER_EXAMPLES: { text: string; why: string; base?: number }[] = [
  { text: "1.234,5", why: "Formato colombiano: punto de miles, coma decimal." },
  { text: "2,5M", why: "«M», «millón» o «millones»." },
  { text: "3 mil", why: "«mil» o «k»." },
  { text: "4 mm", why: "«mm» son miles de millones en Colombia. Ojo: en finanzas en inglés «MM» es un millón (con locale en-US se lee así)." },
  { text: "=450*3", why: "Una cuenta: empieza con «=»." },
  { text: "=5.820.000/12", why: "Salario anual a mensual." },
  { text: "=(3+2)*1,5k", why: "Paréntesis y sufijos dentro de la cuenta." },
  { text: "+15%", why: "Sobre el valor anterior ($ 1.000.000).", base: 1_000_000 },
  { text: "-10%", why: "Un descuento sobre el valor anterior.", base: 1_000_000 },
  { text: "*12", why: "Multiplica el valor anterior.", base: 1_000_000 },
  { text: "$ 1.450.000,00", why: "Pegado de Excel: el símbolo y los centavos en cero sobran." },
  { text: "USD 1,200.50", why: "Formato en inglés pegado en un campo en español: el último signo es el decimal." },
  { text: "(1.200)", why: "Negativo contable." },
  { text: "1.200-", why: "Negativo al final, como lo exporta SAP." },
  { text: "450*3", why: "Sin «=», pide el «=» (no adivina)." },
  { text: "=2+x", why: "Lo que no entiende, lo dice." },
];

const TRY_BASE = 1_000_000;
const money = { format: "money" as const, currency: "COP", locale: "es-CO" };

export function mountNumberDemo(root: HTMLElement): void {
  const $ = <T extends Element = NxNumber>(sel: string) => root.querySelector<T>(sel)!;
  const log = $<HTMLOListElement>("#number-log");
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  root.addEventListener("nx-change", (e) => {
    const el = e.target as HTMLElement;
    if (el.localName !== "nx-number") return;
    const d = (e as Event as CustomEvent<NumberChangeDetail>).detail;
    add(`nx-change → #${el.id} = ${JSON.stringify(d.value)} («${d.text}»)`);
  });

  // ---------------------------------------------------------------- la línea de factura
  const qty = $("#num-qty");
  const price = $("#num-price");
  const disc = $("#num-disc");
  const iva = $("#num-iva");
  const total = $("#num-total");
  const fmt = (n: number) => formatNumberText(n, money);
  const recalc = () => {
    const sub = (qty.value ?? 0) * (price.value ?? 0);
    const less = Math.round(sub * (disc.value ?? 0));
    const tax = Math.round((sub - less) * (iva.value ?? 0));
    $<HTMLElement>("#num-sub").textContent = fmt(sub);
    $<HTMLElement>("#num-less").textContent = less ? `− ${fmt(less)}` : fmt(0);
    $<HTMLElement>("#num-tax").textContent = fmt(tax);
    total.value = Math.round(sub - less + tax);
  };
  // `input` sale mientras se escribe (solo cuando cambia el número): el total va en vivo.
  for (const el of [qty, price, disc, iva]) el.addEventListener("input", recalc);
  recalc();

  // ---------------------------------------------------------------- lo que se puede escribir
  const tryEl = $("#num-try");
  const tryInput = tryEl.querySelector<HTMLInputElement>("input")!;
  const body = $<HTMLTableSectionElement>("#num-examples");
  for (const ex of NUMBER_EXAMPLES) {
    const r = evaluateNumber(ex.text, { locale: "es-CO", format: "money", base: ex.base ?? null });
    const tr = document.createElement("tr");
    const cell = (child: Node | string, cls = "") => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.append(child);
      tr.append(td);
      return td;
    };
    const code = document.createElement("code");
    code.textContent = ex.text;
    cell(code);
    const out = r.ok ? (r.value === null ? "—" : fmt(r.value)) : NUMBER_LABELS[r.error].replace("{token}", r.token ?? "");
    cell(out, r.ok ? "num-examples__ok" : "num-examples__bad");
    cell(ex.why, "num-examples__why");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dlg-plain num-examples__try";
    b.textContent = "Probar";
    b.setAttribute("aria-label", `Probar «${ex.text}»`);
    b.addEventListener("click", () => {
      // Como si se escribiera: parte de $ 1.000.000 para que las relativas tengan base.
      tryEl.value = TRY_BASE;
      tryInput.focus();
      tryInput.value = ex.text;
      tryInput.dispatchEvent(new Event("input", { bubbles: true }));
      tryInput.setSelectionRange(ex.text.length, ex.text.length);
      tryEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    cell(b);
    body.append(tr);
  }
  $<HTMLButtonElement>("#num-try-reset").addEventListener("click", () => (tryEl.value = TRY_BASE));

  // ---------------------------------------------------------------- en un <form>
  const form = $<HTMLFormElement>("#num-form");
  const out = $<HTMLElement>("#num-form-out");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    out.textContent = `FormData: ${JSON.stringify(Object.fromEntries(new FormData(form)))}`;
    add(`submit → ${out.textContent}`);
  });
  form.addEventListener("reset", () => (out.textContent = "FormData: —"));
}
