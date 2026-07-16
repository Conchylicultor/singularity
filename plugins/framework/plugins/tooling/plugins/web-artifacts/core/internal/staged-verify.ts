// Ground-truth verification of the staged dist: re-scan the ACTUAL `.js`/`.mjs`
// files the browser will fetch (through the store symlinks) and verify every
// import resolves — bare specifiers through the import map, relative specifiers
// to a real staged file. Deliberately INDEPENDENT of the builders' recorded
// `meta.json`: the metadata-based coverage check shares its scanner with the
// map assembly, so a scanner blind spot makes the map and the check wrong
// identically (the unscanned-`.mjs`-chunks outage). This pass shares no inputs
// with the planner — it reads the staged bytes.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { init as esLexerInit, parse as esLexerParse } from "es-module-lexer";
import { isBrowserUnreachableDynamic } from "../constants";

export interface StagedModuleIssue {
  specifier: string;
  /** Dist-relative file the import appears in (`artifacts/<link>/<file>`). */
  file: string;
}

export interface StagedScanResult {
  /** Bare STATIC imports with no map entry, and relative imports that resolve
   *  to no staged file — both break module evaluation, so the caller
   *  hard-fails. Registry dynamics are included: its loaders ARE the app. */
  failures: StagedModuleIssue[];
  /** Bare DYNAMIC imports with no map entry (browser-unreachable kinds
   *  excluded) — a latent failure if ever invoked, so the caller warns. */
  warnings: StagedModuleIssue[];
}

/**
 * Scan every staged module file under `<stagingDir>/artifacts/` and verify its
 * emitted imports against the composed import map. Computed dynamic imports
 * (non-literal specifiers) are unverifiable statically and skipped, matching
 * the builders' scanner.
 */
export async function scanStagedModules(opts: {
  stagingDir: string;
  /** The composed map's `imports` record (specifier → URL). */
  imports: Record<string, string>;
}): Promise<StagedScanResult> {
  await esLexerInit;
  const failures: StagedModuleIssue[] = [];
  const warnings: StagedModuleIssue[] = [];
  const artifactsDir = join(opts.stagingDir, "artifacts");
  for (const linkName of readdirSync(artifactsDir).sort()) {
    // The registry's dynamic imports are the app's plugin loaders — as
    // load-bearing as static edges, so a miss is a failure, not a warning.
    const strictDynamic = linkName.startsWith("composition-web-registry.");
    const linkDir = join(artifactsDir, linkName);
    for (const dirent of readdirSync(linkDir, { recursive: true, withFileTypes: true })) {
      if (!dirent.isFile()) continue;
      if (!dirent.name.endsWith(".js") && !dirent.name.endsWith(".mjs")) continue;
      const abs = join(dirent.parentPath, dirent.name);
      const distRel = join("artifacts", linkName, abs.slice(linkDir.length + 1));
      const [imports] = esLexerParse(readFileSync(abs, "utf8"), distRel);
      for (const imp of imports) {
        const spec = imp.n;
        if (spec === undefined) continue;
        if (spec.startsWith("./") || spec.startsWith("../")) {
          const target = resolve(dirname(abs), spec);
          if (!existsSync(target) || !statSync(target).isFile()) {
            failures.push({ specifier: spec, file: distRel });
          }
        } else if (!(spec in opts.imports)) {
          const isDynamic = imp.d >= 0;
          if (!isDynamic || strictDynamic) failures.push({ specifier: spec, file: distRel });
          else if (!isBrowserUnreachableDynamic(spec)) {
            warnings.push({ specifier: spec, file: distRel });
          }
        }
      }
    }
  }
  return { failures, warnings };
}
