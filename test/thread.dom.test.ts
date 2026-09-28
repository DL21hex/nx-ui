// @vitest-environment happy-dom
//
// El servidor es un `fetch` de mentira (se pone ANTES de montar): la lista, el POST/PATCH/DELETE,
// las personas, los registros y un stream NDJSON que la prueba alimenta línea por línea. Nada sale
// a la red. happy-dom no tiene layout: las medidas dan 0 y eso basta aquí.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/thread/index";
import { THREAD_LABELS, type NxThread, type ThreadComment, type ThreadErrorDetail, type ThreadMentionDetail, type ThreadPostDetail } from "../src/components/thread/index";
// Los chunks perezosos, ya en caché: su `import()` se resuelve también con relojes falsos.
import "../src/components/thread/thread-live";
import "../src/components/thread/thread-pick";
import "../src/components/thread/thread-anchors";
import "../src/components/toast/index";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => unknown, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`no se cumplió: ${check}`);
    await sleep(5);
  }
}

/** Un stream NDJSON que la prueba alimenta. Se corta con la señal de la petición, como uno real. */
function live(signal?: AbortSignal | null) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  signal?.addEventListener("abort", () => {
    try {
      ctrl.error(new DOMException("Aborted", "AbortError"));
    } catch {
      /* ya cerrado */
    }
  });
  return {
    response: new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
    push: (o: unknown) => ctrl.enqueue(enc.encode(`${typeof o === "string" ? o : JSON.stringify(o)}\n`)),
    close: () => ctrl.close(),
  };
}

type Call = { method: string; url: URL; init: RequestInit; body: Record<string, unknown> | undefined };
type Handler = (c: Call) => Response | Promise<Response>;

