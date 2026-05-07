import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import type { Check } from "./types";

const NULL_UUID = "00000000-0000-0000-0000-000000000000";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

interface Snapshot {
  file: string;
  id: string;
  prevId: string;
}

function readSnapshots(metaDir: string): Snapshot[] {
  return readdirSync(metaDir)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(metaDir, file), "utf8"));
      return { file, id: raw.id, prevId: raw.prevId };
    });
}

export const snapshotChainIntact: Check = {
  id: "snapshot-chain-intact",
  description: "drizzle migration snapshots form a single linear chain",
  async run() {
    const root = await getRoot();
    const metaDir = resolve(root, "plugins/database/plugins/migrations/data/meta");

    const snapshots = readSnapshots(metaDir);
    if (snapshots.length === 0) return { ok: true };

    const byId = new Map<string, Snapshot>();
    for (const s of snapshots) {
      if (byId.has(s.id)) {
        return {
          ok: false,
          message:
            `duplicate snapshot id ${s.id}:\n  ${byId.get(s.id)!.file}\n  ${s.file}`,
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
          message:
            `snapshot ${s.file} references missing parent ${s.prevId}.`,
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
