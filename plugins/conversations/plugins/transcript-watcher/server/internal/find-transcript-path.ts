import { CLAUDE_PROJECTS_DIR as PROJECTS_DIR } from "@plugins/infra/plugins/paths/server";

// Cache positive matches only. Sessions are stable once found; negative
// lookups happen before Claude has written anything and should retry.
const pathCache = new Map<string, string>();

export async function findTranscriptPath(
  sessionId: string,
): Promise<string | null> {
  const cached = pathCache.get(sessionId);
  if (cached) return cached;
  const glob = new Bun.Glob(`*/${sessionId}.jsonl`);
  for await (const rel of glob.scan({ cwd: PROJECTS_DIR, onlyFiles: true })) {
    const full = `${PROJECTS_DIR}/${rel}`;
    pathCache.set(sessionId, full);
    return full;
  }
  return null;
}
