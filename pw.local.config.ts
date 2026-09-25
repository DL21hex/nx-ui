import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  testDir: "/home/user/nx-ui/e2e",
  outputDir: "/tmp/claude-0/-home-user-nx-ui/a2970d0a-f522-5d92-a066-a6284666f1b1/scratchpad/pw-results",
  webServer: { ...(base.webServer as object), cwd: "/home/user/nx-ui" } as never,
  projects: [{ ...base.projects![0], use: { ...base.projects![0].use, launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" } } }],
});
