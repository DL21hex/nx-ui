/**
 * Demo de la ficha lateral: un `<nx-dialog mode="panel">` con su cabecera de ficha y las cuatro
 * piezas de adentro (`<nx-fields>`, `<nx-notice>`, `<nx-tabs>`, `<nx-badge>`), con tres empleados
 * de ejemplo. Editar una sección cambia el pie a Cancelar · Guardar; «Renovar» lleva a la fecha
 * de fin del contrato; «Ver los 12 documentos» y «Registrar novedad» abren otro panel encima.
 * No es parte de la librería.
 */
import "../src/components/dialog/index";
import "../src/components/fields/index";
import "../src/components/notice/index";
import "../src/components/tabs/index";
import "../src/components/badge/index";
import { nxToast, type NxDialog, type NxFields, type NxNotice, type NxTabs, type FieldItem } from "../src/index";

const TODAY = "2026-10-01";
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESL = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ymd = (iso: string) => iso.split("-").map(Number);
const fmt = (iso: string) => {
  const [y, m, d] = ymd(iso);
  return `${d} ${MES[m - 1]} ${y}`;
};
const days = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 864e5);

type Status = "on" | "vac" | "off";
interface Pending {
  t: string;
  m: string;
  acts: { l: string; res: string; primary?: boolean }[];
  done?: string;
}
interface Employee {
  code: string;
  name: string;
  short: string;
  f: boolean;
  role: string;
  status: Status;
  area: string;
  boss: string;
  sede: string;
  updated: string;
  vac: number;
  aus: number;
  ausNote: string;
  start: string;
  notice?: { text: string };
  pend: Pending[];
  d: Record<string, string | number>;
  hist: { w: string; t: string }[];
}

