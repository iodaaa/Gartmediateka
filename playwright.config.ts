import { defineConfig } from "@playwright/test";
if (!process.env.GART_E2E_ROOT)
  throw new Error(
    "Запускайте UI-тесты через npm run test:ui: требуется отдельное тестовое хранилище",
  );
export default defineConfig({
  testDir: "./tests",
  testMatch:
    process.env.GART_FOCUSED === "mvp05"
      ? "**/mvp05.spec.ts"
      : process.env.GART_FOCUSED === "mvp04"
        ? "**/mvp04.spec.ts"
        : "**/real-workspace.spec.ts",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "npm run start -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
  },
  reporter: "list",
});
