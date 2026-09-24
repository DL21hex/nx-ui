import "../src/styles/nx-ui.css";
import "../src/styles/palettes.css";
import "./gallery.css";
import { render, type BduiNode } from "../src/bdui";
import { lucide } from "../src/icons/index";
import { registerIcons, type CaptureSchemaItem, type MenuItem, type NxAiAnswer, type NxButton, type NxDialog, type NxDocCapture, type GridRow, type NxGrid, type NxSelect, applyFilters, nxConfirm, nxToast, type NxSidemenu, type RunContext } from "../src/index";
import { DEMO_ITEMS, EMPLOYEE_FIELDS, EMPLOYEES } from "./demo-data";
import { PURCHASE_COLUMNS, purchaseRows } from "./demo-grid";
import { HR_COLUMNS, HR_INBOX, TODAY, hrEmployees } from "./demo-hr";

registerIcons(lucide);

// ---------------------------------------------------------------- tema de la galería

const THEME_KEY = "nx-ui-gallery-theme";
function applyTheme(theme: string) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-theme-set]")) {
    b.setAttribute("aria-pressed", String(b.dataset.themeSet === (theme || "auto")));
  }
}
function storedTheme(): string {
  try {
    return localStorage.getItem(THEME_KEY) ?? "auto";
  } catch {
    return "auto";
  }
}
applyTheme(storedTheme());
document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("[data-theme-set]");
  if (!b) return;
  applyTheme(b.dataset.themeSet!);
  try {
    localStorage.setItem(THEME_KEY, b.dataset.themeSet!);
  } catch {
    /* sin almacenamiento: el tema dura lo que la visita */
  }
});

// ---------------------------------------------------------------- paleta de la galería

const PALETTE_KEY = "nx-ui-gallery-palette";
const PALETTES = [
  { id: "indigo", name: "Índigo", desc: "La de siempre: azul eléctrico sobre grises fríos." },
  { id: "oceano", name: "Océano", desc: "Azul profundo y grises con un toque de mar." },
  { id: "esmeralda", name: "Esmeralda", desc: "Verde joya, fresco y sereno." },
  { id: "bosque", name: "Bosque", desc: "Verde musgo sobre grises salvia." },
  { id: "terracota", name: "Terracota", desc: "Arcilla cálida sobre piedra." },
  { id: "frambuesa", name: "Frambuesa", desc: "Rosa intenso, con carácter." },
  { id: "violeta", name: "Violeta", desc: "Púrpura vibrante y creativo." },
  { id: "medianoche", name: "Medianoche", desc: "Azul marino sobrio, casi corporativo." },
  { id: "grafito", name: "Grafito", desc: "Monocromo: todo el color lo pone el contenido." },
];
function applyPalette(id: string) {
  if (id && id !== "indigo") document.documentElement.dataset.nxPalette = id;
  else delete document.documentElement.dataset.nxPalette;
}
function storedPalette(): string {
  try {
    return localStorage.getItem(PALETTE_KEY) ?? "indigo";
  } catch {
    return "indigo";
  }
}
applyPalette(storedPalette());

// ---------------------------------------------------------------- navegación (dogfooding)

const nav = document.querySelector<NxSidemenu>("#nav")!;
const NAV: MenuItem[] = [
  { id: "intro", label: "Introducción", href: "#/", icon: "house", section: "Empezar" },
  { id: "temas", label: "Temas y tokens", href: "#/temas", icon: "layout-dashboard", section: "Empezar" },
  { id: "sidemenu", label: "SideMenu", href: "#/sidemenu", icon: "clipboard-list", section: "Componentes" },
  { id: "button", label: "Button", href: "#/button", icon: "inbox", section: "Componentes" },
  { id: "select", label: "Select", href: "#/select", icon: "users", section: "Componentes" },
  { id: "ai", label: "IA", href: "#/ai", icon: "circle-help", section: "Componentes" },
  { id: "capture", label: "Captura", href: "#/capture", icon: "receipt", section: "Componentes" },
  { id: "grid", label: "Tabla", href: "#/grid", icon: "chart-column", section: "Componentes" },
  { id: "dialog", label: "Diálogos", href: "#/dialog", icon: "layout-dashboard", section: "Componentes" },
  { id: "th", label: "Directorio de TH", href: "#/th", icon: "users", section: "Ejemplos", badge: "Nuevo" },
];
nav.items = NAV;

const PAGES: Record<string, { template: string; mount?: (root: HTMLElement) => void }> = {
  "#/": { template: "page-intro" },
  "#/temas": { template: "page-temas", mount: mountTokens },
  "#/sidemenu": { template: "page-sidemenu", mount: mountSidemenuDemo },
  "#/button": { template: "page-button", mount: mountButtonDemo },
  "#/select": { template: "page-select", mount: mountSelectDemo },
  "#/ai": { template: "page-ai", mount: mountAiDemo },
  "#/capture": { template: "page-capture", mount: mountCaptureDemo },
  "#/grid": { template: "page-grid", mount: mountGridDemo },
  "#/dialog": { template: "page-dialog", mount: mountDialogDemo },
  "#/th": { template: "page-th", mount: mountHrDemo },
};

