# `<nx-breadcrumb>`: integración

La ruta hasta la página actual. Cada separador `›` se abre con los hijos de su nivel (los hermanos
del siguiente); si no cabe, los niveles del medio pasan a un «…»; por debajo de 480 px queda
«‹ Padre». Los niveles son los hijos del autor (`<a href>` y un `<span>` al final, que no se mueven)
o `items`. `nx-breadcrumb-navigate` es cancelable para los routers SPA; `Alt+↑` sube un nivel.

Archivos: `breadcrumb.ts`, `breadcrumb-menu.ts` (el menú, cargado con `import()` al abrir el
primero), `logic.ts` (limpieza de `items`, clave de un nivel y cuántos niveles esconder),
`types.ts`, `breadcrumb.css`, `index.ts`. Pruebas: `test/breadcrumb.logic.test.ts` y
`test/breadcrumb.dom.test.ts` (y el caso de hijos en `test/solid-children.test.tsx`). Galería:
página «Ruta navegable» (`gallery/demo-breadcrumb.ts`). Maqueta: `maquetas/nx-breadcrumb.html`.

## Los hermanos

- En el payload: `children` en cada nivel (solo se usa un nivel hacia abajo).
- Al abrir: `loadChildren(item, level)` devuelve los hijos (o una promesa). Se pide una vez por
  nivel (la clave es `id`, o `href`, o `label`) y se guarda; asignar `loadChildren` de nuevo vacía
  lo guardado. Mientras llega se ve «Cargando…»; si falla, «No se pudo cargar».
- **Conservar la sección** al cambiar de persona es cosa de la app: el `href` de cada hermano ya
  apunta a la misma sección («/empleados/483/contratos»). El componente no conoce el árbol.

## BDUI

`Breadcrumb: "breadcrumb"` en el registro de `src/bdui.ts` (las props salen de los setters: `items`,
`loadChildren`, `label`, `labels`). Desde un payload no llegan funciones: los hermanos van en
`children`, y la app que quiera pedirlos asigna `loadChildren` aparte.

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/breadcrumb.js` (con el núcleo) | 4,27 KB | 4,5 KB |
| menú (`breadcrumb-menu-*.js`, medido con el componente que importa) | 5,54 KB (≈ 2,1 KB propios) | 5,75 KB |
| `dist/breadcrumb.css` | 1,41 KB | 1,5 KB |
