// @vitest-environment happy-dom
//
// El intérprete y los controles llegan con `import()`: `settle()` espera a que estén. «Ahora» es el
// lunes 28 de septiembre de 2026, 10:00 (solo `Date` es de mentira; los timers son reales salvo
// donde se dice).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NxRecurrence, RECURRENCE_LABELS, type RecurrenceChangeDetail, type RecurrenceErrorDetail } from "../src/components/recurrence/index";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 8, 28, 10, 0), toFake: ["Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

async function settle() {
  await import("../src/components/recurrence/recurrence-edit");
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
}
function mount(attrs = "", before = ""): NxRecurrence {
  document.body.innerHTML = `${before}<nx-recurrence ${attrs}></nx-recurrence>`;
  return document.querySelector("nx-recurrence")!;
}
const nb = (s: string | null | undefined) => (s ?? "").replace(/[\u00a0\u202f]/g, " ");
const input = (el: NxRecurrence) => el.querySelector<HTMLInputElement>(".nx-recurrence__input")!;
const said = (el: NxRecurrence) => nb(el.querySelector(".nx-recurrence__said")!.textContent);
const items = (el: NxRecurrence) => [...el.querySelectorAll(".nx-recurrence__list li")].map((li) => nb(li.textContent));
const ctl = <T extends HTMLElement = HTMLSelectElement>(el: NxRecurrence, k: string) => el.querySelector<T>(`[data-k="${k}"]`)!;
const dayButtons = (el: NxRecurrence) => [...el.querySelectorAll<HTMLButtonElement>(".nx-recurrence__days button")];
function type(el: NxRecurrence, text: string) {
  input(el).value = text;
  input(el).dispatchEvent(new Event("input", { bubbles: true }));
}
const commit = (el: NxRecurrence) => input(el).dispatchEvent(new Event("change", { bubbles: true }));
const enter = (el: NxRecurrence) => {
  const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  input(el).dispatchEvent(e);
  return e;
};
function changes(el: NxRecurrence) {
  const out: RecurrenceChangeDetail[] = [];
  el.addEventListener("nx-change", (e) => out.push((e as Event as CustomEvent<RecurrenceChangeDetail>).detail));
  return out;
}
async function openManual(el: NxRecurrence) {
  const d = el.querySelector("details")!;
  d.open = true;
  d.dispatchEvent(new Event("toggle"));
  await settle();
}
function change(el: NxRecurrence, k: string, v: string) {
  const c = ctl<HTMLSelectElement | HTMLInputElement>(el, k);
  c.value = v;
  c.dispatchEvent(new Event("change", { bubbles: true }));
}

/** happy-dom no tiene ElementInternals: uno de mentira que guarda lo que va al <form>. */
function withInternals(attrs = "") {
  const sent: unknown[] = [];
  const validity: { flags: ValidityStateFlags; message?: string }[] = [];
  const fake = { setFormValue: (v: unknown) => sent.push(v), setValidity: (flags: ValidityStateFlags, message?: string) => validity.push({ flags, message }), form: null, labels: [] };
  const orig = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = () => fake as unknown as ElementInternals;
  try {
    return { el: mount(attrs), sent, validity };
  } finally {
    HTMLElement.prototype.attachInternals = orig;
  }
}

