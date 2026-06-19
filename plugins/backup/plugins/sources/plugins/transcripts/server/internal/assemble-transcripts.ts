import { cp, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import { listActiveConversations } from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "@plugins/conversations/plugins/transcript-watcher/server";
import type { BackupSourceReport } from "@plugins/backup/core";
import { transcriptsSourceConfig } from "../../shared/config";

export async function assembleTranscripts(
  dir: string,
): Promise<BackupSourceReport> {
  const { enabled } = getConfig(transcriptsSourceConfig);

  if (!enabled) {
    return { id: "transcripts", name: "Transcripts", skipped: true, items: [], sizeBytes: 0 };
  }

  let count = 0;
  let sizeBytes = 0;
  for (const conv of await listActiveConversations()) {
    if (!conv.claudeSessionId) continue;
    const path = await findTranscriptPath(conv.claudeSessionId);
    if (!path) continue;
    const dest = join(dir, basename(path));
    await cp(path, dest);
    sizeBytes += (await stat(dest)).size;
    count++;
  }

  return {
    id: "transcripts",
    name: "Transcripts",
    skipped: false,
    items: [{ label: "transcripts", detail: `${count} conversations`, count }],
    sizeBytes,
  };
}
