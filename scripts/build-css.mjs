// CSS de la librería: resuelve los @import, baja el anidamiento para Safari 17.0 y minifica.
import { build } from "esbuild";

const target = ["chrome114", "firefox125", "safari17"];
const entries = {
  "nx-ui": "src/styles/nx-ui.css",
  tokens: "src/styles/tokens.css",
  palettes: "src/styles/palettes.css",
  sidemenu: "src/components/sidemenu/sidemenu.css",
  button: "src/components/button/button.css",
  select: "src/components/select/select.css",
  ai: "src/components/ai/ai-answer.css",
  capture: "src/components/capture/doc-capture.css",
  grid: "src/components/grid/grid.css",
  dialog: "src/components/dialog/dialog.css",
  confirm: "src/components/confirm/confirm.css",
  toast: "src/components/toast/toast.css",
  agent: "src/components/agent/agent.css",
  command: "src/components/command/command.css",
  explain: "src/components/explain/explain.css",
  inbox: "src/components/inbox/inbox.css",
  survey: "src/components/survey/survey.css",
  tour: "src/components/tour/tour.css",
  "what-if": "src/components/what-if/what-if.css",
  "presence": "src/components/presence/presence.css",
  "paste-fill": "src/components/paste-fill/paste-fill.css",
  "date-range": "src/components/date-range/date-range.css",
  "history": "src/components/history/history.css",
  "kanban": "src/components/kanban/kanban.css",
  "number": "src/components/number/number.css",
};

await build({
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  minify: true,
  target,
  logLevel: "warning",
});
console.log("css →", Object.keys(entries).map((k) => `dist/${k}.css`).join(", "));
