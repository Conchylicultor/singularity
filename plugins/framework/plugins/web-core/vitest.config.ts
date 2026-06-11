import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      // Absolute so it survives vite.config's `root: ./web` — a relative path
      // would resolve against that root to the nonexistent web/web/__tests__/.
      setupFiles: [path.resolve(__dirname, "web/__tests__/setup.ts")],
    },
  })
);
