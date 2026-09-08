import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        options: resolve(import.meta.dirname, "options.html"),
        dashboard: resolve(import.meta.dirname, "dashboard.html"),
        background: resolve(import.meta.dirname, "src/background/main.ts"),
        attachmentBridge: resolve(import.meta.dirname, "src/content/attachment-bridge-entry.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "assets/background.js";
          if (chunk.name === "attachmentBridge") return "assets/attachment-bridge.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
