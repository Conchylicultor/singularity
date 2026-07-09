import {
  activeLineUuids,
  isInterruptContent,
} from "@plugins/conversations/plugins/transcript-watcher/core";
import { readChainLines } from "@plugins/conversations/plugins/transcript-watcher/server";

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

/**
 * Pop the most recent *live* user prompt out of the transcript so a stopped
 * turn can restore it to the prompt editor. Returns the text (and truncates the
 * file from that turn onward) or null when there is nothing to rewind.
 *
 * The prompt is rarely the literal last line: Claude Code appends
 * non-conversation lines (`file-history-snapshot` / `system` / `ai-title` / …)
 * and an interrupt sentinel (`[Request interrupted by user]`) after it. So scan
 * backwards over the live conversation — ignoring abandoned rewind branches via
 * the active-path set — skipping that trailing noise. Stop without rewinding at
 * an assistant turn or a tool result: a prompt the agent has already begun
 * answering must not be popped back.
 */
export async function rewindLastUserTurn(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const raw = await file.text();
  const lines = raw.split("\n");

  // Parse every non-blank line, keeping its file-line index for truncation.
  const parsed: { index: number; obj: Record<string, unknown> }[] = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      parsed.push({ index, obj: JSON.parse(line) as Record<string, unknown> });
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
    }
  });

  const active = activeLineUuids(parsed.map((p) => p.obj));

  for (let i = parsed.length - 1; i >= 0; i--) {
    const { index, obj } = parsed[i]!;
    const uuid = typeof obj.uuid === "string" ? obj.uuid : null;
    if (uuid && !active.has(uuid)) continue; // abandoned rewind branch

    if (obj.type === "assistant") return null; // agent already responding
    if (obj.type !== "user") continue; // file-history-snapshot / system / ai-title / …

    const msg = obj.message as { role?: string; content?: unknown } | undefined;
    if (msg?.role !== "user" || typeof msg.content !== "string" || !msg.content) {
      // Array content = tool result → the agent is mid-turn; nothing to pop.
      if (Array.isArray(msg?.content)) return null;
      continue;
    }
    if (isInterruptContent(msg.content)) continue; // "[Request interrupted by user]"

    // Drop this user turn and any trailing metadata, then hand the text back.
    await Bun.write(path, lines.slice(0, index).join("\n") + "\n");
    return msg.content;
  }
  return null;
}

export function readTurns(path: string, sinceIso?: string): Promise<Turn[]> {
  return readTurnsFromChain([path], sinceIso);
}

/**
 * Read the turns of a conversation spread over a chain of session files.
 *
 * `readChainLines` concatenates the chain in order and drops duplicate uuids
 * (a forked session copies its ancestor's lines verbatim), then `activeLineUuids`
 * keeps only each root tree's live leaf→root path. Both passes are required over
 * a chain: without the branch filter, a fork's copied spine renders twice.
 * `sinceIso` stays a post-parse filter — it must not narrow the forest the
 * branch filter reasons over.
 */
export async function readTurnsFromChain(
  paths: string[],
  sinceIso?: string,
): Promise<Turn[]> {
  const lines = await readChainLines(paths);
  const active = activeLineUuids(lines);

  const turns: Turn[] = [];
  const assistantByMsgId = new Map<string, Turn>();

  for (const obj of lines) {
    const uuid = typeof obj.uuid === "string" ? obj.uuid : null;
    if (uuid && !active.has(uuid)) continue; // abandoned rewind branch
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
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; JSON array may contain null/undefined elements
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
