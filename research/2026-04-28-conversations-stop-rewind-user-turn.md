# Stop → Rewind Last User Turn

## Context

When a user sends a message and immediately clicks Stop (before Claude has replied), the conversation lands in a frustrating state: the user turn is committed to the JSONL transcript but unanswered. The UX expectation is "undo send": the turn disappears from the viewer and its text is restored to the prompt box so the user can edit and resend.

**Trigger condition**: The JSONL transcript's final substantive line is a `type === "user"` entry with plain string `content` (i.e., the user typed text and sent it), and no `type === "assistant"` line appears after it.

**Not rewound**: tool-result turns (array `content` with `tool_result` blocks); any stop where Claude had already started responding (last line is assistant).

---

## Implementation

### 1. Add `rewindLastUserTurn(path)` to `claude-transcript.ts`

**File**: `plugins/conversations/server/internal/claude-transcript.ts`

Add after `readTurns`:

```ts
export async function rewindLastUserTurn(path: string): Promise<string | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const raw = await file.text();
  const lines = raw.split("\n");

  // Find the last non-empty line
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx].trim()) lastIdx--;
  if (lastIdx < 0) return null;

  let obj: Record<string, unknown>;
  try { obj = JSON.parse(lines[lastIdx]); } catch { return null; }

  const msg = obj.message as { role?: string; content?: unknown } | undefined;

  // Only rewind pure-text user turns (string content, no tool_result)
  if (
    obj.type !== "user" ||
    msg?.role !== "user" ||
    typeof msg.content !== "string" ||
    !msg.content
  ) {
    return null;
  }

  const text = msg.content;

  // Remove the last non-empty line and write back
  const kept = lines.slice(0, lastIdx);
  // Preserve trailing newline convention
  await Bun.write(path, kept.join("\n") + "\n");

  return text;
}
```

**Key design choices**:
- Matches `readTurns`'s conservative stance: only `typeof content === "string"` is a user-typed turn; array content (tool results, attachments) is not rewindable.
- Only checks the *last* non-empty line. If that line is a user turn, by definition no assistant turn follows it — no need to scan the whole file.
- Atomic from Claude's perspective: the interrupt (Escape) was already sent. If Claude had written any assistant line, it becomes the last line, and the function returns `null` safely.

---

### 2. Add `rewindConversationTurn(id)` to `runtime.ts`

**File**: `plugins/conversations/server/internal/runtime.ts`

Add import of `rewindLastUserTurn` alongside the existing `findTranscriptPath` import, then add the function following the exact pattern of `readConversationTurns`:

```ts
import { findTranscriptPath, readTurns, rewindLastUserTurn, type Turn } from "./claude-transcript";

export async function rewindConversationTurn(id: string): Promise<string | null> {
  const claudeSessionId = await getConversationClaudeSessionId(id);
  if (!claudeSessionId) return null;
  const path = await findTranscriptPath(claudeSessionId);
  if (!path) return null;
  return rewindLastUserTurn(path);
}
```

---

### 3. Modify `handle-stop.ts` to call rewind

**File**: `plugins/conversations/server/internal/handle-stop.ts`

```ts
import { interruptConversation, rewindConversationTurn } from "./runtime";

export async function handleStop(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  try {
    await interruptConversation(id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("not found")) {
      return new Response("Not found", { status: 404 });
    }
    throw err;
  }

  const rewindText = await rewindConversationTurn(id);
  return Response.json({ ok: true, rewindText: rewindText ?? null });
}
```

---

### 4. Consume `rewindText` in `prompt-input.tsx`

**File**: `plugins/conversations/plugins/conversation-view/plugins/prompt-input/web/components/prompt-input.tsx`

In the `stop()` function, parse the response and pre-fill draft if rewind occurred:

```ts
async function stop() {
  if (!working || stopping) return;
  setStopping(true);
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/stop`,
      { method: "POST" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { ok: boolean; rewindText: string | null };
    if (data.rewindText) setDraft(data.rewindText);
  } catch (err) {
    Shell.Toast({
      description: `Failed to stop: ${err instanceof Error ? err.message : String(err)}`,
      variant: "error",
    });
  } finally {
    setStopping(false);
  }
}
```

`setDraft` is already in scope from `usePromptDraft(conversation.id)`. No new imports needed.

---

## Timing

```
User clicks Stop
  → POST /api/conversations/:id/stop
  → server: interruptConversation()  — sends Escape to tmux pane
  → server: rewindConversationTurn() — reads JSONL last line
      if last line = user turn with string content → remove it, return text
      otherwise → return null
  → Response: { ok: true, rewindText: "..." | null }
  → client: if rewindText → setDraft(rewindText) — textarea pre-filled

~0–500ms later:
  watchJsonl poller detects JSONL mtime change
  → readJsonlEvents re-parses (removed line is gone)
  → jsonlEventsResource.notify() → JSONL viewer removes the user turn row

~0–1000ms later:
  poller detects tmux pane title no longer has spinner
  → DB status: working → waiting
  → recentConversationsResource.notify() → stop button unmounts
```

No explicit cache invalidation needed. The `watchJsonl` 500ms mtime poller handles JSONL viewer refresh automatically.

---

## Files Modified

| File | Change |
|---|---|
| `plugins/conversations/server/internal/claude-transcript.ts` | Add `rewindLastUserTurn(path)` |
| `plugins/conversations/server/internal/runtime.ts` | Add import + `rewindConversationTurn(id)` |
| `plugins/conversations/server/internal/handle-stop.ts` | Call rewind, return `rewindText` |
| `plugins/conversations/plugins/conversation-view/plugins/prompt-input/web/components/prompt-input.tsx` | Parse response, call `setDraft` if rewindText |

No new files. No schema changes. No new API endpoints.

---

## Verification

1. **Happy path**: Send a message, immediately click Stop before Claude replies → user turn disappears from JSONL viewer within ~500ms; textarea is pre-filled with the sent text.
2. **No rewind**: Send a message, wait for Claude to start typing, then click Stop → no rewind (viewer shows partial assistant response; textarea stays empty).
3. **Tool loop**: Let Claude reach a tool-use cycle, stop mid-tool → no rewind (last line is an assistant tool_use or the user turn has array content).
4. **No session yet**: Stop a conversation that hasn't started transcribing → `rewindText: null`, textarea unchanged.