/** El servidor de mentira: rutas por «MÉTODO /ruta» (sin la consulta). `GET /api/stream` abre un stream vivo. */
function server(routes: Record<string, Handler> = {}) {
  const calls: Call[] = [];
  const streams: ReturnType<typeof live>[] = [];
  const all: Record<string, Handler> = {
    "GET /api/comentarios": () => json(COMMENTS),
    "GET /api/personas": (c) => json(PEOPLE.filter((p) => p.name.toLowerCase().includes(c.url.searchParams.get("q")!.toLowerCase()))),
    "GET /api/referencias": (c) => json(REFS.filter((r) => r.label.toLowerCase().includes(c.url.searchParams.get("q")!.replace(/^#/, "").toLowerCase()))),
    "POST /api/comentarios": (c) => json({ id: `srv-${calls.length}`, author: ME, at: new Date().toISOString(), ...c.body }),
    "PATCH /api/comentarios/c2": (c) => json({ ...COMMENTS[1], ...c.body }),
    "PATCH /api/comentarios/c3": (c) => json({ ...COMMENTS[2], ...c.body, editedAt: new Date().toISOString() }),
    "DELETE /api/comentarios/c3": () => new Response(null, { status: 204 }),
    "POST /api/comentarios/typing": () => new Response(null, { status: 204 }),
    ...routes,
  };
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), location.href);
    const method = (init.method ?? "GET").toUpperCase();
    const call: Call = { method, url, init, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined };
    calls.push(call);
    if (init.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const key = `${method} ${url.pathname}`;
    if (key === "GET /api/stream" && !all[key]) {
      const s = live(init.signal);
      streams.push(s);
      return s.response;
    }
    const h = all[key];
    return h ? h(call) : new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const of = (method: string, path: string) => calls.filter((c) => c.method === method && c.url.pathname === path);
  return { calls, streams, of, last: () => streams[streams.length - 1] };
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const ME = { id: "u7", name: "Diego Llinás" };
const LAURA = { id: "u12", name: "Laura Gómez" };
const ANDRES = { id: "u3", name: "Andrés Ruiz", avatar: "https://fotos.test/andres.jpg" };
const PEOPLE = [
  { ...LAURA, detail: "Compras" },
  { id: "u14", name: "Laura Restrepo", detail: "Tesorería" },
  ANDRES,
];
const REFS = [
  { id: "fv-1873", label: "FV-1873", detail: "Factura · Aceros del Caribe", href: "/facturas/1873" },
  { id: "oc-2291", label: "OC-2291", detail: "Orden de compra · por aprobar", href: "/compras/2291" },
  { id: "fv-evil", label: "FV-6666", detail: "Mala", href: "javascript:alert(1)" },
];
const start = new Date();
start.setHours(0, 0, 0, 0);
/** Hace `n` días, a las `h` (hora local); `today()`: hace unos minutos (sin salir de hoy). */
const day = (n: number, h = 10) => new Date(start.getFullYear(), start.getMonth(), start.getDate() - n, h).toISOString();
const today = () => new Date(Math.max(start.getTime(), Date.now() - 5 * 60e3)).toISOString();
const COMMENTS: ThreadComment[] = [
  { id: "c1", author: ANDRES, text: "Abrí la orden. Ver #[FV-1873](fv-1873) y https://erp.test/oc/2291", at: day(3), refs: [REFS[0]] },
  { id: "c2", author: LAURA, text: "¿Por qué este descuento del 12 %?", at: day(1, 9), anchor: "descuento" },
  { id: "c3", author: ME, text: "Lo negoció @[Andrés Ruiz](u3) con el proveedor", at: day(1, 11), replyTo: "c2" },
  { id: "c4", author: LAURA, text: '<img src=x onerror="alert(1)"> revisa OC-2291\nhoy', at: today(), editedAt: today() },
];

const FORM = `<form id="oc">
  <div class="f"><label for="f-desc">Descuento</label><input id="f-desc" name="descuento" data-thread="descuento"></div>
  <label class="g">Fecha de entrega <input name="entrega" type="date"></label>
  <label class="h">Proveedor <input name="proveedor"></label>
</form>`;

/** Monta el hilo; lo que venga en `attrs` reemplaza al atributo por defecto del mismo nombre. */
function mount(attrs = "", before = ""): NxThread {
  const own = new Set([...attrs.matchAll(/(?:^|\s)([\w-]+)(?==|\s|$)/g)].map((m) => m[1]));
  const base = { record: "OC-2291", endpoint: "/api/comentarios", me: JSON.stringify(ME), poll: "0", locale: "es-CO" };
  const defaults = Object.entries(base)
    .filter(([k]) => !own.has(k))
    .map(([k, v]) => `${k}='${v}'`)
    .join(" ");
  document.body.innerHTML = `${before}<nx-thread ${defaults} ${attrs}></nx-thread>`;
  return document.querySelector("nx-thread")!;
}
const $ = <T extends Element = HTMLElement>(el: ParentNode, sel: string) => el.querySelector<T>(sel)!;
const arts = (el: Element) => [...el.querySelectorAll<HTMLElement>("li[data-id] > article")];
const ids = (el: Element) => arts(el).map((a) => a.closest<HTMLElement>("li")!.dataset.id);
const item = (el: Element, id: string) => $(el, `li[data-id="${id}"]`);
const act = (scope: ParentNode, a: string) => scope.querySelector<HTMLButtonElement>(`button[data-a="${a}"]`);
const box = (el: Element) => $<HTMLTextAreaElement>(el, ".nx-thread__compose textarea");
function type(ta: HTMLTextAreaElement, text: string) {
  ta.focus();
  ta.value = text;
  ta.setSelectionRange(text.length, text.length);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}
const key = (t: Element, k: string, o: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o });
  t.dispatchEvent(e);
  return e;
};
function track(el: NxThread) {
  const posts: ThreadPostDetail[] = [];
  const mentions: ThreadMentionDetail[] = [];
  const errors: ThreadErrorDetail[] = [];
  const changes: ThreadComment[][] = [];
  el.addEventListener("nx-thread-post", (e) => posts.push(e.detail));
  el.addEventListener("nx-thread-mention", (e) => mentions.push(e.detail));
  el.addEventListener("nx-thread-error", (e) => errors.push(e.detail));
  el.addEventListener("nx-thread-change", (e) => changes.push(e.detail.comments));
  return { posts, mentions, errors, changes };
}
const loaded = (el: Element) => until(() => arts(el).length >= 4);

describe("<nx-thread>: la lista", () => {
  it("carga del registro, agrupa por día y pinta autor, avatar, hora y «(editado)»", async () => {
    const srv = server();
    const el = mount();
    await loaded(el);
    expect(srv.of("GET", "/api/comentarios")[0].url.searchParams.get("record")).toBe("OC-2291");
    expect(ids(el)).toEqual(["c1", "c2", "c3", "c4"]);
    const days = [...el.querySelectorAll(".nx-thread__day > h3")].map((h) => h.textContent);
    expect(days.slice(1)).toEqual(["Ayer", "Hoy"]);
    expect(days[0]).not.toMatch(/Hoy|Ayer/);
    expect($(el, ".nx-thread__count").textContent).toBe("4");
    // El artículo se llama con su autor y su hora.
    const a4 = $(el, 'li[data-id="c4"] > article');
    const name = a4
      .getAttribute("aria-labelledby")!
      .split(" ")
      .map((id) => document.getElementById(id)!.textContent)
      .join(" ");
    expect(name).toMatch(/^Laura Gómez hace \d+ min|^Laura Gómez ahora/);
    expect($(a4, "time").getAttribute("title")).toMatch(/2026|\d{4}/);
    expect($(a4, ".nx-thread__edited").textContent).toBe("(editado)");
    // Avatar: foto (https) o iniciales, con el tono de la persona.
    expect($<HTMLImageElement>(item(el, "c1"), ".nx-thread__av img").getAttribute("src")).toBe("https://fotos.test/andres.jpg");
    expect($(item(el, "c2"), ".nx-thread__av").textContent).toBe("LG");
  });

  it("el texto es texto: el HTML no se interpreta; menciones, registros, URL y saltos sí", async () => {
    server();
    const el = mount('ref-patterns=\'["OC-\\\\d{3,6}", "FV-\\\\d{3,6}"]\'');
    await loaded(el);
    const t4 = $(item(el, "c4"), ".nx-thread__text");
    expect(t4.querySelector("img")).toBeNull();
    expect(t4.textContent).toBe('<img src=x onerror="alert(1)"> revisa OC-2291hoy');
    expect(t4.querySelector("br")).not.toBeNull();
    // OC-2291 por el patrón: una ficha (sin enlace hasta que se sepa a dónde lleva).
    expect($(t4, ".nx-thread__ref").localName).toBe("span");
    expect($(t4, ".nx-thread__ref").tabIndex).toBe(0);
    const t1 = $(item(el, "c1"), ".nx-thread__text");
    expect($(t1, "a.nx-thread__ref").getAttribute("href")).toBe("/facturas/1873");
    const url = $<HTMLAnchorElement>(t1, "a.nx-thread__url");
    expect([url.getAttribute("href"), url.rel, url.target]).toEqual(["https://erp.test/oc/2291", "noopener noreferrer", "_blank"]);
    const m = $(item(el, "c3"), ".nx-thread__mention");
    expect([m.textContent, m.dataset.id]).toEqual(["@Andrés Ruiz", "u3"]);
    // La respuesta cita arriba el comentario al que responde.
    expect($(item(el, "c3"), ".nx-thread__quote").textContent).toBe("Laura Gómez ¿Por qué este descuento del 12 %?");
  });

  it("la marca «Nuevos» desde la última visita (localStorage por registro y persona)", async () => {
    server();
    localStorage.setItem("nx-thread-seen:OC-2291:u7", String(new Date(day(1, 10)).getTime()));
    const el = mount();
    await loaded(el);
    const marks = [...el.querySelectorAll(".nx-thread__unread")];
    expect(marks).toHaveLength(1);
    // c3 es propio: el primero sin leer es c4.
    expect(marks[0].nextElementSibling!.getAttribute("data-id")).toBe("c4");
    expect(marks[0].textContent).toBe("Nuevos");
    expect(Number(localStorage.getItem("nx-thread-seen:OC-2291:u7"))).toBe(new Date(COMMENTS[3].at).getTime());
  });

  it("sin visita anterior no hay marca; localStorage roto no rompe nada", async () => {
    server();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      const el = mount();
      await loaded(el);
      expect(el.querySelector(".nx-thread__unread")).toBeNull();
      type(box(el), "hola");
      expect(box(el).value).toBe("hola");
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it("si no carga: el aviso con «Reintentar», y el evento", async () => {
    let ok = false;
    server({ "GET /api/comentarios": () => (ok ? json(COMMENTS) : new Response("", { status: 503 })) });
    const el = mount();
    const t = track(el);
    await until(() => el.querySelector('.nx-thread__msg[role="alert"]'));
    expect($(el, ".nx-thread__msg").textContent).toBe(`${THREAD_LABELS.loadFailed} ${THREAD_LABELS.retry}`);
    expect(t.errors[0]).toEqual({ action: "load", message: "HTTP 503" });
    ok = true;
    act(el, "load")!.click();
    await loaded(el);
    expect(el.querySelector('.nx-thread__msg[role="alert"]')).toBeNull();
  });

  it("1.000 comentarios: pinta los últimos 50 y «Ver anteriores»", async () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, author: i % 2 ? LAURA : ANDRES, text: `n.º ${i}`, at: new Date(start.getTime() - (1000 - i) * 60e3).toISOString() }));
    server({ "GET /api/comentarios": () => json(many) });
    const el = mount();
    await until(() => arts(el).length);
    expect(arts(el)).toHaveLength(50);
    expect(ids(el).at(-1)).toBe("m999");
    expect(act(el, "older")!.textContent).toBe("Ver anteriores (950)");
    act(el, "older")!.click();
    expect(arts(el)).toHaveLength(100);
    expect(act(el, "older")!.textContent).toBe("Ver anteriores (900)");
  });
});

