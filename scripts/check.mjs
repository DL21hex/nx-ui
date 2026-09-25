// Todo lo que haría un CI, en local: `npm run check`. Lo corre el hook `pre-push` (.githooks), así
// nada se envía sin pasar. Se detiene en el primer paso que falle.
//
// Navegadores: Chromium y Firefox siempre; WebKit si esta máquina lo puede abrir (en Linux necesita
// librerías del sistema: `sudo npx playwright install-deps webkit`).
import { spawnSync } from "node:child_process";
import { webkit } from "@playwright/test";

async function canLaunch(type) {
  try {
    const b = await type.launch();
    await b.close();
    return true;
  } catch {
    return false;
  }
}

const browsers = ["chromium", "firefox"];
const withWebkit = await canLaunch(webkit);
if (withWebkit) browsers.push("webkit");

const steps = [
  ["Tipos", "npm", ["run", "typecheck"]],
  // El build va antes de las pruebas: `test/dist.test.ts` revisa el dist/ recién construido, no el
  // de una build anterior.
  ["Build y límites de peso", "npm", ["run", "build"]],
  ["Pruebas de lógica y DOM", "npm", ["test"]],
  ["Contraste de los tokens", "npm", ["run", "contrast"]],
  [`Navegador (${browsers.join(", ")}) y accesibilidad`, "npx", ["playwright", "test", ...browsers.map((b) => `--project=${b}`)]],
];

const done = [];
for (const [name, cmd, args] of steps) {
  console.log(`\n▶ ${name}`);
  const t0 = performance.now();
  // Playwright levanta su propia galería en un puerto aparte: una `vite` abierta en 5173 (quizá de
  // otro worktree) no se prueba por error.
  const env = { ...process.env, NX_E2E_PORT: process.env.NX_E2E_PORT ?? "5199" };
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env });
  const s = ((performance.now() - t0) / 1000).toFixed(1);
  done.push(`${r.status === 0 ? "✓" : "✗"} ${name} · ${s} s`);
  if (r.status !== 0) {
    console.log(`\n${done.join("\n")}\n\nFalló «${name}». No se envía nada hasta que pase.`);
    process.exit(1);
  }
}
console.log(`\n${done.join("\n")}`);
if (!withWebkit) console.log("· WebKit no se probó: esta máquina no lo puede abrir (sudo npx playwright install-deps webkit).");
