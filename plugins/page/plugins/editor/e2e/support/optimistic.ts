/**
 * Waiting for an optimistic gesture to land, without racing it.
 *
 * ## An optimistic gesture lands in TWO moments, not one
 *
 * A new block's ROW comes from the structural overlay — it is in the commit that
 * applies the `BlockOp`, carrying real `data.text` copied straight off the
 * clipboard forest. But its TEXT is not in that commit: `LexicalComposer` mounts
 * with `editorState: null` and `shouldBootstrap={false}`, so its first commit is
 * an EMPTY root, and that is the commit that paints. The seed is applied by
 * `LiveStateYjsProvider.connect()` → `preApplySeed()` — fully synchronous, no
 * server — but `connect()` runs from `CollaborationPlugin`'s passive
 * `useEffect`, which React flushes only after the mounting commit has painted.
 *
 * So the gap is a React commit → passive-effect boundary, not a network gate.
 * Usually sub-frame, but React may defer passive effects, so it has no upper
 * bound worth betting an assertion on.
 *
 * ## Which is why the wait's predicate must BE the assertion
 *
 * Nothing in the DOM distinguishes "row mounted, text not yet hydrated" from
 * "hydrated and genuinely empty": `data-lexical-editor` is stamped either way,
 * there is no `aria-busy`/`data-hydrating`, and the block placeholder is gated
 * on the optimistic row's `data.text` (non-empty from the first render), so it
 * answers a content question rather than a hydration one. There is no readiness
 * signal to wait on — the content itself is the only observable.
 *
 * `paste-optimistic-verify` polled for the ROW and then read the TEXT in a
 * second observation, and failed 2 runs in 4 with `["","",""]` — the gap between
 * the two reads. So this polls until the document EQUALS what the gesture should
 * have produced, and reports when each milestone landed. A caller then asserts
 * on the very observation the wait proved, with no second read to race.
 *
 * On timeout the last observation comes back rather than a throw: the caller's
 * `r.eq` then prints a real got/want diff, which is what makes a genuine
 * regression diagnosable instead of "it timed out".
 */
import type { Page } from "playwright";

export interface DocumentMilestones {
  /**
   * ms from the gesture to the first read with more rows than `grewBeyond`, or
   * -1 if that never happened (or `grewBeyond` was not asked for).
   */
  rowsAt: number;
  /** ms from the gesture to the first read equal to `expected`; -1 if never. */
  textAt: number;
  /** The last observation — equal to `expected` unless the deadline elapsed. */
  last: string[];
}

export interface AwaitDocumentOptions {
  /** The document the gesture should produce. Derive it from the fixture. */
  expected: string[];
  /** Ceiling on the whole wait. Both milestones must land inside it. */
  timeoutMs: number;
  /**
   * Row count before the gesture, enabling the STRUCTURAL milestone: `rowsAt` is
   * the first read exceeding it. Omit when only the settled document matters.
   */
  grewBeyond?: number;
  /**
   * When the gesture happened, so both milestones are measured from the
   * keystroke rather than from this call. Defaults to now.
   */
  startedAt?: number;
  pollMs?: number;
}

/** Poll `read` until it equals `expected`, timing both milestones on the way. */
export async function awaitDocument(
  page: Page,
  read: () => Promise<string[]>,
  opts: AwaitDocumentOptions,
): Promise<DocumentMilestones> {
  const {
    expected,
    timeoutMs,
    grewBeyond,
    startedAt = Date.now(),
    pollMs = 20,
  } = opts;
  const want = JSON.stringify(expected);

  let rowsAt = -1;
  let textAt = -1;
  let last: string[] = [];

  for (;;) {
    last = await read();
    if (rowsAt < 0 && grewBeyond !== undefined && last.length > grewBeyond) {
      rowsAt = Date.now() - startedAt;
    }
    // Checked BEFORE the deadline, so a read that lands exactly on the ceiling
    // still counts as having landed.
    if (JSON.stringify(last) === want) {
      textAt = Date.now() - startedAt;
      break;
    }
    if (Date.now() - startedAt >= timeoutMs) break;
    await page.waitForTimeout(pollMs);
  }

  return { rowsAt, textAt, last };
}