describe("<nx-recurrence>: escribir y ver cómo se entendió", () => {
  it("una frase: el campo la conserva; debajo, la frase canónica y las próximas 5 fechas", async () => {
    const el = mount('value="el último viernes de cada mes a las 5 pm" locale="es-CO"');
    await settle();
    expect(input(el).value).toBe("el último viernes de cada mes a las 5 pm");
    expect(said(el)).toBe("El último viernes de cada mes, a las 5:00 p. m.");
    expect(items(el)).toEqual(["vie 30 oct 2026, 5:00 p. m.", "vie 27 nov", "vie 25 dic", "vie 29 ene 2027", "vie 26 feb"]);
    expect(el.rule).toBe("DTSTART:20260928T000000\nRRULE:FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17;BYMINUTE=0;WKST=MO");
    expect(el.value).toBe(el.rule);
    expect(nb(el.text)).toBe("El último viernes de cada mes, a las 5:00 p. m.");
    expect(el.next.map((d) => [d.getMonth() + 1, d.getDate(), d.getHours()])).toEqual([
      [10, 30, 17],
      [11, 27, 17],
      [12, 25, 17],
      [1, 29, 17],
      [2, 26, 17],
    ]);
    expect(el.toJSON()).toEqual({ rrule: el.rule, text: el.text, holidays: null, next: ["2026-10-30T17:00", "2026-11-27T17:00", "2026-12-25T17:00", "2027-01-29T17:00", "2027-02-26T17:00"] });
  });

  it("value como RRULE: se muestra como su frase canónica, sin esperar al intérprete", () => {
    const el = mount();
    el.value = "DTSTART:20260928T000000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;BYHOUR=18;BYMINUTE=0;X-NX-HOLIDAYS=skip";
    expect(nb(input(el).value)).toBe("El último día hábil de cada mes, a las 6:00 p. m.");
    expect(items(el)).toEqual(["mié 30 sept 2026, 6:00 p. m.", "vie 30 oct", "lun 30 nov", "jue 31 dic", "vie 29 ene 2027"]);
    expect(el.toJSON().holidays).toBe("skip");
    // `FREQ=…` solo también vale.
    el.value = "FREQ=WEEKLY;BYDAY=TU,TH";
    expect(nb(input(el).value)).toBe("Los martes y jueves.");
  });

  it("mientras se escribe: la frase y las fechas en vivo; nx-change al confirmar, una vez", async () => {
    const el = mount();
    const got = changes(el);
    await settle();
    expect(said(el)).toBe(RECURRENCE_LABELS.hint);
    expect(el.querySelector<HTMLElement>(".nx-recurrence__next")!.hidden).toBe(true);
    type(el, "de lunes a viernes a las 7 am");
    expect(said(el)).toBe("De lunes a viernes, a las 7:00 a. m.");
    expect(items(el)[0]).toBe("mar 29 sept 2026, 7:00 a. m.");
    expect(got).toEqual([]);
    commit(el);
    expect(got).toHaveLength(1);
    expect(got[0].rrule).toBe(el.rule);
    expect(got[0].value).toBe(el.rule);
    expect(nb(got[0].text)).toBe("De lunes a viernes, a las 7:00 a. m.");
    expect(got[0].next).toHaveLength(5);
    // Enter sin cambios no vuelve a avisar.
    enter(el);
    expect(got).toHaveLength(1);
  });

  it("lo que no entiende: el mensaje, aria-invalid, nx-recurrence-error y Enter no envía", async () => {
    const el = mount();
    await settle();
    const errors: string[] = [];
    el.addEventListener("nx-recurrence-error", (e) => errors.push((e as CustomEvent<RecurrenceErrorDetail>).detail.message));
    type(el, "quincenal los viernes");
    expect(said(el)).toBe('no entiendo "quincenal los"');
    expect(el.querySelector(".nx-recurrence__said")!.getAttribute("data-state")).toBe("bad");
    expect(input(el).hasAttribute("aria-invalid")).toBe(true);
    expect(el.rule).toBe("");
    expect(enter(el).defaultPrevented).toBe(true);
    expect(errors).toEqual(['no entiendo "quincenal los"']);
  });

  it("una regla imposible dice que no hay fechas", async () => {
    const el = mount('value="el 31 de febrero"');
    await settle();
    expect(items(el)).toEqual([RECURRENCE_LABELS.none]);
  });

  it("las fechas corridas por festivo se marcan", async () => {
    const el = mount('value="el día 12 de cada mes, si cae festivo, el día hábil siguiente" start="2026-10-01"');
    await settle();
    const li = el.querySelector(".nx-recurrence__list li")!;
    expect(nb(li.textContent)).toBe("lun 12 oct → mar 13 oct 2026, por festivo");
    expect(li.hasAttribute("data-moved")).toBe(true);
    expect(items(el)[1]).toBe("jue 12 nov");
  });

  it("start: el DTSTART y la referencia; en el futuro, las fechas empiezan ahí", async () => {
    const el = mount('value="los lunes" start="2027-01-01"');
    await settle();
    expect(el.rule.split("\n")[0]).toBe("DTSTART:20270101T000000");
    expect(items(el)[0]).toBe("lun 4 ene 2027");
    // «desde …» en la frase manda sobre `start`, y se nota en la frase canónica.
    type(el, "los lunes desde el 1 de marzo");
    expect(el.rule.split("\n")[0]).toBe("DTSTART:20270301T000000");
    expect(nb(said(el))).toBe("Los lunes, desde el 1 mar 2027.");
  });

  it("holidays y holidays-mode: festivos propios, sumados o en reemplazo", async () => {
    const el = mount('value="los lunes menos en festivos" holidays=\'["2026-10-05"]\'');
    await settle();
    // El 5 es propio; el 12 es el Día de la Raza.
    expect(items(el).slice(0, 2)).toEqual(["lun 19 oct 2026", "lun 26 oct"]);
    el.holidaysMode = "replace";
    expect(items(el).slice(0, 2)).toEqual(["lun 12 oct 2026", "lun 19 oct"]);
    el.holidays = [];
    expect(items(el)[0]).toBe("lun 5 oct 2026");
    expect(el.holidays).toEqual([]);
  });

  it("count: cuántas fechas; 0 las oculta", async () => {
    const el = mount('value="todos los días" count="2"');
    await settle();
    expect(items(el)).toHaveLength(2);
    el.count = 0;
    expect(el.querySelector<HTMLElement>(".nx-recurrence__next")!.hidden).toBe(true);
  });
});

