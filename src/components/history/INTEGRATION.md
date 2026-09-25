# `<nx-history>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["History", { tag: "nx-history", props: ["record", "fields", "events", "source", "user", "undo", "heading", "labels"] }],
```

## Peso

Medido con los comandos del brief (esbuild, minificado + gzip -9):

| Pieza | Medido | Límite propuesto |
|---|---|---|
| `src/components/history/index.ts` (incluye `nxToast` y el núcleo) | 10 197 B (9,96 KB) | `["dist/history.js", 10.5 * 1024, "history + toast + núcleo (ESM)"]` |
| `src/components/history/history.css` | 3 055 B (2,98 KB) | `["dist/history.css", 3.25 * 1024, "history (CSS)"]` |

Además, como con survey: `history: "src/components/history/index.ts"` en las entradas de
`vite.config.ts` (build de la librería) y `history: "src/components/history/history.css"` en
`scripts/build-css.mjs`.

## Nav

En `gallery/main.ts` (no hay un ícono de reloj en `src/icons/lucide.ts`; `calendar` es el más cercano):

```ts
  { id: "history", label: "Historial", href: "#/history", icon: "calendar", section: "Componentes", badge: "Nuevo" },
```

y en `PAGES`, con `import { mountHistoryDemo } from "./demo-history";`:

```ts
  "#/history": { template: "page-history", mount: mountHistoryDemo },
```

La plantilla está en `gallery/pages/history.html` (va en `gallery/index.html`, después de `page-survey`).
El backend de mentira está en `gallery/server-history.ts`; en `vite.config.ts`:

```ts
import { configureHistory } from "./gallery/server-history";
// … en los plugins de `serve`:
{ name: "nx-demo-history", configureServer: configureHistory },
```

## Solid

En `src/solid/index.tsx`:

```tsx
import "../components/history/index";
import type { NxHistory } from "../components/history/history";
import type { HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail, HistoryValue } from "../components/history/types";

export type { NxHistory, HistoryActor, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryLabels, HistoryRevertDetail };

export interface HistoryProps extends JSX.HTMLAttributes<NxHistory> {
  /** El registro como está hoy. */
  record?: Record<string, unknown>;
  fields?: HistoryField[];
  events?: HistoryEvent[];
  /** URL que devuelve `{events, record?, more?}` y pagina con `?before=<id>`. */
  source?: string;
  /** Quién comenta y revierte desde aquí. */
  user?: HistoryActor;
  /** Milisegundos para deshacer una reversión (7000); 0 la registra al instante. */
  undo?: number;
  heading?: string;
  locale?: string;
  labels?: Partial<HistoryLabels>;
  /** Cancelable: la reversión no se aplica. */
  onRevert?: (e: CustomEvent<HistoryRevertDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se guarda en el backend. */
  onCommit?: (e: CustomEvent<HistoryCommitDetail>) => void;
  /** Cancelable: la nota no se agrega. */
  onComment?: (e: CustomEvent<{ text: string }>) => void;
  onTravel?: (e: CustomEvent<{ id: string | null; record: Record<string, HistoryValue> }>) => void;
}

export function History(props: HistoryProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "fields", "events", "source", "user", "undo", "heading", "locale", "labels", "onRevert", "onCommit", "onComment", "onTravel"]);
  return (
    <nx-history
      {...rest}
      prop:record={local.record}
      prop:fields={local.fields}
      prop:events={local.events}
      prop:user={local.user}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      on:nx-history-revert={(e) => local.onRevert?.(e)}
      on:nx-history-commit={(e) => local.onCommit?.(e)}
      on:nx-history-comment={(e) => local.onComment?.(e)}
      on:nx-history-travel={(e) => local.onTravel?.(e)}
    />
  );
}
```

En `declare module "solid-js"`:

- `ExplicitProperties`: agregar
  ```ts
  record: Record<string, unknown> | undefined;
  events: HistoryEvent[] | undefined;
  user: HistoryActor | null | undefined;
  ```
  y ampliar los que ya existen: `fields: SelectField[] | HistoryField[] | undefined;` y
  `labels: … | Partial<HistoryLabels> | undefined;`.
- `ExplicitAttributes`: nada nuevo (`source`, `heading`, `undo` y `locale` ya están).
- `ExplicitBoolAttributes`: nada.
- `CustomEvents`:
  ```ts
  "nx-history-revert": CustomEvent<HistoryRevertDetail>;
  "nx-history-commit": CustomEvent<HistoryCommitDetail>;
  "nx-history-comment": CustomEvent<{ text: string }>;
  "nx-history-travel": CustomEvent<{ id: string | null; record: Record<string, HistoryValue> }>;
  ```
- `IntrinsicElements`:
  ```ts
  "nx-history": HTMLAttributes<NxHistory> & { heading?: string; source?: string };
  ```

Y en el comentario de cabecera, `<History>` en la lista de envoltorios.

## README

````md
## `<nx-history>`

La máquina del tiempo de un registro: quién cambió qué y cuándo, y cómo estaba en cualquier momento.

- **Línea de tiempo** del más nuevo al más viejo, agrupada por día («Hoy», «Ayer», «lunes 21 de
  septiembre»), con la hora relativa («hace 3 h») y el avatar o las iniciales de quien lo hizo.
  Cada cambio se lee «Estado: Por aprobar → Aprobada», con el formato de su campo (`money`,
  `number`, `date`, `status` con su tono, o la etiqueta de `options`).
- **Textos largos como diferencia por palabras:** lo quitado tachado en rojo suave, lo agregado en
  verde suave (subsecuencia común más larga, `wordDiff()`).
- **Viaje en el tiempo:** un deslizador (y ←/→, Inicio/Fin sobre él) recorre los eventos; el panel
  muestra el registro como estaba en ese momento —reconstruido desde el de hoy deshaciendo los
  cambios posteriores (`historyStateAt()`)—, con lo que cambió desde entonces marcado y su valor
  actual. «Así estaba el 12 sept 2026, 3:40 p. m.». Esc o «Volver al presente» regresan.
- **Filtros** por persona y por campo (chips con su conteo) y un buscador sin tildes que también
  encuentra valores formateados.
- **Revertir** un cambio que sigue vigente: `nx-history-revert` (cancelable), se aplica al instante
  con un evento que lo cuenta, se deshace desde el aviso (o Ctrl+Z) y, al acabar el tiempo,
  `nx-history-commit`: ahí la app guarda.
- **Notas** que aparecen al instante (`nx-history-comment`, cancelable).
- **`source`:** una URL que devuelve `{events, record?, more?}`; al llegar al final de la línea pide
  `?before=<id>` (la página anterior).

```html
<nx-history id="historia" heading="OC-2291" source="/compras/oc-2291/historial"></nx-history>
<script>
  historia.fields = [
    { key: "estado", label: "Estado", type: "status",
      options: [{ value: "por-aprobar", label: "Por aprobar", tone: "warning" }, { value: "aprobada", label: "Aprobada", tone: "success" }] },
    { key: "monto", label: "Monto", type: "money", currency: "COP" },
    { key: "observaciones", label: "Observaciones" },
  ];
  historia.user = { name: "Sofía Herrera" };
  historia.addEventListener("nx-history-commit", (e) =>
    fetch("/compras/oc-2291", { method: "PATCH", body: JSON.stringify({ [e.detail.change.field]: e.detail.change.from }) }));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `record`, `fields` (`{key, label, type?, currency?, options?}`), `events` (`{id, at, actor: {name, avatar?}, action, changes?: [{field, from, to}], note?, revertOf?}`), `source`, `user`, `undo` (ms, 7000; 0 = sin aviso), `heading`, `locale`, `labels` · `at`, `snapshot` |
