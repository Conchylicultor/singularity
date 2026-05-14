import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `server:` is NOT added on purpose.
  // /api and /ws proxying is handled by the gateway, NOT Vite.
  build: {
    // Steerable so the CLI can build into a staging dir and atomically
    // rename it to `dist/` at the end — the gateway never sees a
    // partially-wiped dist (icons present, no index.html).
    outDir: process.env.VITE_OUT_DIR || "dist",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@plugins": path.resolve(__dirname, "../plugins"),
      "@server": path.resolve(__dirname, "../server/src"),
    },
  },
});
