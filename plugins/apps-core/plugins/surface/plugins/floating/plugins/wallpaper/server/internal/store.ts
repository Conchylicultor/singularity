import { writeFile, readFile } from "node:fs/promises";
import { wallpaperDir } from "../../data-dirs";

// Machine-global wallpaper store, in the `apps/wallpaper` data dir this plugin
// declares. A SINGLETON: there is exactly one current desktop wallpaper, so the
// image always lands at the same path (a fixed name) and is overwritten on each
// save. The mime is sidecar metadata so the image route can serve the right
// content-type after a restart.
//
// Functions, not consts: `DataDir.path` is a getter resolved per read, because
// the data root is env-overridable and a value frozen at module eval would
// capture whatever the environment said when this module was first imported.
const imagePath = (): string => wallpaperDir.file("current");
const metaPath = (): string => wallpaperDir.file("current.json");

interface WallpaperMeta {
  mime: string;
  version: number;
}

/** Absolute path of the stored current image, for streaming via `Bun.file`. */
export function wallpaperImagePath(): string {
  return imagePath();
}

async function readMeta(): Promise<WallpaperMeta | null> {
  try {
    const raw = await readFile(metaPath(), "utf8");
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
  wallpaperDir.ensure();
  const prev = await readMeta();
  const version = (prev?.version ?? 0) + 1;
  await writeFile(imagePath(), bytes);
  const meta: WallpaperMeta = { mime, version };
  await writeFile(metaPath(), JSON.stringify(meta));
  return { version, mime };
}

/**
 * The stored mime for the current image, or `null` if no wallpaper has been
 * saved (no sidecar on disk). Used by the image route to set the content-type.
 */
export async function readWallpaperMime(): Promise<string | null> {
  return (await readMeta())?.mime ?? null;
}
