import { createHash } from "crypto";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import type { IconifyJSON } from "@iconify/types";
import {
  ALL_STYLE_KEYS,
  BRANDS_SPRITE,
  brandId,
  symbolId,
  type SpriteKey,
} from "@plugins/ui/plugins/icons/core";
import {
  resolveSymbol,
  type SymbolSets,
} from "@plugins/ui/plugins/icons/server";
import { buildSprite } from "./build-sprite";
import { ICON_MANIFEST } from "./icon-manifest.generated";

/**
 * Where each sprite's glyphs come from. Every symbol sprite is built from BOTH
 * Material Symbols sets: a style that lacks a name draws the nearest style that
 * has it, which may be the other weight.
 */
type SetKey = "symbols" | typeof BRANDS_SPRITE;

const PACKAGE = {
  regular: "@iconify-json/material-symbols",
  light: "@iconify-json/material-symbols-light",
  brands: "@iconify-json/simple-icons",
} as const;

function packageFile(pkg: string, file: string): string {
  return fileURLToPath(import.meta.resolve(`${pkg}/${file}`));
}

function setOf(key: SpriteKey): SetKey {
  return key === BRANDS_SPRITE ? BRANDS_SPRITE : "symbols";
}

/**
 * What every sprite is a function of — the manifest and the installed sets'
 * versions — so a URL carrying it can be cached forever.
 */
export const manifestHash: string = createHash("sha256")
  .update(JSON.stringify(ICON_MANIFEST))
  .update(
    Object.values(PACKAGE)
      .map((pkg) => {
        const { version } = JSON.parse(
          readFileSync(packageFile(pkg, "package.json"), "utf8"),
        ) as { version: string };
        return `${pkg}@${version}`;
      })
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 16);

function brandSprite(brands: IconifyJSON): Map<SpriteKey, string> {
  return new Map([
    [
      BRANDS_SPRITE,
      buildSprite(
        ICON_MANIFEST.brands.map((name) => ({
          id: brandId(name),
          set: brands,
          iconifyName: name,
        })),
      ),
    ],
  ]);
}

/**
 * All 12 symbol sprites, for the manifest's names. Under `ms-<K>-<name>` each
 * holds the drawing `resolveSymbol` picks for style K — the style's own, or
 * its nearest fallback — so `<Icon>` needs no fallback of its own.
 */
function symbolSprites(sets: SymbolSets): Map<SpriteKey, string> {
  const out = new Map<SpriteKey, string>();
  for (const styleKey of ALL_STYLE_KEYS) {
    out.set(
      styleKey,
      buildSprite(
        ICON_MANIFEST.symbols.map((name) => ({
          id: symbolId(styleKey, name),
          ...resolveSymbol(sets, name, styleKey),
        })),
      ),
    );
  }
  return out;
}

async function readSet(pkg: string): Promise<IconifyJSON> {
  return (await Bun.file(packageFile(pkg, "icons.json")).json()) as IconifyJSON;
}

// One build per sprite group per process, memoized: the ~10 MB sets are
// parsed once, every sprite they yield is kept (a few hundred KB), and the
// parsed sets are dropped. The manifest and node_modules cannot change under a
// running process.
const builds = new Map<SetKey, Promise<Map<SpriteKey, string>>>();

async function loadSet(key: SetKey): Promise<Map<SpriteKey, string>> {
  if (key === BRANDS_SPRITE) {
    // No brand is drawn: nothing to parse the 5 MB brand set for.
    if (ICON_MANIFEST.brands.length === 0) {
      return brandSprite({ prefix: "simple-icons", icons: {} });
    }
    return brandSprite(await readSet(PACKAGE.brands));
  }
  const [regular, light] = await Promise.all([
    readSet(PACKAGE.regular),
    readSet(PACKAGE.light),
  ]);
  return symbolSprites({ regular, light });
}

export async function spriteFor(key: SpriteKey): Promise<string> {
  const setKey = setOf(key);
  let build = builds.get(setKey);
  if (!build) {
    // A failed build is not cached: the next request retries (and fails
    // loudly again). The rejection still reaches this caller.
    build = loadSet(setKey).catch((err: unknown) => {
      builds.delete(setKey);
      throw err;
    });
    builds.set(setKey, build);
  }
  const sprite = (await build).get(key);
  if (sprite === undefined) {
    throw new Error(
      `[icons] sprite "${key}" was not built from set "${setKey}"`,
    );
  }
  return sprite;
}
