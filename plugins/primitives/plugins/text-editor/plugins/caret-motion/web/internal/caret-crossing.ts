/**
 * The caret-crossing channel.
 *
 * > Every mover that relocates a caret ACROSS something announces the crossing
 * > on this channel, in the direction of travel. Every consumer of a
 * > synthesized caret position observes it. A crossing is DECLARED by the mover
 * > that knows it happened — never inferred from a selection transition.
 *
 * The "never inferred" half is the load-bearing one. A transition-derived rule
 * ("did the anchor move past a boundary") cannot tell a one-character click
 * from a one-character arrow step, and both a merge landing and a programmatic
 * placement look like a unit step too. Only the mover knows.
 *
 * The matrix this collapses: without a channel, every way a caret can ARRIVE
 * somewhere needs its own patch in every consumer that cares — `movers × kinds`,
 * found one at a time. With one, adding a mover is one call and adding a
 * consumer is one listener.
 *
 * WHY A LEXICAL COMMAND rather than a hand-rolled registry. Lexical's
 * `triggerCommandListeners` wraps each priority bucket in `updateEditorSync`,
 * which runs the callback INLINE when `activeEditor === editor`. So an
 * announcement made from inside a command listener (an arrow-key handler)
 * reaches the observer synchronously WITHIN THE SAME UPDATE, seeing the pending
 * selection the crossing just produced — exactly what an observer that has to
 * read the live anchor needs, and what it would otherwise have to open
 * its own `editor.update()` to get. A command also gives per-editor scope,
 * automatic teardown with the editor, and an open consumer set for free.
 */
import {
  createCommand,
  type LexicalCommand,
  type LexicalEditor,
} from "lexical";

/**
 * A caret that has just been relocated ACROSS something, in the direction of
 * travel.
 *
 * THE PAYLOAD CARRIES DIRECTION AND NOTHING ELSE. Do not add a
 * `cause: "decorator" | "block"` (or any other discriminator of which mover
 * announced): an observer branching on which contributor crossed would be the
 * abstraction leaking — the collection owns the generic interface and each
 * contributor owns its internals (root `CLAUDE.md`, collection-consumer
 * separation). An observer that genuinely needs to know where it landed reads
 * the live selection, which is the same answer for every mover.
 */
export interface CaretCrossing {
  direction: "left" | "right";
}

/**
 * Consumers observe.
 *
 * Listeners are expected to return `false` so EVERY observer runs — this is a
 * broadcast, not a claim on the keystroke. The mover already consumed (or
 * declined) the key before announcing.
 */
export const CARET_CROSSED_COMMAND: LexicalCommand<CaretCrossing> =
  createCommand("CARET_CROSSED_COMMAND");

/**
 * Producers announce.
 *
 * Prefer {@link crossCaret}, which makes "moved the caret without announcing"
 * visibly wrong at the call site. This bare form exists for the one producer
 * whose move is not a callback — the page editor's cross-block landing, which
 * happens inside a `CaretSurface` that deliberately does not expose its Lexical
 * editor, so the declaration has to cross the surface boundary as data and be
 * announced on the far side.
 *
 * > **A BARE ANNOUNCE IS CORRECT ONLY WHERE THE MOVE HAS ALREADY BEEN APPLIED
 * > TO THE EDITOR STATE.** Every observer reads the live selection, so an
 * > announcement that precedes its own move describes a caret that has not
 * > moved yet.
 *
 * The trap is that "place, then announce" written in that order does not
 * execute in that order inside an active update — which every command listener
 * is. Lexical treats the two halves asymmetrically:
 *
 * - a nested `editor.update(...)` is **QUEUED** behind the listener
 *   (`updateEditor`, lexical@0.44.0 `Lexical.dev.mjs:9143`: `if
 *   (editor._updating) editor._updates.push(...)`), and so is any helper built
 *   on one;
 * - `dispatchCommand` runs its listeners **INLINE** (`updateEditorSync`,
 *   `:9136`, reached from `triggerCommandListeners` at `:8909`: it calls
 *   `updateFn()` straight through when `activeEditor === editor` and no options
 *   are passed).
 *
 * So a placement issued through `editor.update()` and announced on the next
 * line announces FIRST, and every observer sees the pre-move selection.
 * {@link crossCaret} cannot express that order; use it unless the move
 * genuinely is not a callback.
 */
export function announceCaretCrossing(
  editor: LexicalEditor,
  direction: "left" | "right",
): void {
  editor.dispatchCommand(CARET_CROSSED_COMMAND, { direction });
}

/**
 * The sanctioned producer form: perform the move and announce it as ONE act,
 * so a mover cannot forget the half that makes the crossing observable.
 *
 * MUST BE CALLED FROM INSIDE A LEXICAL UPDATE — a command listener already is.
 * There is deliberately no defensive `editor.update()` wrapper and nothing is
 * caught: Lexical throws loudly if `move()` touches the selection outside an
 * update, and that is the behaviour we want. Wrapping would also break the
 * synchronous-within-the-same-update property described in the module header,
 * by deferring the announcement past the caller's own commit.
 *
 * This is also the only ORDER-SAFE form, which is the other half of the rule on
 * {@link announceCaretCrossing}: `move()` runs synchronously here, so the
 * placement is already in the pending state when the dispatch below takes
 * `updateEditorSync`'s inline branch and every observer reads the POST-move
 * selection. A mover holding the two halves apart has to get that ordering
 * right against a queued-vs-inline asymmetry that is invisible at the call
 * site; this one cannot get it wrong.
 */
export function crossCaret(
  editor: LexicalEditor,
  direction: "left" | "right",
  move: () => void,
): void {
  move();
  announceCaretCrossing(editor, direction);
}
