// La misma página en el servidor y en el cliente (test/solid-hydrate.test.tsx): la tabla con una
// acción en lote que depende de una señal.
import { renderToString } from "solid-js/web";
import { Page } from "./page.jsx";

export const html = () => renderToString(() => <Page />);
