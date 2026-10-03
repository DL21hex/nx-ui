# `<nx-keytips>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Keytips", { tag: "nx-keytips", props: ["scope", "key", "disabled", "labels"] }],
```

## Peso

Medido con los comandos del brief (esbuild min + gzip -9):

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/keytips.js`: keytips + núcleo (ESM) | **4.042 B (3,95 KB)** | 4,25 KB |
| `dist/keytips.css` | **520 B (0,51 KB)** | 0,75 KB |

Para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/keytips.js", 4.25 * 1024, "keytips + núcleo (ESM)"],
  // …
  ["dist/keytips.css", 0.75 * 1024, "keytips (CSS)"],
```

Del núcleo arrastra solo `define`/`Base`/`boolAttr`, `h`, `mergeLabels` y `foldText`.

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "keytips", label: "Atajos con Alt", href: "#/keytips", icon: "settings", section: "Componentes", badge: "Nuevo" },
```

(No hay un ícono de teclado en `src/icons/lucide.ts`; `settings` es lo más cercano. Si se agrega
`keyboard` de Lucide, usar ese.)

Y en `PAGES`: `"#/keytips": { template: "page-keytips", mount: mountKeytipsDemo },` con
`import { mountKeytipsDemo } from "./demo-keytips";` e `import "./pages/keytips.css";` (el CSS de la
demo). La plantilla está en `gallery/pages/keytips.html` para pegarla en `gallery/index.html`.

La página tiene su propio `<nx-keytips id="kt" scope="#kt-order">` dentro de la plantilla (se
desconecta al cambiar de página, y con él sus listeners). **No poner otro `<nx-keytips>` global en
la galería** mientras exista esa página: dos instancias responden al mismo toque de Alt. Si se quiere
en toda la galería, ponerlo una vez en `index.html` y quitar el de la plantilla (la demo usa
`#kt` para `scope`, la hoja de atajos y el registro: bastaría con buscarlo en `document`).

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<Keytips>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/keytips/index";
import type { NxKeytips } from "../components/keytips/keytips";
import type { KeytipAssignment, KeytipDetail, KeytipsLabels } from "../components/keytips/types";

export type { NxKeytips, KeytipAssignment, KeytipDetail, KeytipsLabels };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<KeytipsLabels>` a la unión.
    }
    interface ExplicitAttributes {
      scope: string | undefined;
      key: string | undefined;
    }
    interface ExplicitBoolAttributes {
      // `disabled` ya existe.
    }
    interface CustomEvents {
      "nx-keytips-activate": CustomEvent<KeytipDetail>;
      // `nx-open-change` ya existe con `OpenChangeDetail` ({open}): es el mismo detalle.
    }
    interface IntrinsicElements {
      "nx-keytips": HTMLAttributes<NxKeytips>;
    }
```

El envoltorio (al final del archivo):

```tsx
export interface KeytipsProps extends JSX.HTMLAttributes<NxKeytips> {
  /** Selector de la región con atajos (por defecto, toda la página). */
  scope?: string;
  /** La tecla que los muestra: `Alt` (por defecto), `Control`, `Shift` o `Meta`; `none`: solo con `show()`. */
  key?: string;
  disabled?: boolean;
  labels?: Partial<KeytipsLabels>;
  /** Antes de ejecutar una acción: `{key, target, name}`. Cancelable. */
  onActivate?: (e: CustomEvent<KeytipDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function Keytips(props: KeytipsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["scope", "key", "disabled", "labels", "onActivate", "onOpenChange"]);
  return (
    <nx-keytips
      {...rest}
      prop:labels={local.labels}
      attr:scope={local.scope}
      attr:key={local.key}
      bool:disabled={!!local.disabled}
      on:nx-keytips-activate={(e) => local.onActivate?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}
```

(Si `key` como nombre de prop molesta en algún linter de JSX, se puede exponer como `trigger` en el
envoltorio y mapearlo a `attr:key`.)

## README

````md
## `<nx-keytips>`

