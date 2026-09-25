import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas en navegador real sobre la galería: interacciones que happy-dom no tiene (Popover API,
 * foco, portapapeles, View Transitions, arrastre) y accesibilidad con axe.
 *
 *   npm run e2e              → Chromium
 *   npm run check            → todo (Chromium, Firefox y WebKit si la máquina lo abre); lo corre
 *                              el hook pre-push antes de cada envío
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    locale: "es-CO",
  },
  webServer: {
    command: "npx vite --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
});