| Métodos | `travel(id \| null)`, `revert(id, field)` → `"commit"` \| `"undo"` \| `"cancel"`, `comment(text)`, `reload()` |
| Eventos | `nx-history-revert` `{event, change}` (cancelable), `nx-history-commit` `{event, change, revert, record}`, `nx-history-comment` `{text}` (cancelable), `nx-history-travel` `{id, record}` |
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("historial: la línea, viajando en el tiempo y con un filtro", async ({ page }) => {
  await open(page, "#/history");
  const h = page.locator("#history-demo");
  await expect(h.locator(".nx-history__ev")).toHaveCount(15);
  await audit(page, ["#history-demo"]);
  await h.getByRole("slider", { name: "Viaje en el tiempo" }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
  await expect(h.getByRole("button", { name: "Volver al presente" })).toBeVisible();
  await audit(page, ["#history-demo"]);
  await h.getByRole("button", { name: /^Andrés Ruiz/ }).click();
  await h.locator(".nx-history__revert").first().focus();
  await audit(page, ["#history-demo"]);
});
```

(Lo corrí en claro y en oscuro: cero violaciones serias o críticas.)

## Notas

- No toqué `src/core/`. El componente importa `nxToast` de `../toast/toast` y registra el toaster
  con `../toast/index`, como `<nx-inbox>`.
- CSS: agregar `@import "../components/history/history.css";` a `src/styles/nx-ui.css`.
- `src/index.ts`: `export * from "./components/history/index";` (o la lista explícita como los
  demás). Exporta `NxHistory`, `HISTORY_LABELS`, `historyStateAt`, `wordDiff`, `revertChange`,
  `cleanHistoryEvents` y los tipos `History*`/`DiffPart`.
- La demo arranca con los 15 eventos más nuevos de la OC-2291 (`source`); los 10 más viejos llegan
  al bajar hasta el final de la línea (o al filtrar, cuando la lista se acorta y el final queda a la
  vista). Las fechas de la demo se cuentan desde hoy, así siempre hay algo de «Hoy» y de «Ayer».
- Sin `user`, las notas y reversiones salen como «Tú» con el verbo en tercera persona («Tú
  comentó»): conviene pasar siempre `user`.
- La prueba DOM fija el reloj (`vi.useFakeTimers({ toFake: ["Date"] })`) para que «Hoy», «Ayer» y
  «hace 3 h» no dependan de la hora a la que corre.
- `npx tsc --noEmit -p .` solo da los errores que ya había en `examples/solid/main.tsx` (no
  encuentra `nx-ui` sin un `dist/` construido); nada de este componente.
