import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Build-time transpile (no runtime Babel — PRD §11.8). The same React app
// serves the scaled preview grid AND the native-size capture page.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "dist", assetsInlineLimit: 0 },
});