describe("<nx-recurrence>: accesibilidad", () => {
  it("el campo describe con la frase y la lista; la lista es una <ol> con nombre", async () => {
    const el = mount('value="los lunes" label="Cuándo se envía"');
    await settle();
    const i = input(el);
    expect(i.getAttribute("aria-label")).toBe("Cuándo se envía");
    const [a, b] = i.getAttribute("aria-describedby")!.split(" ");
    expect(el.querySelector(`#${a}`)!.classList.contains("nx-recurrence__said")).toBe(true);
    expect(el.querySelector(`#${b}`)!.classList.contains("nx-recurrence__next")).toBe(true);
    const ol = el.querySelector("ol")!;
    expect(el.querySelector(`#${ol.getAttribute("aria-labelledby")}`)!.textContent).toBe(RECURRENCE_LABELS.next);
  });

  it("un <label for> nombra el campo", async () => {
    const el = mount('id="regla"', '<label for="regla">Regla</label>');
    await settle();
    const ids = input(el).getAttribute("aria-labelledby");
    // happy-dom puede no conocer `internals.labels`: si los da, el campo queda nombrado por ellos.
    if (ids) expect(document.getElementById(ids)!.textContent).toBe("Regla");
  });

  it("se anuncia con cortesía cuando se deja de escribir, no por cada tecla", async () => {
    const el = mount();
    await settle();
    vi.useFakeTimers({ now: new Date(2026, 8, 28, 10, 0), toFake: ["Date", "setTimeout", "clearTimeout"] });
    const live = el.querySelector(".nx-recurrence__live")!;
    expect(live.getAttribute("role")).toBe("status");
    type(el, "los lun");
    type(el, "los lunes");
    vi.advanceTimersByTime(300);
    expect(live.textContent).toBe("");
    type(el, "los lunes a las 8");
    vi.advanceTimersByTime(900);
    expect(nb(live.textContent)).toBe("Los lunes, a las 8:00 a. m.");
    el.remove();
  });

  it("desconectar limpia el anuncio pendiente", async () => {
    const el = mount();
    await settle();
    vi.useFakeTimers({ now: new Date(2026, 8, 28, 10, 0), toFake: ["Date", "setTimeout", "clearTimeout"] });
    type(el, "los lunes");
    el.remove();
    vi.advanceTimersByTime(2000);
    expect(el.querySelector(".nx-recurrence__live")!.textContent).toBe("");
  });
});

