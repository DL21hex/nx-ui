/**
 * Demo de `<nx-date-range>`: el filtro de un tablero de Ventas con un resumen que reacciona
 * (ventas, pedidos y ticket promedio contra el período de comparación, y la serie por día, semana
 * o mes), frases para probar y el modo con año fiscal en un <form>.
 */
import "./pages/date-range.css";
import { nxFormat } from "../src/core/locale";
import { formatDateRange, rangeDays, type DateRange, type DateRangeChangeDetail, type DateRangeValue, type NxDateRange } from "../src/components/date-range/index";

/** «Hoy» fijo en la demo: los datos de ejemplo llegan hasta aquí. */
export const SALES_TODAY = "2026-09-25";

/** Frases para probar (se escriben en la caja al hacer clic). */
export const DATE_RANGE_PHRASES = ["Q3", "Q3 2025", "últimos 90 días", "el mes pasado", "de marzo a junio", "desde el 15 de marzo", "hasta el 10 de abril", "15/03/2026 - 20/04/2026", "primer semestre", "semana 1 de 2026", "de noviembre a febrero", "2025", "en lo que va del año"];

export interface SalesDay {
  /** Ventas netas del día en COP. */
  sales: number;
  orders: number;
}

const DAY = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Ventas diarias de una fábrica de empaques en Colombia (2024 → hoy): los domingos casi no se
 * factura, diciembre y la temporada escolar suben, y el negocio crece ~11 % al año. Determinístico.
 */
export function salesDays(): Map<string, SalesDay> {
  let seed = 20240101;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = new Map<string, SalesDay>();
  const start = Date.UTC(2024, 0, 1);
  const end = Date.parse(`${SALES_TODAY}T00:00:00Z`);
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    const m = d.getUTCMonth();
    const years = (t - start) / (365 * DAY);
    const week = wd === 0 ? 0.08 : wd === 6 ? 0.45 : 1;
    const season = m === 11 ? 1.38 : m === 0 ? 0.72 : m === 1 || m === 7 ? 1.12 : m === 5 || m === 6 ? 0.94 : 1;
    const orders = Math.round((42 + rnd() * 18) * week * season * (1 + 0.11 * years));
    const ticket = 1_850_000 * (0.85 + rnd() * 0.3) * (1 + 0.04 * years);
    out.set(iso(t), { sales: Math.round((orders * ticket) / 1000) * 1000, orders });
  }
  return out;
}

export interface SalesSummary {
  sales: number;
  orders: number;
  ticket: number;
  /** Días del rango que tienen datos. */
  days: number;
}

/** Totales de un rango (los días sin datos, como el futuro, no suman). */
export function summarize(data: Map<string, SalesDay>, r: DateRange): SalesSummary {
  let sales = 0;
  let orders = 0;
  let days = 0;
  for (let t = Date.parse(`${r.start}T00:00:00Z`), e = Date.parse(`${r.end}T00:00:00Z`); t <= e; t += DAY) {
    const d = data.get(iso(t));
    if (!d) continue;
    sales += d.sales;
    orders += d.orders;
    days++;
  }
  return { sales, orders, ticket: orders ? sales / orders : 0, days };
}

/** La serie del gráfico: por día hasta 45 días, por semanas desde el inicio hasta 200, y por mes después. */
export function salesSeries(data: Map<string, SalesDay>, r: DateRange): { key: string; from: string; to: string; sales: number }[] {
  const n = rangeDays(r);
  const by = n <= 45 ? "day" : n <= 200 ? "week" : "month";
  const out: { key: string; from: string; to: string; sales: number }[] = [];
  const t0 = Date.parse(`${r.start}T00:00:00Z`);
  for (let t = t0, e = Date.parse(`${r.end}T00:00:00Z`); t <= e; t += DAY) {
    const key = by === "day" ? iso(t) : by === "month" ? iso(t).slice(0, 7) : String(Math.floor((t - t0) / (7 * DAY)));
    let b = out[out.length - 1];
    if (!b || b.key !== key) out.push((b = { key, from: iso(t), to: iso(t), sales: 0 }));
    b.to = iso(t);
    b.sales += data.get(iso(t))?.sales ?? 0;
  }
  return out;
}

