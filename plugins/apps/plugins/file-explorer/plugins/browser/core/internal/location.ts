import { isWithin, joinPath } from "./paths";

/**
 * Where a file explorer is: the folder it lists, and the file open beside it.
 * Both paths are in display form (`~/…` under home, absolute elsewhere).
 */
export interface ExplorerLocation {
  dir: string;
  /** The file previewed beside the listing, or `null` for none. */
  open: string | null;
}

/** One string per location, for comparing two of them. */
export function locationKey(location: ExplorerLocation): string {
  return `${location.dir}\u0000${location.open ?? ""}`;
}

/**
 * The open file as written in a URL: relative to the folder when it is inside
 * it (the usual case — a file of the listing), the full path otherwise.
 */
export function encodeOpenParam(dir: string, open: string): string {
  if (open !== dir && isWithin(open, dir)) {
    return open.slice(dir === "/" ? 1 : dir.length + 1);
  }
  return open;
}

/** The inverse of {@link encodeOpenParam}: a full path stays, a relative one joins `dir`. */
export function decodeOpenParam(dir: string, param: string): string {
  return param.startsWith("/") || param === "~" || param.startsWith("~/")
    ? param
    : joinPath(dir, param);
}
