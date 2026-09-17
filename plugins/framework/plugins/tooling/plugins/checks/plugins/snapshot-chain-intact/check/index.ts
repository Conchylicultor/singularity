import { open, readdir } from "fs/promises";
import { join, resolve } from "path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

interface Snapshot {
  file: string;
  id: string;
  prevId: string;
}

/**
 * How much of a snapshot's start is read. drizzle-kit writes `id` then `prevId`
 * as the first two keys, so both fit well inside this.
 */
const HEAD_BYTES = 1024;

/** The first two keys of a snapshot, anchored at the start of the file. */
const HEAD_RE = /^\{\s*"id":\s*"([^"]+)",\s*"prevId":\s*"([^"]+)"/;

/**
 * The chain only needs each snapshot's `id` and `prevId`, but a snapshot is the
 * whole schema (~250 KB, and there are hundreds). Reading and parsing every one
 * in full held the check runner's shared thread for 1–2 s, so only the start of
 * each file is read. A file whose start is not `{ "id": …, "prevId": … }` throws,
 * naming it: a changed snapshot layout must fail here, not pass unchecked.
 */
async function readHead(path: string): Promise<{ id: string; prevId: string }> {
  const handle = await open(path, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await handle.read(buf, 0, HEAD_BYTES, 0);
    const match = HEAD_RE.exec(buf.toString("utf8", 0, bytesRead));
    if (!match) {
      throw new Error(
        `snapshot-chain-intact: ${path} does not start with "id" then "prevId" — the drizzle snapshot layout changed; update readHead`,
      );
    }
    return { id: match[1]!, prevId: match[2]! };
  } finally {
    await handle.close();
  }
}

async function readSnapshots(metaDir: string): Promise<Snapshot[]> {
  const files = (await readdir(metaDir))
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      ...(await readHead(join(metaDir, file))),
    })),
  );
}

const check: Check = {
  id: "snapshot-chain-intact",
  description: "drizzle migration snapshots form a single linear chain",
  async run() {
    const root = await getWorktreeRoot();
    const metaDir = resolve(
      root,
      "plugins/database/plugins/migrations/data/meta",
    );

    const snapshots = await readSnapshots(metaDir);
    if (snapshots.length === 0) return { ok: true };

    const byId = new Map<string, Snapshot>();
    for (const s of snapshots) {
      if (byId.has(s.id)) {
        return {
          ok: false,
          message: `duplicate snapshot id ${s.id}:\n  ${byId.get(s.id)!.file}\n  ${s.file}`,
          hint: "Regenerate one of the snapshots via `./singularity build`.",
        };
      }
      byId.set(s.id, s);
    }

    const byPrevId = new Map<string, Snapshot[]>();
    for (const s of snapshots) {
      const list = byPrevId.get(s.prevId) ?? [];
      list.push(s);
      byPrevId.set(s.prevId, list);
    }

    const roots = byPrevId.get(NULL_UUID) ?? [];
    if (roots.length === 0) {
      return {
        ok: false,
        message: `no root snapshot (none has prevId=${NULL_UUID}).`,
        hint: "Drizzle snapshots have been corrupted. Regenerate from a known-good state.",
      };
    }
    if (roots.length > 1) {
      return {
        ok: false,
        message:
          `multiple root snapshots (prevId=${NULL_UUID}):\n` +
          roots.map((r) => `  ${r.file}`).join("\n"),
        hint: "Only one snapshot may be the chain root. Rebase onto main and re-run `./singularity build`.",
      };
    }

    for (const [prev, group] of byPrevId) {
      if (group.length > 1) {
        return {
          ok: false,
          message:
            `snapshot chain has a Y-fork: ${group.length} snapshots share prevId ${prev}:\n` +
            group.map((s) => `  ${s.file}`).join("\n"),
          hint: "Rebase onto origin/main, then re-run `./singularity build --reset-migration --migration-name <slug>` to drop this branch's old migration and regenerate it against the new tip.",
        };
      }
    }

    for (const s of snapshots) {
      if (s.prevId === NULL_UUID) continue;
      if (!byId.has(s.prevId)) {
        return {
          ok: false,
          message: `snapshot ${s.file} references missing parent ${s.prevId}.`,
          hint: "A parent snapshot was deleted or the chain was hand-edited. Restore from git or regenerate.",
        };
      }
    }

    const reachable = new Set<string>();
    let cursor: Snapshot | undefined = roots[0];
    while (cursor) {
      reachable.add(cursor.id);
      const next = byPrevId.get(cursor.id);
      cursor = next && next.length === 1 ? next[0] : undefined;
    }
    if (reachable.size !== snapshots.length) {
      const orphans = snapshots.filter((s) => !reachable.has(s.id));
      return {
        ok: false,
        message:
          `${orphans.length} snapshot(s) are not reachable from the root:\n` +
          orphans.map((s) => `  ${s.file}`).join("\n"),
        hint: "The chain has a broken link. Inspect snapshot prevIds and regenerate if needed.",
      };
    }

    return { ok: true };
  },
};

export default check;