describe("<nx-thread>: enviar", () => {
  it("optimista: aparece al instante con «Enviando…» y queda con lo que devuelve el servidor", async () => {
    let release!: () => void;
    const srv = server({
      "POST /api/comentarios": (c) => new Promise((r) => (release = () => r(json({ id: "c9", author: ME, at: new Date().toISOString(), text: c.body!.text, clientId: c.body!.clientId })))),
    });
    const el = mount();
    const t = track(el);
    await loaded(el);
    type(box(el), "  Ya lo reviso  ");
    expect(key(box(el), "Enter").defaultPrevented).toBe(true);
    expect(t.posts).toHaveLength(1);
    expect(t.posts[0]).toMatchObject({ record: "OC-2291", text: "Ya lo reviso" });
    const cid = t.posts[0].clientId;
    const pending = $(el, `li[data-id="${cid}"] > article`);
    expect(pending.dataset.state).toBe("sending");
    expect($(pending, ".nx-thread__state").textContent).toBe("Enviando…");
    expect(box(el).value).toBe("");
    release();
    await until(() => el.querySelector('li[data-id="c9"]'));
    expect(el.querySelector(`li[data-id="${cid}"]`)).toBeNull();
    expect(item(el, "c9").querySelector("[data-state]")).toBeNull();
    expect(srv.of("POST", "/api/comentarios")[0].body).toEqual({ record: "OC-2291", text: "Ya lo reviso", clientId: cid });
  });

  it("si falla: «No se envió · Reintentar» sin perder el texto; el reintento usa el mismo clientId y no duplica", async () => {
    let fail = true;
    const srv = server({ "POST /api/comentarios": (c) => (fail ? new Response("", { status: 503 }) : json({ id: "c9", author: ME, at: new Date().toISOString(), text: c.body!.text, clientId: c.body!.clientId })) });
    const el = mount('stream="/api/stream"');
    const t = track(el);
    await loaded(el);
    type(box(el), "Confirmado con el proveedor");
    key(box(el), "Enter");
    await until(() => el.querySelector('[data-state="failed"]'));
    const failed = $(el, '[data-state="failed"]');
    expect($(failed, ".nx-thread__text").textContent).toBe("Confirmado con el proveedor");
    expect($(failed, ".nx-thread__state").textContent).toBe(`${THREAD_LABELS.failed}${THREAD_LABELS.retry}`);
    expect(t.errors.at(-1)).toMatchObject({ action: "post", message: "HTTP 503" });
    fail = false;
    act(failed, "retry")!.click();
    const posts = srv.of("POST", "/api/comentarios");
    expect(posts).toHaveLength(2);
    expect(posts[1].body!.clientId).toBe(posts[0].body!.clientId);
    // El eco del stream llega antes que la respuesta del POST: sigue siendo uno.
    await until(() => srv.last());
    srv.last().push({ type: "comment", comment: { id: "c9", author: ME, at: new Date().toISOString(), text: "Confirmado con el proveedor", clientId: posts[0].body!.clientId } });
    await until(() => el.querySelector('li[data-id="c9"]') && !el.querySelector("[data-state]"));
    expect(arts(el).filter((a) => a.textContent!.includes("Confirmado con el proveedor"))).toHaveLength(1);
  });

  it("`nx-thread-post` cancelable: no se envía y el texto queda", async () => {
    const srv = server();
    const el = mount();
    await loaded(el);
    el.addEventListener("nx-thread-post", (e) => e.preventDefault());
    type(box(el), "No va");
    key(box(el), "Enter");
    expect(srv.of("POST", "/api/comentarios")).toHaveLength(0);
    expect(box(el).value).toBe("No va");
    expect(arts(el)).toHaveLength(4);
  });

  it("Mayús+Enter es un salto de línea; vacío no envía", async () => {
    const srv = server();
    const el = mount();
    await loaded(el);
    expect(key(box(el), "Enter", { shiftKey: true }).defaultPrevented).toBe(false);
    type(box(el), "   ");
    key(box(el), "Enter");
    expect(srv.of("POST", "/api/comentarios")).toHaveLength(0);
  });

  it("responder: cita arriba el comentario, sin anidar; la cita lleva a él", async () => {
    const srv = server();
    const el = mount();
    await loaded(el);
    act(item(el, "c4"), "reply")!.click();
    expect($(el, ".nx-thread__chip").textContent).toBe("Respondiendo a Laura Gómez×");
    expect(document.activeElement).toBe(box(el));
    type(box(el), "Listo");
    key(box(el), "Enter");
    await until(() => srv.of("POST", "/api/comentarios").length);
    expect(srv.of("POST", "/api/comentarios")[0].body).toMatchObject({ text: "Listo", replyTo: "c4" });
    await until(() => el.querySelector('li[data-id^="srv-"]'));
    const reply = $(el, 'li[data-id^="srv-"]');
    // Mismo nivel que los demás: un <li> del día, no dentro del comentario citado.
    expect(reply.parentElement).toBe(item(el, "c4").parentElement);
    expect($(reply, ".nx-thread__quote").textContent).toBe('Laura Gómez <img src=x onerror="alert(1)"> revisa OC-2291 hoy');
    act(reply, "goto")!.click();
    expect(document.activeElement).toBe($(item(el, "c4"), "article"));
    expect(el.querySelector(".nx-thread__chip")).toBeNull();
  });
});

