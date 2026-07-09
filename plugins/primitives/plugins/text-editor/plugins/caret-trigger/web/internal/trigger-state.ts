// The pure derivation at the heart of the primitive. Open-state is NOT a latch
// mutated across branches — it is `reduceTriggerState(prev, findTrigger(...))`
// folded on every editor update, and the `open` boolean is DERIVED from the
// resulting `MenuState`. There is exactly one place `dismissedId` is cleared
// (the null transition below), so no code path can forget to reset it.

/** A live trigger match. Identity (`triggerId`) EXCLUDES `query` on purpose. */
export type Trigger = { nodeKey: string; triggerIndex: number; query: string };

/**
 * Dismissal identity. Excludes `query` so typing after Esc stays dismissed.
 * `nodeKey:triggerIndex` can be invalidated by Lexical (a mark splits text
 * nodes; inserting before the trigger shifts the index) — that is SAFE by
 * construction: every mistake makes `dismissedId !== triggerId(trigger)`, i.e.
 * the menu re-opens (recoverable), and can never wedge it closed.
 */
export const triggerId = (t: Trigger) => `${t.nodeKey}:${t.triggerIndex}`;

export type MenuState = { trigger: Trigger | null; dismissedId: string | null };

export function reduceTriggerState(prev: MenuState, t: Trigger | null): MenuState {
  if (!t) {
    // THE single place dismissedId is ever cleared. No branch can forget.
    return prev.trigger === null && prev.dismissedId === null
      ? prev
      : { trigger: null, dismissedId: null };
  }
  const same =
    prev.trigger !== null &&
    triggerId(prev.trigger) === triggerId(t) &&
    prev.trigger.query === t.query;
  return same ? prev : { trigger: t, dismissedId: prev.dismissedId };
}

/**
 * The trigger/dismissed slice of the `open` derivation (the part owned by pure
 * state). The hook ANDs this with `focused && isCaretOwner`.
 */
export function isOpen(state: MenuState): boolean {
  return state.trigger !== null && state.dismissedId !== triggerId(state.trigger);
}

/**
 * A word-boundary `canOpen`: the trigger must sit at the start of the node or
 * immediately after whitespace (so `/` inside URLs/paths/fractions and `@`
 * inside emails don't open the menu). Hardcodes `triggerIndex === 0 ⇒ true` —
 * a naive `/\s/.test(text[idx-1])` evaluates `undefined` → `"undefined"` →
 * `false`, which would wedge `/` and `@` at the very start of a block.
 */
export function atWordBoundary(ctx: { triggerIndex: number; textBeforeCaret: string }): boolean {
  return ctx.triggerIndex === 0 || /\s/.test(ctx.textBeforeCaret[ctx.triggerIndex - 1]!);
}
