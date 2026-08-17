// The rung-4 assert behind the "an artifact's address covers exactly what its
// bytes inline" invariant: per built artifact, everything rollup ACTUALLY
// inlined must lie inside the artifact's hashed roots.
//
// Deliberately independent of BOTH halves it guards. It does not read
// `inlinedRootsFor` to decide what should have been inlined, and it does not
// consult the externals predicate or the own-folder-barrel rewrite — it reads
// the module ids rollup emitted (`generateBundle` → `chunk.modules`,
// post-tree-shaking) and compares them against the roots the address hashed.
// So a future vite plugin, alias, resolver, or new folder kind that quietly
// pulls unhashed source into a bundle fails the build instead of fossilising in
// the content-addressed store.
//
// Reused (unbuilt) artifacts are not re-audited, and do not need to be: this
// file is part of the builder source digest that feeds the builder identity, so
// touching it invalidates the whole fleet once and every artifact is rebuilt —
// and audited — under the new identity.

import type { Plugin as VitePlugin } from "vite";

export interface InlineAudit {
  /** Collects the emitted module ids. Add to the build's `plugins`. */
  plugin: VitePlugin;
  /** Throws if any inlined first-party module lies outside the hashed roots. */
  verify(): void;
}

/** How many offending paths the error message lists before summarizing. */
const MAX_LISTED = 20;

function isInside(id: string, root: string): boolean {
  return id === root || id.startsWith(root + "/");
}

export function createInlineAudit(opts: {
  dirName: string;
  hashedRoots: string[];
  kind: string;
}): InlineAudit {
  const emitted = new Set<string>();
  const plugin: VitePlugin = {
    name: "web-artifacts:inline-audit",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        for (const id of Object.keys(chunk.modules)) emitted.add(id);
      }
    },
  };

  return {
    plugin,
    verify() {
      const offenders = new Set<string>();
      for (const raw of emitted) {
        // Vite appends query suffixes to a module id (`?used`, `?worker`, …);
        // the file it names is what matters for containment.
        const q = raw.indexOf("?");
        const id = q === -1 ? raw : raw.slice(0, q);
        if (id.startsWith("\0")) continue; // virtual module, no source file
        if (!id.startsWith("/")) continue; // non-path virtual id
        if (id.includes("/node_modules/")) continue; // npm code, covered by the identity hash
        if (opts.hashedRoots.some((root) => isInside(id, root))) continue;
        offenders.add(id);
      }
      if (offenders.size === 0) return;

      const sorted = [...offenders].sort();
      const listed = sorted.slice(0, MAX_LISTED);
      const tail =
        sorted.length > listed.length
          ? `\n  …and ${sorted.length - listed.length} more`
          : "";
      throw new Error(
        `web-artifact ${opts.dirName} (kind "${opts.kind}") inlined ${sorted.length} source ` +
          `file(s) outside its hashed roots — its address does not cover its bytes:\n` +
          listed.map((p) => `  ${p}`).join("\n") +
          tail +
          `\n  hashed roots: ${opts.hashedRoots.join(", ")}\n` +
          `  Those files' content reaches the bundle but not the store address, so editing ` +
          `them leaves the store answering "unchanged" and serving this artifact forever ` +
          `against sibling code it was never built with. Fix: route the folder through its ` +
          `own barrel (external), or add it to inlinedRootsFor() in core/own-roots.ts.`,
      );
    },
  };
}
