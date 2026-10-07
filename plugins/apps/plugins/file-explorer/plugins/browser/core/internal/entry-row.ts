import type { Rank } from "@plugins/primitives/plugins/rank/core";
import type { HostFsEntryKind } from "@plugins/infra/plugins/host-fs/core";

/**
 * One entry of a listed folder, as a row of the browser's tree DataView — what
 * a `FileBrowserSlots.Fields` contributor projects its fields from. Its path is
 * its id, in the browser's display form (`~/…` under home).
 */
export interface EntryRow {
  id: string;
  parentId: string | null;
  rank: Rank;
  name: string;
  path: string;
  kind: HostFsEntryKind;
  size: number;
  mtimeMs: number;
  hidden: boolean;
  /**
   * Opens like a folder: a directory, or an archive file (`isBrowsable`). An
   * archive row is still `kind: "file"` — its size, icon and git status are a
   * file's.
   */
  browsable: boolean;
}