const page = document.querySelector<HTMLElement>("#page")!;
function route() {
  const hash = PAGES[location.hash] ? location.hash : "#/";
  const def = PAGES[hash];
  const tpl = document.getElementById(def.template) as HTMLTemplateElement;
  page.replaceChildren(tpl.content.cloneNode(true));
  nav.active = hash;
  wireTabs(page);
  def.mount?.(page);
  page.scrollTop = 0;
  document.title = `nx-ui · ${NAV.find((n) => n.href === hash)?.label ?? "Galería"}`;
}
addEventListener("hashchange", () => {
  route();
  page.focus({ preventScroll: true });
});
route();

// ---------------------------------------------------------------- pestañas de código

function wireTabs(root: HTMLElement) {
  for (const box of root.querySelectorAll<HTMLElement>("[data-tabs]")) {
    const tabs = [...box.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const panels = [...box.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    tabs.forEach((tab, i) =>
      tab.addEventListener("click", () => {
        tabs.forEach((t, j) => t.setAttribute("aria-selected", String(i === j)));
        panels.forEach((p, j) => (p.hidden = i !== j));
      }),
    );
  }
}

// ---------------------------------------------------------------- página de tokens

function mountTokens(root: HTMLElement) {
  mountPalettes(root);
  const names = [
    "--nx-canvas", "--nx-sidebar", "--nx-card", "--nx-popover",
    "--nx-border-subtle", "--nx-border", "--nx-border-strong",
    "--nx-foreground", "--nx-muted-foreground", "--nx-text-tertiary", "--nx-text-quaternary",
    "--nx-primary", "--nx-primary-soft", "--nx-primary-border",
    "--nx-hover", "--nx-nav-active-bg", "--nx-ring", "--nx-backdrop",
  ];
  const box = root.querySelector("#swatches")!;
  for (const name of names) {
    const chip = document.createElement("div");
    chip.className = "swatch";
    const color = document.createElement("span");
    color.className = "swatch__color";
    color.style.background = `var(${name})`;
    const label = document.createElement("code");
    label.textContent = name;
    chip.append(color, label);
    box.append(chip);
  }
  const picker = root.querySelector<HTMLInputElement>("#primary-picker")!;
  const setPrimary = (v: string | null) => {
    const s = document.documentElement.style;
    for (const [prop, mix] of [
      ["--nx-primary", ""],
      ["--nx-primary-soft", "12%"],
      ["--nx-primary-border", "40%"],
      ["--nx-nav-active-bg", "10%"],
      ["--nx-ring", "60%"],
    ]) {
      if (!v) s.removeProperty(prop);
      else s.setProperty(prop, mix ? `color-mix(in oklch, ${v} ${mix}, transparent)` : v);
    }
  };
  picker.addEventListener("input", () => setPrimary(picker.value));
  // Elegir una paleta quita el acento a mano (si no, lo taparía).
  root.addEventListener("nx-palette", () => setPrimary(null));
  root.querySelector("#primary-reset")!.addEventListener("click", () => setPrimary(null));
}

// ---------------------------------------------------------------- demo del SideMenu

function mountSidemenuDemo(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>("#stage")!;
  const slot = root.querySelector<HTMLElement>("#stage-menu")!;
  const pathEl = root.querySelector<HTMLElement>("#stage-path")!;
  const log = root.querySelector<HTMLOListElement>("#stage-log")!;
  const textarea = root.querySelector<HTMLTextAreaElement>("#payload")!;
  const error = root.querySelector<HTMLElement>("#payload-error")!;

  let payload: BduiNode = {
    component: "SideMenu",
    props: { active: "/ventas/pedidos", collapsible: true, autoCollapse: true, collapsed: false, items: DEMO_ITEMS },
  };

  const menu = () => slot.querySelector<NxSidemenu>("nx-sidemenu");
  const burger = root.querySelector<HTMLButtonElement>("#stage-burger")!;

  /** Refleja el payload en el JSON, la ruta y los controles (sin volver a pintar el menú). */
  const sync = () => {
    textarea.value = JSON.stringify(payload, null, 2);
    pathEl.textContent = String(payload.props?.active ?? "—");
    for (const input of root.querySelectorAll<HTMLInputElement>("[data-ctl]")) {
      if (input.dataset.ctl !== "rtl") input.checked = !!payload.props?.[input.dataset.ctl!];
    }
  };
  /** Pinta desde cero con el adaptador BDUI. */
  const paint = () => {
    render(payload, slot);
    // La hamburguesa abre el drawer de forma nativa (popovertarget), sin JS.
    burger.popoverTargetElement = menu();
  };
  /** Cambia una prop: en el payload y en el elemento vivo (así se anima y no pierde el foco). */
  const setProp = (key: string, value: unknown) => {
    payload = { ...payload, props: { ...payload.props, [key]: value } };
    const el = menu() as unknown as Record<string, unknown> | null;
    if (el) el[key] = value;
    sync();
  };
  const addLog = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  // Los eventos burbujean hasta el contenedor, así sobreviven a cada `render`.
  slot.addEventListener("nx-select", (e) => {
    // En la demo nada navega de verdad: la app decide (es justo para lo que sirve cancelar).
    e.preventDefault();
    addLog(`nx-select → ${e.detail.item.label} (${e.detail.href})`);
    setProp("active", e.detail.href);
  });
  slot.addEventListener("nx-toggle", (e) => {
    addLog(`nx-toggle → collapsed: ${e.detail.collapsed}${e.detail.auto ? " (auto)" : ""}`);
    // Sin cancelar: el elemento ya aplica el cambio; aquí solo se refleja en el payload.
    payload = { ...payload, props: { ...payload.props, collapsed: e.detail.collapsed } };
    sync();
  });
  slot.addEventListener("nx-open-change", (e) => addLog(`nx-open-change → open: ${e.detail.open}`));

  for (const input of root.querySelectorAll<HTMLInputElement>("[data-ctl]")) {
    input.addEventListener("change", () => {
      if (input.dataset.ctl === "rtl") stage.dir = input.checked ? "rtl" : "ltr";
      else setProp(input.dataset.ctl!, input.checked);
    });
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-stage-theme]")) {
    b.addEventListener("click", () => {
      const t = b.dataset.stageTheme!;
      if (t) stage.dataset.theme = t;
      else delete stage.dataset.theme;
      for (const o of root.querySelectorAll("[data-stage-theme]")) o.setAttribute("aria-pressed", String(o === b));
    });
  }

  let timer = 0;
  textarea.addEventListener("input", () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const next = JSON.parse(textarea.value) as BduiNode;
        if (!next || typeof next !== "object" || typeof next.component !== "string") throw new Error("Falta \"component\"");
        payload = next;
        error.hidden = true;
        paint();
        pathEl.textContent = String(payload.props?.active ?? "—");
      } catch (err) {
        error.textContent = `JSON inválido: ${(err as Error).message}`;
        error.hidden = false;
      }
    }, 300);
  });

  paint();
  sync();
}

