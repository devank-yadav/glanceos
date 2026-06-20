import { defineConfig } from "vitest/config";

// Screen unit tests run under jsdom (render/nav/burn-in touch the DOM). Kept
// separate from vite.config.ts so the build stays framework-free + tiny.
export default defineConfig({
  test: { environment: "jsdom", include: ["src/**/*.test.ts"] },
});
