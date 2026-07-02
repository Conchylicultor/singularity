import { join } from "node:path";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { worktreeDataDir, currentWorktreeName } from "@plugins/infra/plugins/paths/server";

// One JSONL line per snapshot; snapshots are tens of KB worst case, so a 4 MB
// cap keeps hundreds of them.
const MAX_FILE_BYTES = 4_000_000;

const channel = Log.channel("flight-recorder", { persist: true });

function snapshotFilePath(): string {
  return join(
    worktreeDataDir(currentWorktreeName()),
    "logs",
    "flight-recorder.jsonl",
  );
}

// Same bounded-without-a-job pattern as stall-profiler's rotation: trim to the
// newest half once the file grows past the cap. One sync rewrite per growth
// cycle; statSync is cheap relative to a snapshot's serialization.
function rotateIfNeeded(): void {
  const file = snapshotFilePath();
  let size: number;
  try {
    size = statSync(file).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (size <= MAX_FILE_BYTES) return;
  const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
  writeFileSync(file, lines.slice(Math.floor(lines.length / 2)).join("\n") + "\n");
}

export function persistSnapshot(snapshot: object): void {
  rotateIfNeeded();
  channel.publish(JSON.stringify(snapshot));
}
