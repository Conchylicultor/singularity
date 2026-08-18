import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  discoverCollectedDirs,
  renderCollectedDirRegistry,
  collectedDirRegistryPath,
  collectEntriesWithDeps,
  buildRegistryGenContext,
  formatGenerated,
  readCompositionManifestsFromDisk,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import {
  classifyEdges,
  flattenManifest,
  resolveComposition,
} from "@plugins/plugin-meta/plugins/closure/core";
import {
  manifestItemToManifest,
  MAIN_COMPOSITION_ID,
} from "@plugins/plugin-meta/plugins/composition/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "plugins-registry-in-sync",
  description:
    "All collected dir registries (web, server, central, check, lint, ...) match the current plugin source, and equal what the `singularity` composition's closure renders",
  async run() {
    const root = await getWorktreeRoot();
    const ctx = await buildRegistryGenContext(root);
    const defs = discoverCollectedDirs(root);

    // ── The equivalence proof: main IS a composition ──────────────────────────
    //
    // `singularity` is an ordinary entry in the compositions manifest whose entry
    // points are `["**"]` — every plugin. If that is true, then filtering a
    // collected-dir registry down to its resolved closure must change NOTHING:
    //
    //   render({ ctx, def, bundle: <singularity's closure> }) === render({ ctx, def })
    //
    // byte-for-byte. The renderer's only bundle-dependence is
    // `allEntries.filter(e => bundle.has(e.id))` plus the dep pruning derived from
    // it; the `singularity.disabled` filter is applied unconditionally on BOTH
    // sides, so it cancels out and this compares closures, not disabled flags.
    //
    // That is what turns "main is a composition" from a statement in a design doc
    // into an enforced fact — and it is why the assertion lives HERE, in the check
    // that already owns "what the committed registries must equal", rather than in
    // a new check of its own.
    //
    // Note what this does NOT do: `generatePluginRegistry` still renders the
    // committed files with no bundle at all, so `<dir>.generated.ts` stays a pure
    // function of the filesystem + `singularity.disabled`. This check PROVES the
    // two coincide; it does not merge the paths.
    const manifestItems = readCompositionManifestsFromDisk(root);
    const mainItem = manifestItems.find((m) => m.id === MAIN_COMPOSITION_ID);
    if (!mainItem) {
      return {
        ok: false,
        message: `no "${MAIN_COMPOSITION_ID}" composition in the manifest registry`,
        hint: `The main app is an ordinary composition entry — without it there is nothing to prove the committed registries against. Restore the "${MAIN_COMPOSITION_ID}" seed (entry points \`["**"]\`) in plugins/plugin-meta/plugins/composition/core/config.ts.`,
      };
    }
    const graph = classifyEdges(ctx.tree);
    // Typed as `Set<string>` — the renderer's `bundle` parameter, and the id
    // membership test below, both work in the registry's plain-string id space.
    const mainBundle: Set<string> = resolveComposition(
      graph,
      flattenManifest(
        manifestItemToManifest(mainItem),
        manifestItems.map(manifestItemToManifest),
      ),
    ).bundle;

    for (const def of defs) {
      const file = collectedDirRegistryPath(def);
      const rel = relative(root, file);
      if (!existsSync(file)) {
        return {
          ok: false,
          message: `${rel} is missing`,
          hint: "Run `./singularity build` to generate it.",
        };
      }
      const full = renderCollectedDirRegistry({ ctx, def });
      const expected = await formatGenerated({ file, content: full });
      if (readFileSync(file, "utf8") !== expected) {
        return {
          ok: false,
          message: `${rel} is out of sync with plugin source`,
          hint: "Run `./singularity build` and commit the regenerated file.",
        };
      }

      // The second render reuses this context's cached `<dir>` scan, so it is pure
      // string building — no re-walk of the plugin trees. No prettier pass either:
      // both sides come out of the same renderer, so they are compared exactly as
      // rendered.
      const filtered = renderCollectedDirRegistry({
        ctx,
        def,
        bundle: mainBundle,
      });
      if (filtered !== full) {
        // Name the ids, not the diff. "These two files differ" is useless to
        // whoever hits this: what they need is which plugins the committed
        // registry carries that main's closure does not reach — that list IS the
        // repair instruction (either the plugin is genuinely unreachable and its
        // edges are missing, or the manifest entry stopped meaning "everything").
        const missing = collectEntriesWithDeps(ctx, def.dir)
          .entries.filter((e) => !mainBundle.has(e.id))
          .map((e) => e.id)
          .sort();
        return {
          ok: false,
          message:
            `${rel} contains ${missing.length} plugin(s) outside the "${MAIN_COMPOSITION_ID}" composition's closure: ` +
            missing.join(", "),
          hint: `The committed registries must equal what "${MAIN_COMPOSITION_ID}"'s closure renders — that equality is what makes the main app an ordinary composition rather than a special case. Either the composition's entry points no longer mean "every plugin" (they should be \`["**"]\` — check plugins/plugin-meta/plugins/composition/core/config.ts and any user-layer override), or a negative entry was added that trims these plugins out.`,
        };
      }
    }
    return { ok: true };
  },
};

export default check;
