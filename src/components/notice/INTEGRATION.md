# `<nx-notice>`: integración

El aviso de una ficha o un formulario, con su acción al lado. El texto es el contenido del autor (no
se mueve) o `text`; el componente agrega el ícono y la acción al final y la rejilla los ubica. Región
`status` (`alert` con `tone="danger"`), salvo que el autor ponga su propio `role`.

Archivos: `notice.ts`, `types.ts`, `notice.css`, `index.ts`. Pruebas: `test/notice.dom.test.ts`.
Usa los tokens nuevos `--nx-warning`, `--nx-warning-ink` y `--nx-warning-soft` (`src/styles/tokens.css`;
`scripts/contrast.mjs` verifica `--nx-warning-ink` sobre `--nx-warning-soft`: 5,3:1 en claro).

## BDUI

`Notice: "notice"` en el registro de `src/bdui.ts` (`tone`, `text`, `action`, `actionHref`).
`action-href` pasa por `safeHref`: un esquema peligroso deja la acción como botón.

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/notice.js` (con el núcleo) | 1,70 KB | 1,75 KB |
| `dist/notice.css` | 0,58 KB | 1 KB |
