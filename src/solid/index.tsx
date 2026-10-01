/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y envoltorios (`<SideMenu>`, `<Button>`,
 * `<Select>`, `<AIAnswer>`, `<DocCapture>`, `<Grid>`, `<Dialog>`, `<Agent>`, `<Command>`, `<Explain>`,
 * `<Inbox>`, `<Survey>`, `<NumberInput>`, `<Kanban>`, `<History>`, `<DateRange>`,
 * `<PasteFill>`, `<Presence>`, `<WhatIf>`, `<Trend>`, `<Scan>`, `<Sync>`, `<Import>`,
 * `<Keytips>`, `<Guard>`, `<Handoff>`, `<Award>`, `<Account>`, `<Launcher>`, `<Cards>`, `<Print>`, `<Badge>`, `<Notice>`, `<Fields>`, `<Tabs>`, `<Signature>`, `<Planner>`, `<Review>`, `<Voice>`, `<Thread>`, `<Checklist>`, `<Recurrence>`, `<Jobs>`), y `nxToast` / `nxConfirm` / `nxSync`.
 *
 * Cada componente vive en su archivo y se puede importar solo (`nx32-elements/solid/grid`): así la app
 * carga únicamente lo que usa. Este índice los reexporta todos.
 *
 * Se publica como JSX sin compilar bajo la condición de export `"solid"`: el compilador de la
 * app (vite-plugin-solid) lo compila para SSR o para el navegador según corresponda.
 *
 * Por qué el envoltorio usa `prop:` y `bool:`:
 * - `items={x}` en un elemento personalizado se renderiza en el servidor como el atributo
 *   `items="[object Object]"`, y al hidratar no se asigna la propiedad. `prop:items` evita las dos cosas.
 * - `collapsed={false}` escribe `collapsed="false"`; `bool:collapsed` quita el atributo.
 *
 * Hijos: los componentes que reciben hijos (`<Grid>`, `<Dialog>`…) ponen sus propios nodos en el
 * mismo elemento. Si `{children}` fuera lo único adentro, Solid tomaría todo el contenido como suyo
 * y, cuando los hijos cambian (un `<Show>` que se apaga), lo vaciaría entero con `textContent = ""`,
 * tabla o diálogo incluidos. Un `<template />` fijo después de los hijos le marca hasta dónde llegan.
 */
export * from "./sidemenu";
export * from "./button";
export * from "./select";
export * from "./ai";
export * from "./capture";
export * from "./grid";
export * from "./dialog";
export * from "./agent";
export * from "./command";
export * from "./explain";
export * from "./inbox";
export * from "./survey";
export * from "./number";
export * from "./kanban";
export * from "./history";
export * from "./date-range";
export * from "./paste-fill";
export * from "./presence";
export * from "./what-if";
export * from "./trend";
export * from "./scan";
export * from "./sync";
export * from "./import";
export * from "./keytips";
export * from "./guard";
export * from "./handoff";
export * from "./award";
export * from "./account";
export * from "./launcher";
export * from "./cards";
export * from "./org";
export * from "./print";
export * from "./badge";
export * from "./notice";
export * from "./fields";
export * from "./tabs";
export * from "./signature";
export * from "./planner";
export * from "./review";
export * from "./voice";
export * from "./thread";
export * from "./checklist";
export * from "./recurrence";
export * from "./jobs";
export { nxConfirm } from "../components/confirm/index";
export { nxToast } from "../components/toast/index";
export { nxSync } from "../components/sync/logic";