const PEOPLE: Employee[] = [
  {
    code: "EMP-0482", name: "Laura Gómez Restrepo", short: "Laura", f: true, role: "Analista de nómina", status: "on",
    area: "Nómina y compensación", boss: "Andrés Pardo", sede: "Medellín · El Poblado", updated: "Actualizado hoy a las 9:12 por Marcela Ruiz",
    vac: 12, aus: 3, ausNote: "2 incapacidades y 1 permiso", start: "2023-10-13",
    pend: [
      { t: "Permiso el 8 de octubre, medio día", m: "Cita médica · lo pidió hoy", acts: [{ l: "Rechazar", res: "Rechazado" }, { l: "Aprobar", res: "Aprobado", primary: true }] },
      { t: "Otrosí n.º 3, prórroga del contrato", m: "Listo para firmar", acts: [{ l: "Firmar", res: "Firmado", primary: true }] },
    ],
    d: { doc: "CC 1.020.456.789", nac: "1996-03-14", correo: "laura.gomez@acme.co", cel: "300 456 7788", fijo: "", dir: "Cra. 43A #18 Sur-135, apto. 802", ciudad: "Medellín", rh: "O+",
      tipo: "Término fijo", jornada: "Tiempo completo", desde: "2025-10-13", hasta: "2026-10-12", salario: 4850000, centro: "NOM-01",
      banco: "Bancolombia", tipoCta: "Ahorros", cuenta: "•••• 4821", eps: "Sura", pension: "Protección", cesantias: "Porvenir" },
    hist: [
      { w: "Hoy, 9:12", t: "Marcela Ruiz cambió el centro de costo a NOM-01." },
      { w: "28 sep 2026", t: "Se generó un certificado laboral con salario." },
      { w: "13 oct 2025", t: "Se prorrogó el contrato un año (otrosí n.º 2)." },
      { w: "1 mar 2025", t: "Pasó de auxiliar a analista de nómina." },
      { w: "13 oct 2023", t: "Ingresó a la empresa." },
    ],
  },
  {
    code: "EMP-0517", name: "Andrés Pardo Villa", short: "Andrés", f: false, role: "Jefe de nómina", status: "on",
    area: "Nómina y compensación", boss: "Marcela Ruiz", sede: "Medellín · El Poblado", updated: "Actualizado el 22 sep por Marcela Ruiz",
    vac: 4, aus: 0, ausNote: "Ninguna este año", start: "2019-02-11", pend: [],
    d: { doc: "CC 79.884.120", nac: "1984-08-02", correo: "andres.pardo@acme.co", cel: "310 221 9043", fijo: "604 444 1290", dir: "Cl. 10 #32-115, casa 4", ciudad: "Medellín", rh: "A+",
      tipo: "Indefinido", jornada: "Tiempo completo", desde: "2019-02-11", hasta: "", salario: 9200000, centro: "NOM-01",
      banco: "Davivienda", tipoCta: "Corriente", cuenta: "•••• 0937", eps: "Sura", pension: "Porvenir", cesantias: "Protección" },
    hist: [
      { w: "22 sep 2026", t: "Marcela Ruiz actualizó la cuenta bancaria." },
      { w: "1 ene 2026", t: "Aumento salarial del 6 %." },
      { w: "11 feb 2024", t: "Cumplió cinco años en la empresa." },
      { w: "11 feb 2019", t: "Ingresó a la empresa." },
    ],
  },
  {
    code: "EMP-0533", name: "Camila Ortiz Henao", short: "Camila", f: true, role: "Auxiliar contable", status: "vac",
    area: "Contabilidad", boss: "Julián Mesa", sede: "Envigado · Zona Sur", updated: "Actualizado ayer por Julián Mesa",
    notice: { text: "Está de vacaciones hasta el 6 de octubre. Sus aprobaciones pasan a Julián Mesa." },
    vac: 3, aus: 1, ausNote: "1 incapacidad", start: "2022-08-08",
    pend: [{ t: "Certificado laboral con salario", m: "Lo pidió Camila · ayer", acts: [{ l: "Generar", res: "Generado", primary: true }] }],
    d: { doc: "CC 1.152.774.301", nac: "1999-11-27", correo: "camila.ortiz@acme.co", cel: "315 870 2214", fijo: "", dir: "Cl. 37 Sur #27-40", ciudad: "Envigado", rh: "B+",
      tipo: "Indefinido", jornada: "Tiempo completo", desde: "2025-08-08", hasta: "", salario: 2900000, centro: "CON-02",
      banco: "BBVA", tipoCta: "Ahorros", cuenta: "•••• 5560", eps: "Nueva EPS", pension: "Colfondos", cesantias: "Porvenir" },
    hist: [
      { w: "29 sep 2026", t: "Salió a vacaciones por cinco días hábiles." },
      { w: "29 sep 2026", t: "Pidió un certificado laboral con salario." },
      { w: "8 ago 2025", t: "Pasó a contrato a término indefinido." },
      { w: "8 ago 2022", t: "Ingresó a la empresa." },
    ],
  },
];

/** Las secciones de «Datos»: qué campo va en cada lugar y cómo se edita. */
const SECTIONS: Record<string, Omit<FieldItem, "value">[]> = {
  personal: [
    { key: "doc", label: "Documento", readonly: true, copy: true },
    { key: "nac", label: "Fecha de nacimiento", format: "date" },
    { key: "correo", label: "Correo", wide: true, copy: true, input: { type: "email", required: true } },
    { key: "cel", label: "Celular", input: { type: "tel" } },
    { key: "fijo", label: "Teléfono fijo", input: { type: "tel" } },
    { key: "dir", label: "Dirección", wide: true },
    { key: "ciudad", label: "Ciudad" },
    { key: "rh", label: "Grupo sanguíneo", input: { type: "select", options: ["O+", "O−", "A+", "A−", "B+", "B−", "AB+", "AB−"] } },
  ],
  contrato: [
    { key: "tipo", label: "Tipo de contrato", input: { type: "select", required: true, options: ["Término fijo", "Indefinido", "Obra o labor", "Aprendizaje"] } },
    { key: "jornada", label: "Jornada", input: { type: "select", required: true, options: ["Tiempo completo", "Medio tiempo", "Por horas"] } },
    { key: "desde", label: "Desde", format: "date", input: { required: true } },
    { key: "hasta", label: "Hasta", format: "date", input: { hint: "Vacío si es indefinido" } },
    { key: "salario", label: "Salario mensual", format: "money", input: { required: true } },
    { key: "centro", label: "Centro de costo", mono: true },
  ],
  pago: [
    { key: "banco", label: "Banco" },
    { key: "tipoCta", label: "Tipo de cuenta", input: { type: "select", options: ["Ahorros", "Corriente"] } },
    { key: "cuenta", label: "Cuenta", readonly: true, mono: true },
    { key: "eps", label: "EPS" },
    { key: "pension", label: "Fondo de pensiones" },
    { key: "cesantias", label: "Fondo de cesantías" },
  ],
};
const SECTION_NAMES: Record<string, string> = { personal: "Personal", contrato: "Contrato", pago: "Pago y seguridad social" };

