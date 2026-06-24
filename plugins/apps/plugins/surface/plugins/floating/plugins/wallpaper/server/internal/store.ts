import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// Machine-global wallpaper store, sibling to attachments/secrets/reports under
// ~/.singularity. A SINGLETON: there is exactly one current desktop wallpaper, so
// the image always lands at the same path (a fixed name) and is overwritten on
// each save. The mime is sidecar metadata so the image route can serve the right
// content-type after a restart.
const WALLPAPER_DIR = join(SINGULARITY_DIR, "wallpaper");
const IMAGE_PATH = join(WALLPAPER_DIR, "current");
const META_PATH = join(WALLPAPER_DIR, "current.json");

interface WallpaperMeta {
  mime: string;
  version: number;
}

/** Absolute path of the stored current image, for streaming via `Bun.file`. */
export function wallpaperImagePath(): string {
  return IMAGE_PATH;
}

async function readMeta(): Promise<WallpaperMeta | null> {
  try {
    const raw = await readFile(META_PATH, "utf8");
    const meta = JSON.parse(raw) as Partial<WallpaperMeta>;
    if (typeof meta.mime !== "string" || !meta.mime) return null;
    return { mime: meta.mime, version: meta.version ?? 0 };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Persist image bytes as the current wallpaper, replacing whatever was there.
 * Writes the bytes plus a sidecar `current.json` carrying the mime and a
 * monotonically-incremented version stamp (the cache-bust `?v=` the client reads
 * back). Returns the new version + mime; the web picker writes them into config.
 */
export async function writeWallpaper(
  bytes: Uint8Array,
  mime: string,
): Promise<{ version: number; mime: string }> {
  await mkdir(WALLPAPER_DIR, { recursive: true });
  const prev = await readMeta();
  const version = (prev?.version ?? 0) + 1;
  await writeFile(IMAGE_PATH, bytes);
  const meta: WallpaperMeta = { mime, version };
  await writeFile(META_PATH, JSON.stringify(meta));
  return { version, mime };
}

/**
 * The stored mime for the current image, or `null` if no wallpaper has been
 * saved (no sidecar on disk). Used by the image route to set the content-type.
 */
export async function readWallpaperMime(): Promise<string | null> {
  return (await readMeta())?.mime ?? null;
}
