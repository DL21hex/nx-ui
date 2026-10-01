# `<nx-fields>`: integración

Los datos de un registro, para leer y para editar en la misma rejilla: etiqueta arriba y valor abajo,
«—» para lo vacío (se lee «Sin dato»), formato del locale, `href`, `copy`, `mono`; `variant="summary"`
para la franja de datos clave de una ficha; con `editing`, cada valor se vuelve un campo en su sitio
(con `name`, así que sirve en un `<form>` y marca los cambios sin guardar de `<nx-dialog>`), y
`values`, `validate()`, `errors` y `focusField()` para guardar.

Archivos: `fields.ts`, `types.ts`, `fields.css`, `index.ts`. Pruebas: `test/fields.dom.test.ts`.
Galería: página «Ficha lateral» (`gallery/demo-drawer.ts`).

## BDUI

`Fields: "fields"` en el registro de `src/bdui.ts`. `items`, `errors` y `labels` aceptan el objeto o
su JSON. Los textos de los datos van siempre como texto (nunca HTML) y `href` pasa por `safeHref`.

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/fields.js` (con el núcleo) | 5,01 KB | 5,25 KB |
| `dist/fields.css` | 1,24 KB | 1,75 KB |
