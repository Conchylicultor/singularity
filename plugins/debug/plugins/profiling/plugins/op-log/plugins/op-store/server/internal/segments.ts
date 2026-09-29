// Where to read next — the pure half of the ingester. Given the durable cursor
// and the files on disk (the live `op-log.jsonl` and its rotations, each
// identified by the inode its OPEN fd reports), say which byte ranges of which
// files to read, in chronological order.
//
// The sink rotates by rename (`live → .1 → .2 → .3`, the oldest dropped), so a
// file keeps its inode as its name changes. That is what makes the cursor
// `(inode, offset)` rather than `(path, offset)`: after a rotation the cursor's
// bytes are in `.1`, and only the inode can find them.

/** The durable read position: the file (by inode) and the byte just past a `\n`. */
export interface IngestCursor {
  inode: string;
  offset: number;
}

/** One file as its open fd reports it. */
export interface FileStat {
  inode: string;
  size: number;
}

export interface Segment {
  /** Index into the `files` array the plan was made from. */
  slot: number;
  inode: string;
  /** First byte to read. */
  from: number;
  /** One past the last byte to read (the size at fstat time). */
  to: number;
  /**
   * `from` may be mid-line (a seed or gap read of the tail): discard bytes up to
   * and including the first `\n` at or after `from - 1`.
   */
  alignToLine: boolean;
}

export interface SegmentPlan {
  segments: Segment[];
  /**
   * Some lines were never read: the cursor's file is gone (rotated past the
   * last kept slot, or the directory was replaced), or it got SHORTER than the
   * cursor (truncated). A terminal may be among them.
   */
  gap: boolean;
}

/**
 * How much of the live file a first boot (no cursor) or a gap reads: its last
 * 16 MB. A bounded tail, not the whole history — the v2 terminal is
 * self-contained, so an op whose head was clipped still lands whole once it
 * ends, and a head-less in-flight op is simply not stored until then.
 */
export const SEED_BYTES = 16 * 1024 * 1024;

function tailSegment(slot: number, f: FileStat, seedBytes: number): Segment {
  const from = Math.max(0, f.size - seedBytes);
  return { slot, inode: f.inode, from, to: f.size, alignToLine: from > 0 };
}

/**
 * Plan the next drain.
 *
 * `files` is ordered NEWEST first — `[live, .1, .2, …]` — with `null` for a slot
 * that does not exist. The caller opens them in that order, which is what makes
 * the snapshot complete under a concurrent rotation: a file renamed between two
 * opens is seen twice (once under each name), never zero times. The duplicate
 * is dropped here, keeping its newest (lowest) slot.
 *
 * - No cursor (first boot): the live file's last `seedBytes`.
 * - Cursor file found at slot k: the rest of it from the cursor's offset, then
 *   every newer file whole, oldest to newest.
 * - Found but shorter than the offset (truncated in place): the whole file, and
 *   `gap`.
 * - Not found: the live file's last `seedBytes`, and `gap`.
 * - No live file: only what the cursor's own file still holds (nothing to seed
 *   from until the next append creates it).
 */
export function planSegments(
  cursor: IngestCursor | null,
  files: readonly (FileStat | null)[],
  seedBytes: number = SEED_BYTES,
): SegmentPlan {
  // Newest-first, one entry per inode (the newest name wins).
  const seen = new Set<string>();
  const unique: { slot: number; file: FileStat }[] = [];
  files.forEach((file, slot) => {
    if (!file || seen.has(file.inode)) return;
    seen.add(file.inode);
    unique.push({ slot, file });
  });
  const live = files[0] ?? null;

  if (cursor === null) {
    if (!live) return { segments: [], gap: false };
    return { segments: [tailSegment(0, live, seedBytes)], gap: false };
  }

  const at = unique.findIndex((u) => u.file.inode === cursor.inode);
  if (at < 0) {
    if (!live) return { segments: [], gap: false };
    return { segments: [tailSegment(0, live, seedBytes)], gap: true };
  }

  const segments: Segment[] = [];
  const own = unique[at]!;
  const truncated = own.file.size < cursor.offset;
  segments.push({
    slot: own.slot,
    inode: own.file.inode,
    from: truncated ? 0 : cursor.offset,
    to: own.file.size,
    alignToLine: false,
  });
  // Every newer file, oldest → newest (`unique` is newest-first).
  for (let i = at - 1; i >= 0; i--) {
    const u = unique[i]!;
    segments.push({
      slot: u.slot,
      inode: u.file.inode,
      from: 0,
      to: u.file.size,
      alignToLine: false,
    });
  }
  return { segments, gap: truncated };
}
