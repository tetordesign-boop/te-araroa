import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

/** Link previews (WhatsApp, iMessage, Messenger) need absolute URLs: set SITE_URL when building for production. */
function absoluteShareLinks(): Plugin {
  const site = process.env.SITE_URL?.replace(/\/?$/, "/");
  return {
    name: "absolute-share-links",
    transformIndexHtml(html) {
      if (!site) return html;
      return html
        .replace('<meta property="og:image" content="og.jpg" />',
          `<meta property="og:image" content="${site}og.jpg" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta property="og:url" content="${site}" />\n    <meta name="twitter:card" content="summary_large_image" />`);
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [preact(), absoluteShareLinks()],
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
