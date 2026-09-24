import { Route, Router, useLocation, type RouteSectionProps } from "@solidjs/router";
import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import "nx-ui/nx-ui.css";
import { registerIcons } from "nx-ui";
import { lucide } from "nx-ui/icons";
import { SideMenu, type MenuItem } from "nx-ui/solid";
import "./app.css";

registerIcons(lucide);

const MENU: MenuItem[] = [
  { id: "inicio", label: "Inicio", href: "/", icon: "house" },
  {
    id: "ventas",
    label: "Ventas",
    icon: "shopping-cart",
    section: "Operación",
    children: [
      { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", icon: "receipt" },
      { id: "clientes", label: "Clientes", href: "/ventas/clientes", icon: "users" },
    ],
  },
  { id: "bodegas", label: "Bodegas", href: "/inventario/bodegas", icon: "warehouse", section: "Operación" },
];

function Layout(props: RouteSectionProps) {
  const loc = useLocation();
  // Estado compacto controlado por la app: se cancela nx-toggle y se guarda en una señal.
  const [compact, setCompact] = createSignal(false);
  return (
    <div class="shell">
      <SideMenu
        id="menu"
        items={MENU}
        active={loc.pathname}
        collapsible
        collapsed={compact()}
        onToggle={(e) => {
          e.preventDefault();
          setCompact(e.detail.collapsed);
        }}
      >
        <a slot="header" class="brand" href="/">
          Solid + nx-ui
        </a>
      </SideMenu>
      <main>
        <div class="bar">
          <button type="button" class="burger" popovertarget="menu" aria-label="Abrir menú">
            ☰
          </button>
          <span>Ruta:</span> <code id="where">{loc.pathname}</code>
        </div>
        {props.children}
      </main>
    </div>
  );
}

const page = (title: string) => () => (
  <section>
    <h1>{title}</h1>
    <p>Pintada por @solidjs/router sin recargar la página: los enlaces del menú son &lt;a href&gt; normales.</p>
  </section>
);

render(
  () => (
    <Router root={Layout}>
      <Route path="/" component={page("Inicio")} />
      <Route path="/ventas/pedidos" component={page("Pedidos")} />
      <Route path="/ventas/clientes" component={page("Clientes")} />
      <Route path="/inventario/bodegas" component={page("Bodegas")} />
      <Route path="*" component={page("No encontrado")} />
    </Router>
  ),
  document.getElementById("root")!,
);
