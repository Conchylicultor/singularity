import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import type { IconifyJSON } from "@iconify/types";
import type { SymbolSets } from "@plugins/ui/plugins/icons/server";

/** The installed Iconify packages the sprites are built from. */
export const PACKAGE = {
  regular: "@iconify-json/material-symbols",
  light: "@iconify-json/material-symbols-light",
  brands: "@iconify-json/simple-icons",
} as const;

function packageFile(pkg: string, file: string): string {
  return fileURLToPath(import.meta.resolve(`${pkg}/${file}`));
}

export function installedVersion(pkg: string): string {
  const { version } = JSON.parse(
    readFileSync(packageFile(pkg, "package.json"), "utf8"),
  ) as { version: string };
  return version;
}

export async function readSet(pkg: string): Promise<IconifyJSON> {
  return (await Bun.file(packageFile(pkg, "icons.json")).json()) as IconifyJSON;
}

interface Lease {
  readonly sets: Promise<SymbolSets>;
  users: number;
}

// The parsed Material Symbols sets (~19 MB of JSON), shared by whoever needs
// them at the same moment — the manifest sprites and a runtime-symbol style
// build at boot, say — and dropped when the last one is done: every consumer
// keeps only what it built from them.
let lease: Lease | null = null;

/**
 * Run `fn` over the two parsed Material Symbols sets. Concurrent callers share
 * one parse; the sets are released when the last caller returns. A failed
 * parse is not kept: the next call parses again (and fails loudly again).
 */
export async function withSymbolSets<T>(
  fn: (sets: SymbolSets) => T | Promise<T>,
): Promise<T> {
  lease ??= {
    sets: Promise.all([readSet(PACKAGE.regular), readSet(PACKAGE.light)]).then(
      ([regular, light]) => ({ regular, light }),
    ),
    users: 0,
  };
  const held = lease;
  held.users++;
  try {
    return await fn(await held.sets);
  } finally {
    held.users--;
    if (held.users === 0 && lease === held) lease = null;
  }
}
