/**
 * Adaptador para SolidJS: tipos JSX de las etiquetas y envoltorios (`<SideMenu>`, `<Button>`,
 * `<Select>`, `<AIAnswer>`, `<DocCapture>`, `<Grid>`, `<Dialog>`, `<Agent>`, `<Command>`, `<Explain>`,
 * `<Inbox>`, `<Survey>`, `<NumberInput>`, `<Kanban>`, `<History>`, `<DateRange>`,
 * `<PasteFill>`, `<Presence>`, `<WhatIf>`, `<Trend>`, `<Scan>`, `<Sync>`, `<Import>`,
 * `<Keytips>`, `<Guard>`, `<Handoff>`, `<Award>`, `<Account>`, `<Launcher>`, `<Cards>`, `<Print>`, `<Signature>`, `<Planner>`, `<Review>`, `<Voice>`, `<Thread>`, `<Checklist>`, `<Recurrence>`, `<Jobs>`), y `nxToast` / `nxConfirm` / `nxSync`.
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
export * from "./print";
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
