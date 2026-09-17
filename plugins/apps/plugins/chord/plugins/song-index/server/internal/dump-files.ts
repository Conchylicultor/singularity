import { createHash } from "node:crypto";
import { createReadStream, existsSync, renameSync, rmSync } from "node:fs";
import { SNAPSHOT_FORMAT_VERSION } from "../../core";
import { sheetSageCacheDir } from "../../data-dirs";

// ── Sheet Sage's two Hooktheory files, pinned ────────────────────────────────

/** `github.com/chrisdonahue/sheetsage-data`, the commit both files are read from. */
export const SHEETSAGE_DATA_COMMIT = "06113c04b109a2f27517b0399ff47550099f2466";

/**
 * The two files, each with the sha256 a download must match. The same pins as
 * `integrations/hooktheory/scripts/hookpad-sound-golden.ts`, which checked the
 * chord converter against exactly these bytes.
 */
export const SHEETSAGE_DUMP_FILES = {
  /** Sheet Sage's own reading: slugs, video duration, beat alignment, tags. 20 MB → 309 MB. */
  processed: {
    file: "Hooktheory.json.gz",
    sha256: "917b7cd58f5f4e07d6c36acf7bfad958c99ee05472dab3555399141094698e0c",
  },
  /** The original Hookpad documents plus the API record (display names). 96 MB → 1.5 GB. */
  raw: {
    file: "Hooktheory_Raw.json.gz",
    sha256: "716af2979f060400c302ab098dd45d9f8c5fe4d4b3b1fe61c478dd9bdf041634",
  },
} as const;
export type DumpFileId = keyof typeof SHEETSAGE_DUMP_FILES;

/**
 * The snapshot's name: both dump pins and the line format, so a different dump
 * or a new format is a different file rather than a misread one.
 */
export const SNAPSHOT_NAME = `sheetsage-${SHEETSAGE_DUMP_FILES.processed.sha256.slice(0, 12)}-${SHEETSAGE_DUMP_FILES.raw.sha256.slice(0, 12)}-v${SNAPSHOT_FORMAT_VERSION}`;

/** Longest a single download may take before it is abandoned (both files together take ~1 min on a normal link). */
const DOWNLOAD_TIMEOUT_MS = 20 * 60_000;

function dumpUrl(id: DumpFileId): string {
  return `https://github.com/chrisdonahue/sheetsage-data/raw/${SHEETSAGE_DATA_COMMIT}/hooktheory/${SHEETSAGE_DUMP_FILES[id].file}`;
}

export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path))
    hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Whether both files are already in the cache (their sha256 is checked when they are used). */
export function dumpFilesPresent(): boolean {
  return (["processed", "raw"] as const).every((id) =>
    existsSync(sheetSageCacheDir.file(SHEETSAGE_DUMP_FILES[id].file)),
  );
}

/**
 * The local path of a dump file, downloaded first when the cache lacks it.
 * Written to a temp name and renamed only once its sha256 matches, so the
 * cache never holds a partial or wrong file. A mismatch — on a download or on a
 * file already there — throws: a pinned file that changed is not something to
 * work around.
 *
 * Plain `fetch`: the host is fixed (GitHub, following its redirect to its own
 * object store), the same rule as the Hooktheory client.
 */
export async function ensureDumpFile(
  id: DumpFileId,
  log: (line: string) => void,
): Promise<string> {
  const { file, sha256 } = SHEETSAGE_DUMP_FILES[id];
  const path = sheetSageCacheDir.file(file);
  if (existsSync(path)) {
    const actual = await sha256OfFile(path);
    if (actual !== sha256) {
      throw new Error(
        `${path} has sha256 ${actual}, expected the pinned ${sha256}. Delete it to download it again.`,
      );
    }
    return path;
  }

  sheetSageCacheDir.ensure();
  const url = dumpUrl(id);
  const tmp = `${path}.tmp-${process.pid}`;
  log(`downloading ${url}`);
  const started = Date.now();
  const res = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!res.ok || res.body === null) {
    throw new Error(`GET ${url} answered HTTP ${res.status}`);
  }
  let bytes: number;
  let actual: string;
  try {
    bytes = await Bun.write(tmp, res);
    actual = await sha256OfFile(tmp);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
  if (actual !== sha256) {
    rmSync(tmp, { force: true });
    throw new Error(
      `${url} downloaded with sha256 ${actual}, expected the pinned ${sha256}`,
    );
  }
  renameSync(tmp, path);
  log(
    `downloaded ${file}: ${(bytes / 1e6).toFixed(1)} MB in ${Math.round((Date.now() - started) / 1000)} s`,
  );
  return path;
}
