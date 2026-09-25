import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas en navegador real sobre la galería: interacciones que happy-dom no tiene (Popover API,
 * foco, portapapeles, View Transitions, arrastre) y accesibilidad con axe.
 *
 *   npm run e2e              → Chromium (reutiliza la galería si ya corre en 5173)
 *   npm run check            → todo (Chromium, Firefox y WebKit si la máquina lo abre); lo corre
 *                              el hook pre-push antes de cada envío, con su propia galería en
 *                              `NX_E2E_PORT` (5199), nunca una que ya estuviera abierta
 */
const own = process.env.NX_E2E_PORT;
const port = Number(own ?? 5173);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    locale: "es-CO",
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !own,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
});
