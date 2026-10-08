import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: {
    target: "es2020",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      input: { main: resolve(__dirname, "index.html"), admin: resolve(__dirname, "admin/index.html") },
    },
  },
  server: { host: true, port: 5173 },
});
