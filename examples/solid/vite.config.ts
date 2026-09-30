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
      { find: /^nx32-elements\/solid\/([\w-]+)$/, replacement: dist("solid/$1.jsx") },
      { find: /^nx32-elements\/solid$/, replacement: dist("solid/index.jsx") },
      { find: "nx32-elements/icons", replacement: dist("icons.js") },
      { find: "nx32-elements/nx32-elements.css", replacement: dist("nx32-elements.css") },
      { find: /^nx32-elements$/, replacement: dist("index.js") },
    ],
  },
});