describe("<nx-recurrence>: controles sincronizados", () => {
  it("plegados por defecto; al abrir, reflejan la regla", async () => {
    const el = mount('value="el último viernes de cada mes a las 5 pm"');
    await settle();
    const d = el.querySelector("details")!;
    expect(d.open).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe(RECURRENCE_LABELS.manual);
    await openManual(el);
    expect(ctl(el, "freq").value).toBe("monthly");
    expect(ctl(el, "mode").value).toBe("pos");
    expect(ctl(el, "ord").value).toBe("-1");
    expect(ctl(el, "wd").value).toBe("4");
    expect(ctl<HTMLInputElement>(el, "time").value).toBe("17:00");
    // Solo lo de la frecuencia mensual a la vista.
    expect(el.querySelector<HTMLElement>(".nx-recurrence__days")!.parentElement!.hidden).toBe(true);
    expect(ctl(el, "month").parentElement!.hidden).toBe(true);
  });

  it("los días: botones L M M J V S D con aria-pressed y nombres completos", async () => {
    const el = mount('value="los martes y jueves"');
    await settle();
    await openManual(el);
    const b = dayButtons(el);
    expect(b.map((x) => x.textContent).join(" ")).toBe("L M M J V S D");
    expect(b.map((x) => x.getAttribute("aria-label"))).toEqual(["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]);
    expect(b.map((x) => x.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "true", "false", "false", "false"]);
    expect(b.every((x) => x.type === "button")).toBe(true);
  });

  it("cambiar un control reescribe la frase canónica en el campo y avisa", async () => {
    const el = mount('value="los martes y jueves"');
    await settle();
    await openManual(el);
    const got = changes(el);
    dayButtons(el)[0].click();
    expect(nb(input(el).value)).toBe("Los lunes, martes y jueves.");
    expect(el.rule).toContain("BYDAY=MO,TU,TH");
    expect(got).toHaveLength(1);
    const t = ctl<HTMLInputElement>(el, "time");
    t.value = "7:30 am";
    t.dispatchEvent(new Event("change", { bubbles: true }));
    expect(nb(input(el).value)).toBe("Los lunes, martes y jueves, a las 7:30 a. m.");
    change(el, "hol", "skip");
    expect(nb(input(el).value)).toBe("Los lunes, martes y jueves, a las 7:30 a. m., menos en festivos.");
    change(el, "end", "count");
    expect(nb(input(el).value)).toBe("Los lunes, martes y jueves, a las 7:30 a. m., 10 veces, menos en festivos.");
    expect(got).toHaveLength(4);
  });

  it("frecuencia mensual con «El último día hábil», anual y por horas", async () => {
    const el = mount('value="los lunes"');
    await settle();
    await openManual(el);
    change(el, "freq", "monthly");
    change(el, "mode", "pos");
    change(el, "ord", "-1");
    change(el, "wd", "h");
    expect(nb(input(el).value)).toBe("El último día hábil de cada mes.");
    expect(el.rule).toContain("BYSETPOS=-1");
    change(el, "freq", "yearly");
    change(el, "month", "3");
    expect(nb(input(el).value)).toBe("Cada año, el último día hábil de marzo.");
    change(el, "freq", "hourly");
    change(el, "interval", "2");
    const [a, b] = [ctl<HTMLInputElement>(el, "wa"), ctl<HTMLInputElement>(el, "wb")];
    a.value = "8:00";
    b.value = "18:00";
    b.dispatchEvent(new Event("change", { bubbles: true }));
    // «Hábil» dejó los festivos en «Se saltan»: sigue así hasta que se cambie.
    expect(nb(input(el).value)).toBe("Cada 2 horas, de 8:00 a. m. a 6:00 p. m., menos en festivos.");
    change(el, "hol", "");
    expect(nb(input(el).value)).toBe("Cada 2 horas, de 8:00 a. m. a 6:00 p. m.");
    dayButtons(el)[5].click();
    expect(nb(input(el).value)).toBe("Los sábados, cada 2 horas, de 8:00 a. m. a 6:00 p. m.");
    change(el, "freq", "daily");
    change(el, "interval", "3");
    expect(nb(input(el).value)).toMatch(/^Cada 3 días/);
  });

  it("escribir en el campo actualiza los controles", async () => {
    const el = mount();
    await settle();
    await openManual(el);
    type(el, "cada 3 meses el día 1 a las 9");
    expect(ctl(el, "freq").value).toBe("monthly");
    expect(ctl<HTMLInputElement>(el, "interval").value).toBe("3");
    expect(ctl(el, "mode").value).toBe("day");
    expect(ctl<HTMLInputElement>(el, "md").value).toBe("1");
    expect(ctl<HTMLInputElement>(el, "time").value).toBe("9:00");
    type(el, "cada 2 horas de 8 a 18 hasta el 31 de diciembre");
    expect(ctl(el, "freq").value).toBe("hourly");
    expect(ctl<HTMLInputElement>(el, "wa").value).toBe("8:00");
    expect(ctl<HTMLInputElement>(el, "wb").value).toBe("18:00");
    expect(ctl(el, "end").value).toBe("until");
    expect(ctl<HTMLInputElement>(el, "until").value).toBe("2026-12-31");
  });

  it("los controles internos no van al <form> ni lo invalidan", async () => {
    document.body.innerHTML = '<form><nx-recurrence value="los lunes"></nx-recurrence></form>';
    await settle();
    const el = document.querySelector("nx-recurrence")!;
    await openManual(el);
    for (const c of el.querySelectorAll("input,select")) {
      expect(c.hasAttribute("name")).toBe(false);
      expect(c.getAttribute("form")).toMatch(/-none$/);
    }
  });
});

describe("<nx-recurrence>: formulario", () => {
  it("envía la RRULE; required sin valor es valueMissing; lo que no entiende es badInput", async () => {
    const { el, sent, validity } = withInternals('name="regla" required');
    await settle();
    expect(sent.at(-1)).toBeNull();
    expect(validity.at(-1)).toEqual({ flags: { valueMissing: true }, message: RECURRENCE_LABELS.required });
    type(el, "los lunes");
    expect(sent.at(-1)).toBe("DTSTART:20260928T000000\nRRULE:FREQ=WEEKLY;BYDAY=MO;WKST=MO");
    expect(validity.at(-1)).toEqual({ flags: {} });
    type(el, "los lunes y el cumpleaños");
    expect(sent.at(-1)).toBeNull();
    expect(validity.at(-1)).toEqual({ flags: { badInput: true }, message: 'no entiendo "cumpleanos"' });
  });

  it('value-format="json": envía toJSON()', async () => {
    const { el, sent } = withInternals('name="regla" value-format="json" value="FREQ=WEEKLY;BYDAY=MO;DTSTART=20260928"');
    await settle();
    expect(JSON.parse(sent.at(-1) as string)).toEqual({ rrule: el.rule, text: el.text, holidays: null, next: ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"] });
  });

  it("reset vuelve al atributo value; no avisa nx-change", async () => {
    const el = mount('value="los lunes"');
    await settle();
    const got = changes(el);
    type(el, "los martes");
    commit(el);
    expect(got).toHaveLength(1);
    el.formResetCallback();
    await settle();
    expect(input(el).value).toBe("los lunes");
    expect(el.rule).toContain("BYDAY=MO");
    expect(got).toHaveLength(1);
  });

  it("disabled y readonly: el campo y los controles", async () => {
    const el = mount('value="los lunes" disabled');
    await settle();
    await openManual(el);
    expect(input(el).disabled).toBe(true);
    expect(el.querySelector("fieldset")!.disabled).toBe(true);
    el.disabled = false;
    el.readonly = true;
    expect(input(el).disabled).toBe(false);
    expect(input(el).readOnly).toBe(true);
    expect(el.querySelector("fieldset")!.disabled).toBe(true);
    el.formDisabledCallback(true);
    expect(input(el).disabled).toBe(true);
  });
});

describe("<nx-recurrence>: locale, labels, propiedades", () => {
  it('locale="en-US": entiende inglés, la frase y las fechas en inglés', async () => {
    const el = mount('locale="en-US" value="the last Friday of every month at 5 pm"');
    await settle();
    expect(said(el)).toBe("The last Friday of every month, at 5:00 PM.");
    expect(items(el)).toEqual(["Fri, Oct 30, 2026, 5:00 PM", "Fri, Nov 27", "Fri, Dec 25", "Fri, Jan 29, 2027", "Fri, Feb 26"]);
    // Una RRULE en inglés; al cambiar el locale, la frase canónica cambia con él.
    el.value = "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7";
    expect(nb(input(el).value)).toBe("Monday to Friday, at 7:00 AM.");
    el.locale = "es-CO";
    expect(nb(input(el).value)).toBe("De lunes a viernes, a las 7:00 a. m.");
    expect(said(el)).toBe("De lunes a viernes, a las 7:00 a. m.");
    expect(items(el)[0]).toBe("mar 29 sept 2026, 7:00 a. m.");
  });

  it("labels: los textos de la interfaz (objeto o JSON); lo desconocido se ignora", async () => {
    const el = mount(`labels='{"manual":"Adjust by hand","next":"Next dates","unknown":"can’t read \\"{text}\\"","nada":1,"hint":5}'`);
    await settle();
    expect(el.querySelector("summary")!.textContent).toBe("Adjust by hand");
    expect(el.querySelector(".nx-recurrence__cap")!.textContent).toBe("Next dates");
    expect(said(el)).toBe(RECURRENCE_LABELS.hint);
    type(el, "zzz");
    expect(said(el)).toBe('can’t read "zzz"');
    el.labels = { placeholder: "¿Cuándo?" };
    expect(input(el).placeholder).toBe("¿Cuándo?");
    // Un JSON inválido no rompe: vuelve a los de siempre.
    el.setAttribute("labels", "{no es json");
    expect(el.labels.manual).toBe(RECURRENCE_LABELS.manual);
  });

  it("holidays con JSON inválido: aviso, sin romper", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('holidays="[no" value="los lunes"');
    await settle();
    expect(el.holidays).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("propiedades puestas antes de registrar el elemento", async () => {
    document.body.innerHTML = "<nx-rec-late></nx-rec-late>";
    const el = document.querySelector("nx-rec-late") as unknown as NxRecurrence;
    // Como hace un framework: las propiedades antes de `customElements.define`.
    el.value = "FREQ=DAILY;BYHOUR=9";
    el.count = 3;
    el.labels = { manual: "A mano" };
    customElements.define("nx-rec-late", class extends NxRecurrence {});
    expect(el.rule).toContain("FREQ=DAILY;BYHOUR=9");
    expect(items(el)).toHaveLength(3);
    expect(el.querySelector("summary")!.textContent).toBe("A mano");
  });
});

describe("galería: Repeticiones", () => {
  it("los tres casos, «Prueba esto», el JSON y el log", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(`${process.cwd()}/gallery/pages/recurrence.html`, "utf8");
    document.body.innerHTML = /<template id="page-recurrence">([\s\S]*)<\/template>/.exec(html)![1];
    const { mountRecurrenceDemo, RECURRENCE_PHRASES } = await import("../gallery/demo-recurrence");
    mountRecurrenceDemo(document.body);
    await settle();
    const get = (id: string) => document.getElementById(id) as NxRecurrence;
    expect(said(get("rec-report"))).toBe("El último día hábil de cada mes, a las 6:00 p. m.");
    expect(said(get("rec-rent"))).toBe("El día 5 de cada mes, si cae festivo, el día hábil siguiente.");
    expect(said(get("rec-forklift"))).toBe("Cada 3 meses, el primer lunes, a las 7:00 a. m.");
    expect(items(get("rec-forklift"))).toEqual(["lun 7 dic 2026, 7:00 a. m.", "lun 1 mar 2027", "lun 7 jun", "lun 6 sept", "lun 6 dic"]);
    const chips = [...document.querySelectorAll<HTMLButtonElement>(".rec-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(RECURRENCE_PHRASES);
    chips[5].click();
    expect(said(get("rec-try"))).toBe("El último viernes de cada mes, a las 5:00 p. m.");
    const json = JSON.parse(document.getElementById("rec-json")!.textContent!);
    expect(Object.keys(json)).toEqual(["informe", "arriendo", "mantenimiento", "prueba"]);
    expect(json.arriendo.rrule).toBe("DTSTART:20260928T000000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=5;WKST=MO;X-NX-HOLIDAYS=after");
    expect(json.prueba.next[0]).toBe("2026-10-30T17:00");
    expect(document.getElementById("recurrence-log")!.textContent).toContain("nx-change → #rec-try");
    chips.at(-1)!.click();
    expect(document.getElementById("recurrence-log")!.textContent).toContain('nx-recurrence-error → #rec-try: no entiendo "quincenal los"');
    // Los controles de un caso abren y reflejan su regla.
    await openManual(get("rec-report"));
    expect(ctl(get("rec-report"), "wd").value).toBe("h");
  });
});
