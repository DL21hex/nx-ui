# `<nx-breadcrumb>`: integración

La ruta hasta la página actual. Cada separador `›` se abre con los hijos de su nivel (los hermanos
del siguiente); si no cabe, los niveles del medio pasan a un «…»; por debajo de 480 px queda
«‹ Padre». Los niveles son los hijos del autor (`<a href>` y un `<span>` al final, que no se mueven)
o `items`. `nx-breadcrumb-navigate` es cancelable para los routers SPA; `Alt+↑` sube un nivel.

Archivos: `breadcrumb.ts`, `breadcrumb-menu.ts` (el menú, cargado con `import()` al abrir el
primero), `logic.ts` (limpieza de `items`, clave de un nivel y cuántos niveles esconder),
`types.ts`, `breadcrumb.css`, `index.ts`. Pruebas: `test/breadcrumb.logic.test.ts` y
`test/breadcrumb.dom.test.ts`, el menú sin red en `test/breadcrumb.robust.dom.test.ts` (y el caso de
hijos en `test/solid-children.test.tsx`). En el navegador: `e2e/breadcrumb.spec.ts`. Galería:
página «Ruta navegable» (`gallery/demo-breadcrumb.ts`). Maqueta: `maquetas/nx-breadcrumb.html`.

## Los hermanos

- En el payload: `children` en cada nivel (solo se usa un nivel hacia abajo).
- Al abrir, si el nivel no trae `children`: se emite `nx-breadcrumb-children` `{item, level,
  respond}` (cancelable). La app da los hijos con `respond(hijos)` (un arreglo o una promesa): ya,
  o después de `preventDefault()`. Si nadie responde, se piden a `children-endpoint`: `GET`, con
  `{id}` (la clave del nivel, codificada) y `{level}` en la plantilla (sin `{id}`, va como `?id=`),
  del mismo origen o de `allowOrigins`, y responde el arreglo.
- Qué separadores se abren sin `children`: todos si hay `children-endpoint`; si no, los niveles con
  `expandable: true` (`data-expandable="true"`). `expandable: false` apaga uno.
- Se pide una vez por camino (las claves de los niveles hasta ese: dos «General» en ramas distintas
  no se mezclan) y se guarda. Asignar `children-endpoint`, aunque sea el mismo, vacía lo guardado;
  una respuesta del endpoint anterior que llega después ya no se guarda. Mientras llega se ve
  «Cargando…»; si falla, «No se pudo cargar» (los dos en una región viva fija, que se anuncia).
- Mientras carga, el foco sigue en el separador: `Esc` cierra desde ahí, y si el foco se va a otra
  parte el menú se cierra (al llegar los datos no se lo roba).
- **Conservar la sección** al cambiar de persona es cosa de la app: el `href` de cada hermano ya
  apunta a la misma sección («/empleados/483/contratos»). El componente no conoce el árbol.

## BDUI

`Breadcrumb: "breadcrumb"` en el registro de `src/bdui.ts` (las props salen de los setters: `items`,
`childrenEndpoint`, `label`, `labels`). Todo es serializable: un payload trae los hermanos en
`children` o los pide con `childrenEndpoint`; la app que los da ella misma escucha
`nx-breadcrumb-children`.

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/breadcrumb.js` (con el núcleo) | 4,27 KB | 4,5 KB |
| menú (`breadcrumb-menu-*.js`, medido con el componente que importa) | 5,54 KB (≈ 2,1 KB propios) | 5,75 KB |
| `dist/breadcrumb.css` | 1,41 KB | 1,5 KB |
