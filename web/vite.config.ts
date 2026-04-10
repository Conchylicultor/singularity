import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `server:` is NOT added on purpose.
  // /api and /ws proxying is handled by the gateway, NOT Vite.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "../plugin-core"),
      "@plugins": path.resolve(__dirname, "../plugins"),
    },
  },
});
