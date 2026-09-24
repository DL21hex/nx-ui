// Genera src/icons/lucide.ts desde @iconify-json/lucide (licencia ISC).
// Se ejecuta a mano (`node scripts/gen-icons.mjs`) al cambiar la lista; el archivo generado se versiona.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const set = JSON.parse(readFileSync(require.resolve("@iconify-json/lucide/icons.json"), "utf8"));

const NAMES = [
  "house", "layout-dashboard", "users", "user", "settings", "chart-column", "trending-up",
  "shopping-cart", "package", "truck", "warehouse", "receipt", "wallet", "file-text", "folder",
  "clipboard-list", "calendar", "inbox", "bell", "shield", "shield-user", "factory", "hard-hat",
  "utensils-crossed", "map-pin", "building-2", "circle-help", "log-out",
];

// Los atributos de trazo van una sola vez en el <svg> que arma el registro, no en cada path.
const STROKE = ' fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';

function body(name) {
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent];
  if (!icon) throw new Error(`Ícono inexistente en lucide: ${name}`);
  let b = icon.body;
  const g = `<g${STROKE}>`;
  if (b.startsWith(g) && b.endsWith("</g>")) b = b.slice(g.length, -4);
  return b.replaceAll(STROKE, "");
}

const entries = NAMES.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(body(n))},`).join("\n");
writeFileSync(
  new URL("../src/icons/lucide.ts", import.meta.url),
  `// Generado por scripts/gen-icons.mjs — no editar a mano.
// Íconos de Lucide (https://lucide.dev), licencia ISC: Copyright (c) Lucide Contributors.
export const lucide: Record<string, string> = {
${entries}
};
`,
);
console.log(`${NAMES.length} íconos → src/icons/lucide.ts`);
