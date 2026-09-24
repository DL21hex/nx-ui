/**
 * Bundle todo-en-uno para `<script>`: registra los componentes, trae los íconos Lucide ya
 * registrados y expone `window.NxUI` (con `render` para payloads BDUI).
 */
import { registerIcons } from "./core/icons";
import { lucide } from "./icons/index";

registerIcons(lucide);

export * from "./index";
export { render, registerComponent } from "./bdui";
export { lucide };
