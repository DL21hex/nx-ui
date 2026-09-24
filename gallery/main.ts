import "../src/styles/nx-ui.css";
import "../src/styles/palettes.css";
import "./gallery.css";
import { render, type BduiNode } from "../src/bdui";
import { lucide } from "../src/icons/index";
import { registerIcons, type MenuItem, type NxAiAnswer, type NxButton, type NxSelect, type NxSidemenu, type RunContext } from "../src/index";
import { DEMO_ITEMS, EMPLOYEE_FIELDS, EMPLOYEES } from "./demo-data";

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
  { id: "ai", label: "IA", href: "#/ai", icon: "circle-help", section: "Componentes", badge: "Nuevo" },
];
nav.items = NAV;

const PAGES: Record<string, { template: string; mount?: (root: HTMLElement) => void }> = {
  "#/": { template: "page-intro" },
  "#/temas": { template: "page-temas", mount: mountTokens },
  "#/sidemenu": { template: "page-sidemenu", mount: mountSidemenuDemo },
  "#/button": { template: "page-button", mount: mountButtonDemo },
  "#/select": { template: "page-select", mount: mountSelectDemo },
  "#/ai": { template: "page-ai", mount: mountAiDemo },
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
