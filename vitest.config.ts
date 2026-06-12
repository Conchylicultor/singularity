import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// Single repo-wide vitest project for browser/DOM + React tests.
//
// Convention: jsdom/React tests live co-located in each plugin's
// `web/__tests__/` folder and are auto-discovered here — no per-plugin config.
// Pure-logic tests stay as `bun:test` files next to their source (never under a
// `__tests__/` folder), so the two runners never cross-load. Run with
// `bun run test:dom` from the repo root.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@plugins": path.resolve(__dirname, "plugins"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(__dirname, "test/setup.ts")],
    include: ["plugins/**/web/__tests__/**/*.test.{ts,tsx}"],
  },
});
