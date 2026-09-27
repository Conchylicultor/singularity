import { basename, dirname, join } from "path";
import { serveValue } from "@plugins/network/plugins/live/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { BYPASS_TOKENS } from "@plugins/framework/plugins/tooling/plugins/guards/core";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { allowFiles, type AllowFiles } from "../../shared";

// Subtrees whose churn can never be a bypass file (those sit at the worktree
// root), kept out of the watch so a build or install does not wake it.
const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
];

async function loadAllowFiles(conversationId: string): Promise<AllowFiles> {
  const conversation = await getConversation(conversationId);
  // No worktree means no guard runs there, so no bypass can be in effect.
  if (!conversation?.worktreePath) return { allowFiles: [] };
  const worktreePath = conversation.worktreePath;
  const present = await Promise.all(
    BYPASS_TOKENS.map(async (name) =>
      (await Bun.file(join(worktreePath, name)).exists()) ? name : null,
    ),
  );
  return { allowFiles: present.filter((name) => name !== null) };
}

async function watchAllowFiles(
  conversationId: string,
  notify: () => void,
): Promise<FileWatcher | null> {
  const conversation = await getConversation(conversationId);
  const worktreePath = conversation?.worktreePath;
  if (!worktreePath) return null;
  const watcher = await createFileWatcher({
    dirs: [worktreePath],
    ignore: IGNORE,
    name: "allow-files",
    onChange: (events) => {
      const touched = events.some(
        (e) =>
          dirname(e.path) === worktreePath &&
          BYPASS_TOKENS.includes(basename(e.path)),
      );
      if (touched) notify();
    },
  });
  // A file created between the first load and the watch starting produced no
  // event; one re-read closes that gap.
  notify();
  return watcher;
}

export const allowFilesServed = serveValue(allowFiles, {
  source: "external",
  loader: ({ id }) => loadAllowFiles(id),
  // One watcher per watched conversation, for as long as it has a subscriber.
  // The start stays SYNC: an async start is awaited on the subscribe path, so
  // it would hold the sub-ack behind the watch opening on the worktree root.
  // The watcher is instead held as a promise (`createFileWatcher` is async), and
  // the stop chains on it — the last subscriber can leave before it resolves.
  whileSubscribed: ({ id }, notify) => {
    const watcher = watchAllowFiles(id, notify);
    return () => {
      void runTracked("allow-files:unwatch", async () => {
        const w = await watcher;
        await w?.stop();
      });
    };
  },
});