describe("<nx-thread>: editar, borrar, resolver", () => {
  it("editar lo propio en su lugar: el borrador ve «@Andrés Ruiz» y se guarda el token", async () => {
    const srv = server();
    const el = mount();
    const t = track(el);
    await loaded(el);
    expect(act(item(el, "c2"), "edit")).toBeNull(); // lo de otra persona no
    act(item(el, "c3"), "edit")!.click();
    const ta = $<HTMLTextAreaElement>(item(el, "c3"), "textarea[data-a=text]");
    expect(document.activeElement).toBe(ta);
    expect(ta.value).toBe("Lo negoció @Andrés Ruiz con el proveedor");
    type(ta, "Lo negoció @Andrés Ruiz, confirmado");
    key(ta, "Enter");
    expect(srv.of("PATCH", "/api/comentarios/c3")[0].body).toEqual({ text: "Lo negoció @[Andrés Ruiz](u3), confirmado" });
    expect($(item(el, "c3"), ".nx-thread__text").textContent).toBe("Lo negoció @Andrés Ruiz, confirmado");
    expect($(item(el, "c3"), ".nx-thread__edited")).not.toBeNull();
    await sleep(10);
    expect(t.mentions).toHaveLength(0); // Andrés ya estaba mencionado
  });

  it("Esc cancela la edición; si el servidor no acepta, vuelve atrás y lo dice", async () => {
    server({ "PATCH /api/comentarios/c3": () => new Response("", { status: 409 }) });
    const el = mount();
    const t = track(el);
    await loaded(el);
    act(item(el, "c3"), "edit")!.click();
    key($(item(el, "c3"), "textarea"), "Escape");
    expect(item(el, "c3").querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(act(item(el, "c3"), "edit"));
    act(item(el, "c3"), "edit")!.click();
    type($(item(el, "c3"), "textarea"), "otro texto");
    act(item(el, "c3"), "save")!.click();
    expect($(item(el, "c3"), ".nx-thread__text").textContent).toBe("otro texto");
    await until(() => t.errors.length);
    expect(t.errors[0]).toEqual({ action: "edit", message: "HTTP 409", id: "c3" });
    expect($(item(el, "c3"), ".nx-thread__text").textContent).toBe("Lo negoció @Andrés Ruiz con el proveedor");
    expect($(el, ".nx-thread__sr").textContent).toBe(THREAD_LABELS.editFailed);
  });

  it("borrar con deshacer (sin confirmación): se va al instante, «Deshacer» lo trae y no llama al servidor", async () => {
    const srv = server();
    const el = mount();
    const t = track(el);
    await loaded(el);
    act(item(el, "c3"), "del")!.click();
    expect(el.querySelector('li[data-id="c3"]')).toBeNull();
    expect(t.changes.at(-1)!.map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
    await until(() => document.querySelector('.nx-toast [data-r="undo"]'));
    expect($(document, ".nx-toast__msg").textContent).toBe("Comentario borrado");
    $<HTMLButtonElement>(document, '.nx-toast [data-r="undo"]').click();
    await until(() => el.querySelector('li[data-id="c3"]'));
    expect(srv.of("DELETE", "/api/comentarios/c3")).toHaveLength(0);
    // Otra vez, y ahora se deja ir: el DELETE sale (con keepalive).
    act(item(el, "c3"), "del")!.click();
    // (el aviso anterior se queda un instante con «Deshecho»: se toma el último)
    await until(() => document.querySelectorAll(".nx-toast").length === 2);
    $<HTMLButtonElement>(document, '.nx-toast:last-child [data-r="dismiss"]').click();
    await until(() => srv.of("DELETE", "/api/comentarios/c3").length);
    expect(srv.of("DELETE", "/api/comentarios/c3")[0].init.keepalive).toBe(true);
    expect(el.comments.map((c) => c.id)).toEqual(["c1", "c2", "c4"]);
  });

  it("si el hilo sale del DOM con un borrado pendiente, se borra ya", async () => {
    const srv = server();
    const el = mount();
    await loaded(el);
    act(item(el, "c3"), "del")!.click();
    el.remove();
    await until(() => srv.of("DELETE", "/api/comentarios/c3").length);
    await until(() => !document.querySelector(".nx-toast:not(.is-out)"));
  });

  it("resolver una conversación anclada: queda plegada con quién la resolvió, y se despliega", async () => {
    const srv = server();
    const el = mount("", FORM);
    await loaded(el);
    expect(act(item(el, "c4"), "resolve")).toBeNull(); // sin ancla no se resuelve
    act(item(el, "c2"), "resolve")!.click();
    expect(srv.of("PATCH", "/api/comentarios/c2")[0].body).toEqual({ resolved: true });
    const fold = item(el, "c2");
    expect(fold.classList.contains("nx-thread__fold")).toBe(true);
    await until(() => document.querySelector(".nx-thread__pin"));
    expect(fold.textContent).toBe("Sobre: Descuento · Resuelto por Diego Llinásver");
    // La respuesta se pliega con ella; el globito ya no la cuenta.
    expect(el.querySelector('li[data-id="c3"]')).toBeNull();
    expect($(document, '.nx-thread__pin[data-key="descuento"]').getAttribute("aria-label")).toBe("Comentar sobre Descuento");
    act(fold, "unfold")!.click();
    expect(ids(el)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(act(item(el, "c2"), "reopen")!.textContent).toBe("Reabrir");
    act(item(el, "c2"), "fold")!.click();
    expect(el.querySelector('li[data-id="c3"]')).toBeNull();
  });
});

describe("<nx-thread>: menciones y referencias", () => {
  it("@ abre la lista (con espera y teclado), elige una persona y el envío avisa la mención", async () => {
    const srv = server();
    const el = mount('people-source="/api/personas"');
    const t = track(el);
    await loaded(el);
    const ta = box(el);
    type(ta, "Revisa @la");
    await until(() => el.querySelectorAll("[role=option]").length === 2);
    expect(srv.of("GET", "/api/personas")).toHaveLength(1); // una sola consulta tras la espera
    expect(srv.of("GET", "/api/personas")[0].url.searchParams.get("q")).toBe("la");
    const list = $(el, "[role=listbox]");
    expect(list.getAttribute("aria-label")).toBe("Personas");
    expect(ta.getAttribute("aria-controls")).toBe(list.id);
    expect(ta.getAttribute("aria-autocomplete")).toBe("list");
    const opts = [...el.querySelectorAll<HTMLElement>("[role=option]")];
    expect(ta.getAttribute("aria-activedescendant")).toBe(opts[0].id);
    key(ta, "ArrowDown");
    expect(ta.getAttribute("aria-activedescendant")).toBe(el.querySelectorAll("[role=option]")[1].id);
    key(ta, "ArrowUp");
    expect(el.querySelectorAll("[role=option]")[0].getAttribute("aria-selected")).toBe("true");
    expect(key(ta, "Enter").defaultPrevented).toBe(true);
    expect(ta.value).toBe("Revisa @Laura Gómez ");
    expect(list.hidden).toBe(true);
    expect(ta.hasAttribute("aria-activedescendant")).toBe(false);
    expect(t.posts).toHaveLength(0); // Enter eligió, no envió
    type(ta, `${ta.value}por favor`);
    await sleep(200);
    key(ta, "Enter");
    expect(t.posts[0].text).toBe("Revisa @[Laura Gómez](u12) por favor");
    await until(() => t.mentions.length);
    expect(t.mentions[0].people).toEqual([{ id: "u12", name: "Laura Gómez" }]);
    expect(t.mentions[0].comment.id).toMatch(/^srv-/);
    expect($(el, 'li[data-id^="srv-"] .nx-thread__mention').textContent).toBe("@Laura Gómez");
  });

  it("Esc cierra la lista; cada tecla aborta la consulta anterior", async () => {
    const signals: AbortSignal[] = [];
    server({
      "GET /api/personas": (c) => {
        signals.push(c.init.signal!);
        return new Promise((r) => setTimeout(() => r(json(PEOPLE)), 60));
      },
    });
    const el = mount('people-source="/api/personas"');
    await loaded(el);
    const ta = box(el);
    type(ta, "@l");
    await until(() => signals.length === 1);
    type(ta, "@la");
    await until(() => signals.length === 2);
    expect(signals[0].aborted).toBe(true);
    await until(() => el.querySelectorAll("[role=option]").length);
    const e = key(ta, "Escape");
    expect(e.defaultPrevented).toBe(true);
    expect($(el, "[role=listbox]").hidden).toBe(true);
  });

  it("# busca registros; la ficha lleva al registro y su tarjeta dice qué es (sin navegar)", async () => {
    const srv = server();
    const el = mount('refs-source="/api/referencias"');
    const t = track(el);
    await loaded(el);
    const ta = box(el);
    type(ta, "Cruza con #fv-1");
    await until(() => el.querySelectorAll("[role=option]").length === 1);
    expect($(el, "[role=listbox]").getAttribute("aria-label")).toBe("Registros");
    $(el, "[role=option]").click();
    expect(ta.value).toBe("Cruza con #FV-1873 ");
    key(ta, "Enter");
    expect(t.posts[0].text).toBe("Cruza con #[FV-1873](fv-1873)");
    await until(() => el.querySelector('li[data-id^="srv-"] a.nx-thread__ref'));
    const ref = $<HTMLAnchorElement>(el, 'li[data-id^="srv-"] a.nx-thread__ref');
    expect(ref.getAttribute("href")).toBe("/facturas/1873");
    ref.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    const card = $(el, ".nx-thread__card");
    await until(() => !card.hidden);
    expect(card.getAttribute("role")).toBe("tooltip");
    expect(card.textContent).toBe("FV-1873Factura · Aceros del Caribe");
    expect(ref.getAttribute("aria-describedby")).toBe(card.id);
    ref.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }));
    expect(card.hidden).toBe(true);
    expect(ref.hasAttribute("aria-describedby")).toBe(false);
    expect(srv.of("GET", "/api/referencias")).toHaveLength(1); // ya se conocía: no se volvió a preguntar
  });

  it("un código conocido (ref-patterns) se consulta al enfocarlo, y pasa a enlace; un href peligroso no", async () => {
    const srv = server({
      "GET /api/comentarios": () => json([{ ...COMMENTS[0], id: "x1", text: "Ver OC-2291 y FV-6666", refs: undefined }]),
    });
    const el = mount('refs-source="/api/referencias" ref-patterns=\'["OC-\\\\d{3,6}", "FV-\\\\d{3,6}"]\'');
    await until(() => arts(el).length);
    const [oc] = [...el.querySelectorAll<HTMLElement>(".nx-thread__ref")];
    oc.focus();
    const card = () => el.querySelector<HTMLElement>(".nx-thread__card");
    await until(() => card()?.textContent === "OC-2291Orden de compra · por aprobar");
    expect(srv.of("GET", "/api/referencias")[0].url.searchParams.get("q")).toBe("OC-2291");
    await until(() => el.querySelector('a.nx-thread__ref[href="/compras/2291"]'));
    key(document.activeElement ?? el, "Escape");
    expect($(el, ".nx-thread__card").hidden).toBe(true);
    const fv2 = [...el.querySelectorAll<HTMLElement>(".nx-thread__ref")].find((x) => x.textContent === "FV-6666")!;
    expect(fv2).toBeTruthy();
    fv2.focus();
    await until(() => card()?.textContent === "FV-6666Mala");
    await sleep(20);
    expect(el.querySelector('a.nx-thread__ref[href^="javascript"]')).toBeNull();
  });

  it("los códigos conocidos también abren la búsqueda de registros al escribirlos", async () => {
    const srv = server();
    const el = mount('refs-source="/api/referencias" ref-patterns=\'["OC-\\\\d{3,6}"]\'');
    await loaded(el);
    type(box(el), "ver OC-229");
    await until(() => srv.of("GET", "/api/referencias").length);
    expect(srv.of("GET", "/api/referencias")[0].url.searchParams.get("q")).toBe("OC-229");
  });
});

