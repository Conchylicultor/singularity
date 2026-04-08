import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "../plugin-core"),
      "@plugins": path.resolve(__dirname, "../plugins"),
      "react-icons": path.resolve(__dirname, "node_modules/react-icons"),
    },
  },
});