Atajos de teclado sin configurar nada, como los KeyTips de Office. Se pone una vez en la página;
se **toca Alt** (se presiona y se suelta, sola) y cada acción visible muestra una letra en una
etiqueta pequeña; se pulsa la letra y se ejecuta. Esc, Tab, un clic o otro toque de Alt los ocultan.
Mantener Alt ~400 ms también los muestra (y Alt+letra sin soltar ejecuta).

- **Qué recibe letra:** botones, enlaces, pestañas, `summary`, casillas, campos, listas,
  `contenteditable`, lo tabulable con nombre y lo marcado con `data-keytip`; solo lo visible y sin
  tapar dentro de `scope`. Nada deshabilitado, inerte, oculto ni `data-keytip="off"` (en un
  contenedor, todo lo de adentro). Con un diálogo modal (`<nx-dialog>`, `<dialog>`) o un popover
  abierto, solo lo de adentro.
- **Qué letra:** la inicial de la primera palabra que importa del nombre accesible, sin tildes
  («Guardar» G, «Enviar al cliente» E), luego las iniciales de las demás palabras y luego sus otras
  letras. `data-keytip="X"` la fija. Es **estable**: el mismo elemento conserva su letra entre
  aperturas mientras siga en pantalla. Con más de 30 acciones, dos letras (como Vimium): la primera
  atenúa las que no empiezan por ella. `assignKeytips()` es la misma asignación, pura.
- **Qué hace:** un clic (botones, enlaces, pestañas, casillas; en `<nx-button>`, su botón) o el
  foco con el texto seleccionado (campos). Antes sale `nx-keytips-activate`, cancelable.
- **No estorba:** funciona mientras se escribe en un campo (la letra no se escribe); Alt+Tab, AltGr
  para «@» y Ctrl+Alt no lo activan; Tab y los atajos con Ctrl/⌘ (la paleta con Ctrl+K) cierran los
  atajos y siguen su camino. Cerrado, solo escucha `keydown`/`keyup`.

```html
<nx-keytips></nx-keytips>

<button data-keytip="X">Exportar a Excel</button>  <!-- letra fija -->
<button data-keytip="off">Eliminar</button>         <!-- sin atajo -->
```

| | |
|---|---|
| Propiedades / atributos | `scope` (selector), `key` (`Alt`, `Control`, `Shift`, `Meta` o `none`), `disabled`, `labels` · `open`, `assignments` (`[{key, name, element}]`) |
| Métodos | `show()`, `hide()` |
| Eventos | `nx-keytips-activate` `{key, target, name}` (cancelable), `nx-open-change` `{open}` |
| Funciones | `assignKeytips([{name, forced?, prev?}])` → códigos, `keytipLetters(nombre)` |
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/keytips/index";` (los nombres no chocan:
  `NxKeytips`, `KEYTIPS_LABELS`, `KEYTIPS_SINGLE_MAX`, `assignKeytips`, `keytipLetters`,
  `keytipChar`, `cleanKeytip` y los tipos `Keytip*`).
- `src/styles/nx32-elements.css` → `@import "../components/keytips/keytips.css";`
- `vite.config.ts` (entradas de la librería) → `keytips: "src/components/keytips/index.ts"`.
- `scripts/build-css.mjs` → `"keytips": "src/components/keytips/keytips.css"`.
- `package.json` → `"./keytips": { "types": "./dist/types/components/keytips/index.d.ts", "import": "./dist/keytips.js" }`
  y `"./keytips.css": "./dist/keytips.css"`.

## Notas

- **Evento de apertura:** se siguió la convención de la librería, `nx-open-change` `{open}` (como
  `<nx-dialog>`, `<nx-command>`, `<nx-sidemenu>`), no `nx-keytips-open`/`-close`. Ojo: `nxToast`
  escucha `nx-open-change` en el documento y vuelve a subir el `<nx-toaster>` a la capa superior; es
  inofensivo (queda por encima de las etiquetas, que no reciben el mouse).