// ---------------------------------------------------------------- demo del Button

function mountButtonDemo(root: HTMLElement) {
  const fail = root.querySelector<HTMLInputElement>("#btn-fail")!;
  const events = root.querySelector<HTMLOListElement>("#btn-log")!;
  const STEPS = ["Validando campos obligatorios", "Generando PDF · 3 páginas", "Subiendo a R2 · 412 KB", "Notificando a 4 aprobadores", "Registrando auditoría"];
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms + Math.random() * 400));

  /** Una tarea simulada: pasos con pausas; con el interruptor, falla en el paso 4. */
  const task = async ({ log, progress }: RunContext) => {
    for (let i = 0; i < STEPS.length; i++) {
      log(STEPS[i]);
      progress(i / STEPS.length);
      await wait(650);
      if (fail.checked && i === 3) throw new Error("SMTP 421 · reintenta en 30 s");
    }
    progress(1);
  };

  for (const id of ["demo-ticker", "demo-inline"]) {
    const b = root.querySelector<NxButton>(`#${id}`)!;
    b.addEventListener("click", () => void b.run(task));
  }
  const none = root.querySelector<NxButton>("#demo-none")!;
  none.addEventListener("click", () => void none.run(() => wait(1200)));

  // El de stream no lleva JS: solo se le cambia la URL según el interruptor de error.
  const stream = root.querySelector<NxButton>("#demo-stream")!;
  const syncStream = () => (stream.stream = fail.checked ? "/demo/stream?fail=1" : "/demo/stream");
  fail.addEventListener("change", syncStream);
  syncStream();

  root.addEventListener("nx-done", (e) => {
    const li = document.createElement("li");
    const { ok, ms, lines } = e.detail;
    li.textContent = `nx-done → #${(e.target as HTMLElement).id} ok: ${ok} · ${Math.round(ms)} ms · ${lines.length} líneas`;
    events.prepend(li);
    while (events.children.length > 5) events.lastElementChild!.remove();
  });
}

// ---------------------------------------------------------------- demo del Select

