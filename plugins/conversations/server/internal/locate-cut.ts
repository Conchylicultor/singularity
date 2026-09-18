import { basename } from "node:path";
import { resolveConversationTranscriptPaths } from "@plugins/conversations/plugins/transcript-watcher/server";
import type { CutRefusal } from "../../core/rewind";
import { cutTranscriptAt, type CutResult } from "./transcript-cut";

type CutOk = Extract<CutResult, { ok: true }>;

/**
 * - `no-transcript` — the conversation has no session file on disk (never
 *   started, or Claude Code aged the file out).
 * - the rest are {@link CutRefusal}.
 */
export type LocateCutRefusal = CutRefusal | "no-transcript";

export type LocatedCut =
  | {
      ok: true;
      /** The session file that holds the chosen message. */
      path: string;
      /** That file's Claude session id (its basename). */
      sessionId: string;
      /**
       * Is it the conversation's live tail — the file `claude --resume` reads?
       * False only after an earlier fork, when the message lives in an ancestor
       * file: that one can be copied from, never rewound in place.
       */
      isTail: boolean;
      cut: CutOk;
    }
  | { ok: false; reason: LocateCutRefusal };

/**
 * Find the chosen user message in the conversation's session files and compute
 * the cut there. READS ONLY — this is the validation both "Rewind to here" and
 * "Fork from here" run before touching anything, and what the preview shows.
 *
 * Newest file first: a forked session copies its ancestor's lines verbatim, so
 * the same uuid can sit in several files, and the live tail is the one that
 * carries the conversation forward.
 */
export async function locateTranscriptCut(
  conversationId: string,
  userMessageUuid: string,
): Promise<LocatedCut> {
  const paths = await resolveConversationTranscriptPaths(conversationId);
  if (paths.length === 0) return { ok: false, reason: "no-transcript" };

  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i]!;
    const cut = cutTranscriptAt(
      (await Bun.file(path).text()).split("\n"),
      userMessageUuid,
    );
    if (cut.ok) {
      return {
        ok: true,
        path,
        sessionId: basename(path, ".jsonl"),
        isTail: i === paths.length - 1,
        cut,
      };
    }
    if (cut.reason !== "not-found") return cut;
  }
  return { ok: false, reason: "not-found" };
}
