import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Writes this build's files into the service worker (public/sw.js, `BUILD`), so it keeps them all on the phone from
 * the moment it installs, and is itself new with every version of the site. */
function precacheList(): Plugin {
  let outDir = "dist";
  return {
    name: "precache-list",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const dir = resolve(__dirname, outDir);
      const files = readdirSync(resolve(dir, "assets")).sort().map((f) => `assets/${f}`);
      const id = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      const sw = resolve(dir, "sw.js");
      const src = readFileSync(sw, "utf8");
      const line = 'const BUILD = { id: "dev", files: [] };';
      if (!src.includes(line)) throw new Error("sw.js: BUILD line not found");
      writeFileSync(sw, src.replace(line, `const BUILD = ${JSON.stringify({ id, files })};`));
    },
  };
}

/**
 * What Ewan pastes into Supabase from his phone to switch on the questions, the voice notes and the notifications
 * (the Carnet shows it with a Copy button, admin/Activate.tsx): the database script, and the "push" server function
 * as one file (its shared helpers put in front of it), read from supabase/ when the Carnet is built.
 */
function activationFiles(): Plugin {
  const id = "virtual:activation", rid = `\0${id}`;
  const base = resolve(__dirname, "../supabase");
  const files = {
    sql: resolve(base, "migrations/20261113000100_questions_voice_push.sql"),
    util: resolve(base, "functions/_shared/util.ts"),
    webpush: resolve(base, "functions/_shared/webpush.ts"),
    push: resolve(base, "functions/push/index.ts"),
  };
  return {
    name: "activation-files",
    resolveId: (x) => (x === id ? rid : null),
    load(x) {
      if (x !== rid) return null;
      for (const f of Object.values(files)) this.addWatchFile(f);
      const read = (f: string) => readFileSync(f, "utf8");
      const fn = [
        "// The \"push\" server function in one file, for the Supabase dashboard (Edge Functions, Deploy a new function, Via Editor).",
        "// Made from supabase/functions/push/index.ts and supabase/functions/_shared/ (util.ts, webpush.ts).",
        "",
        read(files.util),
        read(files.webpush),
        read(files.push).replace(/^import .* from "\.\.\/_shared\/[^"]+";\n/gm, ""),
      ].join("\n");
      return `export const FEATURES_SQL = ${JSON.stringify(read(files.sql))};\nexport const PUSH_FUNCTION = ${JSON.stringify(fn)};\n`;
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [preact(), absoluteShareLinks(), preloadFonts(), precacheList(), activationFiles()],
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