function mountSelectDemo(root: HTMLElement) {
  // Los locales filtran los 180 en el navegador; el de servidor pide cada búsqueda a /demo/empleados.
  const local = EMPLOYEES;
  for (const id of ["sel-single", "sel-multi", "sel-form-field"]) {
    const s = root.querySelector<NxSelect>(`#${id}`)!;
    s.fields = EMPLOYEE_FIELDS;
    s.options = local;
  }
  root.querySelector<NxSelect>("#sel-remote")!.fields = EMPLOYEE_FIELDS;

  const log = root.querySelector<HTMLOListElement>("#sel-log")!;
  root.addEventListener("nx-change", (e) => {
    const li = document.createElement("li");
    const names = e.detail.options.map((o) => o.nombre).join(", ") || "—";
    li.textContent = `nx-change → #${(e.target as HTMLElement).id} value: ${JSON.stringify(e.detail.value)} · ${names}`;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  });

  const form = root.querySelector<HTMLFormElement>("#sel-form")!;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    root.querySelector("#sel-form-out")!.textContent = `FormData: ${JSON.stringify(Object.fromEntries(new FormData(form)))}`;
  });
}

// ---------------------------------------------------------------- demo de IA

function mountAiDemo(root: HTMLElement) {
  const ai = root.querySelector<NxAiAnswer>("#ai-demo")!;
  ai.suggestions = ["¿Qué proveedores se retrasaron este mes?", "¿Por qué subió el costo de producción en agosto?", "Provoca un error"];
  ai.context = { pantalla: "galería" };
  const log = root.querySelector<HTMLOListElement>("#ai-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  ai.addEventListener("nx-ai-start", (e) => add(`nx-ai-start → «${e.detail.question}»`));
  ai.addEventListener("nx-ai-done", (e) => add(`nx-ai-done → ${e.detail.status} · ${e.detail.sources.length} fuentes · ${e.detail.text.length} caracteres`));
  ai.addEventListener("nx-ai-action", (e) => add(`nx-ai-action → ${e.detail.id} ${JSON.stringify(e.detail.data)}`));
  ai.addEventListener("nx-ai-feedback", (e) => add(`nx-ai-feedback → ${e.detail.value}`));
}

/**
 * La lista de paletas. Cada opción lleva su propio `data-nx-palette`, así que sus muestras se
 * pintan con los colores de ESA paleta (y del tema actual), sin calcular nada aquí.
 */
function mountPalettes(root: HTMLElement) {
  const box = root.querySelector<HTMLElement>("#palettes")!;
  const current = () => document.documentElement.dataset.nxPalette ?? "indigo";
  const render = () => {
    box.replaceChildren(
      ...PALETTES.map((p) => {
        const opt = document.createElement("button");
        opt.type = "button";
        opt.className = "palette";
        opt.dataset.nxPalette = p.id;
        opt.setAttribute("role", "radio");
        opt.setAttribute("aria-checked", String(p.id === current()));
        opt.innerHTML = `
          <span class="palette__swatches" aria-hidden="true">
            <span style="background: var(--nx-primary)"></span>
            <span style="background: var(--nx-nav-active-bg)"></span>
            <span style="background: var(--nx-sidebar)"></span>
            <span style="background: var(--nx-muted-foreground)"></span>
            <span style="background: var(--nx-foreground)"></span>
          </span>
          <span class="palette__text"><span class="palette__name"></span><span class="palette__desc"></span></span>
          <span class="palette__preview" aria-hidden="true">
            <span class="palette__nav"><i></i>Inicio</span>
            <span class="palette__btn">Guardar</span>
          </span>`;
        opt.querySelector(".palette__name")!.textContent = p.name;
        opt.querySelector(".palette__desc")!.textContent = p.desc;
        return opt;
      }),
    );
  };
  render();
  box.addEventListener("click", (e) => {
    const opt = (e.target as Element).closest<HTMLElement>(".palette");
    if (!opt) return;
    const id = opt.dataset.nxPalette!;
    applyPalette(id);
    try {
      localStorage.setItem(PALETTE_KEY, id);
    } catch {
      /* sin almacenamiento: dura lo que la visita */
    }
    root.dispatchEvent(new Event("nx-palette"));
    for (const o of box.querySelectorAll(".palette")) o.setAttribute("aria-checked", String(o === opt));
  });
  // Flechas dentro del grupo, como un radiogroup.
  box.addEventListener("keydown", (e) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft"].includes(e.key)) return;
    const opts = [...box.querySelectorAll<HTMLElement>(".palette")];
    const i = opts.indexOf(document.activeElement as HTMLElement);
    const next = opts[(i + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) + opts.length) % opts.length];
    e.preventDefault();
    next.focus();
    next.click();
  });
}

// ---------------------------------------------------------------- demo de captura


