import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Usa el paquete CONSTRUIDO (dist/), como lo vería una app: `npm run build` antes.
// Los alias imitan lo que resuelven los "exports" del package.json (condición "solid" incluida).
const dist = (p: string) => fileURLToPath(new URL(`../../dist/${p}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [solid()],
  server: { port: 5174 },
  resolve: {
    alias: [
      { find: "nx-ui/solid", replacement: dist("solid/index.jsx") },
      { find: "nx-ui/icons", replacement: dist("icons.js") },
      { find: "nx-ui/nx-ui.css", replacement: dist("nx-ui.css") },
      { find: /^nx-ui$/, replacement: dist("index.js") },
    ],
  },
});
