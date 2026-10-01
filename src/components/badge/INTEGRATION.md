# `<nx-badge>`: integración

El estado de un registro en una píldora (`tone`: `neutral`, `success`, `info`, `warning`, `danger`).
Casi todo es CSS: funciona aunque el elemento no esté definido, y así lo usa la cabecera de ficha de
`<nx-dialog>` (su CSS lo importa `dialog.css`). La clase solo pinta `label`, para BDUI, que no pasa hijos.

Archivos: `badge.ts`, `types.ts`, `badge.css`, `index.ts`. Pruebas: en `test/notice.dom.test.ts`.

## BDUI

`Badge: "badge"` en el registro de `src/bdui.ts` (`label`, `tone`).

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/badge.js` (con el núcleo) | 0,61 KB | 1 KB |
| `dist/badge.css` | 0,35 KB | 0,5 KB |
