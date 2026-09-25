import { defineConfig } from "vite";

// `vite`                     → galería (gallery/). Sus ejemplos le hablan a una API de mentira que
//                               corre en el navegador (gallery/demo-api.ts): no hace falta servidor.
// `vite build --mode gallery` → dist-gallery/: la galería como archivos estáticos (GitHub Pages)
// `vite build`               → librería ESM, una entrada por subruta del package
// `vite build --mode iife`   → dist/nx-ui.iife.js, todo-en-uno para <script>
export default defineConfig(({ command, mode }) => {
  if (command === "serve") return { root: "gallery", server: { port: 5173 } };

  if (mode === "gallery") {
    // Rutas relativas: sirve en la raíz de un dominio o en una subcarpeta (usuario.github.io/nx-ui/).
    return { root: "gallery", base: "./", build: { outDir: "../dist-gallery", emptyOutDir: true, target: "es2022" } };
  }

  if (mode === "iife") {
    return {
      build: {
        target: "es2022",
        emptyOutDir: false,
        lib: { entry: "src/iife.ts", name: "NxUI", formats: ["iife"], fileName: () => "nx-ui.iife.js" },
      },
    };
  }

  return {
    build: {
      target: "es2022",
      emptyOutDir: false,
      lib: {
        entry: {
          index: "src/index.ts",
          sidemenu: "src/components/sidemenu/index.ts",
          button: "src/components/button/index.ts",
          select: "src/components/select/index.ts",
          ai: "src/components/ai/index.ts",
          capture: "src/components/capture/index.ts",
          grid: "src/components/grid/index.ts",
          dialog: "src/components/dialog/index.ts",
          confirm: "src/components/confirm/index.ts",
          toast: "src/components/toast/index.ts",
          agent: "src/components/agent/index.ts",
          command: "src/components/command/index.ts",
          explain: "src/components/explain/index.ts",
          inbox: "src/components/inbox/index.ts",
          survey: "src/components/survey/index.ts",
          tour: "src/components/tour/index.ts",
          "date-range": "src/components/date-range/index.ts",
          history: "src/components/history/index.ts",
          kanban: "src/components/kanban/index.ts",
          number: "src/components/number/index.ts",
          icons: "src/icons/index.ts",
          bdui: "src/bdui.ts",
        },
        formats: ["es"],
      },
    },
  };
});
