import {
  readDraft,
  writeDraft,
} from "@plugins/primitives/plugins/persistent-draft/web";
import { TILE_DEFAULT, clampTile } from "../../core";

/**
 * The two viewer choices that outlive one open, on this device: whether the
 * thumbnail strip is docked, and how large the grid's tiles are. The layout
 * (single / grid) and the slideshow start fresh on every open.
 */
export interface ViewPrefs {
  readonly strip: boolean;
  readonly tile: number;
}

const KEY = "image-viewer:prefs";
/** A preference, not a draft: kept for a year of not opening the viewer. */
const TTL = 365 * 24 * 60 * 60 * 1000;

export function readViewPrefs(): ViewPrefs {
  const raw = readDraft<Partial<ViewPrefs>>(KEY, { ttl: TTL });
  return {
    strip: typeof raw?.strip === "boolean" ? raw.strip : false,
    tile: typeof raw?.tile === "number" ? clampTile(raw.tile) : TILE_DEFAULT,
  };
}

export function writeViewPrefs(prefs: ViewPrefs): void {
  writeDraft(KEY, prefs, { ttl: TTL });
}
