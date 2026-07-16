// The global builder identity: everything that changes EVERY artifact's output
// without being any plugin's own file. Toolchain versions, the babel
// contribution set (react-compiler, element-picker, …), the minify flag, and
// the versions of inline-allowlisted packages (their code is bundled INTO
// consumers, so their version is an input of every artifact).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findViteContributions } from "@plugins/framework/plugins/web-core/core";
import { BUILDER_VERSION, INLINE_PACKAGES } from "../constants";
import { computeIdentityHash, sha256Hex } from "../hash";

const require = createRequire(import.meta.url);

/**
 * A package's resolved version. Resolution root matters under bun's isolated
 * installs: toolchain packages (vite, esbuild, tailwind) are THIS plugin's own
 * deps — omit `fromDir` so they resolve from here; a consumer-side package must
 * pass the dir whose package.json declares it.
 */
export function packageVersion(pkg: string, fromDir?: string): string {
  const resolver = fromDir ? createRequire(join(fromDir, "package.json")) : require;
  const pj = resolver.resolve(`${pkg}/package.json`);
  return (JSON.parse(readFileSync(pj, "utf8")) as { version: string }).version;
}

export interface BuilderIdentity {
  identityHash: string;
  /** Human-readable record kept for debugging (written into the manifest). */
  record: Record<string, string | number | boolean>;
}

/**
 * Assemble the identity hash. Babel contributions are identified by the sha256
 * of each discovered `vite/index.ts` plus its plugin's `package.json` (which
 * pins the transform package version, e.g. `babel-plugin-react-compiler`).
 */
export function computeBuilderIdentity(opts: {
  repoRoot: string;
  pluginsRoot: string;
  minify: boolean;
}): BuilderIdentity {
  // Versions come from package.json reads (require.resolve), NOT module
  // imports — loading vite/esbuild here would put ~1s of module eval on every
  // pipeline run's detect stage (and on docgen's barrel import).
  const record: Record<string, string | number | boolean> = {
    builderVersion: BUILDER_VERSION,
    minify: opts.minify,
    vite: packageVersion("vite"),
    esbuild: packageVersion("esbuild"),
    pluginReact: packageVersion("@vitejs/plugin-react"),
  };
  for (const pkg of INLINE_PACKAGES) {
    record[`inline:${pkg}`] = packageVersion(pkg, opts.repoRoot);
  }
  for (const file of findViteContributions(opts.pluginsRoot)) {
    const rel = file.slice(opts.pluginsRoot.length + 1);
    let digest = sha256Hex(readFileSync(file));
    const pkgJson = join(file, "..", "..", "package.json");
    try {
      digest = sha256Hex(digest + readFileSync(pkgJson, "utf8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    record[`babel:${rel}`] = digest;
  }
  return { identityHash: computeIdentityHash(record), record };
}