describe("<nx-thread>: anclas a campos", () => {
  it("un globito junto a la etiqueta de cada campo, sin mover nada del autor, que filtra el hilo", async () => {
    const srv = server();
    const el = mount('anchors=\'["entrega", "no-existe", "[[roto"]\'', FORM);
    // Los nodos del autor, antes de que lleguen los globitos (el chunk de anclas es perezoso).
    const f2 = $(document, ".f");
    const authors = [...f2.children];
    const form = [...$(document, "#oc").children];
    await loaded(el);
    await until(() => document.querySelectorAll(".nx-thread__pin").length === 2);
    // Después del <label for> (junto a su etiqueta), y después del <label> que envuelve al campo.
    const pin = $(document, '.nx-thread__pin[data-key="descuento"]');
    expect(pin.previousElementSibling).toBe(authors[0]);
    expect(pin.nextElementSibling).toBe(authors[1]);
    expect([...f2.children].filter((n) => !n.classList.contains("nx-thread__pin"))).toEqual(authors);
    expect($(document, '.nx-thread__pin[data-key="entrega"]').previousElementSibling).toBe($(document, "label.g"));
    expect([...$(document, "#oc").children].filter((n) => !n.classList.contains("nx-thread__pin"))).toEqual(form);
    expect(pin.getAttribute("aria-label")).toBe("2 comentarios sobre Descuento");
    expect(pin.textContent).toBe("2");
    expect($(document, '.nx-thread__pin[data-key="entrega"]').getAttribute("aria-label")).toBe("Comentar sobre Fecha de entrega");
    // La etiqueta del campo no cambia (el globito no está dentro).
    expect($<HTMLInputElement>(document, "#f-desc").labels![0].textContent).toBe("Descuento");
    // El redactor ofrece anclar a un campo.
    expect([...el.querySelectorAll("select[data-a=on] option")].map((o) => o.textContent)).toEqual(["Sobre un campo…", "Descuento", "Fecha de entrega"]);
    pin.click();
    expect(ids(el)).toEqual(["c2", "c3"]);
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect($(el, ".nx-thread__bar").textContent).toBe("Sobre DescuentoVer todos");
    expect($(el, ".nx-thread__chip").textContent).toBe("Sobre: Descuento×");
    expect(document.activeElement).toBe(box(el));
    type(box(el), "¿Quedó en 10 %?");
    key(box(el), "Enter");
    expect(srv.of("POST", "/api/comentarios")[0].body).toMatchObject({ anchor: "descuento" });
    await until(() => pin.textContent === "3");
    act(el, "all")!.click();
    expect(arts(el).length).toBe(5);
    el.remove();
    expect(document.querySelector(".nx-thread__pin")).toBeNull();
  });

  it("«Sobre un campo…» ancla desde el redactor; `filter()` y `focusComposer()`", async () => {
    const srv = server();
    const el = mount("", FORM);
    await loaded(el);
    await until(() => el.querySelector("select[data-a=on]"));
    const sel = $<HTMLSelectElement>(el, "select[data-a=on]");
    sel.value = "descuento";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect($(el, ".nx-thread__chip").textContent).toBe("Sobre: Descuento×");
    act(el, "x-anchor")!.click();
    expect(el.querySelector(".nx-thread__chip")).toBeNull();
    el.filter("descuento");
    expect(ids(el)).toEqual(["c2", "c3"]);
    el.filter(null);
    expect(ids(el)).toHaveLength(4);
    el.focusComposer("descuento");
    expect(document.activeElement).toBe(box(el));
    type(box(el), "x");
    key(box(el), "Enter");
    expect(srv.of("POST", "/api/comentarios")[0].body!.anchor).toBe("descuento");
  });
});

