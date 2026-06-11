import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  root: path.resolve(__dirname, "./web"),
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(process.env.VITE_BUILD_ID ?? "dev") },
  // `server:` is NOT added on purpose.
  // /api and /ws proxying is handled by the gateway, NOT Vite.
  build: {
    outDir: path.resolve(__dirname, process.env.VITE_OUT_DIR || "dist"),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@plugins": path.resolve(__dirname, "../../../"),
    },
  },
});
