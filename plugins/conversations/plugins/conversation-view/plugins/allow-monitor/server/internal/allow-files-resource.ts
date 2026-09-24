import { basename, dirname, join } from "path";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { BYPASS_TOKENS } from "@plugins/framework/plugins/tooling/plugins/guards/core";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import {
  allowFilesResource,
  AllowFilesSchema,
  type AllowFiles,
} from "../../shared";

type Params = { id: string };

// Subtrees whose churn can never be a bypass file (those sit at the worktree
// root), kept out of the watch so a build or install does not wake it.
const IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
];

// One watcher per watched conversation, opened on the first subscriber and
// stopped on the last. Held as a promise: `createFileWatcher` is async, and the
// last subscriber can leave before it resolves.
const watchers = new Map<string, Promise<FileWatcher | null>>();

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
      if (touched) allowFilesLiveResource.notify({ id: conversationId });
    },
  });
  // A file created between the first load and the watch starting produced no
  // event; one re-read closes that gap.
  allowFilesLiveResource.notify({ id: conversationId });
  return watcher;
}

export const allowFilesLiveResource = defineExternalResource({
  key: allowFilesResource.key,
  mode: "push",
  schema: AllowFilesSchema,
  loader: ({ id }: Params) => loadAllowFiles(id),
  onFirstSubscribe({ id }: Params) {
    if (!watchers.has(id)) watchers.set(id, watchAllowFiles(id));
  },
  onLastUnsubscribe({ id }: Params) {
    const watcher = watchers.get(id);
    watchers.delete(id);
    void watcher?.then((w) => w?.stop());
  },
});