export function mountDateRangeDemo(root: HTMLElement): void {
  const data = salesDays();
  const fmt = nxFormat("es-CO");
  const money = (n: number, short = false) => fmt.money(n, { currency: "COP" }, short);
  const log = root.querySelector<HTMLOListElement>("#date-range-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  const brief = (v: DateRangeValue | null) => (v ? `${v.start}/${v.end}${v.compare ? ` vs ${v.compare.start}/${v.compare.end}` : ""}${v.label ? ` «${v.label}»` : ""}` : "null");

  // ---------------------------------------------------------------- el filtro de Ventas
  const dr = root.querySelector<NxDateRange>("#dr-sales")!;
  const tiles = root.querySelector<HTMLElement>("#dr-tiles")!;
  const chart = root.querySelector<HTMLElement>("#dr-chart")!;
  const caption = root.querySelector<HTMLElement>("#dr-caption")!;
  const table = root.querySelector<HTMLTableSectionElement>("#dr-table tbody")!;
  const tip = root.querySelector<HTMLElement>("#dr-tip")!;

  const tile = (label: string, value: string, now: number, before: number | null, hint: string) => {
    const el = document.createElement("div");
    el.className = "drg-tile";
    const l = Object.assign(document.createElement("p"), { className: "drg-tile__label", textContent: label });
    const v = Object.assign(document.createElement("p"), { className: "drg-tile__value", textContent: value });
    el.append(l, v);
    const d = document.createElement("p");
    d.className = "drg-tile__delta";
    if (before) {
      const pct = (now - before) / before;
      const up = pct >= 0;
      d.dataset.dir = Math.abs(pct) < 0.005 ? "flat" : up ? "up" : "down";
      const arrow = Object.assign(document.createElement("span"), { className: "drg-tile__arrow", textContent: up ? "▲" : "▼" });
      arrow.setAttribute("aria-hidden", "true");
      const pctText = `${up ? "+" : "−"}${fmt.number(Math.round(Math.abs(pct) * 1000) / 10)} %`;
      d.append(arrow, Object.assign(document.createElement("strong"), { textContent: pctText }), ` ${hint}`);
    } else d.textContent = hint;
    el.append(d);
    return el;
  };

  const render = () => {
    const v = dr.value;
    if (!v) return;
    const now = summarize(data, v);
    const before = v.compare ? summarize(data, v.compare) : null;
    const vs = v.compare ? `vs ${formatDateRange(v.compare, "es-CO")}` : `${fmt.number(now.days)} días con ventas`;
    tiles.replaceChildren(
      tile("Ventas netas", money(now.sales, true), now.sales, before?.sales ?? null, vs),
      tile("Pedidos", fmt.number(now.orders), now.orders, before?.orders ?? null, vs),
      tile("Ticket promedio", money(now.ticket, true), now.ticket, before && before.orders ? before.ticket : null, vs),
    );
    // La serie: columnas de un solo color (el título dice qué es), con la punta redondeada.
    const series = salesSeries(data, v);
    const max = Math.max(1, ...series.map((s) => s.sales));
    const by = rangeDays(v) <= 45 ? "día" : rangeDays(v) <= 200 ? "semana" : "mes";
    caption.textContent = `Ventas por ${by} · ${formatDateRange(v, "es-CO")}`;
    chart.setAttribute("aria-label", `Ventas por ${by}, ${formatDateRange(v, "es-CO")}: máximo ${money(max, true)}. Detalle en la tabla.`);
    chart.style.setProperty("--n", String(series.length));
    chart.replaceChildren(
      ...series.map((s, i) => {
        const b = document.createElement("span");
        b.className = "drg-bar";
        b.dataset.i = String(i);
        b.style.setProperty("--h", `${(s.sales / max) * 100}%`);
        return b;
      }),
    );
    chart.dataset.max = money(max, true);
    const label = (s: (typeof series)[number]) => formatDateRange({ start: s.from, end: s.to }, "es-CO");
    table.replaceChildren(
      ...series.map((s) => {
        const tr = document.createElement("tr");
        tr.append(Object.assign(document.createElement("td"), { textContent: label(s) }), Object.assign(document.createElement("td"), { textContent: money(s.sales) }));
        return tr;
      }),
    );
    // Tooltip por columna (el área de cada columna es toda su franja, no solo la barra).
    chart.onpointermove = (e) => {
      const el = (e.target as Element).closest<HTMLElement>(".drg-bar");
      chart.querySelectorAll("[data-on]").forEach((x) => x.removeAttribute("data-on"));
      if (!el) return void (tip.hidden = true);
      el.dataset.on = "";
      const s = series[Number(el.dataset.i)];
      tip.hidden = false;
      tip.replaceChildren(Object.assign(document.createElement("span"), { textContent: label(s) }), Object.assign(document.createElement("strong"), { textContent: money(s.sales) }));
      const r = el.getBoundingClientRect();
      const box = chart.parentElement!.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(0, r.left - box.left + r.width / 2 - tip.offsetWidth / 2), box.width - tip.offsetWidth)}px`;
    };
    chart.onpointerleave = () => {
      tip.hidden = true;
      chart.querySelectorAll("[data-on]").forEach((x) => x.removeAttribute("data-on"));
    };
  };
  // `nx-change` también lo emite <nx-select> (con otro `detail`): aquí se lee como Event.
  const valueOf = (e: Event) => (e as CustomEvent<DateRangeChangeDetail>).detail.value;
  dr.addEventListener("nx-change", (e: Event) => {
    add(`nx-change → ${brief(valueOf(e))}`);
    render();
  });
  dr.addEventListener("nx-open-change", (e) => add(`nx-open-change → ${(e as CustomEvent<{ open: boolean }>).detail.open}`));
  render();

  // ---------------------------------------------------------------- frases para probar
  const chips = root.querySelector<HTMLElement>("#dr-phrases")!;
  chips.replaceChildren(
    ...DATE_RANGE_PHRASES.map((p) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "drg-chip", textContent: p });
      b.addEventListener("click", () => dr.show(p));
      return b;
    }),
  );

  // ---------------------------------------------------------------- año fiscal en un <form>
  const form = root.querySelector<HTMLFormElement>("#dr-form")!;
  const out = root.querySelector<HTMLElement>("#dr-form-out")!;
  const fiscal = root.querySelector<NxDateRange>("#dr-fiscal")!;
  fiscal.addEventListener("nx-change", (e: Event) => add(`nx-change (fiscal) → ${brief(valueOf(e))}`));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    out.textContent = `FormData: ${[...fd].map(([k, v]) => `${k}=${String(v)}`).join(" · ") || "—"}`;
  });
}
