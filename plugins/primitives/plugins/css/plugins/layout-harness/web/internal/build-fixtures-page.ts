import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

// Programmatic Vite build of the measurer page (entry.html + entry.tsx) into a
// temp static dir. Reuses the EXACT plugin set + `@plugins` alias from the repo
// `vitest.config.ts`, so the fixtures' real components + real Tailwind are
// bundled identically to the app. `base: "./"` makes asset URLs relative so the
// built page loads over `file://` (no server). Returns the built index.html path.

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPO_ROOT = resolve(HERE, "../../../../../../../..");
const PLUGINS_DIR = join(REPO_ROOT, "plugins");

export interface BuiltPage {
  /** Absolute path to the built `index.html`. */
  html: string;
  /** Temp output directory (caller cleans up). */
  outDir: string;
}

export async function buildFixturesPage(): Promise<BuiltPage> {
  const outDir = await mkdtemp(join(tmpdir(), "layout-harness-"));
  await build({
    root: HERE,
    base: "./",
    // The composition alias mirrors vitest.config — entry.tsx pulls
    // loadFixtures()/the gallery's deps, which transitively may hit App-level
    // registries through the @plugins tree.
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@plugins": PLUGINS_DIR,
        "@composition-web-registry": join(
          PLUGINS_DIR,
          "framework/plugins/web-sdk/core/web.generated.ts",
        ),
      },
    },
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: { input: join(HERE, "entry.html") },
    },
    logLevel: "error",
  });
  return { html: join(outDir, "entry.html"), outDir };
}
