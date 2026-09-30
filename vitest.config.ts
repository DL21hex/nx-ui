import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/**/*.test.ts"], environment: "node" } },
      // El adaptador de Solid, compilado como lo compila la app (vite-plugin-solid) y en el DOM.
      // `ssr: true`: el código del cliente sale hidratable, como en SolidStart.
      {
        plugins: [solid({ ssr: true })],
        resolve: { conditions: ["development", "browser"] },
        test: { name: "solid", include: ["test/**/*.test.tsx"], environment: "happy-dom", server: { deps: { inline: [/solid-js/] } } },
      },
    ],
  },
});
