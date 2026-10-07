import type {
  HostFsArchiveReason,
  HostFsEntry,
  HostFsListResult,
  HostFsPeekResult,
} from "@plugins/infra/plugins/host-fs/core";
import { joinPath } from "./paths";

/**
 * Whether the browser shows a listed entry, `path` in display form: Show
 * hidden files and every lens's hide rule decide it. It reads only `hidden`
 * and the path, so a peeked child (a name and a hidden flag) is judged by the
 * very rule a listed entry is.
 */
export type EntryFilter = (
  entry: Pick<HostFsEntry, "hidden">,
  path: string,
) => boolean;

/** How many items a folder holds, as its Size cell shows it. */
export type ItemCount =
  /** The visible items, by the browser's current visibility rules. */
  | { kind: "count"; n: number }
  /** Too many to ship the names: every item, visibility rules not applied. */
  | { kind: "many"; total: number }
  | { kind: "denied" }
  | { kind: "unreadable"; reason: HostFsArchiveReason }
  /** Gone since its parent was listed, or no longer a folder. */
  | { kind: "gone" }
  | { kind: "loading" };

/**
 * The item count of the folder at `path`. Its own listing wins when it is
 * listed (an expanded folder costs no read); otherwise its peek (child names
 * only). `listed` is the folder's listing result if it was asked for (`null`
 * while it loads), `peek` its peek result once one arrived.
 */
export function itemCount(
  path: string,
  listed: HostFsListResult | null | undefined,
  peek: HostFsPeekResult | undefined,
  shows: EntryFilter,
): ItemCount {
  if (listed?.kind === "ok") {
    return {
      kind: "count",
      n: listed.entries.filter((e) => shows(e, joinPath(path, e.name))).length,
    };
  }
  if (peek !== undefined) {
    switch (peek.kind) {
      case "ok":
        return {
          kind: "count",
          n: peek.children.filter((c) => shows(c, joinPath(path, c.name)))
            .length,
        };
      case "too-many":
        return { kind: "many", total: peek.total };
      // A folder row whose path is now an archive file: replaced since listed.
      case "archive":
        return { kind: "gone" };
      case "denied":
      case "missing":
      case "not-a-dir":
      case "unreadable-archive":
        return failed(peek);
    }
  }
  return listed == null ? { kind: "loading" } : failed(listed);
}

function failed(
  result:
    | Exclude<HostFsListResult, { kind: "ok" }>
    | Exclude<HostFsPeekResult, { kind: "ok" | "too-many" | "archive" }>,
): ItemCount {
  switch (result.kind) {
    case "denied":
      return { kind: "denied" };
    case "unreadable-archive":
      return { kind: "unreadable", reason: result.reason };
    case "missing":
    case "not-a-dir":
      return { kind: "gone" };
  }
}

/** Why an archive cannot be read, in the user's terms. */
export function archiveReasonMessage(reason: HostFsArchiveReason): string {
  switch (reason) {
    case "corrupt":
      return "This archive is damaged or not in a format it claims";
    case "encrypted":
      return "This archive is encrypted";
    case "unsupported-method":
      return "This archive uses a compression method that cannot be read";
    case "too-many-entries":
      return "This archive has too many entries to browse";
  }
}
