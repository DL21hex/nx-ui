/**
 * Demo de `<nx-account>`: un ERP pequeño (menú de 5 pantallas) con la tarjeta de Diego Llinás al pie.
 *
 * La API es de mentira y vive en esta pestaña (`addDemoRoute("/demo/account", …)`): extender la
 * sesión y buscar personas para «Ver como…». Los cambios sin sincronizar van a una cola de verdad
 * (`createSync({name: "nx-sync:demo-cuenta"})`, en memoria) con un servidor lento (4 s por envío): la
 * cuenta la toma por su nombre (`sync="nx-sync:demo-cuenta"`). «Sin conexión» corta la red de esa cola.
 *
 * La galería ya guarda su tema y su paleta (`nx32-elements-gallery-theme`/`-palette`): la cuenta va con
 * `storage="none"` y, cuando cambia, escribe esas claves y marca los botones de la galería. Así no
 * hay dos preferencias peleándose (ver INTEGRATION.md).
 */
import "../src/components/account/index";
import "../src/components/keytips/index";
import type { NxAccount } from "../src/components/account/index";
import type { NxSidemenu } from "../src/components/sidemenu/index";
import { createSync, syncMemoryStore, type SyncQueue } from "../src/components/sync/index";
import { addDemoRoute } from "./demo-api";

const PEOPLE = [
  { id: "u01", name: "Ana María Rincón", role: "Cajera · Medellín" },
  { id: "u02", name: "Héctor Galeano", role: "Jefe de bodega · Bogotá" },
  { id: "u03", name: "Laura Restrepo", role: "Asesora comercial · Medellín" },
  { id: "u04", name: "Walber Pumarejo", role: "Técnico electricista · Cali" },
  { id: "u05", name: "Sofía Castaño", role: "Contadora · Bogotá" },
  { id: "u06", name: "Julián Ospina", role: "Aprobador de compras · Cali" },
];
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let routes = false;
/** La cola de la demo: una por página (la cuenta la busca por su nombre). */
let queue: SyncQueue | undefined;
let online = true;

function installRoutes(): void {
  if (routes) return;
  routes = true;
  addDemoRoute("/demo/account", async (req, out) => {
    const path = req.url.pathname.slice(req.url.pathname.indexOf("/demo/account") + "/demo/account".length);
    const reply = (o: unknown, status = 200) => {
      out.status(status);
      out.type("application/json");
      out.end(JSON.stringify(o));
    };
    await sleep(300);
    if (path === "/extend") return reply({ expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() });
    if (path === "/people") {
      const q = fold(req.url.searchParams.get("q") ?? "");
      return reply(PEOPLE.filter((p) => fold(`${p.name} ${p.role}`).includes(q)));
    }
    reply({ error: "No existe" }, 404);
  });
}