const DOCS = [
  { n: "Certificado laboral con salario", g: "Nómina", date: "2026-09-28" },
  { n: "Desprendible de pago, septiembre", g: "Nómina", date: "2026-09-15" },
  { n: "Desprendible de pago, agosto", g: "Nómina", date: "2026-08-30" },
  { n: "Certificado de ingresos y retenciones 2025", g: "Nómina", date: "2026-03-20" },
  { n: "Contrato laboral", g: "Contratación" },
  { n: "Otrosí n.º 2, prórroga", g: "Contratación" },
  { n: "Hoja de vida", g: "Contratación" },
  { n: "Exámenes médicos de ingreso", g: "Contratación" },
  { n: "Afiliación a EPS", g: "Seguridad social" },
  { n: "Afiliación a fondo de pensiones", g: "Seguridad social" },
  { n: "Afiliación a ARL", g: "Seguridad social" },
  { n: "Afiliación a caja de compensación", g: "Seguridad social" },
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function mountDrawerDemo(root: HTMLElement): void {
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const panel = $<NxDialog>("#dw-panel");
  const sum = $<NxFields>("#dw-sum");
  const notice = $<NxNotice>("#dw-notice");
  const tabs = $<NxTabs>("#dw-tabs");
  const sections = [...root.querySelectorAll<NxFields>("#dw-panel nx-fields[data-sec]")];
  const msg = $("#dw-msg");
  const log = $<HTMLOListElement>("#dw-log");
  let idx = 0;
  let editing: NxFields | null = null;
  let msgTimer = 0;

  const add = (text: string) => {
    const li = el("li", undefined, text);
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  const person = () => PEOPLE[idx];
  const status = (p: Employee) => (p.status === "vac" ? ["De vacaciones", "info"] : p.status === "off" ? [p.f ? "Retirada" : "Retirado", "neutral"] : [p.f ? "Activa" : "Activo", "success"]);
  const say = (text = "", ok = false) => {
    clearTimeout(msgTimer);
    msg.textContent = text || (editing ? `Editando ${SECTION_NAMES[editing.dataset.sec!].toLowerCase()}` : person().updated);
    msg.classList.toggle("is-ok", ok);
    if (text) msgTimer = window.setTimeout(() => say(), 4000);
  };
  /** El aviso: el contrato que vence en 30 días o menos, o el que trae el registro. */
  const noticeOf = (p: Employee) => {
    const hasta = String(p.d.hasta || "");
    if (p.d.tipo === "Término fijo" && hasta && days(hasta) >= 0 && days(hasta) <= 30) {
      const [, m, d] = ymd(hasta);
      return { tone: "warning" as const, text: `El contrato a término fijo vence el ${d} de ${MESL[m - 1]}, en ${days(hasta)} días.`, action: "Renovar" };
    }
    return p.notice ? { tone: "info" as const, text: p.notice.text, action: "Ver historial" } : null;
  };

  function paintHead(): void {
    const p = person();
    const [label, tone] = status(p);
    panel.heading = p.name;
    panel.description = `${p.role} · ${p.code}`;
    panel.avatar = p.name;
    panel.badge = label;
    panel.badgeTone = tone as "success";
    panel.nav = editing ? "" : [idx > 0 ? "prev" : "", idx < PEOPLE.length - 1 ? "next" : ""].join(" ").trim();
    panel.actions = [
      { id: "copiar", label: "Copiar código" },
      { id: "pagina", label: "Abrir en página completa" },
      { id: "retirar", label: p.f ? "Retirar empleada" : "Retirar empleado", danger: true },
    ];
  }

  function paintSummary(): void {
    const p = person();
    sum.items = [
      { label: "Área", value: p.area },
      { label: "Jefe directo", value: p.boss },
      { label: "Sede", value: p.sede },
      { label: "Salario", value: p.d.salario, format: "money" },
    ];
    const n = noticeOf(p);
    notice.hidden = !n;
    if (n) {
      notice.tone = n.tone;
      notice.text = n.text;
      notice.action = n.action;
    }
  }

  function paintResumen(): void {
    const p = person();
    const [y0, m0, d0] = ymd(p.start);
    const [y1, m1, d1] = ymd(TODAY);
    const months = (y1 - y0) * 12 + (m1 - m0) - (d1 < d0 ? 1 : 0);
    const kpi = (label: string, value: string, unit: string, note: string) => {
      const c = el("div", "dw-kpi");
      const v = el("div", "dw-kpi__v");
      v.append(el("b", undefined, value), unit);
      c.append(el("div", "dw-kpi__l", label), v, el("div", "dw-kpi__c", note));
      return c;
    };
    const years = Math.floor(months / 12);
    $("#dw-kpis").replaceChildren(
      kpi("Vacaciones disponibles", String(p.vac), "días", "de 15 por año"),
      kpi("Ausencias en 2026", String(p.aus), "", p.ausNote),
      kpi("Antigüedad", String(years), years === 1 ? "año" : "años", `${months % 12 ? `y ${months % 12} ${months % 12 === 1 ? "mes" : "meses"} · ` : ""}desde ${fmt(p.start)}`),
    );
    const open = p.pend.filter((x) => !x.done).length;
    $("#dw-pend-n").textContent = open ? `${open} por resolver` : p.pend.length ? "Todo resuelto" : "";
    const list = $("#dw-pend");
    if (!p.pend.length) return void list.replaceChildren(el("p", "dw-empty", "Nada pendiente por ahora."));
    list.replaceChildren(
      ...p.pend.map((x, i) => {
        const row = el("div", "dw-item");
        const txt = el("div", "dw-item__txt");
        txt.append(el("div", "dw-item__t", x.t), el("div", "dw-item__m", x.m));
        const acts = el("div", "dw-item__a");
        if (x.done) acts.append(el("span", "dw-done", x.done));
        else
          for (const a of x.acts) {
            const b = el("button", `dw-btn${a.primary ? " dw-btn--primary" : ""}`, a.l);
            b.type = "button";
            b.addEventListener("click", () => {
              x.done = a.res;
              p.hist.unshift({ w: "Ahora", t: `${a.res}: ${x.t.toLowerCase()}.` });
              paintResumen();
              paintHist();
            });
            acts.append(b);
          }
        row.dataset.i = String(i);
        row.append(txt, acts);
        return row;
      }),
    );
  }

  function paintDatos(): void {
    const p = person();
    for (const f of sections) f.items = SECTIONS[f.dataset.sec!].map((it) => ({ ...it, value: p.d[it.key!] ?? "" }));
  }

  function paintDocs(): void {
    const row = (d: (typeof DOCS)[number]) => {
      const r = el("div", "dw-item");
      const txt = el("div", "dw-item__txt");
      txt.append(el("div", "dw-item__t", d.n), el("div", "dw-item__m", d.date ? `PDF · ${fmt(d.date)}` : "PDF"));
      r.append(el("span", "dw-file", "PDF"), txt);
      return r;
    };
    $("#dw-docs").replaceChildren(...DOCS.filter((d) => d.date).map(row));
    $("#dw-docs-groups").replaceChildren(
      ...["Nómina", "Contratación", "Seguridad social"].map((g) => {
        const sec = el("div", "dw-sec");
        const h = el("div", "dw-sec__h");
        h.append(el("h3", undefined, g), el("span", "dw-meta", String(DOCS.filter((d) => d.g === g).length)));
        const list = el("div", "dw-list");
        list.append(...DOCS.filter((d) => d.g === g).map(row));
        sec.append(h, list);
        return sec;
      }),
    );
  }

  function paintHist(): void {
    $("#dw-hist").replaceChildren(
      ...person().hist.map((x) => {
        const li = el("li");
        li.append(el("span", "dw-tl__when", x.w), el("span", "dw-tl__what", x.t));
        return li;
      }),
    );
  }

  function paintAll(): void {
    paintHead();
    paintSummary();
    paintResumen();
    paintDatos();
    paintDocs();
    paintHist();
    say();
  }

  function setEditing(f: NxFields | null): void {
    if (editing && f && editing !== f) return;
    if (editing && !f) editing.editing = false;
    editing = f;
    if (f) f.editing = true;
    for (const s of sections) s.action = editing && s !== editing ? "" : "Editar";
    $("#dw-view").hidden = !!editing;
    $("#dw-edit").hidden = !editing;
    panel.dirty = false;
    paintHead();
    say();
  }

  function save(): void {
    if (!editing || !editing.validate()) return;
    const p = person();
    const v = editing.values;
    if (editing.dataset.sec === "contrato" && v.hasta && v.desde && String(v.hasta) < String(v.desde)) {
      editing.errors = { hasta: "Debe ser posterior a «Desde»." };
      editing.focusField("hasta");
      return;
    }
    const name = SECTION_NAMES[editing.dataset.sec!];
    const changed = SECTIONS[editing.dataset.sec!].filter((it) => !it.readonly && (v[it.key!] ?? "") !== (p.d[it.key!] ?? "")).map((it) => `«${it.label}»`);
    for (const [k, val] of Object.entries(v)) if (!SECTIONS[editing.dataset.sec!].find((it) => it.key === k)?.readonly) p.d[k] = val ?? "";
    if (changed.length) p.hist.unshift({ w: "Ahora", t: `Cambiaste ${changed.length > 1 ? `${changed.slice(0, -1).join(", ")} y ${changed[changed.length - 1]}` : changed[0]} en ${name}.` });
    setEditing(null);
    paintSummary();
    paintDatos();
    paintHist();
    say(changed.length ? `${name}: cambios guardados` : "No había cambios", !!changed.length);
  }

  // ---------------------------------------------------------------- eventos

  $("#dw-open").addEventListener("click", () => {
    paintAll();
    void panel.show();
  });
  panel.addEventListener("nx-dialog-nav", (e) => {
    add(`nx-dialog-nav · ${e.detail.dir}`);
    idx = Math.max(0, Math.min(PEOPLE.length - 1, idx + (e.detail.dir === "next" ? 1 : -1)));
    paintAll();
  });
  panel.addEventListener("nx-dialog-action", async (e) => {
    add(`nx-dialog-action · ${e.detail.id}`);
    const p = person();
    if (e.detail.id === "copiar") {
      try {
        await navigator.clipboard.writeText(p.code);
        say(`Se copió ${p.code}`, true);
      } catch {
        say(`El código es ${p.code}`);
      }
    } else if (e.detail.id === "pagina") say("En la app, esto abre la ficha completa en una página");
    else {
      const prev = p.status;
      p.status = "off";
      paintHead();
      if ((await nxToast({ message: `${p.short} quedó ${p.f ? "retirada" : "retirado"}`, undo: true })) === "undo") {
        p.status = prev;
        paintHead();
      }
    }
  });
  panel.addEventListener("nx-dialog-close", () => setEditing(null));
  notice.addEventListener("nx-notice-action", (e) => {
    add(`nx-notice-action · ${e.detail.action}`);
    if (e.detail.action === "Renovar") {
      tabs.value = "datos";
      const contrato = sections.find((s) => s.dataset.sec === "contrato")!;
      setEditing(contrato);
      contrato.focusField("hasta");
    } else tabs.value = "hist";
  });
  tabs.addEventListener("nx-tab-change", (e) => add(`nx-tab-change · ${e.detail.previous} → ${e.detail.value}`));
  for (const f of sections)
    f.addEventListener("nx-fields-action", () => {
      add(`nx-fields-action · ${SECTION_NAMES[f.dataset.sec!]}`);
      setEditing(f);
    });
  $("#dw-cancel").addEventListener("click", () => {
    setEditing(null);
    paintDatos();
  });
  $("#dw-save").addEventListener("click", save);
  $("#dw-cert").addEventListener("click", () => {
    person().hist.unshift({ w: "Ahora", t: "Generaste un certificado laboral con salario." });
    paintHist();
    say("Certificado listo en Documentos", true);
  });
  $("#dw-docs-all").addEventListener("click", () => void $<NxDialog>("#dw-docs-panel").show());

  // Registrar novedad: un formulario hecho con <nx-fields editing>, en otro panel encima.
  const nov = $<NxDialog>("#dw-nov");
  const what = $<NxFields>("#dw-nov-what");
  const more = $<NxFields>("#dw-nov-more");
  const resetNov = () => {
    what.items = [
      { key: "tipo", label: "Tipo de novedad", wide: true, input: { type: "select", required: true, options: ["Horas extra", "Incapacidad", "Licencia remunerada", "Bonificación"] } },
      { key: "desde", label: "Desde", input: { type: "date", required: true } },
      { key: "hasta", label: "Hasta", input: { type: "date", hint: "Vacío si es un solo día" } },
      { key: "cantidad", label: "Cantidad", input: { type: "number", hint: "Horas o días, según el tipo" } },
      { key: "valor", label: "Valor", format: "money", input: { hint: "Opcional" } },
    ];
    more.items = [{ key: "obs", label: "Observaciones", wide: true, input: { type: "textarea", hint: `${person().short} la verá en su desprendible.` } }];
  };
  $("#dw-nov-open").addEventListener("click", () => {
    resetNov();
    void nov.show();
  });
  $("#dw-nov-save").addEventListener("click", () => {
    const ok = what.validate() && more.validate();
    if (!ok) return;
    const v = what.values;
    if (v.hasta && v.desde && String(v.hasta) < String(v.desde)) {
      what.errors = { hasta: "Debe ser igual o posterior a «Desde»." };
      what.focusField("hasta");
      return;
    }
    const tipo = String(v.tipo).toLowerCase();
    person().hist.unshift({ w: "Ahora", t: `Registraste una novedad: ${tipo}, ${fmt(String(v.desde))}${v.hasta && v.hasta !== v.desde ? ` a ${fmt(String(v.hasta))}` : ""}.` });
    nov.dirty = false;
    nov.close("ok");
    paintHist();
    say(`Novedad registrada: ${tipo}`, true);
  });

  // ---------------------------------------------------------------- las piezas, sueltas

  const pSum = $<NxFields>("#dw-p-sum");
  const pFields = $<NxFields>("#dw-p-fields");
  pSum.items = [
    { label: "Código", value: "EMP-0482", mono: true },
    { label: "Ingreso", value: "2023-10-13", format: "date" },
    { label: "Salario", value: 4850000, format: "money" },
  ];
  const contact: FieldItem[] = [
    { key: "correo", label: "Correo", value: "laura.gomez@acme.co", href: "mailto:laura.gomez@acme.co", wide: true, copy: true, input: { type: "email", required: true } },
    { key: "cel", label: "Celular", value: "300 456 7788", input: { type: "tel" } },
    { key: "fijo", label: "Teléfono fijo", value: "", input: { type: "tel" } },
    { key: "doc", label: "Documento", value: "CC 1.020.456.789", readonly: true },
    { key: "ciudad", label: "Ciudad", value: "Medellín", input: { type: "select", options: ["Medellín", "Envigado", "Itagüí", "Bello"] } },
  ];
  pFields.items = contact;
  const pActs = $("#dw-p-acts");
  pFields.addEventListener("nx-fields-action", () => {
    pFields.editing = true;
    pActs.hidden = false;
  });
  $("#dw-p-cancel").addEventListener("click", () => {
    pFields.editing = false;
    pActs.hidden = true;
  });
  $("#dw-p-save").addEventListener("click", () => {
    if (!pFields.validate()) return;
    const v = pFields.values;
    pFields.items = contact.map((it) => ({ ...it, value: v[it.key!] ?? it.value, href: it.key === "correo" ? `mailto:${v.correo}` : it.href }));
    pFields.editing = false;
    pActs.hidden = true;
  });
  for (const n of root.querySelectorAll<NxNotice>(".dw-stack nx-notice")) n.addEventListener("nx-notice-action", (e) => add(`nx-notice-action · ${e.detail.action}`));
}
