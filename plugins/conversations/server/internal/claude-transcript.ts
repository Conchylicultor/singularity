import { homedir } from "node:os";

const PROJECTS_DIR = `${homedir()}/.claude/projects`;

export type TurnRole = "user" | "assistant";

export interface Turn {
  /** ISO timestamp of the first JSONL event that contributed to this turn. */
  at: string;
  role: TurnRole;
  /** Concatenated text content. Empty string if the turn had no text blocks. */
  text: string;
  /** Present on assistant turns only; propagated from the last event in the turn. */
  stopReason?: string;
  /** Assistant-only message id; equal-id events are merged into one turn. */
  messageId?: string;
}

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

export async function readTurns(
  path: string,
  sinceIso?: string,
): Promise<Turn[]> {
  const file = Bun.file(path);
  if (!(await file.exists())) return [];
  const raw = await file.text();

  const turns: Turn[] = [];
  const assistantByMsgId = new Map<string, Turn>();

  for (const line of raw.split("\n")) {
    if (!line) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = typeof obj.timestamp === "string" ? obj.timestamp : null;
    if (!ts) continue;
    if (sinceIso && ts < sinceIso) continue;

    const msg = obj.message as
      | {
          role?: string;
          content?: unknown;
          id?: string;
          stop_reason?: string;
        }
      | undefined;

    if (obj.type === "user" && msg?.role === "user") {
      // User turns have string content; tool_result arrays are skipped.
      if (typeof msg.content === "string" && msg.content.length > 0) {
        turns.push({ at: ts, role: "user", text: msg.content });
      }
      continue;
    }

    if (obj.type === "assistant" && msg?.role === "assistant") {
      const texts: string[] = [];
      if (Array.isArray(msg.content)) {
        for (const c of msg.content as Array<{ type?: string; text?: string }>) {
          if (c?.type === "text" && typeof c.text === "string") {
            texts.push(c.text);
          }
        }
      }
      const added = texts.join("");
      const msgId = msg.id;
      if (msgId) {
        const existing = assistantByMsgId.get(msgId);
        if (existing) {
          existing.text += added;
          if (msg.stop_reason) existing.stopReason = msg.stop_reason;
        } else {
          const turn: Turn = {
            at: ts,
            role: "assistant",
            text: added,
            stopReason: msg.stop_reason,
            messageId: msgId,
          };
          assistantByMsgId.set(msgId, turn);
          turns.push(turn);
        }
      } else if (added) {
        turns.push({
          at: ts,
          role: "assistant",
          text: added,
          stopReason: msg.stop_reason,
        });
      }
    }
  }
  return turns;
}
