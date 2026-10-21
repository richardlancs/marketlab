import { configDefaults, defineConfig } from "vitest/config";

// Vitest's defaults, minus the Playwright end-to-end tests (e2e/, run with `npm run test:e2e`).
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
