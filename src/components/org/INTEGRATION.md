# `<nx-org>`: integración

El organigrama con dos lentes: «Yo» (una persona en el centro, su cadena, su jefe, sus pares, su
equipo y «Para… / Acudes a…») y «Organización» (el árbol de unidades con su líder; al abrir una, su
gente con las mismas ramas). Datos en JSON (`units` con `leader`, `people`, `me`) o por partes con
`source`.

Archivos: `org.ts`, `logic.ts` (índices, cadenas, jefe común, intensidad), `types.ts`, `org.css`,
`index.ts`. Pruebas: `test/org.logic.test.ts` y
`test/org.dom.test.ts`. Galería: página «Organigrama» (`gallery/demo-org.ts`).

## El protocolo de `source`

POST con `Content-Type: application/json`, del mismo origen (o uno de `allowOrigins`):

| Cuerpo | Responde |
|---|---|
| `{ "person": "e214" }` | la persona, su cadena hasta arriba, sus pares y su equipo directo |
| `{ "unit": "agro-esp" }` | las personas directamente en la unidad |
| `{ "search": "ana" }` | hasta ~20 personas que coinciden, en el orden en que se muestran |

Siempre `{ "people"?: OrgPerson[], "units"?: OrgUnit[] }`; lo que llega se suma a lo que hay. Cada
pedido se hace una vez; si falla, la vista ofrece «Reintentar». Para no repetir lo que el servidor
ya mandó de arranque, que diga cuántos hay: `reports` en las personas y `direct` (o `count`, en una
unidad sin subunidades) en las unidades.

**Autorización:** el componente no decide quién ve qué. El servidor responde solo lo que quien mira
puede ver y marca con `locked: true` a las personas que se muestran (su jefe, sus pares) pero cuyo
entorno no puede abrir; el componente no ofrece centrarse en ellas.

## BDUI

`Org: "org"` en el registro de `src/bdui.ts` (las props salen de los setters).

## Peso

| Pieza | Tamaño (min + gzip) | Presupuesto |
|---|---|---|
| `dist/org.js` (con el núcleo) | 12,22 KB | 12,5 KB |
| `dist/org.css` | 2,49 KB | 3,5 KB |
