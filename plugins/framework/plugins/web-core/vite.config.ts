import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
// Relative import on purpose: the esbuild config loader cannot resolve the
// `@plugins` alias. The discovery/ordering logic is shared with the per-plugin
// artifact builder (tooling/web-artifacts) via the web-core core barrel.
import { loadBabelContributions } from "./core/vite-contributions";

export default defineConfig(async () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const pluginsRoot = path.resolve(__dirname, "../../../");
  const webSdkCore = path.resolve(__dirname, "../web-sdk/core");

  const babelPlugins = await loadBabelContributions({ pluginsRoot, repoRoot });

  return {
    root: path.resolve(__dirname, "./web"),
    plugins: [
      react({ babel: { plugins: babelPlugins } }),
      tailwindcss(),
      // `VITE_ANALYZE=1 bun run build` emits a treemap of every chunk's contents
      // to `web/dist.stats.html` (gzip + brotli sizes) so "what is in the eager
      // entry chunk?" is a reusable command, not a one-off investigation.
      ...(process.env.VITE_ANALYZE
        ? [
            visualizer({
              filename: path.resolve(__dirname, "web/dist.stats.html"),
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
            }),
          ]
        : []),
    ],
    // Preserve function/class `.name` through minification so debugging,
    // profiling (the render-profiler reads component names off fibers), crash
    // reports, and stack traces show real component names, not mangled `n`/`t`.
    esbuild: { keepNames: true },
    define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(process.env.VITE_BUILD_ID ?? "dev") },
    // `server:` is NOT added on purpose.
    // /api and /ws proxying is handled by the gateway, NOT Vite.
    build: {
      outDir: path.resolve(__dirname, process.env.VITE_OUT_DIR || "dist"),
      emptyOutDir: true,
      rollupOptions: {
        output: {
          // Vendor-split, deliberately minimal. We ONLY peel out react core.
          //
          // Hard-won measurement (VITE_ANALYZE treemap + index.html eager set):
          // grouping a *partially-lazy* heavy library (react-icons, shiki,
          // react-markdown, lexical, …) into one manual chunk BACKFIRES. Rollup's
          // default chunking already splits such a library into an eager-used
          // slice and lazy-used slices; forcing the whole package into a single
          // named chunk unions those slices, so one eager icon import drags the
          // entire 2 MB icon set — incl. icons only lazy plugins use — onto the
          // boot path. Monolithic vendor chunks turned a 715 KB-gzip eager set
          // into 2.4 MB. So we do NOT group those; default chunking is better.
          //
          // react/react-dom/scheduler, by contrast, are imported by the eager
          // root (main.tsx) and are therefore fully eager no matter what —
          // isolating them adds zero eager bytes and gives a pure caching win
          // (react rarely changes, so it survives app-code redeploys).
          manualChunks(id: string) {
            if (!id.includes("node_modules")) return;
            const after = id.split("node_modules/").pop()!;
            const pkg = after.startsWith("@")
              ? after.split("/").slice(0, 2).join("/")
              : after.split("/")[0];
            if (pkg === "react" || pkg === "react-dom" || pkg === "scheduler") {
              return "vendor-react";
            }
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        "@plugins": path.resolve(__dirname, "../../../"),
        // Composition build-gating: select the full vs. filtered plugin registry
        // at the IMPORT SEAM via a build-time alias branch — NOT a runtime
        // `import.meta.env` ternary. A runtime ternary would make Rollup bundle
        // BOTH registries and ship all ~540 plugins (silent failure). The
        // filtered file is gitignored and only exists after a `--composition`
        // build; with no VITE_COMPOSITION we resolve the committed full registry,
        // so a plain build stays byte-identical.
        "@composition-web-registry": process.env.VITE_COMPOSITION
          ? path.join(webSdkCore, "web.composition.generated.ts")
          : path.join(webSdkCore, "web.generated.ts"),
      },
    },
  };
});
