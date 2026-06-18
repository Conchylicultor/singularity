import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import {
  PrototypeMetaSchema,
  type PrototypeMeta,
} from "../../core";
import { PROTOTYPES_DIR } from "./paths";

/**
 * Read every `prototypes/<name>/meta.json` into a `PrototypeMeta[]`, skipping
 * `_shared` and dot-dirs. The dir name is injected as `name` (overriding any
 * `name` the file declares). A prototype dir without a readable/valid
 * `meta.json` is skipped — the gallery degrades gracefully rather than crashing
 * on a half-authored mock.
 */
export async function listPrototypeMetas(): Promise<PrototypeMeta[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(PROTOTYPES_DIR, { withFileTypes: true });
  } catch (err) {
    // The prototypes/ dir may not exist yet — that's the one expected failure.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const metas: PrototypeMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dirName = entry.name;
    if (dirName === "_shared" || dirName.startsWith(".")) continue;

    const metaPath = join(PROTOTYPES_DIR, dirName, "meta.json");
    const file = Bun.file(metaPath);
    if (!(await file.exists())) continue;

    let raw: unknown;
    try {
      raw = await file.json();
    } catch (err) {
      console.error(`[prototypes] invalid JSON in ${metaPath}`, err);
      continue;
    }

    const parsed = PrototypeMetaSchema.safeParse({
      blurb: "",
      theme: "",
      scripts: [],
      styles: [],
      ...(raw as Record<string, unknown>),
      name: dirName,
    });
    if (!parsed.success) {
      console.error(`[prototypes] invalid meta.json in ${metaPath}`, parsed.error);
      continue;
    }
    metas.push(parsed.data);
  }

  metas.sort((a, b) => a.name.localeCompare(b.name));
  return metas;
}
