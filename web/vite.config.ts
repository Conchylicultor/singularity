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
      "lucide-react": path.resolve(__dirname, "node_modules/lucide-react"),
      "@xterm/xterm": path.resolve(__dirname, "node_modules/@xterm/xterm"),
      "@xterm/addon-fit": path.resolve(__dirname, "node_modules/@xterm/addon-fit"),
      "@xterm/addon-web-links": path.resolve(__dirname, "node_modules/@xterm/addon-web-links"),
      "sonner": path.resolve(__dirname, "node_modules/sonner"),
    },
  },
});
