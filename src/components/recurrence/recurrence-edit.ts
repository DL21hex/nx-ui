/**
 * Lo que `<nx-recurrence>` trae con `import()` cuando hay algo escrito que entender o se abre
 * «Ajustar a mano»: el intérprete (`parse.ts`) y los controles clásicos (frecuencia, cada N, días,
 * del mes, hora, horario, desde, termina, festivos), sincronizados con la regla en los dos sentidos.
 */
import { dayOfISO, ymd } from "../../core/days";
import { hourlyForm, weekdayName, wd } from "./logic";
import { readClock } from "./parse";
import type { RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule } from "./types";

export { parseRecurrence } from "./parse";

/** Lo que los controles necesitan del elemento. */
export interface ManualHost {
  /** El `<details>` de «Ajustar a mano». */
  root: HTMLDetailsElement;
  /** El id del elemento: los controles apuntan a un `form` que no existe. */
  uid: string;
  labels(): RecurrenceLabels;
  locale(): string;
  /** El `start` del elemento (ISO). */
  start(): string;
  /** La regla que salió de los controles. */
  apply(r: RecurrenceRule): void;
}

export interface Manual {
  sync(r: RecurrenceRule): void;
  texts(): void;
  disable(d: boolean): void;
}

const FREQ_UI = ["hourly", "daily", "weekly", "monthly", "yearly"] as const;
const ORDS = [1, 2, 3, 4, -1];
const sel = (k: string, n: number, mode = "") => `<select data-k="${k}"${mode && ` data-mode="${mode}"`}>${"<option></option>".repeat(n)}</select>`;
const inp = (k: string, type = "text", extra = "") => `<input data-k="${k}" type="${type}"${extra}>`;
const num = (k: string, max: number) => inp(k, "number", ` min="1" max="${max}" inputmode="numeric"`);
const row = (t: string, body: string, show = "", tag = "label") => `<${tag}${show && ` data-show="${show}"`}${tag === "div" ? ' role="group"' : ""}><span data-t="${t}"></span>${body}</${tag}>`;
const pair = (s: string) => `<span class="nx-recurrence__pair">${s}</span>`;
// El marcado es constante (sin datos): los textos se ponen con `textContent`.
const MANUAL =
  row("freq", sel("freq", 5)) +
  row("every", pair(`${num("interval", 999)}<span data-u></span>`)) +
  row("days", '<span class="nx-recurrence__days"></span>', "hourly weekly", "div") +
  row("monthDay", pair(sel("mode", 2) + inp("md", "text", ' inputmode="numeric" data-mode="day"') + sel("ord", 5, "pos") + sel("wd", 9, "pos")), "monthly yearly", "div") +
  row("month", sel("month", 12), "yearly") +
  row("time", inp("time"), "daily weekly monthly yearly") +
  row("from", pair(`${inp("wa")}<span data-t="to"></span>${inp("wb")}`), "hourly", "div") +
  row("start", inp("start", "date")) +
  row("end", pair(sel("end", 3) + inp("until", "date") + num("count", 9999) + '<span data-t="times" data-c></span>'), "", "div") +
  row("holidays", sel("hol", 4));

