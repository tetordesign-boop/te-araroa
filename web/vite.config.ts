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

/** The face of every title and number (and of the presentation's big title): fetched with the page, not once the
 * stylesheet asks for it, so on a slow connection the words don't come in with a stand-in font and jump.
 * (Only this one: the stories' serif can come a moment later, and the map's code matters more.) */
function preloadFonts(): Plugin {
  const wanted = [/archivo-latin-wdth-normal-[\w-]+\.woff2$/];
  return {
    name: "preload-fonts",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle || /admin[\\/]index\.html$/.test(ctx.filename)) return html;
        const files = Object.keys(ctx.bundle).filter((f) => wanted.some((re) => re.test(f)));
        const links = files.map((f) => `<link rel="preload" href="./${f}" as="font" type="font/woff2" crossorigin />`).join("\n    ");
        return links ? html.replace("</title>", `</title>\n    ${links}`) : html;
      },
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [preact(), absoluteShareLinks(), preloadFonts()],
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
