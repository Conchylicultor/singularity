import { readdirSync, type Dirent } from "fs";
import { dirname, join } from "path";
import { createFacet, type DocFact } from "@plugins/plugin-meta/plugins/facets/core";
import { standardPluginDirs } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { PLUGINS_DIR } from "@plugins/infra/plugins/paths/server";
import { readIfExists } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { type StructureFacetData, structureFacetDef } from "../core";

// `extract` is synchronous (the facet pipeline calls it without `await`), but
// classifying folders needs the repo's standard-folder set, exposed via an
// async-by-signature helper that internally does only synchronous fs reads. We
// resolve it once at module load via top-level await; `loadFacets()` awaits each
// facet module's loader, so STD is always ready before `extract` runs.
// standardPluginDirs resolves `<root>/plugins` internally, so pass the repo root.
const STD = await standardPluginDirs(dirname(PLUGINS_DIR));

/** Read a directory's entries, yielding [] if it is unreadable. */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * Non-source directories that must never count as plugin folders: dependencies,
 * VCS/dotfiles, and build output (`dist`, `dist.live.<pid>`, `dist.staging.<pid>`).
 * Mirrors the boundary checker's IGNORED_DIRS so we flag genuine structural
 * anomalies, not transient build artifacts.
 */
function isIgnoredDir(name: string): boolean {
  return name === "node_modules" || name.startsWith(".") || name.startsWith("dist");
}

/** Self-declared SPA/CLI bootstrap root (`package.json` `singularity.compositionRoot`). */
function readCompositionRoot(dir: string): boolean {
  const src = readIfExists(join(dir, "package.json"));
  if (!src) return false;
  try {
    return JSON.parse(src).singularity?.compositionRoot === true;
  } catch {
    return false;
  }
}

export default createFacet<StructureFacetData>({
  def: structureFacetDef,

  extract(ctx) {
    const entries = readEntries(ctx.dir);
    const folders = entries
      .filter((e) => e.isDirectory() && !isIgnoredDir(e.name))
      .map((e) => ({ name: e.name, standard: STD.has(e.name) }));
    const looseFiles = entries
      .filter(
        (e) => e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx")),
      )
      .map((e) => e.name);
    return { folders, looseFiles, compositionRoot: readCompositionRoot(ctx.dir) };
  },

  renderDoc(data) {
    const facts: DocFact[] = [];
    const nonStandard = data.folders.filter((f) => !f.standard);
    if (nonStandard.length)
      facts.push({
        folder: "structure",
        key: "Non-standard folders",
        values: nonStandard.map((f) => `\`${f.name}/\``),
      });
    if (data.looseFiles.length)
      facts.push({
        folder: "structure",
        key: "Loose top-level files",
        values: data.looseFiles.map((f) => `\`${f}\``),
      });
    if (data.compositionRoot)
      facts.push({ folder: "structure", key: "Composition root", values: ["yes"] });
    return facts;
  },
});
