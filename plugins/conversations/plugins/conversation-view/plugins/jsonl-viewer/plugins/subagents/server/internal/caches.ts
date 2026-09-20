import { createSignedMemo } from "@plugins/infra/plugins/git/plugins/git-read-cache/server";
import { transcriptChainSignature } from "@plugins/conversations/plugins/transcript-watcher/server";
import type { SubagentActivityRow, SubagentTranscript } from "../../core";
import {
  evictActivityScan,
  resolveActivityTargets,
  scanActivity,
} from "./activity-scan";
import { transcriptPaths, readSubagentTranscript } from "./transcript-read";
import { evictAgentCallNames } from "./agent-calls";

// Both memos bind their signature and their compute at construction, exactly as
// `jsonl-events-cache.ts` does. A resource's `revalidate` and its `loader` are
// then provably the same function of the same inputs — not two probes agreeing
// by convention, which is how `edited-files` once certified a stale value with a
// fresh ETag. There is nothing to pass, so there is nothing to drift.
//
// The signature is `transcriptChainSignature` over the files the value is read
// from — a list length plus a per-file `(lstat mtime, size)` triple. It is a
// faithful function of every input the compute reads: an append moves a triple,
// a NEW sub-agent moves the length, a `.meta.json` landing after its transcript
// adds a triple. Routing through that one bound signature (never `lstat` by
// hand, never `Bun.file().lastModified`, which is integer-ms where `lstat` is a
// sub-ms float) is what makes the watcher's primed signature and the resource's
// probe byte-identical strings, so a prime is a real hit rather than a silent
// miss that degrades every push into a full re-read.

const activityMemo = createSignedMemo<SubagentActivityRow[]>({
  name: "subagent-activity",
  signature: async (conversationId) =>
    transcriptChainSignature(
      (await resolveActivityTargets(conversationId)).paths,
    ),
  compute: (conversationId) => scanActivity(conversationId),
});

export const subagentActivityMemo = activityMemo;

export function primeSubagentActivity(
  conversationId: string,
  signature: string,
  rows: SubagentActivityRow[],
): void {
  activityMemo.prime(conversationId, signature, rows);
}

export function evictSubagentActivity(conversationId: string): void {
  activityMemo.evict(conversationId);
  evictActivityScan(conversationId);
}

// A signed memo is keyed by ONE string, and this resource is keyed by a pair.
// NUL cannot occur in a conversation uuid or in a Claude tool-use id, so it is
// the one separator that cannot collide with either half.
const SEP = "\u0000";

export function transcriptMemoKey(
  conversationId: string,
  toolUseId: string,
): string {
  return `${conversationId}${SEP}${toolUseId}`;
}

function parseMemoKey(key: string): {
  conversationId: string;
  toolUseId: string;
} {
  const at = key.indexOf(SEP);
  if (at < 0)
    throw new Error(`[subagents] malformed transcript memo key: ${key}`);
  return { conversationId: key.slice(0, at), toolUseId: key.slice(at + 1) };
}

const transcriptMemo = createSignedMemo<SubagentTranscript>({
  name: "subagent-transcript",
  signature: async (key) => {
    const { conversationId, toolUseId } = parseMemoKey(key);
    return transcriptChainSignature(
      await transcriptPaths(conversationId, toolUseId),
    );
  },
  compute: (key) => {
    const { conversationId, toolUseId } = parseMemoKey(key);
    return readSubagentTranscript(conversationId, toolUseId);
  },
});

export const subagentTranscriptMemo = transcriptMemo;

export function primeSubagentTranscript(
  key: string,
  signature: string,
  value: SubagentTranscript,
): void {
  transcriptMemo.prime(key, signature, value);
}

export function evictSubagentTranscript(key: string): void {
  transcriptMemo.evict(key);
}

/**
 * Drop the parent-chain `Agent`-call name index. Keyed by conversation, not by
 * the transcript memo's (conversation, tool-use id) pair, so it is evicted with
 * the activity subscription rather than with any one pane.
 */
export function evictConversationJoin(conversationId: string): void {
  evictAgentCallNames(conversationId);
}
