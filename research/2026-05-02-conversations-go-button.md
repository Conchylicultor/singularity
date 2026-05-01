# Go Button for Conversation View

## Context

The conversation view has a "Push & Exit" button whose mode adapts to the current state of edited files in the worktree. The current modes are `push-and-exit`, `exit`, and `drop-and-exit`. When files have been edited, the button defaults to `push-and-exit`. The goal is to intercept the case where the agent has only written files under `research/` (the design/planning phase) and surface a dedicated "Go" action that sends the literal text "Go" as a new turn — signaling the model to proceed to implementation.

## Goal

Add a `"go"` mode to the push-and-exit button. When all edited files are under `research/`, replace the push button with a green "Go" button that POSTs a new turn to the conversation rather than pushing a commit.

## Implementation

**Single file to change:**
`plugins/conversations/plugins/conversation-view/plugins/push-and-exit/web/components/push-and-exit-button.tsx`

### 1. Extend the `Mode` type

```ts
type Mode = "push-and-exit" | "exit" | "drop-and-exit" | "go";
```

### 2. Update mode detection logic

Replace:
```ts
if (files.length > 0) return "push-and-exit";
```

With:
```ts
if (files.length > 0) {
  if (files.every((f) => f.path.startsWith("research/"))) return "go";
  return "push-and-exit";
}
```

- Any file outside `research/` → `"push-and-exit"` (existing behavior)
- All files inside `research/` → `"go"` (new behavior)
- No files → falls through to existing `"exit"` / `"drop-and-exit"` logic

### 3. Add "go" to button rendering

Add `Play` to the lucide-react import, then handle `"go"` in the `label`, `Icon`, and `buttonClass` derivations:

```ts
const label =
  mode === "go"
    ? "Go"
    : mode === "push-and-exit"
      ? busy ? "Pushing…" : "Push & Exit"
      : mode === "exit"
        ? "Exit"
        : "Drop & Exit";

const Icon =
  mode === "go"
    ? Play
    : mode === "push-and-exit"
      ? MdRocketLaunch
      : mode === "exit"
        ? LogOut
        : MdDeleteForever;

const buttonClass =
  mode === "go"
    ? "gap-1.5 bg-[oklch(0.44_0.13_145)] hover:bg-[oklch(0.50_0.13_145)] text-white"
    : "gap-1.5 bg-[oklch(0.44_0.09_240)] hover:bg-[oklch(0.5_0.09_240)] text-white";
```

The OKLCH green is visually distinct from the blue push button.

### 4. Add "go" to the onClick handler

Inside `onClick`, after the `else` (drop-and-exit) block, add a `"go"` branch before the existing logic (or restructure the if/else chain):

```ts
} else if (mode === "go") {
  try {
    const res = await fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Go" }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    Shell.Toast({
      description: `Go failed: ${err instanceof Error ? err.message : String(err)}`,
      variant: "error",
    });
  }
}
```

No dialog, sheet, or flag flow needed — this is a fire-and-forget turn submission.

### 5. No other changes required

- No new files
- No server-side changes
- No plugin manifest changes
- No new API routes (the `/turn` endpoint already exists)

## Verification

1. **Go mode appears**: modify only a file under `research/` in a worktree conversation → button shows "Go" in green with Play icon.
2. **Existing modes unaffected**:
   - Any file outside `research/` modified → "Push & Exit" (blue).
   - No modified files + prior push → "Exit".
   - No modified files, no push → "Drop & Exit".
3. **Click behavior**: clicking "Go" POSTs `{ text: "Go" }` to `/api/conversations/:id/turn`; the conversation receives the turn and the model starts responding.
4. **Disabled state**: unchanged — disabled when `busy`, `gone`, or `starting`.