export function mountAccountDemo(root: HTMLElement): void {
  installRoutes();
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const acc = $<NxAccount>("#acc");
  const menu = $<NxSidemenu>("#acc-menu");
  const log = $<HTMLOListElement>("#acc-log");
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild!.remove();
  };

  menu.items = [
    { id: "inicio", label: "Inicio", href: "#/account", icon: "house" },
    { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", icon: "shopping-cart", badge: 4 },
    { id: "compras", label: "Compras", href: "/compras", icon: "receipt" },
    { id: "inventario", label: "Inventario", href: "/inventario", icon: "warehouse" },
    { id: "informes", label: "Informes", href: "/informes", icon: "chart-column" },
  ];
  // En la demo ninguna hoja navega: solo se anota.
  menu.addEventListener("nx-sidemenu-select", (e) => {
    e.preventDefault();
    menu.active = e.detail.item.href ?? null;
    add(`Menú → ${e.detail.item.label}`);
  });
  $<HTMLInputElement>("#acc-collapsed").addEventListener("change", (e) => (menu.collapsed = (e.target as HTMLInputElement).checked));

  acc.user = { name: "Diego Llinás", email: "diego.llinas@crear.co" };
  acc.tenants = [
    { id: "cc-med", name: "Crear Colombia S.A.S.", detail: "Sede Medellín", role: "Aprobador", group: "Crear Colombia S.A.S." },
    { id: "cc-bog", name: "Crear Colombia S.A.S.", detail: "Sede Bogotá", role: "Consulta", group: "Crear Colombia S.A.S." },
    { id: "nx-cali", name: "nx32 Quality", detail: "Sede Cali", role: "Administrador", group: "nx32 Quality" },
  ];
  acc.current = "cc-med";
  acc.items = [
    { id: "perfil", label: "Mi perfil", icon: "user" },
    { id: "config", label: "Configuración", icon: "settings", hint: "Ctrl ," },
  ];
  acc.session = { expiresAt: Date.now() + 25 * 60_000, extendEndpoint: "/demo/account/extend" };

  // ---------------------------------------------------------------- la cola de esta persona
  // Una cola por usuario, como en una app de verdad; el «servidor» tarda 4 s por cambio, así se alcanza
  // a ver el anillo ámbar y a cerrar sesión con pendientes.
  online = true;
  queue ??= createSync({
    name: "nx-sync:demo-cuenta",
    store: syncMemoryStore(),
    locks: null,
    channel: null,
    network: () => online,
    fetch: async () => {
      await sleep(4000);
      if (!online) throw new TypeError("Sin conexión (demo)");
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });
  const cola = queue;
  let n = 0;
  const off = cola.subscribe((st, ev) => {
    if (!root.isConnected) return off();
    if (ev?.type === "done") add(`Sincronizado: queda${st.pending === 1 ? "" : "n"} ${st.pending}`);
  });
  $("#acc-pending").addEventListener("click", () => {
    for (let i = 0; i < 3; i++) void cola.enqueue({ method: "POST", url: "/demo/account/cambios", body: { n: ++n }, label: `Cambio ${n}` });
    add("3 cambios en cola (el servidor tarda 4 s por cada uno)");
  });
  $<HTMLInputElement>("#acc-offline").addEventListener("change", (e) => {
    online = !(e.target as HTMLInputElement).checked;
    void cola.check();
  });
  $("#acc-expire").addEventListener("click", () => {
    acc.session = { expiresAt: Date.now() + 60_000, extendEndpoint: "/demo/account/extend" };
    add("La sesión vence en 1 min (aviso: 5 min antes)");
  });

  // ---------------------------------------------------------------- la galería y la cuenta, un solo tema
  const galleryTheme = (theme: string) => {
    for (const b of document.querySelectorAll<HTMLButtonElement>("[data-theme-set]")) b.setAttribute("aria-pressed", String(b.dataset.themeSet === (theme === "system" ? "auto" : theme)));
  };
  acc.addEventListener("nx-account-theme", (e) => {
    const { theme, palette } = e.detail;
    add(`nx-account-theme → ${theme} · ${palette}`);
    galleryTheme(theme);
    try {
      localStorage.setItem("nx32-elements-gallery-theme", theme === "system" ? "auto" : theme);
      localStorage.setItem("nx32-elements-gallery-palette", palette);
    } catch {
      /* sin almacenamiento */
    }
  });

  // ---------------------------------------------------------------- registro de eventos
  const org = $("#acc-org");
  const paintOrg = () => {
    const t = acc.tenants.find((x) => x.id === acc.current);
    org.textContent = t ? `${t.name} · ${t.detail}` : "";
  };
  paintOrg();
  acc.addEventListener("nx-account-switch", (e) => {
    add(`nx-account-switch → ${e.detail.tenant.name} · ${e.detail.tenant.detail}`);
    queueMicrotask(paintOrg);
  });
  acc.addEventListener("nx-account-status", (e) => add(`nx-account-status → ${e.detail.status}${e.detail.until ? ` hasta ${new Date(e.detail.until).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}` : ""}`));
  acc.addEventListener("nx-account-locale", (e) => add(`nx-account-locale → ${e.detail.locale} (la página cambió de lang)`));
  acc.addEventListener("nx-account-select", (e) => add(`nx-account-select → ${e.detail.id}`));
  acc.addEventListener("nx-account-view-as", (e) => add(`nx-account-view-as → ${e.detail.user ? e.detail.user.name : "salir"}`));
  acc.addEventListener("nx-account-extend", () => add("nx-account-extend → POST /demo/account/extend"));
  acc.addEventListener("nx-account-expired", () => add("nx-account-expired → la app pediría iniciar sesión"));
  acc.addEventListener("nx-account-logout", (e) => add(`nx-account-logout → sesión cerrada${e.detail.pending ? ` (${e.detail.pending} sin enviar)` : ""} (en la demo no se navega)`));
  acc.addEventListener("nx-open-change", (e) => add(`nx-open-change → ${e.detail.open ? "abierto" : "cerrado"}`));

  // Las acciones de la cuenta también en la paleta de comandos de la galería (Ctrl K).
  document.querySelector("#cmd")?.setAttribute("account", "acc");
}