function mountCaptureDemo(root: HTMLElement) {
  // Dentro de la función: `route()` corre al cargar el módulo, antes de las constantes de abajo.
  const INVOICE_SCHEMA: CaptureSchemaItem[] = [
    { key: "prov", label: "Proveedor", section: "Encabezado" },
    { key: "nit", label: "NIT", section: "Encabezado" },
    { key: "num", label: "Nº factura", section: "Encabezado" },
    { key: "fecha", label: "Fecha", type: "date", section: "Encabezado" },
    { key: "vence", label: "Vence", type: "date", section: "Encabezado" },
    { key: "oc", label: "Orden de compra", section: "Encabezado" },
    {
      key: "items",
      label: "Ítems",
      type: "table",
      section: "Detalle",
      columns: [
        { key: "desc", label: "Descripción" },
        { key: "cantidad", label: "Cant.", type: "number" },
        { key: "unitario", label: "V. unit.", type: "money" },
        { key: "total", label: "Total", type: "money" },
      ],
    },
    { key: "subtotal", label: "Subtotal", type: "money", section: "Totales" },
    { key: "iva", label: "IVA 19 %", type: "money", section: "Totales" },
    { key: "total", label: "Total", type: "money", section: "Totales" },
  ];
  const cap = root.querySelector<NxDocCapture>("#cap-demo")!;
  cap.schema = INVOICE_SCHEMA;
  const sample = root.querySelector<NxButton>("#cap-sample")!;
  // El botón solo espera la descarga del ejemplo; el avance de la lectura lo muestra el componente.
  sample.addEventListener("click", () =>
    void sample.run(async () => {
      const blob = await (await fetch("/demo/capture/factura.svg")).blob();
      void cap.extract(new File([blob], "factura_aceros_sep.pdf", { type: "application/pdf" }));
    }),
  );
  const log = root.querySelector<HTMLOListElement>("#cap-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  cap.addEventListener("nx-capture-start", (e) => add(`nx-capture-start → ${e.detail.fileName}`));
  cap.addEventListener("nx-capture-done", (e) => add(`nx-capture-done → por revisar: ${e.detail.pending.join(", ") || "nada"}`));
  cap.addEventListener("nx-capture-change", (e) => add(`nx-capture-change → ${e.detail.key} = ${e.detail.value}`));
  cap.addEventListener("nx-capture-submit", (e) => add(`nx-capture-submit → ${Object.keys(e.detail.values).length} campos · confirmados: ${e.detail.confirmed.join(", ")}`));
}

// ---------------------------------------------------------------- demo de la tabla

function mountGridDemo(root: HTMLElement) {
  const grid = root.querySelector<NxGrid>("#grid-demo")!;
  grid.columns = PURCHASE_COLUMNS;
  grid.rows = purchaseRows(600);
  // Cliente (600 filas en el navegador) o servidor (20.000 filas, por bloques).
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-grid-mode]")) {
    b.addEventListener("click", () => {
      root.querySelectorAll("[data-grid-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      grid.filters = [];
      if (b.dataset.gridMode === "server") grid.source = "/demo/grid/rows";
      else {
        grid.source = null;
        grid.rows = purchaseRows(600);
      }
    });
  }
  const loc = root.querySelector<HTMLSelectElement>(".grid-locale")!;
  loc.addEventListener("change", () => (grid.locale = loc.value));
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-grid-ask]")) b.addEventListener("click", () => void grid.ask(b.textContent ?? ""));
  const log = root.querySelector<HTMLOListElement>("#grid-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  grid.addEventListener("nx-grid-filter", (e) => add(`nx-grid-filter → ${e.detail.count} filas · ${JSON.stringify(e.detail.filters)}${e.detail.sort ? ` · orden ${e.detail.sort.key} ${e.detail.sort.dir}` : ""}${e.detail.groupBy ? ` · grupo ${e.detail.groupBy}` : ""}`));
  grid.addEventListener("nx-grid-change", (e) => add(`nx-grid-change → ${e.detail.changes.map((c) => `${c.id}.${c.key} = ${JSON.stringify(c.value)}`).join(", ")}`));
  grid.addEventListener("nx-grid-columns", (e) => add(`nx-grid-columns → ${e.detail.columns.map((c) => c.key).join(", ")}`));
}

// ---------------------------------------------------------------- demo de diálogos

