# `<nx-tabs>`: integración

Pestañas para separar temas de una ficha. Los paneles son los hijos del autor con `data-tab` (no se
mueven); el componente agrega la lista al final y el CSS la sube con `order`. Teclado de la APG,
`nx-tabs-change` cancelable, contadores (`data-count`) y errores (`data-errors`), y `sticky` para que
la lista se quede arriba (en un `<nx-dialog>`, bajo su cabecera: el diálogo pone `--nx-sticky-top`).

Orden de Tab: cuando la lista queda después de los paneles en el DOM (módulo diferido, SSR), Tab la
recorre igual primero. Lo hace `reading-flow: flex-visual` (tabs.css) donde existe; si no, el
componente corrige Tab donde el documento no va en el orden en que se ve (al entrar, de la lista al
panel y al salir, con `src/core/order.ts`) y deja al navegador lo demás (dentro de un panel, o lo que
sigue afuera). Dentro de un `<nx-dialog>` no hace nada: el diálogo ordena Tab en todo su contenido.
Un panel con `tabindex="-1"` apaga `reading-flow` (Chrome se saltaría todo lo de adentro) y el orden
lo pone el componente. Desde una fecha (`<input type=date>` y afines), Tab primero recorre sus
segmentos y el componente solo corrige adónde va al salir de ella. Pruebas en navegador: `e2e/tabs.spec.ts`.
El lector de pantalla también lee la lista primero: `aria-owns` en `<nx-tabs>` (la lista y luego los
paneles, si todos sus hijos tienen id) ordena el árbol de accesibilidad sin mover nodos.

Archivos: `tabs.ts`, `types.ts`, `tabs.css`, `index.ts`. Pruebas: `test/tabs.dom.test.ts` (y el caso
de hijos en `test/solid-children.test.tsx`). Galería: página «Ficha lateral» (`gallery/demo-drawer.ts`).

## BDUI

`Tabs: "tabs"` en el registro de `src/bdui.ts` (las props salen de los setters: `value`, `tabs`,
`sticky`, `label`, `labels`). BDUI no pasa hijos: con `tabs` la lista sale del payload y la app pinta
el contenido al oír `nx-tabs-change` (o pone paneles con `data-value`).

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/tabs.js` (con el núcleo, el locale y el orden de Tab) | 4,80 KB | 2,75 KB |
| `dist/tabs.css` | 0,83 KB | 1 KB |
