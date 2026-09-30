import { defineDep } from "@plugins/infra/plugins/deps/deps";
import { download } from "@plugins/infra/plugins/deps/plugins/download/deps";

/** `github.com/chrisdonahue/sheetsage-data`, the commit both files are read from. */
const SHEETSAGE_DATA_COMMIT = "06113c04b109a2f27517b0399ff47550099f2466";

/**
 * The two files, each with the sha256 a download must match. The same pins as
 * `integrations/hooktheory/scripts/hookpad-sound-golden.ts`, which checked the
 * chord converter against exactly these bytes.
 */
export const SHEETSAGE_DUMP_FILES = {
  /** Sheet Sage's own reading: slugs, video duration, beat alignment, tags. 20 MB → 309 MB. */
  processed: {
    name: "Hooktheory.json.gz",
    sha256: "917b7cd58f5f4e07d6c36acf7bfad958c99ee05472dab3555399141094698e0c",
  },
  /** The original Hookpad documents plus the API record (display names). 96 MB → 1.5 GB. */
  raw: {
    name: "Hooktheory_Raw.json.gz",
    sha256: "716af2979f060400c302ab098dd45d9f8c5fe4d4b3b1fe61c478dd9bdf041634",
  },
} as const;

function pinned(file: { name: string; sha256: string }) {
  return {
    ...file,
    url: `https://github.com/chrisdonahue/sheetsage-data/raw/${SHEETSAGE_DATA_COMMIT}/hooktheory/${file.name}`,
  };
}

/**
 * Sheet Sage's two Hooktheory dump files, pinned to a commit and sha256. The
 * song index builds its snapshot from them once per machine
 * (`server/internal/snapshot.ts`); after that they are only needed again for a
 * new snapshot format, so the deps sweep may reclaim them.
 */
export const sheetSageDumps = defineDep({
  id: "sheetsage-dumps",
  owner: "apps/chord/song-index",
  description:
    "Sheet Sage's Hooktheory dump files, the source of the Chord song index's snapshot",
  sizeHint: "≈116 MB",
  source: download({
    files: [
      pinned(SHEETSAGE_DUMP_FILES.processed),
      pinned(SHEETSAGE_DUMP_FILES.raw),
    ],
  }),
  updates: {
    none: "sheetsage-data is a frozen dataset pinned to a commit",
  },
});