function mountDialogDemo(root: HTMLElement) {
  const log = root.querySelector<HTMLOListElement>("#dlg-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids);
    return n;
  };

  // A · el modal que nace del botón.
  const nuevo = root.querySelector<NxDialog>("#dlg-new")!;
  root.querySelector("#dlg-new-btn")!.addEventListener("click", async (e) => {
    const v = await nuevo.show(e.currentTarget as Element);
    add(`nuevo.show() → ${v ?? "(sin valor)"}`);
  });
  const save = root.querySelector<NxButton>("#dlg-new-save")!;
  save.addEventListener("click", () =>
    void save.run(async ({ log: l }) => {
      l("Validando el pedido");
      await new Promise((r) => setTimeout(r, 700));
      l("Enviando a aprobación");
      await new Promise((r) => setTimeout(r, 600));
      nuevo.dirty = false;
      nuevo.close("guardado");
      (root.querySelector("#dlg-new-form") as HTMLFormElement).reset();
      void nxToast({ message: "Pedido OC-2402 creado y enviado a aprobación", tone: "success" });
    }),
  );
  nuevo.addEventListener("nx-dialog-close", (e) => add(`nx-dialog-close → ${e.detail.reason}`));

  // B · paneles apilados.
  const ORDERS = [
    { oc: "OC-2291", prov: "Aceros del Caribe", monto: "$ 10.829.000", estado: "Recibido" },
    { oc: "OC-2310", prov: "Empaques Andinos", monto: "$ 1.450.000", estado: "Pendiente" },
    { oc: "OC-2318", prov: "Químicos del Norte", monto: "$ 3.912.000", estado: "Aprobado" },
  ];
  const order = root.querySelector<NxDialog>("#dlg-order")!;
  const prov = root.querySelector<NxDialog>("#dlg-prov")!;
  const inv = root.querySelector<NxDialog>("#dlg-inv")!;
  // Cada panel tiene su propio contenedor: el contenido del autor se reemplaza ahí dentro.
  const body = (d: NxDialog) => d.querySelector(".dlg-body") ?? d.appendChild(el("div", { class: "dlg-body" }));
  const facts = (rows: [string, string][]) => el("dl", { class: "dlg-facts" }, ...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
  const list = root.querySelector("#dlg-orders")!;
  for (const o of ORDERS) {
    const b = el("button", { type: "button", class: "dlg-item" }, el("strong", {}, o.oc), el("span", {}, o.prov), el("span", { class: "dlg-num" }, o.monto));
    b.addEventListener("click", () => {
      order.heading = `Pedido ${o.oc}`;
      order.description = `${o.estado} · ${o.monto}`;
      const toProv = el("button", { type: "button", class: "dlg-link" }, `Ver proveedor · ${o.prov} →`);
      toProv.addEventListener("click", () => {
        prov.heading = o.prov;
        prov.description = "Proveedor desde 2019 · Barranquilla";
        const toInv = el("button", { type: "button", class: "dlg-link" }, "Ver última factura · FE-10482 →");
        toInv.addEventListener("click", () => {
          inv.heading = "Factura FE-10482";
          inv.description = `${o.prov} · 12 sep 2026`;
          body(inv).replaceChildren(facts([["Subtotal", "$ 9.100.000"], ["IVA 19 %", "$ 1.729.000"], ["Total", "$ 10.829.000"], ["Vence", "12 oct 2026"]]));
          void inv.show();
        });
        body(prov).replaceChildren(facts([["NIT", "900.123.456-7"], ["Pedidos este año", "38"], ["Entregas a tiempo", "84 %"], ["Contacto", "compras@aceros.co"]]), toInv);
        void prov.show();
      });
      body(order).replaceChildren(facts([["Proveedor", o.prov], ["Monto", o.monto], ["Estado", o.estado], ["Solicitó", "Producción · línea 2"]]), toProv);
      void order.show(b);
    });
    list.append(el("li", {}, b));
  }

  // C · deshacer en vez de confirmar.
  const undoList = root.querySelector("#dlg-undo")!;
  for (const o of [...ORDERS, { oc: "OC-2322", prov: "Transportes Rivera", monto: "$ 820.000", estado: "Pendiente" }]) {
    const btn = el("button", { type: "button", class: "dlg-plain" }, "Anular");
    const li = el("li", { class: "dlg-undo-row" }, el("strong", {}, o.oc), el("span", {}, o.prov), el("span", { class: "dlg-num" }, o.monto), btn);
    btn.addEventListener("click", async () => {
      li.classList.add("is-gone");
      const r = await nxToast({ message: `${o.oc} anulada`, undo: true });
      if (r === "undo") {
        li.classList.remove("is-gone");
        add(`${o.oc}: deshecho, no se envía nada`);
      } else {
        li.remove();
        add(`${o.oc}: ${r} → POST /compras/oc/${o.oc.slice(3)}/anular`);
      }
    });
    undoList.append(li);
  }

  // D · confirmación con impacto.
  const ask = (id: string, oc: string) =>
    root.querySelector(id)!.addEventListener("click", async (e) => {
      const yes = await nxConfirm({ heading: `Anular ${oc}`, message: "El pedido deja de estar vigente para compras y bodega.", confirmLabel: "Anular pedido", impact: `/demo/impact?oc=${oc.slice(3)}`, origin: e.currentTarget as Element });
      add(`nxConfirm(${oc}) → ${yes}`);
      if (yes) void nxToast({ message: `${oc} anulada`, tone: "success" });
    });
  ask("#dlg-c1", "OC-2291");
  ask("#dlg-c2", "OC-2310");
}

// ---------------------------------------------------------------- ejemplo: directorio de TH

function mountHrDemo(root: HTMLElement) {
  const grid = root.querySelector<NxGrid>("#th-grid")!;
  const emp = root.querySelector<NxDialog>("#th-emp")!;
  const contract = root.querySelector<NxDialog>("#th-contract")!;
  const log = root.querySelector<HTMLOListElement>("#th-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 5) log.lastElementChild!.remove();
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string | null)[]) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids.filter((k): k is Node | string => k !== null));
    return n;
  };
  const fmtDate = (iso: unknown) => (iso ? new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(String(iso))).replace(/ de /g, " ") : "—");
  const money = (n: unknown) => `$ ${new Intl.NumberFormat("es-CO").format(Number(n))}`;
  const label = (key: string, v: unknown) => HR_COLUMNS.find((c) => c.key === key)?.options?.find((o) => o.value === v)?.label ?? String(v ?? "—");

  grid.columns = HR_COLUMNS;
  grid.rows = hrEmployees();
  // Tras cambiar filas por fuera de la tabla: recalcula filtros, conteos y la bandeja.
  const refresh = () => {
    grid.rows = grid.rows;
    paintInbox();
  };

  // Bandeja de pendientes: cada tarjeta es un filtro de la tabla.
  const inbox = root.querySelector("#th-inbox")!;
  let active = "";
  const paintInbox = () => {
    inbox.replaceChildren(
      ...HR_INBOX.map((it) => {
        const n = applyFilters(grid.rows, it.filters).length;
        const b = el("button", { type: "button", class: "th-card", "aria-pressed": String(active === it.id) }, el("strong", {}, String(n)), el("span", {}, it.label), el("small", {}, it.hint));
        b.addEventListener("click", () => {
          active = active === it.id ? "" : it.id;
          grid.filters = active ? it.filters : [];
          paintInbox();
        });
        return b;
      }),
    );
  };
  paintInbox();
  grid.addEventListener("nx-grid-filter", () => {
    // Si la persona cambia los filtros a mano, la tarjeta deja de estar activa.
    const it = HR_INBOX.find((x) => x.id === active);
    if (it && JSON.stringify(grid.filters) !== JSON.stringify(it.filters)) {
      active = "";
      paintInbox();
    }
  });
  grid.addEventListener("nx-grid-change", (e) => add(`Editado: ${e.detail.changes.map((c) => `${c.id}.${c.key} → ${c.value}`).join(", ")}`));
  grid.addEventListener("nx-grid-selection", (e) => add(`${e.detail.count} seleccionadas`));

  // Acciones en lote: cambiar turno (con deshacer) y pedir documentos.
  const turno = root.querySelector<HTMLSelectElement>("#th-turno")!;
  turno.addEventListener("change", async () => {
    const to = turno.value;
    turno.value = "";
    if (!to) return;
    const rows = grid.selectedRows;
    const before = rows.map((r) => r.turno);
    rows.forEach((r) => (r.turno = to));
    refresh();
    const r = await nxToast({ message: `${rows.length} personas pasan a ${label("turno", to)}`, undo: true });
    if (r === "undo") {
      rows.forEach((row, i) => (row.turno = before[i]));
      refresh();
      add("Cambio de turno deshecho");
    } else add(`PATCH /th/turnos · ${rows.length} personas → ${to}`);
  });
  const docsBtn = root.querySelector<NxButton>("#th-docs-btn")!;
  docsBtn.addEventListener("click", () =>
    void docsBtn.run(async ({ log: l }) => {
      const n = grid.selectedRows.length;
      l(`Enviando ${n} correos`);
      await new Promise((r) => setTimeout(r, 900));
      void nxToast({ message: `Se pidieron los documentos a ${n} personas`, tone: "success" });
    }),
  );

  // Detalle: panel apilado. Persona → contrato.
  const facts = (rows: [string, Node | string][]) => el("dl", { class: "dlg-facts" }, ...rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)]));
  const body = (d: NxDialog) => d.querySelector(".dlg-body") ?? d.appendChild(el("div", { class: "dlg-body" }));
  const tone = (key: string, v: unknown) => HR_COLUMNS.find((c) => c.key === key)?.options?.find((o) => o.value === v)?.tone ?? "neutral";
  const pill = (key: string, v: unknown) => el("span", { class: "th-pill", "data-tone": tone(key, v) }, label(key, v));
  const years = (iso: unknown) => {
    const y = (Date.parse(TODAY) - Date.parse(String(iso))) / (365.25 * 86_400_000);
    return y < 1 ? `${Math.max(1, Math.round(y * 12))} meses` : `${Math.floor(y)} años`;
  };
  const DOCS = ["Cédula", "Contrato firmado", "Certificado bancario", "Afiliación a EPS", "Examen médico de ingreso"];

  const openContract = (r: GridRow) => {
    contract.heading = `Contrato · ${label("contrato", r.contrato)}`;
    contract.description = String(r.nombre);
    const renew = el("button", { type: "button", class: "dlg-link" }, "Renovar por un año");
    renew.addEventListener("click", async (e) => {
      const next = r.fin ? `${Number(String(r.fin).slice(0, 4)) + 1}${String(r.fin).slice(4)}` : null;
      const yes = await nxConfirm({
        heading: `Renovar el contrato de ${String(r.nombre).split(" ")[0]}`,
        tone: "primary",
        confirmLabel: "Renovar",
        impact: [
          { label: "Nuevo fin de contrato", detail: fmtDate(next) },
          { label: "Otrosí para firma", detail: "se envía por correo" },
          { label: "Salario", detail: `${money(r.salario)} (sin cambio)` },
        ],
        origin: e.currentTarget as Element,
      });
      if (!yes) return;
      r.fin = next;
      refresh();
      contract.close("renovado");
      void nxToast({ message: `Contrato renovado hasta ${fmtDate(next)}`, tone: "success" });
    });
    body(contract).replaceChildren(
      facts([
        ["Tipo", label("contrato", r.contrato)],
        ["Ingreso", `${fmtDate(r.ingreso)} · ${years(r.ingreso)}`],
        ["Fin", fmtDate(r.fin)],
        ["Salario", money(r.salario)],
        ["Jornada", r.turno === "oficina" ? "Oficina · L–V" : `${label("turno", r.turno)} · rotativo`],
      ]),
      r.contrato === "indefinido" ? el("p", { class: "th-note" }, "Contrato a término indefinido: no requiere renovación.") : renew,
    );
    void contract.show();
  };

  const openEmployee = (r: GridRow, origin?: Element | null) => {
    emp.heading = String(r.nombre);
    emp.description = `${r.cargo} · ${r.area}`;
    const missing = Number(r.docs);
    const docs = el(
      "ul",
      { class: "th-docs" },
      ...DOCS.map((d, i) => {
        const ok = i < DOCS.length - missing;
        const ask = ok ? null : el("button", { type: "button", class: "dlg-plain" }, "Pedir");
        ask?.addEventListener("click", () => void nxToast({ message: `Se pidió «${d}» a ${String(r.nombre).split(" ")[0]}`, tone: "success" }));
        return el("li", { "data-ok": String(ok) }, el("span", {}, ok ? "✓" : "!"), el("span", {}, d), ask);
      }),
    );
    const toContract = el("button", { type: "button", class: "dlg-link" }, "Ver contrato →");
    toContract.addEventListener("click", () => openContract(r));
    const retire = el("nx-button", { label: "Retirar…", variant: "danger", "log-mode": "none" });
    retire.addEventListener("click", async (e) => {
      const yes = await nxConfirm({
        heading: `Retirar a ${r.nombre}`,
        message: `${r.cargo} · ${r.area} · ${years(r.ingreso)} en la empresa.`,
        confirmLabel: "Registrar retiro",
        impact: `/demo/th/retiro?id=${r.id}`,
        origin: e.currentTarget as Element,
      });
      if (!yes) return;
      r.estado = "retirado";
      refresh();
      emp.close("retirado");
      void nxToast({ message: `${r.nombre} quedó retirado · se generó el paz y salvo`, tone: "success" });
      add(`POST /th/retiros · ${r.id}`);
    });
    const plural = missing > 1 ? "s" : "";
    body(emp).replaceChildren(
      el("div", { class: "th-badges" }, pill("estado", r.estado), pill("contrato", r.contrato), missing ? el("span", { class: "th-pill", "data-tone": "warning" }, `${missing} documento${plural} faltante${plural}`) : null),
      el("h3", { class: "th-h" }, "Datos"),
      facts([
        ["Cédula", new Intl.NumberFormat("es-CO").format(Number(r.cedula))],
        ["Sede", String(r.sede)],
        ["Turno", label("turno", r.turno)],
        ["Correo", String(r.correo)],
        ["Vacaciones", `${r.vacaciones} ${r.vacaciones === 1 ? "día pendiente" : "días pendientes"}`],
      ]),
      el("h3", { class: "th-h" }, "Contrato"),
      facts([
        ["Tipo", label("contrato", r.contrato)],
        ["Ingreso", `${fmtDate(r.ingreso)} · ${years(r.ingreso)}`],
        ["Fin", fmtDate(r.fin)],
      ]),
      toContract,
      el("h3", { class: "th-h" }, "Documentos"),
      docs,
      el("div", { class: "th-danger" }, r.estado === "retirado" ? el("p", { class: "th-note" }, "Retirado.") : retire),
    );
    void emp.show(origin);
  };
  grid.addEventListener("nx-grid-open", (e) => openEmployee(e.detail.row, e.detail.origin));
}