const hhmm = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export function manual(host: ManualHost): Manual {
  const root = host.root;
  const fs = Object.assign(document.createElement("fieldset"), { className: "nx-recurrence__grid", innerHTML: MANUAL });
  root.append(fs);
  const days = fs.querySelector(".nx-recurrence__days")!;
  for (let d = 0; d < 7; d++) days.append(Object.assign(document.createElement("button"), { type: "button", value: String(d) }));
  // Ningún control tiene `name` y todos apuntan a un `form` que no existe: el <form> de la página
  // solo recibe el valor del elemento, y un campo interno no lo invalida.
  for (const el of fs.querySelectorAll("input,select")) el.setAttribute("form", `${host.uid}-none`);
  const q = <T extends HTMLInputElement | HTMLSelectElement = HTMLInputElement>(k: string) => fs.querySelector<T>(`[data-k="${k}"]`)!;
  const g = (k: string) => q(k).value;
  const set = (k: string, v: string | number) => (q(k).value = String(v));
  const buttons = () => [...days.querySelectorAll("button")];

  /** Solo los controles de la frecuencia elegida. */
  const visible = () => {
    const f = g("freq");
    for (const el of fs.querySelectorAll<HTMLElement>("[data-show]")) el.hidden = !el.dataset.show!.split(" ").includes(f);
    for (const el of fs.querySelectorAll<HTMLElement>("[data-mode]")) el.hidden = el.dataset.mode !== g("mode");
    q("until").hidden = g("end") !== "until";
    q("count").hidden = fs.querySelector<HTMLElement>("[data-c]")!.hidden = g("end") !== "count";
    fs.querySelector("[data-u]")!.textContent = host.labels().units.split("|")[FREQ_UI.indexOf(f as (typeof FREQ_UI)[number])] ?? "";
  };

  const texts = () => {
    const L = host.labels();
    const loc = host.locale();
    for (const el of fs.querySelectorAll<HTMLElement>("[data-t]")) el.textContent = L[el.dataset.t as keyof RecurrenceLabels];
    const opts = (k: string, texts: string[], values: (string | number)[] = texts) =>
      q<HTMLSelectElement>(k).querySelectorAll("option").forEach((o, i) => {
        o.textContent = texts[i];
        o.value = String(values[i]);
      });
    const names = [0, 1, 2, 3, 4, 5, 6].map((d) => weekdayName(d, loc));
    const month = new Intl.DateTimeFormat(loc, { month: "long", timeZone: "UTC" });
    opts("freq", FREQ_UI.map((f) => L[f]), [...FREQ_UI]);
    opts("mode", [L.onDay, L.onThe], ["day", "pos"]);
    opts("ord", L.ordinals.split("|"), ORDS);
    opts("wd", [...names, L.day, L.businessDay], [0, 1, 2, 3, 4, 5, 6, "d", "h"]);
    opts("month", Array.from({ length: 12 }, (_, i) => month.format(Date.UTC(2024, i, 1))), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    opts("end", [L.never, L.onDate, L.after], ["", "until", "count"]);
    opts("hol", [L.holidaysIgnore, L.holidaysSkip, L.holidaysBefore, L.holidaysAfter], ["", "skip", "before", "after"]);
    buttons().forEach((b, d) => {
      // «L M M J V S D» a la vista; el nombre completo («lunes») para el lector de pantalla.
      b.textContent = names[d].charAt(0).toUpperCase();
      b.setAttribute("aria-label", names[d]);
    });
    visible();
  };

  /** La regla → los controles. */
  const sync = (r: RecurrenceRule) => {
    const hf = hourlyForm(r);
    const plain = r.byDay.filter((b) => !b.n).map((b) => b.day);
    const ord = r.byDay.find((b) => b.n);
    // «El primer día» es el día 1: se muestra como «El día 1», salvo que se esté eligiendo «El …».
    const md1 = r.byMonthDay.length === 1 && !r.byDay.length && ORDS.includes(r.byMonthDay[0]) ? r.byMonthDay[0] : 0;
    const pos = r.bySetPos.length || ord || md1 < 0 || (md1 && g("mode") === "pos");
    set("freq", hf || r.freq === "HOURLY" ? "hourly" : r.freq.toLowerCase());
    set("interval", hf ? hf[0] : r.interval);
    // Los días de «el último día hábil» no son días de la semana elegidos.
    buttons().forEach((b, d) => b.setAttribute("aria-pressed", String(!r.bySetPos.length && plain.includes(d))));
    set("mode", pos ? "pos" : "day");
    set("md", r.byMonthDay.filter((v) => v > 0).join(", "));
    set("ord", r.bySetPos[0] ?? ord?.n ?? (md1 || 1));
    set("wd", r.bySetPos.length ? (plain.join() === "0,1,2,3,4" ? "h" : plain[0]) : ord ? ord.day : "d");
    set("month", r.byMonth[0] ?? ymd(dayOfISO(r.start)!)[1]);
    set("time", r.byHour.flatMap((h) => r.byMinute.map((m) => hhmm(h * 60 + m))).join(", "));
    set("wa", hhmm(hf ? hf[1] : (r.byHour[0] ?? 8) * 60));
    set("wb", hhmm(hf ? hf[2] : (r.byHour.at(-1) ?? 18) * 60));
    set("start", r.start);
    set("end", r.until ? "until" : r.count ? "count" : "");
    set("until", r.until ?? "");
    set("count", r.count ?? 10);
    set("hol", r.holidays ?? "");
    visible();
  };

  /** Los controles → la regla. */
  const read = (): RecurrenceRule => {
    const f = g("freq");
    const n = Math.min(999, Math.max(1, Math.floor(+g("interval")) || 1));
    const start = dayOfISO(g("start")) === null ? host.start() : g("start");
    const on = buttons()
      .filter((b) => b.getAttribute("aria-pressed") === "true")
      .map((b) => +b.value);
    const byDay = (a: number[]) => a.map((day) => ({ day, n: 0 }));
    const r: RecurrenceRule = { freq: "DAILY", interval: 1, byDay: [], byMonthDay: [], byMonth: [], byHour: [], byMinute: [], bySetPos: [], start, holidays: (g("hol") || undefined) as RecurrenceHolidayMode | undefined };
    let times = readClock(g("time")) ?? [];
    if (f === "hourly") {
      // «Cada N horas de A a B»: las horas van escritas en la regla (ver la frase «cada 2 horas de 8 a 18»).
      const [a = 480, b = 1080] = readClock(`${g("wa")} ${g("wb")}`) ?? [];
      times = [];
      for (let t = a; t <= Math.max(a, b); t += n * 60) times.push(t);
      if (on.length && on.length < 7) (r.freq = "WEEKLY"), (r.byDay = byDay(on));
    } else {
      r.freq = f.toUpperCase() as RecurrenceRule["freq"];
      r.interval = n;
      if (f === "weekly") r.byDay = byDay(on.length ? on : [wd(dayOfISO(start)!)]);
      if (f === "monthly" || f === "yearly") {
        if (g("mode") === "pos") {
          const o = +g("ord") || 1;
          const w = g("wd");
          if (w === "d") r.byMonthDay = [o];
          else if (w === "h") (r.byDay = byDay([0, 1, 2, 3, 4])), (r.bySetPos = [o]), (r.holidays = "skip");
          else r.byDay = [{ day: +w, n: o }];
        } else r.byMonthDay = (g("md").match(/-?\d+/g) ?? []).map(Number).filter((v) => v && v >= -31 && v <= 31);
        if (f === "yearly") r.byMonth = [+g("month")];
      }
    }
    r.byHour = times.map((t) => Math.floor(t / 60));
    r.byMinute = times.map((t) => t % 60);
    if (g("end") === "until" && dayOfISO(g("until")) !== null) r.until = g("until");
    if (g("end") === "count") r.count = Math.max(1, Math.floor(+g("count")) || 1);
    return r;
  };

  days.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("button");
    if (!b) return;
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    host.apply(read());
  });
  fs.addEventListener("change", (e) => {
    e.stopPropagation();
    host.apply(read());
  });
  texts();
  return { sync, texts, disable: (d) => (fs.disabled = d) };
}
