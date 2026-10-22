import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/ui",
  timeout: 45000,
  workers: 1,
  reporter: "list",
});