describe("<nx-thread>: en vivo", () => {
  it("stream: comentarios nuevos (anunciados con cortesía), ediciones, borrados y «escribiendo…»", async () => {
    const srv = server();
    const el = mount('stream="/api/stream"');
    await loaded(el);
    await until(() => srv.streams.length);
    expect(srv.of("GET", "/api/stream")[0].url.searchParams.get("record")).toBe("OC-2291");
    const s = srv.last();
    s.push({ type: "typing", user: LAURA });
    await until(() => !$(el, ".nx-thread__typing").hidden);
    expect($(el, ".nx-thread__typing").textContent).toBe("Laura está escribiendo…");
    // «escribiendo…» no va a la región de anuncios.
    expect($(el, ".nx-thread__sr").textContent).toBe("");
    s.push({ type: "typing", user: ME }); // lo propio no se muestra
    s.push("no es json");
    s.push({ type: "comment", record: "OTRA-1", comment: { id: "z", author: LAURA, text: "de otro registro", at: new Date().toISOString() } });
    s.push({ type: "comment", comment: { id: "c5", author: LAURA, text: "Ya hablé con @[Diego Llinás](u7)", at: new Date().toISOString() } });
    await until(() => el.querySelector('li[data-id="c5"]'));
    expect(el.querySelector('li[data-id="z"]')).toBeNull();
    expect($(el, ".nx-thread__typing").hidden).toBe(true);
    expect($(el, 'li[data-id="c5"] .nx-thread__mention').hasAttribute("data-me")).toBe(true);
    await until(() => $(el, ".nx-thread__sr").textContent, 1500);
    expect($(el, ".nx-thread__sr").textContent).toBe("Nuevo comentario de Laura Gómez");
    s.push({ type: "update", comment: { ...COMMENTS[1], text: "¿Por qué el 12 %? (corregido)", editedAt: new Date().toISOString() } });
    await until(() => $(item(el, "c2"), ".nx-thread__text").textContent === "¿Por qué el 12 %? (corregido)");
    s.push({ type: "delete", id: "c1" });
    await until(() => !el.querySelector('li[data-id="c1"]'));
  });

  it("escribir avisa «typing» como mucho cada 3 s (solo con stream)", async () => {
    const srv = server();
    const el = mount('stream="/api/stream"');
    await loaded(el);
    await until(() => srv.streams.length);
    type(box(el), "a");
    type(box(el), "ab");
    type(box(el), "abc");
    await until(() => srv.of("POST", "/api/comentarios/typing").length);
    await sleep(20);
    expect(srv.of("POST", "/api/comentarios/typing")).toHaveLength(1);
    expect(srv.of("POST", "/api/comentarios/typing")[0].body).toEqual({ record: "OC-2291", user: ME });
  });

  it("se reconecta con espera creciente (1 s, 2 s, 4 s) y, al volver, se pone al día", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const srv = server({ "GET /api/stream": () => new Response("", { headers: { "Content-Type": "application/x-ndjson" } }) });
    const el = mount('stream="/api/stream"');
    const t = track(el);
    const n = () => srv.of("GET", "/api/stream").length;
    for (let i = 0; i < 20 && !n(); i++) await vi.advanceTimersByTimeAsync(0);
    expect(n()).toBe(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(n()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(n()).toBe(2);
    const loads = srv.of("GET", "/api/comentarios").length;
    await vi.advanceTimersByTimeAsync(1999);
    expect(n()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(n()).toBe(3);
    await vi.advanceTimersByTimeAsync(4000);
    expect(n()).toBe(4);
    expect(srv.of("GET", "/api/comentarios").length).toBeGreaterThan(loads - 1);
    expect(srv.of("GET", "/api/comentarios").length).toBeGreaterThanOrEqual(3);
    expect(t.errors).toHaveLength(0);
    // Desconectado: no vuelve a intentar.
    el.remove();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(n()).toBe(4);
  });

  it("un stream que falla emite el error y reintenta", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const srv = server({ "GET /api/stream": () => new Response("", { status: 503 }) });
    const el = mount('stream="/api/stream"');
    const t = track(el);
    for (let i = 0; i < 20 && !t.errors.length; i++) await vi.advanceTimersByTimeAsync(0);
    expect(t.errors[0]).toEqual({ action: "stream", message: "HTTP 503" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(srv.of("GET", "/api/stream")).toHaveLength(2);
    el.remove();
  });

  it("sin stream: sondeo suave cada `poll` segundos, solo con la pestaña visible", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const srv = server();
    const el = mount('poll="30"');
    await loaded(el);
    expect(srv.of("GET", "/api/comentarios")).toHaveLength(1);
    vi.advanceTimersByTime(30_000);
    await until(() => srv.of("GET", "/api/comentarios").length === 2);
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    vi.advanceTimersByTime(60_000);
    expect(srv.of("GET", "/api/comentarios")).toHaveLength(2);
    vis.mockRestore();
    el.setAttribute("poll", "0");
    vi.advanceTimersByTime(120_000);
    expect(srv.of("GET", "/api/comentarios")).toHaveLength(2);
  });

  it("«Laura está viendo»: lo lee de los eventos de <nx-presence>", async () => {
    server();
    const el = mount('presence="aqui"', '<div id="aqui"></div>');
    await loaded(el);
    const pres = $(document, "#aqui") as HTMLElement & { users?: unknown };
    expect($(el, ".nx-thread__here").hidden).toBe(true);
    pres.users = [
      { id: "u12", name: "Laura Gómez", idle: false },
      { id: "u7", name: "Diego Llinás", idle: false },
      { id: "u9", name: "Héctor Díaz", idle: true },
    ];
    pres.dispatchEvent(new CustomEvent("nx-presence-change", { bubbles: true }));
    expect($(el, ".nx-thread__here").textContent).toBe("Laura está viendo");
    pres.users = [
      { id: "u12", name: "Laura Gómez" },
      { id: "u9", name: "Héctor Díaz" },
    ];
    pres.dispatchEvent(new CustomEvent("nx-presence-change", { bubbles: true }));
    expect($(el, ".nx-thread__here").textContent).toBe("Laura y Héctor están viendo");
  });
});

describe("<nx-thread>: borrador, modos, textos y ciclo de vida", () => {
  it("el borrador sobrevive a recargar (sessionStorage por registro); uno roto se ignora", async () => {
    server();
    let el = mount();
    await loaded(el);
    act(item(el, "c4"), "reply")!.click();
    type(box(el), "a medio escribir");
    expect(JSON.parse(sessionStorage.getItem("nx-thread-draft:OC-2291")!)).toMatchObject({ text: "a medio escribir", replyTo: "c4" });
    el = mount();
    expect(box(el).value).toBe("a medio escribir");
    await loaded(el);
    expect($(el, ".nx-thread__chip").textContent).toBe("Respondiendo a Laura Gómez×");
    sessionStorage.setItem("nx-thread-draft:OC-2291", "{roto");
    el = mount();
    expect(box(el).value).toBe("");
    // Enviar lo borra.
    type(box(el), "hola");
    key(box(el), "Enter");
    expect(sessionStorage.getItem("nx-thread-draft:OC-2291")).toBeNull();
  });

  it("readonly: sin redactor ni acciones; los globitos igual filtran", async () => {
    server();
    const el = mount("readonly", FORM);
    await loaded(el);
    expect($(el, ".nx-thread__compose").hidden).toBe(true);
    expect(el.querySelector(".nx-thread__acts")).toBeNull();
    await until(() => document.querySelector(".nx-thread__pin"));
    $<HTMLButtonElement>(document, ".nx-thread__pin").click();
    expect(ids(el)).toEqual(["c2", "c3"]);
    el.readonly = false;
    expect($(el, ".nx-thread__compose").hidden).toBe(false);
  });

  it("disabled: el redactor queda deshabilitado; sin `me` no hay redactor", async () => {
    server();
    const el = mount("disabled");
    await loaded(el);
    expect(box(el).disabled).toBe(true);
    expect(el.querySelector(".nx-thread__acts")).toBeNull();
    el.me = null;
    expect($(el, ".nx-thread__compose").hidden).toBe(true);
  });

  it("labels y locale", async () => {
    server();
    const el = mount(`labels='{"send":"Send","placeholder":"Write…","today":"Today","yesterday":"Yesterday","unknown":"x","reply":5}' locale="en-US"`);
    await loaded(el);
    expect($(el, ".nx-thread__send").textContent).toBe("Send");
    expect(box(el).placeholder).toBe("Write…");
    // Una clave desconocida o un texto que no es texto no pisan nada.
    expect(act(item(el, "c4"), "reply")!.textContent).toBe(THREAD_LABELS.reply);
    const days = [...el.querySelectorAll(".nx-thread__day > h3")].map((h) => h.textContent);
    expect(days.slice(1)).toEqual(["Yesterday", "Today"]);
    expect(days[0]).toMatch(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) [A-Z][a-z]{2} \d{1,2}$/);
    expect($(item(el, "c4"), "time").textContent).toMatch(/ago|now/);
  });

  it("atributos JSON inválidos avisan y no rompen", async () => {
    server();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount(`labels='{roto' anchors='nope' ref-patterns='[' `);
    await loaded(el);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(el.labels.send).toBe("Enviar");
    el.setAttribute("me", "{");
    expect(el.me).toEqual(ME);
  });

  it("propiedades puestas antes de registrarse el elemento se aplican al conectarse", () => {
    // Antes de `define()`, un framework deja propiedades propias que tapan los accesores del
    // prototipo (happy-dom actualiza hasta el contenido de <template>: se simulan tal cual quedan).
    const el = document.createElement("nx-thread") as NxThread;
    const own = { record: "OC-7", me: ME, poll: 0, readonly: true, comments: COMMENTS.slice(0, 1), labels: { heading: "Conversación" } };
    for (const [k, value] of Object.entries(own)) Object.defineProperty(el, k, { value, writable: true, configurable: true, enumerable: true });
    document.body.append(el);
    expect(Object.prototype.hasOwnProperty.call(el, "record")).toBe(false);
    expect(el.getAttribute("record")).toBe("OC-7");
    expect(el.readonly).toBe(true);
    expect(el.me).toEqual(ME);
    expect(ids(el)).toEqual(["c1"]);
    expect($(el, ".nx-thread__title").textContent).toBe("Conversación");
    expect($(el, ".nx-thread__compose").hidden).toBe(true);
  });

  it("propiedades puestas antes de conectarse (como las pone un framework) y sin endpoint", () => {
    const el = document.createElement("nx-thread") as NxThread;
    Object.assign(el, { record: "OC-1", me: ME, poll: 0, comments: COMMENTS.slice(0, 2), labels: { send: "Mandar" }, refPatterns: ["OC-\\d+"] });
    document.body.append(el);
    expect(el.getAttribute("record")).toBe("OC-1");
    expect(ids(el)).toEqual(["c1", "c2"]);
    expect($(el, ".nx-thread__send").textContent).toBe("Mandar");
    expect(el.refPatterns).toEqual(["OC-\\d+"]);
    // Sin endpoint, el envío es local: queda confirmado y se avisa.
    type(box(el), "local");
    key(box(el), "Enter");
    return until(() => el.comments.length === 3 && !el.comments[2].state);
  });

  it("desconectar aborta todo: la carga, el stream y la búsqueda", async () => {
    const signals: AbortSignal[] = [];
    const srv = server({
      "GET /api/personas": (c) => (signals.push(c.init.signal!), new Promise(() => {})),
    });
    const el = mount('stream="/api/stream" people-source="/api/personas"');
    await loaded(el);
    await until(() => srv.streams.length);
    type(box(el), "@la");
    await until(() => signals.length);
    el.reload();
    el.remove();
    const pending = srv.calls.filter((c) => c.init.signal && !c.init.keepalive);
    expect(pending.length).toBeGreaterThanOrEqual(3);
    expect(pending.every((c) => c.init.signal!.aborted)).toBe(true);
    const n = srv.calls.length;
    await sleep(1200);
    expect(srv.calls.length).toBe(n);
  });

  it("otro registro: de cero (lista, borrador y stream)", async () => {
    const srv = server();
    const el = mount('stream="/api/stream"');
    await loaded(el);
    await until(() => srv.streams.length);
    sessionStorage.setItem("nx-thread-draft:OC-9", JSON.stringify({ text: "del otro" }));
    el.record = "OC-9";
    expect(box(el).value).toBe("del otro");
    await until(() => srv.of("GET", "/api/comentarios").length === 2);
    expect(srv.of("GET", "/api/comentarios")[1].url.searchParams.get("record")).toBe("OC-9");
    await until(() => srv.streams.length === 2);
    expect(srv.of("GET", "/api/stream")[0].init.signal!.aborted).toBe(true);
    expect(srv.of("GET", "/api/stream")[1].url.searchParams.get("record")).toBe("OC-9");
  });
});

describe("<nx-thread>: la demo de la galería", () => {
  it("la OC-2291 con su API de mentira: 8 comentarios, lo resuelto plegado, globitos, «Nuevos», enviar y «Laura está viendo»", async () => {
    const { readFileSync } = await import("node:fs");
    const { demoFetch } = await import("../gallery/demo-api");
    const { mountThreadDemo } = await import("../gallery/demo-thread");
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => demoFetch(input, init) ?? Promise.reject(new Error(`fuera de la demo: ${String(input)}`)));
    document.body.innerHTML = readFileSync("gallery/pages/thread.html", "utf8");
    const root = document.createElement("main");
    root.append(document.querySelector<HTMLTemplateElement>("#page-thread")!.content.cloneNode(true));
    document.body.replaceChildren(root);
    mountThreadDemo(root);
    const el = $<NxThread>(root, "#hilo-thread");
    await until(() => el.comments.length === 8, 3000);
    // t2 (el descuento) está resuelta: sus respuestas se pliegan con ella.
    expect(ids(el)).toEqual(["t1", "t5", "t6", "t7", "t8"]);
    expect(item(el, "t2").textContent).toBe("Sobre: Descuento · Resuelto por Laura Gómezver");
    expect(el.querySelector(".nx-thread__unread")!.nextElementSibling!.getAttribute("data-id")).toBe("t7");
    await until(() => root.querySelectorAll(".nx-thread__pin").length === 2);
    expect($(root, '.nx-thread__pin[data-key="descuento"]').getAttribute("aria-label")).toBe("Comentar sobre Descuento");
    expect($(root, '.nx-thread__pin[data-key="entrega"]').getAttribute("aria-label")).toBe("2 comentarios sobre Fecha de entrega");
    expect($(root, '.nx-thread__pin[data-key="entrega"]').previousElementSibling!.textContent).toBe("Fecha de entrega");
    // FV-1873 lleva a su registro; OC-2291 (por el patrón) es una ficha.
    expect($(item(el, "t6"), "a.nx-thread__ref").getAttribute("href")).toBe("#/thread");
    expect($(item(el, "t1"), ".nx-thread__ref").textContent).toBe("OC-2291");
    type(box(el), "Apruebo la orden");
    key(box(el), "Enter");
    await until(() => el.comments.some((c) => c.text === "Apruebo la orden" && !c.state), 3000);
    $<HTMLButtonElement>(root, "#hilo-live").click();
    await until(() => $(el, ".nx-thread__here").textContent === "Laura está viendo");
    $<HTMLButtonElement>(root, "#hilo-live").click();
    expect(root.querySelector("#hilo-log")!.children.length).toBeGreaterThan(0);
    // Restaurar, para no dejar el estado de la demo cambiado.
    $<HTMLButtonElement>(root, "#hilo-reset").click();
    await until(() => el.comments.length === 8, 3000);
    el.remove();
  });
});