- **Capa superior:** la capa es un `div[popover="manual"]` dentro del elemento; al abrir se oculta y
  se vuelve a mostrar para quedar por encima de lo que ya esté en la capa superior (el
  `<nx-dialog>` abierto). Sin Popover API, es `position: fixed` con un z-index alto.
- **Un modal nativo (`dialog.showModal()`) vuelve inerte el resto del documento**, incluida la
  región `role="status"` del componente: el anuncio de apertura puede no leerse con un `<dialog>`
  nativo abierto. Con `<nx-dialog>` (popover, no inerte) sí se lee.
- **`aria-keyshortcuts` no se puso:** no puede expresar una secuencia («Alt, luego G»), y mientras
  los atajos están a la vista Tab los cierra, así que un lector de pantalla no llegaría a leerlo en
  el elemento. La hoja de ayuda se puede armar con `assignments`.
- **`chain` (reabrir tras una acción que abre algo) no se implementó:** otro toque de Alt basta, y
  así es predecible.
- **Tecla física vs. distribución:** manda `event.key` (en AZERTY la A es la A). Solo con Alt
  presionada y un `key` que no es letra (Mac: Opción+G escribe «©») se usa `event.code`. Un símbolo
  sin Alt («@» con AltGr en Linux) no es ninguna letra.
- **Ctrl/⌘ con los atajos a la vista** cierran y dejan pasar la tecla (Ctrl+C, Ctrl+K), en vez de
  consumirla: así `<nx-command>` sigue abriendo con Ctrl+K.
- **Recalcular:** abierto, un `scroll` (en captura, pasivo), `resize` o cambio de DOM (un
  `MutationObserver` que existe solo mientras está abierto: hijos y los atributos `hidden`,
  `disabled`, `inert`, `open`, `aria-disabled`, `data-keytip`; no `class` ni `style`, para que un
  spinner no lo haga recalcular en cada cuadro) recalcula en el siguiente `requestAnimationFrame`.
  Las etiquetas que ya están se actualizan en su lugar. Un clic, `blur` de la ventana o quedarse sin
  acciones los cierra.
- **Nombre accesible aproximado:** `aria-label`, `aria-labelledby`, el `<label>` (sin el texto del
  control que envuelve), el texto (`textContent`: incluye texto oculto dentro del control), `title`
  y `placeholder`. Un envoltorio con `data-keytip` (un `<nx-button>`) toma el nombre de su primer
  control. Con `fieldset[disabled]` se excluye todo lo de adentro (también lo de su primer
  `<legend>`, que por la especificación no está deshabilitado).

### Sin verificar (no se corrió ningún navegador)

Todo lo de abajo está probado solo en happy-dom (sin layout, sin Popover API real, sin
`elementFromPoint`). Para una prueba e2e conviene cubrirlo:

- **Posicionamiento real** de las etiquetas (esquina superior izquierda, dentro de la pantalla) y
  que no tapen el texto de botones pequeños o pestañas juntas.
- **Capa superior:** que la capa quede por encima de un `<nx-dialog>` abierto y de popovers, y que
  `hidePopover()`/`showPopover()` al abrir no cierre popovers `auto` abiertos.
- **`elementFromPoint`:** que lo tapado (el fondo detrás de un diálogo, lo recortado por un
  contenedor con scroll) quede fuera, y que casillas con el `<input>` visualmente oculto dentro de
  su `<label>` sigan recibiendo letra.
- **Alt real:** en Firefox (Windows/Linux) que `preventDefault` en el `keyup` evite la barra de
  menú; en Chrome/Edge Windows, que el toque de Alt no enfoque el menú del navegador (no está
  garantizado) y que Alt+letra con los atajos a la vista no abra menús del navegador (Alt+F, Alt+E:
  por eso se prioriza el toque); en Mac, Opción sola y Opción+letra; AltGr en teclados latinos de
  Windows (llega como Ctrl+Alt) y Linux (`AltGraph`).
- **`checkVisibility`** con `visibilityProperty` (Chrome 121+, Firefox 122+, Safari 17.4+; antes
  cuenta `checkVisibilityCSS`).
